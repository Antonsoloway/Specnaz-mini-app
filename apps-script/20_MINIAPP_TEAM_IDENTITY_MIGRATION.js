/*
 * Royal CRM / Таблица ЧП
 * 20_MINIAPP_TEAM_IDENTITY_MIGRATION.js
 * v1.0.0
 *
 * One-time migration helper after enabling team identity = name + game.
 */

var MINIAPP_TEAM_IDENTITY_MIGRATION_VERSION = '1.0.0';

function MINIAPP_migrateTeamIdentityV2() {
  var snapshot = MINIAPP_exportSnapshotToGitHub();

  // Reinstall only the current persistent media triggers and rebuild team
  // photos under the new stable key: normalized team name + game.
  MINIAPP_installPersistentMediaTriggers_();
  var teams = MINIAPP_reconcileAllTeamPhotos_(true, 4.5 * 60 * 1000);

  // Force Telegram to load the new frontend assets and keep GAS fallback URL.
  var menu = MINIAPP_switchMenuToV055();

  return {
    ok: true,
    version: MINIAPP_TEAM_IDENTITY_MIGRATION_VERSION,
    snapshot: snapshot,
    teamMedia: teams,
    menu: menu
  };
}
