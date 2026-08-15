/*
 * Royal CRM / Таблица ЧП
 * 16_MINIAPP_MEDIA_SMART_SYNC.js
 * v1.0.0
 *
 * Smart rotating sync for persistent private media cache.
 * Uses helpers from 15_MINIAPP_MEDIA_CACHE.js.
 * - never redownloads files already present in private royal-crm-data/media
 * - rotates through missing media so one broken item cannot block the queue
 * - bootstrap fills a large chunk immediately and installs the recurring sync
 */

var MINIAPP_MEDIA_SMART_VERSION = '1.0.0';
var MINIAPP_MEDIA_SMART_CURSOR_PROP = 'MINIAPP_MEDIA_SMART_CURSOR';

function MINIAPP_syncMediaCacheSmartBatch() {
  return MINIAPP_mediaSmartProcess_(12, 4.5 * 60 * 1000);
}

function MINIAPP_bootstrapMediaCacheAndInstall() {
  MINIAPP_mediaInstallSmartTrigger_();
  var result = MINIAPP_mediaSmartProcess_(80, 5 * 60 * 1000);
  result.triggerInstalled = true;
  result.triggerHandler = 'MINIAPP_syncMediaCacheSmartBatch';
  result.triggerEveryMinutes = 5;
  return result;
}

function MINIAPP_mediaInstallSmartTrigger_() {
  var handlers = {
    MINIAPP_syncMediaCacheBatch: true,
    MINIAPP_syncMediaCacheSmartBatch: true
  };

  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    var fn = trigger.getHandlerFunction ? trigger.getHandlerFunction() : '';
    if (handlers[fn]) ScriptApp.deleteTrigger(trigger);
  });

  ScriptApp.newTrigger('MINIAPP_syncMediaCacheSmartBatch')
    .timeBased()
    .everyMinutes(5)
    .create();
}

function MINIAPP_mediaSmartProcess_(maxItems, maxMs) {
  var props = PropertiesService.getScriptProperties();
  var cfg = MINIAPP_mediaConfig_(props);
  var snapshot = MINIAPP_mediaLoadSnapshot_(cfg);
  var items = MINIAPP_mediaBuildItems_(snapshot);
  var existing = MINIAPP_mediaGithubPathSet_(cfg);
  var missing = items.filter(function(item) { return !existing[item.path]; });

  if (!missing.length) {
    props.setProperty(MINIAPP_MEDIA_SMART_CURSOR_PROP, '0');
    return {
      ok: true,
      version: MINIAPP_MEDIA_SMART_VERSION,
      total: items.length,
      existing: items.length,
      missingBefore: 0,
      processed: 0,
      cached: 0,
      failed: 0,
      missingAfter: 0
    };
  }

  var ordered = MINIAPP_mediaInterleaveMissing_(missing);
  var cursor = Number(props.getProperty(MINIAPP_MEDIA_SMART_CURSOR_PROP) || 0);
  if (!isFinite(cursor) || cursor < 0) cursor = 0;
  cursor = cursor % ordered.length;

  var processed = 0;
  var cached = 0;
  var failed = 0;
  var started = Date.now();

  while (processed < maxItems && processed < ordered.length && (Date.now() - started) < maxMs) {
    var index = (cursor + processed) % ordered.length;
    var item = ordered[index];

    try {
      var blob = item.kind === 'avatar'
        ? MINIAPP_mediaFetchAvatar_(item, cfg)
        : MINIAPP_mediaFetchTeamPhoto_(item);

      if (!blob || !blob.getBytes().length) {
        failed += 1;
      } else {
        MINIAPP_mediaGithubCreate_(cfg, item.path, blob, item.commitMessage);
        cached += 1;
      }
    } catch (err) {
      failed += 1;
      console.warn('MINIAPP smart media item failed:', item.kind, item.path, err && err.message ? err.message : err);
    }

    processed += 1;
  }

  var nextCursor = ordered.length ? (cursor + processed) % ordered.length : 0;
  props.setProperty(MINIAPP_MEDIA_SMART_CURSOR_PROP, String(nextCursor));

  return {
    ok: true,
    version: MINIAPP_MEDIA_SMART_VERSION,
    total: items.length,
    existing: items.length - missing.length,
    missingBefore: missing.length,
    processed: processed,
    cached: cached,
    failed: failed,
    missingAfter: Math.max(0, missing.length - cached),
    nextCursor: nextCursor
  };
}

function MINIAPP_mediaInterleaveMissing_(missing) {
  var avatars = [];
  var teams = [];
  missing.forEach(function(item) {
    if (item.kind === 'team') teams.push(item);
    else avatars.push(item);
  });

  var out = [];
  var ai = 0;
  var ti = 0;
  while (ai < avatars.length || ti < teams.length) {
    if (ai < avatars.length) out.push(avatars[ai++]);
    if (ti < teams.length) out.push(teams[ti++]);
  }
  return out;
}
