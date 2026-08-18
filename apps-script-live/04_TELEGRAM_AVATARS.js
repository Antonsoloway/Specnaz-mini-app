/* ========================================================================== */
/* 04_TELEGRAM_AVATARS CURRENT V3.8 NON-DESTRUCTIVE — АВАТАРЫ TELEGRAM ДЛЯ ПОИСКА И КАРТОЧКИ КОМАНДЫ     */
/* ========================================================================== */

/**
 * Что делает модуль:
 * 1. Получает аватар Telegram по id тг через Telegram Bot API.
 * 2. Хранит оригинал в скрытом листе «Аватары» админской таблицы.
 * 3. Создаёт постоянный скрытый лист «Аватары» в публичной таблице —
 *    собственный реестр, который заполняется напрямую через Telegram API.
 * 4. Показывает аватары на странице «Поиск».
 * 5. Показывает аватары в списке участников «Карточки команды».
 * 6. Обновляет всех участников раз в сутки партиями.
 * 7. Ставит нового участника в очередь после входа или создания записи.
 * 8. Показывает официальную заглушку Telegram, если фотографии нет.
 * 9. Удаляет устаревший лист «Тест аватаров» при установке.
 * 10. Сопоставляет Telegram ID как текст, чтобы числовые ID публичных формул находились корректно.
 *
 * Токен Telegram хранится только в Script Properties:
 * TELEGRAM_BOT_TOKEN
 */

const TG_AVATAR_MODULE_VERSION = '3.8.0';

const TG_AVATAR_CONFIG = Object.freeze({
  adminSpreadsheetId:
    typeof SPREADSHEET_ID !== 'undefined'
      ? SPREADSHEET_ID
      : '1kkADcKysWdoGy95O36z9jCaoGUUHN0g4XH4LwVtAK_o',

  publicSpreadsheetId:
    typeof PUBLIC_SYNC_CONFIG !== 'undefined' &&
    PUBLIC_SYNC_CONFIG &&
    PUBLIC_SYNC_CONFIG.spreadsheetId
      ? PUBLIC_SYNC_CONFIG.spreadsheetId
      : '1FKEvF4pDW9dt6MOk4xjtF1fut60hZ5HxpoGN3l93s7M',

  tokenProperty: 'TELEGRAM_BOT_TOKEN',
  placeholderUrl: 'https://telegram.org/img/t_logo.png',
  legacyTestSheet: 'Тест аватаров',
  queueProperty: 'ROYAL_CRM_TELEGRAM_AVATAR_QUEUE',
  publicRepairQueueProperty: 'ROYAL_CRM_PUBLIC_AVATAR_REPAIR_QUEUE',
  lastDailyStartProperty: 'ROYAL_CRM_TELEGRAM_AVATAR_LAST_DAILY_START',
  lastBatchProperty: 'ROYAL_CRM_TELEGRAM_AVATAR_LAST_BATCH',
  lastFullCompleteProperty: 'ROYAL_CRM_TELEGRAM_AVATAR_LAST_FULL_COMPLETE',

  adminBaseSheet:
    typeof SHEET_BASE !== 'undefined' ? SHEET_BASE : 'База участников',
  adminAvatarSheet: 'Аватары',

  publicBaseSheet: 'База участников',
  publicListsSheet: 'Списки',
  publicAvatarSheet: 'Аватары',
  publicSearchSheet: 'Поиск',
  publicCardSheet: 'Карточка команды',
  publicSearchDataSheet: 'Поиск данные',
  publicRelationsSheet: 'Связи участников',
  adminSearchSheet: 'Поиск',
  adminCardSheet: 'Карточка команды',
  adminRelationsSheet: 'Связи участников',

  batchSize: 15,
  queueTriggerMinutes: 5,
  dailyHour: 3,
  temporarySheetPrefix: '__AVATAR_CACHE_SWAP_',

  maxBaseRow: 999,
  maxAvatarRow: 999,
  searchResultLimit: 250,
  cardResultLimit: 66,

  adminColumns: Object.freeze({
    tgId: 1,          // A
    image: 2,         // B
    fileId: 3,        // C
    fileUniqueId: 4,  // D
    checkedAt: 5,     // E
    status: 6,        // F
    name: 7,          // G
    tgName: 8,        // H
    username: 9,      // I
    sourceRow: 10,    // J
    error: 11         // K
  }),

  publicRegistryColumns: Object.freeze({
    tgId: 11,         // K
    image: 12,        // L
    fileId: 13,       // M
    fileUniqueId: 14, // N
    checkedAt: 15,    // O
    status: 16,       // P
    name: 17          // Q
  })
});

const TG_AVATAR_QUEUE_HANDLER = 'processTelegramAvatarQueue';
const TG_AVATAR_DAILY_HANDLER = 'startDailyTelegramAvatarRefresh';

/* -------------------------------------------------------------------------- */
/* TELEGRAM BOT API                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Возвращает токен Telegram-бота из Script Properties.
 * Сам токен нигде не записывается в таблицу или журнал.
 */
function tgAvatarGetToken_() {
  const token = String(
    PropertiesService.getScriptProperties()
      .getProperty(TG_AVATAR_CONFIG.tokenProperty) || ''
  ).trim();

  if (!token) {
    throw new Error(
      'Не задано свойство скрипта ' +
      TG_AVATAR_CONFIG.tokenProperty +
      '. Откройте Настройки проекта → Свойства скрипта.'
    );
  }

  return token;
}

/**
 * Безопасный вызов Telegram Bot API.
 * При ошибке возвращает понятное описание без раскрытия токена.
 */
function tgAvatarApi_(method, params) {
  const apiMethod = tgAvatarClean_(method);
  if (!apiMethod) {
    throw new Error('TG_AVATAR_API_METHOD_EMPTY');
  }

  const token = tgAvatarGetToken_();
  const url =
    'https://api.telegram.org/bot' +
    token +
    '/' +
    apiMethod;

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json; charset=utf-8',
    payload: JSON.stringify(params || {}),
    muteHttpExceptions: true
  });

  const responseCode = response.getResponseCode();
  const responseText = response.getContentText();
  let data = null;

  try {
    data = JSON.parse(responseText);
  } catch (err) {
    throw new Error(
      'Telegram API: некорректный ответ, HTTP ' + responseCode
    );
  }

  if (
    responseCode < 200 ||
    responseCode >= 300 ||
    !data ||
    data.ok !== true
  ) {
    const description =
      data && data.description
        ? String(data.description)
        : 'HTTP ' + responseCode;

    throw new Error('Telegram API: ' + description);
  }

  return data;
}

/* -------------------------------------------------------------------------- */
/* УСТАНОВКА И ПРОВЕРКА                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Главная установочная функция.
 *
 * Перед запуском добавьте в:
 * Настройки проекта -> Свойства скрипта
 *
 * TELEGRAM_BOT_TOKEN = токен вашего Telegram-бота
 */
function installTelegramAvatarSystem() {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000);

    const adminSs = SpreadsheetApp.openById(TG_AVATAR_CONFIG.adminSpreadsheetId);
    const publicSs = SpreadsheetApp.openById(TG_AVATAR_CONFIG.publicSpreadsheetId);
    const legacyTestSheetRemoved = tgAvatarDeleteLegacyTestSheet_(adminSs);

    const token = tgAvatarGetToken_();
    const bot = tgAvatarApi_('getMe', {});

    const adminAvatarSheet = tgAvatarEnsureAdminSheet_(adminSs);
    const publicListsSheet = tgAvatarEnsurePublicRegistry_(publicSs);
    const publicAvatarCache = tgAvatarRefreshPublicAvatarCache_(
      adminAvatarSheet,
      publicSs
    );

    tgAvatarSetupAdminSearch_(adminSs);
    tgAvatarSetupAdminCard_(adminSs);
    tgAvatarSetupPublicBase_(publicSs);
    tgAvatarSetupPublicSearch_(publicSs);
    tgAvatarSetupPublicCard_(publicSs);
    tgAvatarInstallTriggers_();

    const queued = tgAvatarQueueAllBaseIds_(adminSs, 'install');

    if (typeof markPublicSyncPending_ === 'function') {
      markPublicSyncPending_('telegram_avatar_install');
    }

    SpreadsheetApp.flush();

    return {
      status: 'INSTALLED',
      bot_username:
        bot && bot.result && bot.result.username
          ? '@' + bot.result.username
          : '',
      token_configured: Boolean(token),
      admin_avatar_sheet: adminAvatarSheet.getName(),
      public_registry_sheet: publicListsSheet.getName(),
      public_avatar_sheet: publicAvatarCache.sheet_name,
      public_avatar_rows: publicAvatarCache.rows,
      legacy_test_sheet_removed: legacyTestSheetRemoved,
      placeholder_url: TG_AVATAR_CONFIG.placeholderUrl,
      queued: queued,
      next_step: 'Запустите repairAllPublicTelegramAvatars. Публичный скрытый лист «Аватары» будет обновлён полностью'
    };

  } finally {
    try {
      lock.releaseLock();
    } catch (err) {}
  }
}

/**
 * Полная диагностика без вывода токена.
 */
function checkTelegramAvatarSystem() {
  const props = PropertiesService.getScriptProperties();
  const tokenConfigured = Boolean(props.getProperty(TG_AVATAR_CONFIG.tokenProperty));

  let botOk = false;
  let botUsername = '';
  let botError = '';

  if (tokenConfigured) {
    try {
      const bot = tgAvatarApi_('getMe', {});
      botOk = Boolean(bot && bot.ok);
      botUsername =
        bot && bot.result && bot.result.username
          ? '@' + bot.result.username
          : '';
    } catch (err) {
      botError = tgAvatarSafeError_(err);
    }
  }

  const adminSs = SpreadsheetApp.openById(TG_AVATAR_CONFIG.adminSpreadsheetId);
  const publicSs = SpreadsheetApp.openById(TG_AVATAR_CONFIG.publicSpreadsheetId);

  const adminSheet = adminSs.getSheetByName(TG_AVATAR_CONFIG.adminAvatarSheet);
  const lists = publicSs.getSheetByName(TG_AVATAR_CONFIG.publicListsSheet);
  const publicAvatarSheet = publicSs.getSheetByName(
    TG_AVATAR_CONFIG.publicAvatarSheet
  );
  const base = adminSs.getSheetByName(TG_AVATAR_CONFIG.adminBaseSheet);

  const baseIds = base ? tgAvatarReadBasePeople_(base).ids : [];

  const adminStats = adminSheet
    ? tgAvatarReadRegistryStats_(
        adminSheet,
        TG_AVATAR_CONFIG.adminColumns.tgId,
        TG_AVATAR_CONFIG.adminColumns.image,
        TG_AVATAR_CONFIG.adminColumns.status
      )
    : tgAvatarEmptyStats_();

  const publicStats = publicAvatarSheet
    ? tgAvatarReadRegistryStats_(
        publicAvatarSheet,
        TG_AVATAR_CONFIG.adminColumns.tgId,
        TG_AVATAR_CONFIG.adminColumns.image,
        TG_AVATAR_CONFIG.adminColumns.status
      )
    : tgAvatarEmptyStats_();

  const triggerHandlers = ScriptApp.getProjectTriggers()
    .map(trigger => trigger.getHandlerFunction());

  const search = publicSs.getSheetByName(TG_AVATAR_CONFIG.publicSearchSheet);
  const card = publicSs.getSheetByName(TG_AVATAR_CONFIG.publicCardSheet);
  const publicBase = publicSs.getSheetByName(TG_AVATAR_CONFIG.publicBaseSheet);
  const adminSearch = adminSs.getSheetByName(TG_AVATAR_CONFIG.adminSearchSheet);
  const adminCard = adminSs.getSheetByName(TG_AVATAR_CONFIG.adminCardSheet);

  const result = {
    status:
      tokenConfigured &&
      botOk &&
      adminSheet &&
      lists &&
      publicAvatarSheet &&
      search &&
      card &&
      publicBase
        ? 'OK'
        : 'ATTENTION',

    token_configured: tokenConfigured,
    bot_api_ok: botOk,
    bot_username: botUsername,
    bot_error: botError,

    participants_with_tg_id: baseIds.length,
    queue_length: tgAvatarReadQueue_().length,

    admin_registry: adminStats,
    public_registry: publicStats,
    public_avatar_sheet_present: Boolean(publicAvatarSheet),
    public_avatar_sheet_hidden: publicAvatarSheet
      ? publicAvatarSheet.isSheetHidden()
      : false,

    queue_trigger_installed:
      triggerHandlers.indexOf(TG_AVATAR_QUEUE_HANDLER) !== -1,
    daily_trigger_installed:
      triggerHandlers.indexOf(TG_AVATAR_DAILY_HANDLER) !== -1,

    legacy_test_sheet_present:
      Boolean(adminSs.getSheetByName(TG_AVATAR_CONFIG.legacyTestSheet)),

    public_base_has_tg_id_column:
      publicBase
        ? tgAvatarClean_(publicBase.getRange('E1').getDisplayValue()) === 'id тг'
        : false,

    search_ready:
      search
        ? tgAvatarClean_(search.getRange('A5').getDisplayValue()) === 'Аватар' &&
          tgAvatarClean_(search.getRange('B5').getDisplayValue()) === 'Имя'
        : false,

    card_ready:
      card
        ? tgAvatarClean_(card.getRange('A14').getDisplayValue()) === 'Аватар'
        : false,

    admin_search_ready:
      adminSearch
        ? tgAvatarClean_(adminSearch.getRange('A5').getDisplayValue()) === 'Аватар'
        : false,

    admin_card_ready:
      adminCard
        ? tgAvatarClean_(adminCard.getRange('A14').getDisplayValue()) === 'Аватар'
        : false,

    last_daily_start:
      props.getProperty(TG_AVATAR_CONFIG.lastDailyStartProperty) || '',
    last_batch:
      props.getProperty(TG_AVATAR_CONFIG.lastBatchProperty) || '',
    last_full_complete:
      props.getProperty(TG_AVATAR_CONFIG.lastFullCompleteProperty) || ''
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/**
 * Удаляет устаревший лист теста аватаров из админской таблицы.
 * Функцию можно запустить отдельно, но installTelegramAvatarSystem
 * выполняет это автоматически.
 */
function removeTelegramAvatarTestSheet() {
  const adminSs = SpreadsheetApp.openById(
    TG_AVATAR_CONFIG.adminSpreadsheetId
  );

  const removed = tgAvatarDeleteLegacyTestSheet_(adminSs);

  return {
    status: removed ? 'REMOVED' : 'NOT_FOUND',
    sheet: TG_AVATAR_CONFIG.legacyTestSheet
  };
}

/**
 * Быстрый тест: ставит в очередь первого участника с Telegram ID
 * и сразу обрабатывает одну партию.
 */
function testFirstTelegramAvatar() {
  const adminSs = SpreadsheetApp.openById(TG_AVATAR_CONFIG.adminSpreadsheetId);
  const base = tgAvatarRequireSheet_(
    adminSs,
    TG_AVATAR_CONFIG.adminBaseSheet,
    'админская таблица'
  );

  const people = tgAvatarReadBasePeople_(base);
  if (!people.ids.length) {
    return { status: 'NO_TELEGRAM_IDS' };
  }

  queueTelegramAvatarRefresh_(people.ids[0], 'manual_test');
  return processTelegramAvatarQueue();
}

/* -------------------------------------------------------------------------- */
/* ОЧЕРЕДЬ И ТРИГГЕРЫ                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Безопасный публичный хук для вебхука.
 *
 * Функция намеренно НЕ берёт ScriptLock: doPost уже держит этот lock.
 */
function queueTelegramAvatarRefresh_(tgId, reason) {
  const id = tgAvatarNormalizeId_(tgId);
  if (!id) return false;

  const queue = tgAvatarReadQueue_();
  if (queue.indexOf(id) === -1) {
    queue.push(id);
    tgAvatarWriteQueue_(queue);
  }

  return true;
}

/**
 * Хук для синхронизации: ставит в очередь только тех публичных участников,
 * которых ещё нет в реестре аватаров.
 */
function queueMissingTelegramAvatarsFromParticipants_(participants) {
  if (!Array.isArray(participants) || !participants.length) return 0;

  const adminSs = SpreadsheetApp.openById(TG_AVATAR_CONFIG.adminSpreadsheetId);
  const avatarSheet = tgAvatarEnsureAdminSheet_(adminSs);
  const known = tgAvatarReadKnownIds_(
    avatarSheet,
    TG_AVATAR_CONFIG.adminColumns.tgId
  );

  let added = 0;

  participants.forEach(participant => {
    const id = tgAvatarNormalizeId_(
      participant && (participant.tgId || participant.telegramId)
    );

    if (!id || known[id]) return;

    if (queueTelegramAvatarRefresh_(id, 'public_sync_missing')) {
      known[id] = true;
      added++;
    }
  });

  return added;
}

/**
 * Ставит всех участников с Telegram ID в очередь.
 * Эту функцию можно запускать вручную для полного обновления.
 */
function startFullTelegramAvatarRefresh() {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000);
    const adminSs = SpreadsheetApp.openById(TG_AVATAR_CONFIG.adminSpreadsheetId);
    const queued = tgAvatarQueueAllBaseIds_(adminSs, 'manual_full');

    return {
      status: 'QUEUED',
      queued: queued,
      queue_length: tgAvatarReadQueue_().length
    };

  } finally {
    try {
      lock.releaseLock();
    } catch (err) {}
  }
}

/**
 * Ежедневный триггер. Только формирует очередь — тяжёлая обработка
 * выполняется партиями функцией processTelegramAvatarQueue.
 */
function startDailyTelegramAvatarRefresh() {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000);

    const adminSs = SpreadsheetApp.openById(TG_AVATAR_CONFIG.adminSpreadsheetId);
    const queued = tgAvatarQueueAllBaseIds_(adminSs, 'daily');

    PropertiesService.getScriptProperties().setProperty(
      TG_AVATAR_CONFIG.lastDailyStartProperty,
      new Date().toISOString()
    );

    return {
      status: 'DAILY_QUEUED',
      queued: queued,
      queue_length: tgAvatarReadQueue_().length
    };

  } finally {
    try {
      lock.releaseLock();
    } catch (err) {}
  }
}

/**
 * Обрабатывает одну партию очереди.
 * Ошибка одного пользователя не останавливает остальных.
 */
function processTelegramAvatarQueue() {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000);

    const queue = tgAvatarReadQueue_();
    if (!queue.length) {
      const publicRepairQueue = tgAvatarReadQueueByProperty_(
        TG_AVATAR_CONFIG.publicRepairQueueProperty
      );

      if (publicRepairQueue.length) {
        return tgAvatarProcessPublicRepairBatchNoLock_();
      }

      PropertiesService.getScriptProperties().setProperty(
        TG_AVATAR_CONFIG.lastFullCompleteProperty,
        new Date().toISOString()
      );
      return { status: 'NOTHING_TO_PROCESS', processed: 0 };
    }

    const batch = queue.slice(0, TG_AVATAR_CONFIG.batchSize);
    const remaining = queue.slice(batch.length);

    // Партия убирается из очереди до обработки. Ежедневный обход
    // повторно поставит участника при временной ошибке.
    tgAvatarWriteQueue_(remaining);

    const adminSs = SpreadsheetApp.openById(
      TG_AVATAR_CONFIG.adminSpreadsheetId
    );
    const publicSs = SpreadsheetApp.openById(
      TG_AVATAR_CONFIG.publicSpreadsheetId
    );

    const base = tgAvatarRequireSheet_(
      adminSs,
      TG_AVATAR_CONFIG.adminBaseSheet,
      'админская таблица'
    );

    const adminAvatarSheet = tgAvatarEnsureAdminSheet_(adminSs);
    tgAvatarEnsurePublicRegistry_(publicSs);

    const people = tgAvatarReadBasePeople_(base);
    const adminIndex = tgAvatarBuildRegistryIndex_(
      adminAvatarSheet,
      TG_AVATAR_CONFIG.adminColumns.tgId
    );

    const results = [];

    batch.forEach(id => {
      const person = people.byId[id] || {
        id: id,
        name: '',
        tgName: '',
        username: '',
        sourceRow: ''
      };

      try {
        results.push(
          tgAvatarRefreshOne_(
            id,
            person,
            adminAvatarSheet,
            adminIndex
          )
        );
      } catch (err) {
        const checkedAt = new Date();
        const message = tgAvatarSafeError_(err);

        try {
          tgAvatarWriteError_(
            id,
            person,
            checkedAt,
            message,
            adminAvatarSheet,
            adminIndex
          );
        } catch (writeErr) {}

        results.push({
          tg_id: id,
          status: 'ERROR',
          message: message
        });
      }
    });

    SpreadsheetApp.flush();

    /*
     * После партии напрямую обновляем соответствующие строки постоянного
     * скрытого листа «Аватары» в публичной таблице. Видимые страницы используют
     * его точно так же, как админские страницы используют свой реестр.
     */
    const publicReport = tgAvatarSyncBatchToPublic_(
      adminSs,
      publicSs,
      adminAvatarSheet,
      batch,
      people.byId
    );

    const summary = {
      status: remaining.length ? 'BATCH_DONE' : 'FULL_QUEUE_DONE',
      processed: batch.length,
      remaining: remaining.length,
      ok: results.filter(item =>
        item.status === 'UPDATED' ||
        item.status === 'UNCHANGED' ||
        item.status === 'NO_PHOTO'
      ).length,
      errors: results.filter(item => item.status === 'ERROR').length,
      public_sync: publicReport,
      results: results
    };

    const props = PropertiesService.getScriptProperties();
    props.setProperty(
      TG_AVATAR_CONFIG.lastBatchProperty,
      JSON.stringify({
        date: new Date().toISOString(),
        processed: summary.processed,
        remaining: summary.remaining,
        errors: summary.errors,
        public_synced: publicReport.synced || 0,
        public_missing: (publicReport.missing || []).length
      })
    );

    if (!remaining.length) {
      props.setProperty(
        TG_AVATAR_CONFIG.lastFullCompleteProperty,
        new Date().toISOString()
      );
    }

    Logger.log(JSON.stringify(summary, null, 2));
    return summary;

  } finally {
    try {
      lock.releaseLock();
    } catch (err) {}
  }
}

/**
 * Удаляет только триггеры подсистемы аватаров и создаёт их заново.
 */
function reinstallTelegramAvatarTriggers() {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000);
    tgAvatarInstallTriggers_();

    return {
      status: 'TRIGGERS_INSTALLED',
      queue_every_minutes: TG_AVATAR_CONFIG.queueTriggerMinutes,
      daily_hour: TG_AVATAR_CONFIG.dailyHour
    };

  } finally {
    try {
      lock.releaseLock();
    } catch (err) {}
  }
}

function tgAvatarInstallTriggers_() {
  const handlers = [
    TG_AVATAR_QUEUE_HANDLER,
    TG_AVATAR_DAILY_HANDLER
  ];

  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (handlers.indexOf(trigger.getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger(TG_AVATAR_QUEUE_HANDLER)
    .timeBased()
    .everyMinutes(TG_AVATAR_CONFIG.queueTriggerMinutes)
    .create();

  ScriptApp.newTrigger(TG_AVATAR_DAILY_HANDLER)
    .timeBased()
    .atHour(TG_AVATAR_CONFIG.dailyHour)
    .everyDays(1)
    .create();
}

/* -------------------------------------------------------------------------- */
/* ПОЛУЧЕНИЕ АВАТАРА                                                          */
/* -------------------------------------------------------------------------- */

function tgAvatarRefreshOne_(
  tgId,
  person,
  adminSheet,
  adminIndex
) {
  const id = tgAvatarNormalizeId_(tgId);
  const checkedAt = new Date();

  if (!id) {
    throw new Error('TG_AVATAR_INVALID_ID');
  }

  const adminRow = tgAvatarEnsureRegistryRow_(
    adminSheet,
    adminIndex,
    id,
    TG_AVATAR_CONFIG.adminColumns.tgId
  );

  const profile = tgAvatarApi_('getUserProfilePhotos', {
    user_id: Number(id),
    offset: 0,
    limit: 1
  });

  const photos =
    profile &&
    profile.result &&
    Array.isArray(profile.result.photos)
      ? profile.result.photos
      : [];

  if (!photos.length || !Array.isArray(photos[0]) || !photos[0].length) {
    tgAvatarWriteNoPhoto_(
      id,
      person,
      checkedAt,
      adminSheet,
      adminRow
    );

    return { tg_id: id, status: 'NO_PHOTO' };
  }

  const photo = tgAvatarPickLargestPhoto_(photos[0]);
  if (!photo || !photo.file_id) {
    throw new Error('TG_AVATAR_PHOTO_SIZE_NOT_FOUND');
  }

  const oldUniqueId = tgAvatarClean_(
    adminSheet
      .getRange(adminRow, TG_AVATAR_CONFIG.adminColumns.fileUniqueId)
      .getDisplayValue()
  );

  const oldStatus = tgAvatarClean_(
    adminSheet
      .getRange(adminRow, TG_AVATAR_CONFIG.adminColumns.status)
      .getDisplayValue()
  );

  const adminImageExists = tgAvatarIsCellImage_(
    adminSheet
      .getRange(adminRow, TG_AVATAR_CONFIG.adminColumns.image)
      .getValue()
  );

  const unchanged =
    oldStatus === 'OK' &&
    oldUniqueId &&
    photo.file_unique_id &&
    oldUniqueId === String(photo.file_unique_id) &&
    adminImageExists;

  if (!unchanged) {
    const file = tgAvatarApi_('getFile', {
      file_id: photo.file_id
    });

    const filePath =
      file && file.result ? tgAvatarClean_(file.result.file_path) : '';

    if (!filePath) {
      throw new Error('TG_AVATAR_FILE_PATH_EMPTY');
    }

    const token = tgAvatarGetToken_();
    const telegramFileUrl =
      'https://api.telegram.org/file/bot' +
      token +
      '/' +
      filePath;

    const adminImageCell = adminSheet.getRange(
      adminRow,
      TG_AVATAR_CONFIG.adminColumns.image
    );

    tgAvatarSetImageFromUrlWithRetry_(
      adminImageCell,
      telegramFileUrl,
      'Telegram avatar ' + id,
      person.name || person.tgName || person.username || id
    );
  }

  tgAvatarWriteMetadata_(
    id,
    person,
    checkedAt,
    'OK',
    photo.file_id || '',
    photo.file_unique_id || '',
    '',
    adminSheet,
    adminRow
  );

  return {
    tg_id: id,
    status: unchanged ? 'UNCHANGED' : 'UPDATED',
    file_unique_id: String(photo.file_unique_id || '')
  };
}

function tgAvatarPickLargestPhoto_(sizes) {
  if (!Array.isArray(sizes) || !sizes.length) return null;

  return sizes.slice().sort((a, b) => {
    const aSize = Number(a && a.file_size) || 0;
    const bSize = Number(b && b.file_size) || 0;

    if (aSize !== bSize) return bSize - aSize;

    const aArea =
      (Number(a && a.width) || 0) *
      (Number(a && a.height) || 0);
    const bArea =
      (Number(b && b.width) || 0) *
      (Number(b && b.height) || 0);

    return bArea - aArea;
  })[0];
}

function tgAvatarSetImageFromUrlWithRetry_(
  targetCell,
  sourceUrl,
  altTitle,
  altDescription
) {
  const maxAttempts = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const image = SpreadsheetApp
        .newCellImage()
        .setSourceUrl(sourceUrl)
        .setAltTextTitle(String(altTitle || 'Telegram avatar'))
        .setAltTextDescription(String(altDescription || ''))
        .build();

      targetCell.setValue(image);
      SpreadsheetApp.flush();

      if (tgAvatarIsCellImage_(targetCell.getValue())) {
        return;
      }

      throw new Error('CELL_IMAGE_NOT_WRITTEN');

    } catch (err) {
      lastError = err;

      if (attempt < maxAttempts) {
        Utilities.sleep(600 * attempt);
      }
    }
  }

  throw new Error(
    'TG_AVATAR_IMAGE_WRITE_FAILED: ' +
    tgAvatarSafeError_(lastError)
  );
}

/**
 * Возвращает формульное выражение заглушки для публичных страниц.
 */
function tgAvatarPlaceholderFormula_() {
  // В формулах больше не используем IMAGE() с внешним URL.
  // Реальная фотография или заглушка заранее записывается скриптом
  // в скрытый реестр. Если запись ещё не готова — показываем пусто.
  return '""';
}

/**
 * Ставит официальную заглушку Telegram в ячейку, если картинки ещё нет.
 */
function tgAvatarEnsurePlaceholderImage_(targetCell, description) {
  if (tgAvatarCellHasImage_(targetCell)) return false;

  tgAvatarSetImageFromUrlWithRetry_(
    targetCell,
    TG_AVATAR_CONFIG.placeholderUrl,
    'Telegram — нет фотографии',
    String(description || 'У участника нет доступной фотографии Telegram')
  );

  return true;
}

/**
 * Проверяет картинку внутри ячейки с поддержкой обоих вариантов API.
 */
function tgAvatarCellHasImage_(cell) {
  try {
    return tgAvatarIsCellImage_(cell.getValue());
  } catch (err) {
    return false;
  }
}

/**
 * Копирует одну аватарку между листами одного публичного файла.
 * Используются три способа — как в рабочей синхронизации фото V4.
 */
function tgAvatarCopyCellImageV4_(sourceCell, targetCell) {
  const errors = [];

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      targetCell.clearContent();
      sourceCell.copyTo(targetCell);
      SpreadsheetApp.flush();
      Utilities.sleep(450);

      if (tgAvatarCellHasImage_(targetCell)) {
        return { ok: true, method: 'COPY_TO_NORMAL', error: '' };
      }

      errors.push('copyTo ' + attempt + ': фото не появилось');
    } catch (err) {
      errors.push(
        'copyTo ' + attempt + ': ' + tgAvatarSafeError_(err)
      );
    }
  }

  try {
    const sourceImage = sourceCell.getValue();

    if (tgAvatarIsCellImage_(sourceImage)) {
      targetCell.clearContent();
      targetCell.setValue(sourceImage);
      SpreadsheetApp.flush();
      Utilities.sleep(450);

      if (tgAvatarCellHasImage_(targetCell)) {
        return { ok: true, method: 'SET_VALUE', error: '' };
      }
    }

    errors.push('setValue: фото не появилось');
  } catch (err) {
    errors.push('setValue: ' + tgAvatarSafeError_(err));
  }

  try {
    const sourceImage = sourceCell.getValue();

    if (tgAvatarIsCellImage_(sourceImage)) {
      const contentUrl = sourceImage.getContentUrl();

      if (contentUrl) {
        const newImage = sourceImage
          .toBuilder()
          .setSourceUrl(contentUrl)
          .build();

        targetCell.clearContent();
        targetCell.setValue(newImage);
        SpreadsheetApp.flush();
        Utilities.sleep(450);

        if (tgAvatarCellHasImage_(targetCell)) {
          return {
            ok: true,
            method: 'GOOGLE_CONTENT_URL',
            error: ''
          };
        }
      }
    }

    errors.push('contentUrl: фото не появилось');
  } catch (err) {
    errors.push('contentUrl: ' + tgAvatarSafeError_(err));
  }

  targetCell.clearContent();

  return {
    ok: false,
    method: '',
    error: errors.join(' | ')
  };
}

/**
 * После обработки партии переносит её аватары в публичный реестр
 * «Списки» K:Q через постоянный публичный скрытый лист «Аватары».
 */
function tgAvatarSyncBatchToPublic_(
  adminSs,
  publicSs,
  adminAvatarSheet,
  batchIds,
  peopleById
) {
  const publicLists = tgAvatarEnsurePublicRegistry_(publicSs);
  const publicAvatarSheet = tgAvatarEnsurePublicAvatarSheet_(publicSs);

  const adminIndex = tgAvatarBuildRegistryIndex_(
    adminAvatarSheet,
    TG_AVATAR_CONFIG.adminColumns.tgId
  );
  const publicListsIndex = tgAvatarBuildRegistryIndex_(
    publicLists,
    TG_AVATAR_CONFIG.publicRegistryColumns.tgId
  );
  const publicAvatarIndex = tgAvatarBuildRegistryIndex_(
    publicAvatarSheet,
    TG_AVATAR_CONFIG.adminColumns.tgId
  );

  const report = {
    status: 'OK',
    expected: batchIds.length,
    metadata_synced: 0,
    synced: 0,
    unchanged: 0,
    no_photo: 0,
    placeholders: 0,
    preserved_on_error: 0,
    missing: [],
    methods: {
      TELEGRAM_DIRECT: 0,
      PLACEHOLDER_DIRECT: 0,
      PRESERVED: 0,
      UNCHANGED: 0
    },
    public_avatar_cache: null
  };

  batchIds.forEach(rawId => {
    const id = tgAvatarNormalizeId_(rawId);
    if (!id) return;

    const adminRow = adminIndex.byId[id] || 0;
    if (!adminRow) {
      report.missing.push(id + ': нет строки в админском реестре');
      return;
    }

    const person = peopleById[id] || {};
    const adminValues = adminAvatarSheet
      .getRange(adminRow, 1, 1, TG_AVATAR_CONFIG.adminColumns.error)
      .getValues()[0];

    const fileId = tgAvatarClean_(adminValues[TG_AVATAR_CONFIG.adminColumns.fileId - 1]);
    const fileUniqueId = tgAvatarClean_(adminValues[TG_AVATAR_CONFIG.adminColumns.fileUniqueId - 1]);
    const checkedAt = adminValues[TG_AVATAR_CONFIG.adminColumns.checkedAt - 1] || '';
    const status = tgAvatarClean_(adminValues[TG_AVATAR_CONFIG.adminColumns.status - 1]);
    const name =
      tgAvatarClean_(adminValues[TG_AVATAR_CONFIG.adminColumns.name - 1]) ||
      person.name || person.tgName || person.username || '';
    const tgName =
      tgAvatarClean_(adminValues[TG_AVATAR_CONFIG.adminColumns.tgName - 1]) ||
      person.tgName || '';
    const username =
      tgAvatarClean_(adminValues[TG_AVATAR_CONFIG.adminColumns.username - 1]) ||
      person.username || '';
    const sourceRow =
      adminValues[TG_AVATAR_CONFIG.adminColumns.sourceRow - 1] ||
      person.sourceRow || '';
    const errorMessage =
      tgAvatarClean_(adminValues[TG_AVATAR_CONFIG.adminColumns.error - 1]);

    const publicAvatarRow = tgAvatarEnsureRegistryRow_(
      publicAvatarSheet,
      publicAvatarIndex,
      id,
      TG_AVATAR_CONFIG.adminColumns.tgId
    );

    const publicImageCell = publicAvatarSheet.getRange(
      publicAvatarRow,
      TG_AVATAR_CONFIG.adminColumns.image
    );

    const oldPublicUniqueId = tgAvatarClean_(
      publicAvatarSheet
        .getRange(publicAvatarRow, TG_AVATAR_CONFIG.adminColumns.fileUniqueId)
        .getDisplayValue()
    );
    const hadPublicImage = tgAvatarCellHasImage_(publicImageCell);

    publicAvatarSheet
      .getRange(publicAvatarRow, TG_AVATAR_CONFIG.adminColumns.tgId)
      .setNumberFormat('@')
      .setValue(id);

    publicAvatarSheet
      .getRange(publicAvatarRow, TG_AVATAR_CONFIG.adminColumns.fileId, 1, 9)
      .setValues([[
        fileId,
        fileUniqueId,
        checkedAt,
        status,
        name,
        tgName,
        username,
        sourceRow,
        errorMessage
      ]]);

    publicAvatarSheet
      .getRange(publicAvatarRow, TG_AVATAR_CONFIG.adminColumns.checkedAt)
      .setNumberFormat('dd.MM.yyyy HH:mm:ss');

    let imageMethod = '';

    try {
      if (status === 'OK' && fileId) {
        if (
          hadPublicImage &&
          oldPublicUniqueId &&
          fileUniqueId &&
          oldPublicUniqueId === fileUniqueId
        ) {
          report.unchanged++;
          report.methods.UNCHANGED++;
          imageMethod = 'UNCHANGED';
        } else {
          publicImageCell.clearContent();
          tgAvatarWritePublicPhotoFromFileId_(
            publicImageCell,
            fileId,
            id,
            name || tgName || username || id
          );
          report.synced++;
          report.methods.TELEGRAM_DIRECT++;
          imageMethod = 'TELEGRAM_DIRECT';
        }
      } else if (status === 'NO_PHOTO') {
        publicImageCell.clearContent();
        tgAvatarEnsurePlaceholderImage_(
          publicImageCell,
          name || tgName || username || id
        );
        report.no_photo++;
        report.placeholders++;
        report.methods.PLACEHOLDER_DIRECT++;
        imageMethod = 'PLACEHOLDER_DIRECT';
      } else if (status === 'ERROR') {
        if (hadPublicImage) {
          report.preserved_on_error++;
          report.methods.PRESERVED++;
          imageMethod = 'PRESERVED';
        } else {
          tgAvatarEnsurePlaceholderImage_(
            publicImageCell,
            name || tgName || username || id
          );
          report.placeholders++;
          report.methods.PLACEHOLDER_DIRECT++;
          imageMethod = 'PLACEHOLDER_DIRECT';
        }
      } else if (!hadPublicImage) {
        tgAvatarEnsurePlaceholderImage_(
          publicImageCell,
          name || tgName || username || id
        );
        report.placeholders++;
        report.methods.PLACEHOLDER_DIRECT++;
        imageMethod = 'PLACEHOLDER_DIRECT';
      }
    } catch (imageErr) {
      if (!tgAvatarCellHasImage_(publicImageCell)) {
        try {
          tgAvatarEnsurePlaceholderImage_(
            publicImageCell,
            name || tgName || username || id
          );
          report.placeholders++;
          report.methods.PLACEHOLDER_DIRECT++;
        } catch (placeholderErr) {}
      }

      report.missing.push(
        id + ': ' + tgAvatarSafeError_(imageErr)
      );
    }

    const publicListsRow = tgAvatarEnsureRegistryRow_(
      publicLists,
      publicListsIndex,
      id,
      TG_AVATAR_CONFIG.publicRegistryColumns.tgId
    );

    publicLists
      .getRange(publicListsRow, TG_AVATAR_CONFIG.publicRegistryColumns.tgId)
      .setNumberFormat('@')
      .setValue(id);

    publicLists
      .getRange(publicListsRow, TG_AVATAR_CONFIG.publicRegistryColumns.image)
      .clearContent();

    publicLists
      .getRange(
        publicListsRow,
        TG_AVATAR_CONFIG.publicRegistryColumns.fileId,
        1,
        5
      )
      .setValues([[
        fileId,
        fileUniqueId,
        checkedAt,
        status,
        name
      ]]);

    publicLists
      .getRange(publicListsRow, TG_AVATAR_CONFIG.publicRegistryColumns.checkedAt)
      .setNumberFormat('dd.MM.yyyy HH:mm:ss');

    report.metadata_synced++;
  });

  SpreadsheetApp.flush();

  const stats = tgAvatarReadRegistryStats_(
    publicAvatarSheet,
    TG_AVATAR_CONFIG.adminColumns.tgId,
    TG_AVATAR_CONFIG.adminColumns.image,
    TG_AVATAR_CONFIG.adminColumns.status
  );

  report.public_avatar_cache = {
    status: 'PUBLIC_AVATAR_CACHE_READY',
    sheet_name: publicAvatarSheet.getName(),
    rows: stats.records,
    with_image: stats.with_image,
    hidden: publicAvatarSheet.isSheetHidden(),
    direct_write: true
  };

  if (report.missing.length) report.status = 'PARTIAL';
  return report;
}

/**
 * Одноразовое восстановление публичных аватаров из уже заполненного
 * админского реестра. Telegram повторно не опрашивается.
 *
 * Запустите эту функцию после обновления до V3.5.
 */
/**
 * Создаёт в публичной таблице постоянный скрытый лист «Аватары» —
 * полную копию рабочего админского реестра вместе с CellImage.
 *
 * Старый лист удаляется только после успешного создания нового.
 * Благодаря этому видимые формулы всегда берут изображения из
 * реального листа того же Spreadsheet-файла, как в админской таблице.
 */
function tgAvatarRefreshPublicAvatarCache_(adminAvatarSheet, publicSs) {
  const sheet = tgAvatarEnsurePublicAvatarSheet_(publicSs);
  const stats = tgAvatarReadRegistryStats_(
    sheet,
    TG_AVATAR_CONFIG.adminColumns.tgId,
    TG_AVATAR_CONFIG.adminColumns.image,
    TG_AVATAR_CONFIG.adminColumns.status
  );

  return {
    status: 'PUBLIC_AVATAR_CACHE_READY',
    sheet_name: sheet.getName(),
    rows: stats.records,
    with_image: stats.with_image,
    ok: stats.statuses.OK || 0,
    no_photo: stats.statuses.NO_PHOTO || 0,
    error: stats.statuses.ERROR || 0,
    error_with_image: 0,
    hidden: sheet.isSheetHidden(),
    direct_write: true
  };
}


function tgAvatarEnsurePublicAvatarSheet_(publicSs) {
  let sheet = publicSs.getSheetByName(TG_AVATAR_CONFIG.publicAvatarSheet);

  if (!sheet) {
    sheet = publicSs.insertSheet(TG_AVATAR_CONFIG.publicAvatarSheet);
  }

  tgAvatarEnsureGrid_(
    sheet,
    TG_AVATAR_CONFIG.maxAvatarRow,
    TG_AVATAR_CONFIG.adminColumns.error
  );

  const headers = [[
    'id тг',
    'Аватар',
    'file_id',
    'file_unique_id',
    'Проверено',
    'Статус',
    'Имя',
    'Имя тг',
    'Ссылка тг',
    'Строка базы',
    'Последняя ошибка'
  ]];

  sheet.getRange(1, 1, 1, headers[0].length).setValues(headers);
  sheet.getRange(1, 1, 1, headers[0].length)
    .setFontWeight('bold')
    .setBackground('#dce6f2');

  sheet.setFrozenRows(1);
  sheet.setColumnWidth(TG_AVATAR_CONFIG.adminColumns.image, 80);
  sheet.setRowHeights(2, TG_AVATAR_CONFIG.maxAvatarRow - 1, 58);
  sheet.getRange(
    2,
    TG_AVATAR_CONFIG.adminColumns.tgId,
    TG_AVATAR_CONFIG.maxAvatarRow - 1,
    1
  ).setNumberFormat('@');

  if (!sheet.isSheetHidden()) {
    sheet.hideSheet();
  }

  return sheet;
}

function tgAvatarProcessPublicRepairBatchNoLock_() {
  const queue = tgAvatarReadQueueByProperty_(
    TG_AVATAR_CONFIG.publicRepairQueueProperty
  );

  if (!queue.length) {
    return {
      status: 'PUBLIC_REPAIR_NOTHING_TO_PROCESS',
      processed: 0,
      remaining: 0
    };
  }

  const batch = queue.slice(0, TG_AVATAR_CONFIG.batchSize);
  const remaining = queue.slice(batch.length);

  tgAvatarWriteQueueByProperty_(
    TG_AVATAR_CONFIG.publicRepairQueueProperty,
    remaining
  );

  const adminSs = SpreadsheetApp.openById(
    TG_AVATAR_CONFIG.adminSpreadsheetId
  );
  const publicSs = SpreadsheetApp.openById(
    TG_AVATAR_CONFIG.publicSpreadsheetId
  );
  const adminAvatarSheet = tgAvatarEnsureAdminSheet_(adminSs);
  const base = tgAvatarRequireSheet_(
    adminSs,
    TG_AVATAR_CONFIG.adminBaseSheet,
    'админская таблица'
  );
  const people = tgAvatarReadBasePeople_(base);

  const report = tgAvatarSyncBatchToPublic_(
    adminSs,
    publicSs,
    adminAvatarSheet,
    batch,
    people.byId
  );

  return {
    status: remaining.length
      ? 'PUBLIC_REPAIR_BATCH_DONE'
      : 'PUBLIC_REPAIR_FINISHED',
    processed: batch.length,
    remaining: remaining.length,
    public_sync: report
  };
}

function repairAllPublicTelegramAvatars() {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000);

    const adminSs = SpreadsheetApp.openById(
      TG_AVATAR_CONFIG.adminSpreadsheetId
    );
    const publicSs = SpreadsheetApp.openById(
      TG_AVATAR_CONFIG.publicSpreadsheetId
    );
    const adminAvatarSheet = tgAvatarEnsureAdminSheet_(adminSs);

    tgAvatarEnsurePublicRegistry_(publicSs);
    tgAvatarEnsurePublicAvatarSheet_(publicSs);
    tgAvatarSetupPublicBase_(publicSs);
    tgAvatarSetupPublicSearch_(publicSs);
    tgAvatarSetupPublicCard_(publicSs);

    const ids = Object.keys(tgAvatarReadKnownIds_(
      adminAvatarSheet,
      TG_AVATAR_CONFIG.adminColumns.tgId
    ));

    tgAvatarWriteQueueByProperty_(
      TG_AVATAR_CONFIG.publicRepairQueueProperty,
      ids
    );

    const firstBatch = tgAvatarProcessPublicRepairBatchNoLock_();

    const result = {
      status: 'PUBLIC_DIRECT_REPAIR_STARTED',
      queued: ids.length,
      first_batch: firstBatch,
      next_step:
        firstBatch.remaining > 0
          ? 'Остальные аватары обработает существующий 5-минутный триггер'
          : 'Публичные аватары восстановлены'
    };

    Logger.log(JSON.stringify(result, null, 2));
    return result;

  } finally {
    try {
      lock.releaseLock();
    } catch (err) {}
  }
}

function tgAvatarWritePublicPhotoFromFileId_(
  targetCell,
  fileId,
  tgId,
  description
) {
  const file = tgAvatarApi_('getFile', {
    file_id: String(fileId || '')
  });

  const filePath =
    file && file.result
      ? tgAvatarClean_(file.result.file_path)
      : '';

  if (!filePath) {
    throw new Error('TG_AVATAR_PUBLIC_FILE_PATH_EMPTY');
  }

  const telegramFileUrl =
    'https://api.telegram.org/file/bot' +
    tgAvatarGetToken_() +
    '/' +
    filePath;

  tgAvatarSetImageFromUrlWithRetry_(
    targetCell,
    telegramFileUrl,
    'Telegram avatar ' + String(tgId || ''),
    String(description || tgId || '')
  );
}

function tgAvatarWriteMetadata_(
  tgId,
  person,
  checkedAt,
  status,
  fileId,
  fileUniqueId,
  errorMessage,
  adminSheet,
  adminRow
) {
  adminSheet
    .getRange(adminRow, TG_AVATAR_CONFIG.adminColumns.tgId)
    .setNumberFormat('@')
    .setValue(tgId);

  adminSheet
    .getRange(adminRow, TG_AVATAR_CONFIG.adminColumns.fileId, 1, 9)
    .setValues([[
      String(fileId || ''),
      String(fileUniqueId || ''),
      checkedAt,
      status,
      person.name || '',
      person.tgName || '',
      person.username || '',
      person.sourceRow || '',
      errorMessage || ''
    ]]);

  adminSheet
    .getRange(adminRow, TG_AVATAR_CONFIG.adminColumns.checkedAt)
    .setNumberFormat('dd.MM.yyyy HH:mm:ss');
}

function tgAvatarWriteNoPhoto_(
  tgId,
  person,
  checkedAt,
  adminSheet,
  adminRow
) {
  const imageCell = adminSheet.getRange(
    adminRow,
    TG_AVATAR_CONFIG.adminColumns.image
  );

  tgAvatarEnsurePlaceholderImage_(
    imageCell,
    person.name || person.tgName || person.username || tgId
  );

  tgAvatarWriteMetadata_(
    tgId,
    person,
    checkedAt,
    'NO_PHOTO',
    '',
    '',
    '',
    adminSheet,
    adminRow
  );
}

function tgAvatarWriteError_(
  tgId,
  person,
  checkedAt,
  errorMessage,
  adminSheet,
  adminIndex
) {
  const adminRow = tgAvatarEnsureRegistryRow_(
    adminSheet,
    adminIndex,
    tgId,
    TG_AVATAR_CONFIG.adminColumns.tgId
  );

  const oldFileId = tgAvatarClean_(
    adminSheet
      .getRange(adminRow, TG_AVATAR_CONFIG.adminColumns.fileId)
      .getDisplayValue()
  );

  const oldUniqueId = tgAvatarClean_(
    adminSheet
      .getRange(adminRow, TG_AVATAR_CONFIG.adminColumns.fileUniqueId)
      .getDisplayValue()
  );

  const imageCell = adminSheet.getRange(
    adminRow,
    TG_AVATAR_CONFIG.adminColumns.image
  );

  if (!tgAvatarCellHasImage_(imageCell)) {
    try {
      tgAvatarEnsurePlaceholderImage_(
        imageCell,
        person.name || person.tgName || person.username || tgId
      );
    } catch (placeholderError) {}
  }

  tgAvatarWriteMetadata_(
    tgId,
    person,
    checkedAt,
    'ERROR',
    oldFileId,
    oldUniqueId,
    errorMessage,
    adminSheet,
    adminRow
  );
}

/* -------------------------------------------------------------------------- */
/* СОЗДАНИЕ ЛИСТОВ И ИНТЕРФЕЙСА                                              */
/* -------------------------------------------------------------------------- */

function tgAvatarDeleteLegacyTestSheet_(adminSs) {
  const sheet = adminSs.getSheetByName(
    TG_AVATAR_CONFIG.legacyTestSheet
  );

  if (!sheet) return false;

  adminSs.deleteSheet(sheet);
  SpreadsheetApp.flush();
  return true;
}

function tgAvatarEnsureAdminSheet_(adminSs) {
  let sheet = adminSs.getSheetByName(TG_AVATAR_CONFIG.adminAvatarSheet);

  if (!sheet) {
    sheet = adminSs.insertSheet(TG_AVATAR_CONFIG.adminAvatarSheet);
  }

  tgAvatarEnsureGrid_(
    sheet,
    TG_AVATAR_CONFIG.maxAvatarRow,
    TG_AVATAR_CONFIG.adminColumns.error
  );

  const headers = [[
    'id тг',
    'Аватар',
    'file_id',
    'file_unique_id',
    'Проверено',
    'Статус',
    'Имя',
    'Имя тг',
    'Ссылка тг',
    'Строка базы',
    'Последняя ошибка'
  ]];

  sheet.getRange(1, 1, 1, headers[0].length).setValues(headers);
  sheet.getRange(1, 1, 1, headers[0].length)
    .setFontWeight('bold')
    .setBackground('#dce6f2');

  sheet.setFrozenRows(1);
  sheet.setColumnWidth(TG_AVATAR_CONFIG.adminColumns.image, 80);
  sheet.setRowHeights(2, TG_AVATAR_CONFIG.maxAvatarRow - 1, 58);

  sheet.getRange(
    2,
    TG_AVATAR_CONFIG.adminColumns.tgId,
    TG_AVATAR_CONFIG.maxAvatarRow - 1,
    1
  ).setNumberFormat('@');

  if (!sheet.isSheetHidden()) {
    sheet.hideSheet();
  }

  return sheet;
}

function tgAvatarEnsurePublicRegistry_(publicSs) {
  const sheet = tgAvatarRequireSheet_(
    publicSs,
    TG_AVATAR_CONFIG.publicListsSheet,
    'публичная таблица'
  );

  tgAvatarEnsureGrid_(
    sheet,
    TG_AVATAR_CONFIG.maxAvatarRow,
    TG_AVATAR_CONFIG.publicRegistryColumns.name
  );

  sheet
    .getRange(
      1,
      TG_AVATAR_CONFIG.publicRegistryColumns.tgId,
      1,
      7
    )
    .setValues([[
      'Аватар id тг',
      'Аватар участника',
      'Аватар file_id',
      'Аватар file_unique_id',
      'Аватар проверен',
      'Аватар статус',
      'Аватар имя'
    ]])
    .setFontWeight('bold')
    .setBackground('#dce6f2');

  sheet.getRange(
    2,
    TG_AVATAR_CONFIG.publicRegistryColumns.tgId,
    TG_AVATAR_CONFIG.maxAvatarRow - 1,
    1
  ).setNumberFormat('@');

  return sheet;
}


function tgAvatarSetupAdminSearch_(adminSs) {
  const sheet = tgAvatarRequireSheet_(
    adminSs,
    TG_AVATAR_CONFIG.adminSearchSheet,
    'админская таблица'
  );

  if (tgAvatarClean_(sheet.getRange('A5').getDisplayValue()) !== 'Аватар') {
    sheet.insertColumnBefore(1);
  }

  const headers = sheet
    .getRange(5, 1, 1, sheet.getMaxColumns())
    .getDisplayValues()[0]
    .map(tgAvatarClean_);

  const idColumn = headers.indexOf('id тг') + 1;
  if (!idColumn) {
    throw new Error('TG_AVATAR_ADMIN_SEARCH_ID_COLUMN_NOT_FOUND');
  }

  const idLetter = tgAvatarColumnLetter_(idColumn);
  const formulas = [];

  for (let row = 6; row <= TG_AVATAR_CONFIG.maxBaseRow; row++) {
    formulas.push([(
      '=IF($' + idLetter + row + '="";"";' +
      'IFNA(' +
        'INDEX(\'Аватары\'!$B$2:$B$999;' +
          'MATCH($' + idLetter + row + ';\'Аватары\'!$A$2:$A$999;0)' +
        ');' +
        '""' +
      '))'
    )]);
  }

  sheet.getRange('A5').setValue('Аватар');
  sheet
    .getRange(6, 1, formulas.length, 1)
    .setFormulas(formulas)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  sheet.setColumnWidth(1, 62);
  sheet.setRowHeights(6, formulas.length, 58);

  try {
    sheet.hideColumns(idColumn, 1);
  } catch (err) {}
}

function tgAvatarSetupAdminCard_(adminSs) {
  const card = tgAvatarRequireSheet_(
    adminSs,
    TG_AVATAR_CONFIG.adminCardSheet,
    'админская таблица'
  );

  tgAvatarRequireSheet_(
    adminSs,
    TG_AVATAR_CONFIG.adminRelationsSheet,
    'админская таблица'
  );

  tgAvatarEnsureGrid_(card, 80, 9);

  // V3.8: модуль аватаров владеет только A и скрытым I.
  // B:H принадлежат ядру и никогда здесь не очищаются/не перезаписываются.
  card.getRange('A15:A80').clearContent();
  card.getRange('I15:I80').clearContent();
  card.getRange('A14').setValue('Аватар');
  card.getRange('I14').setValue('id тг');

  const idsFormula =
    '=IF($B$2="";"";' +
    'IFNA(' +
      'FILTER(' +
        '\'Связи участников\'!D2:D;' +
        '\'Связи участников\'!E2:E=' +
          'REGEXREPLACE($B$2;"\\s+—\\s+(РМ|РК)$";"");' +
        '\'Связи участников\'!L2:L=' +
          'IF(REGEXMATCH($B$2;"\\s+—\\s+РМ$");' +
            '"Royal Match";' +
            '"Royal Kingdom"' +
          ')' +
      ');' +
      '""' +
    '))';

  card.getRange('I15').setFormula(idsFormula);
  card.getRange('I15:I80').setNumberFormat('@');

  const avatarFormulas = [];
  for (let row = 15; row <= 80; row++) {
    avatarFormulas.push([(
      '=IF($I' + row + '="";"";' +
      'IFNA(' +
        'INDEX(\'Аватары\'!$B$2:$B$999;' +
          'MATCH(TO_TEXT($I' + row + ');ARRAYFORMULA(TO_TEXT(\'Аватары\'!$A$2:$A$999));0)' +
        ');' +
        '""' +
      '))'
    )]);
  }

  card.getRange(15, 1, avatarFormulas.length, 1)
    .setFormulas(avatarFormulas)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  card.setColumnWidth(1, 62);
  card.setRowHeights(15, avatarFormulas.length, 58);
  try { card.hideColumns(9, 1); } catch (err) {}
}

function tgAvatarColumnLetter_(column) {
  let value = Number(column) || 0;
  let result = '';

  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }

  return result;
}

function tgAvatarSetupPublicBase_(publicSs) {
  const base = tgAvatarRequireSheet_(
    publicSs,
    TG_AVATAR_CONFIG.publicBaseSheet,
    'публичная таблица'
  );

  tgAvatarEnsureGrid_(base, TG_AVATAR_CONFIG.maxBaseRow, 5);
  base.getRange('E1').setValue('id тг');

  try {
    base.hideColumns(5, 1);
  } catch (err) {}
}

function tgAvatarSetupPublicSearch_(publicSs) {
  const sheet = tgAvatarRequireSheet_(
    publicSs,
    TG_AVATAR_CONFIG.publicSearchSheet,
    'публичная таблица'
  );

  if (sheet.getMaxColumns() < 4) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), 4 - sheet.getMaxColumns());
  }

  // V3.8: аватары владеют только столбцом A. B:C формирует 08, D —
  // динамический источник ID. Никаких clearContent/setFormula для B:D.
  sheet.getRange('A6:A999').clearContent();
  sheet.getRange('A5').setValue('Аватар');

  const avatarFormulas = [];
  for (let i = 0; i < TG_AVATAR_CONFIG.searchResultLimit; i++) {
    const row = 6 + i;
    avatarFormulas.push([(
      '=IF($D' + row + '="";"";' +
      'IFNA(' +
        'INDEX(\'Аватары\'!$B$2:$B$999;' +
          'MATCH(TO_TEXT($D' + row + ');ARRAYFORMULA(TO_TEXT(\'Аватары\'!$A$2:$A$999));0)' +
        ');' +
        tgAvatarPlaceholderFormula_() +
      '))'
    )]);
  }

  sheet.getRange(6, 1, avatarFormulas.length, 1)
    .setFormulas(avatarFormulas)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  sheet.setColumnWidth(1, 62);
  sheet.setRowHeights(6, avatarFormulas.length, 58);
  sheet.getRange(6, 4, TG_AVATAR_CONFIG.searchResultLimit, 1).setNumberFormat('@');
  try { sheet.hideColumns(4, 1); } catch (err) {}
}

function tgAvatarSetupPublicCard_(publicSs) {
  const card = tgAvatarRequireSheet_(
    publicSs,
    TG_AVATAR_CONFIG.publicCardSheet,
    'публичная таблица'
  );

  const helper = tgAvatarRequireSheet_(
    publicSs,
    TG_AVATAR_CONFIG.publicSearchDataSheet,
    'публичная таблица'
  );

  tgAvatarEnsureGrid_(card, 80, 4);
  tgAvatarEnsureGrid_(helper, 80, 8);

  // V3.8: только A и скрытый helper H. B:D принадлежат 08 и не трогаются.
  card.getRange('A15:A80').clearContent();
  helper.getRange('H1:H80').clearContent();
  card.getRange('A14').setValue('Аватар');

  const helperIdFormula =
    '=IF(\'Карточка команды\'!$B$2="";"";' +
    'IFNA(' +
      'FILTER(' +
        '\'Связи участников\'!$D$2:$D$999;' +
        '\'Связи участников\'!$E$2:$E$999=' +
          'REGEXREPLACE(\'Карточка команды\'!$B$2;"\\s+—\\s+(РМ|РК)$";"");' +
        '\'Связи участников\'!$L$2:$L$999=' +
          'IF(REGEXMATCH(\'Карточка команды\'!$B$2;"\\s+—\\s+РМ$");' +
            '"Royal Match";' +
            '"Royal Kingdom"' +
          ')' +
      ');' +
      '""' +
    '))';

  helper.getRange('H1').setValue('Карточка id тг');
  helper.getRange('H2').setFormula(helperIdFormula);
  helper.getRange('H2:H80').setNumberFormat('@');

  const avatarFormulas = [];
  for (let i = 0; i < TG_AVATAR_CONFIG.cardResultLimit; i++) {
    const cardRow = 15 + i;
    const helperRow = 2 + i;
    avatarFormulas.push([(
      '=IF(\'Поиск данные\'!$H' + helperRow + '="";"";' +
      'IFNA(' +
        'INDEX(\'Аватары\'!$B$2:$B$999;' +
          'MATCH(TO_TEXT(\'Поиск данные\'!$H' + helperRow + ');' +
            'ARRAYFORMULA(TO_TEXT(\'Аватары\'!$A$2:$A$999));0)' +
        ');' +
        tgAvatarPlaceholderFormula_() +
      '))'
    )]);
  }

  card.getRange(15, 1, avatarFormulas.length, 1)
    .setFormulas(avatarFormulas)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  card.setColumnWidth(1, 62);
  card.setRowHeights(15, avatarFormulas.length, 58);
  try { card.hideColumns(4, 1); } catch (err) {}
}


/* -------------------------------------------------------------------------- */
/* ЧТЕНИЕ БАЗЫ И РЕЕСТРОВ                                                    */
/* -------------------------------------------------------------------------- */

function tgAvatarReadBasePeople_(baseSheet) {
  const lastRow = Math.min(
    Math.max(baseSheet.getLastRow(), 1),
    TG_AVATAR_CONFIG.maxBaseRow
  );

  if (lastRow < 2) {
    return { ids: [], byId: {} };
  }

  const values = baseSheet
    .getRange(2, 1, lastRow - 1, 4)
    .getDisplayValues();

  const ids = [];
  const byId = {};

  values.forEach((row, index) => {
    const id = tgAvatarNormalizeId_(row[3]);
    if (!id) return;

    if (!byId[id]) {
      ids.push(id);
      byId[id] = {
        id: id,
        name: tgAvatarClean_(row[0]),
        tgName: tgAvatarClean_(row[1]),
        username: tgAvatarClean_(row[2]),
        sourceRow: index + 2
      };
    }
  });

  return { ids: ids, byId: byId };
}

function tgAvatarQueueAllBaseIds_(adminSs, reason) {
  const base = tgAvatarRequireSheet_(
    adminSs,
    TG_AVATAR_CONFIG.adminBaseSheet,
    'админская таблица'
  );

  const people = tgAvatarReadBasePeople_(base);
  const current = tgAvatarReadQueue_();
  const seen = {};

  current.forEach(id => {
    seen[id] = true;
  });

  let added = 0;

  people.ids.forEach(id => {
    if (seen[id]) return;

    current.push(id);
    seen[id] = true;
    added++;
  });

  tgAvatarWriteQueue_(current);
  return added;
}


function tgAvatarReadQueueByProperty_(propertyName) {
  const raw = PropertiesService.getScriptProperties()
    .getProperty(String(propertyName || ''));

  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const result = [];
    const seen = {};

    parsed.forEach(value => {
      const id = tgAvatarNormalizeId_(value);
      if (!id || seen[id]) return;
      seen[id] = true;
      result.push(id);
    });

    return result;
  } catch (err) {
    return [];
  }
}

function tgAvatarWriteQueueByProperty_(propertyName, queue) {
  const safe = [];
  const seen = {};

  (Array.isArray(queue) ? queue : []).forEach(value => {
    const id = tgAvatarNormalizeId_(value);
    if (!id || seen[id]) return;
    seen[id] = true;
    safe.push(id);
  });

  PropertiesService.getScriptProperties().setProperty(
    String(propertyName || ''),
    JSON.stringify(safe)
  );
}

function tgAvatarReadQueue_() {
  return tgAvatarReadQueueByProperty_(TG_AVATAR_CONFIG.queueProperty);
}

function tgAvatarWriteQueue_(queue) {
  tgAvatarWriteQueueByProperty_(TG_AVATAR_CONFIG.queueProperty, queue);
}

function tgAvatarBuildRegistryIndex_(sheet, idColumn) {
  const rowCount = Math.max(
    Math.min(sheet.getMaxRows(), TG_AVATAR_CONFIG.maxAvatarRow) - 1,
    1
  );

  const ids = sheet
    .getRange(2, idColumn, rowCount, 1)
    .getDisplayValues();

  const byId = {};
  let firstEmptyRow = null;

  ids.forEach((row, index) => {
    const sheetRow = index + 2;
    const id = tgAvatarNormalizeId_(row[0]);

    if (id) {
      if (!byId[id]) byId[id] = sheetRow;
    } else if (firstEmptyRow === null) {
      firstEmptyRow = sheetRow;
    }
  });

  return {
    byId: byId,
    nextRow: firstEmptyRow || TG_AVATAR_CONFIG.maxAvatarRow + 1
  };
}

function tgAvatarEnsureRegistryRow_(
  sheet,
  index,
  tgId,
  idColumn
) {
  if (index.byId[tgId]) {
    return index.byId[tgId];
  }

  const row = index.nextRow;

  if (row > TG_AVATAR_CONFIG.maxAvatarRow) {
    throw new Error(
      'TG_AVATAR_REGISTRY_FULL: лист «' +
      sheet.getName() +
      '»'
    );
  }

  sheet
    .getRange(row, idColumn)
    .setNumberFormat('@')
    .setValue(tgId);

  index.byId[tgId] = row;

  let next = row + 1;
  while (
    next <= TG_AVATAR_CONFIG.maxAvatarRow &&
    tgAvatarClean_(
      sheet.getRange(next, idColumn).getDisplayValue()
    )
  ) {
    next++;
  }

  index.nextRow = next;
  return row;
}

function tgAvatarReadKnownIds_(sheet, idColumn) {
  const count = Math.max(
    Math.min(sheet.getMaxRows(), TG_AVATAR_CONFIG.maxAvatarRow) - 1,
    1
  );

  const values = sheet
    .getRange(2, idColumn, count, 1)
    .getDisplayValues();

  const result = {};

  values.forEach(row => {
    const id = tgAvatarNormalizeId_(row[0]);
    if (id) result[id] = true;
  });

  return result;
}

function tgAvatarReadRegistryStats_(
  sheet,
  idColumn,
  imageColumn,
  statusColumn
) {
  const count = Math.max(
    Math.min(sheet.getMaxRows(), TG_AVATAR_CONFIG.maxAvatarRow) - 1,
    1
  );

  const ids = sheet
    .getRange(2, idColumn, count, 1)
    .getDisplayValues();

  const images = sheet
    .getRange(2, imageColumn, count, 1)
    .getValues();

  const statuses = sheet
    .getRange(2, statusColumn, count, 1)
    .getDisplayValues();

  const stats = tgAvatarEmptyStats_();

  ids.forEach((row, index) => {
    const id = tgAvatarNormalizeId_(row[0]);
    if (!id) return;

    stats.records++;

    if (tgAvatarIsCellImage_(images[index][0])) {
      stats.with_image++;
    }

    const status = tgAvatarClean_(statuses[index][0]) || 'EMPTY';
    stats.statuses[status] = (stats.statuses[status] || 0) + 1;
  });

  return stats;
}

function tgAvatarEmptyStats_() {
  return {
    records: 0,
    with_image: 0,
    statuses: {}
  };
}

/* -------------------------------------------------------------------------- */
/* ОБЩИЕ ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ                                             */
/* -------------------------------------------------------------------------- */

function tgAvatarRequireSheet_(ss, name, location) {
  const sheet = ss.getSheetByName(name);

  if (!sheet) {
    throw new Error(
      'В ' +
      location +
      ' отсутствует лист «' +
      name +
      '»'
    );
  }

  return sheet;
}

function tgAvatarEnsureGrid_(sheet, rows, columns) {
  if (sheet.getMaxRows() < rows) {
    sheet.insertRowsAfter(
      sheet.getMaxRows(),
      rows - sheet.getMaxRows()
    );
  }

  if (sheet.getMaxColumns() < columns) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      columns - sheet.getMaxColumns()
    );
  }
}

function tgAvatarNormalizeId_(value) {
  const text = tgAvatarClean_(value)
    .replace(/\.0+$/, '')
    .replace(/[^\d-]/g, '');

  if (!text || !/^-?\d+$/.test(text)) return '';
  return text;
}

function tgAvatarClean_(value) {
  return String(value == null ? '' : value)
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tgAvatarIsCellImage_(value) {
  if (!value || typeof value !== 'object') return false;

  try {
    if (value.valueType === SpreadsheetApp.ValueType.IMAGE) {
      return true;
    }
  } catch (err) {}

  try {
    return (
      typeof value.getValueType === 'function' &&
      value.getValueType() === SpreadsheetApp.ValueType.IMAGE
    );
  } catch (err) {
    return false;
  }
}

function tgAvatarSafeError_(error) {
  const message = String(
    error && error.message
      ? error.message
      : error
  );

  // На всякий случай маскируем токен, если сервис вернул URL в ошибке.
  const token = PropertiesService.getScriptProperties()
    .getProperty(TG_AVATAR_CONFIG.tokenProperty);

  return token
    ? message.split(token).join('[TOKEN]')
    : message;
}
