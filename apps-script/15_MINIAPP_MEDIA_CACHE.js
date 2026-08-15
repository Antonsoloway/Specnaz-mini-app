/*
 * Royal CRM / Таблица ЧП
 * 15_MINIAPP_MEDIA_CACHE.js
 * v1.0.0
 *
 * Persistent private media cache for Telegram Mini App.
 * Source of truth remains snapshot.json in private DATA_GITHUB_REPO.
 * Media files are written only to DATA_GITHUB_REPO/media/... and are never
 * published in the public frontend repository.
 *
 * Required Script Properties already used by the project:
 *   DATA_GITHUB_REPO
 *   DATA_GITHUB_TOKEN
 *   DATA_GITHUB_BRANCH (optional, default main)
 *   DATA_GITHUB_PATH   (optional, default snapshot.json)
 *   TELEGRAM_BOT_TOKEN or BOT_TOKEN (for Telegram avatars)
 */

var MINIAPP_MEDIA_CACHE_VERSION = '1.0.0';
var MINIAPP_MEDIA_CACHE_BATCH_SIZE = 12;
var MINIAPP_MEDIA_CACHE_CURSOR_PROP = 'MINIAPP_MEDIA_CACHE_CURSOR';
var MINIAPP_MEDIA_CACHE_HASH_PROP = 'MINIAPP_MEDIA_CACHE_SNAPSHOT_HASH';

function MINIAPP_syncMediaCacheBatch() {
  var props = PropertiesService.getScriptProperties();
  var cfg = MINIAPP_mediaConfig_(props);
  var snapshot = MINIAPP_mediaLoadSnapshot_(cfg);
  var items = MINIAPP_mediaBuildItems_(snapshot);

  if (!items.length) {
    props.setProperty(MINIAPP_MEDIA_CACHE_CURSOR_PROP, '0');
    return { ok: true, version: MINIAPP_MEDIA_CACHE_VERSION, total: 0, processed: 0, cached: 0, skipped: 0, failed: 0 };
  }

  var snapshotHash = String(snapshot.dataHash || snapshot.generatedAt || '');
  var previousHash = String(props.getProperty(MINIAPP_MEDIA_CACHE_HASH_PROP) || '');
  var cursor = Number(props.getProperty(MINIAPP_MEDIA_CACHE_CURSOR_PROP) || 0);

  if (snapshotHash !== previousHash || !isFinite(cursor) || cursor < 0 || cursor >= items.length) {
    cursor = 0;
    props.setProperty(MINIAPP_MEDIA_CACHE_HASH_PROP, snapshotHash);
  }

  var processed = 0;
  var cached = 0;
  var skipped = 0;
  var failed = 0;
  var index = cursor;
  var started = Date.now();
  var maxMs = 4.5 * 60 * 1000;

  while (processed < MINIAPP_MEDIA_CACHE_BATCH_SIZE && index < items.length && (Date.now() - started) < maxMs) {
    var item = items[index];
    index += 1;
    processed += 1;

    try {
      if (MINIAPP_mediaGithubExists_(cfg, item.path)) {
        skipped += 1;
        continue;
      }

      var blob = item.kind === 'avatar'
        ? MINIAPP_mediaFetchAvatar_(item, cfg)
        : MINIAPP_mediaFetchTeamPhoto_(item);

      if (!blob || !blob.getBytes().length) {
        failed += 1;
        continue;
      }

      MINIAPP_mediaGithubCreate_(cfg, item.path, blob, item.commitMessage);
      cached += 1;
    } catch (err) {
      failed += 1;
      console.warn('MINIAPP media cache item failed:', item.kind, item.path, err && err.message ? err.message : err);
    }
  }

  if (index >= items.length) index = 0;
  props.setProperty(MINIAPP_MEDIA_CACHE_CURSOR_PROP, String(index));

  return {
    ok: true,
    version: MINIAPP_MEDIA_CACHE_VERSION,
    total: items.length,
    cursor: index,
    processed: processed,
    cached: cached,
    skipped: skipped,
    failed: failed
  };
}

function MINIAPP_installMediaCacheTrigger() {
  var handler = 'MINIAPP_syncMediaCacheBatch';
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction && trigger.getHandlerFunction() === handler) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger(handler)
    .timeBased()
    .everyMinutes(5)
    .create();

  return { ok: true, handler: handler, everyMinutes: 5, version: MINIAPP_MEDIA_CACHE_VERSION };
}

function MINIAPP_mediaConfig_(props) {
  var repo = String(props.getProperty('DATA_GITHUB_REPO') || '').trim();
  var token = String(props.getProperty('DATA_GITHUB_TOKEN') || '').trim();
  var branch = String(props.getProperty('DATA_GITHUB_BRANCH') || 'main').trim();
  var snapshotPath = String(props.getProperty('DATA_GITHUB_PATH') || 'snapshot.json').trim();
  var botToken = String(props.getProperty('TELEGRAM_BOT_TOKEN') || props.getProperty('BOT_TOKEN') || '').trim();

  if (!repo) throw new Error('DATA_GITHUB_REPO is missing');
  if (!token) throw new Error('DATA_GITHUB_TOKEN is missing');

  return { repo: repo, token: token, branch: branch, snapshotPath: snapshotPath, botToken: botToken };
}

function MINIAPP_mediaLoadSnapshot_(cfg) {
  var url = 'https://api.github.com/repos/' + cfg.repo + '/contents/' + MINIAPP_mediaEncodePath_(cfg.snapshotPath) + '?ref=' + encodeURIComponent(cfg.branch);
  var response = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true,
    headers: MINIAPP_mediaGithubHeaders_(cfg)
  });

  if (response.getResponseCode() !== 200) {
    throw new Error('snapshot fetch HTTP ' + response.getResponseCode());
  }

  var body = JSON.parse(response.getContentText());
  var encoded = String(body.content || '').replace(/\s+/g, '');
  if (!encoded) throw new Error('snapshot is empty');
  return JSON.parse(Utilities.newBlob(Utilities.base64Decode(encoded)).getDataAsString('UTF-8'));
}

function MINIAPP_mediaBuildItems_(snapshot) {
  var items = [];
  var participants = Array.isArray(snapshot.participants) ? snapshot.participants : [];
  var teams = Array.isArray(snapshot.teams) ? snapshot.teams : [];

  participants.forEach(function(p) {
    var fileId = String(p && p.avatarFileId || '').trim();
    var telegramId = String(p && p.telegramId || '').trim();
    var chatState = String(p && p.chatState || '').trim();
    if (!fileId || chatState !== 'В чате') return;

    items.push({
      kind: 'avatar',
      sourceKey: fileId,
      fileId: fileId,
      telegramId: telegramId,
      path: 'media/avatars/' + MINIAPP_mediaSha256Hex_(fileId) + '.bin',
      commitMessage: 'cache avatar ' + MINIAPP_mediaSha256Hex_(fileId).slice(0, 12)
    });
  });

  teams.forEach(function(t) {
    var photoUrl = String(t && t.photoUrl || '').trim();
    var teamName = String(t && t.name || '').trim();
    if (!photoUrl) return;

    items.push({
      kind: 'team',
      sourceKey: photoUrl,
      photoUrl: photoUrl,
      teamName: teamName,
      path: 'media/teams/' + MINIAPP_mediaSha256Hex_(photoUrl) + '.bin',
      commitMessage: 'cache team photo ' + MINIAPP_mediaSha256Hex_(photoUrl).slice(0, 12)
    });
  });

  return items;
}

function MINIAPP_mediaFetchAvatar_(item, cfg) {
  if (!cfg.botToken) throw new Error('Telegram bot token property is missing');

  var filePath = MINIAPP_mediaTelegramFilePath_(item.fileId, cfg.botToken);
  if (!filePath && item.telegramId) {
    var freshId = MINIAPP_mediaFreshAvatarFileId_(item.telegramId, cfg.botToken);
    if (freshId) filePath = MINIAPP_mediaTelegramFilePath_(freshId, cfg.botToken);
  }
  if (!filePath) return null;

  var response = UrlFetchApp.fetch('https://api.telegram.org/file/bot' + cfg.botToken + '/' + filePath, {
    method: 'get',
    muteHttpExceptions: true,
    followRedirects: true
  });

  if (response.getResponseCode() !== 200) return null;
  return response.getBlob();
}

function MINIAPP_mediaFreshAvatarFileId_(telegramId, botToken) {
  var url = 'https://api.telegram.org/bot' + botToken + '/getUserProfilePhotos?user_id=' + encodeURIComponent(telegramId) + '&offset=0&limit=1';
  var response = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) return '';

  var body = JSON.parse(response.getContentText());
  var photos = body && body.ok && body.result && Array.isArray(body.result.photos) ? body.result.photos : [];
  var sizes = photos.length && Array.isArray(photos[0]) ? photos[0] : [];
  for (var i = sizes.length - 1; i >= 0; i -= 1) {
    var fileId = String(sizes[i] && sizes[i].file_id || '').trim();
    if (fileId) return fileId;
  }
  return '';
}

function MINIAPP_mediaTelegramFilePath_(fileId, botToken) {
  if (!fileId) return '';
  var url = 'https://api.telegram.org/bot' + botToken + '/getFile?file_id=' + encodeURIComponent(fileId);
  var response = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) return '';

  var body = JSON.parse(response.getContentText());
  return body && body.ok && body.result ? String(body.result.file_path || '').trim() : '';
}

function MINIAPP_mediaFetchTeamPhoto_(item) {
  var response = UrlFetchApp.fetch(item.photoUrl, {
    method: 'get',
    muteHttpExceptions: true,
    followRedirects: true,
    headers: { 'User-Agent': 'Royal-CRM-MiniApp-MediaCache/1.0' }
  });
  if (response.getResponseCode() !== 200) return null;
  return response.getBlob();
}

function MINIAPP_mediaGithubExists_(cfg, path) {
  var url = 'https://api.github.com/repos/' + cfg.repo + '/contents/' + MINIAPP_mediaEncodePath_(path) + '?ref=' + encodeURIComponent(cfg.branch);
  var response = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true,
    headers: MINIAPP_mediaGithubHeaders_(cfg)
  });
  var code = response.getResponseCode();
  if (code === 200) return true;
  if (code === 404) return false;
  throw new Error('GitHub exists HTTP ' + code);
}

function MINIAPP_mediaGithubCreate_(cfg, path, blob, message) {
  var url = 'https://api.github.com/repos/' + cfg.repo + '/contents/' + MINIAPP_mediaEncodePath_(path);
  var payload = {
    message: message,
    content: Utilities.base64Encode(blob.getBytes()),
    branch: cfg.branch
  };

  var response = UrlFetchApp.fetch(url, {
    method: 'put',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
    headers: MINIAPP_mediaGithubHeaders_(cfg)
  });

  var code = response.getResponseCode();
  if (code === 200 || code === 201 || code === 409 || code === 422) return;
  throw new Error('GitHub create HTTP ' + code);
}

function MINIAPP_mediaGithubHeaders_(cfg) {
  return {
    Authorization: 'Bearer ' + cfg.token,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Royal-CRM-MiniApp-MediaCache'
  };
}

function MINIAPP_mediaEncodePath_(path) {
  return String(path || '').split('/').map(encodeURIComponent).join('/');
}

function MINIAPP_mediaSha256Hex_(value) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value || ''), Utilities.Charset.UTF_8);
  return bytes.map(function(b) {
    var n = b < 0 ? b + 256 : b;
    return ('0' + n.toString(16)).slice(-2);
  }).join('');
}
