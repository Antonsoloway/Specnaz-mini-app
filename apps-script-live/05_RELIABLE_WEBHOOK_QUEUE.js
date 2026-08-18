/**
 * ROYAL CRM — НАДЁЖНАЯ ОЧЕРЕДЬ ВСЕХ WEBHOOK CHATKEEPER
 * Файл: 05_RELIABLE_WEBHOOK_QUEUE.gs
 * Версия очереди: 2.2.0
 *
 * V2.2.0 PERFORMANCE FIX — BUFFER HOTFIX 2026-08-14:
 * 1) webhook больше не создаёт физический INSERT_ROW на каждый входящий запрос;
 * 2) Sheets API append использует OVERWRITE вместо INSERT_ROWS;
 * 3) grid НЕ расширяется после каждого webhook;
 * 4) при запасе <500 строк редко добавляется блок 2500 строк;
 * 5) очистка очереди не уничтожает рабочий запас;
 * 6) остальная логика очереди сохранена без изменений.
 *
 * ГАРАНТИИ:
 * 1) любой HTTP POST сначала сохраняется как сырой body;
 * 2) разбор event, проверка secret и бизнес-логика выполняются только после сохранения;
 * 3) очередь не использует общий ScriptLock, поэтому не конфликтует с публичной
 *    синхронизацией, аватарами, ссылками и обслуживанием таблицы;
 * 4) при временной ошибке событие остаётся RETRY и обрабатывается повторно;
 * 5) порядок сохраняется внутри каждого Telegram ID;
 * 6) прежняя защита от дублей по eventKey остаётся внутри 01_CORE_MAIN.gs;
 * 7) перед записью в таблицу запрос временно сохраняется в Script Properties.
 *    Даже если Google Sheets кратковременно недоступен, событие не теряется.
 */

const RCWQ_VERSION = '2.2.0';
const RCWQ_SHEET_NAME = 'Очередь вебхуков';
const RCWQ_PROCESS_HANDLER = 'processReliableWebhookQueue';
const RCWQ_CLEANUP_HANDLER = 'cleanupReliableWebhookQueue';

const RCWQ_BATCH_SIZE = 30;
const RCWQ_MAX_ATTEMPTS = 20;
const RCWQ_STUCK_MINUTES = 15;
const RCWQ_TIME_BUDGET_MS = 4.5 * 60 * 1000;
const RCWQ_DONE_RETENTION_DAYS = 1;
const RCWQ_REJECTED_RETENTION_DAYS = 7;
const RCWQ_FAILED_RETENTION_DAYS = 30;
const RCWQ_MAX_EMERGENCY_PER_RUN = 50;
const RCWQ_PROPERTY_CHUNK_SIZE = 7000;

/*
 * V2.2: большой физический запас строк нужен специально для того,
 * чтобы append не расширял grid. Запас пополняется РЕДКО крупным блоком,
 * а не после каждого webhook.
 */
/*
 * Буфер V2.2 FIX:
 * Не поддерживаем РОВНО 2000 свободных строк — иначе после каждого webhook
 * приходилось бы физически добавлять 1 строку.
 *
 * Пока свободно >= 500 строк, grid вообще не меняется.
 * Когда запас опускается ниже 500, один раз добавляется большой блок 2500 строк.
 */
const RCWQ_BUFFER_LOW_WATER_ROWS = 500;
const RCWQ_BUFFER_GROW_ROWS = 2500;
const RCWQ_MIN_GRID_ROWS = 3000;

const RCWQ_PROP_VERSION = 'ROYAL_CRM_WEBHOOK_QUEUE_VERSION';
const RCWQ_PROP_LAST_RECEIVED = 'ROYAL_CRM_WEBHOOK_QUEUE_LAST_RECEIVED';
const RCWQ_PROP_LAST_SUCCESS = 'ROYAL_CRM_WEBHOOK_QUEUE_LAST_SUCCESS';
const RCWQ_PROP_LAST_ERROR = 'ROYAL_CRM_WEBHOOK_QUEUE_LAST_ERROR';
const RCWQ_PROP_SHEET_READY = 'ROYAL_CRM_WEBHOOK_QUEUE_SHEET_READY_V22';
const RCWQ_EMERGENCY_PREFIX = 'ROYAL_CRM_WEBHOOK_EMERGENCY_V2_';

const RCWQ_HEADERS = Object.freeze([
  'ID очереди',
  'Получено',
  'Статус',
  'Попытки',
  'Событие',
  'Ключ события',
  'Telegram ID',
  'Payload Base64',
  'Обновлено',
  'Результат',
  'Последняя ошибка',
  'Версия очереди'
]);

/**
 * ЕДИНСТВЕННАЯ внешняя точка входа POST.
 * В очередь попадает любой запрос: известный, неизвестный, пустой, ошибочный
 * или с неверным secret. Поэтому входящее событие не исчезает до диагностики.
 */
function doPost(e) {
  const miniAppStartWelcome = MINIAPP_handleStartWelcome_(e);
  if (miniAppStartWelcome) return miniAppStartWelcome;
  // Telegram Mini App API: отдельный маршрут, НЕ попадает в очередь ChatKeeper.
  if (
    e && e.parameter &&
    String(e.parameter.miniapp || '') === '1' &&
    typeof MINIAPP_doPost_ === 'function'
  ) {
    return MINIAPP_doPost_(e);
  }

  const raw = RCWQ_getRawPostBody_(e);
  const queueId = Utilities.getUuid();
  const receivedAt = new Date();
  const hints = RCWQ_extractHints_(raw);

  const record = {
    queueId: queueId,
    receivedAt: receivedAt,
    event: hints.event || '',
    eventKey: hints.eventKey || '',
    tgId: hints.tgId || '',
    raw: raw
  };

  let emergencySaved = false;
  let sheetSaved = false;
  let sheetError = '';
  let emergencyError = '';

  // Сначала короткая независимая страховка в Script Properties.
  try {
    RCWQ_saveEmergencyRecord_(record);
    emergencySaved = true;
  } catch (error) {
    emergencyError = RCWQ_errorText_(error);
  }

  // Затем основная постоянная очередь в скрытом листе.
  try {
    RCWQ_appendRecordToQueue_(record);
    sheetSaved = true;
  } catch (error) {
    sheetError = RCWQ_errorText_(error);
  }

  if (sheetSaved && emergencySaved) {
    try {
      RCWQ_deleteEmergencyRecord_(queueId);
    } catch (error) {}
  }

  const props = PropertiesService.getScriptProperties();
  props.setProperty(RCWQ_PROP_LAST_RECEIVED, receivedAt.toISOString());

  if (sheetSaved) {
    return RCWQ_json_({
      status: 'QUEUED',
      queue_id: queueId,
      event: record.event,
      event_key: record.eventKey
    });
  }

  if (emergencySaved) {
    props.setProperty(
      RCWQ_PROP_LAST_ERROR,
      'Основной лист временно недоступен; запрос сохранён в аварийной очереди: ' +
        sheetError
    );

    return RCWQ_json_({
      status: 'QUEUED_EMERGENCY',
      queue_id: queueId,
      event: record.event,
      event_key: record.eventKey
    });
  }

  /*
   * Крайний резерв. Он используется только если одновременно недоступны и
   * Script Properties, и лист очереди. Сохраняем прежнюю возможность выполнить
   * запрос напрямую, чтобы не потерять событие из-за редкой ошибки хранилища.
   */
  try {
    if (typeof processWebhookImmediately_ === 'function') {
      return processWebhookImmediately_(e);
    }
  } catch (fallbackError) {
    throw new Error(
      'Не удалось сохранить webhook ни в основной, ни в аварийной очереди. ' +
      'Ошибка Script Properties: ' + emergencyError + '. ' +
      'Ошибка листа: ' + sheetError + '. ' +
      'Ошибка прямой обработки: ' + RCWQ_errorText_(fallbackError)
    );
  }

  throw new Error(
    'Не удалось сохранить webhook. Ошибка Script Properties: ' +
    emergencyError + '. Ошибка листа: ' + sheetError
  );
}

/**
 * Обработчик минутного триггера. Берёт события строго сверху вниз.
 */
function processReliableWebhookQueue() {
  const processorLock = LockService.getUserLock();
  if (!processorLock.tryLock(1000)) {
    return { status: 'PROCESSOR_ALREADY_RUNNING' };
  }

  const startedAt = Date.now();
  const summary = {
    status: 'QUEUE_PROCESSED',
    recovered: 0,
    processed: 0,
    done: 0,
    rejected: 0,
    retry: 0,
    failed: 0,
    skipped_same_user: 0
  };

  try {
    if (typeof processWebhookImmediately_ !== 'function') {
      throw new Error('Не найдена processWebhookImmediately_(e).');
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = RCWQ_ensureQueueSheet_(ss);
    summary.recovered = RCWQ_recoverEmergencyRecords_(sheet);
    RCWQ_resetStuckRows_(sheet);

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      summary.status = 'QUEUE_EMPTY';
      return summary;
    }

    /* Читаются только необходимые A:I, а не тяжёлые Result/Error столбцы. */
    const rows = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
    const blockedTgIds = {};

    for (let index = 0; index < rows.length; index++) {
      if (summary.processed >= RCWQ_BATCH_SIZE) break;
      if (Date.now() - startedAt >= RCWQ_TIME_BUDGET_MS) break;

      const rowNumber = index + 2;
      const values = rows[index];
      const status = String(values[2] || '').toUpperCase();
      const attempts = Number(values[3] || 0);
      const tgId = String(values[6] || '').trim() || '__UNKNOWN__';

      if (status === 'PROCESSING') {
        blockedTgIds[tgId] = true;
        continue;
      }
      if (status !== 'PENDING' && status !== 'RETRY') continue;

      /* Порядок сохраняется внутри одного Telegram ID, но один проблемный
         пользователь больше не останавливает весь чат. */
      if (blockedTgIds[tgId]) {
        summary.skipped_same_user++;
        continue;
      }

      if (attempts >= RCWQ_MAX_ATTEMPTS) {
        RCWQ_updateQueueRow_(
          sheet, rowNumber, 'FAILED', attempts, '',
          'Превышено максимальное число попыток: ' + RCWQ_MAX_ATTEMPTS
        );
        summary.failed++;
        blockedTgIds[tgId] = true;
        continue;
      }

      const nextAttempts = attempts + 1;
      RCWQ_markProcessing_(sheet, rowNumber, nextAttempts);
      summary.processed++;

      try {
        const raw = RCWQ_decodePayload_(values[7]);
        const result = RCWQ_readHandlerResult_(
          processWebhookImmediately_(RCWQ_buildFakeEvent_(raw))
        );
        const resultStatus = String(result.status || 'UNKNOWN').toUpperCase();
        const resultText = RCWQ_truncate_(JSON.stringify(result), 4000);

        if (
          resultStatus === 'RETRY_LOCKED' ||
          (resultStatus === 'ERROR' && RCWQ_isTransientError_(result)) ||
          resultStatus === 'SETUP_REQUIRED'
        ) {
          const finalStatus = nextAttempts >= RCWQ_MAX_ATTEMPTS
            ? 'FAILED'
            : 'RETRY';
          RCWQ_updateQueueRow_(
            sheet, rowNumber, finalStatus, nextAttempts,
            resultText, RCWQ_resultErrorText_(result)
          );
          if (finalStatus === 'FAILED') summary.failed++;
          else summary.retry++;
          blockedTgIds[tgId] = true;
          continue;
        }

        if (resultStatus === 'ERROR') {
          /* Детерминированная ошибка не блокирует остальных бесконечно. */
          const finalStatus = nextAttempts >= 3 ? 'FAILED' : 'RETRY';
          RCWQ_updateQueueRow_(
            sheet, rowNumber, finalStatus, nextAttempts,
            resultText, RCWQ_resultErrorText_(result)
          );
          if (finalStatus === 'FAILED') summary.failed++;
          else summary.retry++;
          blockedTgIds[tgId] = true;
          continue;
        }

        if (
          resultStatus === 'WRONG_SECRET' ||
          resultStatus === 'INVALID_REQUEST' ||
          resultStatus === 'EMPTY_REQUEST'
        ) {
          RCWQ_updateQueueRow_(
            sheet, rowNumber, 'REJECTED', nextAttempts,
            resultText, RCWQ_resultErrorText_(result)
          );
          summary.rejected++;
          continue;
        }

        RCWQ_updateQueueRow_(
          sheet, rowNumber, 'DONE', nextAttempts, resultText, ''
        );
        summary.done++;

      } catch (error) {
        const errorText = RCWQ_errorText_(error);
        const transient = RCWQ_isTransientError_({ message: errorText });
        const finalStatus =
          transient && nextAttempts < RCWQ_MAX_ATTEMPTS
            ? 'RETRY'
            : (nextAttempts >= 3 ? 'FAILED' : 'RETRY');

        RCWQ_updateQueueRow_(
          sheet, rowNumber, finalStatus, nextAttempts, '', errorText
        );
        if (finalStatus === 'FAILED') summary.failed++;
        else summary.retry++;
        blockedTgIds[tgId] = true;
      }
    }

    PropertiesService.getScriptProperties().setProperty(
      RCWQ_PROP_LAST_SUCCESS,
      new Date().toISOString()
    );
    return summary;

  } catch (error) {
    PropertiesService.getScriptProperties().setProperty(
      RCWQ_PROP_LAST_ERROR,
      RCWQ_errorText_(error)
    );
    throw error;
  } finally {
    try { processorLock.releaseLock(); } catch (error) {}
  }
}

/**
 * Одноразовая установка очереди и двух собственных триггеров.
 */
function installReliableWebhookQueue() {
  if (typeof processWebhookImmediately_ !== 'function') {
    throw new Error('Не найдена processWebhookImmediately_(e).');
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = RCWQ_ensureQueueSheet_(ss);
  sheet.hideSheet();
  RCWQ_deleteOwnTriggers_();

  ScriptApp.newTrigger(RCWQ_PROCESS_HANDLER)
    .timeBased().everyMinutes(1).create();

  /* В полном оптимизированном комплекте очисткой управляет ночной оркестратор. */
  if (typeof nightlyRoyalCrmCleanup !== 'function') {
    ScriptApp.newTrigger(RCWQ_CLEANUP_HANDLER)
      .timeBased().everyDays(1).atHour(1).nearMinute(10).create();
  }

  const props = PropertiesService.getScriptProperties();
  props.setProperty(RCWQ_PROP_VERSION, RCWQ_VERSION);
  props.deleteProperty(RCWQ_PROP_LAST_ERROR);

  const recovered = RCWQ_recoverEmergencyRecords_(sheet);
  const status = getReliableWebhookQueueStatus();
  status.recovered_during_install = recovered;
  console.log(JSON.stringify(status, null, 2));
  return status;
}

/**
 * Ручной безопасный запуск очереди.
 */
function runReliableWebhookQueueNow() {
  return processReliableWebhookQueue();
}

/**
 * Диагностика очереди и триггеров.
 */
function getReliableWebhookQueueStatus() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = RCWQ_ensureQueueSheet_(ss);
  const lastRow = sheet.getLastRow();

  const counts = {
    PENDING: 0,
    PROCESSING: 0,
    RETRY: 0,
    DONE: 0,
    REJECTED: 0,
    FAILED: 0
  };

  let oldestOpen = '';
  let newestReceived = '';

  if (lastRow >= 2) {
    const values = sheet.getRange(2, 2, lastRow - 1, 2).getDisplayValues();

    values.forEach(function(row) {
      const received = String(row[0] || '');
      const status = String(row[1] || '').toUpperCase();

      if (Object.prototype.hasOwnProperty.call(counts, status)) {
        counts[status]++;
      }

      if (received) newestReceived = received;
      if (
        !oldestOpen &&
        (status === 'PENDING' || status === 'PROCESSING' || status === 'RETRY')
      ) {
        oldestOpen = received;
      }
    });
  }

  const triggerCounts = {
    processor: 0,
    cleanup: 0
  };

  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    const handler = trigger.getHandlerFunction ? trigger.getHandlerFunction() : '';
    if (handler === RCWQ_PROCESS_HANDLER) triggerCounts.processor++;
    if (handler === RCWQ_CLEANUP_HANDLER) triggerCounts.cleanup++;
  });

  const properties = PropertiesService.getScriptProperties().getProperties();
  const emergencyMetaCount = Object.keys(properties).filter(function(key) {
    return key.indexOf(RCWQ_EMERGENCY_PREFIX) === 0 && /_META$/.test(key);
  }).length;

  const result = {
    status: 'OK',
    version: RCWQ_VERSION,
    core_handler_found: typeof processWebhookImmediately_ === 'function',
    sheet: RCWQ_SHEET_NAME,
    sheet_hidden: sheet.isSheetHidden(),
    rows_total: Math.max(0, lastRow - 1),
    grid_rows: sheet.getMaxRows(),
    spare_rows: Math.max(0, sheet.getMaxRows() - lastRow),
    queue: counts,
    oldest_open: oldestOpen,
    newest_received: newestReceived,
    emergency_records: emergencyMetaCount,
    triggers: triggerCounts,
    last_received: properties[RCWQ_PROP_LAST_RECEIVED] || '',
    last_success: properties[RCWQ_PROP_LAST_SUCCESS] || '',
    last_error: properties[RCWQ_PROP_LAST_ERROR] || ''
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}

/**
 * Удаляет старые завершённые строки. Открытые события никогда не удаляются.
 */
function cleanupReliableWebhookQueue() {
  const lock = LockService.getUserLock();
  if (!lock.tryLock(1000)) return { status: 'CLEANUP_SKIPPED_LOCKED' };

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = RCWQ_ensureQueueSheet_(ss);
    const lastRow = sheet.getLastRow();

    if (lastRow < 2) {
      RCWQ_ensureQueueRowBuffer_(sheet);
      return { status: 'NOTHING_TO_CLEAN', deleted: 0 };
    }

    const values = sheet.getRange(2, 2, lastRow - 1, 2).getValues();
    const now = Date.now();
    const rowsToDelete = [];

    values.forEach(function(row, index) {
      const received = RCWQ_parseDate_(row[0]);
      const status = String(row[1] || '').toUpperCase();
      if (!received) return;

      let days = 0;
      if (status === 'DONE') days = RCWQ_DONE_RETENTION_DAYS;
      else if (status === 'REJECTED') days = RCWQ_REJECTED_RETENTION_DAYS;
      else if (status === 'FAILED') days = RCWQ_FAILED_RETENTION_DAYS;
      else return;

      if (received.getTime() < now - days * 24 * 60 * 60 * 1000) {
        rowsToDelete.push(index + 2);
      }
    });

    const groups = RCWQ_groupRowsForDeletion_(rowsToDelete);
    let deleted = 0;

    groups.reverse().forEach(function(group) {
      sheet.deleteRows(group.start, group.count);
      deleted += group.count;
    });

    /*
     * V2.2: после удаления старых записей запас строк ВОССТАНАВЛИВАЕТСЯ,
     * а не обрезается до lastRow + 100.
     */
    RCWQ_ensureQueueRowBuffer_(sheet);

    return {
      status: 'CLEANED',
      deleted: deleted,
      grid_rows: sheet.getMaxRows(),
      spare_rows: Math.max(0, sheet.getMaxRows() - sheet.getLastRow())
    };
  } finally {
    try { lock.releaseLock(); } catch (error) {}
  }
}

function showReliableWebhookQueueSheet() {
  const sheet = RCWQ_ensureQueueSheet_(SpreadsheetApp.openById(SPREADSHEET_ID));
  sheet.showSheet();
  return getReliableWebhookQueueStatus();
}

function hideReliableWebhookQueueSheet() {
  const sheet = RCWQ_ensureQueueSheet_(SpreadsheetApp.openById(SPREADSHEET_ID));
  sheet.hideSheet();
  return getReliableWebhookQueueStatus();
}

/* ========================================================================== */
/* ПРИЁМ И НАДЁЖНОЕ ХРАНЕНИЕ                                                 */
/* ========================================================================== */

function RCWQ_getRawPostBody_(e) {
  if (e && e.postData && e.postData.contents !== undefined) {
    return String(e.postData.contents);
  }

  if (e && e.parameter && typeof e.parameter === 'object') {
    return Object.keys(e.parameter).map(function(key) {
      return key + '=' + String(
        e.parameter[key] === undefined ? '' : e.parameter[key]
      );
    }).join('\n');
  }

  return '';
}

function RCWQ_extractHints_(raw) {
  const result = { event: '', eventKey: '', tgId: '' };

  try {
    if (typeof parseIncoming_ !== 'function') return result;

    const data = parseIncoming_(raw);
    const event = typeof normalizeEvent_ === 'function'
      ? normalizeEvent_(data)
      : String(data.event || '');

    result.event = event || '';

    if (typeof buildEventKey_ === 'function') {
      result.eventKey = buildEventKey_(event, raw, data) || '';
    }

    result.tgId = RCWQ_extractTgId_(data, event);
  } catch (error) {}

  return result;
}

function RCWQ_extractTgId_(data, event) {
  data = data || {};
  const targetFirst = event === 'stat' || event === 'antispecnaz';

  const values = targetFirst
    ? [
        data.reply_user_id,
        data.reply_tg_id,
        data.reply_target_user_id,
        data.reply_target_tg_id,
        data.target_user_id,
        data.tg_id,
        data.actor_user_id,
        data.user_id
      ]
    : [
        data.tg_id,
        data.target_user_id,
        data.actor_user_id,
        data.reply_user_id,
        data.reply_tg_id,
        data.user_id
      ];

  for (let index = 0; index < values.length; index++) {
    const match = String(values[index] || '').match(/\d{5,20}/);
    if (match) return match[0];
  }

  return '';
}

function RCWQ_appendRecordToQueue_(record) {
  const row = RCWQ_recordToRow_(record);
  let apiError = null;

  try {
    RCWQ_appendViaSheetsApi_(row);
    return;
  } catch (error) {
    apiError = error;
  }

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = RCWQ_ensureQueueSheet_(ss);
    sheet.appendRow(row);
    return;
  } catch (fallbackError) {
    throw new Error(
      'Sheets API: ' + RCWQ_errorText_(apiError) + '; ' +
      'SpreadsheetApp: ' + RCWQ_errorText_(fallbackError)
    );
  }
}

function RCWQ_appendViaSheetsApi_(row) {
  const range = "'" + RCWQ_SHEET_NAME.replace(/'/g, "''") + "'!A:L";
  const url = 'https://sheets.googleapis.com/v4/spreadsheets/' +
    encodeURIComponent(SPREADSHEET_ID) + '/values/' +
    encodeURIComponent(range) + ':append' +
    '?valueInputOption=RAW&insertDataOption=OVERWRITE';

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken()
    },
    payload: JSON.stringify({ values: [row] }),
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error(
      'HTTP ' + code + ': ' +
      RCWQ_truncate_(response.getContentText(), 2000)
    );
  }
}

function RCWQ_recordToRow_(record) {
  const now = new Date();

  return [
    String(record.queueId || ''),
    RCWQ_formatDate_(record.receivedAt || now),
    'PENDING',
    0,
    String(record.event || ''),
    String(record.eventKey || ''),
    String(record.tgId || ''),
    Utilities.base64EncodeWebSafe(
      String(record.raw || ''),
      Utilities.Charset.UTF_8
    ),
    RCWQ_formatDate_(now),
    '',
    '',
    RCWQ_VERSION
  ];
}

/**
 * Аварийная запись в Script Properties с разбиением body на безопасные части.
 */
function RCWQ_saveEmergencyRecord_(record) {
  const props = PropertiesService.getScriptProperties();
  const queueId = String(record.queueId || Utilities.getUuid());
  const payload = Utilities.base64EncodeWebSafe(
    String(record.raw || ''),
    Utilities.Charset.UTF_8
  );

  const chunks = [];
  for (
    let start = 0;
    start < payload.length;
    start += RCWQ_PROPERTY_CHUNK_SIZE
  ) {
    chunks.push(payload.substring(start, start + RCWQ_PROPERTY_CHUNK_SIZE));
  }
  if (!chunks.length) chunks.push('');

  const baseKey = RCWQ_EMERGENCY_PREFIX + queueId;
  const values = {};

  values[baseKey + '_META'] = JSON.stringify({
    queueId: queueId,
    receivedAt: (record.receivedAt || new Date()).toISOString(),
    event: String(record.event || ''),
    eventKey: String(record.eventKey || ''),
    tgId: String(record.tgId || ''),
    chunks: chunks.length,
    digest: RCWQ_sha256_(String(record.raw || '')),
    version: RCWQ_VERSION
  });

  chunks.forEach(function(chunk, index) {
    values[baseKey + '_CHUNK_' + index] = chunk;
  });

  props.setProperties(values, false);
}

function RCWQ_deleteEmergencyRecord_(queueId) {
  const props = PropertiesService.getScriptProperties();
  const baseKey = RCWQ_EMERGENCY_PREFIX + String(queueId || '');
  const metaText = props.getProperty(baseKey + '_META');
  let chunkCount = 0;

  try {
    const meta = JSON.parse(metaText || '{}');
    chunkCount = Number(meta.chunks || 0);
  } catch (error) {}

  props.deleteProperty(baseKey + '_META');

  for (let index = 0; index < chunkCount; index++) {
    props.deleteProperty(baseKey + '_CHUNK_' + index);
  }
}

function RCWQ_recoverEmergencyRecords_(sheet) {
  const propsService = PropertiesService.getScriptProperties();
  const all = propsService.getProperties();

  const metaKeys = Object.keys(all).filter(function(key) {
    return key.indexOf(RCWQ_EMERGENCY_PREFIX) === 0 && /_META$/.test(key);
  });

  const records = [];

  metaKeys.forEach(function(metaKey) {
    try {
      const meta = JSON.parse(all[metaKey] || '{}');
      if (!meta.queueId) return;
      records.push({ metaKey: metaKey, meta: meta });
    } catch (error) {}
  });

  records.sort(function(a, b) {
    return String(a.meta.receivedAt || '')
      .localeCompare(String(b.meta.receivedAt || ''));
  });

  let recovered = 0;

  for (
    let index = 0;
    index < records.length && recovered < RCWQ_MAX_EMERGENCY_PER_RUN;
    index++
  ) {
    const meta = records[index].meta;
    const queueId = String(meta.queueId || '');

    if (RCWQ_queueIdExists_(sheet, queueId)) {
      RCWQ_deleteEmergencyRecord_(queueId);
      continue;
    }

    const baseKey = RCWQ_EMERGENCY_PREFIX + queueId;
    let payload = '';
    const chunkCount = Number(meta.chunks || 0);

    for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
      const key = baseKey + '_CHUNK_' + chunkIndex;
      const chunk = all[key] !== undefined
        ? all[key]
        : propsService.getProperty(key);

      if (chunk === null || chunk === undefined) {
        throw new Error(
          'Не найден аварийный chunk ' + chunkIndex + ' для ' + queueId
        );
      }

      payload += chunk;
    }

    const raw = RCWQ_decodePayload_(payload);

    if (meta.digest && RCWQ_sha256_(raw) !== meta.digest) {
      throw new Error(
        'Контрольная сумма аварийного webhook не совпала: ' + queueId
      );
    }

    const record = {
      queueId: queueId,
      receivedAt: RCWQ_parseDate_(meta.receivedAt) || new Date(),
      event: meta.event || '',
      eventKey: meta.eventKey || '',
      tgId: meta.tgId || '',
      raw: raw
    };

    RCWQ_appendRecordToQueue_(record);
    RCWQ_deleteEmergencyRecord_(queueId);
    recovered++;
  }

  return recovered;
}

function RCWQ_queueIdExists_(sheet, queueId) {
  if (!queueId || sheet.getLastRow() < 2) return false;

  return !!sheet
    .getRange(2, 1, sheet.getLastRow() - 1, 1)
    .createTextFinder(queueId)
    .matchEntireCell(true)
    .findNext();
}

/* ========================================================================== */
/* ОБРАБОТКА И ДИАГНОСТИКА                                                   */
/* ========================================================================== */

function RCWQ_markProcessing_(sheet, rowNumber, attempts) {
  sheet.getRange(rowNumber, 3, 1, 2)
    .setValues([['PROCESSING', attempts]]);

  sheet.getRange(rowNumber, 9).setValue(new Date());
  SpreadsheetApp.flush();
}

function RCWQ_updateQueueRow_(
  sheet,
  rowNumber,
  status,
  attempts,
  resultText,
  errorText
) {
  sheet.getRange(rowNumber, 3, 1, 2)
    .setValues([[status, attempts]]);

  sheet.getRange(rowNumber, 9, 1, 3).setValues([[
    new Date(),
    RCWQ_truncate_(resultText || '', status === 'DONE' ? 2000 : 8000),
    RCWQ_truncate_(errorText || '', 8000)
  ]]);

  /* Успешный payload уже отражён в логах и защите eventKey. Его удаление
     резко замедляет рост основной книги без потери результата. */
  if (status === 'DONE') {
    sheet.getRange(rowNumber, 8).clearContent();
  }
}

function RCWQ_resetStuckRows_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const range = sheet.getRange(2, 3, lastRow - 1, 7); // C:I
  const values = range.getValues();
  const cutoff = Date.now() - RCWQ_STUCK_MINUTES * 60 * 1000;
  let changed = false;

  values.forEach(function(row) {
    const status = String(row[0] || '').toUpperCase();
    const updated = RCWQ_parseDate_(row[6]);

    if (
      status === 'PROCESSING' &&
      (!updated || updated.getTime() < cutoff)
    ) {
      row[0] = 'RETRY';
      row[6] = new Date();
      changed = true;
    }
  });

  if (changed) range.setValues(values);
}

function RCWQ_buildFakeEvent_(raw) {
  return {
    postData: {
      contents: String(raw || ''),
      type: 'text/plain',
      length: String(raw || '').length
    },
    parameter: {},
    parameters: {}
  };
}

function RCWQ_readHandlerResult_(output) {
  if (output && typeof output.getContent === 'function') {
    return RCWQ_parseJsonResult_(output.getContent());
  }

  if (typeof output === 'string') {
    return RCWQ_parseJsonResult_(output);
  }

  if (output && typeof output === 'object') return output;

  return {
    status: 'ERROR',
    message: 'Пустой или неизвестный ответ внутреннего обработчика'
  };
}

function RCWQ_parseJsonResult_(text) {
  try {
    return JSON.parse(String(text || ''));
  } catch (error) {
    return {
      status: 'ERROR',
      message:
        'Внутренний обработчик вернул не JSON: ' +
        RCWQ_truncate_(text, 2000)
    };
  }
}

function RCWQ_isTransientError_(result) {
  const text = String(
    result && (result.message || result.error || result.hint || '') || ''
  ).toLowerCase();

  return (
    text.indexOf('lock') !== -1 ||
    text.indexOf('timeout') !== -1 ||
    text.indexOf('timed out') !== -1 ||
    text.indexOf('another process') !== -1 ||
    text.indexOf('service invoked too many times') !== -1 ||
    text.indexOf('internal error') !== -1 ||
    text.indexOf('temporary') !== -1 ||
    text.indexOf('try again') !== -1 ||
    text.indexOf('временно') !== -1 ||
    text.indexOf('превышено время') !== -1
  );
}

function RCWQ_resultErrorText_(result) {
  if (!result) return '';

  return String(
    result.message ||
    result.error ||
    result.hint ||
    result.status ||
    ''
  );
}

/**
 * V2.2: поддерживает большой физический запас строк.
 * Это ключевой элемент устранения ложных INSERT_ROW.
 */
function RCWQ_ensureQueueRowBuffer_(sheet) {
  if (!sheet) return;

  const lastRow = Math.max(sheet.getLastRow(), 1);
  const maxRows = sheet.getMaxRows();

  if (maxRows < RCWQ_MIN_GRID_ROWS) {
    sheet.insertRowsAfter(
      maxRows,
      RCWQ_MIN_GRID_ROWS - maxRows
    );
    return;
  }

  const spareRows = Math.max(0, maxRows - lastRow);

  /*
   * КЛЮЧЕВОЙ FIX:
   * при обычных webhook НИКАКИХ insertRowsAfter().
   * Grid расширяется только редко, когда почти закончился большой запас.
   */
  if (spareRows < RCWQ_BUFFER_LOW_WATER_ROWS) {
    sheet.insertRowsAfter(
      maxRows,
      RCWQ_BUFFER_GROW_ROWS
    );
  }
}

function RCWQ_ensureQueueSheet_(ss) {
  const props = PropertiesService.getScriptProperties();
  let sheet = ss.getSheetByName(RCWQ_SHEET_NAME);
  const created = !sheet;

  if (!sheet) {
    sheet = ss.insertSheet(RCWQ_SHEET_NAME);
  }

  if (sheet.getMaxColumns() < RCWQ_HEADERS.length) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      RCWQ_HEADERS.length - sheet.getMaxColumns()
    );
  }

  /*
   * ВАЖНО: буфер проверяется ДО early return.
   * Иначе после первой успешной инициализации запас строк больше
   * никогда бы автоматически не восстанавливался.
   */
  RCWQ_ensureQueueRowBuffer_(sheet);

  const ready =
    props.getProperty(RCWQ_PROP_SHEET_READY) === RCWQ_VERSION;

  if (!created && ready) {
    return sheet;
  }

  sheet.getRange(1, 1, 1, RCWQ_HEADERS.length)
    .setValues([RCWQ_HEADERS]);

  sheet.getRange(1, 1, 1, RCWQ_HEADERS.length)
    .setBackground('#DCE6F1')
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(true);

  sheet.setFrozenRows(1);

  const widths = [
    220, 150, 110, 80, 130, 360,
    130, 500, 150, 450, 450, 120
  ];

  widths.forEach(function(width, index) {
    sheet.setColumnWidth(index + 1, width);
  });

  props.setProperty(
    RCWQ_PROP_SHEET_READY,
    RCWQ_VERSION
  );

  return sheet;
}

function RCWQ_deleteOwnTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    const handler = trigger.getHandlerFunction
      ? trigger.getHandlerFunction()
      : '';

    if (
      handler === RCWQ_PROCESS_HANDLER ||
      handler === RCWQ_CLEANUP_HANDLER
    ) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function RCWQ_groupRowsForDeletion_(rows) {
  if (!rows.length) return [];

  const sorted = rows.slice()
    .sort(function(a, b) {
      return a - b;
    });

  const groups = [];
  let start = sorted[0];
  let previous = sorted[0];

  for (let index = 1; index < sorted.length; index++) {
    const current = sorted[index];

    if (current === previous + 1) {
      previous = current;
      continue;
    }

    groups.push({
      start: start,
      count: previous - start + 1
    });

    start = current;
    previous = current;
  }

  groups.push({
    start: start,
    count: previous - start + 1
  });

  return groups;
}

function RCWQ_decodePayload_(payloadBase64) {
  const bytes = Utilities.base64DecodeWebSafe(
    String(payloadBase64 || '')
  );

  return Utilities.newBlob(bytes)
    .getDataAsString('UTF-8');
}

function RCWQ_sha256_(text) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(text || ''),
    Utilities.Charset.UTF_8
  );

  return digest.map(function(byte) {
    const value = (byte + 256) % 256;
    return ('0' + value.toString(16)).slice(-2);
  }).join('');
}

function RCWQ_formatDate_(value) {
  const date = RCWQ_parseDate_(value) || new Date();
  const timeZone =
    Session.getScriptTimeZone() ||
    'Europe/Moscow';

  return Utilities.formatDate(
    date,
    timeZone,
    'dd.MM.yyyy HH:mm:ss'
  );
}

function RCWQ_parseDate_(value) {
  if (
    value instanceof Date &&
    !isNaN(value.getTime())
  ) {
    return value;
  }

  const text = String(value || '').trim();
  if (!text) return null;

  const nativeDate = new Date(text);
  if (!isNaN(nativeDate.getTime())) {
    return nativeDate;
  }

  const match = text.match(
    /^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/
  );

  if (!match) return null;

  return new Date(
    Number(match[3]),
    Number(match[2]) - 1,
    Number(match[1]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6])
  );
}

function RCWQ_json_(value) {
  return ContentService
    .createTextOutput(
      JSON.stringify(value || {})
    )
    .setMimeType(
      ContentService.MimeType.JSON
    );
}

function RCWQ_errorText_(error) {
  return String(
    error && error.stack
      ? error.stack
      : error
  );
}

function RCWQ_truncate_(value, maxLength) {
  const text = String(value || '');

  return text.length > maxLength
    ? text.substring(0, maxLength) + '…'
    : text;
}

