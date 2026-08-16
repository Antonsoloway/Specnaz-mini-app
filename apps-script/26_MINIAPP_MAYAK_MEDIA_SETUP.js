/* Royal CRM / Таблица ЧП — 26_MINIAPP_MAYAK_MEDIA_SETUP.js v1.1.0
 * One-time setup for v0.5.36:
 * copy historical Project MAYAK media from Drive into the EXISTING private
 * royal-crm-data media cache, then switch Telegram bot menu to v0.5.36.
 * Drive sharing permissions are NOT changed.
 */
var MINIAPP_MAYAK_MEDIA_SETUP_VERSION = '1.1.0';
var MINIAPP_MAYAK_MEDIA_FILES = {
  'leaderboard-players': { driveId:'1qP59gUe5hB7fymTk89RjJ0ks5ahc2r7e', path:'media/projects/mayak/leaderboard-players.jpg' },
  'leaderboard-team': { driveId:'1q-wZDOswV5D8PpqPDIHPo-4sNdwTzJAY', path:'media/projects/mayak/leaderboard-team.jpg' },
  'audio': { driveId:'1I1MYbQYAnKyqGxM2y9TtufslpyYXdFaB', path:'media/projects/mayak/proekt-mayak.mp3' },
  'video': { driveId:'1MF-I4VUjAshkoVBQ2ay6SZGlRDFgeIxw', path:'media/projects/mayak/mayak-video.mp4' }
};

function MINIAPP_syncMayakMediaToPrivateGithub() {
  if (typeof MINIAPP_mediaConfig_ !== 'function' || typeof MINIAPP_mediaGithubCreate_ !== 'function') {
    throw new Error('MINIAPP media cache helpers are missing');
  }
  var cfg = MINIAPP_mediaConfig_(PropertiesService.getScriptProperties());
  var result = {};

  Object.keys(MINIAPP_MAYAK_MEDIA_FILES).forEach(function(key) {
    var item = MINIAPP_MAYAK_MEDIA_FILES[key];
    var file = DriveApp.getFileById(item.driveId);
    var blob = file.getBlob();
    if (!blob || !blob.getBytes().length) throw new Error('Empty MAYAK media: ' + key);
    MINIAPP_mediaGithubCreate_(cfg, item.path, blob, 'cache MAYAK project ' + key);
    result[key] = { path:item.path, name:file.getName(), bytes:blob.getBytes().length };
  });

  var output = { ok:true, version:MINIAPP_MAYAK_MEDIA_SETUP_VERSION, files:result };
  console.log('MAYAK PRIVATE MEDIA OK: ' + JSON.stringify(output));
  return output;
}

function MINIAPP_finishV0536Setup() {
  var media = MINIAPP_syncMayakMediaToPrivateGithub();
  if (!media || !media.ok) throw new Error('MAYAK private media setup failed');
  if (typeof MINIAPP_setupBotAppMenu !== 'function') throw new Error('MINIAPP_setupBotAppMenu is missing');
  var menu = MINIAPP_setupBotAppMenu();
  var output = {
    ok: true,
    miniApp: 'v0.5.36',
    mediaSetup: MINIAPP_MAYAK_MEDIA_SETUP_VERSION,
    botMenu: menu && menu.version ? menu.version : '',
    appUrl: menu && menu.appUrl ? menu.appUrl : ''
  };
  console.log('V0.5.36 SETUP OK: ' + JSON.stringify(output));
  return output;
}
