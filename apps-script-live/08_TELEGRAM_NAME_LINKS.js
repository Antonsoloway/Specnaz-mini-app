/**
 * ROYAL CRM — единая система Telegram-ссылок и восстановление динамических
 * страниц публичной таблицы.
 * Файл: 08_TELEGRAM_NAME_LINKS.gs
 * Версия: 2.1.0 FINAL — настоящие RichText-ссылки без гонки SpreadsheetApp/REST
 *
 * Архитектурные правила:
 * 1) 02_PUBLIC_SYNC_V4.gs синхронизирует данные, скрытые источники, историю,
 *    команды и фотографии. Он не формирует результаты Поиска/Карточки.
 * 2) 04_TELEGRAM_AVATARS.gs отвечает за реестр аватаров и формулы аватаров.
 * 3) Этот файл — единственный владелец текста и ссылок на динамических
 *    страницах Поиск и Карточка команды. Он:
 *    - строит видимые строки строго из D-ID Поиска и листа Связи участников;
 *    - записывает настоящие клеточные ссылки, надёжные в Android-приложении;
 *    - мгновенно обновляет страницы после Поиск!C3 и Карточка команды!B2;
 *    - повторно страхует обе страницы раз в 5 минут и после каждой синхронизации;
 *    - выполняет полную ночную проверку ссылок базы и истории.
 *
 * ВАЖНО: внешние URL webhook, doPost/doGet и web deployment не меняются.
 */

const TGNL_VERSION = '2.1.0';
const TGNL_ADMIN_SPREADSHEET_ID = '1kkADcKysWdoGy95O36z9jCaoGUUHN0g4XH4LwVtAK_o';
const TGNL_PUBLIC_SPREADSHEET_ID = '1FKEvF4pDW9dt6MOk4xjtF1fut60hZ5HxpoGN3l93s7M';

const TGNL_DAILY_HANDLER = 'processTelegramNameLinks';
const TGNL_PUBLIC_EDIT_HANDLER = 'handlePublicTelegramLinkEdit';
const TGNL_DYNAMIC_HANDLER = 'processPublicDynamicViews';
const TGNL_LINK_GREEN = '#34A853';
const TGNL_BATCH_REQUEST_LIMIT = 400;
const TGNL_CACHE_RUNNING_KEY = 'ROYAL_CRM_TG_LINKS_RUNNING_V2';
const TGNL_CACHE_RUNNING_TTL_SECONDS = 330;
const TGNL_PROP_LAST_SUCCESS = 'ROYAL_CRM_TG_LINKS_LAST_SUCCESS_V2';
const TGNL_PROP_LAST_ERROR = 'ROYAL_CRM_TG_LINKS_LAST_ERROR_V2';
const TGNL_PROP_LAST_RESULT = 'ROYAL_CRM_TG_LINKS_LAST_RESULT_V2';
const TGNL_SEARCH_FIRST_ROW = 6;
const TGNL_SEARCH_LAST_ROW = 255;
const TGNL_CARD_FIRST_ROW = 15;
const TGNL_CARD_LAST_ROW = 80;
const TGNL_RELATIONS_LAST_ROW = 1999;

const TGNL_FORMAT_FIELDS = [
  'userEnteredFormat.textFormat.foregroundColorStyle',
  'userEnteredFormat.textFormat.underline',
  'userEnteredFormat.textFormat.link',
  'userEnteredFormat.hyperlinkDisplayType'
].join(',');

/* ========================================================================== */
/*                         ГЛАВНАЯ УСТАНОВКА                                  */
/* ========================================================================== */

/**
 * Единственная функция, которую нужно запустить после замены файлов 02 и 08.
 *
 * Порядок намеренно фиксирован:
 * 1. проверка структуры и совместимости;
 * 2. установка безопасного onChange из файла 02;
 * 3. установка ночного, публичного onEdit и лёгкого 5-минутного триггеров;
 * 4. полная синхронизация скрытых источников и видимых данных;
 * 5. восстановление страниц без потери выбранной команды/поискового запроса;
 * 6. установка ссылок;
 * 7. функциональные тесты Поиска и DREAM TEAM с возвратом исходных значений.
 */
function installRoyalCrmPublicRecovery() {
  const preflight = TGNL_preflight_();
  if (!preflight.ok) {
    const error = new Error('RECOVERY_PREFLIGHT_FAILED: ' + preflight.issues.join(' | '));
    TGNL_saveError_(error);
    throw error;
  }

  const triggerReport = TGNL_installTriggers_();

  let syncInstall = {status: 'SKIPPED'};
  if (typeof installPublicSyncV60Stable === 'function') {
    syncInstall = installPublicSyncV60Stable();
  } else {
    throw new Error('Не найдена installPublicSyncV60Stable: сначала замените 02_PUBLIC_SYNC_V4.gs');
  }

  if (typeof runPublicSyncNow !== 'function') {
    throw new Error('Не найдена runPublicSyncNow из 02_PUBLIC_SYNC_V4.gs');
  }

  const syncResult = runPublicSyncNow();
  if (!syncResult || ['SYNCED', 'UNCHANGED'].indexOf(String(syncResult.status || '')) === -1) {
    throw new Error('Полная синхронизация не завершилась успешно: ' + JSON.stringify(syncResult));
  }

  const formulaRepair = TGNL_restorePublicDynamicViews_();
  SpreadsheetApp.flush();
  Utilities.sleep(800);

  const links = refreshAllTelegramNameLinks();
  const verification = TGNL_verifyRecovery_();

  const result = {
    status: verification.ok ? 'RECOVERY_OK' : 'RECOVERY_FAILED',
    version: TGNL_VERSION,
    preflight: preflight,
    public_sync_install: syncInstall,
    public_sync: syncResult,
    formulas: formulaRepair,
    links: links,
    triggers: triggerReport,
    verification: verification
  };

  console.log(JSON.stringify(result, null, 2));

  if (!verification.ok) {
    const error = new Error('RECOVERY_VERIFY_FAILED: ' + verification.issues.join(' | '));
    TGNL_saveError_(error);
    throw error;
  }

  return result;
}

/** Проверка без изменения таблиц. */
/** Совместимость со старым названием установщика. */
function installTelegramNameLinks() {
  return installRoyalCrmPublicRecovery();
}

/** Совместимость с 10_DIAGNOSTICS.gs. */
function checkTelegramNameLinks() {
  const props = PropertiesService.getScriptProperties();
  const result = {
    version: TGNL_VERSION,
    triggers: TGNL_checkTriggers_(),
    lastSuccess: props.getProperty(TGNL_PROP_LAST_SUCCESS) || '',
    lastError: props.getProperty(TGNL_PROP_LAST_ERROR) || '',
    lastResult: props.getProperty(TGNL_PROP_LAST_RESULT) || '',
    recovery: TGNL_verifyRecovery_(false)
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function reinstallTelegramNameLinksTrigger() {
  return TGNL_installTriggers_();
}

function checkRoyalCrmPublicRecovery() {
  const preflight = TGNL_preflight_();
  const verification = TGNL_verifyRecovery_(false);
  const result = {
    status: preflight.ok && verification.ok ? 'RECOVERY_OK' : 'ATTENTION',
    version: TGNL_VERSION,
    preflight: preflight,
    verification: verification,
    triggers: TGNL_checkTriggers_()
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

/**
 * Безопасное восстановление после V2.0.1.
 * Не запускает полную синхронизацию и не меняет webhook/deployment.
 * Восстанавливает владельцев диапазонов, перерисовывает Поиск/Карточку
 * настоящими RichTextValue и выполняет функциональные тесты с возвратом
 * исходного запроса и выбранной команды.
 */
function repairRoyalCrmDynamicLinksV210() {
  const preflight = TGNL_preflight_();
  if (!preflight.ok) {
    const error = new Error('DYNAMIC_LINK_REPAIR_PREFLIGHT_FAILED: ' + preflight.issues.join(' | '));
    TGNL_saveError_(error);
    throw error;
  }

  const admin = SpreadsheetApp.openById(TGNL_ADMIN_SPREADSHEET_ID);
  const pub = SpreadsheetApp.openById(TGNL_PUBLIC_SPREADSHEET_ID);

  // 04 V3.8 управляет только A-аватарами и скрытыми ID, не трогая B:D.
  tgAvatarSetupAdminSearch_(admin);
  tgAvatarSetupAdminCard_(admin);
  tgAvatarSetupPublicBase_(pub);
  tgAvatarSetupPublicSearch_(pub);
  tgAvatarSetupPublicCard_(pub);

  const triggers = TGNL_installTriggers_();
  const views = TGNL_restorePublicDynamicViews_();
  const links = refreshAllTelegramNameLinks();
  SpreadsheetApp.flush();
  Utilities.sleep(900);
  const verification = TGNL_verifyRecovery_(true);

  const result = {
    status: verification.ok ? 'RECOVERY_OK' : 'RECOVERY_FAILED',
    version: TGNL_VERSION,
    preflight: preflight,
    triggers: triggers,
    views: views,
    links: links,
    verification: verification
  };
  console.log(JSON.stringify(result, null, 2));
  if (!verification.ok) {
    const error = new Error('DYNAMIC_LINK_REPAIR_VERIFY_FAILED: ' + verification.issues.join(' | '));
    TGNL_saveError_(error);
    throw error;
  }
  return result;
}

function TGNL_preflight_() {
  const issues = [];

  if (typeof PUBLIC_SYNC_CONFIG === 'undefined') {
    issues.push('Не найден PUBLIC_SYNC_CONFIG');
  }
  if (typeof installPublicSyncV60Stable !== 'function') {
    issues.push('Файл 02 не является PUBLIC SYNC V6.0 STABLE');
  }
  if (typeof runPublicSyncNow !== 'function') {
    issues.push('Не найдена runPublicSyncNow');
  }

  if (typeof TG_AVATAR_MODULE_VERSION === 'undefined' ||
      String(TG_AVATAR_MODULE_VERSION).indexOf('3.8.') !== 0) {
    issues.push('04_TELEGRAM_AVATARS.gs должен быть версии 3.8.x NON-DESTRUCTIVE');
  }

  const admin = SpreadsheetApp.openById(TGNL_ADMIN_SPREADSHEET_ID);
  const pub = SpreadsheetApp.openById(TGNL_PUBLIC_SPREADSHEET_ID);

  ['База участников', 'Связи участников', 'История спецназа'].forEach(function(name) {
    if (!admin.getSheetByName(name)) issues.push('В админской таблице нет листа «' + name + '»');
  });

  ['Команды', 'База участников', 'Поиск', 'Карточка команды',
   'История спецназа', 'Связи участников', 'Списки', 'Аватары'].forEach(function(name) {
    if (!pub.getSheetByName(name)) issues.push('В публичной таблице нет листа «' + name + '»');
  });

  const search = pub.getSheetByName('Поиск');
  if (search) {
    const idFormula = String(search.getRange('D6').getFormula() || '');
    if (!idFormula || idFormula.indexOf('$C$3') === -1 || idFormula.indexOf('База участников') === -1) {
      issues.push('Поиск!D6 не содержит рабочую динамическую формулу из поля C3');
    }
  }

  return {ok: issues.length === 0, issues: issues};
}

/* ========================================================================== */
/*                         ТРИГГЕРЫ И БЫСТРОЕ ОБНОВЛЕНИЕ                      */
/* ========================================================================== */

function TGNL_installTriggers_() {
  const deleteHandlers = [
    TGNL_DAILY_HANDLER,
    TGNL_PUBLIC_EDIT_HANDLER,
    TGNL_DYNAMIC_HANDLER,
    'handlePublicCardEdit'
  ];

  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (deleteHandlers.indexOf(trigger.getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger(TGNL_DAILY_HANDLER)
    .timeBased()
    .atHour(4)
    .nearMinute(10)
    .everyDays(1)
    .create();

  ScriptApp.newTrigger(TGNL_PUBLIC_EDIT_HANDLER)
    .forSpreadsheet(TGNL_PUBLIC_SPREADSHEET_ID)
    .onEdit()
    .create();

  // Лёгкая страховка динамических страниц. Она не обходит всю базу и не
  // конкурирует с webhook: обновляет только Поиск и Карточку команды.
  ScriptApp.newTrigger(TGNL_DYNAMIC_HANDLER)
    .timeBased()
    .everyMinutes(5)
    .create();

  return TGNL_checkTriggers_();
}

function TGNL_checkTriggers_() {
  const handlers = ScriptApp.getProjectTriggers().map(function(trigger) {
    return trigger.getHandlerFunction();
  });

  return {
    daily: handlers.filter(function(name) { return name === TGNL_DAILY_HANDLER; }).length,
    public_edit: handlers.filter(function(name) { return name === TGNL_PUBLIC_EDIT_HANDLER; }).length,
    dynamic_views: handlers.filter(function(name) { return name === TGNL_DYNAMIC_HANDLER; }).length,
    obsolete_public_card_edit: handlers.filter(function(name) { return name === 'handlePublicCardEdit'; }).length
  };
}

/**
 * Мгновенное обновление только динамической страницы, которую изменил человек.
 * Значения и формулы не переписываются.
 */
function handlePublicTelegramLinkEdit(e) {
  if (!e || !e.range) return;

  const source = e.source;
  if (!source || source.getId() !== TGNL_PUBLIC_SPREADSHEET_ID) return;

  const sheet = e.range.getSheet();
  const name = sheet.getName();
  const row1 = e.range.getRow();
  const row2 = e.range.getLastRow();
  const col1 = e.range.getColumn();
  const col2 = e.range.getLastColumn();

  const searchChanged =
    name === 'Поиск' && row1 <= 3 && row2 >= 3 && col1 <= 3 && col2 >= 3;
  const cardChanged =
    name === 'Карточка команды' && row1 <= 2 && row2 >= 2 && col1 <= 2 && col2 >= 2;

  if (!searchChanged && !cardChanged) return;

  const cache = CacheService.getScriptCache();
  const key = 'ROYAL_CRM_TG_DYNAMIC_EDIT_' + (searchChanged ? 'SEARCH' : 'CARD');
  if (cache.get(key)) return;
  cache.put(key, new Date().toISOString(), 20);

  try {
    SpreadsheetApp.flush();
    Utilities.sleep(450);
    const directory = TGNL_buildDirectory_();

    if (searchChanged) {
      TGNL_refreshPublicSearch_(source, directory);
    }
    if (cardChanged) {
      TGNL_refreshPublicCard_(source, directory);
    }
  } catch (error) {
    TGNL_saveError_(error);
    console.error(error && error.stack ? error.stack : error);
  } finally {
    cache.remove(key);
  }
}

/* ========================================================================== */
/*                    ВОССТАНОВЛЕНИЕ ДИНАМИЧЕСКИХ СТРАНИЦ                     */
/* ========================================================================== */

function TGNL_restorePublicDynamicViews_() {
  const ss = SpreadsheetApp.openById(TGNL_PUBLIC_SPREADSHEET_ID);
  const search = TGNL_requireSheet_(ss, 'Поиск');
  const card = TGNL_requireSheet_(ss, 'Карточка команды');
  const savedSearch = search.getRange('C3').getValue();
  const savedTeam = card.getRange('B2').getValue();

  TGNL_preparePublicSearchView_(search);
  TGNL_preparePublicCardView_(card);

  search.getRange('C3').setValue(savedSearch);
  card.getRange('B2').setValue(savedTeam);
  SpreadsheetApp.flush();
  Utilities.sleep(500);

  const directory = TGNL_buildDirectory_();
  const searchReport = TGNL_refreshPublicSearch_(ss, directory);
  const cardReport = TGNL_refreshPublicCard_(ss, directory);

  return {
    search: searchReport,
    card: cardReport,
    search_input_preserved: true,
    card_selection_preserved: true,
    mode: 'STATIC_RICHTEXT_RENDER_FROM_DYNAMIC_SOURCES'
  };
}

function TGNL_preparePublicSearchView_(sheet) {
  TGNL_ensureGrid_(sheet, 1000, 4);
  const idFormula = String(sheet.getRange('D6').getFormula() || '');
  if (!idFormula || idFormula.indexOf('$C$3') === -1 || idFormula.indexOf('База участников') === -1) {
    throw new Error('SEARCH_ID_FORMULA_MISSING: Поиск!D6');
  }

  const rows = TGNL_SEARCH_LAST_ROW - TGNL_SEARCH_FIRST_ROW + 1;
  const avatarFormulas = [];
  for (let row = TGNL_SEARCH_FIRST_ROW; row <= TGNL_SEARCH_LAST_ROW; row++) {
    avatarFormulas.push([
      '=IF($D' + row + '="";"";IFNA(INDEX(\'Аватары\'!$B$2:$B$999;MATCH(TO_TEXT($D' + row + ');ARRAYFORMULA(TO_TEXT(\'Аватары\'!$A$2:$A$999));0));""))'
    ]);
  }

  sheet.getRange(TGNL_SEARCH_FIRST_ROW, 1, rows, 3).clearContent();
  sheet.getRange(TGNL_SEARCH_FIRST_ROW, 1, rows, 1).setFormulas(avatarFormulas);
  sheet.getRange('A5:D5').setValues([['Аватар', 'Имя', 'Команда', 'id тг']]);
  try { sheet.hideColumns(4, 1); } catch (error) {}
}

function TGNL_preparePublicCardView_(sheet) {
  TGNL_ensureGrid_(sheet, 80, 4);
  const rows = TGNL_CARD_LAST_ROW - TGNL_CARD_FIRST_ROW + 1;
  const avatarFormulas = [];

  for (let row = TGNL_CARD_FIRST_ROW; row <= TGNL_CARD_LAST_ROW; row++) {
    const common =
      'n;ROW()-14;' +
      'tm;REGEXREPLACE($B$2;"\\s+—\\s+(РМ|РК)$";"");' +
      'gm;IF(REGEXMATCH($B$2;"\\s+—\\s+РМ$");"Royal Match";"Royal Kingdom");';
    avatarFormulas.push([
      '=IF($B$2="";"";IFERROR(LET(' + common +
        'id;INDEX(FILTER(\'Связи участников\'!$D$2:$D$1999;' +
          '\'Связи участников\'!$E$2:$E$1999=tm;' +
          '\'Связи участников\'!$L$2:$L$1999=gm);n);' +
        'IF(id="";"";INDEX(\'Аватары\'!$B$2:$B$999;MATCH(TO_TEXT(id);ARRAYFORMULA(TO_TEXT(\'Аватары\'!$A$2:$A$999));0)))' +
      ');""))'
    ]);
  }

  sheet.getRange(TGNL_CARD_FIRST_ROW, 1, rows, 4).clearContent();
  sheet.getRange(TGNL_CARD_FIRST_ROW, 1, rows, 1).setFormulas(avatarFormulas);
  sheet.getRange('A14:D14').setValues([['Аватар', 'Участник', 'Роль', 'Статус']]);
  try { sheet.hideColumns(4, 1); } catch (error) {}
}

/** Пятиминутная страховка только двух динамических страниц. */
function processPublicDynamicViews() {
  try {
    const ss = SpreadsheetApp.openById(TGNL_PUBLIC_SPREADSHEET_ID);
    const directory = TGNL_buildDirectory_();
    SpreadsheetApp.flush();
    const search = TGNL_refreshPublicSearch_(ss, directory);
    const card = TGNL_refreshPublicCard_(ss, directory);
    return {ok: true, search: search, card: card};
  } catch (error) {
    TGNL_saveError_(error);
    console.error(error && error.stack ? error.stack : error);
    return {ok: false, error: String(error && error.message ? error.message : error)};
  }
}

/* ========================================================================== */
/*                         ПОЛНОЕ ОБНОВЛЕНИЕ ССЫЛОК                           */
/* ========================================================================== */

function processTelegramNameLinks() {
  try {
    return refreshAllTelegramNameLinks();
  } catch (error) {
    TGNL_saveError_(error);
    console.error(error && error.stack ? error.stack : error);
    return {ok: false, error: String(error && error.message ? error.message : error)};
  }
}

function refreshAllTelegramNameLinks() {
  const cache = CacheService.getScriptCache();
  if (cache.get(TGNL_CACHE_RUNNING_KEY)) {
    return {ok: false, skipped: true, reason: 'Предыдущий запуск ссылок ещё выполняется'};
  }

  cache.put(TGNL_CACHE_RUNNING_KEY, new Date().toISOString(), TGNL_CACHE_RUNNING_TTL_SECONDS);

  try {
    const directory = TGNL_buildDirectory_();
    const admin = TGNL_refreshAdminOnly_(directory);
    const pub = TGNL_refreshPublicOnlyWithDirectory_(directory);
    const result = {
      ok: true,
      version: TGNL_VERSION,
      finishedAt: new Date().toISOString(),
      directoryUsersWithLinks: directory.count,
      admin: admin,
      public: pub
    };

    const props = PropertiesService.getScriptProperties();
    props.setProperty(TGNL_PROP_LAST_SUCCESS, result.finishedAt);
    props.deleteProperty(TGNL_PROP_LAST_ERROR);
    props.setProperty(TGNL_PROP_LAST_RESULT, JSON.stringify(result));
    console.log(JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    TGNL_saveError_(error);
    throw error;
  } finally {
    cache.remove(TGNL_CACHE_RUNNING_KEY);
  }
}

/** Публичный хук, который вызывается файлом 02 после каждой записи данных. */
function TGNL_refreshPublicOnly() {
  const directory = TGNL_buildDirectory_();
  return TGNL_refreshPublicOnlyWithDirectory_(directory);
}

/** Совместимость с предыдущим 02_PUBLIC_SYNC_V4 во время замены файлов. */
function TGNL_refreshPublicSpreadsheet_(directory) {
  return TGNL_refreshPublicOnlyWithDirectory_(directory || TGNL_buildDirectory_());
}

function TGNL_refreshAdminSpreadsheet_(directory) {
  return TGNL_refreshAdminOnly_(directory || TGNL_buildDirectory_());
}

function TGNL_refreshAdminOnly_(directory) {
  const ss = SpreadsheetApp.openById(TGNL_ADMIN_SPREADSHEET_ID);
  const requests = [];
  const stats = [];

  TGNL_addGenericTarget_(ss, directory, requests, stats, {
    sheetName: 'База участников', startRow: 2, endRow: 999,
    nameCol: 1, tgNameCol: 2, usernameCol: 3, idCol: 4
  });
  TGNL_addUsernameColumnTarget_(ss, requests, stats, {
    sheetName: 'База участников', startRow: 2, endRow: 999, usernameCol: 3
  });
  TGNL_addGenericTarget_(ss, directory, requests, stats, {
    sheetName: 'Поиск', startRow: 6, endRow: 1000,
    nameCol: 3, tgNameCol: 2, usernameCol: 4, idCol: 5
  });
  TGNL_addGenericTarget_(ss, directory, requests, stats, {
    sheetName: 'Карточка команды', startRow: 15, endRow: 80,
    nameCol: 2, tgNameCol: 3, idCol: 9
  });
  TGNL_addGenericTarget_(ss, directory, requests, stats, {
    sheetName: 'История спецназа', startRow: 2, endRow: 1007,
    nameCol: 3, idCol: 12
  });

  TGNL_sendRequests_(ss.getId(), requests);
  return TGNL_makeResult_(ss, requests, stats);
}

function TGNL_refreshPublicOnlyWithDirectory_(directory) {
  const ss = SpreadsheetApp.openById(TGNL_PUBLIC_SPREADSHEET_ID);
  const requests = [];
  const stats = [];

  TGNL_addPublicBaseTargets_(ss, directory, requests, stats);
  TGNL_addGenericTarget_(ss, directory, requests, stats, {
    sheetName: 'История спецназа', startRow: 2, endRow: 1008,
    nameCol: 3, idCol: 12
  });
  TGNL_sendRequests_(ss.getId(), requests);

  SpreadsheetApp.flush();
  const search = TGNL_refreshPublicSearch_(ss, directory);
  const card = TGNL_refreshPublicCard_(ss, directory);
  stats.push(search);
  stats.push(card);

  return TGNL_makeResult_(ss, requests, stats);
}

function TGNL_refreshPublicSearch_(ss, directory) {
  const sheet = TGNL_requireSheet_(ss, 'Поиск');
  const base = TGNL_requireSheet_(ss, 'База участников');
  const count = TGNL_SEARCH_LAST_ROW - TGNL_SEARCH_FIRST_ROW + 1;
  const ids = sheet.getRange(TGNL_SEARCH_FIRST_ROW, 4, count, 1).getDisplayValues();
  const baseRows = Math.min(998, Math.max(base.getLastRow() - 1, 0));
  const baseValues = baseRows > 0
    ? base.getRange(2, 1, baseRows, 5).getDisplayValues()
    : [];
  const byId = {};
  baseValues.forEach(function(row) {
    const id = TGNL_normId_(row[4]);
    if (!id || byId[id]) return;
    byId[id] = row;
  });

  const labels = new Array(count).fill('');
  const teams = new Array(count).fill('').map(function(value) { return [value]; });
  const usernames = new Array(count).fill('');
  let rendered = 0;

  ids.forEach(function(item, index) {
    const id = TGNL_normId_(item[0]);
    const row = id ? byId[id] : null;
    if (!row) return;

    labels[index] = TGNL_joinParticipantLabel_(row[0], row[1], row[2]);
    teams[index][0] = row[3] || '';
    rendered++;
    usernames[index] = TGNL_normalizeUsername_(row[2]) || directory.byId[id] || '';
  });

  // Критично: B записывается одним SpreadsheetApp-вызовом как настоящий
  // RichTextValue. Здесь больше нет смеси setValues() + REST batchUpdate,
  // из-за которой отложенный setValues стирал ссылку, оставляя зелёный цвет.
  TGNL_writeRichTextColumn_(
    sheet.getRange(TGNL_SEARCH_FIRST_ROW, 2, count, 1),
    labels,
    usernames
  );
  sheet.getRange(TGNL_SEARCH_FIRST_ROW, 3, count, 1).setValues(teams);
  SpreadsheetApp.flush();

  return {
    sheet: 'Поиск',
    mode: 'STATIC_RICHTEXT_VALUE',
    rendered: rendered,
    expected: TGNL_countLinks_(usernames),
    linked: TGNL_countLinks_(usernames)
  };
}

function TGNL_refreshPublicCard_(ss, directory) {
  const sheet = TGNL_requireSheet_(ss, 'Карточка команды');
  const relations = TGNL_requireSheet_(ss, 'Связи участников');
  const selected = TGNL_parseSelectedTeam_(sheet.getRange('B2').getDisplayValue());
  const count = TGNL_CARD_LAST_ROW - TGNL_CARD_FIRST_ROW + 1;
  const labels = new Array(count).fill('');
  const roleStatus = new Array(count).fill(null).map(function() { return ['', '']; });
  const usernames = new Array(count).fill('');
  let members = [];

  if (selected.team && selected.game) {
    const relationRows = Math.min(TGNL_RELATIONS_LAST_ROW - 1, Math.max(relations.getLastRow() - 1, 0));
    if (relationRows > 0) {
      members = relations.getRange(2, 1, relationRows, 12).getDisplayValues().filter(function(row) {
        return TGNL_normTeam_(row[4]) === TGNL_normTeam_(selected.team) &&
          TGNL_normGame_(row[11]) === TGNL_normGame_(selected.game);
      });
    }
  }

  members.slice(0, count).forEach(function(row, index) {
    labels[index] = TGNL_joinParticipantLabel_(row[0], row[1], row[2]);
    roleStatus[index] = [row[6] || '', row[7] || ''];
    usernames[index] = TGNL_normalizeUsername_(row[2]) ||
      directory.byId[TGNL_normId_(row[3])] || '';
  });

  TGNL_writeRichTextColumn_(
    sheet.getRange(TGNL_CARD_FIRST_ROW, 2, count, 1),
    labels,
    usernames
  );
  sheet.getRange(TGNL_CARD_FIRST_ROW, 3, count, 2).setValues(roleStatus);
  SpreadsheetApp.flush();

  return {
    sheet: 'Карточка команды',
    mode: 'STATIC_RICHTEXT_VALUE',
    selected: selected.display,
    rendered: Math.min(members.length, count),
    expected: TGNL_countLinks_(usernames),
    linked: TGNL_countLinks_(usernames)
  };
}

/**
 * Записывает столбец как реальные RichTextValue через один сервис
 * SpreadsheetApp. Это исключает гонку между буфером SpreadsheetApp и REST API.
 */
function TGNL_writeRichTextColumn_(range, texts, usernames) {
  const values = texts.map(function(text, index) {
    return [TGNL_buildWholeCellRichText_(text, usernames[index])];
  });

  // Сбрасываем только цвет/линию старой ячейки; размеры, границы, выравнивание
  // и остальное оформление листа остаются нетронутыми.
  range.setFontColor(null);
  range.setFontLine('none');
  range.setShowHyperlink(true);
  range.setRichTextValues(values);
}

function TGNL_buildWholeCellRichText_(text, username) {
  const value = String(text === null || text === undefined ? '' : text);
  const normalized = TGNL_normalizeUsername_(username);
  const builder = SpreadsheetApp.newRichTextValue().setText(value);

  if (!value || !normalized) {
    return builder.setLinkUrl(null).build();
  }

  const style = SpreadsheetApp.newTextStyle()
    .setForegroundColor(TGNL_LINK_GREEN)
    .setUnderline(true)
    .build();

  return builder
    .setLinkUrl('https://t.me/' + normalized)
    .setTextStyle(style)
    .build();
}

/* ========================================================================== */
/*                              ЦЕЛЕВЫЕ ДИАПАЗОНЫ                             */
/* ========================================================================== */

function TGNL_addPublicBaseTargets_(ss, directory, requests, stats) {
  const sheet = ss.getSheetByName('База участников');
  if (!sheet) return;

  const endRow = Math.min(999, sheet.getMaxRows());
  const count = endRow - 1;
  if (count <= 0) return;

  const values = sheet.getRange(2, 1, count, 5).getDisplayValues();
  const linksA = new Array(count).fill('');
  const linksB = new Array(count).fill('');
  const linksC = new Array(count).fill('');
  let expected = 0;

  values.forEach(function(row, index) {
    const username = TGNL_normalizeUsername_(row[2]) ||
      directory.byId[TGNL_normId_(row[4])] || '';
    if (!username) return;

    if (TGNL_cleanText_(row[0])) linksA[index] = username;
    else if (TGNL_cleanText_(row[1])) linksB[index] = username;

    if (TGNL_cleanText_(row[2])) linksC[index] = username;
    expected++;
  });

  TGNL_appendTargetRequests_(requests, {
    sheetId: sheet.getSheetId(), startRow: 2, endRow: endRow,
    column: 1, usernames: linksA
  });
  TGNL_appendTargetRequests_(requests, {
    sheetId: sheet.getSheetId(), startRow: 2, endRow: endRow,
    column: 2, usernames: linksB
  });
  TGNL_appendTargetRequests_(requests, {
    sheetId: sheet.getSheetId(), startRow: 2, endRow: endRow,
    column: 3, usernames: linksC
  });

  stats.push({sheet: 'База участников', expected: expected, linked_cells: TGNL_countLinks_(linksA) + TGNL_countLinks_(linksB) + TGNL_countLinks_(linksC)});
}



function TGNL_addGenericTarget_(ss, directory, requests, stats, config) {
  const sheet = ss.getSheetByName(config.sheetName);
  if (!sheet) return;

  const startRow = Math.max(1, config.startRow);
  const endRow = Math.min(config.endRow, sheet.getMaxRows());
  if (endRow < startRow) return;

  const maxCol = Math.max(config.nameCol || 1, config.tgNameCol || 1,
    config.usernameCol || 1, config.idCol || 1);
  const count = endRow - startRow + 1;
  const values = sheet.getRange(startRow, 1, count, maxCol).getDisplayValues();
  const links = new Array(count).fill('');
  let examined = 0;
  let expected = 0;

  values.forEach(function(row, index) {
    const display = TGNL_valueAt_(row, config.nameCol);
    if (!TGNL_cleanText_(display)) return;
    examined++;

    const username = TGNL_resolveUsername_(directory, {
      display: display,
      name: display,
      tgName: TGNL_valueAt_(row, config.tgNameCol),
      username: TGNL_valueAt_(row, config.usernameCol),
      id: TGNL_valueAt_(row, config.idCol)
    });

    if (username) {
      links[index] = username;
      expected++;
    }
  });

  TGNL_appendTargetRequests_(requests, {
    sheetId: sheet.getSheetId(), startRow: startRow, endRow: endRow,
    column: config.nameCol, usernames: links
  });
  stats.push({sheet: config.sheetName, examined: examined, expected: expected, linked: TGNL_countLinks_(links)});
}

function TGNL_addUsernameColumnTarget_(ss, requests, stats, config) {
  const sheet = ss.getSheetByName(config.sheetName);
  if (!sheet) return;
  const startRow = config.startRow;
  const endRow = Math.min(config.endRow, sheet.getMaxRows());
  const count = endRow - startRow + 1;
  const values = sheet.getRange(startRow, config.usernameCol, count, 1).getDisplayValues();
  const links = values.map(function(row) { return TGNL_normalizeUsername_(row[0]); });
  TGNL_appendTargetRequests_(requests, {
    sheetId: sheet.getSheetId(), startRow: startRow, endRow: endRow,
    column: config.usernameCol, usernames: links
  });
  stats.push({sheet: config.sheetName + ' @username', expected: TGNL_countLinks_(links), linked: TGNL_countLinks_(links)});
}

/* ========================================================================== */
/*                        СПРАВОЧНИК И НОРМАЛИЗАЦИЯ                           */
/* ========================================================================== */

function TGNL_buildDirectory_() {
  const ss = SpreadsheetApp.openById(TGNL_ADMIN_SPREADSHEET_ID);
  const base = TGNL_requireSheet_(ss, 'База участников');
  const rows = base.getRange(2, 1, Math.min(998, base.getMaxRows() - 1), 4).getDisplayValues();
  const directory = {byId: {}, byPair: {}, byName: {}, byTgName: {}, count: 0};

  rows.forEach(function(row) {
    const username = TGNL_normalizeUsername_(row[2]);
    if (!username) return;
    directory.count++;
    TGNL_addUnique_(directory.byId, TGNL_normId_(row[3]), username);
    TGNL_addUnique_(directory.byPair, TGNL_pairKey_(row[0], row[1]), username);
    TGNL_addUnique_(directory.byName, TGNL_normText_(row[0]), username);
    TGNL_addUnique_(directory.byTgName, TGNL_normText_(row[1]), username);
  });

  return directory;
}

function TGNL_resolveUsername_(directory, meta) {
  const direct = TGNL_normalizeUsername_(meta.username);
  if (direct) return direct;

  const id = TGNL_normId_(meta.id);
  if (id && directory.byId[id]) return directory.byId[id];

  const embedded = TGNL_extractUsername_(meta.display || meta.name);
  if (embedded) return embedded;

  const pair = directory.byPair[TGNL_pairKey_(meta.name, meta.tgName)];
  if (pair) return pair;

  const byName = directory.byName[TGNL_normText_(meta.name)];
  if (byName) return byName;

  return directory.byTgName[TGNL_normText_(meta.tgName)] || '';
}

function TGNL_parseSelectedTeam_(value) {
  const display = TGNL_cleanText_(value);
  const match = display.match(/^(.*)\s+—\s+(РМ|РК)$/i);
  if (!match) return {display: display, team: '', game: ''};
  return {
    display: display,
    team: TGNL_cleanText_(match[1]),
    game: String(match[2]).toUpperCase() === 'РМ' ? 'Royal Match' : 'Royal Kingdom'
  };
}

function TGNL_normalizeUsername_(value) {
  let text = TGNL_cleanText_(value);
  if (!text) return '';
  let match = text.match(/^tg:\/\/resolve\?domain=([A-Za-z0-9_]{5,32})(?:&.*)?$/i);
  if (match) return match[1];
  match = text.match(/^https?:\/\/(?:www\.)?(?:t\.me|telegram\.me)\/([A-Za-z0-9_]{5,32})(?:[/?#].*)?$/i);
  if (match) return match[1];
  match = text.match(/^(?:t\.me|telegram\.me)\/([A-Za-z0-9_]{5,32})(?:[/?#].*)?$/i);
  if (match) return match[1];
  match = text.match(/^@?([A-Za-z0-9_]{5,32})$/);
  return match ? match[1] : '';
}

function TGNL_extractUsername_(value) {
  const text = TGNL_cleanText_(value);
  if (!text) return '';
  const url = text.match(/https?:\/\/(?:www\.)?(?:t\.me|telegram\.me)\/([A-Za-z0-9_]{5,32})/i);
  if (url) return url[1];
  const mention = text.match(/(?:^|[\s,;([{])@([A-Za-z0-9_]{5,32})(?=$|[\s,;.)\]}])/);
  return mention ? mention[1] : '';
}

function TGNL_cleanText_(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '')
    .trim();
}

function TGNL_normText_(value) {
  return TGNL_cleanText_(value).replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU');
}

function TGNL_normId_(value) {
  const text = TGNL_cleanText_(value).replace(/\.0$/, '');
  return /^\d{5,20}$/.test(text) ? text : '';
}

function TGNL_normTeam_(value) {
  return TGNL_normText_(value).replace(/\s+[—-]\s+(рм|рк)$/i, '').trim();
}

function TGNL_normGame_(value) {
  const text = TGNL_normText_(value);
  if (/royal\s*match|(^|\s)рм($|\s)/i.test(text)) return 'royal match';
  if (/royal\s*kingdom|(^|\s)рк($|\s)/i.test(text)) return 'royal kingdom';
  return text;
}

function TGNL_pairKey_(name, tgName) {
  const left = TGNL_normText_(name);
  const right = TGNL_normText_(tgName);
  return left || right ? left + '\u0001' + right : '';
}

function TGNL_addUnique_(map, key, value) {
  if (!key || !value) return;
  if (!Object.prototype.hasOwnProperty.call(map, key)) {
    map[key] = value;
  } else if (map[key] !== value) {
    map[key] = '';
  }
}

/* ========================================================================== */
/*                        ЗАПРОСЫ GOOGLE SHEETS API                           */
/* ========================================================================== */

function TGNL_appendTargetRequests_(requests, target) {
  const count = target.endRow - target.startRow + 1;
  if (count <= 0) return;

  requests.push({
    repeatCell: {
      range: {
        sheetId: target.sheetId,
        startRowIndex: target.startRow - 1,
        endRowIndex: target.endRow,
        startColumnIndex: target.column - 1,
        endColumnIndex: target.column
      },
      cell: TGNL_plainCellData_(),
      fields: TGNL_FORMAT_FIELDS
    }
  });

  TGNL_makeLinkedRuns_(target.usernames).forEach(function(run) {
    const rows = [];
    for (let i = run.start; i <= run.end; i++) {
      rows.push({values: [TGNL_linkedCellData_(target.usernames[i])]});
    }

    requests.push({
      updateCells: {
        range: {
          sheetId: target.sheetId,
          startRowIndex: target.startRow - 1 + run.start,
          endRowIndex: target.startRow + run.end,
          startColumnIndex: target.column - 1,
          endColumnIndex: target.column
        },
        rows: rows,
        fields: TGNL_FORMAT_FIELDS
      }
    });
  });
}

function TGNL_plainCellData_() {
  return {
    userEnteredFormat: {
      textFormat: {
        foregroundColorStyle: {themeColor: 'TEXT'},
        underline: false
      },
      hyperlinkDisplayType: 'PLAIN_TEXT'
    }
  };
}

function TGNL_linkedCellData_(username) {
  return {
    userEnteredFormat: {
      textFormat: {
        foregroundColorStyle: {rgbColor: TGNL_hexToRgb_(TGNL_LINK_GREEN)},
        underline: true,
        link: {uri: 'https://t.me/' + username}
      },
      hyperlinkDisplayType: 'LINKED'
    }
  };
}

function TGNL_makeLinkedRuns_(usernames) {
  const runs = [];
  let start = -1;
  for (let i = 0; i < usernames.length; i++) {
    const linked = Boolean(usernames[i]);
    if (linked && start === -1) start = i;
    if (!linked && start !== -1) {
      runs.push({start: start, end: i - 1});
      start = -1;
    }
  }
  if (start !== -1) runs.push({start: start, end: usernames.length - 1});
  return runs;
}

function TGNL_sendRequests_(spreadsheetId, requests) {
  for (let i = 0; i < requests.length; i += TGNL_BATCH_REQUEST_LIMIT) {
    TGNL_batchUpdate_(spreadsheetId, requests.slice(i, i + TGNL_BATCH_REQUEST_LIMIT));
  }
}

function TGNL_batchUpdate_(spreadsheetId, requests) {
  if (!requests.length) return;
  const endpoint = 'https://sheets.googleapis.com/v4/spreadsheets/' +
    encodeURIComponent(spreadsheetId) + ':batchUpdate';
  const response = UrlFetchApp.fetch(endpoint, {
    method: 'post',
    contentType: 'application/json; charset=utf-8',
    headers: {Authorization: 'Bearer ' + ScriptApp.getOAuthToken()},
    payload: JSON.stringify({requests: requests}),
    muteHttpExceptions: true
  });
  const code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('Sheets API HTTP ' + code + ': ' + response.getContentText().slice(0, 2000));
  }
}

/* ========================================================================== */
/*                              ДИАГНОСТИКА                                   */
/* ========================================================================== */

function TGNL_verifyRecovery_(runFunctionalTests) {
  const functional = runFunctionalTests !== false;
  const issues = [];
  const pub = SpreadsheetApp.openById(TGNL_PUBLIC_SPREADSHEET_ID);
  const search = TGNL_requireSheet_(pub, 'Поиск');
  const card = TGNL_requireSheet_(pub, 'Карточка команды');
  const relations = TGNL_requireSheet_(pub, 'Связи участников');

  const searchA6 = String(search.getRange('A6').getFormula() || '');
  const searchD6 = String(search.getRange('D6').getFormula() || '');
  const searchVisibleFormulas = search.getRange('B6:C20').getFormulas();
  if (!searchA6 || !searchD6 || searchD6.indexOf('$C$3') === -1) {
    issues.push('Поиск: отсутствуют динамические источники A/D');
  }
  searchVisibleFormulas.forEach(function(row, index) {
    row.forEach(function(formula, col) {
      if (formula) issues.push('Поиск: видимая ячейка ' + String.fromCharCode(66 + col) + (6 + index) + ' не статический RichText');
    });
  });

  const cardAvatarFormulas = card.getRange('A15:A17').getFormulas();
  cardAvatarFormulas.forEach(function(row, index) {
    if (!row[0]) issues.push('Карточка: нет формулы аватара A' + (15 + index));
  });
  const cardVisibleFormulas = card.getRange('B15:D20').getFormulas();
  cardVisibleFormulas.forEach(function(row, index) {
    row.forEach(function(formula, col) {
      if (formula) issues.push('Карточка: видимая ячейка ' + String.fromCharCode(66 + col) + (15 + index) + ' не статический RichText');
    });
  });

  const triggerReport = TGNL_checkTriggers_();
  if (triggerReport.daily !== 1) issues.push('Количество ночных триггеров ссылок: ' + triggerReport.daily);
  if (triggerReport.public_edit !== 1) issues.push('Количество onEdit-триггеров ссылок: ' + triggerReport.public_edit);
  if (triggerReport.dynamic_views !== 1) issues.push('Количество страховочных триггеров страниц: ' + triggerReport.dynamic_views);
  if (triggerReport.obsolete_public_card_edit !== 0) issues.push('Остался старый handlePublicCardEdit');

  const audit = TGNL_auditPublicLinks_();
  if (!audit.ok) {
    audit.issues.forEach(function(issue) { issues.push(issue); });
  }

  const tests = {};
  if (functional) {
    tests.card = TGNL_testDreamTeamCard_(pub, relations);
    if (!tests.card.ok) issues.push('DREAM TEAM: ' + tests.card.issues.join(', '));

    tests.search = TGNL_testPublicSearch_(pub);
    if (!tests.search.ok) issues.push('Поиск: ' + tests.search.issues.join(', '));
  }

  return {
    ok: issues.length === 0,
    issues: issues,
    triggers: triggerReport,
    link_audit: audit,
    functional_tests: tests
  };
}

function TGNL_auditPublicLinks_() {
  const ss = SpreadsheetApp.openById(TGNL_PUBLIC_SPREADSHEET_ID);
  const directory = TGNL_buildDirectory_();
  const issues = [];
  const report = {};

  // База участников: ссылка на основное отображаемое имя (A, а при пустом A — B)
  // и на сам @username в C.
  const base = TGNL_requireSheet_(ss, 'База участников');
  const baseRows = Math.min(998, Math.max(base.getLastRow() - 1, 0));
  let baseExpected = 0;
  let baseLinked = 0;
  if (baseRows > 0) {
    const values = base.getRange(2, 1, baseRows, 5).getDisplayValues();
    const linksA = TGNL_readColumnLinksViaApi_(ss.getId(), 'База участников', 'A2:A' + (baseRows + 1), baseRows);
    const linksB = TGNL_readColumnLinksViaApi_(ss.getId(), 'База участников', 'B2:B' + (baseRows + 1), baseRows);
    const linksC = TGNL_readColumnLinksViaApi_(ss.getId(), 'База участников', 'C2:C' + (baseRows + 1), baseRows);
    values.forEach(function(row, index) {
      const username = TGNL_normalizeUsername_(row[2]) || directory.byId[TGNL_normId_(row[4])] || '';
      if (!username) return;
      const url = 'https://t.me/' + username;
      if (TGNL_cleanText_(row[0])) {
        baseExpected++;
        if (linksA[index] === url) baseLinked++;
        else issues.push('База участников!A' + (index + 2));
      } else if (TGNL_cleanText_(row[1])) {
        baseExpected++;
        if (linksB[index] === url) baseLinked++;
        else issues.push('База участников!B' + (index + 2));
      }
      if (TGNL_cleanText_(row[2])) {
        baseExpected++;
        if (linksC[index] === url) baseLinked++;
        else issues.push('База участников!C' + (index + 2));
      }
    });
  }
  report.base = {expected: baseExpected, linked: baseLinked};

  const history = TGNL_requireSheet_(ss, 'История спецназа');
  const historyRows = Math.min(1007, Math.max(history.getLastRow() - 1, 0));
  let historyExpected = 0;
  let historyLinked = 0;
  if (historyRows > 0) {
    const values = history.getRange(2, 3, historyRows, 10).getDisplayValues();
    const links = TGNL_readColumnLinksViaApi_(ss.getId(), 'История спецназа', 'C2:C' + (historyRows + 1), historyRows);
    values.forEach(function(row, index) {
      const display = TGNL_cleanText_(row[0]);
      if (!display) return;
      const username = directory.byId[TGNL_normId_(row[9])] || TGNL_extractUsername_(display) || '';
      if (!username) return;
      historyExpected++;
      if (links[index] === 'https://t.me/' + username) historyLinked++;
      else issues.push('История спецназа!C' + (index + 2));
    });
  }
  report.history = {expected: historyExpected, linked: historyLinked};

  const search = TGNL_requireSheet_(ss, 'Поиск');
  const searchRows = TGNL_SEARCH_LAST_ROW - TGNL_SEARCH_FIRST_ROW + 1;
  const searchValues = search.getRange(TGNL_SEARCH_FIRST_ROW, 2, searchRows, 3).getDisplayValues();
  const searchLinks = TGNL_readRichTextLinks_(search.getRange(TGNL_SEARCH_FIRST_ROW, 2, searchRows, 1));
  let searchExpected = 0;
  let searchLinked = 0;
  searchValues.forEach(function(row, index) {
    const display = TGNL_cleanText_(row[0]);
    if (!display) return;
    const username = directory.byId[TGNL_normId_(row[2])] || TGNL_extractUsername_(display) || '';
    if (!username) return;
    searchExpected++;
    if (searchLinks[index] === 'https://t.me/' + username) searchLinked++;
    else issues.push('Поиск!B' + (index + TGNL_SEARCH_FIRST_ROW));
  });
  report.search = {expected: searchExpected, linked: searchLinked};

  const card = TGNL_requireSheet_(ss, 'Карточка команды');
  const cardRows = TGNL_CARD_LAST_ROW - TGNL_CARD_FIRST_ROW + 1;
  const cardValues = card.getRange(TGNL_CARD_FIRST_ROW, 2, cardRows, 1).getDisplayValues();
  const cardLinks = TGNL_readRichTextLinks_(card.getRange(TGNL_CARD_FIRST_ROW, 2, cardRows, 1));
  let cardExpected = 0;
  let cardLinked = 0;
  cardValues.forEach(function(row, index) {
    const display = TGNL_cleanText_(row[0]);
    const username = TGNL_extractUsername_(display);
    if (!username) return;
    cardExpected++;
    if (cardLinks[index] === 'https://t.me/' + username) cardLinked++;
    else issues.push('Карточка команды!B' + (index + TGNL_CARD_FIRST_ROW));
  });
  report.card = {expected: cardExpected, linked: cardLinked};

  const teams = TGNL_requireSheet_(ss, 'Команды');
  const teamRows = Math.min(998, Math.max(teams.getLastRow() - 1, 0));
  let teamsExpected = 0;
  let teamsLinked = 0;
  if (teamRows > 0) {
    const values = teams.getRange(2, 2, teamRows, 1).getDisplayValues();
    const rich = teams.getRange(2, 2, teamRows, 1).getRichTextValues();
    values.forEach(function(row, index) {
      const text = String(row[0] || '');
      const mentions = [];
      const regex = /@([A-Za-z0-9_]{5,32})/g;
      let match;
      while ((match = regex.exec(text)) !== null) mentions.push(match[1]);
      teamsExpected += mentions.length;
      if (!mentions.length) return;
      const runLinks = {};
      const cellRich = rich[index] && rich[index][0];
      if (cellRich) {
        cellRich.getRuns().forEach(function(run) {
          const url = run.getLinkUrl();
          if (url) runLinks[url] = true;
        });
      }
      mentions.forEach(function(username) {
        if (runLinks['https://t.me/' + username]) teamsLinked++;
        else issues.push('Команды!B' + (index + 2) + ':' + username);
      });
    });
  }
  report.teams = {expected: teamsExpected, linked: teamsLinked};

  return {ok: issues.length === 0, issues: issues, sheets: report};
}

function TGNL_readRichTextLinks_(range) {
  return range.getRichTextValues().map(function(row) {
    const rich = row && row[0];
    if (!rich) return '';
    const direct = rich.getLinkUrl();
    if (direct) return String(direct);
    const runs = rich.getRuns();
    for (let i = 0; i < runs.length; i++) {
      const url = runs[i].getLinkUrl();
      if (url) return String(url);
    }
    return '';
  });
}

function TGNL_readColumnLinksViaApi_(spreadsheetId, sheetName, rangeA1, expectedRows) {
  const quoted = "'" + String(sheetName).replace(/'/g, "''") + "'!" + rangeA1;
  const endpoint = 'https://sheets.googleapis.com/v4/spreadsheets/' +
    encodeURIComponent(spreadsheetId) +
    '?ranges=' + encodeURIComponent(quoted) +
    '&includeGridData=true&fields=sheets(data(startRow,rowData(values(hyperlink,userEnteredFormat(textFormat(link))))))';
  const response = UrlFetchApp.fetch(endpoint, {
    headers: {Authorization: 'Bearer ' + ScriptApp.getOAuthToken()},
    muteHttpExceptions: true
  });
  const code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('LINK_AUDIT_HTTP_' + code + ': ' + response.getContentText().slice(0, 1000));
  }
  const result = new Array(expectedRows).fill('');
  const json = JSON.parse(response.getContentText());
  const data = json && json.sheets && json.sheets[0] && json.sheets[0].data && json.sheets[0].data[0];
  const rows = data && data.rowData ? data.rowData : [];
  rows.forEach(function(row, index) {
    const value = row && row.values && row.values[0];
    if (!value) return;
    if (value.hyperlink) {
      result[index] = String(value.hyperlink);
      return;
    }
    const link = value.userEnteredFormat && value.userEnteredFormat.textFormat &&
      value.userEnteredFormat.textFormat.link && value.userEnteredFormat.textFormat.link.uri;
    if (link) result[index] = String(link);
  });
  return result;
}

function TGNL_testDreamTeamCard_(ss, relations) {
  const card = ss.getSheetByName('Карточка команды');
  const original = card.getRange('B2').getValue();
  const target = '⛵️ DREAM TEAM — РМ';
  const issues = [];

  try {
    const relationCount = Math.min(Math.max(relations.getLastRow() - 1, 0), TGNL_RELATIONS_LAST_ROW - 1);
    const rows = relationCount > 0
      ? relations.getRange(2, 1, relationCount, 12).getDisplayValues()
      : [];
    const expected = rows.filter(function(row) {
      return TGNL_normTeam_(row[4]) === TGNL_normTeam_('⛵️ DREAM TEAM') &&
        TGNL_normGame_(row[11]) === 'royal match';
    });

    if (expected.length !== 5) issues.push('ожидалось 5 связей, найдено ' + expected.length);

    card.getRange('B2').setValue(target);
    SpreadsheetApp.flush();
    Utilities.sleep(700);
    TGNL_refreshPublicCard_(ss, TGNL_buildDirectory_());

    const actual = card.getRange(15, 2, Math.max(expected.length, 1), 3).getDisplayValues();
    expected.forEach(function(row, index) {
      const expectedText = TGNL_joinParticipantLabel_(row[0], row[1], row[2]);
      if (actual[index][0] !== expectedText) {
        issues.push('строка ' + (15 + index) + ' имя');
      }
      if (actual[index][1] !== row[6]) issues.push('строка ' + (15 + index) + ' роль');
      if (actual[index][2] !== row[7]) issues.push('строка ' + (15 + index) + ' статус');

      const username = TGNL_normalizeUsername_(row[2]);
      if (username) {
        const link = TGNL_cellLink_(card.getRange(15 + index, 2));
        if (link !== 'https://t.me/' + username) issues.push('строка ' + (15 + index) + ' ссылка');
      }
    });

    return {ok: issues.length === 0, expected: expected.length, issues: issues};
  } finally {
    card.getRange('B2').setValue(original);
    SpreadsheetApp.flush();
    Utilities.sleep(450);
    TGNL_refreshPublicCard_(ss, TGNL_buildDirectory_());
  }
}

function TGNL_testPublicSearch_(ss) {
  const sheet = ss.getSheetByName('Поиск');
  const original = sheet.getRange('C3').getValue();
  const issues = [];

  try {
    sheet.getRange('C3').setValue('@Nata_Fisher');
    SpreadsheetApp.flush();
    Utilities.sleep(700);
    TGNL_refreshPublicSearch_(ss, TGNL_buildDirectory_());

    const id = TGNL_normId_(sheet.getRange('D6').getDisplayValue());
    const text = sheet.getRange('B6').getDisplayValue();
    const link = TGNL_cellLink_(sheet.getRange('B6'));

    if (id !== '448223377') issues.push('D6=' + id);
    if (text.indexOf('@Nata_Fisher') === -1) issues.push('B6 не содержит @Nata_Fisher');
    if (link !== 'https://t.me/Nata_Fisher') issues.push('B6 ссылка=' + link);

    return {ok: issues.length === 0, issues: issues};
  } finally {
    sheet.getRange('C3').setValue(original);
    SpreadsheetApp.flush();
    Utilities.sleep(450);
    TGNL_refreshPublicSearch_(ss, TGNL_buildDirectory_());
  }
}

/* ========================================================================== */
/*                                УТИЛИТЫ                                     */
/* ========================================================================== */

function TGNL_makeResult_(ss, requests, stats) {
  return {
    ok: true,
    title: ss.getName(),
    spreadsheetId: ss.getId(),
    requestCount: requests.length,
    sheets: stats
  };
}

function TGNL_joinParticipantLabel_(name, tgName, username) {
  const values = [TGNL_cleanText_(name), TGNL_cleanText_(tgName), TGNL_cleanText_(username)]
    .filter(function(value) { return Boolean(value); });
  return values.join(', ');
}

function TGNL_cellLink_(cell) {
  try {
    const rich = cell.getRichTextValue();
    if (rich) {
      const direct = rich.getLinkUrl();
      if (direct) return direct;
      const runs = rich.getRuns();
      for (let i = 0; i < runs.length; i++) {
        const url = runs[i].getLinkUrl();
        if (url) return url;
      }
    }
  } catch (error) {}

  // Форматная ссылка на формульной ячейке не во всех версиях Apps Script
  // возвращается через RichTextValue. Проверяем фактический hyperlink через
  // Google Sheets API — тот же атрибут видит Android-клиент.
  try {
    const sheet = cell.getSheet();
    const spreadsheetId = sheet.getParent().getId();
    const a1 = "'" + String(sheet.getName()).replace(/'/g, "''") + "'!" +
      cell.getA1Notation();
    const endpoint = 'https://sheets.googleapis.com/v4/spreadsheets/' +
      encodeURIComponent(spreadsheetId) +
      '?ranges=' + encodeURIComponent(a1) +
      '&includeGridData=true&fields=sheets(data(rowData(values(hyperlink,userEnteredFormat(textFormat(link))))))';
    const response = UrlFetchApp.fetch(endpoint, {
      headers: {Authorization: 'Bearer ' + ScriptApp.getOAuthToken()},
      muteHttpExceptions: true
    });
    if (response.getResponseCode() >= 200 && response.getResponseCode() < 300) {
      const data = JSON.parse(response.getContentText());
      const value = data && data.sheets && data.sheets[0] &&
        data.sheets[0].data && data.sheets[0].data[0] &&
        data.sheets[0].data[0].rowData && data.sheets[0].data[0].rowData[0] &&
        data.sheets[0].data[0].rowData[0].values &&
        data.sheets[0].data[0].rowData[0].values[0];
      if (value && value.hyperlink) return String(value.hyperlink);
      if (value && value.userEnteredFormat && value.userEnteredFormat.textFormat &&
          value.userEnteredFormat.textFormat.link &&
          value.userEnteredFormat.textFormat.link.uri) {
        return String(value.userEnteredFormat.textFormat.link.uri);
      }
    }
  } catch (error) {}

  return '';
}

function TGNL_valueAt_(row, oneBasedColumn) {
  return oneBasedColumn ? row[oneBasedColumn - 1] || '' : '';
}

function TGNL_countLinks_(values) {
  return values.filter(function(value) { return Boolean(value); }).length;
}

function TGNL_hexToRgb_(hex) {
  const number = parseInt(String(hex).replace('#', ''), 16);
  return {
    red: ((number >> 16) & 255) / 255,
    green: ((number >> 8) & 255) / 255,
    blue: (number & 255) / 255
  };
}

function TGNL_requireSheet_(ss, name) {
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('Не найден лист «' + name + '» в ' + ss.getName());
  return sheet;
}

function TGNL_ensureGrid_(sheet, rows, columns) {
  if (sheet.getMaxRows() < rows) {
    sheet.insertRowsAfter(sheet.getMaxRows(), rows - sheet.getMaxRows());
  }
  if (sheet.getMaxColumns() < columns) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), columns - sheet.getMaxColumns());
  }
}

function TGNL_saveError_(error) {
  const text = String(error && error.stack ? error.stack : error);
  PropertiesService.getScriptProperties().setProperty(
    TGNL_PROP_LAST_ERROR,
    new Date().toISOString() + '\n' + text.slice(0, 8000)
  );
}
