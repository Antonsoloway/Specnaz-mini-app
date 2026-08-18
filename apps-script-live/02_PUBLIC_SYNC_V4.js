/* HOTFIX FINAL 2026-08-02: поиск и карточка больше не записываются синхронизацией как статические значения. */
/* HOTFIX FINAL 2026-08-02: Telegram-ссылки восстанавливаются модулем 08 только форматированием, без замены формул и текста. */
/* HOTFIX FINAL 2026-08-02: фото команд синхронизируются по событию изменения и ночным резервным запуском. */
/* HOTFIX 2026-08-09: Списки!J больше не очищается текстовой синхронизацией; сбой копирования фото сохраняет старое изображение. */
/* HOTFIX 2026-08-09: История I получает RichText-ссылку из скрытой P «Ссылка сообщения»; O оставлен legacy-helper. */
/* ========================================================================== */
/* PUBLIC SYNC V6.2 MESSAGE LINKS + PHOTO SAFE. */
/* ПУБЛИЧНАЯ ТАБЛИЦА: ОДНОСТОРОННЯЯ СИНХРОНИЗАЦИЯ v2.2.6                   */
/* ========================================================================== */

const PUBLIC_SYNC_CONFIG = Object.freeze({
  spreadsheetId: '1FKEvF4pDW9dt6MOk4xjtF1fut60hZ5HxpoGN3l93s7M',
  enabledByDefault: true,
  intervalMinutes: 5,
  normalMinIntervalMinutes: 30,
  leaseTtlMs: 12 * 60 * 1000,
  maxDataRow: 999,
  properties: Object.freeze({
    enabled: 'ROYAL_CRM_PUBLIC_SYNC_ENABLED',
    pending: 'ROYAL_CRM_PUBLIC_SYNC_PENDING',
    pendingReason: 'ROYAL_CRM_PUBLIC_SYNC_PENDING_REASON',
    pendingPriority: 'ROYAL_CRM_PUBLIC_SYNC_PENDING_PRIORITY',
    lastHash: 'ROYAL_CRM_PUBLIC_SYNC_LAST_HASH',
    componentHashes: 'ROYAL_CRM_PUBLIC_SYNC_COMPONENT_HASHES_V2',
    rowCounts: 'ROYAL_CRM_PUBLIC_SYNC_ROW_COUNTS_V2',
    lastSuccess: 'ROYAL_CRM_PUBLIC_SYNC_LAST_SUCCESS',
    lastError: 'ROYAL_CRM_PUBLIC_SYNC_LAST_ERROR',
    lastSyncedToken: 'ROYAL_CRM_PUBLIC_SYNC_LAST_SYNCED_TOKEN',
    changeToken: 'ROYAL_CRM_PUBLIC_DATA_CHANGE_TOKEN',
    mutationState: 'ROYAL_CRM_PUBLIC_DATA_MUTATION_STATE',
    mutationReason: 'ROYAL_CRM_PUBLIC_DATA_MUTATION_REASON',
    lastPhotoSuccess: 'ROYAL_CRM_PUBLIC_PHOTO_LAST_SUCCESS'
  }),
  sheets: Object.freeze({
    teams: 'Команды',
    base: 'База участников',
    history: 'История спецназа',
    lists: 'Списки',
    relations: 'Связи участников',
    search: 'Поиск',
    card: 'Карточка команды',
    log: 'Лог синхронизации'
  }),
  allowedPublicSheets: Object.freeze([
    'Главная',
    'Обработанные события',
    'Снимок счётчиков',
    'Команды',
    'База участников',
    'Поиск',
    'Карточка команды',
    'История спецназа',
    'Списки',
    'Связи участников',
    'Лог активности',
    'Поиск данные',
    'Аватары'
  ])
});

const PUBLIC_SYNC_QUEUE_HANDLER = 'processPublicSyncQueue';
const PUBLIC_SYNC_EDIT_HANDLER = 'handlePublicSyncEdit';
const PUBLIC_SYNC_CHANGE_HANDLER = 'handlePublicSyncChange';
const PUBLIC_SYNC_NIGHTLY_MEDIA_HANDLER = 'runNightlyPublicMediaSync';
const PUBLIC_SYNC_LINK_COLOR = '#34A853';

/**
 * Безопасное обновление с 2.0.2 до 2.1.
 * Не перестраивает рабочие листы админской таблицы.
 * Устанавливает триггеры синхронизации и ставит первый запуск в очередь.
 */
function upgradeToRoyalCrmV22() {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    ensurePublicSyncLogSheet_(ss);
    installRoyalCrmTriggers_();
    markPublicSyncPending_('upgrade_2.2');

    PropertiesService.getScriptProperties()
      .setProperty(PROPERTY_STRUCTURE_VERSION, CRM_VERSION);

    return {
      status: 'OK',
      version: CRM_VERSION,
      public_sync: 'QUEUED',
      public_spreadsheet_id: PUBLIC_SYNC_CONFIG.spreadsheetId
    };
  } finally {
    try {
      lock.releaseLock();
    } catch (err) {}
  }
}

function upgradeToRoyalCrmV21() {
  return upgradeToRoyalCrmV22();
}

/** Полная принудительная синхронизация. Используется для первого запуска и ремонта. */
function runPublicSyncNow() {
  return syncPublicWorkbook_(true, 'manual');
}

/**
 * Проверка источника без записи в публичную таблицу.
 * Возвращает ошибки, предупреждения и количество подготовленных строк.
 */
function dryRunPublicSync() {
  const leaseOwner = publicSyncAcquireLease_();
  if (!leaseOwner) {
    const busy = {status: 'BUSY', errors: [], warnings: ['Другая публичная синхронизация уже выполняется.']};
    Logger.log(JSON.stringify(busy, null, 2));
    return busy;
  }

  try {
    const capture = capturePublicSyncSnapshot_(15000, 'dry_run');
    if (capture.status !== 'CAPTURED') {
      const deferred = {
        status: 'DEFERRED_SOURCE_LOCK',
        errors: [],
        warnings: ['Не удалось получить короткое окно чтения основной базы. Повторите проверку через минуту.']
      };
      Logger.log(JSON.stringify(deferred, null, 2));
      return deferred;
    }

    const report = publicSyncReport_(capture.snapshot, 'DRY_RUN');
    report.data_token = capture.snapshot.dataToken;
    report.source_lock_wait_ms = capture.waitedMs;
    report.recovered_stale_mutation = capture.recoveredMutation;
    Logger.log(JSON.stringify(report, null, 2));
    return report;
  } catch (error) {
    const failed = {
      status: 'ERROR',
      errors: [String(error && error.message ? error.message : error)],
      warnings: []
    };
    Logger.log(JSON.stringify(failed, null, 2));
    return failed;
  } finally {
    publicSyncReleaseLease_(leaseOwner);
  }
}

/** Обработчик очереди. Запускается таймером раз в несколько минут. */
function processPublicSyncQueue() {
  if (!isPublicSyncEnabled_()) return {status: 'DISABLED'};

  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(PUBLIC_SYNC_CONFIG.properties.pending) !== '1') {
    return {status: 'NOTHING_TO_SYNC'};
  }

  const reason = props.getProperty(PUBLIC_SYNC_CONFIG.properties.pendingReason) || 'queue';
  const priority = props.getProperty(PUBLIC_SYNC_CONFIG.properties.pendingPriority) || 'NORMAL';
  const lastSuccessText = props.getProperty(PUBLIC_SYNC_CONFIG.properties.lastSuccess) || '';
  const lastSuccess = lastSuccessText ? new Date(lastSuccessText) : null;
  const minIntervalMs = PUBLIC_SYNC_CONFIG.normalMinIntervalMinutes * 60 * 1000;

  if (
    priority !== 'URGENT' &&
    lastSuccess &&
    !isNaN(lastSuccess.getTime()) &&
    Date.now() - lastSuccess.getTime() < minIntervalMs
  ) {
    return {
      status: 'DEFERRED_NORMAL',
      next_after_ms: minIntervalMs - (Date.now() - lastSuccess.getTime())
    };
  }

  return syncPublicWorkbook_(false, reason);
}

/**
 * Установочный onEdit-триггер. Он только помечает очередь и не выполняет
 * тяжёлую синхронизацию внутри пользовательского редактирования.
 */
function handlePublicSyncEdit(e) {
  if (!e || !e.range) return;

  const sheetName = e.range.getSheet().getName();
  const relevant = [SHEET_BASE, SHEET_TEAMS, SHEET_HISTORY];
  if (relevant.indexOf(sheetName) === -1) return;

  markPublicSyncPending_('edit:' + sheetName + '!' + e.range.getA1Notation());
}

/** Лёгкий onChange для вставки/замены изображений команд. */
function handlePublicSyncChange(e) {
  const changeType = e && e.changeType ? String(e.changeType) : '';
  if (changeType !== 'OTHER' && changeType !== 'FORMAT') return;

  let activeSheetName = '';
  try {
    const activeSheet = e && e.source && e.source.getActiveSheet
      ? e.source.getActiveSheet()
      : null;
    activeSheetName = activeSheet ? activeSheet.getName() : '';
  } catch (err) {}

  if (activeSheetName && activeSheetName !== SHEET_TEAMS) return;
  markPublicSyncPending_('photo_change:' + changeType + (activeSheetName ? ':' + activeSheetName : ''));
}


function enablePublicSync() {
  PropertiesService.getScriptProperties()
    .setProperty(PUBLIC_SYNC_CONFIG.properties.enabled, '1');
  markPublicSyncPending_('enabled');
  return { status: 'ENABLED' };
}

function disablePublicSync() {
  PropertiesService.getScriptProperties()
    .setProperty(PUBLIC_SYNC_CONFIG.properties.enabled, '0');
  return { status: 'DISABLED' };
}

function getPublicSyncStatus() {
  const props = PropertiesService.getScriptProperties();
  return {
    version: CRM_VERSION,
    public_sync_version: '6.2.0',
    enabled: isPublicSyncEnabled_(),
    pending: props.getProperty(PUBLIC_SYNC_CONFIG.properties.pending) === '1',
    pending_reason: props.getProperty(PUBLIC_SYNC_CONFIG.properties.pendingReason) || '',
    pending_priority: props.getProperty(PUBLIC_SYNC_CONFIG.properties.pendingPriority) || 'NORMAL',
    last_success: props.getProperty(PUBLIC_SYNC_CONFIG.properties.lastSuccess) || '',
    last_error: props.getProperty(PUBLIC_SYNC_CONFIG.properties.lastError) || '',
    last_photo_success: props.getProperty(PUBLIC_SYNC_CONFIG.properties.lastPhotoSuccess) || '',
    last_hash: props.getProperty(PUBLIC_SYNC_CONFIG.properties.lastHash) || ''
  };
}

function markPublicSyncPending_(reason) {
  const props = PropertiesService.getScriptProperties();
  const text = String(reason || 'change').slice(0, 500);

  if (publicSyncIsAdminOnlyReason_(text)) {
    return {status: 'IGNORED_ADMIN_ONLY', reason: text};
  }

  const requestedPriority = publicSyncPriorityForReason_(text);
  const currentPriority = props.getProperty(PUBLIC_SYNC_CONFIG.properties.pendingPriority) || 'NORMAL';
  const values = {};
  values[PUBLIC_SYNC_CONFIG.properties.pending] = '1';
  values[PUBLIC_SYNC_CONFIG.properties.pendingReason] = text;
  values[PUBLIC_SYNC_CONFIG.properties.pendingPriority] =
    currentPriority === 'URGENT' || requestedPriority === 'URGENT'
      ? 'URGENT'
      : 'NORMAL';

  if (props.getProperty(PUBLIC_SYNC_CONFIG.properties.mutationState) !== 'MUTATING') {
    values[PUBLIC_SYNC_CONFIG.properties.mutationState] = 'STABLE';
    values[PUBLIC_SYNC_CONFIG.properties.changeToken] = publicSyncNewToken_();
    values[PUBLIC_SYNC_CONFIG.properties.mutationReason] = text;
  }

  props.setProperties(values, false);
  return {status: 'QUEUED', reason: text, priority: values[PUBLIC_SYNC_CONFIG.properties.pendingPriority]};
}

/**
 * Возвращает true, если причина запуска относится к фотографии команды.
 * В том числе ловит обычный onEdit по Команды!C..., который раньше не
 * попадал под /photo|media/ и мог оставить публичное фото устаревшим.
 */
function publicSyncReasonTargetsTeamPhoto_(reason) {
  const text = String(reason || '');
  if (/photo|media/i.test(text)) return true;
  if (/^edit:Команды!C\d+(?::C\d+)?$/i.test(text)) return true;
  if (/^edit:Команды!C/i.test(text)) return true;
  return false;
}

function isPublicSyncEnabled_() {
  const value = PropertiesService.getScriptProperties()
    .getProperty(PUBLIC_SYNC_CONFIG.properties.enabled);

  if (value === null || value === '') return PUBLIC_SYNC_CONFIG.enabledByDefault;
  return value !== '0' && String(value).toLowerCase() !== 'false';
}

/** Отмечает начало короткой транзакции основной базы. Вызывается под ScriptLock. */
function beginPublicDataMutation_(reason) {
  const props = PropertiesService.getScriptProperties();
  const values = {};
  values[PUBLIC_SYNC_CONFIG.properties.mutationState] = 'MUTATING';
  values[PUBLIC_SYNC_CONFIG.properties.changeToken] = publicSyncNewToken_();
  values[PUBLIC_SYNC_CONFIG.properties.mutationReason] = String(reason || 'mutation').slice(0, 500);
  props.setProperties(values, false);
  return values[PUBLIC_SYNC_CONFIG.properties.changeToken];
}

/** Публикует стабильный token после завершения записи основной базы. */
function finishPublicDataMutation_(reason) {
  const props = PropertiesService.getScriptProperties();
  const text = String(reason || 'mutation_done').slice(0, 500);
  const values = {};
  values[PUBLIC_SYNC_CONFIG.properties.mutationState] = 'STABLE';
  values[PUBLIC_SYNC_CONFIG.properties.changeToken] = publicSyncNewToken_();
  values[PUBLIC_SYNC_CONFIG.properties.mutationReason] = text;

  if (!publicSyncIsAdminOnlyReason_(text)) {
    values[PUBLIC_SYNC_CONFIG.properties.pending] = '1';
    values[PUBLIC_SYNC_CONFIG.properties.pendingReason] = text;
    const currentPriority = props.getProperty(PUBLIC_SYNC_CONFIG.properties.pendingPriority) || 'NORMAL';
    const requestedPriority = publicSyncPriorityForReason_(text);
    values[PUBLIC_SYNC_CONFIG.properties.pendingPriority] =
      currentPriority === 'URGENT' || requestedPriority === 'URGENT'
        ? 'URGENT'
        : 'NORMAL';
  }

  props.setProperties(values, false);
  return values[PUBLIC_SYNC_CONFIG.properties.changeToken];
}

function publicSyncIsAdminOnlyReason_(reason) {
  return /webhook:(activity_base|activity_outside)(?::|$)/i.test(String(reason || ''));
}

function publicSyncPriorityForReason_(reason) {
  return /webhook:(activity_base|activity_outside)/i.test(String(reason || '')) ? 'NORMAL' : 'URGENT';
}

function publicSyncNewToken_() {
  return Date.now().toString(36) + '_' + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
}

function publicSyncReadDataState_() {
  const props = PropertiesService.getScriptProperties();
  return {
    state: props.getProperty(PUBLIC_SYNC_CONFIG.properties.mutationState) || 'STABLE',
    token: props.getProperty(PUBLIC_SYNC_CONFIG.properties.changeToken) || '',
    reason: props.getProperty(PUBLIC_SYNC_CONFIG.properties.mutationReason) || ''
  };
}

function capturePublicSyncSnapshot_(waitMs, reason) {
  const started = Date.now();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(Math.max(0, Number(waitMs) || 0))) {
    return {status: 'SOURCE_LOCK_BUSY', waitedMs: Date.now() - started};
  }

  try {
    const props = PropertiesService.getScriptProperties();
    let state = publicSyncReadDataState_();
    let recoveredMutation = false;

    if (state.state === 'MUTATING') {
      const recoveryReason = 'recovered_stale_mutation:' + String(reason || 'snapshot').slice(0, 300);
      const recoveryToken = publicSyncNewToken_();
      const values = {};
      values[PUBLIC_SYNC_CONFIG.properties.mutationState] = 'STABLE';
      values[PUBLIC_SYNC_CONFIG.properties.changeToken] = recoveryToken;
      values[PUBLIC_SYNC_CONFIG.properties.mutationReason] = recoveryReason;
      values[PUBLIC_SYNC_CONFIG.properties.pending] = '1';
      values[PUBLIC_SYNC_CONFIG.properties.pendingReason] = recoveryReason;
      props.setProperties(values, false);
      state = {state: 'STABLE', token: recoveryToken, reason: recoveryReason};
      recoveredMutation = true;
    }

    const adminSs = SpreadsheetApp.openById(SPREADSHEET_ID);
    SpreadsheetApp.flush();
    const snapshot = buildPublicSyncSnapshot_(adminSs);
    const finalState = publicSyncReadDataState_();
    snapshot.dataToken = finalState.token || state.token || publicSyncNewToken_();

    return {
      status: 'CAPTURED',
      adminSs: adminSs,
      snapshot: snapshot,
      waitedMs: Date.now() - started,
      recoveredMutation: recoveredMutation
    };
  } finally {
    try { lock.releaseLock(); } catch (err) {}
  }
}

function publicSyncReadJsonProperty_(key) {
  const raw = PropertiesService.getScriptProperties().getProperty(key);
  if (!raw) return {};
  try { return JSON.parse(raw) || {}; } catch (err) { return {}; }
}

function publicSyncAcquireLease_() {
  if (typeof acquireRoyalCrmLease_ !== 'function') {
    return 'NO_SHARED_LEASE_' + Utilities.getUuid();
  }
  return acquireRoyalCrmLease_('PUBLIC_SYNC', PUBLIC_SYNC_CONFIG.leaseTtlMs);
}

function publicSyncReleaseLease_(owner) {
  if (!owner || String(owner).indexOf('NO_SHARED_LEASE_') === 0) return;
  if (typeof releaseRoyalCrmLease_ === 'function') releaseRoyalCrmLease_('PUBLIC_SYNC', owner);
}

function syncPublicWorkbook_(force, reason) {
  const startedAt = new Date();
  const leaseOwner = publicSyncAcquireLease_();
  let adminSs = null;
  let snapshot = null;
  let changed = {};
  let deletedPublicSheets = [];

  if (!leaseOwner) return {status: 'BUSY', reason: reason || ''};

  try {
    if (!isPublicSyncEnabled_() && !force) return {status: 'DISABLED'};

    const capture = capturePublicSyncSnapshot_(
      force ? 15000 : 6000,
      reason || (force ? 'manual' : 'queue')
    );

    if (capture.status !== 'CAPTURED') {
      markPublicSyncPending_('source_lock_busy:' + (reason || 'queue'));
      return {status: 'DEFERRED_SOURCE_LOCK', reason: reason || '', waited_ms: capture.waitedMs || 0};
    }

    adminSs = capture.adminSs;
    snapshot = capture.snapshot;

    if (snapshot.validation.errors.length) {
      const validationError = new Error(
        'PUBLIC_SYNC_VALIDATION_FAILED: ' + snapshot.validation.errors.join(' | ')
      );
      validationError.publicSyncCode = 'VALIDATION_FAILED';
      throw validationError;
    }

    const props = PropertiesService.getScriptProperties();
    const previousHashes = publicSyncReadJsonProperty_(PUBLIC_SYNC_CONFIG.properties.componentHashes);
    Object.keys(snapshot.componentHashes).forEach(function(key) {
      changed[key] = Boolean(force || previousHashes[key] !== snapshot.componentHashes[key]);
    });

    const forceMedia = publicSyncReasonTargetsTeamPhoto_(reason);
    changed.media = Boolean(force || forceMedia || changed.teams);
    const changedNames = Object.keys(changed).filter(function(key) { return changed[key]; });

    if (!changedNames.length) {
      const nowState = publicSyncReadDataState_();
      const values = {};
      values[PUBLIC_SYNC_CONFIG.properties.lastSuccess] = new Date().toISOString();
      values[PUBLIC_SYNC_CONFIG.properties.lastError] = '';
      if (nowState.state === 'STABLE' && nowState.token === snapshot.dataToken) {
        values[PUBLIC_SYNC_CONFIG.properties.pending] = '0';
        values[PUBLIC_SYNC_CONFIG.properties.pendingReason] = '';
        values[PUBLIC_SYNC_CONFIG.properties.pendingPriority] = 'NORMAL';
        values[PUBLIC_SYNC_CONFIG.properties.lastSyncedToken] = snapshot.dataToken;
      }
      props.setProperties(values, false);

      const unchanged = publicSyncReport_(snapshot, 'UNCHANGED');
      unchanged.reason = reason || '';
      unchanged.changed_components = [];
      unchanged.duration_ms = Date.now() - startedAt.getTime();
      unchanged.source_lock_wait_ms = capture.waitedMs || 0;
      unchanged.recovered_stale_mutation = capture.recoveredMutation === true;
      appendPublicSyncLog_(adminSs, unchanged);
      return unchanged;
    }

    const publicSs = SpreadsheetApp.openById(PUBLIC_SYNC_CONFIG.spreadsheetId);
    if (force) deletedPublicSheets = removeUnknownPublicSheets_(publicSs);
    validatePublicWorkbookStructure_(publicSs);

    const writeReport = writePublicSyncSnapshot_(publicSs, snapshot, changed);
    SpreadsheetApp.flush();
    verifyPublicSync_(publicSs, snapshot);

    let telegramLinksReport = {status: 'SKIPPED_MEDIA_ONLY'};
    if (changed.teams || changed.base || changed.history || changed.relations || changed.lists || force) {
      telegramLinksReport = refreshPublicTelegramLinksAfterSync_();
    }

    const nowIso = new Date().toISOString();
    const nowState = publicSyncReadDataState_();
    const values = {};
    values[PUBLIC_SYNC_CONFIG.properties.lastHash] = snapshot.hash;
    values[PUBLIC_SYNC_CONFIG.properties.componentHashes] = JSON.stringify(snapshot.componentHashes);
    values[PUBLIC_SYNC_CONFIG.properties.rowCounts] = JSON.stringify({
      teams: snapshot.publicTeams.length,
      base: snapshot.publicBase.length,
      lists: snapshot.publicLists.length,
      relations: snapshot.publicRelations.length,
      history: snapshot.history.length
    });
    values[PUBLIC_SYNC_CONFIG.properties.lastSuccess] = nowIso;
    values[PUBLIC_SYNC_CONFIG.properties.lastError] = '';
    values[PUBLIC_SYNC_CONFIG.properties.lastSyncedToken] = snapshot.dataToken;
    if (changed.media) values[PUBLIC_SYNC_CONFIG.properties.lastPhotoSuccess] = nowIso;

    if (nowState.state === 'STABLE' && nowState.token === snapshot.dataToken) {
      values[PUBLIC_SYNC_CONFIG.properties.pending] = '0';
      values[PUBLIC_SYNC_CONFIG.properties.pendingReason] = '';
      values[PUBLIC_SYNC_CONFIG.properties.pendingPriority] = 'NORMAL';
    }
    props.setProperties(values, false);

    const success = publicSyncReport_(snapshot, 'SYNCED');
    success.reason = reason || '';
    success.changed_components = changedNames;
    success.deleted_public_sheets = deletedPublicSheets;
    success.write_report = writeReport;
    success.telegram_links = telegramLinksReport;
    success.duration_ms = Date.now() - startedAt.getTime();
    success.source_lock_wait_ms = capture.waitedMs || 0;
    success.recovered_stale_mutation = capture.recoveredMutation === true;
    appendPublicSyncLog_(adminSs, success);
    return success;
  } catch (err) {
    const message = String(err && err.stack ? err.stack : err);
    PropertiesService.getScriptProperties().setProperties({
      [PUBLIC_SYNC_CONFIG.properties.pending]: '1',
      [PUBLIC_SYNC_CONFIG.properties.lastError]: message.slice(0, 5000)
    }, false);

    const failure = {
      status: err && err.publicSyncCode ? err.publicSyncCode : 'ERROR',
      version: CRM_VERSION,
      reason: reason || '',
      message: message,
      teams: snapshot ? snapshot.teams.length : 0,
      participants: snapshot ? snapshot.participants.length : 0,
      relations: snapshot ? snapshot.relations.length : 0,
      history_rows: snapshot ? snapshot.history.length : 0,
      changed_components: Object.keys(changed).filter(function(key) { return changed[key]; }),
      warnings: snapshot ? snapshot.validation.warnings : [],
      errors: snapshot ? snapshot.validation.errors : [message],
      duration_ms: Date.now() - startedAt.getTime()
    };
    if (adminSs) {
      try { appendPublicSyncLog_(adminSs, failure); } catch (logErr) {}
    }
    throw err;
  } finally {
    publicSyncReleaseLease_(leaseOwner);
  }
}

function buildPublicSyncSnapshot_(adminSs) {
  const teamsSheet = syncRequireSheet_(adminSs, SHEET_TEAMS, 'админская таблица');
  const baseSheet = syncRequireSheet_(adminSs, SHEET_BASE, 'админская таблица');
  const historySheet = syncRequireSheet_(adminSs, SHEET_HISTORY, 'админская таблица');
  const validation = {errors: [], warnings: []};

  const teamResult = readAdminTeamsForPublic_(teamsSheet, validation);
  const teams = teamResult.publicTeams;
  const participantsAndRelations = readAdminParticipantsForPublic_(
    baseSheet,
    teamResult.allTeams,
    validation
  );
  validatePublicTeamMembership_(teams, participantsAndRelations.relations, validation);
  const history = readAdminHistoryForPublic_(historySheet, participantsAndRelations.participants, teams);

  const snapshot = {
    createdAt: new Date(),
    teams: teams,
    participants: participantsAndRelations.participants,
    relations: participantsAndRelations.relations,
    history: history,
    validation: validation
  };

  snapshot.publicTeams = buildPublicTeamsRows_(teams, snapshot.relations);
  snapshot.publicBase = buildPublicBaseRows_(snapshot.participants);
  snapshot.publicLists = buildPublicListsRows_(teams, snapshot.relations);
  snapshot.publicRelations = buildPublicRelationsRows_(snapshot.relations);
  snapshot.componentHashes = computePublicComponentHashes_(snapshot);
  snapshot.hash = computePublicSyncHash_(snapshot);
  return snapshot;
}

function readAdminTeamsForPublic_(sheet, validation) {
  const lastRow = Math.max(sheet.getLastRow(), 1);
  if (lastRow < 2) return { allTeams: [], publicTeams: [] };

  const display = sheet
    .getRange(1, 1, lastRow, Math.max(sheet.getLastColumn(), 12))
    .getDisplayValues();

  const header = syncHeaderMap_(display[0]);
  const gameIndex = syncRequiredHeaderIndex_(header, 'Игра', sheet.getName());
  const teamIndex = syncRequiredHeaderIndex_(header, 'Команда', sheet.getName());
  const photoIndex = syncOptionalHeaderIndex_(header, 'Фото');
  const statusIndex = syncRequiredHeaderIndex_(header, 'Статус', sheet.getName());

  /*
   * getDisplayValues() не возвращает саму картинку. Для столбца «Фото»
   * отдельно читаются реальные значения CellImage и формулы IMAGE().
   */
  const photoValues = photoIndex >= 0 && lastRow >= 2
    ? sheet.getRange(2, photoIndex + 1, lastRow - 1, 1).getValues()
    : [];
  const photoFormulas = photoIndex >= 0 && lastRow >= 2
    ? sheet.getRange(2, photoIndex + 1, lastRow - 1, 1).getFormulas()
    : [];

  const allTeams = [];
  const keyRows = {};

  for (let i = 1; i < display.length; i++) {
    const rowNumber = i + 1;
    const game = normalizeGame_(display[i][gameIndex]);
    const team = syncStripTeamSuffix_(display[i][teamIndex]);

    if (!team) continue;

    const status = syncNormalizePublicStatus_(display[i][statusIndex]);
    if (!status) {
      validation.errors.push(
        'Команды!' + rowNumber +
        ': неизвестный или пустой статус для команды «' + team +
        '». Допустимо: Активен, На паузе, Неактивен'
      );
      continue;
    }

    if (!game) {
      validation.errors.push(
        'Команды!' + rowNumber +
        ': не определена игра для команды «' + team + '»'
      );
      continue;
    }

    const key = syncTeamKey_(game, team);
    if (keyRows[key]) {
      validation.errors.push(
        'Команды!' + rowNumber + ': дубль команды «' + team + '» в ' + game +
        ' (первая строка ' + keyRows[key] + ')'
      );
      continue;
    }

    keyRows[key] = rowNumber;
    allTeams.push({
      sourceRow: rowNumber,
      game: game,
      team: team,
      display: team + ' — ' + syncGameSuffix_(game),
      photoValue: photoIndex >= 0 && photoValues[i - 1]
        ? photoValues[i - 1][0]
        : '',
      photoFormula: photoIndex >= 0 && photoFormulas[i - 1]
        ? photoFormulas[i - 1][0]
        : '',
      status: status,
      isPublic: syncIsPublicStatus_(status),
      key: key
    });
  }

  return {
    allTeams: allTeams,
    publicTeams: allTeams.filter(team => team.isPublic)
  };
}

function readAdminParticipantsForPublic_(sheet, teams, validation) {
  const lastRow = Math.max(sheet.getLastRow(), 1);
  if (lastRow < 2) return { participants: [], relations: [] };

  const lastColumn = Math.max(sheet.getLastColumn(), 32);
  const raw = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
  const display = sheet.getRange(1, 1, lastRow, lastColumn).getDisplayValues();
  const header = syncHeaderMap_(display[0]);

  const index = {
    name: syncRequiredHeaderIndex_(header, 'Имя', sheet.getName()),
    tgName: syncRequiredHeaderIndex_(header, 'Имя тг', sheet.getName()),
    username: syncRequiredHeaderIndex_(header, 'Ссылка тг', sheet.getName()),
    tgId: syncRequiredHeaderIndex_(header, 'id тг', sheet.getName()),
    status: syncRequiredHeaderIndex_(header, 'Статус', sheet.getName()),
    specnaz: syncRequiredHeaderIndex_(header, 'Спецназ', sheet.getName()),
    date: syncRequiredHeaderIndex_(header, 'Дата', sheet.getName()),
    screens: syncRequiredHeaderIndex_(header, 'Скрины', sheet.getName()),
    activityBase: syncRequiredHeaderIndex_(header, 'Активность в базе', sheet.getName()),
    activityOutside: syncRequiredHeaderIndex_(header, 'Активность вне базы', sheet.getName())
  };

  const slots = [];
  for (let slot = 1; slot <= 5; slot++) {
    slots.push({
      number: slot,
      team: syncRequiredHeaderIndex_(header, 'Команда ' + slot, sheet.getName()),
      nick: syncRequiredHeaderIndex_(header, 'Ник ' + slot, sheet.getName()),
      role: syncRequiredHeaderIndex_(header, 'Роль ' + slot, sheet.getName()),
      game: syncRequiredHeaderIndex_(header, 'Игра ' + slot, sheet.getName())
    });
  }

  const teamsByKey = {};
  const teamsByName = {};

  teams.forEach(team => {
    teamsByKey[team.key] = team;

    const nameKey = syncTextKey_(team.team);
    if (!teamsByName[nameKey]) teamsByName[nameKey] = [];
    teamsByName[nameKey].push(team);
  });

  const participants = [];
  const relations = [];
  const identityRows = {};

  for (let i = 1; i < display.length; i++) {
    const rowNumber = i + 1;
    const name = clean_(display[i][index.name]);
    const tgName = clean_(display[i][index.tgName]);
    const username = normalizePublicUsername_(display[i][index.username]);
    const tgId = normalizeTgId_(display[i][index.tgId]);

    if (!name && !tgName && !username && !tgId) continue;

    const status = syncNormalizePublicStatus_(display[i][index.status]);
    if (!status) {
      validation.errors.push(
        'База участников!' + rowNumber +
        ': неизвестный или пустой статус участника. ' +
        'Допустимо: Активен, На паузе, Неактивен'
      );
      continue;
    }

    // Неактивные участники полностью исключаются из публичного снимка:
    // из базы, поиска, карточек, связей и истории.
    if (!syncIsPublicStatus_(status)) continue;

    const participantKey = syncParticipantKey_(tgId, username, rowNumber);
    if (identityRows[participantKey]) {
      validation.errors.push(
        'База участников!' + rowNumber +
        ': повторяется идентификатор участника ' +
        syncParticipantKeyLabel_(tgId, username) +
        ' (первая строка ' + identityRows[participantKey] + ')'
      );
      continue;
    }
    identityRows[participantKey] = rowNumber;

    const participant = {
      sourceRow: rowNumber,
      key: participantKey,
      name: name,
      tgName: tgName,
      username: username,
      tgId: tgId,
      status: status,
      specnaz: numberOrZero_(raw[i][index.specnaz]),
      screens: numberOrZero_(raw[i][index.screens]),
      date: raw[i][index.date],
      activityBase: numberOrZero_(raw[i][index.activityBase]),
      activityOutside: numberOrZero_(raw[i][index.activityOutside]),
      teams: []
    };

    const relationKeys = {};

    slots.forEach(slot => {
      const teamRaw = clean_(display[i][slot.team]);
      const nick = clean_(display[i][slot.nick]);
      const role = clean_(display[i][slot.role]);
      const explicitGame = normalizeGame_(display[i][slot.game]);
      const suffixGame = syncGameFromTeamSuffix_(teamRaw);

      if (!teamRaw) {
        if (role && ROLE_SPECNAZ.indexOf(role) === -1) {
          validation.warnings.push(
            'База участников!' + rowNumber + ', слот ' + slot.number +
            ': указана роль «' + role + '», но команда пуста'
          );
        }
        return;
      }

      const teamName = syncStripTeamSuffix_(teamRaw);
      let game = explicitGame || suffixGame;

      if (explicitGame && suffixGame && explicitGame !== suffixGame) {
        validation.errors.push(
          'База участников!' + rowNumber + ', слот ' + slot.number +
          ': суффикс команды указывает ' + suffixGame +
          ', а столбец игры — ' + explicitGame
        );
        return;
      }

      if (!game) {
        const candidates = teamsByName[syncTextKey_(teamName)] || [];
        if (candidates.length === 1) {
          game = candidates[0].game;
          validation.warnings.push(
            'База участников!' + rowNumber + ', слот ' + slot.number +
            ': игра восстановлена по единственной команде «' + teamName + '»'
          );
        } else {
          validation.errors.push(
            'База участников!' + rowNumber + ', слот ' + slot.number +
            ': невозможно однозначно определить РМ/РК для команды «' +
            teamName + '»'
          );
          return;
        }
      }

      if (!role || ROLE_TEAM.indexOf(role) === -1) {
        validation.errors.push(
          'База участников!' + rowNumber + ', слот ' + slot.number +
          ': для команды «' + teamName +
          '» нужна роль Лидер, Помощник или Игрок'
        );
        return;
      }

      const teamKey = syncTeamKey_(game, teamName);
      const team = teamsByKey[teamKey];

      if (!team) {
        validation.errors.push(
          'База участников!' + rowNumber + ', слот ' + slot.number +
          ': команда «' + teamName + '» (' + game +
          ') отсутствует на листе «Команды»'
        );
        return;
      }

      // По правилам таблицы такого состояния быть не должно:
      // неактивная команда означает, что в ней нет участников.
      if (!team.isPublic) {
        validation.errors.push(
          'База участников!' + rowNumber + ', слот ' + slot.number +
          ': участник со статусом «' + status +
          '» привязан к неактивной команде «' + team.display +
          '». При наличии участника команда не может иметь статус «Неактивен»'
        );
        return;
      }

      if (relationKeys[teamKey]) {
        validation.errors.push(
          'База участников!' + rowNumber + ': команда «' + team.display +
          '» повторяется в слотах ' + relationKeys[teamKey] +
          ' и ' + slot.number
        );
        return;
      }
      relationKeys[teamKey] = slot.number;

      participant.teams.push(team.display);
      relations.push({
        participantKey: participant.key,
        sourceRow: rowNumber,
        slot: slot.number,
        name: participant.name,
        tgName: participant.tgName,
        username: participant.username,
        tgId: participant.tgId,
        team: team.team,
        teamDisplay: team.display,
        teamKey: team.key,
        game: team.game,
        nick: nick,
        role: role,
        status: participant.status,
        specnaz: participant.specnaz,
        screens: participant.screens,
        date: participant.date,
        activityBase: participant.activityBase,
        activityOutside: participant.activityOutside
      });
    });

    participants.push(participant);
  }

  return { participants: participants, relations: relations };
}

function readAdminHistoryForPublic_(sheet, participants, teams) {
  const lastRow = Math.max(sheet.getLastRow(), 1);
  if (lastRow < 2) return [];

  const width = HISTORY_WIDTH;
  const sourceRows = sheet
    .getRange(2, 1, lastRow - 1, width)
    .getValues()
    .map(row => row.slice(0, width));

  const activeIds = {};
  const activeNames = {};
  const participantById = {};
  const participantByUniqueName = {};

  participants.forEach(participant => {
    if (participant.tgId) {
      activeIds[participant.tgId] = true;
      participantById[participant.tgId] = participant;
    }

    const nameKey = syncTextKey_(participant.name);
    if (nameKey) {
      activeNames[nameKey] = (activeNames[nameKey] || 0) + 1;
      participantByUniqueName[nameKey] = participant;
    }
  });

  const result = [];
  let sectionTitle = null;
  let sectionRows = [];

  function flushSection() {
    if (!sectionRows.length) {
      sectionTitle = null;
      sectionRows = [];
      return;
    }

    if (sectionTitle) result.push(sectionTitle);
    sectionRows.forEach(row => result.push(row));

    sectionTitle = null;
    sectionRows = [];
  }

  sourceRows.forEach(sourceRow => {
    const row = sourceRow.slice(0, width);
    const firstCell = clean_(row[HISTORY_COL_DATE - 1]);

    if (/^Спецназ с /i.test(firstCell)) {
      flushSection();
      row[HISTORY_COL_AVATAR - 1] = '';
      sectionTitle = row;
      return;
    }

    const tgId = normalizeTgId_(row[HISTORY_COL_TG_ID - 1]);
    const playerNameKey = syncTextKey_(row[HISTORY_COL_NAME - 1]);

    const participantAllowed = tgId
      ? !!activeIds[tgId]
      : !!playerNameKey && activeNames[playerNameKey] === 1;

    if (!participantAllowed) return;

    const participant = tgId
      ? participantById[tgId]
      : participantByUniqueName[playerNameKey];

    // CellImage между файлами не переносится через setValues, поэтому B
    // всегда заполняется формулой уже внутри публичной таблицы.
    row[HISTORY_COL_AVATAR - 1] = '';

    if (participant) {
      const nameParts = [participant.name, participant.tgName, participant.username]
        .map(value => clean_(value))
        .filter(value => value !== '');
      row[HISTORY_COL_NAME - 1] = safeText_(nameParts.join(', '));
      row[HISTORY_COL_TEAM - 1] = safeText_((participant.teams || []).join(', '));
      row[HISTORY_COL_TG_ID - 1] = normalizeTgId_(participant.tgId || tgId);
    }

    sectionRows.push(row);
  });

  flushSection();
  return result;
}

/**
 * Публичными считаются только статусы «Активен» и «На паузе».
 * «Неактивен» всегда исключается.
 */
function syncNormalizePublicStatus_(value) {
  const key = syncTextKey_(value).replace(/ё/g, 'е');

  if (key === 'активен') return 'Активен';
  if (key === 'на паузе') return 'На паузе';
  if (key === 'неактивен' || key === 'не активен') return 'Неактивен';

  return '';
}

function syncIsPublicStatus_(status) {
  return status === 'Активен' || status === 'На паузе';
}

/**
 * По правилам проекта команда со статусом «Активен» или «На паузе»
 * обязана иметь хотя бы одного публичного участника.
 */
function validatePublicTeamMembership_(teams, relations, validation) {
  const counts = {};
  relations.forEach(relation => {
    counts[relation.teamKey] = (counts[relation.teamKey] || 0) + 1;
  });

  teams.forEach(team => {
    if (counts[team.key]) return;

    validation.errors.push(
      'Команды!' + team.sourceRow + ': команда «' + team.display +
      '» имеет статус «' + team.status +
      '», но в ней нет участников со статусом «Активен» или «На паузе». ' +
      'При нуле участников установите статус «Неактивен»'
    );
  });
}

function buildPublicTeamsRows_(teams, relations) {
  const byTeam = {};
  teams.forEach(team => byTeam[team.key] = []);

  relations.forEach(relation => {
    if (!byTeam[relation.teamKey]) byTeam[relation.teamKey] = [];
    byTeam[relation.teamKey].push(relation);
  });

  return teams.map(team => {
    const members = (byTeam[team.key] || []).slice().sort(syncRelationSort_);
    const seen = {};
    const labels = [];

    members.forEach(member => {
      if (seen[member.participantKey]) return;
      seen[member.participantKey] = true;
      labels.push(syncPublicMemberLabel_(member));
    });

    return [team.display, labels.join(', ')];
  });
}

function buildPublicBaseRows_(participants) {
  return participants.map(participant => [
    participant.name,
    participant.tgName,
    participant.username,
    participant.teams.join(', '),
    participant.tgId
  ]);
}

function buildPublicListsRows_(teams, relations) {
  const length = Math.max(teams.length, relations.length);
  const rows = [];

  for (let i = 0; i < length; i++) {
    const relation = relations[i];
    const team = teams[i];
    rows.push([
      relation ? relation.name : '',
      relation ? relation.tgName : '',
      relation ? relation.username : '',
      relation ? relation.team : '',
      relation ? relation.role : '',
      relation ? relation.status : '',
      relation ? relation.game : '',
      team ? team.game : '',
      team ? team.team : ''
      // Столбец J («Фото») принципиально НЕ входит в текстовый снимок.
      // Им владеет только syncPublicTeamPhotos_().
    ]);
  }

  return rows;
}

function buildPublicRelationsRows_(relations) {
  return relations.map(function(relation) {
    return [
      relation.name,
      relation.tgName,
      relation.username,
      relation.tgId,
      relation.team,
      relation.nick,
      relation.role,
      relation.status,
      relation.specnaz,
      relation.screens,
      relation.date,
      relation.game
    ];
  });
}

function writePublicSyncSnapshot_(publicSs, snapshot, changed) {
  const lists = syncRequireSheet_(publicSs, PUBLIC_SYNC_CONFIG.sheets.lists, 'публичная таблица');
  const relations = syncRequireSheet_(publicSs, PUBLIC_SYNC_CONFIG.sheets.relations, 'публичная таблица');
  const base = syncRequireSheet_(publicSs, PUBLIC_SYNC_CONFIG.sheets.base, 'публичная таблица');
  const teams = syncRequireSheet_(publicSs, PUBLIC_SYNC_CONFIG.sheets.teams, 'публичная таблица');
  const history = syncRequireSheet_(publicSs, PUBLIC_SYNC_CONFIG.sheets.history, 'публичная таблица');
  const report = {lists: false, relations: false, base: false, teams: false, history: false, photos: 0};

  if (changed.lists) {
    // ВАЖНО: пишем только A:I. Столбец J содержит CellImage фотографий команд
    // и не должен очищаться при обычном обновлении участников/списков.
    syncReplaceData_(lists, 2, 1, 9, snapshot.publicLists);
    report.lists = true;
  }

  if (changed.relations) {
    syncReplaceData_(relations, 2, 1, 12, snapshot.publicRelations);
    report.relations = true;
  }

  if (changed.base) {
    syncEnsureGrid_(base, Math.max(snapshot.publicBase.length + 2, 2), 5);
    base.getRange('E1').setValue('id тг');
    syncReplaceData_(base, 2, 1, 5, snapshot.publicBase);
    try { base.hideColumns(5, 1); } catch (err) {}
    report.base = true;
  }

  if (changed.teams) {
    const publicTeamRows = Math.max(teams.getMaxRows() - 1, 1);
    teams.getRange(2, 1, publicTeamRows, 2).clearDataValidations();
    syncReplaceData_(teams, 2, 1, 2, snapshot.publicTeams);
    syncApplyPublicTeamColors_(teams, snapshot.teams.length);
    syncApplyPublicTeamTelegramLinks_(teams, snapshot.publicTeams);
    syncEnsurePublicCardTeamDropdown_(publicSs);
    syncKeepValidCardSelection_(publicSs, snapshot.teams);
    report.teams = true;
  }

  if (changed.history) {
    syncWritePublicHistory_(history, snapshot.history);
    report.history = true;
  }

  if (changed.media) {
    report.photos = syncPublicTeamPhotos_(publicSs, snapshot.teams);
  }

  if (changed.base && typeof queueMissingTelegramAvatarsFromParticipants_ === 'function') {
    try {
      queueMissingTelegramAvatarsFromParticipants_(snapshot.participants);
    } catch (avatarQueueError) {
      console.warn('TELEGRAM_AVATAR_QUEUE_SKIPPED: ' + String(
        avatarQueueError && avatarQueueError.message ? avatarQueueError.message : avatarQueueError
      ));
    }
  }

  return report;
}

/**
 * Удаляет из публичной таблицы любые листы, которых нет в белом списке.
 *
 * Защищает от:
 * - новых пустых страниц;
 * - дубликатов существующих страниц;
 * - листов «Копия листа ...»;
 * - переименованных пользовательских копий.
 *
 * Возвращает массив удалённых названий для журнала синхронизации.
 */
function refreshPublicTelegramLinksAfterSync_() {
  if (typeof TGNL_refreshPublicOnly !== 'function') {
    const missing = new Error(
      'PUBLIC_SYNC_TELEGRAM_LINKS_MODULE_MISSING: обновите 08_TELEGRAM_NAME_LINKS.gs'
    );
    missing.publicSyncCode = 'TELEGRAM_LINKS_MODULE_MISSING';
    throw missing;
  }

  const result = TGNL_refreshPublicOnly();
  if (!result || result.ok === false) {
    const invalid = new Error('PUBLIC_SYNC_TELEGRAM_LINKS_FAILED');
    invalid.publicSyncCode = 'TELEGRAM_LINKS_FAILED';
    throw invalid;
  }
  return result;
}

function syncApplyPublicTeamTelegramLinks_(sheet, rows) {
  if (!rows || !rows.length) return;
  const values = rows.map(function(row) {
    return [syncBuildTelegramRichText_(row[1])];
  });
  sheet.getRange(2, 2, rows.length, 1).setRichTextValues(values);
}

function syncBuildTelegramRichText_(value) {
  const text = String(value === null || value === undefined ? '' : value);
  const builder = SpreadsheetApp.newRichTextValue().setText(text);
  if (!text) return builder.build();

  const style = SpreadsheetApp.newTextStyle()
    .setForegroundColor(PUBLIC_SYNC_LINK_COLOR)
    .setUnderline(true)
    .build();
  const regex = /@([A-Za-z0-9_]{5,32})/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    builder.setLinkUrl(start, end, 'https://t.me/' + match[1]);
    builder.setTextStyle(start, end, style);
  }
  return builder.build();
}

function removeUnknownPublicSheets_(ss) {
  const allowed = {};
  PUBLIC_SYNC_CONFIG.allowedPublicSheets.forEach(name => {
    allowed[name] = true;
  });

  const sheets = ss.getSheets();
  const validSheets = sheets.filter(sheet => allowed[sheet.getName()]);
  const unknownSheets = sheets.filter(sheet => !allowed[sheet.getName()]);

  if (!unknownSheets.length) return [];

  // Защита от ошибочного пустого белого списка.
  if (!validSheets.length) {
    const error = new Error(
      'PUBLIC_SHEET_GUARD_ABORTED: в публичной таблице не найдено ' +
      'ни одного разрешённого листа'
    );
    error.publicSyncCode = 'SHEET_GUARD_ABORTED';
    throw error;
  }

  const deleted = [];

  unknownSheets.forEach(sheet => {
    const name = sheet.getName();

    try {
      ss.deleteSheet(sheet);
      deleted.push(name);
    } catch (err) {
      const error = new Error(
        'PUBLIC_SHEET_DELETE_FAILED: не удалось удалить лист «' +
        name + '»: ' + String(err && err.message ? err.message : err)
      );
      error.publicSyncCode = 'SHEET_DELETE_FAILED';
      throw error;
    }
  });

  SpreadsheetApp.flush();
  return deleted;
}

/**
 * Возвращает true, если значение является картинкой внутри ячейки Google Sheets.
 */
function syncIsCellImage_(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    value.valueType === SpreadsheetApp.ValueType.IMAGE
  );
}

/**
 * Возвращает true для поддерживаемой формулы IMAGE().
 */
function syncIsImageFormula_(formula) {
  return /^\s*=\s*IMAGE\s*\(/i.test(String(formula || ''));
}

/**
 * Есть ли у команды фотография, которую можно перенести.
 */
function syncTeamHasPhoto_(team) {
  return Boolean(
    team && (
      syncIsCellImage_(team.photoValue) ||
      syncIsImageFormula_(team.photoFormula)
    )
  );
}

/**
 * Проверяет, что целевая ячейка действительно содержит изображение.
 */
function syncPhotoCellHasImage_(cell) {
  try {
    return (
      syncIsCellImage_(cell.getValue()) ||
      syncIsImageFormula_(cell.getFormula())
    );
  } catch (err) {
    return false;
  }
}

/**
 * Снимок текущего содержимого фото-ячейки для безопасного отката.
 * CellImage сохраняется как объект и может быть повторно передан setValue().
 */
function syncCapturePhotoCell_(cell) {
  let value = '';
  let formula = '';
  try { value = cell.getValue(); } catch (err) {}
  try { formula = cell.getFormula(); } catch (err) {}

  return {
    formula: formula || '',
    value: value,
    hadImage: syncIsCellImage_(value) || syncIsImageFormula_(formula)
  };
}

/** Восстанавливает фото-ячейку после неудачной попытки записи. */
function syncRestorePhotoCell_(cell, backup) {
  const safe = backup || {formula: '', value: '', hadImage: false};
  try {
    if (syncIsImageFormula_(safe.formula)) {
      cell.setFormula(safe.formula);
    } else if (syncIsCellImage_(safe.value)) {
      cell.setValue(safe.value);
    } else if (!safe.hadImage) {
      cell.clearContent();
    }
    SpreadsheetApp.flush();
  } catch (restoreError) {
    console.warn(
      'PUBLIC_PHOTO_ROLLBACK_FAILED: ' +
      String(restoreError && restoreError.message ? restoreError.message : restoreError)
    );
  }
}

/**
 * Выполняет потенциально разрушительную запись с автоматическим откатом,
 * если после операции в ячейке не появилось изображение.
 */
function syncPhotoWriteWithRollback_(targetCell, writer) {
  const backup = syncCapturePhotoCell_(targetCell);

  try {
    writer();
    SpreadsheetApp.flush();
    Utilities.sleep(500);

    if (syncPhotoCellHasImage_(targetCell)) return true;

    syncRestorePhotoCell_(targetCell, backup);
    return false;
  } catch (err) {
    syncRestorePhotoCell_(targetCell, backup);
    throw err;
  }
}

/**
 * Способ №1: полноценное копирование ячейки внутри одного Spreadsheet-файла.
 * Старое публичное фото не теряется: при неудаче выполняется откат.
 */
function syncCopyPhotoCellNormal_(sourceCell, targetCell) {
  return syncPhotoWriteWithRollback_(targetCell, function() {
    sourceCell.copyTo(targetCell);
  });
}

/**
 * Способ №2: прямой перенос уже полученного CellImage.
 * По API Range.setValue(CellImage) является штатным способом записи картинки.
 */
function syncSetPhotoFromCellImage_(sourceImage, targetCell) {
  if (!syncIsCellImage_(sourceImage)) return false;

  return syncPhotoWriteWithRollback_(targetCell, function() {
    targetCell.setValue(sourceImage);
  });
}

/**
 * Способ №3: создание нового CellImage по Google-hosted URL.
 */
function syncBuildPhotoFromCellImage_(sourceImage, targetCell) {
  if (!syncIsCellImage_(sourceImage)) return false;

  const contentUrl = sourceImage.getContentUrl();
  if (!contentUrl) return false;

  const newImage = sourceImage
    .toBuilder()
    .setSourceUrl(contentUrl)
    .build();

  return syncPhotoWriteWithRollback_(targetCell, function() {
    targetCell.setValue(newImage);
  });
}

/**
 * Переносит одну фотографию несколькими способами без потери старого фото.
 *
 * Порядок:
 * 1. copyTo() из временного листа внутри публичного файла;
 * 2. прямой setValue(CellImage) из временного листа;
 * 3. прямой setValue(CellImage) из исходной админской таблицы;
 * 4. новый CellImage по Google-hosted URL из временного листа;
 * 5. новый CellImage по Google-hosted URL из оригинала.
 *
 * @return {{ok:boolean, method:string, error:string}}
 */
function syncCopyPhotoCellWithRetry_(
  sourceCell,
  originalImage,
  targetCell,
  teamLabel
) {
  const errors = [];

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      if (syncCopyPhotoCellNormal_(sourceCell, targetCell)) {
        return {ok: true, method: 'COPY_TO_NORMAL', error: ''};
      }
      errors.push('copyTo попытка ' + attempt + ': изображение не появилось');
    } catch (err) {
      errors.push(
        'copyTo попытка ' + attempt + ': ' +
        String(err && err.message ? err.message : err)
      );
    }
    if (attempt < 2) Utilities.sleep(500 * attempt);
  }

  let temporaryImage = null;
  try {
    temporaryImage = sourceCell.getValue();
    if (syncSetPhotoFromCellImage_(temporaryImage, targetCell)) {
      return {ok: true, method: 'TEMP_CELL_IMAGE_DIRECT', error: ''};
    }
    errors.push('прямой CellImage из временного листа: изображение не создано');
  } catch (err) {
    errors.push(
      'прямой CellImage из временного листа: ' +
      String(err && err.message ? err.message : err)
    );
  }

  try {
    if (syncSetPhotoFromCellImage_(originalImage, targetCell)) {
      return {ok: true, method: 'ORIGINAL_CELL_IMAGE_DIRECT', error: ''};
    }
    errors.push('прямой CellImage из оригинала: изображение не создано');
  } catch (err) {
    errors.push(
      'прямой CellImage из оригинала: ' +
      String(err && err.message ? err.message : err)
    );
  }

  try {
    if (syncBuildPhotoFromCellImage_(temporaryImage, targetCell)) {
      return {ok: true, method: 'TEMP_CELL_IMAGE_URL', error: ''};
    }
    errors.push('URL из временного листа: изображение не создано');
  } catch (err) {
    errors.push(
      'URL из временного листа: ' +
      String(err && err.message ? err.message : err)
    );
  }

  try {
    if (syncBuildPhotoFromCellImage_(originalImage, targetCell)) {
      return {ok: true, method: 'ORIGINAL_CELL_IMAGE_URL', error: ''};
    }
    errors.push('URL из оригинала: изображение не создано');
  } catch (err) {
    errors.push(
      'URL из оригинала: ' +
      String(err && err.message ? err.message : err)
    );
  }

  const finalError = errors.join(' | ');

  console.warn(
    'PUBLIC_PHOTO_COPY_FAILED_PRESERVED: команда «' +
    String(teamLabel || 'без названия') + '»: ' + finalError
  );

  // КРИТИЧНО: здесь НЕ очищаем targetCell. Старое фото сохраняется.
  return {ok: false, method: '', error: finalError};
}

/**
 * Сохраняет подробный результат последней синхронизации фотографий.
 * Ошибка отдельного изображения не останавливает основную синхронизацию.
 */
function syncSavePublicPhotoReport_(report) {
  try {
    PropertiesService.getScriptProperties().setProperty(
      'ROYAL_CRM_PUBLIC_PHOTO_LAST_REPORT',
      JSON.stringify(report || {})
    );
  } catch (err) {}
}

/**
 * Возвращает отчёт последнего запуска синхронизации фото команд.
 */
function getLastPublicPhotoSyncReport() {
  const raw = PropertiesService.getScriptProperties().getProperty(
    'ROYAL_CRM_PUBLIC_PHOTO_LAST_REPORT'
  );

  if (!raw) {
    return {
      status: 'NO_REPORT'
    };
  }

  try {
    const report = JSON.parse(raw);
    Logger.log(JSON.stringify(report, null, 2));
    return report;
  } catch (err) {
    return {
      status: 'BAD_REPORT',
      message: String(err && err.message ? err.message : err)
    };
  }
}

/**
 * РУЧНОЙ РЕМОНТ ФОТО.
 * Запускается после установки V6.1 один раз, чтобы восстановить Списки!J
 * из текущих CellImage/IMAGE() админской таблицы без перезаписи остальных
 * публичных данных.
 */
function repairPublicTeamPhotosNow() {
  const leaseOwner = publicSyncAcquireLease_();
  if (!leaseOwner) {
    const busy = {status: 'BUSY', message: 'Другая синхронизация уже выполняется'};
    Logger.log(JSON.stringify(busy, null, 2));
    return busy;
  }

  try {
    const capture = capturePublicSyncSnapshot_(15000, 'manual_photo_repair');
    if (capture.status !== 'CAPTURED') {
      const deferred = {
        status: 'DEFERRED_SOURCE_LOCK',
        waited_ms: capture.waitedMs || 0
      };
      Logger.log(JSON.stringify(deferred, null, 2));
      return deferred;
    }

    if (
      capture.snapshot &&
      capture.snapshot.validation &&
      capture.snapshot.validation.errors &&
      capture.snapshot.validation.errors.length
    ) {
      const invalid = {
        status: 'VALIDATION_FAILED',
        errors: capture.snapshot.validation.errors.slice()
      };
      Logger.log(JSON.stringify(invalid, null, 2));
      return invalid;
    }

    const publicSs = SpreadsheetApp.openById(PUBLIC_SYNC_CONFIG.spreadsheetId);
    const synced = syncPublicTeamPhotos_(publicSs, capture.snapshot.teams);
    SpreadsheetApp.flush();

    const report = getLastPublicPhotoSyncReport();
    const result = {
      status: report && report.status ? report.status : 'UNKNOWN',
      public_sync_version: '6.2.0',
      teams: capture.snapshot.teams.length,
      expected: report && typeof report.expected === 'number' ? report.expected : null,
      synced: synced,
      missing: report && Array.isArray(report.missing) ? report.missing : [],
      methods: report && report.methods ? report.methods : {}
    };

    Logger.log(JSON.stringify(result, null, 2));
    return result;
  } finally {
    publicSyncReleaseLease_(leaseOwner);
  }
}

/**
 * Копирует фотографии команд из админской таблицы в скрытый лист
 * «Списки» публичной таблицы, столбец J.
 *
 * Надёжная схема:
 * 1. лист «Команды» целиком временно копируется в публичный файл;
 * 2. изображения переносятся между листами уже внутри одного файла;
 * 3. временный лист удаляется;
 * 4. временная ссылка изображения не используется.
 *
 * Поддерживаются:
 * - изображение внутри ячейки (CellImage);
 * - формула =IMAGE(...).
 *
 * Ошибка одного фото не прерывает синхронизацию остальных данных.
 *
 * @return {number} количество успешно записанных фотографий
 */
function syncPublicTeamPhotos_(publicSs, teams) {
  const startedAt = new Date();
  const safeTeams = Array.isArray(teams) ? teams : [];

  const report = {
    status: 'OK',
    started_at: startedAt.toISOString(),
    expected: safeTeams.filter(syncTeamHasPhoto_).length,
    synced: 0,
    methods: {
      COPY_TO_NORMAL: 0,
      TEMP_CELL_IMAGE_DIRECT: 0,
      ORIGINAL_CELL_IMAGE_DIRECT: 0,
      TEMP_CELL_IMAGE_URL: 0,
      ORIGINAL_CELL_IMAGE_URL: 0,
      IMAGE_FORMULA: 0
    },
    missing: [],
    details: [],
    message: ''
  };

  let temporarySheet = null;

  try {
    const lists = syncRequireSheet_(
      publicSs,
      PUBLIC_SYNC_CONFIG.sheets.lists,
      'публичная таблица'
    );

    syncEnsureGrid_(
      lists,
      Math.max(safeTeams.length + 2, 2),
      10
    );

    if (!safeTeams.length) {
      // Защитный принцип: пустой снимок не имеет права массово удалить фото.
      // Если публичных команд действительно нет, лишние картинки в скрытом J
      // никому не мешают и будут убраны при следующем валидном снимке.
      report.status = 'NO_TEAMS_PRESERVED';
      report.message = 'Публичных команд в снимке нет; существующие фото сохранены';
      report.finished_at = new Date().toISOString();
      syncSavePublicPhotoReport_(report);
      return 0;
    }

    /*
     * Сначала создаётся полноценная копия листа в целевом файле.
     * Google официально поддерживает Sheet.copyTo(spreadsheet).
     */
    const adminSs = SpreadsheetApp.openById(SPREADSHEET_ID);
    const adminTeamsSheet = syncRequireSheet_(
      adminSs,
      PUBLIC_SYNC_CONFIG.sheets.teams,
      'админская таблица'
    );

    temporarySheet = adminTeamsSheet.copyTo(publicSs);

    const temporaryName =
      '__PHOTO_SYNC_TMP_' +
      Utilities.getUuid().replace(/-/g, '').slice(0, 12);

    temporarySheet.setName(temporaryName);

    try {
      temporarySheet.hideSheet();
    } catch (err) {}

    SpreadsheetApp.flush();

    /*
     * После межфайлового copyTo изображения могут появляться не мгновенно.
     */
    Utilities.sleep(2500);
    SpreadsheetApp.flush();

    const headerWidth = Math.max(
      temporarySheet.getLastColumn(),
      3
    );

    const headerValues = temporarySheet
      .getRange(1, 1, 1, headerWidth)
      .getDisplayValues()[0];

    const headerMap = syncHeaderMap_(headerValues);
    const photoIndex = syncOptionalHeaderIndex_(headerMap, 'Фото');

    if (photoIndex < 0) {
      // Структурная ошибка источника не должна уничтожать уже опубликованные фото.
      report.status = 'NO_PHOTO_COLUMN';
      report.message =
        'В админском листе «Команды» не найден столбец «Фото»';
      report.finished_at = new Date().toISOString();
      syncSavePublicPhotoReport_(report);
      return 0;
    }

    const photoColumn = photoIndex + 1;

    safeTeams.forEach((team, index) => {
      const targetCell = lists.getRange(index + 2, 10);
      const sourceRow = Number(team && team.sourceRow) || 0;

      if (
        sourceRow < 2 ||
        sourceRow > temporarySheet.getMaxRows()
      ) {
        if (syncTeamHasPhoto_(team)) {
          // При ошибке адреса источника сохраняем старое публичное фото.
          report.missing.push(
            String(team.display || team.team || 'без названия') +
            ': неверная строка источника; старое фото сохранено'
          );
        } else {
          // Если в админке фото действительно нет — очищение корректно.
          targetCell.clearContent();
        }

        return;
      }

      const sourceCell = temporarySheet.getRange(
        sourceRow,
        photoColumn
      );
      const adminSourceCell = adminTeamsSheet.getRange(
        sourceRow,
        photoColumn
      );

      const sourceFormula = sourceCell.getFormula();
      const sourceValue = sourceCell.getValue();
      const adminSourceFormula = adminSourceCell.getFormula();
      const adminSourceValue = adminSourceCell.getValue();
      const effectiveFormula = syncIsImageFormula_(adminSourceFormula)
        ? adminSourceFormula
        : sourceFormula;

      if (syncIsImageFormula_(effectiveFormula)) {
        const formulaOk = syncPhotoWriteWithRollback_(targetCell, function() {
          targetCell.setFormula(effectiveFormula);
        });

        if (formulaOk) {
          report.synced++;
          report.methods.IMAGE_FORMULA++;
          report.details.push({
            team: String(team.display || team.team || ''),
            status: 'OK',
            method: 'IMAGE_FORMULA'
          });
        } else {
          report.missing.push(String(team.display || team.team || 'без названия'));
          report.details.push({
            team: String(team.display || team.team || ''),
            status: 'ERROR',
            error: 'IMAGE_FORMULA не записалась; старое фото сохранено'
          });
        }

        return;
      }

      /*
       * Sheet.copyTo иногда возвращает временную ячейку без изображения,
       * хотя исходный объект team.photoValue содержит CellImage.
       * Поэтому попытка выполняется, если картинка есть хотя бы в одном
       * из двух источников.
       */
      if (
        syncIsCellImage_(sourceValue) ||
        syncIsCellImage_(adminSourceValue) ||
        syncIsCellImage_(team.photoValue)
      ) {
        const originalImage = syncIsCellImage_(adminSourceValue)
          ? adminSourceValue
          : team.photoValue;

        const result = syncCopyPhotoCellWithRetry_(
          sourceCell,
          originalImage,
          targetCell,
          team.display || team.team
        );

        if (result.ok) {
          report.synced++;
          report.methods[result.method] =
            (report.methods[result.method] || 0) + 1;

          report.details.push({
            team: String(team.display || team.team || ''),
            status: 'OK',
            method: result.method
          });
        } else {
          // КРИТИЧНО: при техническом сбое старое публичное фото сохраняется.
          report.missing.push(
            String(team.display || team.team || 'без названия')
          );

          report.details.push({
            team: String(team.display || team.team || ''),
            status: 'ERROR',
            error: result.error
          });
        }

        return;
      }

      // Прямое чтение исходной ячейки админки подтверждает отсутствие фото.
      // Только в этом случае удаляем прежнее публичное изображение.
      targetCell.clearContent();
    });

    /*
     * Очищаем старые картинки ниже актуального списка команд.
     */
    const firstUnusedRow = safeTeams.length + 2;

    if (firstUnusedRow <= lists.getMaxRows()) {
      lists
        .getRange(
          firstUnusedRow,
          10,
          lists.getMaxRows() - firstUnusedRow + 1,
          1
        )
        .clearContent();
    }

    SpreadsheetApp.flush();

    if (report.missing.length) {
      report.status = 'PARTIAL';
    }

    report.finished_at = new Date().toISOString();
    report.duration_ms =
      new Date().getTime() - startedAt.getTime();

    syncSavePublicPhotoReport_(report);
    return report.synced;

  } catch (err) {
    /*
     * Фото — дополнительная функция. Даже если Google временно не смог
     * скопировать лист, основная синхронизация участников и команд
     * продолжит выполняться.
     */
    report.status = 'ERROR';
    report.message = String(
      err && err.message ? err.message : err
    );
    report.finished_at = new Date().toISOString();
    report.duration_ms =
      new Date().getTime() - startedAt.getTime();

    syncSavePublicPhotoReport_(report);

    console.warn(
      'PUBLIC_PHOTO_SYNC_SKIPPED: ' + report.message
    );

    return 0;

  } finally {
    if (temporarySheet) {
      try {
        publicSs.deleteSheet(temporarySheet);
        SpreadsheetApp.flush();
      } catch (deleteError) {
        console.warn(
          'PUBLIC_PHOTO_TEMP_DELETE_FAILED: ' +
          String(
            deleteError && deleteError.message
              ? deleteError.message
              : deleteError
          )
        );
      }
    }
  }
}

/**
 * Считает картинки, фактически записанные в публичном листе «Списки».
 */
function syncCountPublicTeamPhotos_(sheet, teamCount) {
  if (!teamCount) return 0;

  const range = sheet.getRange(2, 10, teamCount, 1);
  const values = range.getValues();
  const formulas = range.getFormulas();
  let count = 0;

  for (let i = 0; i < teamCount; i++) {
    if (
      syncIsCellImage_(values[i][0]) ||
      syncIsImageFormula_(formulas[i][0])
    ) {
      count++;
    }
  }

  return count;
}

/**
 * Ручная контрольная проверка после установки обновления.
 */
function checkPublicTeamPhotos() {
  const adminSs = SpreadsheetApp.openById(SPREADSHEET_ID);
  SpreadsheetApp.flush();

  const snapshot = buildPublicSyncSnapshot_(adminSs);
  const publicSs = SpreadsheetApp.openById(PUBLIC_SYNC_CONFIG.spreadsheetId);
  const lists = syncRequireSheet_(
    publicSs,
    PUBLIC_SYNC_CONFIG.sheets.lists,
    'публичная таблица'
  );

  const expectedTeams = snapshot.teams
    .filter(syncTeamHasPhoto_)
    .map(team => team.display);

  const values = expectedTeams.length
    ? lists.getRange(2, 10, snapshot.teams.length, 1).getValues()
    : [];
  const formulas = expectedTeams.length
    ? lists.getRange(2, 10, snapshot.teams.length, 1).getFormulas()
    : [];

  const missing = [];

  snapshot.teams.forEach((team, index) => {
    if (!syncTeamHasPhoto_(team)) return;

    const actualValue = values[index] ? values[index][0] : '';
    const actualFormula = formulas[index] ? formulas[index][0] : '';

    if (
      !syncIsCellImage_(actualValue) &&
      !syncIsImageFormula_(actualFormula)
    ) {
      missing.push(team.display);
    }
  });

  const report = {
    status: missing.length ? 'PHOTO_SYNC_MISSING' : 'PHOTO_SYNC_OK',
    photos_in_admin: expectedTeams.length,
    photos_in_public: syncCountPublicTeamPhotos_(lists, snapshot.teams.length),
    missing_teams: missing
  };

  Logger.log(JSON.stringify(report, null, 2));
  return report;
}

/** Ночной резервный перенос фото команд без перезаписи текстовых листов. */
function runNightlyPublicMediaSync() {
  const leaseOwner = publicSyncAcquireLease_();
  if (!leaseOwner) return {status: 'BUSY'};

  try {
    const capture = capturePublicSyncSnapshot_(15000, 'nightly_media');
    if (capture.status !== 'CAPTURED') {
      return {status: 'DEFERRED_SOURCE_LOCK', waited_ms: capture.waitedMs || 0};
    }

    const publicSs = SpreadsheetApp.openById(PUBLIC_SYNC_CONFIG.spreadsheetId);
    validatePublicWorkbookStructure_(publicSs);
    const synced = syncPublicTeamPhotos_(publicSs, capture.snapshot.teams);
    PropertiesService.getScriptProperties().setProperty(
      PUBLIC_SYNC_CONFIG.properties.lastPhotoSuccess,
      new Date().toISOString()
    );
    return {status: 'MEDIA_SYNCED', photos_synced: synced};
  } finally {
    publicSyncReleaseLease_(leaseOwner);
  }
}

function validatePublicWorkbookStructure_(ss) {
  const teams = syncRequireSheet_(ss, PUBLIC_SYNC_CONFIG.sheets.teams, 'публичная таблица');
  const base = syncRequireSheet_(ss, PUBLIC_SYNC_CONFIG.sheets.base, 'публичная таблица');
  const history = syncRequireSheet_(ss, PUBLIC_SYNC_CONFIG.sheets.history, 'публичная таблица');
  syncRequireSheet_(ss, PUBLIC_SYNC_CONFIG.sheets.lists, 'публичная таблица');
  syncRequireSheet_(ss, PUBLIC_SYNC_CONFIG.sheets.relations, 'публичная таблица');
  syncRequireSheet_(ss, PUBLIC_SYNC_CONFIG.sheets.search, 'публичная таблица');
  syncRequireSheet_(ss, PUBLIC_SYNC_CONFIG.sheets.card, 'публичная таблица');

  syncAssertHeaders_(teams, ['Команды', 'Участники']);

  syncEnsureGrid_(base, Math.max(base.getMaxRows(), 2), 5);
  base.getRange('E1').setValue('id тг');
  syncAssertHeaders_(
    base,
    ['Имя', 'Имя тг', 'Ссылка тг', 'Команды', 'id тг']
  );

  try {
    base.hideColumns(5, 1);
  } catch (err) {}

  syncEnsureGrid_(history, Math.max(history.getMaxRows(), 2), HISTORY_WIDTH);
  history.getRange(1, 1, 1, HISTORY_WIDTH).setValues([[
    'Дата', 'Аватар', 'Имя', 'Команда', 'Было', 'Стало', 'Добавлено',
    'Звание', 'Сообщение', 'Источник', 'Строка базы', 'Telegram ID',
    'Ключ события', 'Тип события', 'Имя для Telegram-ссылки', 'Ссылка сообщения'
  ]]);
}

function syncReplaceData_(sheet, startRow, startColumn, width, rows) {
  syncEnsureGrid_(sheet, Math.max(startRow + rows.length, 2), startColumn + width - 1);

  const clearRows = Math.max(sheet.getMaxRows() - startRow + 1, 1);
  sheet.getRange(startRow, startColumn, clearRows, width).clearContent();

  if (rows.length) {
    sheet.getRange(startRow, startColumn, rows.length, width).setValues(rows);
  }
}

/**
 * Нормализует URL исходного Telegram-сообщения для публичной истории.
 * Если функция ядра доступна, используем единое правило из 01_CORE_MAIN.gs.
 */
function syncNormalizeSpecnazMessageLink_(value) {
  if (typeof normalizeSpecnazMessageLink_ === 'function') {
    return normalizeSpecnazMessageLink_(value);
  }

  let text = String(value == null ? '' : value)
    .replace(/\u0000/g, '')
    .trim();
  if (!text || /^%[^%]+%$/.test(text)) return '';
  const href = text.match(/href\s*=\s*["']([^"']+)["']/i);
  if (href && href[1]) text = String(href[1]).trim();
  if (!/^(https?:\/\/|tg:\/\/)/i.test(text)) return '';
  return text.length > 2000 ? text.substring(0, 2000) : text;
}

/**
 * После обычного setValues переводит I в настоящий RichText.
 * URL берётся только из скрытой P, поэтому последующие синхронизации
 * могут всегда восстановить ссылку и не зависят от форматирования исходной ячейки.
 */
function syncApplyPublicHistoryMessageLinks_(sheet, rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  if (!safeRows.length) return { linked: 0, total: 0 };

  const range = sheet.getRange(2, HISTORY_COL_MESSAGE, safeRows.length, 1);
  const displayTexts = range.getDisplayValues();
  const linkStyle = SpreadsheetApp.newTextStyle()
    .setForegroundColor('#34A853')
    .setUnderline(true)
    .build();

  let linked = 0;
  const richValues = safeRows.map(function(row, index) {
    const text = String(displayTexts[index][0] || '');
    const link = syncNormalizeSpecnazMessageLink_(
      row[HISTORY_COL_MESSAGE_LINK - 1]
    );

    const builder = SpreadsheetApp.newRichTextValue().setText(text);
    if (text && link) {
      builder.setLinkUrl(link);
      builder.setTextStyle(0, text.length, linkStyle);
      linked++;
    }
    return [builder.build()];
  });

  range.setRichTextValues(richValues);
  return { linked: linked, total: safeRows.length };
}

function syncWritePublicHistory_(sheet, rows) {
  const safeRows = Array.isArray(rows) ? rows : [];

  syncEnsureGrid_(
    sheet,
    Math.max(safeRows.length + 2, 2),
    HISTORY_WIDTH
  );

  const maxRows = sheet.getMaxRows();
  const bodyRowCount = Math.max(maxRows - 1, 1);
  const area = sheet.getRange(
    2,
    1,
    bodyRowCount,
    HISTORY_WIDTH
  );

  area.breakApart();
  area.clearContent();
  area.clearFormat();

  sheet.getRange(1, 1, 1, HISTORY_WIDTH).setValues([[
    'Дата',
    'Аватар',
    'Имя',
    'Команда',
    'Было',
    'Стало',
    'Добавлено',
    'Звание',
    'Сообщение',
    'Источник',
    'Строка базы',
    'Telegram ID',
    'Ключ события',
    'Тип события',
    'Имя для Telegram-ссылки',
    'Ссылка сообщения'
  ]]);

  const titleRows = [];
  const dataRows = [];

  safeRows.forEach(function(row, index) {
    const rowNumber = index + 2;
    const isTitle = /^Спецназ с /i.test(
      clean_(row[HISTORY_COL_DATE - 1])
    );

    if (isTitle) titleRows.push(rowNumber);
    else dataRows.push(rowNumber);
  });

  if (safeRows.length) {
    sheet
      .getRange(2, 1, safeRows.length, HISTORY_WIDTH)
      .setFontFamily('Arial')
      .setFontSize(11)
      .setFontWeight('normal')
      .setFontColor(null)
      .setBackground(null);

    sheet
      .getRange(2, 1, safeRows.length, HISTORY_WIDTH)
      .setValues(safeRows);

    syncApplyPublicHistoryMessageLinks_(sheet, safeRows);
  }

  dataRows.forEach(function(rowNumber) {
    const formula =
      '=IF($L' + rowNumber +
      '="";"";IFERROR(INDEX(\'Аватары\'!$B$2:$B$999;MATCH($L' +
      rowNumber +
      ';\'Аватары\'!$A$2:$A$999;0));""))';

    sheet
      .getRange(rowNumber, HISTORY_COL_AVATAR)
      .setFormula(formula);

    sheet.setRowHeight(rowNumber, 55);
  });

  titleRows.forEach(function(rowNumber) {
    const range = sheet.getRange(
      rowNumber,
      1,
      1,
      HISTORY_VISIBLE_WIDTH
    );

    range.breakApart();
    range.merge();

    range
      .setBackground('#1F4E78')
      .setFontColor('#FFFFFF')
      .setFontFamily('Arial')
      .setFontSize(18)
      .setFontWeight('bold')
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle')
      .setWrap(true)
      .setBorder(
        true,
        true,
        true,
        true,
        false,
        false,
        '#1F4E78',
        SpreadsheetApp.BorderStyle.SOLID_THICK
      );

    sheet.setRowHeight(rowNumber, 55);
  });

  if (safeRows.length) {
    sheet
      .getRange(2, HISTORY_COL_DATE, safeRows.length, 1)
      .setNumberFormat('dd.MM.yyyy H:mm:ss');

    sheet
      .getRange(2, HISTORY_COL_OLD, safeRows.length, 3)
      .setNumberFormat('0');

    sheet
      .getRange(2, HISTORY_COL_TG_ID, safeRows.length, 1)
      .setNumberFormat('@');

    sheet
      .getRange(2, HISTORY_COL_LEGACY_TG_HELPER, safeRows.length, 2)
      .setNumberFormat('@');

    sheet
      .getRange(2, HISTORY_COL_NAME, safeRows.length, 2)
      .setWrap(true)
      .setVerticalAlignment('middle');

    sheet
      .getRange(2, HISTORY_COL_MESSAGE, safeRows.length, 1)
      .setWrap(true)
      .setVerticalAlignment('top');
  }

  sheet.setFrozenRows(1);
  sheet.setColumnWidth(HISTORY_COL_DATE, 145);
  sheet.setColumnWidth(HISTORY_COL_AVATAR, 74);
  sheet.setColumnWidth(HISTORY_COL_NAME, 285);
  sheet.setColumnWidth(HISTORY_COL_TEAM, 320);
  sheet.setColumnWidths(HISTORY_COL_OLD, 3, 74);
  sheet.setColumnWidth(HISTORY_COL_RANK, 125);
  sheet.setColumnWidth(HISTORY_COL_MESSAGE, 420);
  sheet.setColumnWidth(HISTORY_COL_LEGACY_TG_HELPER, 200);
  sheet.setColumnWidth(HISTORY_COL_MESSAGE_LINK, 240);

  try {
    sheet.showColumns(1, HISTORY_VISIBLE_WIDTH);
    sheet.hideColumns(
      HISTORY_COL_SOURCE,
      HISTORY_WIDTH - HISTORY_COL_SOURCE + 1
    );
  } catch (err) {}

  syncApplyPublicHistoryConditionalFormatting_(sheet);
}

function prepareSpecnazMessageLinksV1() {
  const adminSs = SpreadsheetApp.openById(SPREADSHEET_ID);
  const publicSs = SpreadsheetApp.openById(PUBLIC_SYNC_CONFIG.spreadsheetId);
  const adminHistory = syncRequireSheet_(adminSs, SHEET_HISTORY, 'админская таблица');
  const publicHistory = syncRequireSheet_(publicSs, PUBLIC_SYNC_CONFIG.sheets.history, 'публичная таблица');

  if (typeof prepareAdminSpecnazMessageLinksV1 === 'function') {
    prepareAdminSpecnazMessageLinksV1();
  } else {
    ensureHistoryStructure_(adminHistory);
  }

  syncEnsureGrid_(publicHistory, Math.max(publicHistory.getMaxRows(), 2), HISTORY_WIDTH);
  publicHistory.getRange(1, HISTORY_COL_LEGACY_TG_HELPER)
    .setValue('Имя для Telegram-ссылки')
    .setFontWeight('bold')
    .setBackground('#9CC2E5');
  publicHistory.getRange(1, HISTORY_COL_MESSAGE_LINK)
    .setValue('Ссылка сообщения')
    .setFontWeight('bold')
    .setBackground('#9CC2E5');
  publicHistory.getRange('O:P').setNumberFormat('@');
  publicHistory.setColumnWidth(HISTORY_COL_LEGACY_TG_HELPER, 200);
  publicHistory.setColumnWidth(HISTORY_COL_MESSAGE_LINK, 240);

  try {
    publicHistory.showColumns(1, HISTORY_VISIBLE_WIDTH);
    publicHistory.hideColumns(HISTORY_COL_SOURCE, HISTORY_WIDTH - HISTORY_COL_SOURCE + 1);
  } catch (err) {}

  const lastRow = Math.max(publicHistory.getLastRow(), 1);
  let publicLinked = 0;
  let publicStoredLinks = 0;

  if (lastRow >= 2) {
    const rowCount = lastRow - 1;
    const rows = publicHistory.getRange(2, 1, rowCount, HISTORY_WIDTH).getValues();

    rows.forEach(function(row, index) {
      const rowNumber = index + 2;
      if (/^Спецназ с /i.test(clean_(row[HISTORY_COL_DATE - 1]))) return;

      const link = syncNormalizeSpecnazMessageLink_(
        row[HISTORY_COL_MESSAGE_LINK - 1]
      );
      if (!link) return;
      publicStoredLinks++;

      const cell = publicHistory.getRange(rowNumber, HISTORY_COL_MESSAGE);
      const text = String(cell.getDisplayValue() || '');
      if (!text) return;

      const linkStyle = SpreadsheetApp.newTextStyle()
        .setForegroundColor('#34A853')
        .setUnderline(true)
        .build();
      const rich = SpreadsheetApp.newRichTextValue()
        .setText(text)
        .setLinkUrl(link)
        .setTextStyle(0, text.length, linkStyle)
        .build();
      cell.setRichTextValue(rich);
      publicLinked++;
    });
  }

  const result = {
    status: 'OK',
    public_sync_version: '6.2.0',
    history_width: HISTORY_WIDTH,
    hidden_link_column: 'P',
    public_stored_links: publicStoredLinks,
    public_linked_messages: publicLinked,
    full_sync_run: false,
    triggers_changed: false
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}

/**
 * Проверка ссылок сообщений без изменения данных.
 * Сравнивает скрытую P с реальной RichText-ссылкой в видимой I
 * отдельно в админской и публичной истории.
 */
function checkSpecnazMessageLinksV1() {
  const adminSs = SpreadsheetApp.openById(SPREADSHEET_ID);
  const publicSs = SpreadsheetApp.openById(PUBLIC_SYNC_CONFIG.spreadsheetId);

  function audit_(ss, label) {
    const sheet = syncRequireSheet_(ss, SHEET_HISTORY, label);
    const lastRow = Math.max(sheet.getLastRow(), 1);
    let storedLinks = 0;
    let expectedLinks = 0;
    let linkedMessages = 0;
    const issues = [];

    for (let row = 2; row <= lastRow; row++) {
      const title = clean_(sheet.getRange(row, HISTORY_COL_DATE).getDisplayValue());
      if (/^Спецназ с /i.test(title)) continue;

      const link = syncNormalizeSpecnazMessageLink_(
        sheet.getRange(row, HISTORY_COL_MESSAGE_LINK).getDisplayValue()
      );
      if (!link) continue;
      storedLinks++;

      const messageCell = sheet.getRange(row, HISTORY_COL_MESSAGE);
      const text = String(messageCell.getDisplayValue() || '');
      if (!text) {
        issues.push(sheet.getName() + '!I' + row + ': ссылка есть, текст сообщения пуст');
        continue;
      }

      expectedLinks++;
      const rich = messageCell.getRichTextValue();
      const actual = rich ? String(rich.getLinkUrl() || '') : '';
      if (actual === link) {
        linkedMessages++;
      } else {
        issues.push(sheet.getName() + '!I' + row + ': RichText URL не совпадает с P' + row);
      }
    }

    return {
      stored_links: storedLinks,
      expected_links: expectedLinks,
      linked_messages: linkedMessages,
      issues: issues
    };
  }

  const admin = audit_(adminSs, 'админская таблица');
  const publicResult = audit_(publicSs, 'публичная таблица');
  const issues = admin.issues.concat(publicResult.issues);

  const result = {
    status: issues.length ? 'ISSUES' : 'OK',
    public_sync_version: '6.2.0',
    admin: admin,
    public: publicResult,
    issues: issues
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}

function syncApplyPublicHistoryConditionalFormatting_(sheet) {
  const rankRange = sheet.getRange('H2:H' + sheet.getMaxRows());
  const ranks = [
    ['Новичок', '#F27F7F', '#000000', false],
    ['Начинающий', '#F99977', '#000000', false],
    ['Узнаваемый', '#FCB277', '#000000', false],
    ['Известный', '#FFCC77', '#000000', false],
    ['Знаменитый', '#FFE677', '#000000', false],
    ['Выдающийся', '#EAEE77', '#000000', false],
    ['Маэстро', '#C6EA77', '#000000', false],
    ['Величайший', '#A5E277', '#000000', false],
    ['Бессмертный', '#87DB77', '#000000', false],
    ['Легендарный', '#63D177', '#000000', false],
    ['БОГ СПЕЦНАЗА', '#2DB259', '#FFFFFF', true]
  ];

  const rules = ranks.map(item => {
    let builder = SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$H2="' + item[0] + '"')
      .setBackground(item[1])
      .setFontColor(item[2]);
    if (item[3]) builder = builder.setBold(true);
    return builder.setRanges([rankRange]).build();
  });
  sheet.setConditionalFormatRules(rules);
}

function syncApplyPublicTeamColors_(sheet, teamCount) {
  if (teamCount <= 0) return;

  const values = sheet.getRange(2, 1, teamCount, 1).getDisplayValues();
  const rm = [];
  const rk = [];

  // Участники всегда остаются без цветовой подложки.
  sheet.getRange(2, 2, teamCount, 1)
    .setBackground('#FFFFFF')
    .setFontColor('#000000');

  values.forEach((row, index) => {
    const number = index + 2;

    // Окрашивается только ячейка с названием команды в столбце A.
    if (/\s+—\s+РК$/.test(row[0])) rk.push('A' + number);
    else rm.push('A' + number);
  });

  if (rm.length) {
    sheet.getRangeList(rm).setBackground('#DDEEFF').setFontColor('#0033CC');
  }
  if (rk.length) {
    sheet.getRangeList(rk).setBackground('#FFE5E5').setFontColor('#CC0000');
  }
}

/**
 * Поддерживает выпадающий список карточки команды в том же порядке,
 * что и в админской таблице: НЕТ КОМАНДЫ, затем полный display команды
 * по алфавиту с эмодзи и суффиксом РМ/РК.
 * Служебный список хранится в скрытом столбце R листа «Списки».
 */
function syncEnsurePublicCardTeamDropdown_(ss) {
  const lists = ss.getSheetByName(PUBLIC_SYNC_CONFIG.sheets.lists);
  const teams = ss.getSheetByName(PUBLIC_SYNC_CONFIG.sheets.teams);
  const card = ss.getSheetByName(PUBLIC_SYNC_CONFIG.sheets.card);
  if (!lists || !teams || !card) return;

  syncEnsureGrid_(lists, Math.max(lists.getMaxRows(), 1000), 18);
  lists.getRange('R1').setValue('Команды для карточки');
  lists.getRange('R2:R999').clearContent();
  lists.getRange('R2').setFormula(
    '={"НЕТ КОМАНДЫ";SORT(FILTER(\'Команды\'!A2:A999;\'Команды\'!A2:A999<>"");1;TRUE)}'
  );

  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(lists.getRange('R2:R999'), true)
    .setAllowInvalid(false)
    .setHelpText('Выберите команду')
    .build();

  card.getRange('B2').setDataValidation(rule);

  try {
    lists.hideColumns(18, 1);
  } catch (err) {}
}

function syncKeepValidCardSelection_(ss, teams) {
  const card = ss.getSheetByName(PUBLIC_SYNC_CONFIG.sheets.card);
  if (!card) return;

  const allowed = { 'НЕТ КОМАНДЫ': true };
  teams.forEach(team => allowed[team.display] = true);

  const cell = card.getRange('B2');
  const current = clean_(cell.getDisplayValue());
  if (current && allowed[current]) return;

  cell.setValue(teams.length ? teams[0].display : '');
}

function verifyPublicSync_(publicSs, snapshot) {
  const teams = publicSs.getSheetByName(PUBLIC_SYNC_CONFIG.sheets.teams);
  const base = publicSs.getSheetByName(PUBLIC_SYNC_CONFIG.sheets.base);
  const lists = publicSs.getSheetByName(PUBLIC_SYNC_CONFIG.sheets.lists);

  const checks = [
    [
      'Команды',
      syncCountMatchingTextRows_(teams, 2, 1, snapshot.publicTeams),
      snapshot.publicTeams.length
    ],
    [
      'База участников',
      syncCountMatchingTextRows_(base, 2, 1, snapshot.publicBase),
      snapshot.publicBase.length
    ],
    [
      'Списки',
      syncCountNonEmpty_(lists, 2, 4, snapshot.relations.length),
      snapshot.relations.length
    ],
    [
      'Фото команд',
      syncCountPublicTeamPhotos_(lists, snapshot.teams.length),
      snapshot.teams.filter(syncTeamHasPhoto_).length
    ]
  ];

  const failed = checks.filter(item => item[1] !== item[2]);
  if (failed.length) {
    throw new Error('PUBLIC_SYNC_VERIFY_FAILED: ' + failed.map(item =>
      item[0] + ' совпало строк ' + item[1] + ', ожидалось ' + item[2]
    ).join('; '));
  }
}

/**
 * Проверяет фактически записанные строки целиком.
 * Пустое поле «Имя» допустимо, если остальные поля строки записаны правильно.
 */
function syncCountMatchingTextRows_(sheet, startRow, startColumn, expectedRows) {
  if (!expectedRows || !expectedRows.length) return 0;

  const width = expectedRows.reduce(
    (maxWidth, row) => Math.max(maxWidth, row.length),
    1
  );

  const actualRows = sheet
    .getRange(startRow, startColumn, expectedRows.length, width)
    .getDisplayValues();

  let matching = 0;

  expectedRows.forEach((expectedRow, rowIndex) => {
    const actualRow = actualRows[rowIndex] || [];
    let equal = true;

    for (let columnIndex = 0; columnIndex < width; columnIndex++) {
      const expectedValue = syncComparableText_(
        columnIndex < expectedRow.length ? expectedRow[columnIndex] : ''
      );
      const actualValue = syncComparableText_(actualRow[columnIndex]);

      if (expectedValue !== actualValue) {
        equal = false;
        break;
      }
    }

    if (equal) matching++;
  });

  return matching;
}

function syncComparableText_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      'dd.MM.yyyy H:mm:ss'
    );
  }

  return clean_(value);
}

function syncCountNonEmpty_(sheet, startRow, column, expectedRows) {
  if (!expectedRows) return 0;
  return sheet.getRange(startRow, column, expectedRows, 1)
    .getDisplayValues()
    .filter(row => clean_(row[0]) !== '')
    .length;
}

function ensurePublicSyncLogSheet_(adminSs) {
  let sheet = adminSs.getSheetByName(PUBLIC_SYNC_CONFIG.sheets.log);
  if (!sheet) sheet = adminSs.insertSheet(PUBLIC_SYNC_CONFIG.sheets.log);

  const headers = [
    'Дата', 'Версия', 'Режим', 'Статус', 'Причина', 'Команд', 'Участников',
    'Связей', 'Строк истории', 'Предупреждения', 'Ошибки', 'Хэш', 'Время, мс'
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  if (!sheet.isSheetHidden()) sheet.hideSheet();
  return sheet;
}

function appendPublicSyncLog_(adminSs, report) {
  const sheet = ensurePublicSyncLogSheet_(adminSs);
  sheet.appendRow([
    new Date(),
    CRM_VERSION,
    report.mode || '',
    report.status || '',
    report.reason || '',
    report.teams || 0,
    report.participants || 0,
    report.relations || 0,
    report.history_rows || 0,
    syncJoinLogMessages_(report.warnings),
    syncJoinLogMessages_(report.errors || (report.message ? [report.message] : [])),
    report.hash || '',
    report.duration_ms || 0
  ]);
  sheet.getRange(sheet.getLastRow(), 1).setNumberFormat('dd.MM.yyyy H:mm:ss');
}

function publicSyncReport_(snapshot, status) {
  return {
    status: status,
    mode: status === 'DRY_RUN' ? 'DRY_RUN' : 'WRITE',
    version: CRM_VERSION,
    teams: snapshot.teams.length,
    participants: snapshot.participants.length,
    relations: snapshot.relations.length,
    history_rows: snapshot.history.length,
    photos_in_admin: snapshot.teams.filter(syncTeamHasPhoto_).length,
    avatar_module_connected:
      typeof queueMissingTelegramAvatarsFromParticipants_ === 'function',
    warnings: snapshot.validation.warnings.slice(),
    errors: snapshot.validation.errors.slice(),
    hash: snapshot.hash
  };
}

function computePublicComponentHashes_(snapshot) {
  return {
    teams: computePublicHashValue_(snapshot.publicTeams),
    base: computePublicHashValue_(snapshot.publicBase),
    lists: computePublicHashValue_(snapshot.publicLists),
    relations: computePublicHashValue_(snapshot.publicRelations),
    history: computePublicHashValue_(snapshot.history)
  };
}

function computePublicHashValue_(value) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    JSON.stringify(value || []),
    Utilities.Charset.UTF_8
  );
  return digest.map(function(byte) {
    return ('0' + (((byte + 256) % 256).toString(16))).slice(-2);
  }).join('');
}

function computePublicSyncHash_(snapshot) {
  const payload = JSON.stringify({
    teams: snapshot.publicTeams,
    base: snapshot.publicBase,
    lists: snapshot.publicLists,
    relations: snapshot.publicRelations,
    history: snapshot.history
  });
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    payload,
    Utilities.Charset.UTF_8
  );
  return digest.map(byte => ('0' + (((byte + 256) % 256).toString(16))).slice(-2)).join('');
}

function syncRelationSort_(a, b) {
  const priority = { 'Лидер': 1, 'Помощник': 2, 'Игрок': 3 };
  const p1 = priority[a.role] || 9;
  const p2 = priority[b.role] || 9;
  if (p1 !== p2) return p1 - p2;

  return syncPublicMemberLabel_(a).localeCompare(syncPublicMemberLabel_(b), 'ru');
}

function syncPublicMemberLabel_(relation) {
  const identity = relation.username || relation.tgName || relation.name || relation.tgId || 'Без имени';
  if (relation.role === 'Лидер') return identity + ' - лидер';
  if (relation.role === 'Помощник') return identity + ' - помощник';
  return identity;
}

function syncParticipantKey_(tgId, username, rowNumber) {
  if (tgId) return 'id:' + tgId;
  if (username) return 'user:' + username.toLowerCase();
  return 'row:' + rowNumber;
}

function syncParticipantKeyLabel_(tgId, username) {
  if (tgId) return 'Telegram ID ' + tgId;
  if (username) return username;
  return 'без Telegram ID и @username';
}

function syncTeamKey_(game, team) {
  return game + '\u001F' + syncTextKey_(team);
}

function syncTextKey_(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function syncStripTeamSuffix_(value) {
  // Принимает варианты с пробелами и без них:
  // «Команда — РМ», «Команда— РМ», «Команда-РМ».
  return clean_(value)
    .replace(/\s*[-–—]\s*(РМ|РК)\s*$/i, '')
    .trim();
}

function syncGameFromTeamSuffix_(value) {
  const text = clean_(value);

  // Допускаются дефис, короткое и длинное тире,
  // а также любое количество пробелов вокруг разделителя.
  if (/\s*[-–—]\s*РМ\s*$/i.test(text)) return 'Royal Match';
  if (/\s*[-–—]\s*РК\s*$/i.test(text)) return 'Royal Kingdom';

  return '';
}

function syncGameSuffix_(game) {
  return game === 'Royal Kingdom' ? 'РК' : 'РМ';
}

function syncHeaderMap_(headers) {
  const map = {};
  headers.forEach((value, index) => {
    const key = syncTextKey_(value);
    if (key) map[key] = index;
  });
  return map;
}

function syncRequiredHeaderIndex_(map, header, sheetName) {
  const index = syncOptionalHeaderIndex_(map, header);
  if (index < 0) {
    throw new Error('В листе «' + sheetName + '» не найден обязательный столбец «' + header + '»');
  }
  return index;
}

function syncOptionalHeaderIndex_(map, header) {
  const key = syncTextKey_(header);
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : -1;
}

function syncRequireSheet_(ss, name, location) {
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('В ' + location + ' отсутствует лист «' + name + '»');
  return sheet;
}

function syncAssertHeaders_(sheet, expected) {
  const actual = sheet.getRange(1, 1, 1, expected.length).getDisplayValues()[0];
  expected.forEach((header, index) => {
    if (syncTextKey_(actual[index]) !== syncTextKey_(header)) {
      throw new Error(
        'Публичный лист «' + sheet.getName() + '»: в ' + columnToLetter_(index + 1) +
        '1 ожидался заголовок «' + header + '», найдено «' + actual[index] + '»'
      );
    }
  });
}

function syncEnsureGrid_(sheet, rows, columns) {
  if (sheet.getMaxRows() < rows) {
    sheet.insertRowsAfter(sheet.getMaxRows(), rows - sheet.getMaxRows());
  }
  if (sheet.getMaxColumns() < columns) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), columns - sheet.getMaxColumns());
  }
}

function syncJoinLogMessages_(messages) {
  return (messages || []).join('\n').slice(0, 45000);
}

/**
 * Единственная установочная функция для этого файла.
 * Не трогает webhook-развёртывание и не запускает setup/upgrade.
 */
function installPublicSyncV60Stable() {
  const handlersToDelete = [
    PUBLIC_SYNC_CHANGE_HANDLER,
    'handlePublicCardEdit'
  ];

  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (handlersToDelete.indexOf(trigger.getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger(PUBLIC_SYNC_CHANGE_HANDLER)
    .forSpreadsheet(SPREADSHEET_ID)
    .onChange()
    .create();

  return {
    status: 'PUBLIC_SYNC_V6_INSTALLED',
    version: '6.0.0',
    on_change_handler: PUBLIC_SYNC_CHANGE_HANDLER,
    next_step: 'Запустите installRoyalCrmPublicRecovery из файла 08_TELEGRAM_NAME_LINKS.gs'
  };
}


