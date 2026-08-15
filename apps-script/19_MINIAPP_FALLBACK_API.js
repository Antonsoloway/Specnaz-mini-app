/*
 * Royal CRM / Таблица ЧП
 * 19_MINIAPP_FALLBACK_API.js
 * v1.0.1
 *
 * Network fallback API for Mini App when workers.dev is unreachable.
 * Reuses the existing Telegram initData validator from 12_MINI_APP_API.js
 * and the private GitHub configuration/helpers from 15_MINIAPP_MEDIA_CACHE.js.
 * Responses are JSONP so Android Telegram WebView does not depend on CORS.
 */

var MINIAPP_FALLBACK_API_VERSION = '1.0.1';

function MINIAPP_fallbackMaybeHandle_(e) {
  var action = MINIAPP_value_(e && e.parameter && e.parameter.action);
  var allowed = {
    'fallback-auth': true,
    'fallback-snapshot': true,
    'fallback-avatar': true,
    'fallback-team-photo': true
  };

  if (!allowed[action]) return null;

  var callback = MINIAPP_callback_(e && e.parameter && e.parameter.callback);
  var data;

  try {
    if (action === 'fallback-auth') {
      data = MINIAPP_fallbackAuth_(e);
    } else if (action === 'fallback-snapshot') {
      data = MINIAPP_fallbackSnapshot_(e);
    } else if (action === 'fallback-avatar') {
      data = MINIAPP_fallbackAvatar_(e);
    } else if (action === 'fallback-team-photo') {
      data = MINIAPP_fallbackTeamPhoto_(e);
    }
  } catch (err) {
    console.error('MINIAPP fallback API error:', action, err && err.stack ? err.stack : err);
    data = {
      ok: false,
      access: false,
      error: 'FALLBACK_SERVER_ERROR',
      message: 'Резервный сервер временно недоступен.',
      version: MINIAPP_FALLBACK_API_VERSION
    };
  }

  return MINIAPP_jsonp_(callback, data);
}

function MINIAPP_fallbackAuth_(e) {
  var auth = MINIAPP_fallbackAuthorize_(e);
  if (!auth.ok) return auth.result;

  var result = auth.result || {};
  result.backend = 'google-apps-script';
  result.fallbackVersion = MINIAPP_FALLBACK_API_VERSION;
  return result;
}

function MINIAPP_fallbackSnapshot_(e) {
  var auth = MINIAPP_fallbackAuthorize_(e);
  if (!auth.ok) return auth.result;

  var cfg = MINIAPP_mediaConfig_(PropertiesService.getScriptProperties());
  var snapshot = MINIAPP_mediaLoadSnapshot_(cfg);

  return {
    ok: true,
    access: true,
    backend: 'google-apps-script',
    version: MINIAPP_FALLBACK_API_VERSION,
    snapshot: snapshot
  };
}

function MINIAPP_fallbackAvatar_(e) {
  var auth = MINIAPP_fallbackAuthorize_(e);
  if (!auth.ok) return auth.result;

  var fileId = MINIAPP_value_(e && e.parameter && e.parameter.fileId);
  if (!fileId) return MINIAPP_fallbackError_('AVATAR_FILE_ID_MISSING', 'Аватар не указан.');

  var cfg = MINIAPP_mediaConfig_(PropertiesService.getScriptProperties());
  var snapshot = MINIAPP_mediaLoadSnapshot_(cfg);
  var participants = snapshot && Array.isArray(snapshot.participants) ? snapshot.participants : [];
  var allowed = participants.some(function(p) {
    return String(p && p.chatState || '').trim() === 'В чате' &&
      String(p && p.avatarFileId || '') === fileId;
  });

  if (!allowed) return MINIAPP_fallbackError_('AVATAR_NOT_ALLOWED', 'Аватар недоступен.');

  var path = 'media/avatars/' + MINIAPP_mediaSha256Hex_(fileId) + '.bin';
  return MINIAPP_fallbackMediaResult_(cfg, path, 'AVATAR_NOT_CACHED', 'Аватар ещё не закэширован.');
}

function MINIAPP_fallbackTeamPhoto_(e) {
  var auth = MINIAPP_fallbackAuthorize_(e);
  if (!auth.ok) return auth.result;

  var teamName = MINIAPP_value_(e && e.parameter && e.parameter.team);
  if (!teamName) return MINIAPP_fallbackError_('TEAM_MISSING', 'Команда не указана.');

  var cfg = MINIAPP_mediaConfig_(PropertiesService.getScriptProperties());
  var snapshot = MINIAPP_mediaLoadSnapshot_(cfg);
  var teams = snapshot && Array.isArray(snapshot.teams) ? snapshot.teams : [];
  var wanted = MINIAPP_fallbackNormalizeTeam_(teamName);
  var exists = teams.some(function(t) {
    return MINIAPP_fallbackNormalizeTeam_(t && t.name) === wanted;
  });

  if (!exists) return MINIAPP_fallbackError_('TEAM_NOT_FOUND', 'Команда не найдена.');

  var path = 'media/teams/' + MINIAPP_mediaSha256Hex_(wanted) + '.bin';
  return MINIAPP_fallbackMediaResult_(cfg, path, 'TEAM_PHOTO_NOT_CACHED', 'Фото команды ещё не закэшировано.');
}

function MINIAPP_fallbackAuthorize_(e) {
  var initData = MINIAPP_value_(e && e.parameter && e.parameter.initData);
  if (!initData) {
    return {
      ok: false,
      result: MINIAPP_fallbackError_('INIT_DATA_MISSING', 'Откройте приложение из Telegram.')
    };
  }

  var authEvent = { parameter: { action: 'auth', initData: initData } };
  var result = MINIAPP_buildAuthResult_(authEvent);
  var allowed = !!(result && result.ok && result.access);

  return { ok: allowed, result: result };
}

function MINIAPP_fallbackMediaResult_(cfg, path, errorCode, errorMessage) {
  var media = MINIAPP_fallbackReadPrivateMedia_(cfg, path);
  if (!media) return MINIAPP_fallbackError_(errorCode, errorMessage);

  return {
    ok: true,
    access: true,
    backend: 'google-apps-script',
    version: MINIAPP_FALLBACK_API_VERSION,
    mime: media.mime,
    base64: media.base64
  };
}

function MINIAPP_fallbackReadPrivateMedia_(cfg, path) {
  var url = 'https://api.github.com/repos/' + cfg.repo + '/contents/' + MINIAPP_mediaEncodePath_(path) + '?ref=' + encodeURIComponent(cfg.branch);
  var headers = MINIAPP_mediaGithubHeaders_(cfg);
  headers.Accept = 'application/vnd.github.raw+json';

  var response = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true,
    followRedirects: true,
    headers: headers
  });

  if (response.getResponseCode() === 404) return null;
  if (response.getResponseCode() !== 200) {
    throw new Error('fallback media HTTP ' + response.getResponseCode());
  }

  var bytes = response.getBlob().getBytes();
  if (!bytes || !bytes.length) return null;

  return {
    mime: MINIAPP_fallbackDetectMime_(bytes),
    base64: Utilities.base64Encode(bytes)
  };
}

function MINIAPP_fallbackDetectMime_(bytes) {
  function u(i) {
    var n = Number(bytes[i] || 0);
    return n < 0 ? n + 256 : n;
  }

  if (bytes.length >= 3 && u(0) === 0xff && u(1) === 0xd8 && u(2) === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && u(0) === 0x89 && u(1) === 0x50 && u(2) === 0x4e && u(3) === 0x47) return 'image/png';
  if (bytes.length >= 6) {
    var sig = String.fromCharCode(u(0), u(1), u(2), u(3), u(4), u(5));
    if (sig === 'GIF87a' || sig === 'GIF89a') return 'image/gif';
  }
  if (bytes.length >= 12) {
    var riff = String.fromCharCode(u(0), u(1), u(2), u(3));
    var webp = String.fromCharCode(u(8), u(9), u(10), u(11));
    if (riff === 'RIFF' && webp === 'WEBP') return 'image/webp';
  }
  return 'image/jpeg';
}

function MINIAPP_fallbackNormalizeTeam_(value) {
  return String(value || '').trim().toLowerCase();
}

function MINIAPP_fallbackError_(code, message) {
  return {
    ok: false,
    access: false,
    error: code,
    message: message,
    version: MINIAPP_FALLBACK_API_VERSION
  };
}
