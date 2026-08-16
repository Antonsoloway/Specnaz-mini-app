/* Royal CRM / Таблица ЧП — 26_MINIAPP_MAYAK_MEDIA_SETUP.js v1.0.1
 * One-time setup for v0.5.36: make historical Project MAYAK media readable
 * and then switch Telegram bot menu to the new Mini App entrypoint.
 */
var MINIAPP_MAYAK_MEDIA_SETUP_VERSION = '1.0.1';
var MINIAPP_MAYAK_MEDIA_FILES = {
  'leaderboard-players': '1qP59gUe5hB7fymTk89RjJ0ks5ahc2r7e',
  'leaderboard-team': '1q-wZDOswV5D8PpqPDIHPo-4sNdwTzJAY',
  'audio': '1I1MYbQYAnKyqGxM2y9TtufslpyYXdFaB',
  'video': '1MF-I4VUjAshkoVBQ2ay6SZGlRDFgeIxw'
};

function MINIAPP_setupMayakMediaSharing() {
  var result = {};
  Object.keys(MINIAPP_MAYAK_MEDIA_FILES).forEach(function(key) {
    var id = MINIAPP_MAYAK_MEDIA_FILES[key];
    var file = DriveApp.getFileById(id);
    try {
      if (typeof file.setSecurityUpdateEnabled === 'function') file.setSecurityUpdateEnabled(false);
    } catch (securityError) {
      console.warn('MAYAK security update flag unchanged:', key, securityError && securityError.message ? securityError.message : securityError);
    }
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    result[key] = {
      id: id,
      name: file.getName(),
      access: String(file.getSharingAccess()),
      permission: String(file.getSharingPermission())
    };
  });
  var output = { ok:true, version:MINIAPP_MAYAK_MEDIA_SETUP_VERSION, files:result };
  console.log('MAYAK MEDIA OK: ' + JSON.stringify(output));
  return output;
}

function MINIAPP_finishV0536Setup() {
  var media = MINIAPP_setupMayakMediaSharing();
  if (!media || !media.ok) throw new Error('MAYAK media setup failed');
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
