/*
 * Royal CRM / Таблица ЧП
 * 32_MINIAPP_ADMIN_TEAM_PHOTO.js
 * v0.6.0-photo.3
 *
 * Team-photo bridge for the protected v0.6 admin-write path.
 *
 * Storage stays inside the EXISTING private media architecture:
 *   royal-crm-data/media/teams/<sha256(normalized team + game)>.bin
 *
 * Google Sheets column Команды!C remains a real CellImage. To create that
 * CellImage, Apps Script generates a SHORT-LIVED HMAC-signed Worker URL.
 * The URL expires after a few minutes and never exposes repository credentials.
 * Mini App itself still uses the existing authenticated /team-photo identity
 * route and the existing iOS/Android cache.
 */

var MINIAPP_ADMIN_TEAM_PHOTO_VERSION = '0.6.0-photo.3';
var MINIAPP_ADMIN_TEAM_PHOTO_MAX_UPLOAD_BYTES = 650000;
var MINIAPP_ADMIN_TEAM_PHOTO_MAX_EXISTING_BYTES = 8 * 1024 * 1024;
var MINIAPP_ADMIN_TEAM_PHOTO_SOURCE_BASE = 'https://royal-crm-miniapp-api.tropical-spoon.workers.dev/team-photo-source';
var MINIAPP_ADMIN_TEAM_PHOTO_SOURCE_TTL_SEC = 15 * 60;
var MINIAPP_ADMIN_TEAM_PHOTO_SOURCE_PREFIX = 'ROYAL_CRM_TEAM_PHOTO_SOURCE_V1';

function MINIAPP_adminTeamPhotoPrepareUpload_(teamName, game, rawPhoto) {
  if (!rawPhoto || typeof rawPhoto !== 'object' || Array.isArray(rawPhoto)) {
    return { ok: true, changed: false };
  }

  var encoded = String(rawPhoto.data || '').trim();
  if (!encoded) return { ok: true, changed: false };
  if (encoded.length > 1000000) {
    return MINIAPP_adminWriteError_('TEAM_PHOTO_TOO_LARGE', 'Фото слишком большое. Выберите другое изображение.');
  }

  var bytes;
  try {
    bytes = Utilities.base64Decode(encoded);
  } catch (_) {
    return MINIAPP_adminWriteError_('TEAM_PHOTO_INVALID', 'Не удалось прочитать изображение.');
  }
  if (!bytes || !bytes.length) {
    return MINIAPP_adminWriteError_('TEAM_PHOTO_EMPTY', 'Файл изображения пустой.');
  }
  if (bytes.length > MINIAPP_ADMIN_TEAM_PHOTO_MAX_UPLOAD_BYTES) {
    return MINIAPP_adminWriteError_('TEAM_PHOTO_TOO_LARGE', 'После обработки фото должно быть не больше 650 КБ.');
  }

  var contentType = MINIAPP_adminTeamPhotoDetectType_(bytes);
  if (!contentType) {
    return MINIAPP_adminWriteError_('TEAM_PHOTO_TYPE_INVALID', 'Поддерживаются JPG, PNG, WEBP и GIF.');
  }

  return MINIAPP_adminTeamPhotoStoreBytes_(teamName, game, bytes, contentType, 'admin upload');
}

function MINIAPP_adminTeamPhotoPrepareExistingForRename_(sheet, row, nextName, game) {
  if (!sheet || !row) return { ok: true, changed: false };
  var source = MINIAPP_adminTeamPhotoExistingSource_(sheet, row);
  if (!source) return { ok: true, changed: false };

  var response;
  try {
    response = UrlFetchApp.fetch(source, {
      method: 'get',
      muteHttpExceptions: true,
      followRedirects: true,
      headers: { 'User-Agent': 'Royal-CRM-Admin-Team-Photo/0.6' }
    });
  } catch (error) {
    return MINIAPP_adminWriteError_('TEAM_PHOTO_MIGRATION_FETCH_FAILED', 'Не удалось перенести текущее фото команды. Переименование отменено.');
  }
  if (response.getResponseCode() !== 200) {
    return MINIAPP_adminWriteError_('TEAM_PHOTO_MIGRATION_FETCH_FAILED', 'Не удалось получить текущее фото команды. Переименование отменено.');
  }

  var blob = response.getBlob();
  var bytes = blob.getBytes();
  if (!bytes || !bytes.length || bytes.length > MINIAPP_ADMIN_TEAM_PHOTO_MAX_EXISTING_BYTES) {
    return MINIAPP_adminWriteError_('TEAM_PHOTO_MIGRATION_INVALID', 'Текущее фото команды не удалось безопасно перенести.');
  }
  var contentType = MINIAPP_adminTeamPhotoDetectType_(bytes);
  if (!contentType) {
    return MINIAPP_adminWriteError_('TEAM_PHOTO_MIGRATION_TYPE', 'Формат текущего фото команды не поддерживается для переноса.');
  }
  return MINIAPP_adminTeamPhotoStoreBytes_(nextName, game, bytes, contentType, 'rename migration');
}

function MINIAPP_adminTeamPhotoStoreBytes_(teamName, game, bytes, contentType, reason) {
  var identityKey = MINIAPP_adminTeamPhotoIdentityKey_(teamName, game);
  if (!identityKey) {
    return MINIAPP_adminWriteError_('TEAM_PHOTO_IDENTITY_INVALID', 'Не удалось определить медиаключ команды.');
  }

  var stableHash = MINIAPP_adminTeamPhotoSha256Text_(identityKey);
  var contentHash = MINIAPP_adminTeamPhotoSha256Bytes_(bytes);
  var path = 'media/teams/' + stableHash + '.bin';
  var blob = Utilities.newBlob(bytes, contentType, 'team-photo.bin');

  try {
    if (typeof MINIAPP_mediaConfig_ !== 'function' || typeof MINIAPP_teamGithubUpsert_ !== 'function') {
      throw new Error('persistent media helpers missing');
    }
    var cfg = MINIAPP_mediaConfig_(PropertiesService.getScriptProperties());
    MINIAPP_teamGithubUpsert_(
      cfg,
      path,
      blob,
      'admin team photo ' + stableHash.slice(0, 12) + ' (' + String(reason || 'write') + ')'
    );

    var prefix = typeof MINIAPP_TEAM_MEDIA_HASH_PREFIX !== 'undefined'
      ? String(MINIAPP_TEAM_MEDIA_HASH_PREFIX)
      : 'MINIAPP_TEAM_MEDIA_HASH_';
    PropertiesService.getScriptProperties().setProperty(prefix + stableHash, contentHash);
  } catch (error) {
    console.error('Admin team photo GitHub upsert failed', error && error.stack ? error.stack : error);
    return MINIAPP_adminWriteError_('TEAM_PHOTO_STORE_FAILED', 'Не удалось сохранить фото команды. Данные команды не изменены.');
  }

  var sourceUrl = MINIAPP_adminTeamPhotoSignedSourceUrl_(stableHash, contentHash);
  if (!sourceUrl) {
    return MINIAPP_adminWriteError_('TEAM_PHOTO_SOURCE_SIGN_FAILED', 'Фото сохранено, но не удалось подготовить защищённый источник для Google Sheets.');
  }

  return {
    ok: true,
    changed: true,
    stableHash: stableHash,
    contentHash: contentHash,
    contentType: contentType,
    bytes: bytes.length,
    sourceUrl: sourceUrl
  };
}

function MINIAPP_adminTeamPhotoApplyCell_(sheet, row, prepared) {
  if (!prepared || !prepared.changed) return { ok: true, changed: false };
  if (!prepared.sourceUrl) return MINIAPP_adminWriteError_('TEAM_PHOTO_URL_MISSING', 'Не удалось сформировать защищённый адрес фото команды.');

  try {
    var image = SpreadsheetApp.newCellImage()
      .setSourceUrl(prepared.sourceUrl)
      .build();
    sheet.getRange(row, 3).setValue(image);
    SpreadsheetApp.flush();
    return { ok: true, changed: true };
  } catch (error) {
    console.error('Admin team photo CellImage failed', error && error.stack ? error.stack : error);
    return MINIAPP_adminWriteError_('TEAM_PHOTO_CELL_FAILED', 'Фото сохранено в медиахранилище, но не удалось записать его в Команды!C.');
  }
}

/**
 * Removes the obsolete private-media identity only AFTER a rename committed.
 * This prevents a future team reusing the old name from inheriting stale media.
 * Failure is non-fatal for the already committed CRM mutation and is returned as
 * a cleanup warning to the journal/result.
 */
function MINIAPP_adminTeamPhotoCleanupOldIdentity_(oldName, game, keepStableHash) {
  var identityKey = MINIAPP_adminTeamPhotoIdentityKey_(oldName, game);
  if (!identityKey) return { ok: true, changed: false, skipped: 'IDENTITY_EMPTY' };

  var stableHash = MINIAPP_adminTeamPhotoSha256Text_(identityKey);
  var keep = String(keepStableHash || '').trim().toLowerCase();
  if (keep && stableHash === keep) {
    return { ok: true, changed: false, skipped: 'SAME_MEDIA_IDENTITY', stableHash: stableHash };
  }

  try {
    if (typeof MINIAPP_mediaConfig_ !== 'function' || typeof MINIAPP_teamGithubDelete_ !== 'function') {
      throw new Error('persistent media delete helpers missing');
    }
    var props = PropertiesService.getScriptProperties();
    var cfg = MINIAPP_mediaConfig_(props);
    var path = 'media/teams/' + stableHash + '.bin';
    MINIAPP_teamGithubDelete_(cfg, path, 'cleanup renamed team photo ' + stableHash.slice(0, 12));

    var prefix = typeof MINIAPP_TEAM_MEDIA_HASH_PREFIX !== 'undefined'
      ? String(MINIAPP_TEAM_MEDIA_HASH_PREFIX)
      : 'MINIAPP_TEAM_MEDIA_HASH_';
    props.deleteProperty(prefix + stableHash);
    return { ok: true, changed: true, stableHash: stableHash };
  } catch (error) {
    console.warn('Admin old team-photo cleanup warning', error && error.message ? error.message : error);
    return {
      ok: false,
      changed: false,
      warning: 'OLD_TEAM_MEDIA_CLEANUP_FAILED',
      stableHash: stableHash
    };
  }
}

function MINIAPP_adminTeamPhotoSignedSourceUrl_(stableHash, contentHash) {
  var key = String(stableHash || '').trim().toLowerCase();
  var version = String(contentHash || '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(key) || !/^[0-9a-f]{64}$/.test(version)) return '';

  var tokenProperty = typeof MINIAPP_TOKEN_PROPERTY !== 'undefined'
    ? MINIAPP_TOKEN_PROPERTY : 'TELEGRAM_BOT_TOKEN';
  var botToken = String(
    PropertiesService.getScriptProperties().getProperty(tokenProperty) || ''
  ).trim();
  if (!botToken) return '';

  var expires = String(Math.floor(Date.now() / 1000) + MINIAPP_ADMIN_TEAM_PHOTO_SOURCE_TTL_SEC);
  var canonical = [
    MINIAPP_ADMIN_TEAM_PHOTO_SOURCE_PREFIX,
    key,
    version,
    expires
  ].join('\n');
  var signature = MINIAPP_adminTeamPhotoHmacHex_(botToken, canonical);
  if (!signature) return '';

  return MINIAPP_ADMIN_TEAM_PHOTO_SOURCE_BASE +
    '?key=' + encodeURIComponent(key) +
    '&v=' + encodeURIComponent(version) +
    '&exp=' + encodeURIComponent(expires) +
    '&sig=' + encodeURIComponent(signature);
}

function MINIAPP_adminTeamPhotoHmacHex_(secret, text) {
  var bytes = Utilities.computeHmacSha256Signature(
    String(text || ''),
    String(secret || ''),
    Utilities.Charset.UTF_8
  );
  return MINIAPP_adminTeamPhotoDigestHex_(bytes);
}

function MINIAPP_adminTeamPhotoExistingSource_(sheet, row) {
  var cell = sheet.getRange(row, 3);
  var value = cell.getValue();
  try {
    if (value && typeof value === 'object' &&
        value.valueType === SpreadsheetApp.ValueType.IMAGE &&
        typeof value.getContentUrl === 'function') {
      var contentUrl = String(value.getContentUrl() || '').trim();
      if (contentUrl) return contentUrl;
    }
  } catch (_) {}

  var formula = String(cell.getFormula() || '').trim();
  var match = formula.match(/^=IMAGE\(\s*"([^"]+)"/i);
  return match ? String(match[1] || '').trim() : '';
}

function MINIAPP_adminTeamPhotoSummary_(prepared) {
  if (!prepared || !prepared.changed) return null;
  return {
    changed: true,
    bytes: Number(prepared.bytes || 0),
    contentType: String(prepared.contentType || ''),
    contentHash: String(prepared.contentHash || '').slice(0, 16),
    mediaKey: String(prepared.stableHash || '').slice(0, 16)
  };
}

function MINIAPP_adminTeamPhotoMarkDirty_(row) {
  if (!row) return;
  try {
    if (typeof MINIAPP_markTeamRowsDirty_ === 'function') {
      MINIAPP_markTeamRowsDirty_([Number(row)]);
    }
  } catch (_) {}
}

function MINIAPP_adminTeamPhotoIdentityKey_(teamName, game) {
  if (typeof MINIAPP_teamMediaIdentityKey_ === 'function') {
    return MINIAPP_teamMediaIdentityKey_(teamName, game);
  }
  var name = String(teamName || '').trim().toLowerCase();
  var canonical = typeof MINIAPP_adminWriteCanonicalGame_ === 'function'
    ? MINIAPP_adminWriteCanonicalGame_(game)
    : String(game || '').trim();
  return name && canonical ? name + '\n' + canonical.toLowerCase() : '';
}

function MINIAPP_adminTeamPhotoSha256Text_(value) {
  if (typeof MINIAPP_mediaSha256Hex_ === 'function') {
    return MINIAPP_mediaSha256Hex_(String(value || ''));
  }
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value || ''),
    Utilities.Charset.UTF_8
  );
  return MINIAPP_adminTeamPhotoDigestHex_(digest);
}

function MINIAPP_adminTeamPhotoSha256Bytes_(bytes) {
  if (typeof MINIAPP_sha256BytesHex_ === 'function') {
    return MINIAPP_sha256BytesHex_(bytes);
  }
  return MINIAPP_adminTeamPhotoDigestHex_(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)
  );
}

function MINIAPP_adminTeamPhotoDigestHex_(digest) {
  return (digest || []).map(function(b) {
    var n = b < 0 ? b + 256 : b;
    return ('0' + n.toString(16)).slice(-2);
  }).join('');
}

function MINIAPP_adminTeamPhotoDetectType_(bytes) {
  if (!bytes || !bytes.length) return '';
  function u(index) {
    var n = Number(bytes[index]);
    return n < 0 ? n + 256 : n;
  }

  if (bytes.length >= 3 && u(0) === 0xff && u(1) === 0xd8 && u(2) === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && u(0) === 0x89 && u(1) === 0x50 && u(2) === 0x4e && u(3) === 0x47 && u(4) === 0x0d && u(5) === 0x0a && u(6) === 0x1a && u(7) === 0x0a) return 'image/png';
  if (bytes.length >= 6) {
    var gif = String.fromCharCode(u(0), u(1), u(2), u(3), u(4), u(5));
    if (gif === 'GIF87a' || gif === 'GIF89a') return 'image/gif';
  }
  if (bytes.length >= 12) {
    var riff = String.fromCharCode(u(0), u(1), u(2), u(3));
    var webp = String.fromCharCode(u(8), u(9), u(10), u(11));
    if (riff === 'RIFF' && webp === 'WEBP') return 'image/webp';
  }
  return '';
}
