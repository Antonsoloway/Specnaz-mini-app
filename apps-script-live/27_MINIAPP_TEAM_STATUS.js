/* Royal CRM / Таблица ЧП — team status bridge for Mini App v0.5.59
 * Reads authoritative team status from admin sheet «Команды», column L.
 * Identity is team name + canonical game. Does not change membership filtering.
 */
var MINIAPP_TEAM_STATUS_BRIDGE_VERSION = '1.0.0';
var MINIAPP_TEAM_STATUS_ACTIVE = 'Активен';
var MINIAPP_TEAM_STATUS_PAUSED = 'На паузе';
var MINIAPP_TEAM_STATUS_INACTIVE = 'Неактивен';

function MINIAPP_attachTeamStatusesToSnapshot_(stable) {
  stable = stable || {};
  var teams = Array.isArray(stable.teams) ? stable.teams : [];
  var stats = { attached: 0, active: 0, paused: 0, inactive: 0, missing: 0 };
  if (!teams.length) return stats;

  if (typeof SPREADSHEET_ID === 'undefined') throw new Error('SPREADSHEET_ID is missing');
  if (typeof MINIAPP_snapshotTeamKey_ !== 'function' || typeof MINIAPP_snapshotCanonicalGame_ !== 'function') {
    throw new Error('Snapshot team identity helpers are missing');
  }

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Команды');
  if (!sheet || sheet.getLastRow() < 2) {
    teams.forEach(function(team) { team.status = ''; stats.missing += 1; });
    return stats;
  }

  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).getDisplayValues();
  var byKey = {};

  rows.forEach(function(row) {
    var gameRaw = String(row[0] || '').trim();
    var teamRaw = String(row[1] || '').trim();
    var status = String(row[11] || '').trim();
    if (!teamRaw) return;

    var teamName = typeof MINIAPP_snapshotStripGameSuffix_ === 'function'
      ? MINIAPP_snapshotStripGameSuffix_(teamRaw)
      : teamRaw.replace(/\s+—\s+(РМ|РК)$/u, '');
    var game = MINIAPP_snapshotCanonicalGame_(gameRaw, teamRaw);
    if (!teamName || !game) return;
    byKey[MINIAPP_snapshotTeamKey_(teamName, game)] = status;
  });

  teams.forEach(function(team) {
    var name = String(team && team.name || '').trim();
    var gameRaw = String(team && team.game || '').trim();
    if (!gameRaw && team && Array.isArray(team.games) && team.games.length) gameRaw = String(team.games[0] || '').trim();
    var game = MINIAPP_snapshotCanonicalGame_(gameRaw, name);
    var key = String(team && team.key || '').trim();
    if (!key && name) key = MINIAPP_snapshotTeamKey_(name, game);

    var status = key && Object.prototype.hasOwnProperty.call(byKey, key) ? String(byKey[key] || '').trim() : '';
    team.status = status;
    if (status) stats.attached += 1; else stats.missing += 1;
    if (status === MINIAPP_TEAM_STATUS_ACTIVE) stats.active += 1;
    else if (status === MINIAPP_TEAM_STATUS_PAUSED) stats.paused += 1;
    else if (status === MINIAPP_TEAM_STATUS_INACTIVE) stats.inactive += 1;
  });

  return stats;
}
