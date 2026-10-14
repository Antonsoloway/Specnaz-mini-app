// Manual emergency stop for the existing Table CHP project only.
// No network, Sheets access, credential export, webhook change or outbox deletion.
function SPECNAZ_pauseOwnerBotsForAccountMove() {
  var expected = '1Sn3by8RfBoBxkkcy0uyGoGfQcNRoXs1Z853lX4xDAyXV_neG8VYDVsYh';
  if (ScriptApp.getScriptId() !== expected) throw new Error('WRONG_PROJECT');
  var props = PropertiesService.getScriptProperties();
  var checkpoint = 'SPECNAZ_BOT_ACCOUNT_MOVE_PAUSE_V1';
  var previous = props.getProperty(checkpoint);
  if (!previous) props.setProperty(checkpoint, JSON.stringify({
    at: new Date().toISOString(), ownerPrivateEnabledBefore: props.getProperty('GOLUB_OWNER_WEBHOOK_ENABLED')
  }));
  props.setProperty('GOLUB_OWNER_WEBHOOK_ENABLED', '0');
  var removed = [];
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'GOLUB_OWNER_retryPendingCommits') {
      ScriptApp.deleteTrigger(trigger);
      removed.push('GOLUB_OWNER_retryPendingCommits');
    }
  });
  var result = {
    action: 'owner_bots_paused_for_account_move',
    at: new Date().toISOString(),
    ownerPrivateEnabled: props.getProperty('GOLUB_OWNER_WEBHOOK_ENABLED') === '1',
    remainingBotCommitTriggers: ScriptApp.getProjectTriggers().filter(function(trigger) {
      return trigger.getHandlerFunction() === 'GOLUB_OWNER_retryPendingCommits';
    }).length,
    removedTriggers: removed.length,
    outboxPreserved: true,
    tableAndAppFunctionsChanged: false,
    externalRequests: 0
  };
  Logger.log(JSON.stringify(result));
  return result;
}
// Manual configuration-only helper for the source Table project.
// Apps Script UI renders only the first 50 properties. Expose one existing bot
// property under a temporary alias in the SAME private project, never in logs.
function SPECNAZ_prepareOwnerTransportConfig() {
  if (ScriptApp.getScriptId() !== '1Sn3by8RfBoBxkkcy0uyGoGfQcNRoXs1Z853lX4xDAyXV_neG8VYDVsYh') throw new Error('WRONG_PROJECT');
  var p = PropertiesService.getScriptProperties();
  if (p.getProperty('GOLUB_OWNER_WEBHOOK_ENABLED') !== '0') throw new Error('SOURCE_MUST_STAY_PAUSED');
  var token = p.getProperty('TELEGRAM_BOT_TOKEN');
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(String(token || ''))) throw new Error('BOT_TOKEN_NOT_CONFIGURED');
  p.setProperty('AA_BOT_MOVE_TELEGRAM_TOKEN',token);
  var keys = Object.keys(p.getProperties());
  var report = {action:'prepare_owner_transport_config',sourceStillPaused:true,
    botTokenConfigured:true,temporaryAlias:'AA_BOT_MOVE_TELEGRAM_TOKEN',
    pendingCommitProperties:keys.filter(function(k){return k.indexOf('GOLUB_OWNER_COMMIT_V1_') === 0;}).length,
    deliveryRecords:keys.filter(function(k){return k.indexOf('GOLUB_OWNER_DELIVERY_V1_') === 0;}).length,
    externalRequests:0,tableDeploymentChanged:false};
  Logger.log(JSON.stringify(report));
  return report;
}
function SPECNAZ_clearOwnerTransportConfigAlias() {
  if (ScriptApp.getScriptId() !== '1Sn3by8RfBoBxkkcy0uyGoGfQcNRoXs1Z853lX4xDAyXV_neG8VYDVsYh') throw new Error('WRONG_PROJECT');
  PropertiesService.getScriptProperties().deleteProperty('AA_BOT_MOVE_TELEGRAM_TOKEN');
  Logger.log(JSON.stringify({action:'remove_temporary_bot_config_alias',externalRequests:0}));
}
