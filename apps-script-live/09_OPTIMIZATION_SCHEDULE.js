/**
 * ROYAL CRM — общая оптимизация и ночное расписание
 * Файл: 09_OPTIMIZATION_SCHEDULE.gs
 * Версия: 1.1.0
 *
 * Расписание Europe/Moscow:
 * 01:10 — очистка очереди и технических журналов;
 * 02:10 — запуск ночного цикла Telegram-аватаров;
 * 03:10 — фотографии команд и контроль структуры публичной книги;
 * 04:10 — Telegram-ссылки;
 * воскресенье 05:10 — полное обслуживание CRM.
 */

const RC_OPT_VERSION = '1.2.0';
const RC_OPT_NIGHT_CLEANUP_HANDLER = 'nightlyRoyalCrmCleanup';
const RC_OPT_LEASE_PREFIX = 'ROYAL_CRM_LEASE_V1_';
const RC_OPT_LEASE_SETTLE_MS = 40;

function RC_OPT_parseLease_(raw) {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' ? value : null;
  } catch (err) {
    return null;
  }
}

function RC_OPT_leaseKey_(name) {
  return RC_OPT_LEASE_PREFIX + String(name || 'UNKNOWN');
}

/**
 * Именованная аренда. Общий ScriptLock нужен только для атомарной записи
 * свойства. Ожидание 8 секунд позволяет пережить короткую транзакцию webhook,
 * но тяжёлая работа по-прежнему выполняется уже без ScriptLock.
 */
function acquireRoyalCrmLease_(name, ttlMs) {
  const props = PropertiesService.getScriptProperties();
  const key = RC_OPT_leaseKey_(name);
  const now = Date.now();
  const current = RC_OPT_parseLease_(props.getProperty(key));

  if (current && Number(current.expires || 0) > now) return '';

  /*
   * Оптимистическая аренда без ScriptLock.
   * Если два запуска одновременно увидели свободный ключ, оба записывают
   * собственный owner, но продолжит только тот, чей owner остался в свойстве.
   * Поэтому публичная синхронизация больше не конкурирует с транзакцией базы.
   */
  const owner = Utilities.getUuid();
  const candidate = {
    owner: owner,
    created: now,
    expires: now + Math.max(Number(ttlMs || 600000), 60000)
  };

  props.setProperty(key, JSON.stringify(candidate));
  Utilities.sleep(RC_OPT_LEASE_SETTLE_MS + Math.floor(Math.random() * 40));

  const confirmed = RC_OPT_parseLease_(props.getProperty(key));
  return confirmed && confirmed.owner === owner ? owner : '';
}

function releaseRoyalCrmLease_(name, owner) {
  if (!owner) return false;

  const props = PropertiesService.getScriptProperties();
  const key = RC_OPT_leaseKey_(name);
  const current = RC_OPT_parseLease_(props.getProperty(key));

  if (!current) return true;
  if (current.owner !== owner) return false;

  props.deleteProperty(key);
  return true;
}

/** Показывает, действительно ли процесс занят, или аренда уже просрочена. */
function showPublicSyncLeaseStatus() {
  const props = PropertiesService.getScriptProperties();
  const key = RC_OPT_leaseKey_('PUBLIC_SYNC');
  const lease = RC_OPT_parseLease_(props.getProperty(key));
  const now = Date.now();
  const result = {
    status: lease && Number(lease.expires || 0) > now ? 'ACTIVE' : 'FREE_OR_EXPIRED',
    lease: lease || null,
    remaining_ms: lease ? Math.max(Number(lease.expires || 0) - now, 0) : 0,
    checked_at: new Date(now).toISOString(),
    lease_mode: 'OPTIMISTIC_NO_SCRIPT_LOCK'
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

/**
 * Одноразовый принудительный сброс аренды публичной синхронизации.
 * ScriptLock намеренно не используется: эта функция нужна именно тогда,
 * когда общая транзакция базы занята активным потоком ChatKeeper.
 */
function resetPublicSyncLease() {
  const props = PropertiesService.getScriptProperties();
  const key = RC_OPT_leaseKey_('PUBLIC_SYNC');
  const previousRaw = props.getProperty(key);
  const previous = RC_OPT_parseLease_(previousRaw);

  props.deleteProperty(key);

  const result = {
    status: 'RESET',
    reset: true,
    previous_lease: previous || null,
    reset_at: new Date().toISOString(),
    lease_mode: 'OPTIMISTIC_NO_SCRIPT_LOCK'
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

/** Просроченные аренды не блокируют работу; эта функция убирает их из свойств. */
function cleanupExpiredRoyalCrmLeases() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  const now = Date.now();
  const deleted = [];

  Object.keys(all).forEach(function(key) {
    if (key.indexOf(RC_OPT_LEASE_PREFIX) !== 0) return;
    const raw = all[key];
    const lease = RC_OPT_parseLease_(raw);
    if (lease && Number(lease.expires || 0) > now) return;

    /* Не удаляем ключ, если его уже успел заменить новый владелец. */
    if (props.getProperty(key) === raw) {
      props.deleteProperty(key);
      deleted.push(key);
    }
  });

  const result = { status: 'OK', deleted: deleted };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

/** Единственная функция установки всех рабочих триггеров. */
function installRoyalCrmOptimization() {
  const managedHandlers = [
    MAINTENANCE_HANDLER,
    CHANGE_HANDLER,
    PUBLIC_SYNC_EDIT_HANDLER,
    PUBLIC_SYNC_QUEUE_HANDLER,
    RCWQ_PROCESS_HANDLER,
    RCWQ_CLEANUP_HANDLER,
    TG_AVATAR_DAILY_HANDLER,
    TG_AVATAR_QUEUE_HANDLER,
    TGNL_TRIGGER_HANDLER,
    PUBLIC_SYNC_NIGHTLY_MEDIA_HANDLER,
    RC_OPT_NIGHT_CLEANUP_HANDLER,
    RELIABLE_EDIT_HANDLER_,
    FINALROLE_HANDLER_,
    'handleNoTeamSelection',
    'handleAdminRoleDropdownEdit'
  ];

  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (managedHandlers.indexOf(trigger.getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger(CHANGE_HANDLER)
    .forSpreadsheet(SPREADSHEET_ID).onChange().create();

  ScriptApp.newTrigger(PUBLIC_SYNC_EDIT_HANDLER)
    .forSpreadsheet(SPREADSHEET_ID).onEdit().create();

  ScriptApp.newTrigger(FINALROLE_HANDLER_)
    .forSpreadsheet(SPREADSHEET_ID).onEdit().create();

  ScriptApp.newTrigger(RCWQ_PROCESS_HANDLER)
    .timeBased().everyMinutes(1).create();

  ScriptApp.newTrigger(PUBLIC_SYNC_QUEUE_HANDLER)
    .timeBased().everyMinutes(PUBLIC_SYNC_CONFIG.intervalMinutes).create();

  ScriptApp.newTrigger(RC_OPT_NIGHT_CLEANUP_HANDLER)
    .timeBased().atHour(1).nearMinute(10).everyDays(1).create();

  ScriptApp.newTrigger(TG_AVATAR_DAILY_HANDLER)
    .timeBased().atHour(2).nearMinute(10).everyDays(1).create();

  ScriptApp.newTrigger(PUBLIC_SYNC_NIGHTLY_MEDIA_HANDLER)
    .timeBased().atHour(3).nearMinute(10).everyDays(1).create();

  ScriptApp.newTrigger(TGNL_TRIGGER_HANDLER)
    .timeBased().atHour(4).nearMinute(10).everyDays(1).create();

  ScriptApp.newTrigger(MAINTENANCE_HANDLER)
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(5).nearMinute(10).create();

  markPublicSyncPending_('optimization_installed');
  const result = getRoyalCrmOptimizationStatus();
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function nightlyRoyalCrmCleanup() {
  const owner = acquireRoyalCrmLease_('NIGHT_CLEANUP', 20 * 60 * 1000);
  if (!owner) return { status: 'BUSY' };

  /* Сначала удаляем только просроченные аренды других подсистем. */
  try { cleanupExpiredRoyalCrmLeases(); } catch (err) {}

  let userLock = null;
  try {
    const queue = cleanupReliableWebhookQueue();

    /* После очистки очереди блокируем только обработчик очереди этого владельца,
       чтобы он не дописывал журналы во время удаления старых строк. */
    userLock = LockService.getUserLock();
    if (!userLock.tryLock(2000)) {
      return { status: 'LOG_CLEANUP_DEFERRED', queue: queue };
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const result = {
      status: 'CLEANED',
      queue: queue,
      activity_log_deleted: RC_OPT_deleteRowsOlderThan_(
        ss.getSheetByName(SHEET_ACTIVITY_LOG), 14
      ),
      webhook_log_deleted: RC_OPT_deleteRowsOlderThan_(
        ss.getSheetByName(SHEET_LOG), 30
      ),
      sync_log_trimmed: RC_OPT_keepNewestRows_(
        ss.getSheetByName(PUBLIC_SYNC_CONFIG.sheets.log), 500
      )
    };

    cleanupProcessedEvents_(ss);
    [
      ss.getSheetByName(SHEET_ACTIVITY_LOG),
      ss.getSheetByName(SHEET_LOG),
      ss.getSheetByName(SHEET_PROCESSED),
      ss.getSheetByName(PUBLIC_SYNC_CONFIG.sheets.log),
      ss.getSheetByName(RCWQ_SHEET_NAME)
    ].forEach(function(sheet) {
      RC_OPT_compactGrid_(sheet, 150, 250);
    });
    return result;
  } finally {
    if (userLock) {
      try { userLock.releaseLock(); } catch (err) {}
    }
    releaseRoyalCrmLease_('NIGHT_CLEANUP', owner);
  }
}

function getRoyalCrmOptimizationStatus() {
  const counts = {};
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    const handler = trigger.getHandlerFunction();
    counts[handler] = (counts[handler] || 0) + 1;
  });

  return {
    status: 'OK',
    version: RC_OPT_VERSION,
    time_zone: Session.getScriptTimeZone(),
    schedule: {
      cleanup: '01:10',
      avatars: '02:10',
      public_media: '03:10',
      telegram_links: '04:10',
      weekly_maintenance: 'Sunday 05:10'
    },
    triggers: counts,
    public_sync: getPublicSyncStatus(),
    webhook_queue: getReliableWebhookQueueStatus()
  };
}

function RC_OPT_deleteRowsOlderThan_(sheet, days) {
  if (!sheet || sheet.getLastRow() < 2) return 0;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  const cutoff = Date.now() - Number(days || 1) * 24 * 60 * 60 * 1000;
  const rows = [];

  values.forEach(function(row, index) {
    const value = row[0];
    const date = value instanceof Date ? value : new Date(value);
    if (!isNaN(date.getTime()) && date.getTime() < cutoff) {
      rows.push(index + 2);
    }
  });

  RC_OPT_deleteRowGroups_(sheet, rows);
  return rows.length;
}

function RC_OPT_keepNewestRows_(sheet, keep) {
  if (!sheet) return 0;
  const dataRows = Math.max(sheet.getLastRow() - 1, 0);
  const remove = Math.max(dataRows - Number(keep || 500), 0);
  if (remove) sheet.deleteRows(2, remove);
  return remove;
}

function RC_OPT_deleteRowGroups_(sheet, rows) {
  if (!rows.length) return;
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

  groups.reverse().forEach(function(group) {
    sheet.deleteRows(group.start, group.count);
  });
}

function RC_OPT_compactGrid_(sheet, spareRows, minimumRows) {
  if (!sheet) return;
  const keep = Math.max(
    sheet.getLastRow() + Number(spareRows || 100),
    Number(minimumRows || 200)
  );
  if (sheet.getMaxRows() > keep) {
    sheet.deleteRows(keep + 1, sheet.getMaxRows() - keep);
  }
}

