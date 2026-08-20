/*
 * Royal CRM / Таблица ЧП
 * 30_MINIAPP_ADMIN_WRITE_V2.js
 * v0.6.0-write.2
 *
 * Hardened admin-write transaction layer.
 * Requires 29_MINIAPP_ADMIN_WRITE.js for shared validation/helpers.
 *
 * Preserves the same invariants as a manual edit in Google Sheets:
 * - counter snapshot + manual specnaz history;
 * - AE timestamp behavior through processManualCounterEdits_;
 * - stable В чате/Вышел base sorting;
 * - role validation restoration after sorting;
 * - team rename cascade by name + game;
 * - immutable participant Telegram ID;
 * - immutable game for an existing team;
 * - optimistic revisions include every writable participant field;
 * - hidden admin journal + request idempotency;
 * - no delete operations.
 */

var MINIAPP_ADMIN_WRITE_V2_VERSION = '0.6.0-write.2';

function MINIAPP_adminWriteV2MaybeHandle_(e) {
  var action = MINIAPP_adminWriteValue_(e && e.parameter && e.parameter.action);
  if (action !== MINIAPP_ADMIN_WRITE_ACTION) return null;

  var callback = typeof MINIAPP_callback_ === 'function'
    ? MINIAPP_callback_(e && e.parameter && e.parameter.callback)
    : '';
  if (!callback) {
    return MINIAPP_adminWriteJsonp_('__miniappInvalid', {
      ok: false,
      error: 'INVALID_CALLBACK',
      version: MINIAPP_ADMIN_WRITE_V2_VERSION
    });
  }

  var result;
  try {
    result = MINIAPP_adminWriteV2Execute_(e);
  } catch (error) {
    console.error('MINIAPP admin write v2 fatal', error && error.stack ? error.stack : error);
    result = {
      ok: false,
      error: 'ADMIN_WRITE_SERVER_ERROR',
      message: 'Не удалось сохранить изменение. Сначала обновите админ-режим и проверьте данные.',
      version: MINIAPP_ADMIN_WRITE_V2_VERSION
    };
  }
  return MINIAPP_adminWriteJsonp_(callback, result);
}

function MINIAPP_adminWriteV2Execute_(e) {
  var initData = MINIAPP_adminWriteValue_(e && e.parameter && e.parameter.initData);
  var requestId = MINIAPP_adminWriteRequestId_(e && e.parameter && e.parameter.requestId);
  var op = MINIAPP_adminWriteValue_(e && e.parameter && e.parameter.op);
  var payloadRaw = MINIAPP_adminWriteValue_(e && e.parameter && e.parameter.payload);

  if (!initData) return MINIAPP_adminWriteError_('INIT_DATA_MISSING', 'Откройте приложение из Telegram.');
  if (!requestId) return MINIAPP_adminWriteError_('INVALID_REQUEST_ID', 'Некорректный идентификатор операции.');
  if (!op) return MINIAPP_adminWriteError_('OPERATION_MISSING', 'Не указана операция.');

  var cached = CacheService.getScriptCache().get(MINIAPP_ADMIN_WRITE_CACHE_PREFIX + requestId);
  if (cached) {
    try {
      var cachedResult = JSON.parse(cached);
      cachedResult.duplicate = true;
      cachedResult.idempotency = 'CACHE';
      cachedResult.version = MINIAPP_ADMIN_WRITE_V2_VERSION;
      return cachedResult;
    } catch (_) {}
  }

  if (typeof MINIAPP_validateInitData_ !== 'function' ||
      typeof MINIAPP_findCrmProfile_ !== 'function' ||
      typeof MINIAPP_getTelegramAdminInfo_ !== 'function') {
    return MINIAPP_adminWriteError_('AUTH_HELPERS_MISSING', 'Сервер авторизации ещё не обновлён.');
  }

  var validated = MINIAPP_validateInitData_(initData);
  if (!validated || !validated.ok || !validated.user || validated.user.id == null) {
    return MINIAPP_adminWriteError_(validated && validated.error || 'INVALID_INIT_DATA', 'Не удалось подтвердить Telegram-пользователя.');
  }

  var adminId = MINIAPP_adminWriteTelegramId_(validated.user.id);
  var profile = MINIAPP_findCrmProfile_(adminId);
  if (!profile || !profile.found || MINIAPP_adminWriteValue_(profile.chatState) !== 'В чате') {
    return MINIAPP_adminWriteError_('ADMIN_NOT_IN_CHAT', 'Админ должен состоять в Чате Победителей.');
  }

  var adminInfo = MINIAPP_getTelegramAdminInfo_(adminId);
  if (!adminInfo || !adminInfo.isAdmin) {
    return MINIAPP_adminWriteError_('ADMIN_REQUIRED', 'Изменения доступны только администраторам чата.');
  }

  var payload;
  try {
    payload = MINIAPP_adminWriteDecodePayload_(payloadRaw);
  } catch (error) {
    return MINIAPP_adminWriteError_('PAYLOAD_INVALID', 'Не удалось прочитать данные изменения.');
  }

  var lock = LockService.getScriptLock();
  var mutationStarted = false;
  try {
    if (!lock.tryLock(20000)) {
      return MINIAPP_adminWriteError_('WRITE_BUSY', 'База занята другой операцией. Повторите через несколько секунд.');
    }

    // Admin status is checked again inside the locked transaction window.
    adminInfo = MINIAPP_getTelegramAdminInfo_(adminId);
    if (!adminInfo || !adminInfo.isAdmin) {
      return MINIAPP_adminWriteError_('ADMIN_REQUIRED', 'Права администратора больше не подтверждаются.');
    }

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var ctx = {
      ss: ss,
      adminId: adminId,
      adminUsername: MINIAPP_adminWriteUsername_(validated.user.username || profile.username || '') || '',
      requestId: requestId,
      op: op,
      payload: payload
    };

    var journalDuplicate = MINIAPP_adminWriteFindJournalRequest_(requestId);
    if (journalDuplicate) {
      // A retry after a rare interruption between mutation and post-processing
      // repairs idempotent participant invariants before returning success.
      MINIAPP_adminWriteV2RepairDuplicate_(ctx, journalDuplicate);
      var duplicateResult = {
        ok: true,
        duplicate: true,
        idempotency: 'JOURNAL',
        requestId: requestId,
        op: journalDuplicate.op || op,
        entityType: journalDuplicate.entityType || '',
        entityKey: journalDuplicate.entityKey || '',
        row: Number(journalDuplicate.row || 0),
        version: MINIAPP_ADMIN_WRITE_V2_VERSION,
        message: 'Эта операция уже была сохранена ранее.'
      };
      if (journalDuplicate.entityType === 'participant') {
        var duplicateId = MINIAPP_adminWriteTelegramId_(payload && payload.telegramId);
        var baseSheet = ss.getSheetByName(SHEET_BASE);
        var duplicateRow = baseSheet && duplicateId ? MINIAPP_adminWriteFindParticipantRow_(baseSheet, duplicateId) : 0;
        if (duplicateRow) duplicateResult.row = duplicateRow;
      }
      duplicateResult.adminSnapshot = MINIAPP_adminWriteRefreshAdminSnapshot_();
      MINIAPP_adminWriteCacheResult_(requestId, duplicateResult);
      return duplicateResult;
    }

    if (typeof beginPublicDataMutation_ === 'function') {
      beginPublicDataMutation_('miniapp_admin_write_v2:' + op + ':' + requestId);
      mutationStarted = true;
    }

    var result;
    if (op === 'updateParticipant') result = MINIAPP_adminWriteV2UpdateParticipant_(ctx);
    else if (op === 'createParticipant') result = MINIAPP_adminWriteV2CreateParticipant_(ctx);
    else if (op === 'updateTeam') result = MINIAPP_adminWriteV2UpdateTeam_(ctx);
    else if (op === 'createTeam') result = MINIAPP_adminWriteV2CreateTeam_(ctx);
    else result = MINIAPP_adminWriteError_('OPERATION_NOT_ALLOWED', 'Эта операция не разрешена в v0.6.');

    if (!result || !result.ok) return result || MINIAPP_adminWriteError_('WRITE_FAILED', 'Изменение не сохранено.');

    result.version = MINIAPP_ADMIN_WRITE_V2_VERSION;
    MINIAPP_adminWriteCacheResult_(requestId, result);
    result.adminSnapshot = MINIAPP_adminWriteRefreshAdminSnapshot_();
    MINIAPP_adminWriteCacheResult_(requestId, result);
    return result;
  } finally {
    if (mutationStarted && typeof finishPublicDataMutation_ === 'function') {
      try { finishPublicDataMutation_('miniapp_admin_write_v2:' + op + ':' + requestId); } catch (_) {}
    }
    try { lock.releaseLock(); } catch (_) {}
  }
}

function MINIAPP_adminWriteV2UpdateParticipant_(ctx) {
  var sheet = ctx.ss.getSheetByName(SHEET_BASE);
  var helper = ctx.ss.getSheetByName(typeof FINALROLE_HELPER_SHEET_ !== 'undefined' ? FINALROLE_HELPER_SHEET_ : 'Списки');
  if (!sheet) return MINIAPP_adminWriteError_('BASE_SHEET_MISSING', 'Не найдена база участников.');

  var telegramId = MINIAPP_adminWriteTelegramId_(ctx.payload && ctx.payload.telegramId);
  if (!telegramId) return MINIAPP_adminWriteError_('TELEGRAM_ID_INVALID', 'Некорректный Telegram ID.');
  var row = MINIAPP_adminWriteFindParticipantRow_(sheet, telegramId);
  if (!row) return MINIAPP_adminWriteError_('PARTICIPANT_NOT_FOUND', 'Участник не найден.');

  var before = MINIAPP_adminWriteV2ParticipantRecord_(sheet, row);
  var currentRevision = MINIAPP_adminWriteV2ParticipantRevision_(before);
  var expectedRevision = MINIAPP_adminWriteValue_(ctx.payload.expectedRevision);
  if (!expectedRevision || expectedRevision !== currentRevision) {
    return MINIAPP_adminWriteConflict_('PARTICIPANT_CHANGED', 'Карточка участника уже изменилась. Обновите данные и повторите.', currentRevision);
  }

  var normalized = MINIAPP_adminWriteV2NormalizeParticipantInput_(ctx.ss, ctx.payload.changes || {}, false);
  if (!normalized.ok) return normalized;
  var changes = normalized.value;

  var identityChanged = false;
  var countersChanged = false;
  var chatStateChanged = false;

  if (Object.prototype.hasOwnProperty.call(changes, 'name') && changes.name !== before.name) {
    sheet.getRange(row, COL_NAME).setValue(changes.name); identityChanged = true;
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'telegramName') && changes.telegramName !== before.telegramName) {
    sheet.getRange(row, COL_TG_NAME).setValue(changes.telegramName); identityChanged = true;
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'username') && changes.username !== before.username) {
    sheet.getRange(row, COL_TG_USERNAME).setValue(changes.username); identityChanged = true;
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'memberships')) {
    MINIAPP_adminWriteSetMemberships_(sheet, helper, row, changes.memberships);
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'specnaz') && Number(changes.specnaz) !== Number(before.specnaz || 0)) {
    sheet.getRange(row, COL_SPECNAZ).setValue(changes.specnaz); countersChanged = true;
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'date')) {
    sheet.getRange(row, COL_DATE).setValue(changes.date).setNumberFormat('dd.MM.yyyy');
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'screens') && Number(changes.screens) !== Number(before.screens || 0)) {
    sheet.getRange(row, COL_SCREENS).setValue(changes.screens); countersChanged = true;
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'activityBase') && Number(changes.activityBase) !== Number(before.activityBase || 0)) {
    sheet.getRange(row, COL_ACTIVITY_BASE).setValue(changes.activityBase); countersChanged = true;
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'activityOutside') && Number(changes.activityOutside) !== Number(before.activityOutside || 0)) {
    sheet.getRange(row, COL_ACTIVITY_OUTSIDE).setValue(changes.activityOutside); countersChanged = true;
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'chatState') && changes.chatState !== before.chatState) {
    sheet.getRange(row, COL_CHAT_STATE).setValue(changes.chatState); chatStateChanged = true;
  }

  SpreadsheetApp.flush();

  if (countersChanged && typeof processManualCounterEdits_ === 'function') {
    var counterRange = sheet.getRange(row, COL_SPECNAZ, 1, COL_ACTIVITY_OUTSIDE - COL_SPECNAZ + 1);
    processManualCounterEdits_(ctx.ss, sheet, row, row, COL_SPECNAZ, COL_ACTIVITY_OUTSIDE, { range: counterRange });
  }

  if (chatStateChanged && typeof sortBaseByChatState_ === 'function') {
    sortBaseByChatState_(ctx.ss);
    row = MINIAPP_adminWriteFindParticipantRow_(sheet, telegramId) || row;
  }

  SpreadsheetApp.flush();
  if (identityChanged) MINIAPP_adminWriteRefreshParticipantLinks_(ctx.ss, changes);
  if (typeof markPublicSyncPending_ === 'function') markPublicSyncPending_('miniapp_admin_participant_v2:' + telegramId);

  var after = MINIAPP_adminWriteV2ParticipantRecord_(sheet, row);
  MINIAPP_adminWriteV2AppendJournal_(ctx, 'participant', telegramId, row, before, after, changes);

  return {
    ok: true,
    requestId: ctx.requestId,
    op: ctx.op,
    entityType: 'participant',
    entityKey: telegramId,
    row: row,
    revision: MINIAPP_adminWriteV2ParticipantRevision_(after),
    message: 'Участник обновлён.'
  };
}

function MINIAPP_adminWriteV2CreateParticipant_(ctx) {
  var sheet = ctx.ss.getSheetByName(SHEET_BASE);
  var helper = ctx.ss.getSheetByName(typeof FINALROLE_HELPER_SHEET_ !== 'undefined' ? FINALROLE_HELPER_SHEET_ : 'Списки');
  if (!sheet) return MINIAPP_adminWriteError_('BASE_SHEET_MISSING', 'Не найдена база участников.');

  var telegramId = MINIAPP_adminWriteTelegramId_(ctx.payload && ctx.payload.telegramId);
  if (!telegramId) return MINIAPP_adminWriteError_('TELEGRAM_ID_INVALID', 'Telegram ID должен содержать только цифры.');
  if (MINIAPP_adminWriteFindParticipantRow_(sheet, telegramId)) {
    return MINIAPP_adminWriteError_('TELEGRAM_ID_EXISTS', 'Участник с таким Telegram ID уже существует.');
  }

  var normalized = MINIAPP_adminWriteV2NormalizeParticipantInput_(ctx.ss, ctx.payload && ctx.payload.changes || {}, true);
  if (!normalized.ok) return normalized;
  var value = normalized.value;
  if (!value.name && !value.telegramName) {
    return MINIAPP_adminWriteError_('PARTICIPANT_NAME_REQUIRED', 'Укажите имя или имя Telegram.');
  }

  var row = MINIAPP_adminWriteFindEmptyParticipantRow_(sheet);
  if (!row) return MINIAPP_adminWriteError_('BASE_FULL', 'В базе участников нет свободной подготовленной строки.');
  var before = { row: row, empty: true };

  sheet.getRange(row, COL_NAME).setValue(value.name || '');
  sheet.getRange(row, COL_TG_NAME).setValue(value.telegramName || '');
  sheet.getRange(row, COL_TG_USERNAME).setValue(value.username || '');
  sheet.getRange(row, COL_TG_ID).setNumberFormat('@').setValue(telegramId);
  sheet.getRange(row, COL_SPECNAZ).setValue(value.specnaz == null ? 0 : value.specnaz);
  sheet.getRange(row, COL_DATE).setValue(value.date || new Date()).setNumberFormat('dd.MM.yyyy');
  sheet.getRange(row, COL_SCREENS).setValue(value.screens == null ? 0 : value.screens);
  sheet.getRange(row, COL_ACTIVITY_BASE).setValue(value.activityBase == null ? 0 : value.activityBase);
  sheet.getRange(row, COL_ACTIVITY_OUTSIDE).setValue(value.activityOutside == null ? 0 : value.activityOutside);
  sheet.getRange(row, COL_CHAT_STATE).setValue(value.chatState || 'В чате');
  MINIAPP_adminWriteSetMemberships_(sheet, helper, row, value.memberships || []);
  SpreadsheetApp.flush();

  if (typeof processManualCounterEdits_ === 'function') {
    var counterRange = sheet.getRange(row, COL_SPECNAZ, 1, COL_ACTIVITY_OUTSIDE - COL_SPECNAZ + 1);
    processManualCounterEdits_(ctx.ss, sheet, row, row, COL_SPECNAZ, COL_ACTIVITY_OUTSIDE, { range: counterRange });
  }

  if (typeof sortBaseByChatState_ === 'function') {
    sortBaseByChatState_(ctx.ss);
    row = MINIAPP_adminWriteFindParticipantRow_(sheet, telegramId) || row;
  }

  SpreadsheetApp.flush();
  MINIAPP_adminWriteRefreshParticipantLinks_(ctx.ss, value);
  if (typeof markPublicSyncPending_ === 'function') markPublicSyncPending_('miniapp_admin_participant_create_v2:' + telegramId);
  if (typeof queueTelegramAvatarRefresh_ === 'function') {
    try { queueTelegramAvatarRefresh_(telegramId, 'miniapp_admin_create'); } catch (_) {}
  }

  var after = MINIAPP_adminWriteV2ParticipantRecord_(sheet, row);
  MINIAPP_adminWriteV2AppendJournal_(ctx, 'participant', telegramId, row, before, after, value);

  return {
    ok: true,
    requestId: ctx.requestId,
    op: ctx.op,
    entityType: 'participant',
    entityKey: telegramId,
    row: row,
    revision: MINIAPP_adminWriteV2ParticipantRevision_(after),
    message: 'Участник добавлен.'
  };
}

function MINIAPP_adminWriteV2UpdateTeam_(ctx) {
  var sheet = ctx.ss.getSheetByName(SHEET_TEAMS);
  if (!sheet) return MINIAPP_adminWriteError_('TEAMS_SHEET_MISSING', 'Не найден лист команд.');

  var originalName = MINIAPP_adminWriteV2TeamName_(ctx.payload && ctx.payload.name);
  var game = MINIAPP_adminWriteCanonicalGame_(ctx.payload && ctx.payload.game);
  if (!originalName || !game) return MINIAPP_adminWriteError_('TEAM_IDENTITY_INVALID', 'Не удалось определить команду и игру.');
  var row = MINIAPP_adminWriteFindTeamRow_(sheet, originalName, game);
  if (!row) return MINIAPP_adminWriteError_('TEAM_NOT_FOUND', 'Команда не найдена.');

  var before = MINIAPP_adminWriteTeamRecord_(sheet, row);
  var currentRevision = MINIAPP_adminWriteTeamRevision_(before);
  var expectedRevision = MINIAPP_adminWriteValue_(ctx.payload.expectedRevision);
  if (!expectedRevision || expectedRevision !== currentRevision) {
    return MINIAPP_adminWriteConflict_('TEAM_CHANGED', 'Карточка команды уже изменилась. Обновите данные и повторите.', currentRevision);
  }

  var changes = ctx.payload.changes || {};
  var nextName = Object.prototype.hasOwnProperty.call(changes, 'name')
    ? MINIAPP_adminWriteV2TeamName_(changes.name) : originalName;
  var nextLeader = Object.prototype.hasOwnProperty.call(changes, 'leader')
    ? MINIAPP_adminWriteText_(changes.leader, 180) : before.leader;
  if (!nextName) return MINIAPP_adminWriteError_('TEAM_NAME_REQUIRED', 'Название команды не может быть пустым.');

  var duplicateRow = MINIAPP_adminWriteFindTeamRow_(sheet, nextName, game);
  if (duplicateRow && duplicateRow !== row) {
    return MINIAPP_adminWriteError_('TEAM_EXISTS', 'Команда с таким названием уже существует в этой игре.');
  }

  if (nextName !== originalName) {
    sheet.getRange(row, 2).setValue(nextName);
    if (typeof finalRoleCascadeTeamRename_ === 'function') {
      finalRoleCascadeTeamRename_(ctx.ss, game, originalName, nextName);
    }
  }
  if (nextLeader !== before.leader) MINIAPP_adminWriteV2SetTeamLeader_(sheet, row, nextLeader);

  if (typeof finalRoleRepairDecoratedTeamMemberships_ === 'function') {
    finalRoleRepairDecoratedTeamMemberships_(ctx.ss, { skipMark: true, source: 'miniapp_admin_write_v2' });
  }
  if (typeof finalRoleNormalizeTeamsOrder_ === 'function') finalRoleNormalizeTeamsOrder_(sheet);
  SpreadsheetApp.flush();
  if (typeof markPublicSyncPending_ === 'function') markPublicSyncPending_('miniapp_admin_team_v2:' + game + ':' + nextName);

  var finalRow = MINIAPP_adminWriteFindTeamRow_(sheet, nextName, game) || row;
  var after = MINIAPP_adminWriteTeamRecord_(sheet, finalRow);
  var key = game + ' :: ' + nextName;
  MINIAPP_adminWriteV2AppendJournal_(ctx, 'team', key, finalRow, before, after, { name: nextName, leader: nextLeader });

  return {
    ok: true,
    requestId: ctx.requestId,
    op: ctx.op,
    entityType: 'team',
    entityKey: key,
    row: finalRow,
    revision: MINIAPP_adminWriteTeamRevision_(after),
    message: 'Команда обновлена.'
  };
}

function MINIAPP_adminWriteV2CreateTeam_(ctx) {
  var sheet = ctx.ss.getSheetByName(SHEET_TEAMS);
  if (!sheet) return MINIAPP_adminWriteError_('TEAMS_SHEET_MISSING', 'Не найден лист команд.');

  var game = MINIAPP_adminWriteCanonicalGame_(ctx.payload && ctx.payload.game);
  var name = MINIAPP_adminWriteV2TeamName_(ctx.payload && ctx.payload.name);
  var leader = MINIAPP_adminWriteText_(ctx.payload && ctx.payload.leader, 180);
  if (!game) return MINIAPP_adminWriteError_('TEAM_GAME_REQUIRED', 'Выберите Royal Match или Royal Kingdom.');
  if (!name) return MINIAPP_adminWriteError_('TEAM_NAME_REQUIRED', 'Введите название команды.');
  if (MINIAPP_adminWriteFindTeamRow_(sheet, name, game)) {
    return MINIAPP_adminWriteError_('TEAM_EXISTS', 'Такая команда уже существует в этой игре.');
  }

  var row = MINIAPP_adminWriteFindEmptyTeamRow_(sheet);
  if (!row) return MINIAPP_adminWriteError_('TEAMS_FULL', 'На листе команд нет свободной подготовленной строки.');
  var before = { row: row, empty: true };
  sheet.getRange(row, 1).setValue(game);
  sheet.getRange(row, 2).setValue(name);
  if (leader) MINIAPP_adminWriteV2SetTeamLeader_(sheet, row, leader);

  if (typeof finalRoleNormalizeTeamsOrder_ === 'function') finalRoleNormalizeTeamsOrder_(sheet);
  SpreadsheetApp.flush();
  if (typeof markPublicSyncPending_ === 'function') markPublicSyncPending_('miniapp_admin_team_create_v2:' + game + ':' + name);

  var finalRow = MINIAPP_adminWriteFindTeamRow_(sheet, name, game) || row;
  var after = MINIAPP_adminWriteTeamRecord_(sheet, finalRow);
  var key = game + ' :: ' + name;
  MINIAPP_adminWriteV2AppendJournal_(ctx, 'team', key, finalRow, before, after, { game: game, name: name, leader: leader });

  return {
    ok: true,
    requestId: ctx.requestId,
    op: ctx.op,
    entityType: 'team',
    entityKey: key,
    row: finalRow,
    revision: MINIAPP_adminWriteTeamRevision_(after),
    message: 'Команда добавлена.'
  };
}

function MINIAPP_adminWriteV2NormalizeParticipantInput_(ss, raw, creating) {
  raw = raw && typeof raw === 'object' ? raw : {};
  var base = MINIAPP_adminWriteNormalizeParticipantInput_(ss, raw, creating);
  if (!base.ok) return base;
  var out = base.value || {};

  if (Object.prototype.hasOwnProperty.call(raw, 'date') && MINIAPP_adminWriteValue_(raw.date)) {
    var date = MINIAPP_adminWriteV2ParseDate_(raw.date);
    if (!date) return MINIAPP_adminWriteError_('DATE_INVALID', 'Дата должна быть корректной календарной датой.');
    out.date = date;
  }

  var counterFields = ['screens', 'activityBase', 'activityOutside'];
  for (var i = 0; i < counterFields.length; i++) {
    var key = counterFields[i];
    if (!creating && !Object.prototype.hasOwnProperty.call(raw, key)) continue;
    var parsed = MINIAPP_adminWriteV2Counter_(raw[key], key);
    if (!parsed.ok) return parsed;
    out[key] = parsed.value;
  }

  return { ok: true, value: out };
}

function MINIAPP_adminWriteV2Counter_(value, field) {
  var number = Number(value == null || value === '' ? 0 : value);
  if (!isFinite(number) || number < 0 || number > 999999 || Math.floor(number) !== number) {
    return MINIAPP_adminWriteError_('COUNTER_INVALID', 'Поле ' + field + ' должно быть целым числом от 0 до 999999.');
  }
  return { ok: true, value: number };
}

function MINIAPP_adminWriteV2ParseDate_(value) {
  var text = MINIAPP_adminWriteValue_(value);
  var match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) match = text.match(/^(\d{2})\.(\d{2})\.(\d{4})$/) && [null, RegExp.$3, RegExp.$2, RegExp.$1];
  if (!match) return null;
  var year = Number(match[1]);
  var month = Number(match[2]);
  var day = Number(match[3]);
  var date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function MINIAPP_adminWriteV2ParticipantRecord_(sheet, row) {
  var base = MINIAPP_adminWriteParticipantRecord_(sheet, row);
  var values = sheet.getRange(row, 1, 1, Math.max(COL_CHAT_STATE, 32)).getDisplayValues()[0];
  base.date = MINIAPP_adminWriteValue_(values[COL_DATE - 1]);
  base.screens = MINIAPP_adminWriteNumberOrText_(values[COL_SCREENS - 1]);
  base.activityBase = MINIAPP_adminWriteNumberOrText_(values[COL_ACTIVITY_BASE - 1]);
  base.activityOutside = MINIAPP_adminWriteNumberOrText_(values[COL_ACTIVITY_OUTSIDE - 1]);
  return base;
}

function MINIAPP_adminWriteV2ParticipantRevision_(record) {
  var memberships = [];
  (Array.isArray(record && record.memberships) ? record.memberships : []).forEach(function(m) {
    memberships.push({
      slot: Number(m && m.slot || 0),
      team: MINIAPP_adminWriteValue_(m && m.team),
      nickname: MINIAPP_adminWriteValue_(m && m.nickname),
      role: MINIAPP_adminWriteValue_(m && m.role),
      game: MINIAPP_adminWriteCanonicalGame_(m && m.game)
    });
  });
  memberships.sort(function(a, b) { return a.slot - b.slot; });
  return MINIAPP_adminWriteSha256_(JSON.stringify({
    telegramId: MINIAPP_adminWriteTelegramId_(record && record.telegramId),
    name: MINIAPP_adminWriteValue_(record && record.name),
    telegramName: MINIAPP_adminWriteValue_(record && record.telegramName),
    username: MINIAPP_adminWriteValue_(record && record.username),
    memberships: memberships,
    specnaz: MINIAPP_adminWriteNumberOrText_(record && record.specnaz),
    date: MINIAPP_adminWriteValue_(record && record.date),
    screens: MINIAPP_adminWriteNumberOrText_(record && record.screens),
    activityBase: MINIAPP_adminWriteNumberOrText_(record && record.activityBase),
    activityOutside: MINIAPP_adminWriteNumberOrText_(record && record.activityOutside),
    chatState: MINIAPP_adminWriteValue_(record && record.chatState)
  }));
}

function MINIAPP_adminWriteV2DecorateRevisions_(participants, teams) {
  (participants || []).forEach(function(p) { p.revision = MINIAPP_adminWriteV2ParticipantRevision_(p); });
  (teams || []).forEach(function(t) { t.revision = MINIAPP_adminWriteTeamRevision_(t); });
}

function MINIAPP_adminWriteV2AdminMeta_() {
  var endpoint = '';
  try { endpoint = String(ScriptApp.getService().getUrl() || '').trim(); } catch (_) {}
  return {
    enabled: !!endpoint,
    version: MINIAPP_ADMIN_WRITE_V2_VERSION,
    endpoint: endpoint,
    operations: ['updateParticipant', 'createParticipant', 'updateTeam', 'createTeam'],
    deleteEnabled: false,
    participantIdentity: 'telegramId-immutable',
    teamIdentity: 'name+game',
    writableParticipantFields: [
      'name', 'telegramName', 'username', 'memberships', 'specnaz', 'date',
      'screens', 'activityBase', 'activityOutside', 'chatState'
    ],
    writableTeamFields: ['name', 'leader'],
    createTeamFields: ['game', 'name', 'leader'],
    formulaFieldsProtected: ['status', 'membershipGames', 'teamStats', 'teamStatus'],
    journal: true
  };
}

function MINIAPP_adminWriteV2JournalData_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(MINIAPP_ADMIN_WRITE_JOURNAL_SHEET);
  if (!sheet || sheet.getLastRow() < 2) {
    return { version: MINIAPP_ADMIN_WRITE_V2_VERSION, rows: [] };
  }
  var last = sheet.getLastRow();
  var count = Math.min(MINIAPP_ADMIN_WRITE_JOURNAL_LIMIT, last - 1);
  var start = Math.max(2, last - count + 1);
  var values = sheet.getRange(start, 1, count, 12).getDisplayValues();
  return {
    version: MINIAPP_ADMIN_WRITE_V2_VERSION,
    rows: values.map(function(r) {
      return {
        at: r[0], requestId: r[1], adminTelegramId: r[2], adminUsername: r[3],
        op: r[4], entityType: r[5], entityKey: r[6], row: Number(r[7] || 0),
        changed: MINIAPP_adminWriteParseJsonText_(r[8]),
        before: MINIAPP_adminWriteParseJsonText_(r[9]),
        after: MINIAPP_adminWriteParseJsonText_(r[10]), version: r[11]
      };
    }).reverse()
  };
}

function MINIAPP_adminWriteV2AppendJournal_(ctx, entityType, entityKey, row, before, after, changed) {
  var sheet = MINIAPP_adminWriteEnsureJournal_(ctx.ss);
  sheet.appendRow([
    new Date(), ctx.requestId, ctx.adminId, ctx.adminUsername || '', ctx.op,
    entityType, entityKey, Number(row || 0), JSON.stringify(changed || {}),
    JSON.stringify(before || {}), JSON.stringify(after || {}), MINIAPP_ADMIN_WRITE_V2_VERSION
  ]);
  sheet.getRange(sheet.getLastRow(), 1).setNumberFormat('dd.MM.yyyy HH:mm:ss');
}

function MINIAPP_adminWriteV2RepairDuplicate_(ctx, journalDuplicate) {
  if (!journalDuplicate || journalDuplicate.entityType !== 'participant') return;
  var telegramId = MINIAPP_adminWriteTelegramId_(ctx.payload && ctx.payload.telegramId);
  if (!telegramId) return;
  var sheet = ctx.ss.getSheetByName(SHEET_BASE);
  if (!sheet) return;
  var row = MINIAPP_adminWriteFindParticipantRow_(sheet, telegramId);
  if (!row) return;

  var changes = ctx.payload && ctx.payload.changes || {};
  var touchesCounter = ctx.op === 'createParticipant' ||
    ['specnaz', 'screens', 'activityBase', 'activityOutside'].some(function(key) {
      return Object.prototype.hasOwnProperty.call(changes, key);
    });
  if (touchesCounter && typeof processManualCounterEdits_ === 'function') {
    var counterRange = sheet.getRange(row, COL_SPECNAZ, 1, COL_ACTIVITY_OUTSIDE - COL_SPECNAZ + 1);
    processManualCounterEdits_(ctx.ss, sheet, row, row, COL_SPECNAZ, COL_ACTIVITY_OUTSIDE, { range: counterRange });
  }

  var touchesState = ctx.op === 'createParticipant' || Object.prototype.hasOwnProperty.call(changes, 'chatState');
  if (touchesState && typeof sortBaseByChatState_ === 'function') {
    sortBaseByChatState_(ctx.ss);
    row = MINIAPP_adminWriteFindParticipantRow_(sheet, telegramId) || row;
  }
  MINIAPP_adminWriteV2FixJournalRow_(ctx.ss, ctx.requestId, row);
  if (ctx.op === 'createParticipant' && typeof queueTelegramAvatarRefresh_ === 'function') {
    try { queueTelegramAvatarRefresh_(telegramId, 'miniapp_admin_create_retry'); } catch (_) {}
  }
}

function MINIAPP_adminWriteV2FixJournalRow_(ss, requestId, row) {
  var sheet = ss.getSheetByName(MINIAPP_ADMIN_WRITE_JOURNAL_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return;
  var last = sheet.getLastRow();
  var start = Math.max(2, last - 499);
  var count = last - start + 1;
  var ids = sheet.getRange(start, 2, count, 1).getDisplayValues();
  for (var i = ids.length - 1; i >= 0; i--) {
    if (MINIAPP_adminWriteValue_(ids[i][0]) !== requestId) continue;
    sheet.getRange(start + i, 8).setValue(Number(row || 0));
    return;
  }
}

function MINIAPP_adminWriteV2TeamName_(value) {
  var text = MINIAPP_adminWriteText_(value, 180);
  return text.replace(/\s+—\s+(РМ|РК)$/u, '').trim();
}

function MINIAPP_adminWriteV2SetTeamLeader_(sheet, row, text) {
  var cell = sheet.getRange(row, 4);
  var value = MINIAPP_adminWriteText_(text, 180);
  if (!value) {
    cell.clearContent();
    return;
  }

  var username = '';
  try {
    if (typeof TGNL_buildDirectory_ === 'function' && typeof TGNL_resolveUsername_ === 'function') {
      username = TGNL_resolveUsername_(TGNL_buildDirectory_(), {
        display: value, name: value, tgName: '', username: '', id: ''
      });
    }
  } catch (_) {}

  if (!username) {
    cell.setValue(value);
    return;
  }

  var rich = SpreadsheetApp.newRichTextValue()
    .setText(value)
    .setLinkUrl('https://t.me/' + username)
    .build();
  cell.setRichTextValue(rich);
  try {
    cell.setFontColor(typeof TGNL_LINK_GREEN !== 'undefined' ? TGNL_LINK_GREEN : '#34A853');
    cell.setFontLine('underline');
  } catch (_) {}
}
