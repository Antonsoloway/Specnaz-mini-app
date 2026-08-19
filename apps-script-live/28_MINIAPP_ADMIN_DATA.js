/*
 * Royal CRM / Таблица ЧП
 * 28_MINIAPP_ADMIN_DATA.js
 * v0.6.0-read.1
 *
 * PRIVATE admin payload builder for Mini App v0.6.
 * This data is written only into the private GitHub snapshot and MUST NOT be
 * exposed by the normal /snapshot route. Worker /admin-data performs a fresh
 * Telegram chat-admin check before returning it.
 */

var MINIAPP_ADMIN_DATA_VERSION = '0.6.0-read.1';

function MINIAPP_buildAdminData_() {
  if (typeof SPREADSHEET_ID === 'undefined' || typeof SHEET_BASE === 'undefined' || typeof SHEET_TEAMS === 'undefined') {
    throw new Error('Admin data: CRM globals missing');
  }
  if (typeof SLOT_DEFS === 'undefined' || !Array.isArray(SLOT_DEFS)) {
    throw new Error('Admin data: SLOT_DEFS missing');
  }

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var base = ss.getSheetByName(SHEET_BASE);
  var teamsSheet = ss.getSheetByName(SHEET_TEAMS);
  if (!base) throw new Error('Admin data: лист «' + SHEET_BASE + '» не найден');
  if (!teamsSheet) throw new Error('Admin data: лист «' + SHEET_TEAMS + '» не найден');

  var participants = MINIAPP_adminReadParticipants_(base);
  var teams = MINIAPP_adminReadTeams_(ss, teamsSheet);

  var inChat = 0;
  var exited = 0;
  participants.forEach(function(p) {
    var state = String(p.chatState || '').trim();
    if (state === 'В чате') inChat += 1;
    if (state === 'Вышел' || String(p.status || '').trim() === 'Вышел') exited += 1;
  });

  var activeTeams = 0;
  var pausedTeams = 0;
  var inactiveTeams = 0;
  teams.forEach(function(t) {
    var status = String(t.status || '').trim();
    if (status === 'Активен') activeTeams += 1;
    else if (status === 'На паузе') pausedTeams += 1;
    else if (status === 'Неактивен') inactiveTeams += 1;
  });

  return {
    version: MINIAPP_ADMIN_DATA_VERSION,
    generatedAt: new Date().toISOString(),
    participants: participants,
    teams: teams,
    stats: {
      participants: participants.length,
      inChat: inChat,
      exited: exited,
      teams: teams.length,
      activeTeams: activeTeams,
      pausedTeams: pausedTeams,
      inactiveTeams: inactiveTeams
    },
    journal: {
      version: '0.6.0-planned',
      rows: []
    }
  };
}

function MINIAPP_adminReadParticipants_(sheet) {
  var firstRow = typeof BASE_FIRST_ROW !== 'undefined' ? Number(BASE_FIRST_ROW) : 2;
  var configuredLast = typeof BASE_LAST_ROW !== 'undefined' ? Number(BASE_LAST_ROW) : sheet.getMaxRows();
  var lastRow = Math.min(sheet.getLastRow(), configuredLast);
  if (lastRow < firstRow) return [];

  var width = Math.max(32, typeof COL_CHAT_STATE !== 'undefined' ? Number(COL_CHAT_STATE) : 32);
  var rows = sheet.getRange(firstRow, 1, lastRow - firstRow + 1, width).getDisplayValues();
  var out = [];

  rows.forEach(function(row, index) {
    var telegramId = MINIAPP_adminTelegramId_(row[3]);
    var name = MINIAPP_adminValue_(row[0]);
    var telegramName = MINIAPP_adminValue_(row[1]);
    var username = MINIAPP_adminValue_(row[2]);
    var status = MINIAPP_adminValue_(row[19]);
    var chatState = MINIAPP_adminValue_(row[31]);

    var memberships = [];
    SLOT_DEFS.forEach(function(slot) {
      var teamRaw = MINIAPP_adminValue_(row[Number(slot.teamCol) - 1]);
      var nickname = MINIAPP_adminValue_(row[Number(slot.nickCol) - 1]);
      var role = MINIAPP_adminValue_(row[Number(slot.roleCol) - 1]);
      var gameRaw = MINIAPP_adminValue_(row[Number(slot.gameCol) - 1]);
      if (!teamRaw && !nickname && !role && !gameRaw) return;

      var team = typeof MINIAPP_snapshotStripGameSuffix_ === 'function'
        ? MINIAPP_snapshotStripGameSuffix_(teamRaw)
        : teamRaw.replace(/\s+—\s+(РМ|РК)$/u, '');
      var game = typeof MINIAPP_snapshotCanonicalGame_ === 'function'
        ? MINIAPP_snapshotCanonicalGame_(gameRaw, teamRaw)
        : gameRaw;
      var teamKey = team && typeof MINIAPP_snapshotTeamKey_ === 'function'
        ? MINIAPP_snapshotTeamKey_(team, game)
        : '';

      memberships.push({
        slot: Number(slot.number || memberships.length + 1),
        team: team,
        teamRaw: teamRaw,
        teamKey: teamKey,
        nickname: nickname,
        role: role,
        game: game
      });
    });

    var hasAdminData = name || telegramName || username || telegramId || memberships.length || status || chatState ||
      MINIAPP_adminValue_(row[20]) || MINIAPP_adminValue_(row[27]) || MINIAPP_adminValue_(row[28]) || MINIAPP_adminValue_(row[29]);
    if (!hasAdminData) return;

    out.push({
      row: firstRow + index,
      telegramId: telegramId,
      name: name,
      telegramName: telegramName,
      username: username,
      memberships: memberships,
      status: status,
      specnaz: MINIAPP_adminNumberOrText_(row[20]),
      date: MINIAPP_adminValue_(row[21]),
      screens: MINIAPP_adminNumberOrText_(row[27]),
      activityBase: MINIAPP_adminNumberOrText_(row[28]),
      activityOutside: MINIAPP_adminNumberOrText_(row[29]),
      lastChange: MINIAPP_adminValue_(row[30]),
      chatState: chatState
    });
  });

  out.sort(function(a, b) {
    var an = String(a.name || a.telegramName || a.username || a.telegramId || '');
    var bn = String(b.name || b.telegramName || b.username || b.telegramId || '');
    return an.localeCompare(bn, 'ru', { sensitivity: 'base' });
  });
  return out;
}

function MINIAPP_adminReadTeams_(ss, sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var count = lastRow - 1;
  var display = sheet.getRange(2, 1, count, 12).getDisplayValues();
  var photoMap = typeof MINIAPP_snapshotLoadTeamPhotoMap_ === 'function'
    ? MINIAPP_snapshotLoadTeamPhotoMap_(ss)
    : {};
  var out = [];

  display.forEach(function(row, index) {
    var gameRaw = MINIAPP_adminValue_(row[0]);
    var nameRaw = MINIAPP_adminValue_(row[1]);
    var name = typeof MINIAPP_snapshotStripGameSuffix_ === 'function'
      ? MINIAPP_snapshotStripGameSuffix_(nameRaw)
      : nameRaw.replace(/\s+—\s+(РМ|РК)$/u, '');
    var game = typeof MINIAPP_snapshotCanonicalGame_ === 'function'
      ? MINIAPP_snapshotCanonicalGame_(gameRaw, nameRaw)
      : gameRaw;
    var status = MINIAPP_adminValue_(row[11]);

    var hasData = name || game || status || row.slice(3, 11).some(function(v) { return MINIAPP_adminValue_(v); });
    if (!hasData) return;

    var key = name && typeof MINIAPP_snapshotTeamKey_ === 'function'
      ? MINIAPP_snapshotTeamKey_(name, game)
      : '';

    out.push({
      row: index + 2,
      key: key,
      game: game,
      name: name,
      photoUrl: key ? MINIAPP_adminValue_(photoMap[key]) : '',
      leader: MINIAPP_adminValue_(row[3]),
      players: MINIAPP_adminNumberOrText_(row[4]),
      specnazTrips: MINIAPP_adminNumberOrText_(row[5]),
      sort: MINIAPP_adminNumberOrText_(row[6]),
      screens: MINIAPP_adminNumberOrText_(row[7]),
      activityBase: MINIAPP_adminNumberOrText_(row[8]),
      activityOutside: MINIAPP_adminNumberOrText_(row[9]),
      average: MINIAPP_adminNumberOrText_(row[10]),
      status: status
    });
  });

  out.sort(function(a, b) {
    var byGame = String(a.game || '').localeCompare(String(b.game || ''), 'ru', { sensitivity: 'base' });
    if (byGame) return byGame;
    return String(a.name || '').localeCompare(String(b.name || ''), 'ru', { sensitivity: 'base' });
  });
  return out;
}

function MINIAPP_adminNumberOrText_(value) {
  var text = MINIAPP_adminValue_(value);
  if (!text) return '';
  var normalized = text.replace(/\s+/g, '').replace(',', '.');
  if (/^-?\d+(?:\.\d+)?$/.test(normalized)) {
    var number = Number(normalized);
    if (isFinite(number)) return number;
  }
  return text;
}

function MINIAPP_adminTelegramId_(value) {
  var text = MINIAPP_adminValue_(value).replace(/^'/, '').replace(/\.0$/, '');
  var match = text.match(/\d{5,20}/);
  return match ? match[0] : '';
}

function MINIAPP_adminValue_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}
