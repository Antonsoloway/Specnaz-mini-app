/**
 * ROYAL CRM v2.2.6 / OPTIMIZED V5.8 — ссылки на исходные сообщения спецназа.
 * Полная замена Apps Script для админской таблицы Royal CRM.
 *
 * V5.8 (2026-08-09):
 *   1) принимает reply_message_link из ChatKeeper;
 *   2) хранит URL в скрытой колонке P «Ссылка сообщения», не занимая старый helper O;
 *   3) делает видимый текст «Сообщение» в I кликабельным RichText;
 *   4) не сдвигает существующие технические J:N и не меняет eventKey;
 *   5) сохраняет временное правило reputation: каждый новый уникальный триггер = +1.
 *
 * V5.3: безопасный разбор многострочного reply_message из ChatKeeper.
 * V5.4: история спецназа добавляет строки по фактическим данным, а не по формулам аватаров.
 * V5.5:
 *   1) раскрытие/сворачивание групп столбцов (changeType OTHER) больше не запускает
 *      полное восстановление старых формул;
 *   2) restoreCoreFormulas_ восстанавливает актуальную структуру с аватарами:
 *      поиск — данные с B6, аватары в A, запрос из B3;
 *      карточка — данные с B15, аватары в A, Telegram ID в скрытом I;
 *   3) формулы поиска и карточки больше не откатываются после структурных событий.
 *
 * УСТАНОВКА:
 * 1) полностью заменить содержимое файла 01_CORE_MAIN.gs;
 * 2) файл 05_RELIABLE_WEBHOOK_QUEUE.gs оставить на месте; внешний doPost находится там;
 * 3) сохранить Apps Script;
 * 4) обновить СУЩЕСТВУЮЩЕЕ веб-развёртывание: карандаш -> Новая версия;
 * 5) setup/upgrade-функции НЕ запускать. URL вебхуков не менять.
 */

const CRM_VERSION = '2.2.6';
const COMPATIBLE_STRUCTURE_VERSIONS = ['2.0.0', '2.0.1', '2.0.2', '2.1', '2.1.1', '2.2', '2.2.0', '2.2.1', '2.2.2', '2.2.3', '2.2.4', '2.2.5', '2.2.6'];
const SPREADSHEET_ID = '1kkADcKysWdoGy95O36z9jCaoGUUHN0g4XH4LwVtAK_o';
const CHATKEEPER_WEBHOOK_SECRET_PROPERTY = 'ROYAL_CRM_CHATKEEPER_WEBHOOK_SECRET';

const SHEET_BASE = 'База участников';
const SHEET_TEAMS = 'Команды';
const SHEET_CONNECTIONS = 'Связи участников';
const SHEET_SEARCH = 'Поиск';
const SHEET_TEAM_RATING = 'Рейтинг команд';
const SHEET_PLAYER_RATING = 'Рейтинг игроков';
const SHEET_TEAM_CARD = 'Карточка команды';
const SHEET_HISTORY = 'История спецназа';
const SHEET_LOG = 'Лог вебхуков';
const SHEET_ACTIVITY_LOG = 'Лог активности';
const SHEET_PROCESSED = 'Обработанные события';
const SHEET_SNAPSHOT = 'Снимок счётчиков';

const PROPERTY_STRUCTURE_VERSION = 'ROYAL_CRM_STRUCTURE_VERSION';
const MAINTENANCE_HANDLER = 'weeklyRoyalCrmMaintenance';
const CHANGE_HANDLER = 'handleSpreadsheetChange';
const LEGACY_SPECNAZ_HANDLER = 'addCurrentSpecnazPeriodDivider';

const SPECNAZ_TIME_ZONE = 'Europe/Moscow';
const SPECNAZ_PERIOD_ANCHOR_UTC = Date.UTC(2026, 6, 10, 8, 0, 0); // 10.07.2026 11:00 МСК
const SPECNAZ_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const SPECNAZ_END_OFFSET_MS = 3 * 24 * 60 * 60 * 1000;
const PROCESSED_RETENTION_DAYS = 30;

// База участников
const COL_NAME = 1;              // A
const COL_TG_NAME = 2;           // B
const COL_TG_USERNAME = 3;       // C — только @username
const COL_TG_ID = 4;             // D — только цифровой Telegram ID
const COL_STATUS = 20;           // T — формула
const COL_SPECNAZ = 21;          // U
const COL_DATE = 22;             // V
const COL_GAME_1 = 23;           // W — формула
const COL_GAME_5 = 27;           // AA — формула
const COL_SCREENS = 28;          // AB
const COL_ACTIVITY_BASE = 29;    // AC
const COL_ACTIVITY_OUTSIDE = 30; // AD
const COL_LAST_CHANGE = 31;      // AE
const COL_CHAT_STATE = 32;       // AF
const COL_SORT_GROUP = 33;       // AG — временный ключ сортировки
const COL_SORT_ORDER = 34;       // AH — временный исходный порядок
const BASE_FIRST_ROW = 2;
const BASE_LAST_ROW = 999;


// История спецназа: A:I видимые, J:P технические. O зарезервирован под старый helper Telegram-ссылок.
const HISTORY_COL_DATE = 1;       // A
const HISTORY_COL_AVATAR = 2;     // B
const HISTORY_COL_NAME = 3;       // C — Имя, Имя тг, @username
const HISTORY_COL_TEAM = 4;       // D — все команды через запятую
const HISTORY_COL_OLD = 5;        // E
const HISTORY_COL_NEW = 6;        // F
const HISTORY_COL_ADDED = 7;      // G
const HISTORY_COL_RANK = 8;       // H
const HISTORY_COL_MESSAGE = 9;    // I
const HISTORY_COL_SOURCE = 10;    // J — технический
const HISTORY_COL_BASE_ROW = 11;  // K — технический
const HISTORY_COL_TG_ID = 12;     // L — технический
const HISTORY_COL_EVENT_KEY = 13; // M — технический
const HISTORY_COL_EVENT_TYPE = 14;// N — технический
const HISTORY_COL_LEGACY_TG_HELPER = 15; // O — старый helper «Имя для Telegram-ссылки», оставляем зарезервированным
const HISTORY_COL_MESSAGE_LINK = 16; // P — URL исходного сообщения Telegram
const HISTORY_WIDTH = 16;
const HISTORY_VISIBLE_WIDTH = 9;

const ROLE_TEAM = ['Лидер', 'Помощник', 'Игрок'];
const ROLE_SPECNAZ = ['Спецназ РМ', 'Спецназ РК'];
const ROLE_ALL = ROLE_TEAM.concat(ROLE_SPECNAZ);

const SLOT_DEFS = [
  { number: 1, teamCol: 5,  nickCol: 6,  roleCol: 7,  gameCol: 23 },
  { number: 2, teamCol: 8,  nickCol: 9,  roleCol: 10, gameCol: 24 },
  { number: 3, teamCol: 11, nickCol: 12, roleCol: 13, gameCol: 25 },
  { number: 4, teamCol: 14, nickCol: 15, roleCol: 16, gameCol: 26 },
  { number: 5, teamCol: 17, nickCol: 18, roleCol: 19, gameCol: 27 }
];

// Стабильные зависимые списки ролей для мобильного Google Sheets.
// Правило выпадающего списка не меняется при редактировании: каждая роль
// постоянно смотрит на собственные три служебные ячейки строки на листе «Списки».
const ROLE_HELPER_SHEET = 'Списки';
const ROLE_HELPER_FIRST_COL = 3; // C
const ROLE_HELPER_WIDTH_PER_SLOT = 3;
const NO_TEAM_OPTION = 'НЕТ КОМАНДЫ';

function doGet(e) {
  // Telegram Mini App UI: HtmlService на том же Apps Script, без CORS/JSONP.
  if (
    e && e.parameter &&
    String(e.parameter.miniappui || '') === '1' &&
    typeof MINIAPP_renderUi_ === 'function'
  ) {
    return MINIAPP_renderUi_();
  }

  // Telegram Mini App API: только polling-ветка; обычный health-check сохранён.
  if (
    e && e.parameter &&
    String(e.parameter.miniapp || '') === '1' &&
    typeof MINIAPP_doGet_ === 'function'
  ) {
    return MINIAPP_doGet_(e);
  }

  return ContentService
    .createTextOutput('Royal CRM webhook v' + CRM_VERSION + ' is alive')
    .setMimeType(ContentService.MimeType.TEXT);
}

/**
 * ChatKeeper webhook authentication is runtime-only configuration. A missing
 * or unreadable Script Property must reject the request; source fallbacks are
 * intentionally forbidden because this repository is public.
 */
function chatKeeperWebhookSecret_() {
  try {
    return clean_(
      PropertiesService.getScriptProperties()
        .getProperty(CHATKEEPER_WEBHOOK_SECRET_PROPERTY)
    );
  } catch (err) {
    return '';
  }
}

function isValidChatKeeperWebhookSecret_(providedSecret) {
  const configuredSecret = chatKeeperWebhookSecret_();
  return !!configuredSecret && clean_(providedSecret) === configuredSecret;
}

/**
 * Внутренняя обработка одного webhook после извлечения из надёжной очереди.
 * Внешняя doPost(e) должна оставаться ТОЛЬКО в 05_RELIABLE_WEBHOOK_QUEUE.gs.
 *
 * ВАЖНО: это также восстанавливает совместимость с очередью после временного
 * ядра V5.7, в котором doPost случайно снова оказался внутри 01_CORE_MAIN.gs.
 */
function processWebhookImmediately_(e) {
  const raw = e && e.postData && e.postData.contents
    ? String(e.postData.contents)
    : '';

  let ss = null;
  let data = null;
  let event = '';
  let eventKey = '';
  let logRef = null;
  let result = null;
  let player = null;
  let lock = null;
  let mutationStarted = false;
  let avatarRequest = null;

  try {
    data = parseIncoming_(raw);
    event = normalizeEvent_(data);
    eventKey = buildEventKey_(event, raw, data);
    ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    logRef = startWebhookLog_(ss, event, eventKey, raw, data);

    if (!isValidChatKeeperWebhookSecret_(data.secret)) {
      result = { status: 'WRONG_SECRET' };
    } else if (!isRoyalCrmV2Ready_(ss)) {
      result = {
        status: 'SETUP_REQUIRED',
        hint: 'Один раз вручную запустите setupRoyalCrmV2()'
      };
    } else {
      lock = LockService.getScriptLock();

      // Запрос уже сохранён очередью, поэтому при занятой базе возвращаем RETRY.
      if (!lock.tryLock(2500)) {
        result = {
          status: 'RETRY_LOCKED',
          event: event,
          event_key: eventKey,
          message: 'Основная база временно занята другой короткой транзакцией'
        };
      } else if (isProcessedEvent_(ss, eventKey)) {
        result = {
          status: 'DUPLICATE_IGNORED',
          event: event,
          event_key: eventKey
        };
      } else {
        player = parsePlayer_(ss, data, event);

        if (typeof beginPublicDataMutation_ === 'function') {
          beginPublicDataMutation_('webhook:' + event);
          mutationStarted = true;
        }

        result = processWebhook_(ss, player, eventKey);

        if (result.status !== 'ERROR' && result.status !== 'RETRY_LOCKED') {
          // AUDIT_V2_BOT_HOOK
          // processWebhook_ owns all ChatKeeper participant mutations and this
          // execution already holds ScriptLock. Reconcile exact source fields
          // against the protected baseline before the event is marked done.
          // Duplicate/wrong-secret/lock-retry paths never reach this branch;
          // validation-only outcomes create no event because there is no diff.
          if (typeof MINIAPP_auditV2Reconcile_ === 'function') {
            try {
              const botAudit = MINIAPP_auditV2Reconcile_(ss, {
                lockAlreadyHeld: true,
                source: {
                  type: 'bot', channel: 'chatkeeper-webhook',
                  label: 'Бот / ChatKeeper'
                },
                actor: {
                  type: 'service', telegramId: '', username: '', displayName: '',
                  label: 'Бот'
                },
                transactionId: 'webhook:' + eventKey,
                metadata: {
                  event: event,
                  eventKey: eventKey,
                  resultStatus: String(result.status || ''),
                  exactBefore: 'protected-baseline'
                }
              });
              if (botAudit && botAudit.ok === false) {
                console.warn('Webhook audit reconcile warning: ' + String(botAudit.error || 'UNKNOWN'));
              }
            } catch (auditError) {
              console.warn('Webhook audit hook failed: ' + String(auditError && auditError.message || auditError));
            }
          }

          markProcessedEvent_(
            ss,
            eventKey,
            event,
            result.tg_id || player.tgId || '',
            result.status
          );

          markPublicSyncPending_(
            'webhook:' + event + ':' + result.status
          );

          if (
            typeof queueTelegramAvatarRefresh_ === 'function' &&
            (
              event === 'join' ||
              result.created === true ||
              result.status === 'PLAYER_CREATED'
            )
          ) {
            avatarRequest = {
              tgId: result.tg_id || player.tgId || '',
              reason: 'webhook:' + event + ':' + result.status
            };
          }
        }
      }
    }

  } catch (err) {
    result = {
      status: 'ERROR',
      message: String(err && err.stack ? err.stack : err)
    };

  } finally {
    if (mutationStarted && typeof finishPublicDataMutation_ === 'function') {
      try {
        finishPublicDataMutation_(
          result && result.status === 'ERROR'
            ? 'webhook_error:' + event
            : 'webhook:' + event + ':' + (result ? result.status : 'UNKNOWN')
        );
      } catch (mutationError) {}
    }

    if (lock) {
      try {
        lock.releaseLock();
      } catch (releaseError) {}
    }

    if (avatarRequest) {
      try {
        queueTelegramAvatarRefresh_(avatarRequest.tgId, avatarRequest.reason);
      } catch (avatarQueueError) {}
    }

    if (logRef) {
      try {
        finishWebhookLog_(logRef, result || { status: 'UNKNOWN' });
      } catch (logError) {}
    }
  }

  return json_(result || { status: 'UNKNOWN' });
}

/**
 * ОДНОРАЗОВАЯ ИДЕМПОТЕНТНАЯ ПОДГОТОВКА.
 * Запустить вручную после замены кода.
 */
function setupRoyalCrmV2() {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000);

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    ensureMinimumGridSizes_(ss);
    ensureAuxiliarySheets_(ss);
    prepareLogSheets_(ss);
    migrateTelegramIdentityColumns_(ss);
    migrateLegacyRoles_(ss);
    restoreCoreFormulas_(ss);
    sortBaseByChatState_(ss);
    applyAllRoleValidations_(ss);
    migrateHistoryToTelegramIds_(ss);
    rebuildCounterSnapshot_(ss);
    cleanupTeamsConditionalFormatting_(ss);
    ensureHistoryConditionalFormatting_(ss);
    protectFormulaColumns_(ss);
    hideTechnicalColumnsAndSheets_(ss);
    ensurePublicSyncLogSheet_(ss);
    installRoyalCrmTriggers_();
    markPublicSyncPending_('setup');

    PropertiesService.getScriptProperties()
      .setProperty(PROPERTY_STRUCTURE_VERSION, CRM_VERSION);

    SpreadsheetApp.flush();

    Logger.log('Royal CRM v' + CRM_VERSION + ' подготовлена.');
    return {
      status: 'OK',
      version: CRM_VERSION
    };

  } finally {
    try {
      lock.releaseLock();
    } catch (err) {}
  }
}

/**
 * Еженедельное обслуживание: удаление старых ключей, восстановление формул,
 * снимка счётчиков и удаление пустых разделителей истории.
 */
function weeklyRoyalCrmMaintenance() {
  const lock = LockService.getScriptLock();
  let mutationStarted = false;

  try {
    /* Ночной процесс не ждёт 30 секунд: очередь webhook при этом не теряет события. */
    if (!lock.tryLock(5000)) {
      return { status: 'SKIPPED_LOCKED' };
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    if (typeof beginPublicDataMutation_ === 'function') {
      beginPublicDataMutation_('weekly_maintenance');
      mutationStarted = true;
    }

    cleanupProcessedEvents_(ss);
    ensureMinimumGridSizes_(ss);
    restoreCoreFormulas_(ss);
    sortBaseByChatState_(ss);
    rebuildCounterSnapshot_(ss);
    removeEmptySpecnazDividers_(ss.getSheetByName(SHEET_HISTORY));
      hideTechnicalColumnsAndSheets_(ss);
    if (typeof MINIAPP_auditV2Reconcile_ === 'function') {
      try {
        MINIAPP_auditV2Reconcile_(ss, {
          lockAlreadyHeld: true,
          source: {
            type: 'system', channel: 'weekly-maintenance',
            label: 'Еженедельное обслуживание'
          },
          actor: {
            type: 'system', telegramId: '', username: '', displayName: '',
            label: 'Система'
          },
          transactionId: 'weekly_maintenance:' + Utilities.getUuid(),
          metadata: {
            maintenance: 'weekly',
            exactBefore: 'protected-baseline',
            formulaOnlyChangesExcluded: true
          }
        });
      } catch (auditError) {
        console.warn('Weekly maintenance audit warning: ' + String(auditError && auditError.message || auditError));
      }
    }
    markPublicSyncPending_('weekly_maintenance');

    SpreadsheetApp.flush();
    return { status: 'OK' };
  } finally {
    if (mutationStarted && typeof finishPublicDataMutation_ === 'function') {
      try { finishPublicDataMutation_('weekly_maintenance'); } catch (err) {}
    }
    try { lock.releaseLock(); } catch (err) {}
  }
}

/**
 * Установочный onChange. Поддерживает удаление/вставку строк:
 * формулы возвращаются на место, а поиск по участникам всё равно идёт по Telegram ID.
 */
function handleSpreadsheetChange(e) {
  const changeType = e && e.changeType ? String(e.changeType) : '';
  const structural = [
    'INSERT_ROW', 'REMOVE_ROW', 'INSERT_COLUMN', 'REMOVE_COLUMN',
    'INSERT_GRID', 'REMOVE_GRID'
  ];

  // Google Sheets присылает OTHER при раскрытии/сворачивании групп столбцов.
  // Это не изменение структуры данных, поэтому формулы восстанавливать нельзя.
  if (structural.indexOf(changeType) === -1) return;

  const lock = LockService.getScriptLock();
  let mutationStarted = false;

  try {
    if (!lock.tryLock(5000)) {
      markPublicSyncPending_('spreadsheet_change_deferred:' + changeType);
      return;
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    if (typeof beginPublicDataMutation_ === 'function') {
      beginPublicDataMutation_('spreadsheet_change:' + changeType);
      mutationStarted = true;
    }

    ensureMinimumGridSizes_(ss);
    restoreCoreFormulas_(ss);
    sortBaseByChatState_(ss);
    applyAllRoleValidations_(ss);
    rebuildCounterSnapshot_(ss);
    hideTechnicalColumnsAndSheets_(ss);
    if (typeof MINIAPP_auditV2Reconcile_ === 'function') {
      try {
        MINIAPP_auditV2Reconcile_(ss, {
          lockAlreadyHeld: true,
          source: {
            type: 'manual_sheet', channel: 'spreadsheet-structural-change',
            label: 'Google Sheets · структурное изменение'
          },
          actor: MINIAPP_auditV2SheetActor_(e),
          transactionId: 'structure:' + changeType + ':' + Utilities.getUuid(),
          metadata: {
            changeType: changeType,
            exactBefore: 'protected-baseline',
            formulaOnlyChangesExcluded: true
          }
        });
      } catch (auditError) {
        console.warn('Structural change audit warning: ' + String(auditError && auditError.message || auditError));
      }
    }
    markPublicSyncPending_('spreadsheet_change:' + (changeType || 'UNKNOWN'));

    SpreadsheetApp.flush();
  } finally {
    if (mutationStarted && typeof finishPublicDataMutation_ === 'function') {
      try { finishPublicDataMutation_('spreadsheet_change:' + changeType); } catch (err) {}
    }
    try { lock.releaseLock(); } catch (err) {}
  }
}

/**
 * Ручные правки базы: зависимые выпадающие роли, очистка C/D,
 * массовая вставка счётчиков и история ручного увеличения спецназа.
 */
function onEdit(e) {
  if (!e || !e.range) return;

  const sheet = e.range.getSheet();
  if (sheet.getName() !== SHEET_BASE) return;

  const lock = LockService.getScriptLock();
  let mutationStarted = false;

  try {
    if (!lock.tryLock(3000)) return;

    const startRow = Math.max(e.range.getRow(), BASE_FIRST_ROW);
    const endRow = Math.min(e.range.getLastRow(), BASE_LAST_ROW);
    const startCol = e.range.getColumn();
    const endCol = e.range.getLastColumn();

    if (startRow > endRow) return;

    if (typeof beginPublicDataMutation_ === 'function') {
      beginPublicDataMutation_('base_edit:' + e.range.getA1Notation());
      mutationStarted = true;
    }

    normalizeManualIdentityEdits_(sheet, startRow, endRow, startCol, endCol);
    updateRoleRulesAfterEdit_(sheet, startRow, endRow, startCol, endCol);
    processManualCounterEdits_(
      sheet.getParent(), sheet, startRow, endRow, startCol, endCol, e
    );

    if (startCol <= COL_CHAT_STATE && endCol >= COL_CHAT_STATE) {
      sortBaseByChatState_(sheet.getParent());
    }

    markPublicSyncPending_('base_edit:' + e.range.getA1Notation());
  } finally {
    if (mutationStarted && typeof finishPublicDataMutation_ === 'function') {
      try { finishPublicDataMutation_('base_edit:' + e.range.getA1Notation()); } catch (err) {}
    }
    try { lock.releaseLock(); } catch (err) {}
  }
}

/* ========================================================================== */
/* ВЕБХУКИ И ИГРОКИ                                                        */
/* ========================================================================== */

function processWebhook_(ss, player, eventKey) {
  if (player.identityStatus === 'DUPLICATE_TG_ID') {
    return {
      status: 'DUPLICATE_TG_ID',
      tg_id: player.tgId || '',
      rows: player.duplicateRows || []
    };
  }

  if (!player.tgId || !isNumericTelegramId_(player.tgId)) {
    return {
      status: 'INVALID_TG_ID',
      hint: 'Для записи и изменения участника нужен цифровой Telegram ID'
    };
  }

  if (player.event === 'antispecnaz') {
    return handleAntispecnaz_(ss, player, eventKey);
  }

  const base = ss.getSheetByName(SHEET_BASE);
  if (!base) return { status: 'BASE_SHEET_NOT_FOUND' };

  const found = findRowsByTgId_(base, player.tgId);

  if (found.length > 1) {
    return {
      status: 'DUPLICATE_TG_ID',
      tg_id: player.tgId,
      rows: found
    };
  }

  let row = found.length === 1 ? found[0] : 0;
  let created = false;

  if (!row) {
    row = appendNewPlayer_(base, player);
    created = true;

    if (!row) {
      return {
        status: 'NO_FREE_ROWS',
        tg_id: player.tgId
      };
    }
  } else {
    updateIdentityFields_(base, row, player);
  }

  let accountResult = { status: 'NO_ACCOUNT_CHANGES', slot: player.slotNumber || 1 };

  if (player.hasAccountChanges) {
    accountResult = updateAccountSlot_(base, row, player);

    if (isBlockingAccountStatus_(accountResult.status)) {
      updateCounterSnapshotForRow_(ss, base, row);
      return Object.assign({
        tg_id: player.tgId,
        row: row,
        created: created
      }, accountResult);
    }
  }

  let metricResult = { status: 'NO_METRIC_CHANGES' };

  switch (player.event) {
    case 'reputation':
      metricResult = applyReputation_(ss, base, row, player, eventKey);
      break;

    case 'screens':
      metricResult = applyScreens_(base, row, player);
      break;

    case 'activity_base':
      metricResult = incrementMetric_(base, row, COL_ACTIVITY_BASE, 'ACTIVITY_BASE_INCREMENTED');
      break;

    case 'activity_outside':
      metricResult = incrementMetric_(base, row, COL_ACTIVITY_OUTSIDE, 'ACTIVITY_OUTSIDE_INCREMENTED');
      break;

    case 'join':
      base.getRange(row, COL_CHAT_STATE).setValue('В чате');
      metricResult = { status: 'PLAYER_JOINED' };
      break;

    case 'leave':
      base.getRange(row, COL_CHAT_STATE).setValue('Вышел');
      metricResult = { status: 'PLAYER_MARKED_LEFT' };
      break;

    case 'stat':
      metricResult = { status: created ? 'PLAYER_CREATED' : 'PLAYER_UPDATED' };
      break;

    default:
      metricResult = {
        status: 'UNSUPPORTED_EVENT',
        event: player.event
      };
  }

  updateCounterSnapshotForRow_(ss, base, row);

  const finalStatus = chooseFinalStatus_(player, created, accountResult, metricResult);

  let finalRow = row;

  if (created || player.event === 'join' || player.event === 'leave') {
    sortBaseByChatState_(ss);
    const movedRows = findRowsByTgId_(base, player.tgId);
    if (movedRows.length === 1) finalRow = movedRows[0];
  }

  return {
    status: finalStatus,
    event: player.event,
    tg_id: player.tgId,
    row: finalRow,
    created: created,
    slot: accountResult.slot || player.slotNumber || 1,
    account_status: accountResult.status,
    metric_status: metricResult.status,
    team: accountResult.team || '',
    game: accountResult.game || '',
    nick: accountResult.nick || '',
    role: accountResult.role || '',
    value: metricResult.value !== undefined ? metricResult.value : '',
    added: metricResult.added !== undefined ? metricResult.added : ''
  };
}

function chooseFinalStatus_(player, created, accountResult, metricResult) {
  if (metricResult && metricResult.status && metricResult.status !== 'NO_METRIC_CHANGES') {
    return metricResult.status;
  }

  if (accountResult && accountResult.status && accountResult.status !== 'NO_ACCOUNT_CHANGES') {
    return accountResult.status;
  }

  if (created) return 'PLAYER_CREATED';
  if (player.event === 'stat') return 'PLAYER_UPDATED';
  return 'TELEGRAM_DATA_SAVED';
}

function isBlockingAccountStatus_(status) {
  return [
    'TEAM_NOT_FOUND',
    'TEAM_AMBIGUOUS',
    'INVALID_ROLE',
    'ROLE_TEAM_CONFLICT',
    'ROLE_REQUIRES_TEAM',
    'SPECNAZ_GAME_REQUIRED',
    'INVALID_SLOT'
  ].indexOf(status) !== -1;
}

function appendNewPlayer_(sheet, player) {
  const row = findFirstEmptyBaseRow_(sheet);
  if (!row) return 0;

  const rowAtoS = new Array(19).fill('');
  rowAtoS[0] = safeText_(player.manualName || player.tgName || '');
  rowAtoS[1] = safeText_(player.tgName || '');
  rowAtoS[2] = player.tgUsername || '';
  rowAtoS[3] = player.tgId;

  sheet.getRange(row, 1, 1, 19).setValues([rowAtoS]);
  sheet.getRange(row, COL_TG_ID).setNumberFormat('@');
  sheet.getRange(row, COL_SPECNAZ).setValue(0);
  sheet.getRange(row, COL_DATE).setValue(new Date()).setNumberFormat('dd.MM.yyyy');
  sheet.getRange(row, COL_SCREENS, 1, 3).setValues([[0, 0, 0]]);

  if (player.chatState) {
    sheet.getRange(row, COL_CHAT_STATE).setValue(player.chatState);
  }

  updateIdentityFields_(sheet, row, player);
  return row;
}

function updateIdentityFields_(sheet, row, player) {
  const current = sheet.getRange(row, 1, 1, 4).getDisplayValues()[0];

  const nameValue = player.manualName
    ? safeText_(player.manualName)
    : (!clean_(current[0]) && player.tgName ? safeText_(player.tgName) : current[0]);

  const tgNameValue = player.tgName ? safeText_(player.tgName) : current[1];
  const usernameValue = player.tgUsername || normalizePublicUsername_(current[2]) || '';

  sheet.getRange(row, 1, 1, 4).setValues([[
    nameValue || '',
    tgNameValue || '',
    usernameValue,
    player.tgId
  ]]);

  sheet.getRange(row, COL_TG_ID).setNumberFormat('@');

  const dateCell = sheet.getRange(row, COL_DATE);
  if (!dateCell.getValue()) {
    dateCell.setValue(new Date()).setNumberFormat('dd.MM.yyyy');
  }

  if (player.chatState) {
    sheet.getRange(row, COL_CHAT_STATE).setValue(player.chatState);
  }
}

function updateAccountSlot_(sheet, row, player) {
  const slot = getSlotByNumber_(player.slotNumber || 1);

  if (player.roleProvided && !player.role) {
    return { status: 'INVALID_ROLE', slot: player.slotNumber || 1, role_input: player.roleRaw };
  }

  if (!slot) {
    return { status: 'INVALID_SLOT', slot: player.slotNumber || '' };
  }

  const current = sheet
    .getRange(row, slot.teamCol, 1, 3)
    .getDisplayValues()[0];

  let team = clean_(current[0]);
  let nick = clean_(current[1]);
  let role = clean_(current[2]);
  let game = inferGameFromTeamOrRole_(team, role);

  if (player.teamProvided) {
    if (player.clearTeam) {
      team = '';
      game = '';
    } else if (player.teamStatus === 'ambiguous') {
      return {
        status: 'TEAM_AMBIGUOUS',
        slot: slot.number,
        team_input: player.teamInput,
        hint: 'Укажите РМ или РК'
      };
    } else if (!player.team) {
      return {
        status: 'TEAM_NOT_FOUND',
        slot: slot.number,
        team_input: player.teamInput
      };
    } else {
      team = player.team;
      game = player.game;
    }
  }

  if (player.nickProvided) {
    nick = player.nick;
  }

  if (player.roleProvided) {
    role = player.role;

    if (role === 'Спецназ') {
      if (team) {
        return {
          status: 'ROLE_TEAM_CONFLICT',
          slot: slot.number,
          hint: 'Спецназ РМ/РК используется только без команды'
        };
      }

      const inferredGame = player.gameHint || game || clean_(sheet.getRange(row, slot.gameCol).getDisplayValue());

      if (inferredGame === 'Royal Match') role = 'Спецназ РМ';
      else if (inferredGame === 'Royal Kingdom') role = 'Спецназ РК';
      else {
        return {
          status: 'SPECNAZ_GAME_REQUIRED',
          slot: slot.number,
          hint: 'Укажите Спецназ РМ или Спецназ РК'
        };
      }
    }
  }

  // При смене с безкомандного спецназа на конкретную команду
  // и без явной новой роли ставим нейтральную роль «Игрок».
  if (team && !player.roleProvided && ROLE_TEAM.indexOf(role) === -1) {
    role = 'Игрок';
  }

  if (ROLE_SPECNAZ.indexOf(role) !== -1) {
    if (player.teamProvided && !player.clearTeam) {
      return {
        status: 'ROLE_TEAM_CONFLICT',
        slot: slot.number,
        hint: 'При роли Спецназ РМ/РК команда должна быть пустой'
      };
    }

    team = '';
    game = role === 'Спецназ РМ' ? 'Royal Match' : 'Royal Kingdom';
  }

  if (ROLE_TEAM.indexOf(role) !== -1 && !team) {
    return {
      status: 'ROLE_REQUIRES_TEAM',
      slot: slot.number,
      role: role
    };
  }

  if (team && ROLE_SPECNAZ.indexOf(role) !== -1) {
    return {
      status: 'ROLE_TEAM_CONFLICT',
      slot: slot.number
    };
  }

  if (team && !role) {
    role = 'Игрок';
  }

  if (team && ROLE_TEAM.indexOf(role) === -1) {
    role = 'Игрок';
  }

  if (!team && role && ROLE_SPECNAZ.indexOf(role) === -1) {
    return {
      status: 'INVALID_ROLE',
      slot: slot.number,
      role: role
    };
  }

  if (role && ROLE_ALL.indexOf(role) === -1) {
    return {
      status: 'INVALID_ROLE',
      slot: slot.number,
      role: role
    };
  }

  sheet.getRange(row, slot.teamCol, 1, 3).setValues([[
    safeText_(team),
    safeText_(nick),
    role
  ]]);

  applyRoleValidationForCell_(sheet, row, slot);

  return {
    status: player.slotNumber ? 'SELECTED_SLOT_UPDATED' : 'DEFAULT_SLOT_1_UPDATED',
    slot: slot.number,
    team: team,
    game: game,
    nick: nick,
    role: role
  };
}

function applyReputation_(ss, base, row, player, eventKey) {
  const cell = base.getRange(row, COL_SPECNAZ);
  const oldValue = numberOrZero_(cell.getValue());

  // ВРЕМЕННОЕ ПРАВИЛО 2026-08-07:
  // 1) real_rating имеет приоритет при разборе входящего события и хранится
  //    в player.reputation как контрольное значение;
  // 2) сам факт НОВОГО УНИКАЛЬНОГО event=reputation всегда даёт ровно +1;
  // 3) даже если real_rating не изменился, отстал или прыгнул на несколько очков,
  //    CRM не синхронизирует счётчик скачком и всё равно добавляет только +1;
  // 4) защита от дублей выполняется выше по eventKey, поэтому повтор одного
  //    и того же webhook второй балл не создаёт;
  // 5) уменьшение выполняется только отдельным event=antispecnaz.
  const referenceRealRating = player.reputation;
  const incomingAssignedRep = player.reputationDelta;
  const newValue = oldValue + 1;

  cell.setValue(newValue);
  base.getRange(row, COL_LAST_CHANGE).setValue(new Date());

  recordSpecnazHistory_(
    ss,
    base,
    row,
    oldValue,
    newValue,
    'Webhook: reputation',
    player.tgId,
    eventKey,
    'reputation',
    player.replyMessage,
    player.replyMessageLink
  );

  return {
    status: 'REPUTATION_UPDATED',
    value: newValue,
    added: 1,
    real_rating_reference: referenceRealRating,
    assigned_rep_received: incomingAssignedRep
  };
}

function applyScreens_(base, row, player) {
  if (player.screens === null && player.screensDelta === null) {
    return { status: 'SCREENS_VALUE_MISSING' };
  }

  const cell = base.getRange(row, COL_SCREENS);
  const oldValue = numberOrZero_(cell.getValue());
  const newValue = player.screensDelta !== null
    ? Math.max(0, oldValue + player.screensDelta)
    : Math.max(0, player.screens);

  cell.setValue(newValue);

  if (newValue !== oldValue) {
    base.getRange(row, COL_LAST_CHANGE).setValue(new Date());
  }

  return {
    status: 'SCREENS_UPDATED',
    value: newValue,
    added: newValue - oldValue
  };
}

function incrementMetric_(base, row, column, status) {
  const cell = base.getRange(row, column);
  const oldValue = numberOrZero_(cell.getValue());
  const newValue = oldValue + 1;
  cell.setValue(newValue);

  return {
    status: status,
    value: newValue,
    added: 1
  };
}

function findRowsByTgId_(sheet, tgId) {
  const id = normalizeTgId_(tgId);
  if (!id) return [];

  const values = sheet
    .getRange(BASE_FIRST_ROW, COL_TG_ID, BASE_LAST_ROW - BASE_FIRST_ROW + 1, 1)
    .getDisplayValues();

  const rows = [];

  values.forEach((item, index) => {
    if (normalizeTgId_(item[0]) === id) {
      rows.push(index + BASE_FIRST_ROW);
    }
  });

  return rows;
}

function findFirstEmptyBaseRow_(sheet) {
  const values = sheet
    .getRange(BASE_FIRST_ROW, 1, BASE_LAST_ROW - BASE_FIRST_ROW + 1, 19)
    .getDisplayValues();

  for (let i = 0; i < values.length; i++) {
    const empty = values[i].every(value => clean_(value) === '');
    if (empty) return i + BASE_FIRST_ROW;
  }

  return 0;
}

function getSlotByNumber_(number) {
  const value = Number(number);
  return SLOT_DEFS.filter(slot => slot.number === value)[0] || null;
}

/* ========================================================================== */
/* РАЗБОР ВХОДЯЩИХ ДАННЫХ И TELEGRAM ID                                      */
/* ========================================================================== */

function normalizeSpecnazTriggerMessage_(value) {
  const text = String(value == null ? '' : value)
    .replace(/\u0000/g, '')
    .trim();

  if (!text || /^%[^%]+%$/.test(text)) return '';
  return text.length > 5000 ? text.substring(0, 4997) + '...' : text;
}

/**
 * Безопасный URL исходного Telegram-сообщения.
 * Не принимаем нераскрытый placeholder и произвольные схемы.
 */
function normalizeSpecnazMessageLink_(value) {
  let text = String(value == null ? '' : value)
    .replace(/\u0000/g, '')
    .trim();

  if (!text || /^%[^%]+%$/.test(text)) return '';

  // На случай если ChatKeeper вернёт HTML-ссылку, а не голый URL.
  const href = text.match(/href\s*=\s*["']([^"']+)["']/i);
  if (href && href[1]) text = String(href[1]).trim();

  if (!/^(https?:\/\/|tg:\/\/)/i.test(text)) return '';
  return text.length > 2000 ? text.substring(0, 2000) : text;
}

/**
 * Накладывает настоящую RichText-ссылку на уже записанный текст сообщения.
 * Значение ячейки не меняется, если URL отсутствует/некорректен.
 */
function applySpecnazMessageLinkToCell_(cell, messageLink) {
  const link = normalizeSpecnazMessageLink_(messageLink);
  if (!link) return false;

  const text = String(cell.getDisplayValue() || '');
  if (!text) return false;

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
  return true;
}

function parsePlayer_(ss, data, event) {
  const message = firstClean_([data.message, data.text, data.message_text]);
  const replyMessage = normalizeSpecnazTriggerMessage_(data.reply_message);
  const replyMessageLink = normalizeSpecnazMessageLink_(data.reply_message_link);
  const adminTarget = extractAdminTarget_(data, message, replyMessage, event);
  const identity = resolvePlayerIdentity_(ss, data, event, adminTarget);
  const cleanedMessage = removeTargetFromText_(message, adminTarget);
  const fields = extractStatFields_(cleanedMessage);

  const manualName = firstClean_([
    data.manual_name,
    data.real_name,
    fields.name
  ]);

  const slotNumber = normalizeSlot_(firstClean_([
    data.slot,
    data.account_slot,
    data.acc,
    data.akk,
    fields.slot,
    extractSlotFromText_(cleanedMessage)
  ]));

  const rawTeam = firstNonPlaceholder_([
    data.team,
    data.command_team,
    fields.team
  ]);

  const teamProvided = rawTeam !== '';
  const clearTeam = teamProvided && isClearTeamToken_(rawTeam);
  const gameHint = extractGameHint_(rawTeam + ' ' + cleanedMessage);

  let teamResult = {
    status: clearTeam ? 'clear' : 'empty',
    team: '',
    game: '',
    gameHint: gameHint
  };

  if (teamProvided && !clearTeam) {
    teamResult = resolveTeamName_(ss, rawTeam, gameHint);
  }

  const nickRaw = firstNonPlaceholder_([
    data.nick,
    data.game_nick,
    data.nickname,
    fields.nick
  ]);

  const roleRaw = firstNonPlaceholder_([
    data.role,
    data.command_role,
    fields.role
  ]);

  const role = normalizeRole_(roleRaw);

  let reputation = null;
  let reputationDelta = null;

  if (event === 'reputation') {
    // ВРЕМЕННОЕ ПРАВИЛО 2026-08-07:
    // real_rating имеет приоритет как контрольный рейтинг события.
    // Общая reputation используется только как запасное диагностическое значение.
    // Само начисление ниже НЕ синхронизирует счётчик с этими totals:
    // каждый новый уникальный reputation-webhook даёт строго +1.
    reputation = parseNumber_(firstClean_([
      data.target_real_rating,
      data.real_rating,
      data.target_reputation,
      data.reputation
    ]));

    reputationDelta = parseNumber_(firstClean_([
      data.assigned_rep,
      data.reputation_delta,
      data.rep_delta
    ]));
  }

  let screens = null;
  let screensDelta = null;

  if (event === 'screens') {
    screens = parseNumber_(firstClean_([
      data.screens,
      data.screen_count,
      data.activity,
      data.week_activity,
      data.weekly_activity,
      data.message_count,
      data.msg_count,
      data.target_msg_count,
      data.target_messages
    ]));

    screensDelta = parseNumber_(firstClean_([
      data.screens_delta,
      data.screens_plus,
      data.add_screens,
      data.activity_delta,
      data.activity_plus,
      data.add_activity,
      data.delta_activity
    ]));
  }

  const player = {
    event: event,
    tgId: identity.tgId,
    tgName: identity.tgName,
    tgUsername: identity.tgUsername,
    identityStatus: identity.status,
    duplicateRows: identity.duplicateRows || [],

    manualName: manualName,
    adminMode: adminTarget.hasTarget,

    slotNumber: slotNumber,

    teamProvided: teamProvided,
    clearTeam: clearTeam,
    teamInput: rawTeam,
    teamStatus: teamResult.status,
    team: teamResult.team || '',
    game: teamResult.game || '',
    gameHint: teamResult.gameHint || gameHint || '',

    nickProvided: nickRaw !== '',
    nick: nickRaw,

    roleProvided: roleRaw !== '',
    roleRaw: roleRaw,
    role: role,

    reputation: reputation,
    reputationDelta: reputationDelta,
    screens: screens,
    screensDelta: screensDelta,

    activityBaseIncrement: event === 'activity_base' ? 1 : 0,
    activityOutsideIncrement: event === 'activity_outside' ? 1 : 0,
    chatState: getChatStateByEvent_(event),

    message: message,
    replyMessage: replyMessage,
    replyMessageLink: replyMessageLink
  };

  player.hasAccountChanges = (
    player.teamProvided ||
    player.nickProvided ||
    player.roleProvided ||
    player.slotNumber !== null
  ) && event === 'stat';

  return player;
}

function resolvePlayerIdentity_(ss, data, event, adminTarget) {
  let rawId = '';
  let rawName = '';
  let rawUsername = '';

  if (adminTarget && adminTarget.hasTarget) {
    rawId = adminTarget.tgId;
    rawName = adminTarget.tgName;
    rawUsername = adminTarget.tgUsername;
  } else {
    const useTarget = event === 'join' || event === 'leave' || event === 'reputation';

    rawId = firstClean_([
      data.tg_id,
      useTarget ? data.target_user_id : '',
      data.actor_user_id,
      data.target_user_id,
      data.user_id
    ]);

    const rawNameValue = firstClean_([
      data.tg_name,
      useTarget ? data.target_username : '',
      useTarget ? data.target_name : '',
      data.actor_username,
      data.target_username,
      data.name
    ]);

    const rawLinkValue = firstClean_([
      data.tg_link,
      useTarget ? data.target_loginlink : '',
      useTarget ? data.target_link : '',
      data.actor_loginlink,
      data.target_loginlink,
      data.loginlink
    ]);

    rawName = normalizeTelegramDisplayName_(rawNameValue);
    rawUsername = normalizePublicUsername_(rawLinkValue);
  }

  let tgId = normalizeTgId_(rawId);
  const tgUsername = normalizePublicUsername_(rawUsername);
  const tgName = normalizeTelegramDisplayName_(rawName);

  // Для старых админских команд, где пришёл только @username,
  // разрешается найти уже существующий цифровой ID в базе.
  if (!tgId && tgUsername) {
    const resolved = resolveTgIdByUsername_(ss, tgUsername);

    if (resolved.status === 'found') tgId = resolved.tgId;
    if (resolved.status === 'duplicate') {
      return {
        status: 'DUPLICATE_TG_ID',
        tgId: resolved.tgId || '',
        tgName: tgName,
        tgUsername: tgUsername,
        duplicateRows: resolved.rows
      };
    }
  }

  return {
    status: tgId ? 'ok' : 'missing_id',
    tgId: tgId,
    tgName: tgName,
    tgUsername: tgUsername,
    duplicateRows: []
  };
}

function resolveTgIdByUsername_(ss, username) {
  const sheet = ss.getSheetByName(SHEET_BASE);
  if (!sheet) return { status: 'not_found', tgId: '', rows: [] };

  const key = normalizeUsernameKey_(username);
  if (!key) return { status: 'not_found', tgId: '', rows: [] };

  const values = sheet
    .getRange(BASE_FIRST_ROW, COL_TG_NAME, BASE_LAST_ROW - BASE_FIRST_ROW + 1, 3)
    .getDisplayValues();

  const matches = [];

  values.forEach((row, index) => {
    const b = normalizeUsernameKey_(row[0]);
    const c = normalizeUsernameKey_(row[1]);

    if (b === key || c === key) {
      const id = normalizeTgId_(row[2]);
      if (id) matches.push({ row: index + BASE_FIRST_ROW, tgId: id });
    }
  });

  const uniqueIds = Array.from(new Set(matches.map(item => item.tgId)));

  if (uniqueIds.length === 1) {
    return { status: 'found', tgId: uniqueIds[0], rows: matches.map(item => item.row) };
  }

  if (matches.length > 1) {
    return { status: 'duplicate', tgId: '', rows: matches.map(item => item.row) };
  }

  return { status: 'not_found', tgId: '', rows: [] };
}

function extractAdminTarget_(data, message, replyMessage, event) {
  const result = {
    hasTarget: false,
    tgId: '',
    tgName: '',
    tgUsername: ''
  };

  const supportsAdminTarget = event === 'stat' || event === 'antispecnaz';
  if (!supportsAdminTarget) return result;

  const replyId = normalizeTgId_(firstClean_([
    data.reply_user_id,
    data.reply_tg_id,
    data.reply_target_user_id,
    data.reply_target_tg_id
  ]));

  const replyUsernameRaw = firstClean_([
    data.reply_loginlink,
    data.reply_target_loginlink,
    data.reply_username,
    data.reply_target_username,
    data.reply_actor_username
  ]);

  const replyDisplayRaw = firstClean_([
    data.reply_username,
    data.reply_target_username,
    data.reply_name
  ]);

  const replyUsername = normalizePublicUsername_(replyUsernameRaw);
  const replyName = normalizeTelegramDisplayName_(replyDisplayRaw);

  if (replyId || replyUsername || replyName) {
    result.hasTarget = true;
    result.tgId = replyId;
    result.tgUsername = replyUsername;
    result.tgName = replyName;
    return result;
  }

  const text = String(message || '');
  const idFromText = extractTelegramIdFromText_(text);
  const usernameFromText = normalizePublicUsername_(extractUsernameFromText_(text));

  if (idFromText || usernameFromText) {
    result.hasTarget = true;
    result.tgId = idFromText;
    result.tgUsername = usernameFromText;
    result.tgName = usernameFromText;
  }

  return result;
}

function removeTargetFromText_(text, target) {
  let value = String(text || '');
  if (!target || !target.hasTarget) return value;

  const username = normalizeUsernameKey_(target.tgUsername);

  if (username) {
    const escaped = escapeRegExp_(username);
    value = value.replace(new RegExp('@' + escaped + '\\b', 'gi'), ' ');
    value = value.replace(new RegExp('https?:\\/\\/t\\.me\\/' + escaped + '\\b', 'gi'), ' ');
    value = value.replace(new RegExp('t\\.me\\/' + escaped + '\\b', 'gi'), ' ');
  }

  if (target.tgId) {
    const escapedId = escapeRegExp_(target.tgId);
    value = value.replace(
      new RegExp('\\b(id|ид|тг|tg_id|telegram_id)\\s*[:=\\-—]?\\s*' + escapedId + '\\b', 'gi'),
      ' '
    );
  }

  return value.replace(/\s+/g, ' ').trim();
}

function normalizeEvent_(data) {
  const eventRaw = clean_(data.event).toLowerCase();
  const message = clean_(data.message).toLowerCase();

  if ([
    'antispecnaz', 'anti_specnaz', 'anti-specnaz',
    'антиспецназ', 'анти_спецназ', 'анти спецназ'
  ].indexOf(eventRaw) !== -1) return 'antispecnaz';

  if (['leave', 'left', 'exit', 'выход', 'вышел'].indexOf(eventRaw) !== -1) return 'leave';
  if (['join', 'enter', 'new_member', 'вход', 'вошел', 'вошёл'].indexOf(eventRaw) !== -1) return 'join';
  if (['reputation', 'rep', 'репутация', 'specnaz', 'спецназ_очко'].indexOf(eventRaw) !== -1) return 'reputation';

  if ([
    'activity_base', 'base_activity', 'activity_in_base',
    'активность_в_базе', 'активность в базе'
  ].indexOf(eventRaw) !== -1) return 'activity_base';

  if ([
    'activity_outside', 'outside_activity', 'activity_out_of_base',
    'активность_вне_базы', 'активность вне базы'
  ].indexOf(eventRaw) !== -1) return 'activity_outside';

  if (['activity', 'screens', 'screen', 'скрины', 'скрин'].indexOf(eventRaw) !== -1) return 'screens';

  if (eventRaw === 'stat' || eventRaw === 'стат' || /^стат\b/i.test(message)) return 'stat';

  return eventRaw || 'stat';
}

function getChatStateByEvent_(event) {
  if (event === 'leave') return 'Вышел';
  if (event === 'join') return 'В чате';
  return '';
}

function parseIncoming_(raw) {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {}

  const data = {};
  const lines = String(raw || '').replace(/\r\n?/g, '\n').split('\n');

  /*
   * reply_message у ChatKeeper может быть многострочным и находиться не только
   * в конце body. Поэтому при чтении reply_message продолжаем собирать строки,
   * пока не встретим следующий ИЗВЕСТНЫЙ служебный ключ webhook.
   *
   * Это сохраняет многострочный текст сообщения и одновременно не поглощает
   * tg_id, reputation, real_rating и другие поля, стоящие после него.
   */
  const knownKeys = new Set([
    'secret', 'event',
    'message', 'text', 'message_text', 'reply_message', 'reply_message_link',
    'tg_name', 'tg_link', 'tg_id', 'name', 'loginlink', 'user_id',
    'target_name', 'target_username', 'target_link', 'target_loginlink',
    'target_user_id', 'target_reputation', 'target_real_rating',
    'actor_username', 'actor_loginlink', 'actor_user_id',
    'reply_name', 'reply_username', 'reply_loginlink', 'reply_user_id',
    'reply_tg_id', 'reply_actor_username',
    'reply_target_username', 'reply_target_loginlink',
    'reply_target_user_id', 'reply_target_tg_id',
    'reputation', 'real_rating', 'assigned_rep',
    'reputation_delta', 'rep_delta',
    'screens', 'screen_count', 'screens_delta', 'screens_plus', 'add_screens',
    'activity', 'week_activity', 'weekly_activity',
    'message_count', 'msg_count', 'target_msg_count', 'target_messages',
    'activity_delta', 'activity_plus', 'add_activity', 'delta_activity',
    'manual_name', 'real_name',
    'team', 'command_team', 'nick', 'game_nick', 'nickname',
    'role', 'command_role', 'slot', 'account_slot', 'acc', 'akk',
    'date', 'datetime', 'time', 'chat_id', 'chat_title'
  ]);

  let multilineKey = '';
  let multilineLines = [];

  function flushMultiline_() {
    if (!multilineKey) return;
    data[multilineKey] = multilineLines.join('\n').trim();
    multilineKey = '';
    multilineLines = [];
  }

  lines.forEach(line => {
    const pos = line.indexOf('=');

    if (multilineKey) {
      if (pos !== -1) {
        const candidateKey = line.substring(0, pos).trim();

        if (knownKeys.has(candidateKey)) {
          flushMultiline_();

          const value = line.substring(pos + 1);
          if (candidateKey === 'reply_message') {
            multilineKey = candidateKey;
            multilineLines = [value];
          } else {
            data[candidateKey] = value.trim();
          }
          return;
        }
      }

      multilineLines.push(line);
      return;
    }

    if (pos === -1) return;

    const key = line.substring(0, pos).trim();
    const value = line.substring(pos + 1);
    if (!key) return;

    if (key === 'reply_message') {
      multilineKey = key;
      multilineLines = [value];
      return;
    }

    data[key] = value.trim();
  });

  flushMultiline_();
  return data;
}

function extractStatFields_(text) {
  const result = { name: '', team: '', nick: '', role: '', slot: '' };
  if (!text) return result;

  let cleaned = String(text || '').trim()
    .replace(/^стат\b\s*/i, '')
    .replace(/^\/stat\b\s*/i, '')
    .replace(/^\+стат\b\s*/i, '')
    .replace(/^[:|,;.\-—]+/, '')
    .trim();

  if (!cleaned || cleaned.toLowerCase() === 'стат') return result;

  const directSlot = extractSlotFromText_(cleaned);
  const labeled = extractLabeledFields_(cleaned);

  if (labeled.hasAny) {
    return {
      name: labeled.name || '',
      team: labeled.team || '',
      nick: labeled.nick || '',
      role: labeled.role || '',
      slot: labeled.slot || directSlot || ''
    };
  }

  if (cleaned.indexOf('|') !== -1) {
    const parts = cleaned.split('|').map(item => item.trim());
    result.name = parts[0] || '';
    result.team = parts[1] || '';
    result.nick = parts[2] || '';
    result.role = parts[3] || '';
    result.slot = parts[4] || directSlot || '';
    return result;
  }

  const withoutSlot = removeSlotPhrase_(cleaned);
  result.slot = directSlot || '';

  if (directSlot && !withoutSlot) return result;

  result.name = withoutSlot || cleaned;
  return result;
}

function extractLabeledFields_(text) {
  const result = {
    hasAny: false,
    name: '',
    team: '',
    nick: '',
    role: '',
    slot: ''
  };

  const regex = /(^|[\s,;|])(имя|name|команда|каманда|ком|тим|team|ник\s*в\s*игре|игровой\s*ник|ник|nickname|роль|role|слот|slot|акк|аккаунт|account)(?=\s|[:=\-—]|$)\s*[:=\-—]?\s*/gi;
  const matches = [];
  let match;

  while ((match = regex.exec(text)) !== null) {
    matches.push({ label: match[2], index: match.index, end: regex.lastIndex });
  }

  if (!matches.length) return result;
  result.hasAny = true;

  matches.forEach((current, index) => {
    const next = matches[index + 1];
    let value = text.substring(current.end, next ? next.index : text.length).trim();
    value = value.replace(/^[|,;:.\-—]+/, '').replace(/[|,;]+$/, '').trim();
    const field = normalizeLabel_(current.label);
    if (field) result[field] = value;
  });

  return result;
}

function normalizeLabel_(label) {
  const value = String(label || '').toLowerCase().replace(/\s+/g, ' ').trim();

  if (value === 'имя' || value === 'name') return 'name';
  if (['команда', 'каманда', 'ком', 'тим', 'team'].indexOf(value) !== -1) return 'team';
  if (['ник', 'ник в игре', 'игровой ник', 'nickname'].indexOf(value) !== -1) return 'nick';
  if (value === 'роль' || value === 'role') return 'role';
  if (['слот', 'slot', 'акк', 'аккаунт', 'account'].indexOf(value) !== -1) return 'slot';

  return '';
}

/* ========================================================================== */
/* КОМАНДЫ И РОЛИ                                                           */
/* ========================================================================== */

function resolveTeamName_(ss, input, explicitGameHint) {
  const inputText = clean_(input);
  if (!inputText) return { status: 'empty', team: '', game: '', gameHint: explicitGameHint || '' };

  const gameHint = explicitGameHint || extractGameHint_(inputText);
  const strippedInput = stripGameHint_(inputText);
  const inputKey = normalizeTeamKey_(strippedInput);

  if (!inputKey || inputKey.length < 2) {
    return { status: 'not_found', team: '', game: '', gameHint: gameHint };
  }

  const teams = getTeamsIndex_(ss);
  let exact = teams.filter(item => item.key === inputKey);

  if (gameHint) exact = exact.filter(item => item.game === gameHint);

  exact = uniqueTeams_(exact);

  if (exact.length === 1) {
    return {
      status: 'found',
      team: exact[0].canonical,
      game: exact[0].game,
      gameHint: gameHint || exact[0].game
    };
  }

  if (exact.length > 1) {
    return { status: 'ambiguous', team: '', game: '', gameHint: gameHint };
  }

  let partial = teams.filter(item => {
    return item.key.indexOf(inputKey) !== -1 || inputKey.indexOf(item.key) !== -1;
  });

  if (gameHint) partial = partial.filter(item => item.game === gameHint);
  partial = uniqueTeams_(partial);

  if (partial.length === 1) {
    return {
      status: 'found_partial',
      team: partial[0].canonical,
      game: partial[0].game,
      gameHint: gameHint || partial[0].game
    };
  }

  if (partial.length > 1) {
    return { status: 'ambiguous', team: '', game: '', gameHint: gameHint };
  }

  return { status: 'not_found', team: '', game: '', gameHint: gameHint };
}

function getTeamsIndex_(ss) {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'royal_crm_teams_v2';
  const cached = cache.get(cacheKey);

  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (err) {}
  }

  const sheet = ss.getSheetByName(SHEET_TEAMS);
  if (!sheet) return [];

  const values = sheet.getRange(2, 1, Math.min(998, sheet.getMaxRows() - 1), 2).getDisplayValues();
  const result = [];

  values.forEach(row => {
    const game = normalizeGame_(row[0]);
    const teamRaw = clean_(row[1]);
    if (!game || !teamRaw) return;

    const team = stripGameSuffix_(teamRaw);
    const suffix = game === 'Royal Match' ? 'РМ' : 'РК';

    result.push({
      game: game,
      team: team,
      canonical: team + ' — ' + suffix,
      key: normalizeTeamKey_(team)
    });
  });

  try {
    cache.put(cacheKey, JSON.stringify(result), 300);
  } catch (err) {}

  return result;
}

function uniqueTeams_(items) {
  const map = {};
  const result = [];

  items.forEach(item => {
    const key = item.game + '|' + item.canonical;
    if (map[key]) return;
    map[key] = true;
    result.push(item);
  });

  return result;
}

function normalizeRole_(role) {
  const value = String(role || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!value) return '';

  if (value.indexOf('спец') === 0 || value.indexOf('spec') === 0) {
    if (/royal\s*match|(^|\s)рм($|\s)|(^|\s)rm($|\s)/i.test(value)) return 'Спецназ РМ';
    if (/royal\s*kingdom|(^|\s)рк($|\s)|(^|\s)rk($|\s)/i.test(value)) return 'Спецназ РК';
    return 'Спецназ';
  }

  if (value.indexOf('лид') === 0 || value === 'leader') return 'Лидер';
  if (value.indexOf('пом') === 0 || value === 'helper' || value === 'assistant') return 'Помощник';
  if (value.indexOf('игр') === 0 || value === 'player') return 'Игрок';

  return '';
}

function inferGameFromTeamOrRole_(team, role) {
  const roleValue = clean_(role);
  if (roleValue === 'Спецназ РМ') return 'Royal Match';
  if (roleValue === 'Спецназ РК') return 'Royal Kingdom';

  const teamValue = clean_(team);
  if (/\s+—\s+РМ$/i.test(teamValue)) return 'Royal Match';
  if (/\s+—\s+РК$/i.test(teamValue)) return 'Royal Kingdom';

  return '';
}

function extractGameHint_(value) {
  const text = String(value || '').toLowerCase();

  if (/royal\s*match|(?:^|[\s,;()\-—])рм(?:$|[\s,;()\-—])|(?:^|[\s,;()\-—])rm(?:$|[\s,;()\-—])/i.test(text)) {
    return 'Royal Match';
  }

  if (/royal\s*kingdom|(?:^|[\s,;()\-—])рк(?:$|[\s,;()\-—])|(?:^|[\s,;()\-—])rk(?:$|[\s,;()\-—])/i.test(text)) {
    return 'Royal Kingdom';
  }

  return '';
}

function stripGameHint_(value) {
  return String(value || '')
    .replace(/\s+—\s+(РМ|РК)\s*$/i, '')
    .replace(/\s+(Royal\s*Match|Royal\s*Kingdom|РМ|РК|RM|RK)\s*$/i, '')
    .trim();
}

function stripGameSuffix_(value) {
  return String(value || '').replace(/\s+—\s+(РМ|РК)\s*$/i, '').trim();
}

function normalizeGame_(value) {
  const text = String(value || '').toLowerCase().trim();
  if (text === 'royal match' || text === 'рм' || text === 'rm') return 'Royal Match';
  if (text === 'royal kingdom' || text === 'рк' || text === 'rk') return 'Royal Kingdom';
  return '';
}

function normalizeTeamKey_(value) {
  return translitRuToLat_(stripGameHint_(value).toLowerCase())
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function translitRuToLat_(text) {
  const map = {
    'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z',
    'и':'i','й':'i','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r',
    'с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'c','ч':'ch','ш':'sh','щ':'sch',
    'ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'
  };

  return String(text || '').split('').map(ch => map[ch] !== undefined ? map[ch] : ch).join('');
}

function isClearTeamToken_(value) {
  const text = String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return ['-', '—', 'нет', 'нет команды', 'без команды', 'пусто', 'очистить'].indexOf(text) !== -1;
}

/* ========================================================================== */
/* АНТИСПЕЦНАЗ И ИСТОРИЯ                                                     */
/* ========================================================================== */

function handleAntispecnaz_(ss, player, eventKey) {
  const base = ss.getSheetByName(SHEET_BASE);
  if (!base) return { status: 'BASE_SHEET_NOT_FOUND', tg_id: player.tgId };

  const rows = findRowsByTgId_(base, player.tgId);

  if (!rows.length) {
    return { status: 'PLAYER_NOT_FOUND', tg_id: player.tgId };
  }

  if (rows.length > 1) {
    return { status: 'DUPLICATE_TG_ID', tg_id: player.tgId, rows: rows };
  }

  const row = rows[0];
  const cell = base.getRange(row, COL_SPECNAZ);
  const oldValue = numberOrZero_(cell.getValue());

  if (oldValue <= 0) {
    return {
      status: 'ANTISPECNAZ_ZERO',
      tg_id: player.tgId,
      row: row,
      value: 0
    };
  }

  const newValue = oldValue - 1;
  cell.setValue(newValue);
  base.getRange(row, COL_LAST_CHANGE).setValue(new Date());

  const history = ss.getSheetByName(SHEET_HISTORY);
  let historyStatus = 'ANTISPECNAZ_HISTORY_NOT_FOUND';
  let historyRow = 0;

  if (history) {
    ensureHistoryStructure_(history);
    const found = findLatestHistoryRecordByTgId_(history, player.tgId);

    if (found) {
      historyRow = found.row;
      const added = numberOrZero_(history.getRange(found.row, HISTORY_COL_ADDED).getValue());

      if (added > 1) {
        const afterValue = Math.max(0, numberOrZero_(history.getRange(found.row, HISTORY_COL_NEW).getValue()) - 1);
        history.getRange(found.row, HISTORY_COL_NEW).setValue(afterValue);
        history.getRange(found.row, HISTORY_COL_ADDED).setValue(added - 1);
        history.getRange(found.row, HISTORY_COL_RANK).setValue(getSpecnazRank_(afterValue));
        historyStatus = 'ANTISPECNAZ_HISTORY_REDUCED';
      } else {
        history.deleteRow(found.row);
        historyStatus = 'ANTISPECNAZ_HISTORY_ROW_DELETED';
      }

      removeEmptySpecnazDividers_(history);
    }
  }

  updateCounterSnapshotForRow_(ss, base, row);

  return {
    status: 'ANTISPECNAZ_APPLIED',
    tg_id: player.tgId,
    row: row,
    value: newValue,
    removed: 1,
    history_status: historyStatus,
    history_row: historyRow,
    event_key: eventKey
  };
}

function recordSpecnazHistory_(ss, baseSheet, row, oldValue, newValue, source, tgId, eventKey, eventType, triggerMessage, triggerMessageLink) {
  if (newValue <= oldValue) return;

  const history = ss.getSheetByName(SHEET_HISTORY);
  if (!history) return;

  ensureHistoryStructure_(history);
  ensureSpecnazPeriodDivider_(history, new Date());

  const targetRow = getHistoryLastContentRow_(history) + 1;
  const identity = getHistoryParticipantSnapshot_(baseSheet, row);
  const added = newValue - oldValue;
  const historyMessage = normalizeSpecnazTriggerMessage_(triggerMessage);
  const historyMessageLink = normalizeSpecnazMessageLink_(triggerMessageLink);

  history.getRange(targetRow, 1, 1, HISTORY_WIDTH).setValues([[
    new Date(),
    '',
    safeText_(identity.displayName),
    safeText_(identity.teams),
    oldValue,
    newValue,
    added,
    getSpecnazRank_(newValue),
    safeText_(historyMessage),
    safeText_(source),
    row,
    normalizeTgId_(tgId),
    eventKey || '',
    eventType || '',
    '',
    historyMessageLink
  ]]);

  history.getRange(targetRow, HISTORY_COL_DATE).setNumberFormat('dd.MM.yyyy H:mm:ss');
  history.getRange(targetRow, HISTORY_COL_TG_ID).setNumberFormat('@');
  history.getRange(targetRow, HISTORY_COL_MESSAGE_LINK).setNumberFormat('@');
  history.getRange(targetRow, HISTORY_COL_MESSAGE)
    .setWrap(true)
    .setVerticalAlignment('top');
  applySpecnazMessageLinkToCell_(
    history.getRange(targetRow, HISTORY_COL_MESSAGE),
    historyMessageLink
  );
  history.setRowHeight(targetRow, 55);
  setHistoryAvatarFormula_(history, targetRow);
}

function findLatestHistoryRecordByTgId_(history, tgId) {
  const lastRow = getHistoryLastContentRow_(history);
  if (lastRow < 2) return null;

  const id = normalizeTgId_(tgId);
  const values = history.getRange(2, 1, lastRow - 1, HISTORY_WIDTH).getValues();
  let best = null;

  values.forEach((row, index) => {
    const rowId = normalizeTgId_(row[HISTORY_COL_TG_ID - 1]);
    if (rowId !== id) return;

    const added = numberOrZero_(row[HISTORY_COL_ADDED - 1]);
    if (added <= 0) return;

    const rowNumber = index + 2;
    const dateValue = row[HISTORY_COL_DATE - 1];
    const date = dateValue instanceof Date ? dateValue.getTime() : parseDateValue_(dateValue).getTime();
    const time = isNaN(date) ? 0 : date;

    if (!best || time > best.time || (time === best.time && rowNumber > best.row)) {
      best = { row: rowNumber, time: time };
    }
  });

  return best;
}

function ensureHistoryStructure_(sheet) {
  const headers = [
    'Дата', 'Аватар', 'Имя', 'Команда', 'Было', 'Стало', 'Добавлено',
    'Звание', 'Сообщение', 'Источник', 'Строка базы', 'Telegram ID',
    'Ключ события', 'Тип события', 'Имя для Telegram-ссылки', 'Ссылка сообщения'
  ];

  if (sheet.getMaxColumns() < HISTORY_WIDTH) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), HISTORY_WIDTH - sheet.getMaxColumns());
  }

  const current = sheet.getRange(1, 1, 1, Math.min(sheet.getMaxColumns(), HISTORY_WIDTH))
    .getDisplayValues()[0]
    .map(value => clean_(value));

  const richLayout = current[0] === 'Дата' &&
    current[1] === 'Аватар' &&
    current[2] === 'Имя' &&
    current[3] === 'Команда' &&
    current[HISTORY_COL_TG_ID - 1] === 'Telegram ID';

  if (!richLayout) migrateHistoryToRichLayout_(sheet);

  sheet.getRange(1, 1, 1, HISTORY_WIDTH).setValues([headers]);
  sheet.getRange(1, 1, 1, HISTORY_WIDTH)
    .setBackground('#9CC2E5')
    .setFontWeight('bold')
    .setVerticalAlignment('middle');

  sheet.setFrozenRows(1);
  sheet.setColumnWidth(HISTORY_COL_DATE, 145);
  sheet.setColumnWidth(HISTORY_COL_AVATAR, 74);
  sheet.setColumnWidth(HISTORY_COL_NAME, 285);
  sheet.setColumnWidth(HISTORY_COL_TEAM, 320);
  sheet.setColumnWidths(HISTORY_COL_OLD, 3, 74);
  sheet.setColumnWidth(HISTORY_COL_RANK, 125);
  sheet.setColumnWidth(HISTORY_COL_MESSAGE, 420);
  sheet.setColumnWidth(HISTORY_COL_SOURCE, 170);
  sheet.setColumnWidth(HISTORY_COL_BASE_ROW, 95);
  sheet.setColumnWidth(HISTORY_COL_TG_ID, 130);
  sheet.setColumnWidth(HISTORY_COL_EVENT_KEY, 180);
  sheet.setColumnWidth(HISTORY_COL_EVENT_TYPE, 110);
  sheet.setColumnWidth(HISTORY_COL_LEGACY_TG_HELPER, 200);
  sheet.setColumnWidth(HISTORY_COL_MESSAGE_LINK, 240);

  sheet.getRange('L:L').setNumberFormat('@');
  sheet.getRange('O:P').setNumberFormat('@');

  const bodyRows = Math.max(sheet.getMaxRows() - 1, 1);
  sheet.getRange(2, HISTORY_COL_NAME, bodyRows, 2).setWrap(true).setVerticalAlignment('middle');
  sheet.getRange(2, HISTORY_COL_MESSAGE, bodyRows, 1).setWrap(true).setVerticalAlignment('top');

  try {
    sheet.showColumns(1, HISTORY_VISIBLE_WIDTH);
    sheet.hideColumns(HISTORY_COL_SOURCE, HISTORY_WIDTH - HISTORY_COL_SOURCE + 1);
  } catch (err) {}

  clearOrphanHistoryAvatarFormulas_(sheet);
}

function migrateHistoryToTelegramIds_(ss) {
  const history = ss.getSheetByName(SHEET_HISTORY);
  if (!history) return;

  ensureHistoryStructure_(history);
  repairHistoryRichRowsFromBase_(ss);
}

function ensureSpecnazPeriodDivider_(sheet, date) {
  const period = getSpecnazPeriod_(date);
  const title = formatSpecnazPeriodTitle_(period.start, period.end);
  const lastRow = getHistoryLastContentRow_(sheet);
  const titles = sheet.getRange(1, 1, lastRow, 1).getDisplayValues().map(row => clean_(row[0]));

  if (titles.indexOf(title) !== -1) return false;

  const row = lastRow + 1;
  const range = sheet.getRange(row, 1, 1, HISTORY_VISIBLE_WIDTH);
  range.breakApart();
  range.clearContent();
  range.merge();

  range
    .setValue(title)
    .setNumberFormat('@')
    .setBackground('#1F4E78')
    .setFontColor('#FFFFFF')
    .setFontFamily('Arial')
    .setFontSize(18)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(true)
    .setBorder(true, true, true, true, false, false, '#1F4E78', SpreadsheetApp.BorderStyle.SOLID_THICK);

  sheet.setRowHeight(row, 55);
  return true;
}

function removeEmptySpecnazDividers_(sheet) {
  if (!sheet) return;

  let lastRow = getHistoryLastContentRow_(sheet);
  if (lastRow < 2) return;

  for (let row = lastRow; row >= 2; row--) {
    const title = clean_(sheet.getRange(row, 1).getDisplayValue());
    if (!/^Спецназ с /i.test(title)) continue;

    let hasRecord = false;

    for (let next = row + 1; next <= lastRow; next++) {
      const nextTitle = clean_(sheet.getRange(next, 1).getDisplayValue());
      if (/^Спецназ с /i.test(nextTitle)) break;

      const tgId = normalizeTgId_(sheet.getRange(next, HISTORY_COL_TG_ID).getDisplayValue());
      const added = numberOrZero_(sheet.getRange(next, HISTORY_COL_ADDED).getValue());
      if (tgId || added > 0) {
        hasRecord = true;
        break;
      }
    }

    if (!hasRecord) sheet.deleteRow(row);
  }
}

function getPlayerNameForHistory_(sheet, row) {
  return getHistoryParticipantSnapshot_(sheet, row).displayName;
}

function getHistoryParticipantSnapshot_(sheet, row) {
  const values = sheet.getRange(row, 1, 1, 19).getDisplayValues()[0];
  return buildHistoryParticipantSnapshotFromBaseRow_(values);
}

function buildHistoryParticipantSnapshotFromBaseRow_(values) {
  const nameParts = [values[0], values[1], values[2]]
    .map(value => clean_(value))
    .filter(value => value !== '');

  const displayName = nameParts.length
    ? nameParts.join(', ')
    : (clean_(values[3]) || 'Без имени');

  const seenTeams = {};
  const teams = [];
  SLOT_DEFS.forEach(slot => {
    const team = clean_(values[slot.teamCol - 1]);
    if (!team || isClearTeamToken_(team)) return;
    const key = normalizeNameKey_(team);
    if (seenTeams[key]) return;
    seenTeams[key] = true;
    teams.push(team);
  });

  return {
    displayName: displayName,
    teams: teams.join(', '),
    tgId: normalizeTgId_(values[COL_TG_ID - 1])
  };
}

function buildHistoryBaseMap_(base) {
  const lastRow = Math.min(BASE_LAST_ROW, Math.max(BASE_FIRST_ROW, base.getLastRow()));
  const map = {};
  if (lastRow < BASE_FIRST_ROW) return map;

  const values = base.getRange(BASE_FIRST_ROW, 1, lastRow - BASE_FIRST_ROW + 1, 19).getDisplayValues();
  values.forEach((row, index) => {
    const info = buildHistoryParticipantSnapshotFromBaseRow_(row);
    if (!info.tgId) return;
    info.row = index + BASE_FIRST_ROW;
    map[info.tgId] = info;
  });
  return map;
}

function getHistoryLastContentRow_(sheet) {
  if (!sheet) return 1;

  const maxRows = Math.max(sheet.getMaxRows(), 1);
  const values = sheet
    .getRange(1, HISTORY_COL_DATE, maxRows, 1)
    .getDisplayValues();

  for (let index = values.length - 1; index >= 0; index--) {
    if (clean_(values[index][0])) return index + 1;
  }

  return 1;
}

function clearOrphanHistoryAvatarFormulas_(sheet) {
  if (!sheet) return;

  const lastContentRow = getHistoryLastContentRow_(sheet);
  const maxRows = sheet.getMaxRows();
  if (lastContentRow >= maxRows) return;

  sheet
    .getRange(lastContentRow + 1, HISTORY_COL_AVATAR, maxRows - lastContentRow, 1)
    .clearContent();
}

function setHistoryAvatarFormula_(sheet, row) {
  const title = clean_(sheet.getRange(row, HISTORY_COL_DATE).getDisplayValue());
  if (/^Спецназ с /i.test(title)) return;

  const avatarSheet = sheet.getParent().getSheetByName('Аватары');
  if (!avatarSheet) {
    sheet.getRange(row, HISTORY_COL_AVATAR).clearContent();
    return;
  }

  const formula = '=IF($L' + row + '="";"";IFERROR(INDEX(\'Аватары\'!$B$2:$B$999;MATCH($L' + row + ';\'Аватары\'!$A$2:$A$999;0));""))';
  sheet.getRange(row, HISTORY_COL_AVATAR).setFormula(formula);
}

function styleHistoryDividerRow_(sheet, row) {
  const range = sheet.getRange(row, 1, 1, HISTORY_VISIBLE_WIDTH);
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
    .setBorder(true, true, true, true, false, false, '#1F4E78', SpreadsheetApp.BorderStyle.SOLID_THICK);
  sheet.setRowHeight(row, 55);
}

function migrateHistoryToRichLayout_(sheet) {
  const lastRow = getHistoryLastContentRow_(sheet);
  const oldWidth = Math.min(Math.max(sheet.getLastColumn(), 13), 26);
  const all = sheet.getRange(1, 1, lastRow, oldWidth).getValues();
  const headers = all[0].map(value => clean_(value));
  const index = {};
  headers.forEach((header, i) => { if (header) index[header] = i; });

  function idx(names, fallback) {
    for (let i = 0; i < names.length; i++) {
      if (Object.prototype.hasOwnProperty.call(index, names[i])) return index[names[i]];
    }
    return fallback;
  }

  const iDate = idx(['Дата'], 0);
  const iName = idx(['Имя', 'Игрок'], 1);
  const iTeam = idx(['Команда', 'Команда 1'], 2);
  const iOld = idx(['Было'], 3);
  const iNew = idx(['Стало'], 4);
  const iAdded = idx(['Добавлено'], 5);
  const iRank = idx(['Звание'], 8);
  const iMessage = idx(['Сообщение'], 12);
  const iSource = idx(['Источник'], 6);
  const iBaseRow = idx(['Строка базы'], 7);
  const iTgId = idx(['Telegram ID'], 9);
  const iEventKey = idx(['Ключ события'], 10);
  const iEventType = idx(['Тип события'], 11);
  const iLegacyTgHelper = idx(['Имя для Telegram-ссылки'], -1);
  const iMessageLink = idx(['Ссылка сообщения'], -1);

  const ss = sheet.getParent();
  const base = ss.getSheetByName(SHEET_BASE);
  const baseMap = base ? buildHistoryBaseMap_(base) : {};
  const output = [];

  for (let r = 1; r < all.length; r++) {
    const source = all[r];
    const title = clean_(source[iDate]);

    if (/^Спецназ с /i.test(title)) {
      output.push([title, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
      continue;
    }

    const tgId = normalizeTgId_(source[iTgId]);
    const baseInfo = tgId && baseMap[tgId] ? baseMap[tgId] : null;
    const baseRow = Math.floor(numberOrZero_(source[iBaseRow])) || (baseInfo ? baseInfo.row : '');

    output.push([
      source[iDate] || '',
      '',
      safeText_(baseInfo ? baseInfo.displayName : clean_(source[iName])),
      safeText_(baseInfo ? baseInfo.teams : clean_(source[iTeam])),
      source[iOld] === '' ? '' : source[iOld],
      source[iNew] === '' ? '' : source[iNew],
      source[iAdded] === '' ? '' : source[iAdded],
      safeText_(clean_(source[iRank])),
      safeText_(normalizeSpecnazTriggerMessage_(source[iMessage])),
      safeText_(clean_(source[iSource])),
      baseRow,
      tgId,
      clean_(source[iEventKey]),
      clean_(source[iEventType]),
      iLegacyTgHelper >= 0 ? safeText_(clean_(source[iLegacyTgHelper])) : '',
      iMessageLink >= 0 ? normalizeSpecnazMessageLink_(source[iMessageLink]) : ''
    ]);
  }

  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, HISTORY_WIDTH).breakApart().clearContent();
    if (output.length) sheet.getRange(2, 1, output.length, HISTORY_WIDTH).setValues(output);
  }

  output.forEach((row, indexRow) => {
    const sheetRow = indexRow + 2;
    if (/^Спецназ с /i.test(clean_(row[0]))) {
      styleHistoryDividerRow_(sheet, sheetRow);
    } else {
      sheet.setRowHeight(sheetRow, 55);
      setHistoryAvatarFormula_(sheet, sheetRow);
      applySpecnazMessageLinkToCell_(
        sheet.getRange(sheetRow, HISTORY_COL_MESSAGE),
        row[HISTORY_COL_MESSAGE_LINK - 1]
      );
    }
  });
}

function repairHistoryRichRowsFromBase_(ss) {
  const history = ss.getSheetByName(SHEET_HISTORY);
  const base = ss.getSheetByName(SHEET_BASE);
  if (!history || !base) return { updated: 0, checked: 0 };

  ensureHistoryStructure_(history);
  const baseMap = buildHistoryBaseMap_(base);
  const lastRow = getHistoryLastContentRow_(history);
  let updated = 0;
  let checked = 0;

  for (let row = 2; row <= lastRow; row++) {
    const title = clean_(history.getRange(row, HISTORY_COL_DATE).getDisplayValue());
    if (/^Спецназ с /i.test(title)) {
      styleHistoryDividerRow_(history, row);
      continue;
    }

    const tgId = normalizeTgId_(history.getRange(row, HISTORY_COL_TG_ID).getDisplayValue());
    if (!tgId) continue;
    checked++;

    const info = baseMap[tgId];
    if (info) {
      history.getRange(row, HISTORY_COL_NAME, 1, 2).setValues([[
        safeText_(info.displayName),
        safeText_(info.teams)
      ]]);
      history.getRange(row, HISTORY_COL_BASE_ROW).setValue(info.row);
      updated++;
    }

    history.getRange(row, HISTORY_COL_TG_ID).setValue(tgId).setNumberFormat('@');
    history.getRange(row, HISTORY_COL_MESSAGE_LINK).setNumberFormat('@');
    history.setRowHeight(row, 55);
    setHistoryAvatarFormula_(history, row);
    applySpecnazMessageLinkToCell_(
      history.getRange(row, HISTORY_COL_MESSAGE),
      history.getRange(row, HISTORY_COL_MESSAGE_LINK).getDisplayValue()
    );
  }

  ensureHistoryConditionalFormatting_(ss);
  return { updated: updated, checked: checked };
}

/**
 * Разово исправляет колонку B / Игрок в существующей истории спецназа.
 * Имя берётся из текущей базы по Telegram ID с приоритетом A -> B -> C -> D.
 * Строки-разделители и записи без Telegram ID не изменяются.
 */
function repairHistoryParticipantNames() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  return repairHistoryRichRowsFromBase_(ss);
}

/**
 * Безопасная подготовка админской истории под ссылки сообщений.
 * Не запускает setup/upgrade и не трогает webhook-триггеры.
 * Публичную структуру дополнит одноимённая функция из 02_PUBLIC_SYNC_V4.gs.
 */
function prepareAdminSpecnazMessageLinksV1() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const history = ss.getSheetByName(SHEET_HISTORY);
  if (!history) throw new Error('Нет листа «' + SHEET_HISTORY + '»');

  ensureHistoryStructure_(history);

  const lastRow = getHistoryLastContentRow_(history);
  let linked = 0;
  let storedLinks = 0;

  for (let row = 2; row <= lastRow; row++) {
    const title = clean_(history.getRange(row, HISTORY_COL_DATE).getDisplayValue());
    if (/^Спецназ с /i.test(title)) continue;

    const link = normalizeSpecnazMessageLink_(
      history.getRange(row, HISTORY_COL_MESSAGE_LINK).getDisplayValue()
    );
    if (!link) continue;
    storedLinks++;
    if (applySpecnazMessageLinkToCell_(history.getRange(row, HISTORY_COL_MESSAGE), link)) {
      linked++;
    }
  }

  const result = {
    status: 'OK',
    history_width: HISTORY_WIDTH,
    message_column: 'I',
    link_column: 'P',
    stored_links: storedLinks,
    linked_messages: linked
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function getSpecnazRank_(value) {
  const score = numberOrZero_(value);
  const levels = [
    [80, 'БОГ СПЕЦНАЗА'],
    [60, 'Легендарный'],
    [48, 'Бессмертный'],
    [38, 'Величайший'],
    [30, 'Маэстро'],
    [22, 'Выдающийся'],
    [14, 'Знаменитый'],
    [8, 'Известный'],
    [4, 'Узнаваемый'],
    [1, 'Начинающий'],
    [0, 'Новичок']
  ];

  for (let i = 0; i < levels.length; i++) {
    if (score >= levels[i][0]) return levels[i][1];
  }

  return 'Новичок';
}

function getSpecnazPeriod_(date) {
  const time = date instanceof Date ? date.getTime() : new Date(date).getTime();
  const weekIndex = Math.floor((time - SPECNAZ_PERIOD_ANCHOR_UTC) / SPECNAZ_WEEK_MS);
  const startTime = SPECNAZ_PERIOD_ANCHOR_UTC + weekIndex * SPECNAZ_WEEK_MS;

  return {
    start: new Date(startTime),
    end: new Date(startTime + SPECNAZ_END_OFFSET_MS)
  };
}

function formatSpecnazPeriodTitle_(startDate, endDate) {
  const months = [
    'января','февраля','марта','апреля','мая','июня',
    'июля','августа','сентября','октября','ноября','декабря'
  ];

  const startDay = Number(Utilities.formatDate(startDate, SPECNAZ_TIME_ZONE, 'd'));
  const endDay = Number(Utilities.formatDate(endDate, SPECNAZ_TIME_ZONE, 'd'));
  const startMonthNumber = Number(Utilities.formatDate(startDate, SPECNAZ_TIME_ZONE, 'M'));
  const endMonthNumber = Number(Utilities.formatDate(endDate, SPECNAZ_TIME_ZONE, 'M'));
  const startYear = Number(Utilities.formatDate(startDate, SPECNAZ_TIME_ZONE, 'yyyy'));
  const endYear = Number(Utilities.formatDate(endDate, SPECNAZ_TIME_ZONE, 'yyyy'));

  if (startYear !== endYear) {
    return 'Спецназ с ' + startDay + ' ' + months[startMonthNumber - 1] + ' ' + startYear +
      ' по ' + endDay + ' ' + months[endMonthNumber - 1] + ' ' + endYear;
  }

  if (startMonthNumber !== endMonthNumber) {
    return 'Спецназ с ' + startDay + ' ' + months[startMonthNumber - 1] +
      ' по ' + endDay + ' ' + months[endMonthNumber - 1] + ' ' + endYear;
  }

  return 'Спецназ с ' + startDay + ' по ' + endDay + ' ' + months[endMonthNumber - 1] + ' ' + endYear;
}

/* ========================================================================== */
/* ЛОГИ И ЗАЩИТА ОТ ПОВТОРНЫХ ВЕБХУКОВ                                      */
/* ========================================================================== */

function startWebhookLog_(ss, event, eventKey, raw, data) {
  const sheetName = (event === 'activity_base' || event === 'activity_outside')
    ? SHEET_ACTIVITY_LOG
    : SHEET_LOG;

  const sheet = ensureLogSheet_(ss, sheetName);
  const row = sheet.getLastRow() + 1;
  const sanitizedRaw = maskSecretInRaw_(raw);

  const targetFirst = event === 'stat' || event === 'antispecnaz';
  const logName = targetFirst
    ? normalizeTelegramDisplayName_(data.reply_username || data.target_username || data.tg_name || data.actor_username)
    : normalizeTelegramDisplayName_(data.tg_name || data.target_username || data.actor_username || data.reply_username);
  const logUsername = targetFirst
    ? normalizePublicUsername_(data.reply_loginlink || data.target_loginlink || data.tg_link || data.actor_loginlink)
    : normalizePublicUsername_(data.tg_link || data.target_loginlink || data.actor_loginlink || data.reply_loginlink);
  const logTgId = targetFirst
    ? normalizeTgId_(data.reply_user_id || data.target_user_id || data.tg_id || data.actor_user_id)
    : normalizeTgId_(data.tg_id || data.target_user_id || data.actor_user_id || data.reply_user_id);

  const values = [[
    new Date(),
    'RECEIVED',
    '***',
    event,
    clean_(data.manual_name || data.real_name),
    logName,
    logUsername,
    logTgId,
    clean_(data.target_reputation || data.reputation || data.target_real_rating || data.real_rating),
    clean_(data.screens || data.screen_count || data.activity || data.target_msg_count),
    clean_(data.screens_delta || data.screens_plus || data.add_screens || data.activity_delta || data.activity_plus || data.add_activity),
    event === 'activity_base' ? 1 : '',
    event === 'activity_outside' ? 1 : '',
    clean_(data.slot || data.account_slot || data.acc || data.akk),
    clean_(data.team || data.command_team),
    clean_(data.nick || data.game_nick || data.nickname),
    clean_(data.role || data.command_role),
    clean_(data.message),
    clean_(data.reply_message),
    sanitizedRaw,
    eventKey,
    '',
    '',
    CRM_VERSION
  ]];

  sheet.getRange(row, 1, 1, values[0].length).setValues(values);
  sheet.getRange(row, 1).setNumberFormat('dd.MM.yyyy H:mm:ss');

  return { sheet: sheet, row: row, eventKey: eventKey };
}

function finishWebhookLog_(ref, result) {
  if (!ref || !ref.sheet || !ref.row) return;

  const status = result && result.status ? result.status : 'UNKNOWN';
  const row = result && result.row ? result.row : '';
  const details = truncate_(JSON.stringify(result || {}), 4500);

  ref.sheet.getRange(ref.row, 2).setValue(status);
  ref.sheet.getRange(ref.row, 22).setValue(row);
  ref.sheet.getRange(ref.row, 23).setValue(details);
}

function ensureLogSheet_(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);

  const headers = [
    'Дата', 'Статус/ошибка', 'secret', 'event', 'Имя', 'Имя тг', '@username', 'id тг',
    'Репутация', 'Скрины', 'Скрины +', 'Активность в базе +', 'Активность вне базы +',
    'Слот', 'Команда', 'Ник', 'Роль', 'Сообщение', 'Ответ/Reply', 'Полный запрос без секрета',
    'Ключ события', 'Строка базы', 'Результат', 'Версия'
  ];

  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  }

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  return sheet;
}

/**
 * reply_message_link — метаданные отображения, а не идентичность события.
 * Убираем только эту строку из raw перед хэшированием, чтобы добавление нового
 * поля в ChatKeeper не изменило eventKey уже существующего события.
 * Для старых payload без этого поля хэш остаётся бит-в-бит прежним.
 */
function eventKeyRawWithoutDisplayMetadata_(raw) {
  return String(raw == null ? '' : raw).replace(
    /(^|\r?\n)reply_message_link=[^\r\n]*(?=\r?\n|$)/g,
    ''
  );
}

function buildEventKey_(event, raw, data) {
  const stable = [
    event,
    normalizeTgId_(data.reply_user_id || data.target_user_id || data.tg_id || data.actor_user_id || data.user_id),
    clean_(data.datetime || data.date || data.time),
    clean_(data.chat_id),
    clean_(data.message),
    clean_(eventKeyRawWithoutDisplayMetadata_(raw))
  ].join('\n');

  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, stable, Utilities.Charset.UTF_8);
  return digest.map(byte => {
    const value = (byte + 256) % 256;
    return ('0' + value.toString(16)).slice(-2);
  }).join('');
}

function isProcessedEvent_(ss, eventKey) {
  const sheet = ensureProcessedSheet_(ss);
  if (!eventKey || sheet.getLastRow() < 2) return false;

  const found = sheet
    .getRange(2, 2, sheet.getLastRow() - 1, 1)
    .createTextFinder(eventKey)
    .matchEntireCell(true)
    .findNext();

  return !!found;
}

function markProcessedEvent_(ss, eventKey, event, tgId, result) {
  const sheet = ensureProcessedSheet_(ss);
  const expires = new Date(Date.now() + PROCESSED_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  sheet.appendRow([
    new Date(),
    eventKey,
    event,
    normalizeTgId_(tgId),
    result,
    expires
  ]);

  const row = sheet.getLastRow();
  sheet.getRange(row, 1).setNumberFormat('dd.MM.yyyy H:mm:ss');
  sheet.getRange(row, 4).setNumberFormat('@');
  sheet.getRange(row, 6).setNumberFormat('dd.MM.yyyy');
}

function ensureProcessedSheet_(ss) {
  let sheet = ss.getSheetByName(SHEET_PROCESSED);
  if (!sheet) sheet = ss.insertSheet(SHEET_PROCESSED);

  const headers = ['Дата', 'Ключ события', 'Событие', 'Telegram ID', 'Результат', 'Удалить после'];
  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  }

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  return sheet;
}

function cleanupProcessedEvents_(ss) {
  const sheet = ensureProcessedSheet_(ss);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const values = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  const now = Date.now();

  const keep = values.filter(row => {
    const expiry = row[5] instanceof Date ? row[5].getTime() : 0;
    return !expiry || expiry >= now;
  });

  sheet.getRange(2, 1, Math.max(sheet.getMaxRows() - 1, 1), 6).clearContent();

  if (keep.length) {
    sheet.getRange(2, 1, keep.length, 6).setValues(keep);
  }
}

function maskSecretInRaw_(raw) {
  let text = String(raw || '');

  text = text.replace(/(^|[\r\n])secret\s*=\s*[^\r\n]*/gi, '$1secret=***');
  text = text.replace(/"secret"\s*:\s*"[^"]*"/gi, '"secret":"***"');

  return truncate_(text, 45000);
}


/**
 * Ручной запуск сортировки базы.
 * Обычные участники остаются сверху, «Вышел» идут после них, пустые строки — последними.
 */
function sortBaseParticipants() {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const result = sortBaseByChatState_(ss);
    SpreadsheetApp.flush();
    return result;
  } finally {
    try {
      lock.releaseLock();
    } catch (err) {}
  }
}

/**
 * Стабильная сортировка базы без повреждения массивных формул T и W:AA.
 * Сохраняет текущий порядок внутри каждой группы.
 */
function sortBaseByChatState_(ss) {
  const sheet = ss.getSheetByName(SHEET_BASE);
  if (!sheet) return { status: 'BASE_SHEET_NOT_FOUND' };

  const rowCount = BASE_LAST_ROW - BASE_FIRST_ROW + 1;
  if (rowCount <= 0) return { status: 'NO_ROWS' };

  SpreadsheetApp.flush();

  const display = sheet
    .getRange(BASE_FIRST_ROW, 1, rowCount, COL_CHAT_STATE)
    .getDisplayValues();

  const sortKeys = display.map((row, index) => {
    const tgId = clean_(row[COL_TG_ID - 1]);
    const state = clean_(row[COL_CHAT_STATE - 1]);

    let group = 0;
    if (!tgId) group = 2;
    else if (state === 'Вышел') group = 1;

    return [group, index + 1];
  });

  // Временно убираем массивные формулы, чтобы их якоря не участвовали в сортировке.
  sheet.getRange('T2:T999').clearContent();
  sheet.getRange('W2:AA999').clearContent();

  sheet
    .getRange(BASE_FIRST_ROW, COL_SORT_GROUP, rowCount, 2)
    .setValues(sortKeys);

  sheet
    .getRange(BASE_FIRST_ROW, 1, rowCount, COL_SORT_ORDER)
    .sort([
      { column: COL_SORT_GROUP, ascending: true },
      { column: COL_SORT_ORDER, ascending: true }
    ]);

  sheet
    .getRange(BASE_FIRST_ROW, COL_SORT_GROUP, rowCount, 2)
    .clearContent();

  // Возвращаем формулы строго в их якорные ячейки.
  sheet.getRange('T2').setFormula(baseStatusFormula_());
  SLOT_DEFS.forEach(slot => {
    sheet.getRange(2, slot.gameCol).setFormula(gameFormulaForSlot_(slot));
  });

  applyAllRoleValidations_(ss);

  try {
    sheet.hideColumns(COL_SORT_GROUP, 2);
  } catch (err) {}

  SpreadsheetApp.flush();

  const leftCount = sortKeys.filter(row => row[0] === 1).length;
  const activeCount = sortKeys.filter(row => row[0] === 0).length;

  return {
    status: 'OK',
    active_rows: activeCount,
    left_rows: leftCount
  };
}

/* ========================================================================== */
/* ПОДГОТОВКА ТАБЛИЦЫ                                                        */
/* ========================================================================== */

function isRoyalCrmV2Ready_(ss) {
  const version = PropertiesService.getScriptProperties().getProperty(PROPERTY_STRUCTURE_VERSION);
  if (COMPATIBLE_STRUCTURE_VERSIONS.indexOf(version) === -1) return false;

  const required = [
    SHEET_BASE, SHEET_TEAMS, SHEET_HISTORY, SHEET_LOG,
    SHEET_ACTIVITY_LOG, SHEET_PROCESSED, SHEET_SNAPSHOT
  ];

  return required.every(name => !!ss.getSheetByName(name));
}

function ensureMinimumGridSizes_(ss) {
  const base = ss.getSheetByName(SHEET_BASE);
  if (!base) throw new Error('Не найден лист «' + SHEET_BASE + '»');

  if (base.getMaxRows() < BASE_LAST_ROW) {
    base.insertRowsAfter(base.getMaxRows(), BASE_LAST_ROW - base.getMaxRows());
  }

  if (base.getMaxColumns() < COL_CHAT_STATE) {
    base.insertColumnsAfter(base.getMaxColumns(), COL_CHAT_STATE - base.getMaxColumns());
  }

  const connections = ss.getSheetByName(SHEET_CONNECTIONS);
  if (connections) {
    if (connections.getMaxRows() < 2000) connections.insertRowsAfter(connections.getMaxRows(), 2000 - connections.getMaxRows());
    if (connections.getMaxColumns() < 14) connections.insertColumnsAfter(connections.getMaxColumns(), 14 - connections.getMaxColumns());
  }

  const search = ss.getSheetByName(SHEET_SEARCH);
  if (search && search.getMaxColumns() < 32) {
    search.insertColumnsAfter(search.getMaxColumns(), 32 - search.getMaxColumns());
  }

  const history = ss.getSheetByName(SHEET_HISTORY);
  if (history && history.getMaxColumns() < HISTORY_WIDTH) {
    history.insertColumnsAfter(history.getMaxColumns(), HISTORY_WIDTH - history.getMaxColumns());
  }
}

function ensureAuxiliarySheets_(ss) {
  ensureLogSheet_(ss, SHEET_LOG);
  ensureLogSheet_(ss, SHEET_ACTIVITY_LOG);
  ensureProcessedSheet_(ss);
  ensureSnapshotSheet_(ss);
}

function prepareLogSheets_(ss) {
  const main = ensureLogSheet_(ss, SHEET_LOG);
  const activity = ensureLogSheet_(ss, SHEET_ACTIVITY_LOG);

  // Удаляем старую QUERY, которая показывала активность из основного лога.
  const formulas = activity.getDataRange().getFormulas();

  formulas.forEach((row, r) => {
    row.forEach((formula, c) => {
      if (formula && /QUERY\s*\(\s*'Лог вебхуков'/i.test(formula)) {
        activity.getRange(r + 1, c + 1).clearContent();
      }
    });
  });

  // Фильтр, скрывавший activity_* в основном логе, больше не нужен.
  const filter = main.getFilter();
  if (filter) filter.remove();
}

function migrateTelegramIdentityColumns_(ss) {
  const sheet = ss.getSheetByName(SHEET_BASE);
  if (!sheet) return;

  sheet.getRange('C1').setValue('Ссылка тг');
  sheet.getRange('D1').setValue('id тг');

  const range = sheet.getRange(BASE_FIRST_ROW, COL_TG_USERNAME, BASE_LAST_ROW - BASE_FIRST_ROW + 1, 2);
  const values = range.getDisplayValues();
  const output = [];

  values.forEach(row => {
    output.push([
      normalizePublicUsername_(row[0]),
      normalizeTgId_(row[1])
    ]);
  });

  range.setValues(output);
  sheet.getRange(BASE_FIRST_ROW, COL_TG_USERNAME, output.length, 2).setNumberFormat('@');

  const usernameRule = SpreadsheetApp.newDataValidation()
    .requireFormulaSatisfied('=OR(C2="";REGEXMATCH(C2;"^@[A-Za-z0-9_]{5,32}$"))')
    .setAllowInvalid(false)
    .setHelpText('Только @username или пустая ячейка')
    .build();

  const idRule = SpreadsheetApp.newDataValidation()
    .requireFormulaSatisfied('=OR(D2="";AND(REGEXMATCH(TO_TEXT(D2);"^[0-9]{5,20}$");COUNTIF($D$2:$D$999;D2)=1))')
    .setAllowInvalid(false)
    .setHelpText('Только уникальный цифровой Telegram ID')
    .build();

  sheet.getRange('C2:C999').setDataValidation(usernameRule);
  sheet.getRange('D2:D999').setDataValidation(idRule);
}

function migrateLegacyRoles_(ss) {
  const sheet = ss.getSheetByName(SHEET_BASE);
  if (!sheet) return;

  SLOT_DEFS.forEach(slot => {
    const teams = sheet.getRange(BASE_FIRST_ROW, slot.teamCol, BASE_LAST_ROW - BASE_FIRST_ROW + 1, 1).getDisplayValues();
    const roles = sheet.getRange(BASE_FIRST_ROW, slot.roleCol, BASE_LAST_ROW - BASE_FIRST_ROW + 1, 1).getDisplayValues();
    const games = sheet.getRange(BASE_FIRST_ROW, slot.gameCol, BASE_LAST_ROW - BASE_FIRST_ROW + 1, 1).getDisplayValues();
    const output = [];

    for (let i = 0; i < roles.length; i++) {
      const team = clean_(teams[i][0]);
      const rawRole = clean_(roles[i][0]);
      const normalized = normalizeRole_(rawRole);
      const game = normalizeGame_(games[i][0]) || inferGameFromTeamOrRole_(team, rawRole);
      let finalRole = rawRole;

      if (team && (normalized === 'Спецназ' || ROLE_SPECNAZ.indexOf(normalized) !== -1)) {
        // В новой модели Спецназ РМ/РК существует только без команды.
        // Если команда заполнена, наиболее нейтральная допустимая роль — Игрок.
        finalRole = 'Игрок';
      } else if (normalized === 'Спецназ') {
        if (game === 'Royal Match') finalRole = 'Спецназ РМ';
        else if (game === 'Royal Kingdom') finalRole = 'Спецназ РК';
        else finalRole = '';
      } else if (normalized) {
        finalRole = normalized;
      }

      output.push([finalRole]);
    }

    sheet.getRange(BASE_FIRST_ROW, slot.roleCol, output.length, 1).setValues(output);
  });
}

function ensureSnapshotSheet_(ss) {
  let sheet = ss.getSheetByName(SHEET_SNAPSHOT);
  if (!sheet) sheet = ss.insertSheet(SHEET_SNAPSHOT);

  const headers = ['Telegram ID', 'Спецназ', 'Скрины', 'Активность в базе', 'Активность вне базы', 'Обновлено'];

  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  }

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  sheet.getRange('A:A').setNumberFormat('@');
  return sheet;
}

function rebuildCounterSnapshot_(ss) {
  const base = ss.getSheetByName(SHEET_BASE);
  const snapshot = ensureSnapshotSheet_(ss);
  if (!base) return;

  const values = base.getRange(BASE_FIRST_ROW, COL_TG_ID, BASE_LAST_ROW - BASE_FIRST_ROW + 1, 27).getValues();
  const rows = [];

  values.forEach(row => {
    const id = normalizeTgId_(row[0]);
    if (!id) return;

    rows.push([
      id,
      numberOrZero_(row[COL_SPECNAZ - COL_TG_ID]),
      numberOrZero_(row[COL_SCREENS - COL_TG_ID]),
      numberOrZero_(row[COL_ACTIVITY_BASE - COL_TG_ID]),
      numberOrZero_(row[COL_ACTIVITY_OUTSIDE - COL_TG_ID]),
      new Date()
    ]);
  });

  snapshot.getRange(2, 1, Math.max(snapshot.getMaxRows() - 1, 1), 6).clearContent();

  if (rows.length) {
    snapshot.getRange(2, 1, rows.length, 6).setValues(rows);
    snapshot.getRange(2, 1, rows.length, 1).setNumberFormat('@');
    snapshot.getRange(2, 6, rows.length, 1).setNumberFormat('dd.MM.yyyy H:mm:ss');
  }
}

function updateCounterSnapshotForRow_(ss, base, row) {
  const id = normalizeTgId_(base.getRange(row, COL_TG_ID).getDisplayValue());
  if (!id) return;

  const snapshot = ensureSnapshotSheet_(ss);
  const lastRow = snapshot.getLastRow();
  let targetRow = 0;

  if (lastRow >= 2) {
    const found = snapshot.getRange(2, 1, lastRow - 1, 1)
      .createTextFinder(id)
      .matchEntireCell(true)
      .findNext();

    if (found) targetRow = found.getRow();
  }

  if (!targetRow) targetRow = snapshot.getLastRow() + 1;

  snapshot.getRange(targetRow, 1, 1, 6).setValues([[
    id,
    numberOrZero_(base.getRange(row, COL_SPECNAZ).getValue()),
    numberOrZero_(base.getRange(row, COL_SCREENS).getValue()),
    numberOrZero_(base.getRange(row, COL_ACTIVITY_BASE).getValue()),
    numberOrZero_(base.getRange(row, COL_ACTIVITY_OUTSIDE).getValue()),
    new Date()
  ]]);

  snapshot.getRange(targetRow, 1).setNumberFormat('@');
  snapshot.getRange(targetRow, 6).setNumberFormat('dd.MM.yyyy H:mm:ss');
}

function installMobileRoleLists() {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000);

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    // Старые дополнительные фиксы больше не нужны и могут конфликтовать
    // с простым onEdit из основного кода.
    const obsoleteHandlers = [
      'handleNoTeamSelection',
      'handleAdminRoleDropdownEdit'
    ];

    ScriptApp.getProjectTriggers().forEach(trigger => {
      if (obsoleteHandlers.indexOf(trigger.getHandlerFunction()) !== -1) {
        ScriptApp.deleteTrigger(trigger);
      }
    });

    ensureRoleHelperLists_(ss);
    applyAllRoleValidations_(ss);
    SpreadsheetApp.flush();

    const result = {
      status: 'OK',
      mode: 'STATIC_ROW_RANGES',
      rows: BASE_LAST_ROW - BASE_FIRST_ROW + 1,
      slots: SLOT_DEFS.length,
      removed_handlers: obsoleteHandlers
    };

    console.log(JSON.stringify(result, null, 2));
    return result;

  } finally {
    try {
      lock.releaseLock();
    } catch (error) {}
  }
}

function ensureRoleHelperLists_(ss) {
  const helper = ss.getSheetByName(ROLE_HELPER_SHEET);

  if (!helper) {
    throw new Error('Не найден скрытый лист «' + ROLE_HELPER_SHEET + '»');
  }

  const rows = BASE_LAST_ROW - BASE_FIRST_ROW + 1;
  const width = SLOT_DEFS.length * ROLE_HELPER_WIDTH_PER_SLOT;
  const formulas = [];

  for (let row = BASE_FIRST_ROW; row <= BASE_LAST_ROW; row++) {
    const formulaRow = [];

    SLOT_DEFS.forEach(slot => {
      const teamColumn = columnToLetter_(slot.teamCol);
      const teamCell = "'" + SHEET_BASE + "'!" + teamColumn + row;

      formulaRow.push(
        '=IF(' + teamCell + '<>"";"Лидер";"Спецназ РМ")',
        '=IF(' + teamCell + '<>"";"Помощник";"Спецназ РК")',
        '=IF(' + teamCell + '<>"";"Игрок";"")'
      );
    });

    formulas.push(formulaRow);
  }

  const headers = [];
  SLOT_DEFS.forEach(slot => {
    headers.push(
      'Роль ' + slot.number + ' — 1',
      'Роль ' + slot.number + ' — 2',
      'Роль ' + slot.number + ' — 3'
    );
  });

  helper
    .getRange(1, ROLE_HELPER_FIRST_COL, 1, width)
    .setValues([headers]);

  helper
    .getRange(BASE_FIRST_ROW, ROLE_HELPER_FIRST_COL, rows, width)
    .setFormulas(formulas);

  ensureNoTeamOptionInTeamList_(helper);
}

function ensureNoTeamOptionInTeamList_(helper) {
  const formula =
    '={"НЕТ КОМАНДЫ"\\"";SORT(FILTER({' +
    "'Команды'!B2:B999&\" — \"&IF('Команды'!A2:A999=\"Royal Match\";\"РМ\";" +
    "IF('Команды'!A2:A999=\"Royal Kingdom\";\"РК\";\"\"))\\'Команды'!A2:A999};" +
    "'Команды'!B2:B999<>\"\");1;TRUE)}";

  helper.getRange('A2').setFormula(formula);
}

function roleHelperStartColumn_(slot) {
  return ROLE_HELPER_FIRST_COL +
    (slot.number - 1) * ROLE_HELPER_WIDTH_PER_SLOT;
}

function buildRoleRangeRule_(helper, row, slot) {
  const helperRange = helper.getRange(
    row,
    roleHelperStartColumn_(slot),
    1,
    ROLE_HELPER_WIDTH_PER_SLOT
  );

  return SpreadsheetApp.newDataValidation()
    .requireValueInRange(helperRange, true)
    .setAllowInvalid(false)
    .setHelpText('Роль зависит от наличия команды')
    .build();
}

function applyAllRoleValidations_(ss) {
  const sheet = ss.getSheetByName(SHEET_BASE);
  const helper = ss.getSheetByName(ROLE_HELPER_SHEET);

  if (!sheet || !helper) return;

  ensureRoleHelperLists_(ss);

  const rows = BASE_LAST_ROW - BASE_FIRST_ROW + 1;

  SLOT_DEFS.forEach(slot => {
    const validations = [];

    for (let row = BASE_FIRST_ROW; row <= BASE_LAST_ROW; row++) {
      validations.push([buildRoleRangeRule_(helper, row, slot)]);
    }

    sheet
      .getRange(BASE_FIRST_ROW, slot.roleCol, rows, 1)
      .setDataValidations(validations);
  });
}

function applyRoleValidationForCell_(sheet, row, slot) {
  const helper = sheet.getParent().getSheetByName(ROLE_HELPER_SHEET);

  if (!helper) {
    throw new Error('Не найден скрытый лист «' + ROLE_HELPER_SHEET + '»');
  }

  sheet
    .getRange(row, slot.roleCol)
    .setDataValidation(buildRoleRangeRule_(helper, row, slot));
}

function updateRoleRulesAfterEdit_(sheet, startRow, endRow, startCol, endCol) {
  SLOT_DEFS.forEach(slot => {
    const touchesTeam = startCol <= slot.teamCol && endCol >= slot.teamCol;
    const touchesRole = startCol <= slot.roleCol && endCol >= slot.roleCol;

    if (!touchesTeam && !touchesRole) return;

    for (let row = startRow; row <= endRow; row++) {
      const teamCell = sheet.getRange(row, slot.teamCol);
      const roleCell = sheet.getRange(row, slot.roleCol);

      let team = clean_(teamCell.getDisplayValue());
      let role = clean_(roleCell.getDisplayValue());

      if (touchesTeam && team.toUpperCase() === NO_TEAM_OPTION) {
        teamCell.clearContent();
        roleCell.clearContent();
        team = '';
        role = '';
      }

      if (touchesTeam) {
        if (team && ROLE_TEAM.indexOf(role) === -1) {
          role = 'Игрок';
          roleCell.setValue(role);
        } else if (!team && ROLE_SPECNAZ.indexOf(role) === -1) {
          roleCell.clearContent();
          role = '';
        }
      }

      if (touchesRole) {
        const normalized = normalizeRole_(role);

        if (team && ROLE_TEAM.indexOf(normalized) !== -1) {
          roleCell.setValue(normalized);
        } else if (!team && ROLE_SPECNAZ.indexOf(normalized) !== -1) {
          roleCell.setValue(normalized);
        } else if (role) {
          roleCell.clearContent();
        }
      }

      // Правило всегда указывает на постоянный диапазон своей строки.
      // Меняется только содержимое служебных ячеек, поэтому Android не должен
      // держать старый список от другой строки.
      applyRoleValidationForCell_(sheet, row, slot);
    }
  });
}

function normalizeManualIdentityEdits_(sheet, startRow, endRow, startCol, endCol) {
  if (startCol <= COL_TG_USERNAME && endCol >= COL_TG_USERNAME) {
    const range = sheet.getRange(startRow, COL_TG_USERNAME, endRow - startRow + 1, 1);
    const values = range.getDisplayValues().map(row => [normalizePublicUsername_(row[0])]);
    range.setValues(values).setNumberFormat('@');
  }

  if (startCol <= COL_TG_ID && endCol >= COL_TG_ID) {
    const range = sheet.getRange(startRow, COL_TG_ID, endRow - startRow + 1, 1);
    const values = range.getDisplayValues().map(row => [normalizeTgId_(row[0])]);
    range.setValues(values).setNumberFormat('@');
  }
}

function processManualCounterEdits_(ss, sheet, startRow, endRow, startCol, endCol, e) {
  const watched = [COL_SPECNAZ, COL_SCREENS, COL_ACTIVITY_BASE, COL_ACTIVITY_OUTSIDE];
  const touchesWatched = watched.some(col => startCol <= col && endCol >= col);
  if (!touchesWatched) return;

  const snapshot = ensureSnapshotSheet_(ss);
  const snapshotMap = getSnapshotMap_(snapshot);

  for (let row = startRow; row <= endRow; row++) {
    const id = normalizeTgId_(sheet.getRange(row, COL_TG_ID).getDisplayValue());
    if (!id) continue;

    const current = {
      specnaz: numberOrZero_(sheet.getRange(row, COL_SPECNAZ).getValue()),
      screens: numberOrZero_(sheet.getRange(row, COL_SCREENS).getValue()),
      base: numberOrZero_(sheet.getRange(row, COL_ACTIVITY_BASE).getValue()),
      outside: numberOrZero_(sheet.getRange(row, COL_ACTIVITY_OUTSIDE).getValue())
    };

    const previous = snapshotMap[id];

    if (previous) {
      if (current.specnaz > previous.specnaz) {
        const manualKey = buildManualEventKey_(id, row, current.specnaz, e);

        recordSpecnazHistory_(
          ss,
          sheet,
          row,
          previous.specnaz,
          current.specnaz,
          'Ручное изменение',
          id,
          manualKey,
          'manual'
        );
      }

      if (current.specnaz !== previous.specnaz || current.screens !== previous.screens) {
        sheet.getRange(row, COL_LAST_CHANGE).setValue(new Date());
      }
    }

    updateCounterSnapshotForRow_(ss, sheet, row);
  }
}

function getSnapshotMap_(sheet) {
  const lastRow = sheet.getLastRow();
  const map = {};
  if (lastRow < 2) return map;

  sheet.getRange(2, 1, lastRow - 1, 5).getValues().forEach(row => {
    const id = normalizeTgId_(row[0]);
    if (!id) return;

    map[id] = {
      specnaz: numberOrZero_(row[1]),
      screens: numberOrZero_(row[2]),
      base: numberOrZero_(row[3]),
      outside: numberOrZero_(row[4])
    };
  });

  return map;
}

function buildManualEventKey_(tgId, row, value, e) {
  const raw = [
    'manual', tgId, row, value,
    e && e.range ? e.range.getA1Notation() : '',
    new Date().toISOString()
  ].join('|');

  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  return digest.map(byte => ('0' + (((byte + 256) % 256).toString(16))).slice(-2)).join('');
}

/* ========================================================================== */
/* ФОРМУЛЫ                                                                   */
/* ========================================================================== */

function restoreCoreFormulas_(ss) {
  const base = ss.getSheetByName(SHEET_BASE);
  if (base) {
    base.getRange('T2:T999').clearContent();
    base.getRange('T2').setFormula(baseStatusFormula_());

    base.getRange('W2:AA999').clearContent();
    SLOT_DEFS.forEach(slot => {
      base.getRange(2, slot.gameCol).setFormula(gameFormulaForSlot_(slot));
    });
  }

  const connections = ss.getSheetByName(SHEET_CONNECTIONS);
  if (connections) {
    const headers = [
      'Имя','Имя тг','Ссылка тг','id тг','Команда','Игрок','Роль','Статус',
      'Спецназ','Скрины','Дата','Игра','Активность в базе','Активность вне базы'
    ];
    connections.getRange(1, 1, 1, 14).setValues([headers]);
    connections.getRange(2, 1, connections.getMaxRows() - 1, 14).clearContent();
    connections.getRange('A2').setFormula(connectionsFormula_());
  }

  const teams = ss.getSheetByName(SHEET_TEAMS);
  if (teams) {
    teams.getRange('E2:L999').clearContent();
    teams.getRange('E2').setFormula('=MAP(A2:A999;B2:B999;LAMBDA(game;team;IF(team="";"";COUNTIFS(\'Связи участников\'!$L:$L;game;\'Связи участников\'!$E:$E;team))))');
    teams.getRange('F2').setFormula('=MAP(A2:A999;B2:B999;LAMBDA(game;team;IF(team="";"";SUMIFS(\'Связи участников\'!$I:$I;\'Связи участников\'!$L:$L;game;\'Связи участников\'!$E:$E;team))))');
    teams.getRange('G2').setFormula('=ARRAYFORMULA(IF(B2:B999="";"";F2:F999+IFERROR(VALUE(H2:H999);0)/1000+(1000-ROW(B2:B999))/1000000))');
    teams.getRange('H2').setFormula('=MAP(A2:A999;B2:B999;LAMBDA(game;team;IF(team="";"";SUMIFS(\'Связи участников\'!$J:$J;\'Связи участников\'!$L:$L;game;\'Связи участников\'!$E:$E;team))))');
    teams.getRange('I2').setFormula('=MAP(A2:A999;B2:B999;LAMBDA(game;team;IF(team="";"";SUMIFS(\'Связи участников\'!M:M;\'Связи участников\'!L:L;game;\'Связи участников\'!E:E;team))))');
    teams.getRange('J2').setFormula('=MAP(A2:A999;B2:B999;LAMBDA(game;team;IF(team="";"";SUMIFS(\'Связи участников\'!N:N;\'Связи участников\'!L:L;game;\'Связи участников\'!E:E;team))))');
    teams.getRange('K2').setFormula('=ARRAYFORMULA(IF(B2:B999="";"";IF(E2:E999=0;0;(IFERROR(I2:I999*1;0)+IFERROR(J2:J999*1;0))/E2:E999)))');
    teams.getRange('L2').setFormula(teamStatusFormula_());
  }

  const teamRating = ss.getSheetByName(SHEET_TEAM_RATING);
  if (teamRating) {
    teamRating.getRange('A2:G999').clearContent();
    teamRating.getRange('A2').setFormula('=ARRAYFORMULA(IF(B2:B="";"";ROW(B2:B)-1))');
    teamRating.getRange('B2').setFormula(teamRatingFormula_());
  }

  const playerRating = ss.getSheetByName(SHEET_PLAYER_RATING);
  if (playerRating) {
    playerRating.getRange('A2:J999').clearContent();
    playerRating.getRange('A2').setFormula('=ARRAYFORMULA(IF(LEN(B2:B)+LEN(C2:C)+LEN(F2:F)=0;"";ROW(B2:B)-1))');
    playerRating.getRange('B2').setFormula(playerRatingFormula_());
  }

  const search = ss.getSheetByName(SHEET_SEARCH);
  if (search) {
    search.getRange('AE5').setValue('Активность в базе');
    search.getRange('AF5').setValue('Активность вне базы');
    search.getRange('A2').setValue('Примеры: Маша | РМ | РК | статус активен | спецназ>5 | скрины>1 | база>3 | вне>2');

    // B:AG — 32 поля поиска; A — отдельный столбец аватаров.
    search.getRange('A6:AG999').clearContent();
    search.getRange('B6').setFormula(searchFormula_());
    setAvatarLookupFormulas_(search, 6, 999, 'E');
  }

  const card = ss.getSheetByName(SHEET_TEAM_CARD);
  if (card) {
    card.getRange('B5').setFormula('=IF($B$2="";"";IFNA(INDEX(FILTER(\'Команды\'!$C$2:$C$999;\'Команды\'!$B$2:$B$999=REGEXREPLACE($B$2;"\\s+—\\s+(РМ|РК)$";"");\'Команды\'!$A$2:$A$999=IF(REGEXMATCH($B$2;"\\s+—\\s+РМ$");"Royal Match";"Royal Kingdom"));1);""))');

    // A — аватар, B:H — данные участника, I — скрытый Telegram ID.
    card.getRange('A15:I80').clearContent();
    card.getRange('B15').setFormula(teamCardMembersFormula_());
    card.getRange('I15').setFormula(teamCardIdsFormula_());
    card.getRange('I15:I80').setNumberFormat('@');
    setAvatarLookupFormulas_(card, 15, 80, 'I');
  }
}

function setAvatarLookupFormulas_(sheet, startRow, endRow, idColumnLetter) {
  const formulas = [];

  for (let row = startRow; row <= endRow; row++) {
    formulas.push([
      '=IF($' + idColumnLetter + row + '="";"";' +
      'IFNA(INDEX(\'Аватары\'!$B$2:$B$999;' +
      'MATCH(TO_TEXT($' + idColumnLetter + row + ');' +
      'ARRAYFORMULA(TO_TEXT(\'Аватары\'!$A$2:$A$999));0));""))'
    ]);
  }

  sheet
    .getRange(startRow, 1, formulas.length, 1)
    .setFormulas(formulas)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
}

function teamCardMembersFormula_() {
  return String.raw`=IF($B$2="";"";IFNA(FILTER({'Связи участников'!A2:A\'Связи участников'!B2:B\'Связи участников'!F2:F\'Связи участников'!G2:G\'Связи участников'!H2:H\'Связи участников'!I2:I\'Связи участников'!J2:J};'Связи участников'!E2:E=REGEXREPLACE($B$2;"\s+—\s+(РМ|РК)$";"");'Связи участников'!L2:L=IF(REGEXMATCH($B$2;"\s+—\s+РМ$");"Royal Match";IF(REGEXMATCH($B$2;"\s+—\s+РК$");"Royal Kingdom";"")));"Нет участников"))`;
}

function teamCardIdsFormula_() {
  return String.raw`=IF($B$2="";"";IFNA(FILTER('Связи участников'!D2:D;'Связи участников'!E2:E=REGEXREPLACE($B$2;"\s+—\s+(РМ|РК)$";"");'Связи участников'!L2:L=IF(REGEXMATCH($B$2;"\s+—\s+РМ$");"Royal Match";IF(REGEXMATCH($B$2;"\s+—\s+РК$");"Royal Kingdom";"")));""))`;
}

function baseStatusFormula_() {
  return '=ARRAYFORMULA(IF((D2:D999&E2:E999&F2:F999&H2:H999&I2:I999&K2:K999&L2:L999&N2:N999&O2:O999&Q2:Q999&R2:R999)="";"";IF(AF2:AF999="Вышел";"Неактивен";IF((IFERROR(U2:U999*1;0)+IFERROR(AB2:AB999*1;0))=0;"На паузе";IF(TODAY()-IF(AE2:AE999<>"";AE2:AE999;V2:V999)>30;"На паузе";"Активен")))))';
}

function gameFormulaForSlot_(slot) {
  const teamLetter = columnToLetter_(slot.teamCol);
  const roleLetter = columnToLetter_(slot.roleCol);

  return '=MAP(' + teamLetter + '2:' + teamLetter + '999;' + roleLetter + '2:' + roleLetter + '999;LAMBDA(team;role;' +
    'IF(team="";' +
      'IF(role="Спецназ РМ";"Royal Match";IF(role="Спецназ РК";"Royal Kingdom";""));' +
      'IF(REGEXMATCH(team;"\\s+—\\s+РМ$");"Royal Match";' +
        'IF(REGEXMATCH(team;"\\s+—\\s+РК$");"Royal Kingdom";' +
          'IF(SUM(N(EXACT(team;\'Команды\'!$B$2:$B$999)))>1;"ПРОВЕРИТЬ";' +
            'IFNA(INDEX(FILTER(\'Команды\'!$A$2:$A$999;EXACT(team;\'Команды\'!$B$2:$B$999));1);"ПРОВЕРИТЬ")' +
          ')' +
        ')' +
      ')' +
    ')' +
  '))';
}

function connectionsFormula_() {
  const empty14 = '♦♦♦♦♦♦♦♦♦♦♦♦♦';
  const blocks = SLOT_DEFS.map(slot => {
    const team = columnToLetter_(slot.teamCol);
    const nick = columnToLetter_(slot.nickCol);
    const role = columnToLetter_(slot.roleCol);
    const game = columnToLetter_(slot.gameCol);

    return 'IFERROR(FILTER({' +
      '\'База участников\'!A2:D999\\' +
      'REGEXREPLACE(\'База участников\'!' + team + '2:' + team + '999;"\\s+—\\s+(РМ|РК)$";"")\\' +
      '\'База участников\'!' + nick + '2:' + nick + '999\\' +
      '\'База участников\'!' + role + '2:' + role + '999\\' +
      '\'База участников\'!T2:T999\\' +
      '\'База участников\'!U2:U999\\' +
      '\'База участников\'!AB2:AB999\\' +
      '\'База участников\'!V2:V999\\' +
      '\'База участников\'!' + game + '2:' + game + '999\\' +
      '\'База участников\'!AC2:AC999\\' +
      '\'База участников\'!AD2:AD999};' +
      '((\'База участников\'!' + team + '2:' + team + '999<>"")+' +
      'REGEXMATCH(\'База участников\'!' + role + '2:' + role + '999;"^Спецназ (РМ|РК)$"))>0);' +
      'SPLIT("' + empty14 + '";"♦";FALSE;FALSE))';
  });

  return '=QUERY({' + blocks.join(';') + '};"select * where Col5 is not null or Col7 matches \'^Спецназ (РМ|РК)$\'";0)';
}

function teamStatusFormula_() {
  return '=MAP(A2:A999;B2:B999;F2:F999;H2:H999;LAMBDA(game;team;spec;screens;IF(team="";"";' +
    'IF(COUNTIFS(\'Связи участников\'!$L:$L;game;\'Связи участников\'!$E:$E;team)=0;"Неактивен";' +
    'IF(COUNTIFS(\'Связи участников\'!$L:$L;game;\'Связи участников\'!$E:$E;team;\'Связи участников\'!$H:$H;"<>Неактивен")=0;"Неактивен";' +
    'IF((IFERROR(spec*1;0)+IFERROR(screens*1;0))=0;"На паузе";' +
    'IF(COUNTIFS(\'Связи участников\'!$L:$L;game;\'Связи участников\'!$E:$E;team;\'Связи участников\'!$H:$H;"Активен")>0;"Активен";"На паузе")))))))';
}

function teamRatingFormula_() {
  return '=IFNA(QUERY(SORT(FILTER({' +
    '\'Команды\'!A2:A999\\\'Команды\'!B2:B999\\\'Команды\'!E2:E999\\\'Команды\'!F2:F999\\\'Команды\'!H2:H999\\\'Команды\'!L2:L999\\' +
    'IF(IFERROR(\'Команды\'!F2:F999*1;0)>0;1;IF(IFERROR(\'Команды\'!H2:H999*1;0)>0;2;3))\\' +
    'IFERROR(\'Команды\'!F2:F999*1;0)\\IFERROR(\'Команды\'!H2:H999*1;0)\\' +
    'IF(\'Команды\'!L2:L999="Активен";1;IF(\'Команды\'!L2:L999="На паузе";2;IF(\'Команды\'!L2:L999="Неактивен";3;4)))};' +
    '\'Команды\'!B2:B999<>"");7;TRUE;8;FALSE;9;FALSE;10;TRUE;2;TRUE);' +
    '"select Col1,Col2,Col3,Col4,Col5,Col6";0);"")';
}

function playerRatingFormula_() {
  return String.raw`=IFNA(QUERY(SORT(FILTER({'База участников'!A2:A999\'База участников'!B2:B999\IF('База участников'!E2:E999<>"";REGEXREPLACE('База участников'!E2:E999;"\s+—\s+(РМ|РК)$";"");IF('База участников'!H2:H999<>"";REGEXREPLACE('База участников'!H2:H999;"\s+—\s+(РМ|РК)$";"");IF('База участников'!K2:K999<>"";REGEXREPLACE('База участников'!K2:K999;"\s+—\s+(РМ|РК)$";"");IF('База участников'!N2:N999<>"";REGEXREPLACE('База участников'!N2:N999;"\s+—\s+(РМ|РК)$";"");IF('База участников'!Q2:Q999<>"";REGEXREPLACE('База участников'!Q2:Q999;"\s+—\s+(РМ|РК)$";"");"")))))\IF((('База участников'!E2:E999<>"")+REGEXMATCH('База участников'!G2:G999;"^Спецназ (РМ|РК)$"))>0;'База участников'!F2:F999;IF((('База участников'!H2:H999<>"")+REGEXMATCH('База участников'!J2:J999;"^Спецназ (РМ|РК)$"))>0;'База участников'!I2:I999;IF((('База участников'!K2:K999<>"")+REGEXMATCH('База участников'!M2:M999;"^Спецназ (РМ|РК)$"))>0;'База участников'!L2:L999;IF((('База участников'!N2:N999<>"")+REGEXMATCH('База участников'!P2:P999;"^Спецназ (РМ|РК)$"))>0;'База участников'!O2:O999;IF((('База участников'!Q2:Q999<>"")+REGEXMATCH('База участников'!S2:S999;"^Спецназ (РМ|РК)$"))>0;'База участников'!R2:R999;"")))))\IF((('База участников'!E2:E999<>"")+REGEXMATCH('База участников'!G2:G999;"^Спецназ (РМ|РК)$"))>0;'База участников'!G2:G999;IF((('База участников'!H2:H999<>"")+REGEXMATCH('База участников'!J2:J999;"^Спецназ (РМ|РК)$"))>0;'База участников'!J2:J999;IF((('База участников'!K2:K999<>"")+REGEXMATCH('База участников'!M2:M999;"^Спецназ (РМ|РК)$"))>0;'База участников'!M2:M999;IF((('База участников'!N2:N999<>"")+REGEXMATCH('База участников'!P2:P999;"^Спецназ (РМ|РК)$"))>0;'База участников'!P2:P999;IF((('База участников'!Q2:Q999<>"")+REGEXMATCH('База участников'!S2:S999;"^Спецназ (РМ|РК)$"))>0;'База участников'!S2:S999;"")))))\'База участников'!T2:T999\IFERROR('База участников'!U2:U999*1;0)\IFERROR('База участников'!AB2:AB999*1;0)\IF((('База участников'!E2:E999<>"")+REGEXMATCH('База участников'!G2:G999;"^Спецназ (РМ|РК)$"))>0;'База участников'!W2:W999;IF((('База участников'!H2:H999<>"")+REGEXMATCH('База участников'!J2:J999;"^Спецназ (РМ|РК)$"))>0;'База участников'!X2:X999;IF((('База участников'!K2:K999<>"")+REGEXMATCH('База участников'!M2:M999;"^Спецназ (РМ|РК)$"))>0;'База участников'!Y2:Y999;IF((('База участников'!N2:N999<>"")+REGEXMATCH('База участников'!P2:P999;"^Спецназ (РМ|РК)$"))>0;'База участников'!Z2:Z999;IF((('База участников'!Q2:Q999<>"")+REGEXMATCH('База участников'!S2:S999;"^Спецназ (РМ|РК)$"))>0;'База участников'!AA2:AA999;"")))))\IF(IFERROR('База участников'!U2:U999*1;0)>0;1;IF(IFERROR('База участников'!AB2:AB999*1;0)>0;2;3))\IFERROR('База участников'!U2:U999*1;0)\IFERROR('База участников'!AB2:AB999*1;0)\IF('База участников'!T2:T999="Активен";1;IF('База участников'!T2:T999="На паузе";2;IF('База участников'!T2:T999="Неактивен";3;4)))};(('База участников'!E2:E999<>"")+('База участников'!H2:H999<>"")+('База участников'!K2:K999<>"")+('База участников'!N2:N999<>"")+('База участников'!Q2:Q999<>"")+REGEXMATCH('База участников'!G2:G999;"^Спецназ (РМ|РК)$")+REGEXMATCH('База участников'!J2:J999;"^Спецназ (РМ|РК)$")+REGEXMATCH('База участников'!M2:M999;"^Спецназ (РМ|РК)$")+REGEXMATCH('База участников'!P2:P999;"^Спецназ (РМ|РК)$")+REGEXMATCH('База участников'!S2:S999;"^Спецназ (РМ|РК)$"))>0);10;TRUE;11;FALSE;12;FALSE;13;TRUE;2;TRUE);"select Col1,Col2,Col3,Col4,Col5,Col6,Col7,Col8,Col9";0);"")`;
}

function searchFormula_() {
  return String.raw`=IF($B$3="";"Введите запрос";LET(q;LOWER(TRIM($B$3));src;'База участников'!A2:AF999;out;CHOOSECOLS(src;2;1;3;4;5;6;7;8;9;10;11;12;13;14;15;16;17;18;19;21;28;20;23;24;25;26;27;22;31;32;29;30);has;BYROW(src;LAMBDA(r;COUNTA(r)>0));hasSpec;REGEXMATCH(q;"спецназ\s*[=<>]?\s*\d+");specOp;IFERROR(REGEXEXTRACT(q;"спецназ\s*([=<>])\s*\d+");">");specNum;IFERROR(VALUE(REGEXEXTRACT(q;"спецназ\s*[=<>]?\s*(\d+)"));0);hasScreens;REGEXMATCH(q;"скрины\s*[=<>]?\s*\d+");screensOp;IFERROR(REGEXEXTRACT(q;"скрины\s*([=<>])\s*\d+");">");screensNum;IFERROR(VALUE(REGEXEXTRACT(q;"скрины\s*[=<>]?\s*(\d+)"));0);hasBase;REGEXMATCH(q;"(база|активность\s+в\s+базе)\s*[=<>]?\s*\d+");baseOp;IFERROR(REGEXEXTRACT(q;"(?:база|активность\s+в\s+базе)\s*([=<>])\s*\d+");">");baseNum;IFERROR(VALUE(REGEXEXTRACT(q;"(?:база|активность\s+в\s+базе)\s*[=<>]?\s*(\d+)"));0);hasOutside;REGEXMATCH(q;"(вне|активность\s+вне\s+базы)\s*[=<>]?\s*\d+");outsideOp;IFERROR(REGEXEXTRACT(q;"(?:вне|активность\s+вне\s+базы)\s*([=<>])\s*\d+");">");outsideNum;IFERROR(VALUE(REGEXEXTRACT(q;"(?:вне|активность\s+вне\s+базы)\s*[=<>]?\s*(\d+)"));0);needRM;OR(REGEXMATCH(q;"royal\s*match");REGEXMATCH(q;"(^|[\s,;])рм($|[\s,;])"));needRK;OR(REGEXMATCH(q;"royal\s*kingdom");REGEXMATCH(q;"(^|[\s,;])рк($|[\s,;])"));statusNeed;IF(REGEXMATCH(q;"статус\s*[=:]?\s*неактивен");"неактивен";IF(REGEXMATCH(q;"статус\s*[=:]?\s*(на паузе|пауза)");"на паузе";IF(REGEXMATCH(q;"статус\s*[=:]?\s*активен");"активен";"")));dateNeed;IFERROR(REGEXEXTRACT(q;"\d{2}\.\d{2}\.\d{4}");"");needle;TRIM(REGEXREPLACE(REGEXREPLACE(REGEXREPLACE(REGEXREPLACE(REGEXREPLACE(REGEXREPLACE(REGEXREPLACE(REGEXREPLACE(REGEXREPLACE(REGEXREPLACE(REGEXREPLACE(q;"^(id|ид)\s*";"");"спецназ\s*[=<>]?\s*\d+";"");"скрины\s*[=<>]?\s*\d+";"");"(?:база|активность\s+в\s+базе)\s*[=<>]?\s*\d+";"");"(?:вне|активность\s+вне\s+базы)\s*[=<>]?\s*\d+";"");"статус\s*[=:]?\s*(неактивен|на паузе|пауза|активен)";"");"royal\s*match|royal\s*kingdom";"");"(^|[\s,;])(рм|рк)($|[\s,;])";" ");"\d{2}\.\d{2}\.\d{4}";"");"[,;]+";" ");"(^|\s)и($|\s)";" "));cond;BYROW(src;LAMBDA(r;LET(spec;IFERROR(INDEX(r;21)*1;0);screens;IFERROR(INDEX(r;28)*1;0);baseAct;IFERROR(INDEX(r;29)*1;0);outsideAct;IFERROR(INDEX(r;30)*1;0);games;LOWER(TEXTJOIN(" ";TRUE;INDEX(r;23);INDEX(r;24);INDEX(r;25);INDEX(r;26);INDEX(r;27)));stat;LOWER(INDEX(r;20));dateAdd;IFERROR(TEXT(INDEX(r;22);"dd.mm.yyyy");TO_TEXT(INDEX(r;22)));dateCh;IFERROR(TEXT(INDEX(r;31);"dd.mm.yyyy");TO_TEXT(INDEX(r;31)));txt;LOWER(TEXTJOIN(" ";TRUE;r));AND(IF(hasSpec;IF(specOp="=";spec=specNum;IF(specOp="<";spec<specNum;spec>specNum));TRUE);IF(hasScreens;IF(screensOp="=";screens=screensNum;IF(screensOp="<";screens<screensNum;screens>screensNum));TRUE);IF(hasBase;IF(baseOp="=";baseAct=baseNum;IF(baseOp="<";baseAct<baseNum;baseAct>baseNum));TRUE);IF(hasOutside;IF(outsideOp="=";outsideAct=outsideNum;IF(outsideOp="<";outsideAct<outsideNum;outsideAct>outsideNum));TRUE);IF(needRM;ISNUMBER(SEARCH("royal match";games));TRUE);IF(needRK;ISNUMBER(SEARCH("royal kingdom";games));TRUE);IF(statusNeed<>"";stat=statusNeed;TRUE);IF(dateNeed<>"";OR(dateAdd=dateNeed;dateCh=dateNeed);TRUE);IF(needle<>"";ISNUMBER(SEARCH(needle;txt));TRUE)))));IFNA(FILTER(out;has;cond);"Нет совпадений")))`;
}

/* ========================================================================== */
/* ОФОРМЛЕНИЕ, ЗАЩИТА И ТРИГГЕРЫ                                             */
/* ========================================================================== */

function cleanupTeamsConditionalFormatting_(ss) {
  const sheet = ss.getSheetByName(SHEET_TEAMS);
  if (!sheet) return;

  const rules = [];
  const fullRange = sheet.getRange('A2:L999');
  const statusRange = sheet.getRange('L2:L999');

  rules.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$A2="Royal Match"')
      .setBackground('#DDEEFF')
      .setFontColor('#0033CC')
      .setRanges([fullRange])
      .build()
  );

  rules.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$A2="Royal Kingdom"')
      .setBackground('#FFE5E5')
      .setFontColor('#CC0000')
      .setRanges([fullRange])
      .build()
  );

  rules.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$L2="Активен"')
      .setBackground('#D9EAD3')
      .setFontColor('#274E13')
      .setRanges([statusRange])
      .build()
  );

  rules.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=OR($L2="На паузе";$L2="Пауза")')
      .setBackground('#FCE5CD')
      .setFontColor('#B45F06')
      .setRanges([statusRange])
      .build()
  );

  rules.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$L2="Неактивен"')
      .setBackground('#990000')
      .setFontColor('#FFFFFF')
      .setRanges([statusRange])
      .build()
  );

  sheet.setConditionalFormatRules(rules);
}

function ensureHistoryConditionalFormatting_(ss) {
  const sheet = ss.getSheetByName(SHEET_HISTORY);
  if (!sheet) return;

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

function protectFormulaColumns_(ss) {
  const sheet = ss.getSheetByName(SHEET_BASE);
  if (!sheet) return;

  const descriptions = ['Royal CRM: формула статуса', 'Royal CRM: формулы игр'];

  sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(protection => {
    if (descriptions.indexOf(protection.getDescription()) !== -1) {
      protection.remove();
    }
  });

  sheet.getRange('T2:T999')
    .protect()
    .setDescription(descriptions[0])
    .setWarningOnly(true);

  sheet.getRange('W2:AA999')
    .protect()
    .setDescription(descriptions[1])
    .setWarningOnly(true);
}

function hideTechnicalColumnsAndSheets_(ss) {
  const base = ss.getSheetByName(SHEET_BASE);
  if (base) {
    try {
      base.hideColumns(COL_SORT_GROUP, 2);
    } catch (err) {}
  }

  const history = ss.getSheetByName(SHEET_HISTORY);
  if (history) {
    try {
      history.showColumns(1, HISTORY_VISIBLE_WIDTH);
      history.hideColumns(HISTORY_COL_SOURCE, HISTORY_WIDTH - HISTORY_COL_SOURCE + 1);
    } catch (err) {}
  }

  [SHEET_ACTIVITY_LOG, SHEET_PROCESSED, SHEET_SNAPSHOT, SHEET_CONNECTIONS].forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (sheet && !sheet.isSheetHidden()) sheet.hideSheet();
  });
}

function installRoyalCrmTriggers_() {
  const triggers = ScriptApp.getProjectTriggers();

  triggers.forEach(trigger => {
    const handler = trigger.getHandlerFunction();

    if (
      handler === LEGACY_SPECNAZ_HANDLER ||
      handler === MAINTENANCE_HANDLER ||
      handler === CHANGE_HANDLER ||
      handler === PUBLIC_SYNC_QUEUE_HANDLER ||
      handler === PUBLIC_SYNC_EDIT_HANDLER
    ) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger(MAINTENANCE_HANDLER)
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(4)
    .create();

  ScriptApp.newTrigger(CHANGE_HANDLER)
    .forSpreadsheet(SPREADSHEET_ID)
    .onChange()
    .create();

  ScriptApp.newTrigger(PUBLIC_SYNC_EDIT_HANDLER)
    .forSpreadsheet(SPREADSHEET_ID)
    .onEdit()
    .create();

  ScriptApp.newTrigger(PUBLIC_SYNC_QUEUE_HANDLER)
    .timeBased()
    .everyMinutes(PUBLIC_SYNC_CONFIG.intervalMinutes)
    .create();
}

/** Совместимые имена старых служебных функций. */
function setupScreensAndActivityStructure() {
  return setupRoyalCrmV2();
}

function addCurrentSpecnazPeriodDivider() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const history = ss.getSheetByName(SHEET_HISTORY);
  if (!history) return;
  ensureHistoryStructure_(history);
  ensureSpecnazPeriodDivider_(history, new Date());
}

/**
 * Разовая установка колонки «Сообщение» в истории спецназа.
 * После выполнения обновите существующее веб-развёртывание и запустите
 * runPublicSyncNow(), чтобы публичная история получила ту же структуру.
 */
function installSpecnazMessageHistory() {
  return installSpecnazRichHistory();
}

function installSpecnazRichHistory() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const history = ss.getSheetByName(SHEET_HISTORY);
  if (!history) throw new Error('Не найден лист «' + SHEET_HISTORY + '»');

  ensureHistoryStructure_(history);
  const repair = repairHistoryRichRowsFromBase_(ss);
  ensureHistoryConditionalFormatting_(ss);
  hideTechnicalColumnsAndSheets_(ss);
  PropertiesService.getScriptProperties()
    .setProperty(PROPERTY_STRUCTURE_VERSION, CRM_VERSION);

  markPublicSyncPending_('install_specnaz_rich_history');

  return {
    status: 'SPECNAZ_RICH_HISTORY_INSTALLED',
    visible_columns: 'A:I / Дата, Аватар, Имя, Команда, Было, Стало, Добавлено, Звание, Сообщение',
    repaired_rows: repair.updated,
    checked_rows: repair.checked,
    history_row_height_px: 55,
    next_step: 'Обновите существующее развёртывание, затем запустите runPublicSyncNow'
  };
}
