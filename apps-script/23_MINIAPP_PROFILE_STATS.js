/*
 * Royal CRM / Таблица ЧП
 * 23_MINIAPP_PROFILE_STATS.js
 * v1.0.0
 *
 * Adds participant special-forces trips/rank to the private Mini App snapshot.
 * Source of truth: База участников!D:D (Telegram ID) + U:U (Спецназ).
 * Writes GitHub only when profile stats actually change.
 */

var MINIAPP_PROFILE_STATS_VERSION = '1.0.0';
var MINIAPP_PROFILE_STATS_SCHEMA = '1.3.0';
var MINIAPP_PROFILE_STATS_SPREADSHEET_ID = '1kkADcKysWdoGy95O36z9jCaoGUUHN0g4XH4LwVtAK_o';
var MINIAPP_PROFILE_STATS_SHEET = 'База участников';
var MINIAPP_PROFILE_STATS_HANDLER = 'MINIAPP_refreshProfileStatsInSnapshot';

function MINIAPP_bootstrapProfileStats() {
  var sync = MINIAPP_refreshProfileStatsInSnapshot();
  MINIAPP_installProfileStatsTrigger_();

  var menu = null;
  try {
    if (typeof MINIAPP_setupBotAppMenu === 'function') menu = MINIAPP_setupBotAppMenu();
  } catch (err) {
    console.warn('MINIAPP profile stats menu refresh:', err && err.message ? err.message : err);
  }

  return {
    ok: true,
    version: MINIAPP_PROFILE_STATS_VERSION,
    sync: sync,
    triggerInstalled: true,
    menu: menu
  };
}

function MINIAPP_refreshProfileStatsInSnapshot() {
  var statsById = MINIAPP_profileStatsReadBase_();
  var cfg = MINIAPP_profileStatsConfig_();

  for (var attempt = 0; attempt < 2; attempt += 1) {
    var current = MINIAPP_profileStatsReadSnapshot_(cfg);
    var snapshot = current.snapshot;
    var participants = snapshot && Array.isArray(snapshot.participants) ? snapshot.participants : [];
    var changed = false;
    var touched = 0;

    participants.forEach(function(p) {
      var id = String(p && p.telegramId || '').trim();
      if (!id || !Object.prototype.hasOwnProperty.call(statsById, id)) return;

      var trips = Number(statsById[id] || 0);
      var rank = MINIAPP_profileStatsRank_(trips);
      touched += 1;

      if (Number(p.specnazTrips || 0) !== trips) {
        p.specnazTrips = trips;
        changed = true;
      }
      if (String(p.specnazRank || '') !== rank) {
        p.specnazRank = rank;
        changed = true;
      }
    });

    if (String(snapshot.schemaVersion || '') !== MINIAPP_PROFILE_STATS_SCHEMA) {
      snapshot.schemaVersion = MINIAPP_PROFILE_STATS_SCHEMA;
      changed = true;
    }

    if (!changed) {
      return { ok: true, changed: false, participants: touched, schemaVersion: snapshot.schemaVersion || '' };
    }

    snapshot.profileStatsVersion = MINIAPP_PROFILE_STATS_VERSION;
    snapshot.profileStatsUpdatedAt = new Date().toISOString();
    snapshot.dataHash = MINIAPP_profileStatsHash_(snapshot);

    var result = MINIAPP_profileStatsWriteSnapshot_(cfg, snapshot, current.sha);
    if (result.ok) {
      return {
        ok: true,
        changed: true,
        participants: touched,
        schemaVersion: snapshot.schemaVersion,
        updatedAt: snapshot.profileStatsUpdatedAt
      };
    }

    if (result.code !== 409 && result.code !== 422) {
      throw new Error('Profile snapshot write HTTP ' + result.code + ': ' + result.body);
    }
  }

  throw new Error('Profile snapshot changed concurrently; retry later.');
}

function MINIAPP_installProfileStatsTrigger_() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === MINIAPP_PROFILE_STATS_HANDLER) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger(MINIAPP_PROFILE_STATS_HANDLER)
    .timeBased()
    .everyMinutes(5)
    .create();
}

function MINIAPP_profileStatsReadBase_() {
  var ss = SpreadsheetApp.openById(MINIAPP_PROFILE_STATS_SPREADSHEET_ID);
  var sheet = ss.getSheetByName(MINIAPP_PROFILE_STATS_SHEET);
  if (!sheet) throw new Error('Sheet not found: ' + MINIAPP_PROFILE_STATS_SHEET);

  var lastRow = sheet.getLastRow();
  var out = {};
  if (lastRow < 2) return out;

  var count = lastRow - 1;
  var ids = sheet.getRange(2, 4, count, 1).getDisplayValues();
  var trips = sheet.getRange(2, 21, count, 1).getDisplayValues();

  for (var i = 0; i < count; i += 1) {
    var id = String(ids[i][0] || '').trim().replace(/\.0$/, '');
    if (!/^\d+$/.test(id)) continue;
    var value = Number(String(trips[i][0] || '0').replace(',', '.'));
    out[id] = isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  }
  return out;
}

function MINIAPP_profileStatsRank_(value) {
  if (typeof getSpecnazRank_ === 'function') {
    try { return String(getSpecnazRank_(value) || 'Новичок'); } catch (_) {}
  }

  var score = Number(value || 0);
  var levels = [
    [80, 'БОГ СПЕЦНАЗА'],
    [60, 'Легендарный'],
    [48, 'Бессмертный'],
    [38, 'Величайший'],
    [30, 'Маэстро'],
    [22, 'Выдающийся'],
    [14, 'Знаменитый'],
    [8, 'Известный'],
    [4, 'Узнаваемый'],
    [1, 'Начинающий'],
    [0, 'Новичок']
  ];
  for (var i = 0; i < levels.length; i += 1) {
    if (score >= levels[i][0]) return levels[i][1];
  }
  return 'Новичок';
}

function MINIAPP_profileStatsConfig_() {
  var props = PropertiesService.getScriptProperties();
  var repo = String(props.getProperty('DATA_GITHUB_REPO') || '').trim();
  var token = String(props.getProperty('DATA_GITHUB_TOKEN') || '').trim();
  var branch = String(props.getProperty('DATA_GITHUB_BRANCH') || 'main').trim();
  var path = String(props.getProperty('DATA_GITHUB_PATH') || 'snapshot.json').trim();
  if (!repo || !token) throw new Error('DATA_GITHUB_REPO / DATA_GITHUB_TOKEN missing');
  return { repo: repo, token: token, branch: branch, path: path };
}

function MINIAPP_profileStatsHeaders_(cfg) {
  return {
    Authorization: 'Bearer ' + cfg.token,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Royal-CRM-Profile-Stats/1.0'
  };
}

function MINIAPP_profileStatsPath_(path) {
  return String(path || '').split('/').map(encodeURIComponent).join('/');
}

function MINIAPP_profileStatsReadSnapshot_(cfg) {
  var url = 'https://api.github.com/repos/' + cfg.repo + '/contents/' +
    MINIAPP_profileStatsPath_(cfg.path) + '?ref=' + encodeURIComponent(cfg.branch);
  var response = UrlFetchApp.fetch(url, {
    method: 'get', muteHttpExceptions: true, headers: MINIAPP_profileStatsHeaders_(cfg)
  });
  if (response.getResponseCode() !== 200) {
    throw new Error('Profile snapshot read HTTP ' + response.getResponseCode());
  }

  var body = JSON.parse(response.getContentText() || '{}');
  var encoded = String(body.content || '').replace(/\s+/g, '');
  if (!encoded) throw new Error('Profile snapshot is empty');
  var text = Utilities.newBlob(Utilities.base64Decode(encoded)).getDataAsString('UTF-8');
  return { snapshot: JSON.parse(text), sha: String(body.sha || '') };
}

function MINIAPP_profileStatsWriteSnapshot_(cfg, snapshot, sha) {
  var url = 'https://api.github.com/repos/' + cfg.repo + '/contents/' + MINIAPP_profileStatsPath_(cfg.path);
  var json = JSON.stringify(snapshot);
  var payload = {
    message: 'sync Mini App profile stats',
    content: Utilities.base64Encode(Utilities.newBlob(json, 'application/json').getBytes()),
    branch: cfg.branch,
    sha: sha
  };
  var headers = MINIAPP_profileStatsHeaders_(cfg);
  headers['Content-Type'] = 'application/json';
  var response = UrlFetchApp.fetch(url, {
    method: 'put', muteHttpExceptions: true, headers: headers, payload: JSON.stringify(payload)
  });
  return { ok: response.getResponseCode() === 200 || response.getResponseCode() === 201, code: response.getResponseCode(), body: response.getContentText() };
}

function MINIAPP_profileStatsHash_(snapshot) {
  var copy = JSON.parse(JSON.stringify(snapshot || {}));
  delete copy.dataHash;
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    JSON.stringify(copy),
    Utilities.Charset.UTF_8
  );
  return bytes.map(function(b) {
    var n = b < 0 ? b + 256 : b;
    return ('0' + n.toString(16)).slice(-2);
  }).join('');
}
