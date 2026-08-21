/*
 * Royal CRM / Таблица ЧП
 * 31_MINIAPP_ADMIN_WRITE_HARDENED.js
 * v0.6.0-write.3
 *
 * Mutation helpers used ONLY behind 30_MINIAPP_ADMIN_WRITE_BACKEND.js.
 * Shared validation/lookup helpers stay in 29_MINIAPP_ADMIN_WRITE.js.
 *
 * Preserved Google Sheets invariants:
 * - raw Telegram ID is immutable participant identity;
 * - existing team game is immutable; team identity = name + game;
 * - U/AB/AC/AD edits run the same counter snapshot path as manual Sheets edits;
 * - U increase records the same manual specnaz history;
 * - AF change runs stable В чате/Вышел sorting and then re-resolves the row by ID;
 * - five memberships use the existing final-role validators;
 * - team rename cascades all five membership slots by old name + same game;
 * - formula/derived columns remain read-only;
 * - every successful mutation is journalled before returning;
 * - no delete operations.
 */

var MINIAPP_ADMIN_WRITE_HARDENED_VERSION = '0.6.0-write.3';
var MINIAPP_ADMIN_WRITE_ENDPOINT_PROPERTY = 'MINIAPP_ADMIN_WRITE_ENDPOINT';
// Replaced by the rollout installer with the exact existing deployment URL.
// The placeholder is intentionally invalid and therefore never enables writes.
var MINIAPP_ADMIN_WRITE_PINNED_ENDPOINT = "https://script.google.com/macros/s/AKfycbwmFpY8BPmxcQhBwwk0v2oXLUc9PukMbostm9o44X9RKf0WyST80V_vDtJXRFV3DZ8LUg/exec";

/**
 * ScriptApp.getService().getUrl() is not a stable deployment selector when a
 * project has more than one versioned deployment. A time-driven snapshot can
 * otherwise advertise an older /exec URL even though the installer updated
 * the named production deployment. The installer pins that exact URL in the
 * deployed source. Script Properties remain a compatible override, but writes
 * do not depend on Google storage being available during rollout.
 */
function MINIAPP_adminWriteSafeEndpoint_(value) {
  var endpoint = String(value || '').trim();
  return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/.test(endpoint)
    ? endpoint
    : '';
}

function MINIAPP_adminWriteResolvedEndpoint_() {
  var configured = '';
  try {
    configured = PropertiesService.getScriptProperties()
      .getProperty(MINIAPP_ADMIN_WRITE_ENDPOINT_PROPERTY);
  } catch (_) {}
  configured = MINIAPP_adminWriteSafeEndpoint_(configured);
  if (configured) {
    return { endpoint: configured, source: 'script-property', pinned: true };
  }

  var deployed = MINIAPP_adminWriteSafeEndpoint_(MINIAPP_ADMIN_WRITE_PINNED_ENDPOINT);
  if (deployed) {
    return { endpoint: deployed, source: 'deployment-constant', pinned: true };
  }

  var serviceUrl = '';
  try { serviceUrl = ScriptApp.getService().getUrl(); } catch (_) {}
  serviceUrl = MINIAPP_adminWriteSafeEndpoint_(serviceUrl);
  return {
    endpoint: serviceUrl,
    source: serviceUrl ? 'script-service-fallback' : 'missing',
    pinned: false
  };
}

/**
 * Called only by the authenticated Cloud Shell rollout via `clasp run`.
 * Anonymous web-app traffic cannot invoke Apps Script functions by name.
 */
function MINIAPP_setAdminWriteEndpoint(webAppUrl) {
  var endpoint = MINIAPP_adminWriteSafeEndpoint_(webAppUrl);
  if (!endpoint) throw new Error('ADMIN_WRITE_ENDPOINT_INVALID');
  PropertiesService.getScriptProperties().setProperty(
    MINIAPP_ADMIN_WRITE_ENDPOINT_PROPERTY,
    endpoint
  );
  return {
    ok: true,
    endpoint: endpoint,
    endpointPinned: true,
    endpointSource: 'script-property'
  };
}

function MINIAPP_adminWriteHardenedDispatch_(ctx) {
  if (!ctx || !ctx.op) return MINIAPP_adminWriteError_('OPERATION_MISSING', 'Не указана операция.');
  if (ctx.op === 'updateParticipant') return MINIAPP_adminWriteHardenedUpdateParticipant_(ctx);
  if (ctx.op === 'createParticipant') return MINIAPP_adminWriteHardenedCreateParticipant_(ctx);
  if (ctx.op === 'updateTeam') return MINIAPP_adminWriteHardenedUpdateTeam_(ctx);
  if (ctx.op === 'createTeam') return MINIAPP_adminWriteHardenedCreateTeam_(ctx);
  return MINIAPP_adminWriteError_('OPERATION_NOT_ALLOWED', 'Эта операция не разрешена в v0.6.');
}

function MINIAPP_adminWriteHardenedUpdateParticipant_(ctx) {
  var sheet = ctx.ss.getSheetByName(SHEET_BASE);
  var helper = ctx.ss.getSheetByName(typeof FINALROLE_HELPER_SHEET_ !== 'undefined' ? FINALROLE_HELPER_SHEET_ : 'Списки');
  if (!sheet) return MINIAPP_adminWriteError_('BASE_SHEET_MISSING', 'Не найдена база участников.');

  var telegramId = MINIAPP_adminWriteTelegramId_(ctx.payload && ctx.payload.telegramId);
  if (!telegramId) return MINIAPP_adminWriteError_('TELEGRAM_ID_INVALID', 'Некорректный Telegram ID.');
  var row = MINIAPP_adminWriteFindParticipantRow_(sheet, telegramId);
  if (!row) return MINIAPP_adminWriteError_('PARTICIPANT_NOT_FOUND', 'Участник не найден.');

  var before = MINIAPP_adminWriteHardenedParticipantRecord_(sheet, row);
  var currentRevision = MINIAPP_adminWriteHardenedParticipantRevision_(before);
  var expectedRevision = MINIAPP_adminWriteValue_(ctx.payload.expectedRevision);
  if (!expectedRevision || expectedRevision !== currentRevision) {
    return MINIAPP_adminWriteConflict_('PARTICIPANT_CHANGED', 'Карточка участника уже изменилась. Обновите данные и повторите.', currentRevision);
  }

  // PARTICIPANT_BOT_FIELDS_READ_ONLY_V0600
  // Existing participant: admins may manually change only CRM name and the
  // five membership slots (team / role / in-game nickname). Telegram identity,
  // Telegram profile fields, counters, date and chat state are bot/system-owned.
  var requestedChanges = ctx.payload && ctx.payload.changes || {};
  var allowedManualFields = { name: true, memberships: true };
  var forbiddenManualFields = Object.keys(requestedChanges).filter(function(key) {
    return !allowedManualFields[key];
  });
  if (forbiddenManualFields.length) {
    return MINIAPP_adminWriteError_(
      'PARTICIPANT_FIELD_READ_ONLY',
      'Telegram-данные, статус, дата и счётчики участника заполняются ботом и недоступны для ручного изменения.'
    );
  }

  var normalized = MINIAPP_adminWriteHardenedNormalizeParticipantInput_(ctx.ss, requestedChanges, false);
  if (!normalized.ok) return normalized;
  var changes = normalized.value;
  var identityChanged = false;
  var countersChanged = false;
  var chatStateChanged = false;

  if (Object.prototype.hasOwnProperty.call(changes, 'name') && changes.name !== before.name) {
    sheet.getRange(row, COL_NAME).setValue(changes.name);
    identityChanged = true;
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'telegramName') && changes.telegramName !== before.telegramName) {
    sheet.getRange(row, COL_TG_NAME).setValue(changes.telegramName);
    identityChanged = true;
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'username') && changes.username !== before.username) {
    sheet.getRange(row, COL_TG_USERNAME).setValue(changes.username);
    identityChanged = true;
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'memberships')) {
    MINIAPP_adminWriteSetMemberships_(sheet, helper, row, changes.memberships);
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'specnaz') && Number(changes.specnaz) !== Number(before.specnaz || 0)) {
    sheet.getRange(row, COL_SPECNAZ).setValue(changes.specnaz);
    countersChanged = true;
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'date')) {
    var beforeDate = MINIAPP_adminWriteHardenedDateKey_(before.date);
    var nextDate = MINIAPP_adminWriteHardenedDateKey_(changes.date);
    if (nextDate && nextDate !== beforeDate) {
      sheet.getRange(row, COL_DATE).setValue(changes.date).setNumberFormat('dd.MM.yyyy');
    }
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'screens') && Number(changes.screens) !== Number(before.screens || 0)) {
    sheet.getRange(row, COL_SCREENS).setValue(changes.screens);
    countersChanged = true;
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'activityBase') && Number(changes.activityBase) !== Number(before.activityBase || 0)) {
    sheet.getRange(row, COL_ACTIVITY_BASE).setValue(changes.activityBase);
    countersChanged = true;
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'activityOutside') && Number(changes.activityOutside) !== Number(before.activityOutside || 0)) {
    sheet.getRange(row, COL_ACTIVITY_OUTSIDE).setValue(changes.activityOutside);
    countersChanged = true;
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'chatState') && changes.chatState !== before.chatState) {
    sheet.getRange(row, COL_CHAT_STATE).setValue(changes.chatState);
    chatStateChanged = true;
  }

  SpreadsheetApp.flush();

  // Programmatic setValue does NOT fire onEdit. Explicitly run the same counter
  // snapshot/history path used by a manual edit in the Sheet.
  if (countersChanged && typeof processManualCounterEdits_ === 'function') {
    var counterRange = sheet.getRange(row, COL_SPECNAZ, 1, COL_ACTIVITY_OUTSIDE - COL_SPECNAZ + 1);
    processManualCounterEdits_(
      ctx.ss, sheet, row, row, COL_SPECNAZ, COL_ACTIVITY_OUTSIDE,
      { range: counterRange }
    );
  }

  // AF edits normally trigger stable grouping. After sorting the old row number is
  // invalid, so resolve again using immutable Telegram ID.
  if (chatStateChanged && typeof sortBaseByChatState_ === 'function') {
    sortBaseByChatState_(ctx.ss);
    row = MINIAPP_adminWriteFindParticipantRow_(sheet, telegramId) || row;
  }

  SpreadsheetApp.flush();
  if (identityChanged) MINIAPP_adminWriteRefreshParticipantLinks_(ctx.ss, changes);
  if (typeof markPublicSyncPending_ === 'function') {
    markPublicSyncPending_('miniapp_admin_participant_hardened:' + telegramId);
  }

  var after = MINIAPP_adminWriteHardenedParticipantRecord_(sheet, row);
  MINIAPP_adminWriteHardenedAppendJournal_(ctx, 'participant', telegramId, row, before, after, changes);
  var revision = MINIAPP_adminWriteHardenedParticipantRevision_(after);
  after.revision = revision;

  return {
    ok: true,
    requestId: ctx.requestId,
    op: ctx.op,
    entityType: 'participant',
    entityKey: telegramId,
    row: row,
    revision: revision,
    record: after,
    message: 'Участник обновлён.'
  };
}

function MINIAPP_adminWriteHardenedCreateParticipant_(ctx) {
  var sheet = ctx.ss.getSheetByName(SHEET_BASE);
  var helper = ctx.ss.getSheetByName(typeof FINALROLE_HELPER_SHEET_ !== 'undefined' ? FINALROLE_HELPER_SHEET_ : 'Списки');
  if (!sheet) return MINIAPP_adminWriteError_('BASE_SHEET_MISSING', 'Не найдена база участников.');

  var telegramId = MINIAPP_adminWriteTelegramId_(ctx.payload && ctx.payload.telegramId);
  if (!telegramId) return MINIAPP_adminWriteError_('TELEGRAM_ID_INVALID', 'Telegram ID должен содержать только цифры.');
  if (MINIAPP_adminWriteFindParticipantRow_(sheet, telegramId)) {
    return MINIAPP_adminWriteError_('TELEGRAM_ID_EXISTS', 'Участник с таким Telegram ID уже существует.');
  }

  var normalized = MINIAPP_adminWriteHardenedNormalizeParticipantInput_(ctx.ss, ctx.payload && ctx.payload.changes || {}, true);
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
    processManualCounterEdits_(
      ctx.ss, sheet, row, row, COL_SPECNAZ, COL_ACTIVITY_OUTSIDE,
      { range: counterRange }
    );
  }

  if (typeof sortBaseByChatState_ === 'function') {
    sortBaseByChatState_(ctx.ss);
    row = MINIAPP_adminWriteFindParticipantRow_(sheet, telegramId) || row;
  }

  SpreadsheetApp.flush();
  MINIAPP_adminWriteRefreshParticipantLinks_(ctx.ss, value);
  if (typeof markPublicSyncPending_ === 'function') {
    markPublicSyncPending_('miniapp_admin_participant_create_hardened:' + telegramId);
  }
  if (typeof queueTelegramAvatarRefresh_ === 'function') {
    try { queueTelegramAvatarRefresh_(telegramId, 'miniapp_admin_create'); } catch (_) {}
  }

  var after = MINIAPP_adminWriteHardenedParticipantRecord_(sheet, row);
  MINIAPP_adminWriteHardenedAppendJournal_(ctx, 'participant', telegramId, row, before, after, value);
  var revision = MINIAPP_adminWriteHardenedParticipantRevision_(after);
  after.revision = revision;

  return {
    ok: true,
    requestId: ctx.requestId,
    op: ctx.op,
    entityType: 'participant',
    entityKey: telegramId,
    row: row,
    revision: revision,
    record: after,
    message: 'Участник добавлен.'
  };
}

function MINIAPP_adminWriteHardenedUpdateTeam_(ctx) {
  var sheet = ctx.ss.getSheetByName(SHEET_TEAMS);
  if (!sheet) return MINIAPP_adminWriteError_('TEAMS_SHEET_MISSING', 'Не найден лист команд.');

  var originalName = MINIAPP_adminWriteHardenedTeamName_(ctx.payload && ctx.payload.name);
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
    ? MINIAPP_adminWriteHardenedTeamName_(changes.name) : originalName;
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
  if (nextLeader !== before.leader) {
    MINIAPP_adminWriteHardenedSetTeamLeader_(sheet, row, nextLeader);
  }

  if (typeof finalRoleRepairDecoratedTeamMemberships_ === 'function') {
    finalRoleRepairDecoratedTeamMemberships_(ctx.ss, { skipMark: true, source: 'miniapp_admin_write_hardened' });
  }
  if (typeof finalRoleNormalizeTeamsOrder_ === 'function') {
    finalRoleNormalizeTeamsOrder_(sheet);
  }
  SpreadsheetApp.flush();
  if (typeof markPublicSyncPending_ === 'function') {
    markPublicSyncPending_('miniapp_admin_team_hardened:' + game + ':' + nextName);
  }

  var finalRow = MINIAPP_adminWriteFindTeamRow_(sheet, nextName, game) || row;
  var after = MINIAPP_adminWriteTeamRecord_(sheet, finalRow);
  var key = game + ' :: ' + nextName;
  MINIAPP_adminWriteHardenedAppendJournal_(ctx, 'team', key, finalRow, before, after, {
    name: nextName,
    leader: nextLeader
  });

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

function MINIAPP_adminWriteHardenedCreateTeam_(ctx) {
  var sheet = ctx.ss.getSheetByName(SHEET_TEAMS);
  if (!sheet) return MINIAPP_adminWriteError_('TEAMS_SHEET_MISSING', 'Не найден лист команд.');

  var game = MINIAPP_adminWriteCanonicalGame_(ctx.payload && ctx.payload.game);
  var name = MINIAPP_adminWriteHardenedTeamName_(ctx.payload && ctx.payload.name);
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
  if (leader) MINIAPP_adminWriteHardenedSetTeamLeader_(sheet, row, leader);

  if (typeof finalRoleNormalizeTeamsOrder_ === 'function') {
    finalRoleNormalizeTeamsOrder_(sheet);
  }
  SpreadsheetApp.flush();
  if (typeof markPublicSyncPending_ === 'function') {
    markPublicSyncPending_('miniapp_admin_team_create_hardened:' + game + ':' + name);
  }

  var finalRow = MINIAPP_adminWriteFindTeamRow_(sheet, name, game) || row;
  var after = MINIAPP_adminWriteTeamRecord_(sheet, finalRow);
  var key = game + ' :: ' + name;
  MINIAPP_adminWriteHardenedAppendJournal_(ctx, 'team', key, finalRow, before, after, {
    game: game,
    name: name,
    leader: leader
  });

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

function MINIAPP_adminWriteHardenedNormalizeParticipantInput_(ss, raw, creating) {
  raw = raw && typeof raw === 'object' ? raw : {};
  var base = MINIAPP_adminWriteNormalizeParticipantInput_(ss, raw, creating);
  if (!base.ok) return base;
  var out = base.value || {};

  if (Object.prototype.hasOwnProperty.call(raw, 'date') && MINIAPP_adminWriteValue_(raw.date)) {
    var date = MINIAPP_adminWriteHardenedParseDate_(raw.date);
    if (!date) return MINIAPP_adminWriteError_('DATE_INVALID', 'Дата должна быть корректной календарной датой.');
    out.date = date;
  }

  var counterFields = ['screens', 'activityBase', 'activityOutside'];
  for (var i = 0; i < counterFields.length; i++) {
    var key = counterFields[i];
    if (!creating && !Object.prototype.hasOwnProperty.call(raw, key)) continue;
    var parsed = MINIAPP_adminWriteHardenedCounter_(raw[key], key);
    if (!parsed.ok) return parsed;
    out[key] = parsed.value;
  }
  return { ok: true, value: out };
}

function MINIAPP_adminWriteHardenedCounter_(value, field) {
  var number = Number(value == null || value === '' ? 0 : value);
  if (!isFinite(number) || number < 0 || number > 999999 || Math.floor(number) !== number) {
    return MINIAPP_adminWriteError_('COUNTER_INVALID', 'Поле ' + field + ' должно быть целым числом от 0 до 999999.');
  }
  return { ok: true, value: number };
}

function MINIAPP_adminWriteHardenedParseDate_(value) {
  var text = MINIAPP_adminWriteValue_(value);
  var year, month, day;
  var iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    year = Number(iso[1]); month = Number(iso[2]); day = Number(iso[3]);
  } else {
    var ru = text.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!ru) return null;
    year = Number(ru[3]); month = Number(ru[2]); day = Number(ru[1]);
  }
  var date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function MINIAPP_adminWriteHardenedDateKey_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone() || 'Europe/Moscow', 'yyyy-MM-dd');
  }
  var parsed = MINIAPP_adminWriteHardenedParseDate_(value);
  return parsed ? Utilities.formatDate(parsed, Session.getScriptTimeZone() || 'Europe/Moscow', 'yyyy-MM-dd') : '';
}

function MINIAPP_adminWriteHardenedParticipantRecord_(sheet, row) {
  var base = MINIAPP_adminWriteParticipantRecord_(sheet, row);
  var values = sheet.getRange(row, 1, 1, Math.max(COL_CHAT_STATE, 32)).getDisplayValues()[0];
  base.date = MINIAPP_adminWriteValue_(values[COL_DATE - 1]);
  base.screens = MINIAPP_adminWriteNumberOrText_(values[COL_SCREENS - 1]);
  base.activityBase = MINIAPP_adminWriteNumberOrText_(values[COL_ACTIVITY_BASE - 1]);
  base.activityOutside = MINIAPP_adminWriteNumberOrText_(values[COL_ACTIVITY_OUTSIDE - 1]);
  return base;
}

function MINIAPP_adminWriteHardenedParticipantRevision_(record) {
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
    date: MINIAPP_adminWriteHardenedDateKey_(record && record.date),
    screens: MINIAPP_adminWriteNumberOrText_(record && record.screens),
    activityBase: MINIAPP_adminWriteNumberOrText_(record && record.activityBase),
    activityOutside: MINIAPP_adminWriteNumberOrText_(record && record.activityOutside),
    chatState: MINIAPP_adminWriteValue_(record && record.chatState)
  }));
}

function MINIAPP_adminWriteHardenedDecorateRevisions_(participants, teams) {
  (participants || []).forEach(function(p) {
    p.revision = MINIAPP_adminWriteHardenedParticipantRevision_(p);
  });
  (teams || []).forEach(function(t) {
    t.revision = MINIAPP_adminWriteTeamRevision_(t);
  });
}

function MINIAPP_adminWriteHardenedMeta_() {
  var resolvedEndpoint = MINIAPP_adminWriteResolvedEndpoint_();
  var endpoint = resolvedEndpoint.endpoint;
  return {
    enabled: !!endpoint,
    version: MINIAPP_ADMIN_WRITE_HARDENED_VERSION,
    endpoint: endpoint,
    endpointPinned: resolvedEndpoint.pinned,
    endpointSource: resolvedEndpoint.source,
    operations: ['updateParticipant', 'createParticipant', 'updateTeam', 'createTeam'],
    deleteEnabled: false,
    transport: 'worker-signed-hmac',
    participantIdentity: 'telegramId-immutable',
    teamIdentity: 'name+game',
    writableParticipantFields: [
      'name', 'telegramName', 'username', 'memberships', 'specnaz', 'date',
      'screens', 'activityBase', 'activityOutside', 'chatState'
    ],
    writableTeamFields: ['name', 'leader'],
    createTeamFields: ['game', 'name', 'leader'],
    formulaFieldsProtected: ['status', 'membershipGames', 'lastChange', 'teamStats', 'teamStatus'],
    journal: true
  };
}

function MINIAPP_adminWriteHardenedJournalData_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(MINIAPP_ADMIN_WRITE_JOURNAL_SHEET);
  if (!sheet || sheet.getLastRow() < 2) {
    return { version: MINIAPP_ADMIN_WRITE_HARDENED_VERSION, rows: [] };
  }
  var last = sheet.getLastRow();
  var count = Math.min(MINIAPP_ADMIN_WRITE_JOURNAL_LIMIT, last - 1);
  var start = Math.max(2, last - count + 1);
  var values = sheet.getRange(start, 1, count, 12).getDisplayValues();
  return {
    version: MINIAPP_ADMIN_WRITE_HARDENED_VERSION,
    rows: values.map(function(r) {
      return {
        at: r[0],
        requestId: r[1],
        adminTelegramId: r[2],
        adminUsername: r[3],
        op: r[4],
        entityType: r[5],
        entityKey: r[6],
        row: Number(r[7] || 0),
        changed: MINIAPP_adminWriteParseJsonText_(r[8]),
        before: MINIAPP_adminWriteParseJsonText_(r[9]),
        after: MINIAPP_adminWriteParseJsonText_(r[10]),
        version: r[11]
      };
    }).reverse()
  };
}

function MINIAPP_adminWriteHardenedAppendJournal_(ctx, entityType, entityKey, row, before, after, changed) {
  var sheet = MINIAPP_adminWriteEnsureJournal_(ctx.ss);
  sheet.appendRow([
    new Date(),
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
    MINIAPP_ADMIN_WRITE_HARDENED_VERSION
  ]);
  sheet.getRange(sheet.getLastRow(), 1).setNumberFormat('dd.MM.yyyy HH:mm:ss');
}

function MINIAPP_adminWriteHardenedTeamName_(value) {
  return MINIAPP_adminWriteText_(value, 180).replace(/\s+—\s+(РМ|РК)$/u, '').trim();
}

function MINIAPP_adminWriteHardenedSetTeamLeader_(sheet, row, text) {
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
        display: value,
        name: value,
        tgName: '',
        username: '',
        id: ''
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
