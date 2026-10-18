/* Deployment candidate. Team game identity is text in Команды!M.
   Only the signed admin-write gateway may mutate it. No game credentials here. */
var MINIAPP_TEAM_LIVE_HEADER = 'ID команды RM'; // Keep the existing owned column; game comes from A.
function MINIAPP_teamLiveGame_(game) { return game === 'Royal Match' || game === 'Royal Kingdom'; }
function MINIAPP_teamLiveValidId_(id) {
  return typeof id === 'string' && /^[1-9]\d{0,18}$/.test(id) &&
    (id.length < 19 || id <= '9223372036854775807');
}
function MINIAPP_teamLiveReadId_(sheet, value, game) {
  if (!MINIAPP_teamLiveGame_(game) || sheet.getRange(1, 13).getDisplayValue() !== MINIAPP_TEAM_LIVE_HEADER) return '';
  var id = String(value || '').trim();
  return MINIAPP_teamLiveValidId_(id) ? id : '';
}
function MINIAPP_teamLivePrepare_(sheet, game, input, previous) {
  var supplied = Object.prototype.hasOwnProperty.call(input || {}, 'gameTeamId');
  var id = supplied ? input.gameTeamId : String(previous || '');
  if (typeof id !== 'string' || (id && !MINIAPP_teamLiveValidId_(id)))
    return MINIAPP_adminWriteError_('TEAM_GAME_ID_INVALID', 'Выберите команду через поиск или укажите корректный ID.');
  if (id && !MINIAPP_teamLiveGame_(game))
    return MINIAPP_adminWriteError_('TEAM_GAME_UNSUPPORTED', 'Выберите Royal Match или Royal Kingdom.');
  if (!supplied) return {ok:true, id:id, changed:false};
  var header = sheet.getRange(1, 13).getDisplayValue();
  if (header !== MINIAPP_TEAM_LIVE_HEADER) {
    // Never repurpose an occupied column. No setup/upgrade or formula writes.
    if (header || sheet.getRange(2, 13, sheet.getMaxRows()-1, 1).getDisplayValues().some(function(r){return r[0] !== '';}) ||
        sheet.getRange(1, 13, sheet.getMaxRows(), 1).getFormulas().some(function(r){return r[0] !== '';}))
      return MINIAPP_adminWriteError_('TEAM_GAME_COLUMN_OCCUPIED', 'Колонка ID занята. Требуется проверка структуры таблицы.');
    sheet.getRange(1, 13).setValue(MINIAPP_TEAM_LIVE_HEADER);
  }
  return {ok:true, id:id, changed:id !== String(previous || '')};
}
function MINIAPP_teamLiveAttach_(snapshot) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID), sheet = ss.getSheetByName(SHEET_TEAMS);
  if (!sheet || sheet.getLastRow()<2 || sheet.getRange(1,13).getDisplayValue() !== MINIAPP_TEAM_LIVE_HEADER) return;
  var map = {};
  sheet.getRange(2,1,sheet.getLastRow()-1,13).getDisplayValues().forEach(function(row){
    var game = MINIAPP_adminWriteCanonicalGame_(row[0]), id = MINIAPP_teamLiveReadId_(sheet,row[12],game);
    if(id) map[MINIAPP_snapshotTeamKey_(MINIAPP_snapshotStripGameSuffix_(row[1]),game)] = id;
  });
  (snapshot.teams || []).forEach(function(t){
    var id = map[MINIAPP_snapshotTeamKey_(t.name,t.game)];
    if(id) t.gameTeamId = id;
  });
}

function MINIAPP_teamLiveWriteId_(sheet, row, id) {
  if (sheet.getRange(1,13).getDisplayValue() === MINIAPP_TEAM_LIVE_HEADER) sheet.getRange(row,13).setNumberFormat('@').setValue(id);
}
function MINIAPP_teamLiveClearId_(sheet, row) {
  if (sheet.getRange(1,13).getDisplayValue() === MINIAPP_TEAM_LIVE_HEADER) sheet.getRange(row,13).clearContent();
}
