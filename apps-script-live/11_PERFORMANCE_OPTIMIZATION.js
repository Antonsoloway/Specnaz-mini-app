/**
 * ROYAL CRM / «Таблица ЧП»
 * 11_PERFORMANCE_OPTIMIZATION.gs
 * Version: 1.0.0
 * Date: 2026-08-14
 *
 * PURPOSE
 * - filters false structural onChange events created by technical sheets;
 * - installs one consistent trigger set for the CURRENT architecture;
 * - PRESERVES the required 5-minute Telegram avatar queue trigger;
 * - removes obsolete/duplicate managed triggers;
 * - safely cleans large technical logs without shortening event deduplication;
 * - optionally removes confirmed legacy-only public sheets after dependency scan;
 * - never changes business formulas, participant data, team data, history, avatars,
 *   Telegram RichText logic, webhook secret, bot token or Web App URL.
 *
 * IMPORTANT
 * 05_RELIABLE_WEBHOOK_QUEUE.gs MUST first be patched to RCWQ_VERSION 2.2.0.
 */

const RC_PERF_VERSION = '1.0.0';
const RC_PERF_ADMIN_ID = '1kkADcKysWdoGy95O36z9jCaoGUUHN0g4XH4LwVtAK_o';
const RC_PERF_PUBLIC_ID = '1FKEvF4pDW9dt6MOk4xjtF1fut60hZ5HxpoGN3l93s7M';

const RC_PERF_PROP_VERSION = 'ROYAL_CRM_PERFORMANCE_VERSION';
const RC_PERF_PROP_CORE_GRID_SIG = 'ROYAL_CRM_CORE_GRID_SIGNATURE_V1';
const RC_PERF_STRUCTURAL_HANDLER = 'handleRoyalCrmStructuralChangeOptimized';
const RC_PERF_NIGHT_HANDLER = 'nightlyRoyalCrmCleanupOptimized';

const RC_PERF_CORE_SHEETS = Object.freeze([
  'База участников',
  'Команды',
  'История спецназа'
]);

const RC_PERF_STRUCTURAL_TYPES = Object.freeze([
  'INSERT_ROW',
  'REMOVE_ROW',
  'INSERT_COLUMN',
  'REMOVE_COLUMN',
  'INSERT_GRID',
  'REMOVE_GRID'
]);

/* ========================================================================== */
/* PREFLIGHT                                                                  */
/* ========================================================================== */

function RC_PERF_preflight_() {
  const issues = [];
  const warnings = [];

  if (typeof CRM_VERSION === 'undefined' || String(CRM_VERSION) !== '2.2.6') {
    issues.push('01_CORE_MAIN.gs: ожидалась CRM_VERSION 2.2.6, получено ' +
      (typeof CRM_VERSION === 'undefined' ? 'UNDEFINED' : String(CRM_VERSION)));
  }

  if (typeof RCWQ_VERSION === 'undefined' || String(RCWQ_VERSION) !== '2.2.0') {
    issues.push(
      '05_RELIABLE_WEBHOOK_QUEUE.gs ещё не пропатчен до RCWQ 2.2.0. ' +
      'Сначала примените файл 05_PATCH_V2_2_NO_INSERT_ROWS.txt'
    );
  }

  if (
    typeof TG_AVATAR_MODULE_VERSION === 'undefined' ||
    String(TG_AVATAR_MODULE_VERSION) !== '3.8.0'
  ) {
    issues.push('04_TELEGRAM_AVATARS.gs: ожидалась версия 3.8.0');
  }

  if (typeof TGNL_VERSION === 'undefined' || String(TGNL_VERSION) !== '2.1.0') {
    issues.push('08_TELEGRAM_NAME_LINKS.gs: ожидалась версия 2.1.0');
  }

  const required = [
    ['handleSpreadsheetChange', typeof handleSpreadsheetChange === 'function'],
    ['handlePublicSyncEdit', typeof handlePublicSyncEdit === 'function'],
    ['handlePublicSyncChange', typeof handlePublicSyncChange === 'function'],
    ['processPublicSyncQueue', typeof processPublicSyncQueue === 'function'],
    ['processReliableWebhookQueue', typeof processReliableWebhookQueue === 'function'],
    ['finalRoleInstalledOnEdit_', typeof finalRoleInstalledOnEdit_ === 'function'],
    ['processTelegramAvatarQueue', typeof processTelegramAvatarQueue === 'function'],
    ['startDailyTelegramAvatarRefresh', typeof startDailyTelegramAvatarRefresh === 'function'],
    ['runNightlyPublicMediaSync', typeof runNightlyPublicMediaSync === 'function'],
    ['processTelegramNameLinks', typeof processTelegramNameLinks === 'function'],
    ['handlePublicTelegramLinkEdit', typeof handlePublicTelegramLinkEdit === 'function'],
    ['processPublicDynamicViews', typeof processPublicDynamicViews === 'function'],
    ['weeklyRoyalCrmMaintenance', typeof weeklyRoyalCrmMaintenance === 'function']
  ];

  required.forEach(function(item) {
    if (!item[1]) issues.push('Не найдена функция ' + item[0]);
  });

  let publicSyncVersion = '';
  if (typeof getPublicSyncStatus === 'function') {
    try {
      const s = getPublicSyncStatus();
      publicSyncVersion = String(s && s.public_sync_version || '');
      if (publicSyncVersion && publicSyncVersion !== '6.2.0') {
        issues.push('02_PUBLIC_SYNC_V4.gs: ожидалась Public Sync 6.2.0, получено ' +
          publicSyncVersion);
      }
    } catch (err) {
      warnings.push('Не удалось прочитать getPublicSyncStatus(): ' + RC_PERF_error_(err));
    }
  } else {
    issues.push('Не найдена getPublicSyncStatus()');
  }

  return {
    ok: issues.length === 0,
    issues: issues,
    warnings: warnings,
    versions: {
      performance: RC_PERF_VERSION,
      core: typeof CRM_VERSION === 'undefined' ? '' : String(CRM_VERSION),
      webhook_queue: typeof RCWQ_VERSION === 'undefined' ? '' : String(RCWQ_VERSION),
      avatars: typeof TG_AVATAR_MODULE_VERSION === 'undefined'
        ? '' : String(TG_AVATAR_MODULE_VERSION),
      telegram_links: typeof TGNL_VERSION === 'undefined' ? '' : String(TGNL_VERSION),
      public_sync: publicSyncVersion
    }
  };
}

/* ========================================================================== */
/* STRUCTURAL CHANGE FILTER                                                   */
/* ========================================================================== */

function RC_PERF_coreGridSignature_() {
  const ss = SpreadsheetApp.openById(RC_PERF_ADMIN_ID);
  const parts = [];

  RC_PERF_CORE_SHEETS.forEach(function(name) {
    const sheet = ss.getSheetByName(name);
    if (!sheet) {
      parts.push(name + ':MISSING');
      return;
    }
    parts.push(
      name + ':' + sheet.getMaxRows() + 'x' + sheet.getMaxColumns()
    );
  });

  return parts.join('|');
}

function RC_PERF_storeCoreGridSignature_() {
  const sig = RC_PERF_coreGridSignature_();
  PropertiesService.getScriptProperties()
    .setProperty(RC_PERF_PROP_CORE_GRID_SIG, sig);
  return sig;
}

/**
 * Optimized replacement for the INSTALLED trigger only.
 * The original handleSpreadsheetChange(e) remains untouched and is called
 * when a real core-sheet structure change is detected.
 */
function handleRoyalCrmStructuralChangeOptimized(e) {
  const type = String(e && e.changeType || '');
  if (RC_PERF_STRUCTURAL_TYPES.indexOf(type) === -1) {
    return { status: 'IGNORED_NON_STRUCTURAL', change_type: type };
  }

  const props = PropertiesService.getScriptProperties();
  const previous = props.getProperty(RC_PERF_PROP_CORE_GRID_SIG) || '';
  const current = RC_PERF_coreGridSignature_();

  if (previous && previous === current) {
    return {
      status: 'IGNORED_TECHNICAL_STRUCTURE',
      change_type: type,
      core_signature: current
    };
  }

  props.setProperty(RC_PERF_PROP_CORE_GRID_SIG, current);

  if (typeof handleSpreadsheetChange !== 'function') {
    throw new Error('handleSpreadsheetChange(e) is missing');
  }

  return handleSpreadsheetChange(e);
}

/* ========================================================================== */
/* TRIGGERS                                                                   */
/* ========================================================================== */

function RC_PERF_triggerCounts_() {
  const counts = {};
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    const handler = trigger.getHandlerFunction();
    counts[handler] = (counts[handler] || 0) + 1;
  });
  return counts;
}

function RC_PERF_deleteManagedTriggers_() {
  const handlers = [
    'handleSpreadsheetChange',
    RC_PERF_STRUCTURAL_HANDLER,

    'handlePublicSyncEdit',
    'handlePublicSyncChange',
    'processPublicSyncQueue',

    'finalRoleInstalledOnEdit_',
    'royalCrmInstalledOnEdit',
    'handleNoTeamSelection',
    'handleAdminRoleDropdownEdit',

    'processReliableWebhookQueue',
    'cleanupReliableWebhookQueue',

    'nightlyRoyalCrmCleanup',
    RC_PERF_NIGHT_HANDLER,

    'processTelegramAvatarQueue',
    'startDailyTelegramAvatarRefresh',

    'runNightlyPublicMediaSync',

    'processTelegramNameLinks',
    'handlePublicTelegramLinkEdit',
    'processPublicDynamicViews',

    'weeklyRoyalCrmMaintenance'
  ];

  let deleted = 0;
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    const handler = trigger.getHandlerFunction();
    if (handlers.indexOf(handler) !== -1) {
      ScriptApp.deleteTrigger(trigger);
      deleted++;
    }
  });

  return deleted;
}

/**
 * ONE installer for the current architecture.
 * It performs preflight BEFORE deleting a single trigger.
 */
function installRoyalCrmPerformanceOptimization() {
  const preflight = RC_PERF_preflight_();
  if (!preflight.ok) {
    throw new Error(
      'RC_PERF_PREFLIGHT_FAILED: ' + preflight.issues.join(' | ')
    );
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);

    const signature = RC_PERF_storeCoreGridSignature_();
    const deleted = RC_PERF_deleteManagedTriggers_();

    // Admin: real core structure changes only.
    ScriptApp.newTrigger(RC_PERF_STRUCTURAL_HANDLER)
      .forSpreadsheet(RC_PERF_ADMIN_ID)
      .onChange()
      .create();

    // Admin: normal data edits -> public queue.
    ScriptApp.newTrigger('handlePublicSyncEdit')
      .forSpreadsheet(RC_PERF_ADMIN_ID)
      .onEdit()
      .create();

    // Admin: image/format changes -> photo sync queue.
    ScriptApp.newTrigger('handlePublicSyncChange')
      .forSpreadsheet(RC_PERF_ADMIN_ID)
      .onChange()
      .create();

    // Admin: team/role editing.
    ScriptApp.newTrigger('finalRoleInstalledOnEdit_')
      .forSpreadsheet(RC_PERF_ADMIN_ID)
      .onEdit()
      .create();

    // ChatKeeper queue.
    ScriptApp.newTrigger('processReliableWebhookQueue')
      .timeBased()
      .everyMinutes(1)
      .create();

    // Public snapshot queue.
    ScriptApp.newTrigger('processPublicSyncQueue')
      .timeBased()
      .everyMinutes(5)
      .create();

    // Night cleanup. This calls cleanupReliableWebhookQueue itself;
    // no separate cleanupReliableWebhookQueue timer is created.
    ScriptApp.newTrigger(RC_PERF_NIGHT_HANDLER)
      .timeBased()
      .atHour(1)
      .nearMinute(10)
      .everyDays(1)
      .create();

    // Telegram avatars: BOTH triggers are mandatory for V3.8.
    ScriptApp.newTrigger('processTelegramAvatarQueue')
      .timeBased()
      .everyMinutes(5)
      .create();

    ScriptApp.newTrigger('startDailyTelegramAvatarRefresh')
      .timeBased()
      .atHour(2)
      .nearMinute(10)
      .everyDays(1)
      .create();

    // Public team media safety.
    ScriptApp.newTrigger('runNightlyPublicMediaSync')
      .timeBased()
      .atHour(3)
      .nearMinute(10)
      .everyDays(1)
      .create();

    // Full Telegram link audit.
    ScriptApp.newTrigger('processTelegramNameLinks')
      .timeBased()
      .atHour(4)
      .nearMinute(10)
      .everyDays(1)
      .create();

    // Public dynamic Telegram links.
    ScriptApp.newTrigger('handlePublicTelegramLinkEdit')
      .forSpreadsheet(RC_PERF_PUBLIC_ID)
      .onEdit()
      .create();

    ScriptApp.newTrigger('processPublicDynamicViews')
      .timeBased()
      .everyMinutes(5)
      .create();

    // Weekly core maintenance.
    ScriptApp.newTrigger('weeklyRoyalCrmMaintenance')
      .timeBased()
      .onWeekDay(ScriptApp.WeekDay.SUNDAY)
      .atHour(5)
      .nearMinute(10)
      .create();

    PropertiesService.getScriptProperties()
      .setProperty(RC_PERF_PROP_VERSION, RC_PERF_VERSION);

    if (typeof markPublicSyncPending_ === 'function') {
      try { markPublicSyncPending_('performance_optimization_installed'); }
      catch (err) {}
    }

    const result = getRoyalCrmPerformanceStatus();
    result.deleted_old_managed_triggers = deleted;
    result.core_signature_initialized = signature;
    result.preflight = preflight;

    console.log(JSON.stringify(result, null, 2));
    return result;

  } finally {
    try { lock.releaseLock(); } catch (err) {}
  }
}

/* ========================================================================== */
/* CLEANUP HELPERS                                                            */
/* ========================================================================== */

function RC_PERF_parseDate_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return value;

  const text = String(value || '').trim();
  if (!text) return null;

  let match = text.match(
    /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (match) {
    return new Date(
      Number(match[3]),
      Number(match[2]) - 1,
      Number(match[1]),
      Number(match[4] || 0),
      Number(match[5] || 0),
      Number(match[6] || 0)
    );
  }

  const date = new Date(text);
  return isNaN(date.getTime()) ? null : date;
}

function RC_PERF_groupRows_(rows) {
  if (!rows.length) return [];
  const sorted = rows.slice().sort(function(a, b) { return a - b; });

  const groups = [];
  let start = sorted[0];
  let previous = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    if (current === previous + 1) {
      previous = current;
      continue;
    }
    groups.push({ start: start, count: previous - start + 1 });
    start = current;
    previous = current;
  }

  groups.push({ start: start, count: previous - start + 1 });
  return groups;
}

function RC_PERF_deleteRowsOlderThan_(sheet, days) {
  if (!sheet || sheet.getLastRow() < 2) return 0;

  const values = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, 1)
    .getValues();

  const cutoff = Date.now() - Number(days) * 24 * 60 * 60 * 1000;
  const rows = [];

  values.forEach(function(row, index) {
    const date = RC_PERF_parseDate_(row[0]);
    if (date && date.getTime() < cutoff) rows.push(index + 2);
  });

  const groups = RC_PERF_groupRows_(rows);
  let deleted = 0;

  groups.reverse().forEach(function(group) {
    sheet.deleteRows(group.start, group.count);
    deleted += group.count;
  });

  return deleted;
}

function RC_PERF_keepNewestRows_(sheet, keepDataRows) {
  if (!sheet) return 0;
  const dataRows = Math.max(sheet.getLastRow() - 1, 0);
  const keep = Math.max(Number(keepDataRows) || 0, 0);
  const remove = dataRows - keep;

  if (remove <= 0) return 0;
  sheet.deleteRows(2, remove);
  return remove;
}

function RC_PERF_compactGrid_(sheet, spareRows, minRows) {
  if (!sheet) return { changed: false };

  const last = Math.max(sheet.getLastRow(), 1);
  const desired = Math.max(
    Number(minRows) || 1,
    last + Math.max(Number(spareRows) || 0, 0)
  );
  const current = sheet.getMaxRows();

  if (current > desired) {
    sheet.deleteRows(desired + 1, current - desired);
    return { changed: true, from: current, to: desired };
  }

  if (current < desired) {
    sheet.insertRowsAfter(current, desired - current);
    return { changed: true, from: current, to: desired };
  }

  return { changed: false, from: current, to: current };
}

function RC_PERF_trimRows_(sheet, keepRows) {
  if (!sheet) return { changed: false };
  const keep = Math.max(Number(keepRows) || 1, 1);
  const current = sheet.getMaxRows();

  if (current <= keep) {
    return { changed: false, from: current, to: current };
  }

  sheet.deleteRows(keep + 1, current - keep);
  return { changed: true, from: current, to: keep };
}

/* ========================================================================== */
/* NIGHT CLEANUP                                                              */
/* ========================================================================== */

function nightlyRoyalCrmCleanupOptimized() {
  const owner = typeof acquireRoyalCrmLease_ === 'function'
    ? acquireRoyalCrmLease_('PERF_NIGHT_CLEANUP', 20 * 60 * 1000)
    : 'NO_SHARED_LEASE';

  if (!owner) return { status: 'BUSY' };

  let userLock = null;

  try {
    if (typeof cleanupExpiredRoyalCrmLeases === 'function') {
      try { cleanupExpiredRoyalCrmLeases(); } catch (err) {}
    }

    let queue = { status: 'UNAVAILABLE' };
    if (typeof cleanupReliableWebhookQueue === 'function') {
      queue = cleanupReliableWebhookQueue();
    }

    userLock = LockService.getUserLock();
    if (!userLock.tryLock(3000)) {
      return {
        status: 'LOG_CLEANUP_DEFERRED',
        queue: queue
      };
    }

    const ss = SpreadsheetApp.openById(RC_PERF_ADMIN_ID);

    const activity = ss.getSheetByName('Лог активности');
    const webhook = ss.getSheetByName('Лог вебхуков');
    const processed = ss.getSheetByName('Обработанные события');
    const syncLog = ss.getSheetByName('Лог синхронизации');
    const queueSheet = ss.getSheetByName('Очередь вебхуков');

    const result = {
      status: 'CLEANED',
      queue: queue,
      activity_log_deleted: RC_PERF_deleteRowsOlderThan_(activity, 7),
      webhook_log_deleted: RC_PERF_deleteRowsOlderThan_(webhook, 14),
      sync_log_trimmed: RC_PERF_keepNewestRows_(syncLog, 300),
      processed_cleanup: null,
      compacted: {}
    };

    // Dedupe protection is deliberately NOT shortened here.
    if (typeof cleanupProcessedEvents_ === 'function') {
      try {
        result.processed_cleanup = cleanupProcessedEvents_(ss);
      } catch (err) {
        result.processed_cleanup = { error: RC_PERF_error_(err) };
      }
    }

    result.compacted.activity =
      RC_PERF_compactGrid_(activity, 250, 500);
    result.compacted.webhook =
      RC_PERF_compactGrid_(webhook, 250, 500);
    result.compacted.processed =
      RC_PERF_compactGrid_(processed, 250, 1000);
    result.compacted.sync =
      RC_PERF_compactGrid_(syncLog, 100, 400);

    // IMPORTANT: do NOT compact the webhook queue to lastRow+100.
    // V2.2 keeps a large spare-row buffer to prevent INSERT_ROW events.
    if (
      queueSheet &&
      typeof RCWQ_ensureQueueRowBuffer_ === 'function'
    ) {
      RCWQ_ensureQueueRowBuffer_(queueSheet);
      result.queue_grid = {
        last_row: queueSheet.getLastRow(),
        max_rows: queueSheet.getMaxRows(),
        spare_rows: queueSheet.getMaxRows() - queueSheet.getLastRow()
      };
    }

    SpreadsheetApp.flush();
    return result;

  } finally {
    if (userLock) {
      try { userLock.releaseLock(); } catch (err) {}
    }

    if (
      owner &&
      owner !== 'NO_SHARED_LEASE' &&
      typeof releaseRoyalCrmLease_ === 'function'
    ) {
      try { releaseRoyalCrmLease_('PERF_NIGHT_CLEANUP', owner); }
      catch (err) {}
    }
  }
}

/* ========================================================================== */
/* ONE-TIME ADMIN CLEANUP                                                     */
/* ========================================================================== */

function optimizeAdminWorkbookOnce() {
  const preflight = RC_PERF_preflight_();
  if (!preflight.ok) {
    throw new Error('RC_PERF_PREFLIGHT_FAILED: ' + preflight.issues.join(' | '));
  }

  const counts = RC_PERF_triggerCounts_();
  if ((counts[RC_PERF_STRUCTURAL_HANDLER] || 0) !== 1) {
    throw new Error(
      'Сначала запустите installRoyalCrmPerformanceOptimization(). ' +
      'Оптимизированный структурный триггер ещё не установлен.'
    );
  }

  return nightlyRoyalCrmCleanupOptimized();
}

/* ========================================================================== */
/* PUBLIC WORKBOOK CLEANUP                                                    */
/* ========================================================================== */

function RC_PERF_formulaReferencesSheet_(formula, sheetName) {
  const text = String(formula || '');
  if (!text) return false;

  const escaped = String(sheetName).replace(/'/g, "''");
  return (
    text.indexOf("'" + escaped + "'!") !== -1 ||
    text.indexOf(sheetName + '!') !== -1
  );
}

function RC_PERF_publicSheetDependencyReport_(ss, candidateName) {
  const report = {
    sheet: candidateName,
    formula_references: [],
    validation_references: [],
    named_ranges: [],
    charts_on_candidate: 0
  };

  const candidate = ss.getSheetByName(candidateName);
  if (!candidate) return report;

  try {
    report.charts_on_candidate = candidate.getCharts().length;
  } catch (err) {}

  try {
    ss.getNamedRanges().forEach(function(named) {
      const range = named.getRange();
      if (
        range &&
        range.getSheet() &&
        range.getSheet().getName() === candidateName
      ) {
        report.named_ranges.push(named.getName());
      }
    });
  } catch (err) {}

  ss.getSheets().forEach(function(sheet) {
    if (sheet.getName() === candidateName) return;

    const data = sheet.getDataRange();

    try {
      const formulas = data.getFormulas();
      for (let r = 0; r < formulas.length; r++) {
        for (let c = 0; c < formulas[r].length; c++) {
          if (RC_PERF_formulaReferencesSheet_(formulas[r][c], candidateName)) {
            report.formula_references.push(
              sheet.getName() + '!' + data.getCell(r + 1, c + 1).getA1Notation()
            );
            if (report.formula_references.length >= 20) break;
          }
        }
        if (report.formula_references.length >= 20) break;
      }
    } catch (err) {}

    try {
      const validations = data.getDataValidations();
      for (let r = 0; r < validations.length; r++) {
        for (let c = 0; c < validations[r].length; c++) {
          const rule = validations[r][c];
          if (!rule) continue;

          if (
            rule.getCriteriaType() ===
            SpreadsheetApp.DataValidationCriteria.VALUE_IN_RANGE
          ) {
            const args = rule.getCriteriaValues();
            const sourceRange = args && args[0];
            if (
              sourceRange &&
              typeof sourceRange.getSheet === 'function' &&
              sourceRange.getSheet().getName() === candidateName
            ) {
              report.validation_references.push(
                sheet.getName() + '!' + data.getCell(r + 1, c + 1).getA1Notation()
              );
              if (report.validation_references.length >= 20) break;
            }
          }
        }
        if (report.validation_references.length >= 20) break;
      }
    } catch (err) {}
  });

  report.safe_to_delete =
    report.formula_references.length === 0 &&
    report.validation_references.length === 0 &&
    report.named_ranges.length === 0 &&
    report.charts_on_candidate === 0;

  return report;
}

function optimizePublicWorkbookOnce() {
  const preflight = RC_PERF_preflight_();
  if (!preflight.ok) {
    throw new Error('RC_PERF_PREFLIGHT_FAILED: ' + preflight.issues.join(' | '));
  }

  const counts = RC_PERF_triggerCounts_();
  if ((counts[RC_PERF_STRUCTURAL_HANDLER] || 0) !== 1) {
    throw new Error(
      'Сначала запустите installRoyalCrmPerformanceOptimization().'
    );
  }

  const ss = SpreadsheetApp.openById(RC_PERF_PUBLIC_ID);

  const required = [
    'Главная',
    'Команды',
    'База участников',
    'Поиск',
    'Карточка команды',
    'История спецназа',
    'Списки',
    'Связи участников',
    'Поиск данные',
    'Аватары'
  ];

  const missing = required.filter(function(name) {
    return !ss.getSheetByName(name);
  });

  if (missing.length) {
    throw new Error(
      'PUBLIC_PREFLIGHT_FAILED: отсутствуют рабочие листы: ' +
      missing.join(', ')
    );
  }

  const legacyCandidates = [
    'Обработанные события',
    'Снимок счётчиков',
    'Лог активности'
  ];

  const dependencies = [];
  const deleted = [];
  const skipped = [];

  // Every candidate is dependency-scanned BEFORE deletion.
  legacyCandidates.forEach(function(name) {
    const sheet = ss.getSheetByName(name);
    if (!sheet) return;

    const dep = RC_PERF_publicSheetDependencyReport_(ss, name);
    dependencies.push(dep);

    if (!dep.safe_to_delete) {
      skipped.push({
        sheet: name,
        reason: 'DEPENDENCY_FOUND',
        details: dep
      });
      return;
    }

    ss.deleteSheet(sheet);
    deleted.push(name);
  });

  const search = ss.getSheetByName('Поиск');
  const main = ss.getSheetByName('Главная');

  // 08 V2.1 owns dynamic rows 6:255. Rows below 255 are not used.
  const searchTrim = RC_PERF_trimRows_(search, 255);

  // Main keeps all current content plus reserve, never less than 150 rows.
  const mainKeep = Math.max(150, main.getLastRow() + 20);
  const mainTrim = RC_PERF_trimRows_(main, mainKeep);

  try {
    ['Аватары', 'Списки', 'Связи участников', 'Поиск данные']
      .forEach(function(name) {
        const sheet = ss.getSheetByName(name);
        if (sheet && !sheet.isSheetHidden()) sheet.hideSheet();
      });
  } catch (err) {}

  SpreadsheetApp.flush();

  // Existing V6.2 validator is the final safety gate after cleanup.
  if (typeof validatePublicWorkbookStructure_ === 'function') {
    validatePublicWorkbookStructure_(ss);
  }

  let tgnlPreflight = null;
  if (typeof TGNL_preflight_ === 'function') {
    try { tgnlPreflight = TGNL_preflight_(); }
    catch (err) {
      throw new Error(
        'PUBLIC_POSTCHECK_TGNL_FAILED: ' + RC_PERF_error_(err)
      );
    }
  }

  const result = {
    status: 'OK',
    deleted_legacy_sheets: deleted,
    skipped_legacy_sheets: skipped,
    dependency_reports: dependencies,
    search_rows: searchTrim,
    main_rows: mainTrim,
    public_structure_validated: true,
    telegram_links_preflight: tgnlPreflight
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}

/* ========================================================================== */
/* STATUS                                                                     */
/* ========================================================================== */

function getRoyalCrmPerformanceStatus() {
  const preflight = RC_PERF_preflight_();
  const counts = RC_PERF_triggerCounts_();

  const expectedOnce = [
    RC_PERF_STRUCTURAL_HANDLER,
    'handlePublicSyncEdit',
    'handlePublicSyncChange',
    'finalRoleInstalledOnEdit_',
    'processReliableWebhookQueue',
    'processPublicSyncQueue',
    RC_PERF_NIGHT_HANDLER,
    'processTelegramAvatarQueue',
    'startDailyTelegramAvatarRefresh',
    'runNightlyPublicMediaSync',
    'processTelegramNameLinks',
    'handlePublicTelegramLinkEdit',
    'processPublicDynamicViews',
    'weeklyRoyalCrmMaintenance'
  ];

  const triggerProblems = [];
  expectedOnce.forEach(function(handler) {
    const count = counts[handler] || 0;
    if (count !== 1) {
      triggerProblems.push(handler + ': expected 1, got ' + count);
    }
  });

  const obsolete = [
    'handleSpreadsheetChange',
    'royalCrmInstalledOnEdit',
    'cleanupReliableWebhookQueue',
    'nightlyRoyalCrmCleanup',
    'handleNoTeamSelection',
    'handleAdminRoleDropdownEdit'
  ];

  obsolete.forEach(function(handler) {
    const count = counts[handler] || 0;
    if (count > 0) {
      triggerProblems.push(handler + ': obsolete trigger count ' + count);
    }
  });

  let queueGrid = null;
  try {
    const ss = SpreadsheetApp.openById(RC_PERF_ADMIN_ID);
    const sheet = ss.getSheetByName('Очередь вебхуков');
    if (sheet) {
      queueGrid = {
        last_row: sheet.getLastRow(),
        max_rows: sheet.getMaxRows(),
        spare_rows: sheet.getMaxRows() - sheet.getLastRow()
      };
    }
  } catch (err) {}

  let webhook = null;
  let avatars = null;
  let publicSync = null;

  try {
    if (typeof getReliableWebhookQueueStatus === 'function') {
      webhook = getReliableWebhookQueueStatus();
    }
  } catch (err) {
    webhook = { error: RC_PERF_error_(err) };
  }

  try {
    if (typeof checkTelegramAvatarSystem === 'function') {
      avatars = checkTelegramAvatarSystem();
    }
  } catch (err) {
    avatars = { error: RC_PERF_error_(err) };
  }

  try {
    if (typeof getPublicSyncStatus === 'function') {
      publicSync = getPublicSyncStatus();
    }
  } catch (err) {
    publicSync = { error: RC_PERF_error_(err) };
  }

  let currentSig = '';
  let storedSig = '';
  try {
    currentSig = RC_PERF_coreGridSignature_();
    storedSig = PropertiesService.getScriptProperties()
      .getProperty(RC_PERF_PROP_CORE_GRID_SIG) || '';
  } catch (err) {}

  const installedVersion = PropertiesService.getScriptProperties()
    .getProperty(RC_PERF_PROP_VERSION) || '';

  const result = {
    status:
      preflight.ok &&
      triggerProblems.length === 0 &&
      installedVersion === RC_PERF_VERSION
        ? 'OK'
        : 'ATTENTION',
    performance_version: RC_PERF_VERSION,
    installed_version: installedVersion,
    preflight: preflight,
    trigger_problems: triggerProblems,
    triggers: counts,
    core_signature: {
      stored: storedSig,
      current: currentSig,
      matches: Boolean(storedSig && storedSig === currentSig)
    },
    queue_grid: queueGrid,
    webhook_queue: webhook,
    avatars: avatars,
    public_sync: publicSync
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}

function RC_PERF_error_(err) {
  return String(err && (err.stack || err.message) ? (err.stack || err.message) : err);
}

