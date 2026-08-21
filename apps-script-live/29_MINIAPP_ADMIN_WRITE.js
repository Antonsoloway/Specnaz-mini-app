/*
 * Royal CRM / Таблица ЧП
 * 29_MINIAPP_ADMIN_WRITE.js
 * v0.6.0-write.1
 *
 * Protected Mini App admin writes.
 *
 * Security / invariants:
 * - Telegram initData is validated by the existing MINIAPP_validateInitData_().
 * - requester must still be «В чате» in CRM;
 * - Telegram getChatMember is repeated immediately before every write;
 * - participant identity is immutable raw Telegram ID;
 * - team identity is name + game;
 * - only source/input fields are writable; formula/derived columns are never written;
 * - no delete operations in v0.6;
 * - requestId + journal protect against accidental duplicate submissions;
 * - expectedRevision prevents stale admin screens from overwriting newer edits;
 * - programmatic writes explicitly run role/team normalization because Apps Script
 *   onEdit triggers do not fire for setValue()/setValues().
 */

var MINIAPP_ADMIN_WRITE_VERSION = '0.6.0-write.1';
var MINIAPP_ADMIN_WRITE_ACTION = 'admin-write';
var MINIAPP_ADMIN_WRITE_JOURNAL_SHEET = 'Админ журнал';
var MINIAPP_ADMIN_WRITE_CACHE_PREFIX = 'miniapp:admin-write:v1:';
var MINIAPP_ADMIN_WRITE_CACHE_TTL = 600;
var MINIAPP_ADMIN_WRITE_JOURNAL_LIMIT = 100;
var MINIAPP_ADMIN_WRITE_ALLOWED_CHAT_STATES = ['В чате', 'Вышел'];
var MINIAPP_ADMIN_WRITE_TEAM_ROLES = ['Лидер', 'Помощник', 'Игрок'];
var MINIAPP_ADMIN_WRITE_SPECNAZ_ROLES = ['Спецназ РМ', 'Спецназ РК'];

/** Called from 12_MINI_APP_API.js before the normal auth/poll router. */
function MINIAPP_adminWriteMaybeHandle_(e) {
  var action = MINIAPP_adminWriteValue_(e && e.parameter && e.parameter.action);
  if (action !== MINIAPP_ADMIN_WRITE_ACTION) return null;

  var callback = typeof MINIAPP_callback_ === 'function'
    ? MINIAPP_callback_(e && e.parameter && e.parameter.callback)
    : '';
  if (!callback) {
    return MINIAPP_adminWriteJsonp_('__miniappInvalid', {
      ok: false,
      error: 'INVALID_CALLBACK',
      version: MINIAPP_ADMIN_WRITE_VERSION
    });
  }

  var result;
  try {
    result = MINIAPP_adminWriteExecute_(e);
  } catch (error) {
    console.error('MINIAPP admin write fatal', error && error.stack ? error.stack : error);
    result = {
      ok: false,
      error: 'ADMIN_WRITE_SERVER_ERROR',
      message: 'Не удалось сохранить изменение. Данные не нужно вводить повторно — сначала обновите админ-режим.',
      version: MINIAPP_ADMIN_WRITE_VERSION
    };
  }
  return MINIAPP_adminWriteJsonp_(callback, result);
}

function MINIAPP_adminWriteExecute_(e) {
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
  try {
    if (!lock.tryLock(20000)) {
      return MINIAPP_adminWriteError_('WRITE_BUSY', 'База занята другой операцией. Повторите через несколько секунд.');
    }

    // Persistent idempotency: survives CacheService expiry/restarts.
    var journalDuplicate = MINIAPP_adminWriteFindJournalRequest_(requestId);
    if (journalDuplicate) {
      var duplicateResult = {
        ok: true,
        duplicate: true,
        idempotency: 'JOURNAL',
        requestId: requestId,
        op: journalDuplicate.op || op,
        entityType: journalDuplicate.entityType || '',
        entityKey: journalDuplicate.entityKey || '',
        row: Number(journalDuplicate.row || 0),
        version: MINIAPP_ADMIN_WRITE_VERSION,
        message: 'Эта операция уже была сохранена ранее.'
      };
      MINIAPP_adminWriteCacheResult_(requestId, duplicateResult);
      return duplicateResult;
    }

    // Re-check Telegram admin status inside the transaction window.
    adminInfo = MINIAPP_getTelegramAdminInfo_(adminId);
    if (!adminInfo || !adminInfo.isAdmin) {
      return MINIAPP_adminWriteError_('ADMIN_REQUIRED', 'Права администратора больше не подтверждаются.');
    }

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var context = {
      ss: ss,
      adminId: adminId,
      adminUsername: MINIAPP_adminWriteUsername_(validated.user.username || profile.username || ''),
      requestId: requestId,
      op: op,
      payload: payload
    };

    if (typeof beginPublicDataMutation_ === 'function') {
      try { beginPublicDataMutation_('miniapp_admin_write:' + op + ':' + requestId); } catch (_) {}
    }

    var result;
    try {
      if (op === 'updateParticipant') result = MINIAPP_adminWriteUpdateParticipant_(context);
      else if (op === 'createParticipant') result = MINIAPP_adminWriteCreateParticipant_(context);
      else if (op === 'updateTeam') result = MINIAPP_adminWriteUpdateTeam_(context);
      else if (op === 'createTeam') result = MINIAPP_adminWriteCreateTeam_(context);
      else return MINIAPP_adminWriteError_('OPERATION_NOT_ALLOWED', 'Эта операция не разрешена в v0.6.');
    } finally {
      if (typeof finishPublicDataMutation_ === 'function') {
        try { finishPublicDataMutation_('miniapp_admin_write:' + op + ':' + requestId); } catch (_) {}
      }
    }

    if (!result || !result.ok) return result || MINIAPP_adminWriteError_('WRITE_FAILED', 'Изменение не сохранено.');

    // Cache success immediately so a network retry cannot repeat the mutation.
    MINIAPP_adminWriteCacheResult_(requestId, result);

    // Refresh private admin snapshot immediately. Failure here does NOT roll back
    // the already committed Sheets mutation; the existing 5-minute trigger is fallback.
    result.adminSnapshot = MINIAPP_adminWriteRefreshAdminSnapshot_();
    result.version = MINIAPP_ADMIN_WRITE_VERSION;
    MINIAPP_adminWriteCacheResult_(requestId, result);
    return result;
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function MINIAPP_adminWriteUpdateParticipant_(ctx) {
  var sheet = ctx.ss.getSheetByName(SHEET_BASE);
  var helper = ctx.ss.getSheetByName(typeof FINALROLE_HELPER_SHEET_ !== 'undefined' ? FINALROLE_HELPER_SHEET_ : 'Списки');
  if (!sheet) return MINIAPP_adminWriteError_('BASE_SHEET_MISSING', 'Не найдена база участников.');

  var telegramId = MINIAPP_adminWriteTelegramId_(ctx.payload && ctx.payload.telegramId);
  if (!telegramId) return MINIAPP_adminWriteError_('TELEGRAM_ID_INVALID', 'Некорректный Telegram ID.');
  var row = MINIAPP_adminWriteFindParticipantRow_(sheet, telegramId);
  if (!row) return MINIAPP_adminWriteError_('PARTICIPANT_NOT_FOUND', 'Участник не найден.');

  var before = MINIAPP_adminWriteParticipantRecord_(sheet, row);
  var currentRevision = MINIAPP_adminWriteParticipantRevision_(before);
  var expectedRevision = MINIAPP_adminWriteValue_(ctx.payload.expectedRevision);
  if (!expectedRevision || expectedRevision !== currentRevision) {
    return MINIAPP_adminWriteConflict_('PARTICIPANT_CHANGED', 'Карточка участника уже изменилась. Обновите данные и повторите.', currentRevision);
  }

  var changesResult = MINIAPP_adminWriteNormalizeParticipantInput_(ctx.ss, ctx.payload.changes || {}, false);
  if (!changesResult.ok) return changesResult;
  var changes = changesResult.value;

  if (Object.prototype.hasOwnProperty.call(changes, 'name')) sheet.getRange(row, COL_NAME).setValue(changes.name);
  if (Object.prototype.hasOwnProperty.call(changes, 'telegramName')) sheet.getRange(row, COL_TG_NAME).setValue(changes.telegramName);
  if (Object.prototype.hasOwnProperty.call(changes, 'username')) sheet.getRange(row, COL_TG_USERNAME).setValue(changes.username);
  if (Object.prototype.hasOwnProperty.call(changes, 'specnaz')) sheet.getRange(row, COL_SPECNAZ).setValue(changes.specnaz);
  if (Object.prototype.hasOwnProperty.call(changes, 'chatState')) sheet.getRange(row, COL_CHAT_STATE).setValue(changes.chatState);
  if (Object.prototype.hasOwnProperty.call(changes, 'memberships')) {
    MINIAPP_adminWriteSetMemberships_(sheet, helper, row, changes.memberships);
  }

  SpreadsheetApp.flush();
  MINIAPP_adminWriteRefreshParticipantLinks_(ctx.ss, changes);
  if (typeof markPublicSyncPending_ === 'function') markPublicSyncPending_('miniapp_admin_participant:' + telegramId);

  var after = MINIAPP_adminWriteParticipantRecord_(sheet, row);
  var result = {
    ok: true,
    requestId: ctx.requestId,
    op: ctx.op,
    entityType: 'participant',
    entityKey: telegramId,
    row: row,
    revision: MINIAPP_adminWriteParticipantRevision_(after),
    message: 'Участник обновлён.'
  };
  MINIAPP_adminWriteAppendJournal_(ctx, 'participant', telegramId, row, before, after, changes);
  return result;
}

function MINIAPP_adminWriteCreateParticipant_(ctx) {
  var sheet = ctx.ss.getSheetByName(SHEET_BASE);
  var helper = ctx.ss.getSheetByName(typeof FINALROLE_HELPER_SHEET_ !== 'undefined' ? FINALROLE_HELPER_SHEET_ : 'Списки');
  if (!sheet) return MINIAPP_adminWriteError_('BASE_SHEET_MISSING', 'Не найдена база участников.');

  var telegramId = MINIAPP_adminWriteTelegramId_(ctx.payload && ctx.payload.telegramId);
  if (!telegramId) return MINIAPP_adminWriteError_('TELEGRAM_ID_INVALID', 'Telegram ID должен содержать только цифры.');
  if (MINIAPP_adminWriteFindParticipantRow_(sheet, telegramId)) {
    return MINIAPP_adminWriteError_('TELEGRAM_ID_EXISTS', 'Участник с таким Telegram ID уже существует.');
  }

  var inputResult = MINIAPP_adminWriteNormalizeParticipantInput_(ctx.ss, ctx.payload && ctx.payload.changes || {}, true);
  if (!inputResult.ok) return inputResult;
  var value = inputResult.value;
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
  sheet.getRange(row, COL_DATE).setValue(new Date()).setNumberFormat('dd.MM.yyyy');
  sheet.getRange(row, COL_CHAT_STATE).setValue(value.chatState || 'В чате');
  MINIAPP_adminWriteSetMemberships_(sheet, helper, row, value.memberships || []);

  SpreadsheetApp.flush();
  MINIAPP_adminWriteRefreshParticipantLinks_(ctx.ss, { username: value.username, name: value.name, telegramName: value.telegramName });
  if (typeof markPublicSyncPending_ === 'function') markPublicSyncPending_('miniapp_admin_participant_create:' + telegramId);

  var after = MINIAPP_adminWriteParticipantRecord_(sheet, row);
  var result = {
    ok: true,
    requestId: ctx.requestId,
    op: ctx.op,
    entityType: 'participant',
    entityKey: telegramId,
    row: row,
    revision: MINIAPP_adminWriteParticipantRevision_(after),
    message: 'Участник добавлен.'
  };
  MINIAPP_adminWriteAppendJournal_(ctx, 'participant', telegramId, row, before, after, value);
  return result;
}

function MINIAPP_adminWriteUpdateTeam_(ctx) {
  var sheet = ctx.ss.getSheetByName(SHEET_TEAMS);
  if (!sheet) return MINIAPP_adminWriteError_('TEAMS_SHEET_MISSING', 'Не найден лист команд.');

  var originalName = MINIAPP_adminWriteText_(ctx.payload && ctx.payload.name, 180);
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
    ? MINIAPP_adminWriteText_(changes.name, 180) : originalName;
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
  if (nextLeader !== before.leader) sheet.getRange(row, 4).setValue(nextLeader);

  if (typeof finalRoleRepairDecoratedTeamMemberships_ === 'function') {
    finalRoleRepairDecoratedTeamMemberships_(ctx.ss, { skipMark: true, source: 'miniapp_admin_write' });
  }
  if (typeof finalRoleNormalizeTeamsOrder_ === 'function') finalRoleNormalizeTeamsOrder_(sheet);
  SpreadsheetApp.flush();
  if (typeof markPublicSyncPending_ === 'function') markPublicSyncPending_('miniapp_admin_team:' + game + ':' + nextName);

  // Row may move during game grouping; resolve again by identity.
  var finalRow = MINIAPP_adminWriteFindTeamRow_(sheet, nextName, game) || row;
  var after = MINIAPP_adminWriteTeamRecord_(sheet, finalRow);
  var key = game + ' :: ' + nextName;
  var result = {
    ok: true,
    requestId: ctx.requestId,
    op: ctx.op,
    entityType: 'team',
    entityKey: key,
    row: finalRow,
    revision: MINIAPP_adminWriteTeamRevision_(after),
    message: 'Команда обновлена.'
  };
  MINIAPP_adminWriteAppendJournal_(ctx, 'team', key, finalRow, before, after, { name: nextName, leader: nextLeader });
  return result;
}

function MINIAPP_adminWriteCreateTeam_(ctx) {
  var sheet = ctx.ss.getSheetByName(SHEET_TEAMS);
  if (!sheet) return MINIAPP_adminWriteError_('TEAMS_SHEET_MISSING', 'Не найден лист команд.');

  var game = MINIAPP_adminWriteCanonicalGame_(ctx.payload && ctx.payload.game);
  var name = MINIAPP_adminWriteText_(ctx.payload && ctx.payload.name, 180);
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
  if (leader) sheet.getRange(row, 4).setValue(leader);

  if (typeof finalRoleNormalizeTeamsOrder_ === 'function') finalRoleNormalizeTeamsOrder_(sheet);
  SpreadsheetApp.flush();
  if (typeof markPublicSyncPending_ === 'function') markPublicSyncPending_('miniapp_admin_team_create:' + game + ':' + name);

  var finalRow = MINIAPP_adminWriteFindTeamRow_(sheet, name, game) || row;
  var after = MINIAPP_adminWriteTeamRecord_(sheet, finalRow);
  var key = game + ' :: ' + name;
  var result = {
    ok: true,
    requestId: ctx.requestId,
    op: ctx.op,
    entityType: 'team',
    entityKey: key,
    row: finalRow,
    revision: MINIAPP_adminWriteTeamRevision_(after),
    message: 'Команда добавлена.'
  };
  MINIAPP_adminWriteAppendJournal_(ctx, 'team', key, finalRow, before, after, { game: game, name: name, leader: leader });
  return result;
}

function MINIAPP_adminWriteNormalizeParticipantInput_(ss, raw, creating) {
  raw = raw && typeof raw === 'object' ? raw : {};
  var out = {};

  if (creating || Object.prototype.hasOwnProperty.call(raw, 'name')) out.name = MINIAPP_adminWriteText_(raw.name, 160);
  if (creating || Object.prototype.hasOwnProperty.call(raw, 'telegramName')) out.telegramName = MINIAPP_adminWriteText_(raw.telegramName, 180);
  if (creating || Object.prototype.hasOwnProperty.call(raw, 'username')) {
    var username = MINIAPP_adminWriteUsername_(raw.username);
    if (username === null) return MINIAPP_adminWriteError_('USERNAME_INVALID', 'Telegram username должен быть вида @username.');
    out.username = username || '';
  }
  if (creating || Object.prototype.hasOwnProperty.call(raw, 'specnaz')) {
    var score = Number(raw.specnaz == null || raw.specnaz === '' ? 0 : raw.specnaz);
    if (!isFinite(score) || score < 0 || score > 99999 || Math.floor(score) !== score) {
      return MINIAPP_adminWriteError_('SPECNAZ_INVALID', 'Походы спецназа должны быть целым числом от 0 до 99999.');
    }
    out.specnaz = score;
  }
  if (creating || Object.prototype.hasOwnProperty.call(raw, 'chatState')) {
    var state = MINIAPP_adminWriteValue_(raw.chatState) || 'В чате';
    if (MINIAPP_ADMIN_WRITE_ALLOWED_CHAT_STATES.indexOf(state) === -1) {
      return MINIAPP_adminWriteError_('CHAT_STATE_INVALID', 'Допустимо только «В чате» или «Вышел».');
    }
    out.chatState = state;
  }
  if (creating || Object.prototype.hasOwnProperty.call(raw, 'memberships')) {
    var membershipResult = MINIAPP_adminWriteNormalizeMemberships_(ss, raw.memberships || []);
    if (!membershipResult.ok) return membershipResult;
    out.memberships = membershipResult.value;
  }
  return { ok: true, value: out };
}

function MINIAPP_adminWriteNormalizeMemberships_(ss, rawList) {
  var list = Array.isArray(rawList) ? rawList : [];
  var bySlot = {};
  list.forEach(function(item) {
    var slot = Number(item && item.slot || 0);
    if (slot >= 1 && slot <= 5) bySlot[slot] = item || {};
  });

  var out = [];
  for (var slot = 1; slot <= 5; slot++) {
    var raw = bySlot[slot] || {};
    var team = MINIAPP_adminWriteText_(raw.team, 180);
    var nickname = MINIAPP_adminWriteText_(raw.nickname, 160);
    var role = MINIAPP_adminWriteValue_(raw.role);
    var game = MINIAPP_adminWriteCanonicalGame_(raw.game);

    if (team) {
      if (!game) return MINIAPP_adminWriteError_('MEMBERSHIP_GAME_REQUIRED', 'Для команды в слоте ' + slot + ' нужно выбрать игру.');
      var teamSheet = ss.getSheetByName(SHEET_TEAMS);
      if (!teamSheet || !MINIAPP_adminWriteFindTeamRow_(teamSheet, team, game)) {
        return MINIAPP_adminWriteError_('MEMBERSHIP_TEAM_NOT_FOUND', 'Команда «' + team + '» не найдена в ' + game + '.');
      }
      if (MINIAPP_ADMIN_WRITE_TEAM_ROLES.indexOf(role) === -1) role = 'Игрок';
    } else {
      game = '';
      if (role && MINIAPP_ADMIN_WRITE_SPECNAZ_ROLES.indexOf(role) === -1) role = '';
    }

    out.push({ slot: slot, team: team, nickname: nickname, role: role, game: game });
  }
  return { ok: true, value: out };
}

function MINIAPP_adminWriteSetMemberships_(sheet, helper, row, memberships) {
  var bySlot = {};
  (memberships || []).forEach(function(item) { bySlot[Number(item.slot || 0)] = item; });

  // ROLE_VALIDATION_ATOMIC_MEMBERSHIP_V0600
  // Role validation depends on the team in the same slot. Writing team, nick
  // and role cell-by-cell can therefore leave a half-written membership: the
  // old role rule may reject «Игрок» before helper formulas recalculate. Write
  // all 15 source cells as one range after temporarily removing only the five
  // role rules, then rebuild those rules. Any failure restores both values and
  // validations before the error escapes, so a retry can never observe a
  // partially changed participant.
  var firstCol = SLOT_DEFS.reduce(function(min, slot) {
    return Math.min(min, slot.teamCol, slot.nickCol, slot.roleCol);
  }, 9999);
  var lastCol = SLOT_DEFS.reduce(function(max, slot) {
    return Math.max(max, slot.teamCol, slot.nickCol, slot.roleCol);
  }, 0);
  var membershipRange = sheet.getRange(row, firstCol, 1, lastCol - firstCol + 1);
  var beforeValues = membershipRange.getValues();
  var nextValues = [beforeValues[0].slice()];
  var roleCells = [];
  var beforeRoleRules = [];
  var canRebuildRules = !!(
    helper &&
    typeof finalRoleNormalizeRowSlot_ === 'function' &&
    typeof FINALROLE_SLOTS_ !== 'undefined'
  );

  SLOT_DEFS.forEach(function(slot) {
    var item = bySlot[slot.number] || { team: '', nickname: '', role: '', game: '' };
    var teamValue = '';
    if (item.team) teamValue = item.team + ' — ' + (item.game === 'Royal Kingdom' ? 'РК' : 'РМ');

    nextValues[0][slot.teamCol - firstCol] = teamValue;
    nextValues[0][slot.nickCol - firstCol] = item.nickname || '';
    nextValues[0][slot.roleCol - firstCol] = item.role || '';

    var roleCell = sheet.getRange(row, slot.roleCol);
    roleCells.push(roleCell);
    beforeRoleRules.push(roleCell.getDataValidation());
  });

  function restoreRoleRules_() {
    roleCells.forEach(function(cell, index) {
      cell.clearDataValidations();
      if (beforeRoleRules[index]) cell.setDataValidation(beforeRoleRules[index]);
    });
  }

  try {
    roleCells.forEach(function(cell) { cell.clearDataValidations(); });
    membershipRange.setValues(nextValues);
    SpreadsheetApp.flush();

    if (canRebuildRules) {
      SLOT_DEFS.forEach(function(slot) {
      var finalSlot = FINALROLE_SLOTS_.filter(function(s) { return Number(s.number) === Number(slot.number); })[0];
      if (finalSlot) finalRoleNormalizeRowSlot_(sheet, helper, row, finalSlot);
      });
    } else {
      restoreRoleRules_();
    }
    SpreadsheetApp.flush();
  } catch (error) {
    try {
      roleCells.forEach(function(cell) { cell.clearDataValidations(); });
      membershipRange.setValues(beforeValues);
      SpreadsheetApp.flush();
      restoreRoleRules_();
      SpreadsheetApp.flush();
    } catch (rollbackError) {
      console.error('MINIAPP membership rollback failed', rollbackError && rollbackError.stack ? rollbackError.stack : rollbackError);
    }
    throw error;
  }
}

function MINIAPP_adminWriteParticipantRecord_(sheet, row) {
  var values = sheet.getRange(row, 1, 1, Math.max(COL_CHAT_STATE, 32)).getDisplayValues()[0];
  var memberships = [];
  SLOT_DEFS.forEach(function(slot) {
    var teamRaw = MINIAPP_adminWriteValue_(values[slot.teamCol - 1]);
    var team = typeof MINIAPP_snapshotStripGameSuffix_ === 'function'
      ? MINIAPP_snapshotStripGameSuffix_(teamRaw)
      : teamRaw.replace(/\s+—\s+(РМ|РК)$/u, '');
    var gameRaw = MINIAPP_adminWriteValue_(values[slot.gameCol - 1]);
    var game = typeof MINIAPP_snapshotCanonicalGame_ === 'function'
      ? MINIAPP_snapshotCanonicalGame_(gameRaw, teamRaw)
      : MINIAPP_adminWriteCanonicalGame_(gameRaw);
    var nickname = MINIAPP_adminWriteValue_(values[slot.nickCol - 1]);
    var role = MINIAPP_adminWriteValue_(values[slot.roleCol - 1]);
    if (!team && !nickname && !role && !game) return;
    memberships.push({ slot: Number(slot.number), team: team, teamRaw: teamRaw, nickname: nickname, role: role, game: game });
  });
  return {
    row: row,
    telegramId: MINIAPP_adminWriteTelegramId_(values[COL_TG_ID - 1]),
    name: MINIAPP_adminWriteValue_(values[COL_NAME - 1]),
    telegramName: MINIAPP_adminWriteValue_(values[COL_TG_NAME - 1]),
    username: MINIAPP_adminWriteValue_(values[COL_TG_USERNAME - 1]),
    memberships: memberships,
    specnaz: MINIAPP_adminWriteNumberOrText_(values[COL_SPECNAZ - 1]),
    chatState: MINIAPP_adminWriteValue_(values[COL_CHAT_STATE - 1])
  };
}

function MINIAPP_adminWriteTeamRecord_(sheet, row) {
  var values = sheet.getRange(row, 1, 1, 12).getDisplayValues()[0];
  return {
    row: row,
    game: MINIAPP_adminWriteCanonicalGame_(values[0]),
    name: MINIAPP_adminWriteValue_(values[1]),
    leader: MINIAPP_adminWriteValue_(values[3])
  };
}

/** Adds concurrency revisions to 28_MINIAPP_ADMIN_DATA records. */
function MINIAPP_adminWriteDecorateRevisions_(participants, teams) {
  (participants || []).forEach(function(p) { p.revision = MINIAPP_adminWriteParticipantRevision_(p); });
  (teams || []).forEach(function(t) { t.revision = MINIAPP_adminWriteTeamRevision_(t); });
}

function MINIAPP_adminWriteParticipantRevision_(record) {
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
    chatState: MINIAPP_adminWriteValue_(record && record.chatState)
  }));
}

function MINIAPP_adminWriteTeamRevision_(record) {
  return MINIAPP_adminWriteSha256_(JSON.stringify({
    game: MINIAPP_adminWriteCanonicalGame_(record && record.game),
    name: MINIAPP_adminWriteValue_(record && record.name),
    leader: MINIAPP_adminWriteValue_(record && record.leader)
  }));
}

/** Metadata exposed only inside protected adminData. */
function MINIAPP_adminWriteAdminMeta_() {
  var endpoint = '';
  try { endpoint = String(ScriptApp.getService().getUrl() || '').trim(); } catch (_) {}
  return {
    enabled: !!endpoint,
    version: MINIAPP_ADMIN_WRITE_VERSION,
    endpoint: endpoint,
    operations: ['updateParticipant', 'createParticipant', 'updateTeam', 'createTeam'],
    deleteEnabled: false,
    participantIdentity: 'telegramId-immutable',
    teamIdentity: 'name+game',
    writableParticipantFields: ['name', 'telegramName', 'username', 'memberships', 'specnaz', 'chatState'],
    writableTeamFields: ['name', 'leader'],
    createTeamFields: ['game', 'name', 'leader']
  };
}

function MINIAPP_adminWriteJournalData_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(MINIAPP_ADMIN_WRITE_JOURNAL_SHEET);
  if (!sheet || sheet.getLastRow() < 2) {
    return { version: MINIAPP_ADMIN_WRITE_VERSION, rows: [] };
  }
  var last = sheet.getLastRow();
  var count = Math.min(MINIAPP_ADMIN_WRITE_JOURNAL_LIMIT, last - 1);
  var start = Math.max(2, last - count + 1);
  var values = sheet.getRange(start, 1, count, 12).getDisplayValues();
  var rows = values.map(function(r) {
    return {
      at: r[0], requestId: r[1], adminTelegramId: r[2], adminUsername: r[3],
      op: r[4], entityType: r[5], entityKey: r[6], row: r[7],
      changed: r[8], before: MINIAPP_adminWriteParseJsonText_(r[9]),
      after: MINIAPP_adminWriteParseJsonText_(r[10]), version: r[11]
    };
  }).reverse();
  return { version: MINIAPP_ADMIN_WRITE_VERSION, rows: rows };
}

function MINIAPP_adminWriteAppendJournal_(ctx, entityType, entityKey, row, before, after, changed) {
  var sheet = MINIAPP_adminWriteEnsureJournal_(ctx.ss);
  var now = new Date();
  sheet.appendRow([
    now,
    ctx.requestId,
    ctx.adminId,
    ctx.adminUsername || '',
    ctx.op,
    entityType,
    entityKey,
    Number(row || 0),
    JSON.stringify(changed || {}),
    JSON.stringify(before || {}),
    JSON.stringify(after || {}),
    MINIAPP_ADMIN_WRITE_VERSION
  ]);
  sheet.getRange(sheet.getLastRow(), 1).setNumberFormat('dd.MM.yyyy HH:mm:ss');
}

function MINIAPP_adminWriteEnsureJournal_(ss) {
  var sheet = ss.getSheetByName(MINIAPP_ADMIN_WRITE_JOURNAL_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(MINIAPP_ADMIN_WRITE_JOURNAL_SHEET);
    sheet.getRange(1, 1, 1, 12).setValues([[
      'Дата/время', 'Request ID', 'Telegram ID админа', '@username админа',
      'Операция', 'Сущность', 'Ключ', 'Строка', 'Изменённые поля',
      'До', 'После', 'Версия'
    ]]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    try { sheet.hideSheet(); } catch (_) {}
  }
  return sheet;
}

function MINIAPP_adminWriteFindJournalRequest_(requestId) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(MINIAPP_ADMIN_WRITE_JOURNAL_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return null;
  var last = sheet.getLastRow();
  var start = Math.max(2, last - 499);
  var count = last - start + 1;
  var values = sheet.getRange(start, 2, count, 7).getDisplayValues(); // B:H
  for (var i = values.length - 1; i >= 0; i--) {
    if (MINIAPP_adminWriteValue_(values[i][0]) !== requestId) continue;
    return {
      op: values[i][3],
      entityType: values[i][4],
      entityKey: values[i][5],
      row: values[i][6]
    };
  }
  return null;
}

function MINIAPP_adminWriteFindParticipantRow_(sheet, telegramId) {
  var last = Math.min(Math.max(sheet.getLastRow(), BASE_FIRST_ROW), BASE_LAST_ROW);
  if (last < BASE_FIRST_ROW) return 0;
  var found = sheet.getRange(BASE_FIRST_ROW, COL_TG_ID, last - BASE_FIRST_ROW + 1, 1)
    .createTextFinder(String(telegramId)).matchEntireCell(true).findNext();
  return found ? found.getRow() : 0;
}

function MINIAPP_adminWriteFindEmptyParticipantRow_(sheet) {
  var count = BASE_LAST_ROW - BASE_FIRST_ROW + 1;
  var rows = sheet.getRange(BASE_FIRST_ROW, 1, count, COL_CHAT_STATE).getDisplayValues();
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var identityEmpty = !MINIAPP_adminWriteValue_(row[0]) && !MINIAPP_adminWriteValue_(row[1]) &&
      !MINIAPP_adminWriteValue_(row[2]) && !MINIAPP_adminWriteValue_(row[3]);
    var membershipsEmpty = true;
    SLOT_DEFS.forEach(function(slot) {
      if (MINIAPP_adminWriteValue_(row[slot.teamCol - 1]) ||
          MINIAPP_adminWriteValue_(row[slot.nickCol - 1]) ||
          MINIAPP_adminWriteValue_(row[slot.roleCol - 1])) membershipsEmpty = false;
    });
    var stateEmpty = !MINIAPP_adminWriteValue_(row[COL_CHAT_STATE - 1]);
    if (identityEmpty && membershipsEmpty && stateEmpty) return BASE_FIRST_ROW + i;
  }
  return 0;
}

function MINIAPP_adminWriteFindTeamRow_(sheet, name, game) {
  var cleanName = MINIAPP_adminWriteNormTeam_(name);
  var cleanGame = MINIAPP_adminWriteCanonicalGame_(game);
  if (!cleanName || !cleanGame) return 0;
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var rows = sheet.getRange(2, 1, last - 1, 2).getDisplayValues();
  for (var i = 0; i < rows.length; i++) {
    if (MINIAPP_adminWriteCanonicalGame_(rows[i][0]) !== cleanGame) continue;
    if (MINIAPP_adminWriteNormTeam_(rows[i][1]) === cleanName) return i + 2;
  }
  return 0;
}

function MINIAPP_adminWriteFindEmptyTeamRow_(sheet) {
  var maxRows = sheet.getMaxRows();
  var rows = sheet.getRange(2, 1, Math.max(1, maxRows - 1), 2).getDisplayValues();
  for (var i = 0; i < rows.length; i++) {
    if (!MINIAPP_adminWriteValue_(rows[i][0]) && !MINIAPP_adminWriteValue_(rows[i][1])) return i + 2;
  }
  return 0;
}

function MINIAPP_adminWriteRefreshParticipantLinks_(ss, changes) {
  if (!changes || (!Object.prototype.hasOwnProperty.call(changes, 'username') &&
      !Object.prototype.hasOwnProperty.call(changes, 'name') &&
      !Object.prototype.hasOwnProperty.call(changes, 'telegramName'))) return;
  try {
    if (typeof TGNL_buildDirectory_ === 'function' && typeof TGNL_refreshAdminOnly_ === 'function') {
      TGNL_refreshAdminOnly_(TGNL_buildDirectory_());
    }
  } catch (error) {
    console.warn('Admin participant links refresh warning: ' + error);
  }
}

function MINIAPP_adminWriteRefreshAdminSnapshot_() {
  try {
    if (typeof MINIAPP_queueAdminSnapshotRefresh_ === 'function') {
      return MINIAPP_queueAdminSnapshotRefresh_('admin-write-commit');
    }
    if (typeof MINIAPP_exportAdminSnapshotUnlocked_ !== 'function') {
      return { ok: false, skipped: true, reason: 'EXPORTER_MISSING' };
    }
    // Compatibility fallback for a partial rollout only. The vetted installer
    // always deploys file 28 together with this module, so production writes use
    // the commit-first queue above and never wait for GitHub here.
    var props = PropertiesService.getScriptProperties();
    return MINIAPP_exportAdminSnapshotUnlocked_(
      props,
      String(props.getProperty('DATA_GITHUB_REPO') || '').trim(),
      String(props.getProperty('DATA_GITHUB_TOKEN') || '').trim(),
      String(props.getProperty('DATA_GITHUB_BRANCH') || 'main').trim()
    );
  } catch (error) {
    return { ok: false, error: String(error && error.message ? error.message : error) };
  }
}

function MINIAPP_adminWriteCacheResult_(requestId, result) {
  try {
    CacheService.getScriptCache().put(
      MINIAPP_ADMIN_WRITE_CACHE_PREFIX + requestId,
      JSON.stringify(result || {}),
      MINIAPP_ADMIN_WRITE_CACHE_TTL
    );
  } catch (_) {}
}

function MINIAPP_adminWriteDecodePayload_(encoded) {
  if (!encoded) return {};
  var bytes = Utilities.base64DecodeWebSafe(String(encoded));
  var text = Utilities.newBlob(bytes).getDataAsString('UTF-8');
  var value = JSON.parse(text || '{}');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('payload object required');
  return value;
}

function MINIAPP_adminWriteRequestId_(value) {
  var text = MINIAPP_adminWriteValue_(value);
  return /^[A-Za-z0-9_-]{20,100}$/.test(text) ? text : '';
}

function MINIAPP_adminWriteTelegramId_(value) {
  var text = MINIAPP_adminWriteValue_(value).replace(/^'/, '').replace(/\.0$/, '');
  return /^\d{5,20}$/.test(text) ? text : '';
}

function MINIAPP_adminWriteUsername_(value) {
  var text = MINIAPP_adminWriteValue_(value);
  if (!text) return '';
  if (text.charAt(0) !== '@') text = '@' + text;
  return /^@[A-Za-z0-9_]{5,32}$/.test(text) ? text : null;
}

function MINIAPP_adminWriteCanonicalGame_(value) {
  var text = MINIAPP_adminWriteValue_(value);
  var low = text.toLocaleLowerCase('ru-RU');
  if (low === 'рм' || low.indexOf('royal match') >= 0) return 'Royal Match';
  if (low === 'рк' || low.indexOf('royal kingdom') >= 0) return 'Royal Kingdom';
  return '';
}

function MINIAPP_adminWriteNormTeam_(value) {
  var text = MINIAPP_adminWriteValue_(value).replace(/\s+—\s+(РМ|РК)$/u, '');
  try { text = text.normalize('NFKC'); } catch (_) {}
  return text.replace(/\s+/g, ' ').trim().toLocaleLowerCase('ru-RU');
}

function MINIAPP_adminWriteText_(value, maxLength) {
  var text = MINIAPP_adminWriteValue_(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  if (maxLength && text.length > maxLength) text = text.slice(0, maxLength);
  return text;
}

function MINIAPP_adminWriteNumberOrText_(value) {
  var text = MINIAPP_adminWriteValue_(value);
  if (!text) return '';
  var normalized = text.replace(/\s+/g, '').replace(',', '.');
  if (/^-?\d+(?:\.\d+)?$/.test(normalized)) {
    var n = Number(normalized);
    if (isFinite(n)) return n;
  }
  return text;
}

function MINIAPP_adminWriteSha256_(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text || ''), Utilities.Charset.UTF_8);
  return bytes.map(function(b) {
    var n = b < 0 ? b + 256 : b;
    return ('0' + n.toString(16)).slice(-2);
  }).join('');
}

function MINIAPP_adminWriteParseJsonText_(text) {
  try { return JSON.parse(String(text || '{}')); } catch (_) { return String(text || ''); }
}

function MINIAPP_adminWriteValue_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function MINIAPP_adminWriteError_(code, message) {
  return { ok: false, error: code, message: message, version: MINIAPP_ADMIN_WRITE_VERSION };
}

function MINIAPP_adminWriteConflict_(code, message, currentRevision) {
  return {
    ok: false,
    error: code,
    conflict: true,
    currentRevision: currentRevision || '',
    message: message,
    version: MINIAPP_ADMIN_WRITE_VERSION
  };
}

function MINIAPP_adminWriteJsonp_(callback, data) {
  return ContentService
    .createTextOutput(callback + '(' + JSON.stringify(data) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
