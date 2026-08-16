/* Royal CRM / Таблица ЧП — 26_MINIAPP_MAYAK_MEDIA_SETUP.js v1.0.0
 * One-time setup: make historical Project MAYAK media readable by the Mini App.
 */
var MINIAPP_MAYAK_MEDIA_SETUP_VERSION = '1.0.0';
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
  console.log(JSON.stringify(output));
  return output;
}
