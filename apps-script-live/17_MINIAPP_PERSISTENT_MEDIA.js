/*
 * Royal CRM / Таблица ЧП
 * 17_MINIAPP_PERSISTENT_MEDIA.js
 * v1.0.0
 *
 * Persistent private media sync.
 * - Avatars: keeps using the existing Telegram file_id cache helpers from file 15.
 * - Team photos: reads CellImage directly from the live "Команды" sheet,
 *   immediately downloads the short-lived getContentUrl() and upserts the
 *   binary file into private royal-crm-data/media/teams using a STABLE key
 *   based on normalized team name.
 * - Installs one 5-minute background worker plus spreadsheet edit/change marks.
 * - Existing legacy media triggers are removed so expired snapshot photo URLs
 *   are no longer retried.
 */

var MINIAPP_PERSISTENT_MEDIA_VERSION = '1.1.0';
var MINIAPP_TEAM_MEDIA_SPREADSHEET_ID = '1kkADcKysWdoGy95O36z9jCaoGUUHN0g4XH4LwVtAK_o';
var MINIAPP_TEAM_MEDIA_SHEET = 'Команды';
var MINIAPP_TEAM_MEDIA_DIRTY_ROWS_PROP = 'MINIAPP_TEAM_MEDIA_DIRTY_ROWS';
var MINIAPP_TEAM_MEDIA_FULL_PROP = 'MINIAPP_TEAM_MEDIA_FULL_RECONCILE';
var MINIAPP_TEAM_MEDIA_HASH_PREFIX = 'MINIAPP_TEAM_MEDIA_HASH_';

function MINIAPP_bootstrapPersistentMediaAndInstall() {
  MINIAPP_installPersistentMediaTriggers_();

  var avatars = MINIAPP_syncPersistentAvatars_(80, 4.5 * 60 * 1000);
  var teams = MINIAPP_reconcileAllTeamPhotos_(true, 4.5 * 60 * 1000);

  return {
    ok: true,
    version: MINIAPP_PERSISTENT_MEDIA_VERSION,
    triggersInstalled: true,
    avatars: avatars,
    teams: teams
  };
}

function MINIAPP_syncPersistentMedia() {
  var started = Date.now();
  var avatars = MINIAPP_syncPersistentAvatars_(12, 2.2 * 60 * 1000);
  var teams = MINIAPP_syncDirtyTeamPhotos_(started, 4.5 * 60 * 1000);
  return { ok: true, version: MINIAPP_PERSISTENT_MEDIA_VERSION, avatars: avatars, teams: teams };
}

function MINIAPP_teamMediaOnEdit(e) {
  try {
    if (!e || !e.range) return;
    var sheet = e.range.getSheet();
    if (!sheet || sheet.getName() !== MINIAPP_TEAM_MEDIA_SHEET) return;
    if (e.range.getLastRow() < 2) return;

    // Current CRM: A=Игра, B=Команда, C=Фото.
    // Mark only edits touching these identity/media columns.
    if (e.range.getColumn() > 3 || e.range.getLastColumn() < 1) return;

    var rows = [];
    var first = Math.max(2, e.range.getRow());
    var last = e.range.getLastRow();
    for (var r = first; r <= last; r += 1) rows.push(r);
    MINIAPP_markTeamRowsDirty_(rows);
  } catch (err) {
    console.warn('MINIAPP team onEdit:', err && err.message ? err.message : err);
  }
}

function MINIAPP_teamMediaOnChange(e) {
  try {
    var ss = e && e.source ? e.source : SpreadsheetApp.openById(MINIAPP_TEAM_MEDIA_SPREADSHEET_ID);
    var active = ss.getActiveSheet();
    if (active && active.getName() === MINIAPP_TEAM_MEDIA_SHEET) {
      PropertiesService.getScriptProperties().setProperty(MINIAPP_TEAM_MEDIA_FULL_PROP, '1');
    }
  } catch (err) {
    console.warn('MINIAPP team onChange:', err && err.message ? err.message : err);
  }
}

function MINIAPP_installPersistentMediaTriggers_() {
  var oldHandlers = {
    MINIAPP_syncMediaCacheBatch: true,
    MINIAPP_syncMediaCacheSmartBatch: true,
    MINIAPP_syncPersistentMedia: true,
    MINIAPP_teamMediaOnEdit: true,
    MINIAPP_teamMediaOnChange: true
  };

  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    var fn = trigger.getHandlerFunction ? trigger.getHandlerFunction() : '';
    if (oldHandlers[fn]) ScriptApp.deleteTrigger(trigger);
  });

  var ss = SpreadsheetApp.openById(MINIAPP_TEAM_MEDIA_SPREADSHEET_ID);

  ScriptApp.newTrigger('MINIAPP_syncPersistentMedia')
    .timeBased()
    .everyMinutes(5)
    .create();

  ScriptApp.newTrigger('MINIAPP_teamMediaOnEdit')
    .forSpreadsheet(ss)
    .onEdit()
    .create();

  ScriptApp.newTrigger('MINIAPP_teamMediaOnChange')
    .forSpreadsheet(ss)
    .onChange()
    .create();
}

function MINIAPP_syncPersistentAvatars_(maxItems, maxMs) {
  var props = PropertiesService.getScriptProperties();
  var cfg = MINIAPP_mediaConfig_(props);
  var snapshot = MINIAPP_mediaLoadSnapshot_(cfg);
  var all = MINIAPP_mediaBuildItems_(snapshot);
  var items = all.filter(function(item) { return item && item.kind === 'avatar'; });
  var existing = MINIAPP_mediaGithubPathSet_(cfg);
  var missing = items.filter(function(item) { return !existing[item.path]; });

  var processed = 0;
  var cached = 0;
  var failed = 0;
  var started = Date.now();

  for (var i = 0; i < missing.length && processed < maxItems && (Date.now() - started) < maxMs; i += 1) {
    var item = missing[i];
    processed += 1;
    try {
      var blob = MINIAPP_mediaFetchAvatar_(item, cfg);
      if (!blob || !blob.getBytes().length) {
        failed += 1;
        continue;
      }
      MINIAPP_mediaGithubCreate_(cfg, item.path, blob, item.commitMessage);
      cached += 1;
    } catch (err) {
      failed += 1;
      console.warn('MINIAPP persistent avatar:', err && err.message ? err.message : err);
    }
  }

  return {
    total: items.length,
    existing: items.length - missing.length,
    missingBefore: missing.length,
    processed: processed,
    cached: cached,
    failed: failed
  };
}

function MINIAPP_syncDirtyTeamPhotos_(overallStarted, overallMaxMs) {
  var props = PropertiesService.getScriptProperties();
  var full = props.getProperty(MINIAPP_TEAM_MEDIA_FULL_PROP) === '1';

  if (full) {
    var result = MINIAPP_reconcileAllTeamPhotos_(false, Math.max(30000, overallMaxMs - (Date.now() - overallStarted)));
    props.deleteProperty(MINIAPP_TEAM_MEDIA_FULL_PROP);
    props.deleteProperty(MINIAPP_TEAM_MEDIA_DIRTY_ROWS_PROP);
    return result;
  }

  var rows = MINIAPP_readDirtyRows_();
  if (!rows.length) return { mode: 'dirty', processed: 0, updated: 0, removed: 0, skipped: 0, failed: 0 };

  var ss = SpreadsheetApp.openById(MINIAPP_TEAM_MEDIA_SPREADSHEET_ID);
  var sheet = ss.getSheetByName(MINIAPP_TEAM_MEDIA_SHEET);
  if (!sheet) throw new Error('Sheet "Команды" not found');
  var cols = MINIAPP_teamHeaderColumns_(sheet);
  var cfg = MINIAPP_mediaConfig_(props);

  var processed = 0;
  var updated = 0;
  var removed = 0;
  var skipped = 0;
  var failed = 0;
  var remaining = [];

  for (var i = 0; i < rows.length; i += 1) {
    if ((Date.now() - overallStarted) >= overallMaxMs || processed >= 20) {
      remaining = remaining.concat(rows.slice(i));
      break;
    }

    try {
      var outcome = MINIAPP_syncOneTeamPhotoRow_(sheet, rows[i], cols, cfg, false);
      processed += 1;
      if (outcome === 'updated') updated += 1;
      else if (outcome === 'removed') removed += 1;
      else skipped += 1;
    } catch (err) {
      processed += 1;
      failed += 1;
      console.warn('MINIAPP dirty team row ' + rows[i] + ':', err && err.message ? err.message : err);
    }
  }

  MINIAPP_writeDirtyRows_(remaining);
  return { mode: 'dirty', processed: processed, updated: updated, removed: removed, skipped: skipped, failed: failed, remaining: remaining.length };
}

function MINIAPP_reconcileAllTeamPhotos_(force, maxMs) {
  var props = PropertiesService.getScriptProperties();
  var cfg = MINIAPP_mediaConfig_(props);
  var ss = SpreadsheetApp.openById(MINIAPP_TEAM_MEDIA_SPREADSHEET_ID);
  var sheet = ss.getSheetByName(MINIAPP_TEAM_MEDIA_SHEET);
  if (!sheet) throw new Error('Sheet "Команды" not found');

  var cols = MINIAPP_teamHeaderColumns_(sheet);
  var lastRow = sheet.getLastRow();
  var started = Date.now();
  var processed = 0;
  var updated = 0;
  var removed = 0;
  var skipped = 0;
  var failed = 0;

  for (var row = 2; row <= lastRow && (Date.now() - started) < maxMs; row += 1) {
    var teamName = String(sheet.getRange(row, cols.team).getDisplayValue() || '').trim();
    if (!teamName) continue;

    try {
      var outcome = MINIAPP_syncOneTeamPhotoRow_(sheet, row, cols, cfg, force);
      processed += 1;
      if (outcome === 'updated') updated += 1;
      else if (outcome === 'removed') removed += 1;
      else skipped += 1;
    } catch (err) {
      processed += 1;
      failed += 1;
      console.warn('MINIAPP team reconcile row ' + row + ':', err && err.message ? err.message : err);
    }
  }

  return { mode: force ? 'bootstrap' : 'full', processed: processed, updated: updated, removed: removed, skipped: skipped, failed: failed };
}

function MINIAPP_syncOneTeamPhotoRow_(sheet, row, cols, cfg, force) {
  var teamName = String(sheet.getRange(row, cols.team).getDisplayValue() || '').trim();
  if (!teamName) return 'skipped';

  var game = MINIAPP_teamMediaCanonicalGame_(sheet.getRange(row, cols.game).getDisplayValue());
  var identityKey = MINIAPP_teamMediaIdentityKey_(teamName, game);
  var stableHash = MINIAPP_mediaSha256Hex_(identityKey);
  var path = 'media/teams/' + stableHash + '.bin';
  var hashProp = MINIAPP_TEAM_MEDIA_HASH_PREFIX + stableHash;
  var props = PropertiesService.getScriptProperties();
  var value = sheet.getRange(row, cols.photo).getValue();

  var isImage = value && value.valueType === SpreadsheetApp.ValueType.IMAGE && typeof value.getContentUrl === 'function';
  if (!isImage) {
    var previous = props.getProperty(hashProp);
    if (previous) {
      MINIAPP_teamGithubDelete_(cfg, path, 'remove team photo ' + stableHash.slice(0, 12));
      props.deleteProperty(hashProp);
      return 'removed';
    }
    return 'skipped';
  }

  var contentUrl = String(value.getContentUrl() || '').trim();
  if (!contentUrl) throw new Error('CellImage content URL is empty');

  var response = UrlFetchApp.fetch(contentUrl, {
    method: 'get',
    muteHttpExceptions: true,
    followRedirects: true,
    headers: { 'User-Agent': 'Royal-CRM-Team-Media/1.1' }
  });
  if (response.getResponseCode() !== 200) throw new Error('team image HTTP ' + response.getResponseCode());

  var blob = response.getBlob();
  var bytes = blob.getBytes();
  if (!bytes.length) throw new Error('team image empty');

  var contentHash = MINIAPP_sha256BytesHex_(bytes);
  var previousHash = String(props.getProperty(hashProp) || '');
  if (!force && previousHash === contentHash) return 'skipped';

  MINIAPP_teamGithubUpsert_(cfg, path, blob, 'cache team photo ' + stableHash.slice(0, 12));
  props.setProperty(hashProp, contentHash);
  return 'updated';
}

function MINIAPP_teamHeaderColumns_(sheet) {
  var lastColumn = Math.max(3, sheet.getLastColumn());
  var headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  var game = 0;
  var team = 0;
  var photo = 0;

  for (var i = 0; i < headers.length; i += 1) {
    var h = String(headers[i] || '').trim().toLowerCase();
    if (h === 'игра') game = i + 1;
    if (h === 'команда') team = i + 1;
    if (h === 'фото') photo = i + 1;
  }

  // Current CRM layout fallback: A=Игра, B=Команда, C=Фото.
  if (!game) game = 1;
  if (!team) team = 2;
  if (!photo) photo = 3;
  return { game: game, team: team, photo: photo };
}

function MINIAPP_markTeamRowsDirty_(rows) {
  var current = MINIAPP_readDirtyRows_();
  var set = {};
  current.concat(rows || []).forEach(function(row) {
    var n = Number(row);
    if (isFinite(n) && n >= 2) set[n] = true;
  });
  var out = Object.keys(set).map(Number).sort(function(a, b) { return a - b; });
  MINIAPP_writeDirtyRows_(out);
}

function MINIAPP_readDirtyRows_() {
  var raw = PropertiesService.getScriptProperties().getProperty(MINIAPP_TEAM_MEDIA_DIRTY_ROWS_PROP) || '[]';
  try {
    var parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(Number).filter(function(n) { return isFinite(n) && n >= 2; }) : [];
  } catch (err) {
    return [];
  }
}

function MINIAPP_writeDirtyRows_(rows) {
  PropertiesService.getScriptProperties().setProperty(MINIAPP_TEAM_MEDIA_DIRTY_ROWS_PROP, JSON.stringify(rows || []));
}

function MINIAPP_teamGithubUpsert_(cfg, path, blob, message) {
  var url = 'https://api.github.com/repos/' + cfg.repo + '/contents/' + MINIAPP_mediaEncodePath_(path);
  var existing = UrlFetchApp.fetch(url + '?ref=' + encodeURIComponent(cfg.branch), {
    method: 'get',
    muteHttpExceptions: true,
    headers: MINIAPP_mediaGithubHeaders_(cfg)
  });

  var payload = {
    message: message,
    content: Utilities.base64Encode(blob.getBytes()),
    branch: cfg.branch
  };

  if (existing.getResponseCode() === 200) {
    var body = JSON.parse(existing.getContentText());
    if (body && body.sha) payload.sha = body.sha;
  } else if (existing.getResponseCode() !== 404) {
    throw new Error('GitHub media lookup HTTP ' + existing.getResponseCode());
  }

  var response = UrlFetchApp.fetch(url, {
    method: 'put',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
    headers: MINIAPP_mediaGithubHeaders_(cfg)
  });

  var code = response.getResponseCode();
  if (code !== 200 && code !== 201) throw new Error('GitHub media upsert HTTP ' + code);
}

function MINIAPP_teamGithubDelete_(cfg, path, message) {
  var url = 'https://api.github.com/repos/' + cfg.repo + '/contents/' + MINIAPP_mediaEncodePath_(path);
  var existing = UrlFetchApp.fetch(url + '?ref=' + encodeURIComponent(cfg.branch), {
    method: 'get',
    muteHttpExceptions: true,
    headers: MINIAPP_mediaGithubHeaders_(cfg)
  });

  if (existing.getResponseCode() === 404) return;
  if (existing.getResponseCode() !== 200) throw new Error('GitHub media delete lookup HTTP ' + existing.getResponseCode());

  var body = JSON.parse(existing.getContentText());
  var response = UrlFetchApp.fetch(url, {
    method: 'delete',
    contentType: 'application/json',
    payload: JSON.stringify({ message: message, sha: body.sha, branch: cfg.branch }),
    muteHttpExceptions: true,
    headers: MINIAPP_mediaGithubHeaders_(cfg)
  });

  var code = response.getResponseCode();
  if (code !== 200) throw new Error('GitHub media delete HTTP ' + code);
}

function MINIAPP_teamMediaCanonicalGame_(value) {
  var raw = String(value || '').trim();
  var low = raw.toLowerCase();
  if (low === 'рм' || low.indexOf('royal match') >= 0) return 'Royal Match';
  if (low === 'рк' || low.indexOf('royal kingdom') >= 0) return 'Royal Kingdom';
  return raw;
}

function MINIAPP_teamMediaIdentityKey_(teamName, game) {
  return MINIAPP_normalizeTeamMediaName_(teamName) + '\n' +
    MINIAPP_teamMediaCanonicalGame_(game).toLowerCase();
}

function MINIAPP_normalizeTeamMediaName_(value) {
  return String(value || '').trim().toLowerCase();
}

function MINIAPP_sha256BytesHex_(bytes) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  return digest.map(function(b) {
    var n = b < 0 ? b + 256 : b;
    return ('0' + n.toString(16)).slice(-2);
  }).join('');
}
