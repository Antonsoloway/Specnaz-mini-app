/*
 * Royal CRM / Таблица ЧП
 * 25_MINIAPP_UNIFIED_SNAPSHOT.js
 * v1.0.0
 *
 * Atomic Mini App snapshot writer.
 * One source write contains base participants/teams + specnaz score/rank + specnaz history.
 * Participant identity is Telegram ID only.
 * Replaces competing 5-minute snapshot/profile/history writers.
 */

var MINIAPP_UNIFIED_SNAPSHOT_VERSION = '1.0.0';
var MINIAPP_UNIFIED_SNAPSHOT_SCHEMA = '1.3.1';
var MINIAPP_UNIFIED_SNAPSHOT_HANDLER = 'MINIAPP_exportUnifiedSnapshotToGitHub';
var MINIAPP_UNIFIED_SNAPSHOT_LAST_HASH = 'MINIAPP_UNIFIED_SNAPSHOT_LAST_HASH';

function MINIAPP_bootstrapUnifiedSnapshot() {
  var trigger = MINIAPP_installUnifiedSnapshotTrigger_();
  var sync = MINIAPP_exportUnifiedSnapshotToGitHub();
  return {
    ok: true,
    version: MINIAPP_UNIFIED_SNAPSHOT_VERSION,
    trigger: trigger,
    sync: sync
  };
}

function MINIAPP_exportUnifiedSnapshotToGitHub() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) {
    return { ok: false, skipped: true, reason: 'LOCK_BUSY' };
  }

  try {
    MINIAPP_unifiedRequireHelpers_();

    var props = PropertiesService.getScriptProperties();
    var repo = String(props.getProperty('DATA_GITHUB_REPO') || '').trim();
    var token = String(props.getProperty('DATA_GITHUB_TOKEN') || '').trim();
    var branch = String(props.getProperty('DATA_GITHUB_BRANCH') || 'main').trim();
    var path = String(props.getProperty('DATA_GITHUB_PATH') || 'snapshot.json').trim();
    if (!repo || !token) throw new Error('DATA_GITHUB_REPO / DATA_GITHUB_TOKEN missing');

    // Base CRM snapshot: current participant/team/role data.
    var stable = MINIAPP_buildStableSnapshot_();
    if (!stable || !Array.isArray(stable.participants) || !Array.isArray(stable.teams)) {
      throw new Error('MINIAPP_buildStableSnapshot_ returned invalid data');
    }

    // Add specnaz score/rank BEFORE the single GitHub write.
    var statsById = MINIAPP_profileStatsReadBase_();
    var statsTouched = 0;
    stable.participants.forEach(function(p) {
      var id = MINIAPP_unifiedTelegramId_(p && p.telegramId);
      if (!id || !Object.prototype.hasOwnProperty.call(statsById, id)) return;
      var score = Number(statsById[id] || 0);
      if (!isFinite(score) || score < 0) score = 0;
      score = Math.floor(score);
      p.specnazTrips = score;
      p.specnazRank = String(MINIAPP_profileStatsRank_(score) || 'Новичок');
      statsTouched += 1;
    });

    // Read history from the sheet in the same transaction/build pass.
    var sections = MINIAPP_readSpecnazHistorySections_();
    var nowIso = new Date().toISOString();
    var historyVersion = typeof MINIAPP_SPECNAZ_HISTORY_VERSION !== 'undefined'
      ? String(MINIAPP_SPECNAZ_HISTORY_VERSION || '1.3.0')
      : '1.3.0';
    var profileVersion = typeof MINIAPP_PROFILE_STATS_VERSION !== 'undefined'
      ? String(MINIAPP_PROFILE_STATS_VERSION || '1.0.0')
      : '1.0.0';

    // Hash only stable data. Timestamps must not force a write every 5 minutes.
    var hashBasis = {
      schemaVersion: MINIAPP_UNIFIED_SNAPSHOT_SCHEMA,
      participants: stable.participants,
      teams: stable.teams,
      stats: stable.stats || {},
      specnazHistory: {
        version: historyVersion,
        sections: sections
      }
    };
    var dataHash = MINIAPP_unifiedSha256_(JSON.stringify(hashBasis));
    var lastHash = String(props.getProperty(MINIAPP_UNIFIED_SNAPSHOT_LAST_HASH) || '').trim();

    if (lastHash && lastHash === dataHash) {
      return {
        ok: true,
        changed: false,
        version: MINIAPP_UNIFIED_SNAPSHOT_VERSION,
        schemaVersion: MINIAPP_UNIFIED_SNAPSHOT_SCHEMA,
        participants: stable.participants.length,
        teams: stable.teams.length,
        statsTouched: statsTouched,
        historySections: sections.length
      };
    }

    var payload = {
      schemaVersion: MINIAPP_UNIFIED_SNAPSHOT_SCHEMA,
      generatedAt: nowIso,
      source: 'Royal CRM / Таблица ЧП',
      dataHash: dataHash,
      participants: stable.participants,
      teams: stable.teams,
      stats: stable.stats || {},
      profileStatsVersion: profileVersion,
      profileStatsUpdatedAt: nowIso,
      specnazHistory: {
        version: historyVersion,
        updatedAt: nowIso,
        sections: sections
      },
      specnazHistoryVersion: historyVersion,
      unifiedSnapshotVersion: MINIAPP_UNIFIED_SNAPSHOT_VERSION
    };

    var github = MINIAPP_unifiedPutWithRetry_(repo, branch, path, JSON.stringify(payload), token, dataHash);
    props.setProperty(MINIAPP_UNIFIED_SNAPSHOT_LAST_HASH, dataHash);

    return {
      ok: true,
      changed: true,
      version: MINIAPP_UNIFIED_SNAPSHOT_VERSION,
      schemaVersion: MINIAPP_UNIFIED_SNAPSHOT_SCHEMA,
      participants: stable.participants.length,
      teams: stable.teams.length,
      statsTouched: statsTouched,
      historySections: sections.length,
      github: github
    };
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function MINIAPP_installUnifiedSnapshotTrigger_() {
  var oldHandlers = {
    MINIAPP_exportSnapshotToGitHub: true,
    MINIAPP_refreshProfileStatsInSnapshot: true,
    MINIAPP_refreshSpecnazHistorySnapshot: true,
    MINIAPP_exportUnifiedSnapshotToGitHub: true
  };
  var removed = [];

  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    var handler = String(trigger.getHandlerFunction() || '');
    if (!oldHandlers[handler]) return;
    ScriptApp.deleteTrigger(trigger);
    removed.push(handler);
  });

  ScriptApp.newTrigger(MINIAPP_UNIFIED_SNAPSHOT_HANDLER)
    .timeBased()
    .everyMinutes(5)
    .create();

  return {
    installed: MINIAPP_UNIFIED_SNAPSHOT_HANDLER,
    everyMinutes: 5,
    removed: removed
  };
}

function MINIAPP_unifiedRequireHelpers_() {
  var required = [
    ['MINIAPP_buildStableSnapshot_', typeof MINIAPP_buildStableSnapshot_],
    ['MINIAPP_putPrivateGitHubFile_', typeof MINIAPP_putPrivateGitHubFile_],
    ['MINIAPP_profileStatsReadBase_', typeof MINIAPP_profileStatsReadBase_],
    ['MINIAPP_profileStatsRank_', typeof MINIAPP_profileStatsRank_],
    ['MINIAPP_readSpecnazHistorySections_', typeof MINIAPP_readSpecnazHistorySections_]
  ];
  var missing = required.filter(function(item) { return item[1] !== 'function'; }).map(function(item) { return item[0]; });
  if (missing.length) throw new Error('Unified snapshot helpers missing: ' + missing.join(', '));
}

function MINIAPP_unifiedPutWithRetry_(repo, branch, path, json, token, dataHash) {
  var lastError = null;
  for (var attempt = 0; attempt < 3; attempt += 1) {
    try {
      return MINIAPP_putPrivateGitHubFile_(repo, branch, path, json, token, dataHash);
    } catch (error) {
      lastError = error;
      if (attempt < 2) Utilities.sleep(700 + attempt * 900);
    }
  }
  throw lastError || new Error('Unified snapshot GitHub write failed');
}

function MINIAPP_unifiedTelegramId_(value) {
  var text = String(value == null ? '' : value).trim().replace(/\.0$/, '');
  return /^\d+$/.test(text) ? text : '';
}

function MINIAPP_unifiedSha256_(text) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(text || ''),
    Utilities.Charset.UTF_8
  );
  return bytes.map(function(b) {
    var n = b < 0 ? b + 256 : b;
    return ('0' + n.toString(16)).slice(-2);
  }).join('');
}
