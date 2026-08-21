/*
 * Royal CRM / Таблица ЧП
 * 30_MINIAPP_ADMIN_WRITE_BACKEND.js
 * v0.6.0-write.5
 *
 * Server-to-server write gateway for Mini App v0.6.
 * The browser NEVER sends CRM mutation payloads directly to Apps Script.
 * Flow:
 *   Mini App -> Cloudflare Worker /admin-write
 *   Worker checks session + fresh Telegram admin status
 *   Worker signs the mutation with BOT_TOKEN (already secret on both servers)
 *   Apps Script verifies HMAC + timestamp + CRM membership + fresh Telegram admin
 *   then calls final mutation helpers from 33_MINIAPP_ADMIN_WRITE_FINAL.js.
 */

var MINIAPP_ADMIN_WRITE_BACKEND_VERSION = '0.6.0-write.5';
var MINIAPP_ADMIN_WRITE_BACKEND_MAX_AGE_SEC = 90;
var MINIAPP_ADMIN_WRITE_BACKEND_FUTURE_SKEW_SEC = 30;
var MINIAPP_ADMIN_WRITE_BACKEND_ALLOWED_OPS = {
  updateParticipant: true,
  createParticipant: true,
  deleteParticipant: true,
  updateTeam: true,
  createTeam: true,
  deleteTeam: true
};

/** Called only from MINIAPP_doPost_ in 12_MINI_APP_API.js. */
function MINIAPP_adminWriteBackendMaybeHandle_(e) {
  var action = MINIAPP_adminWriteValue_(e && e.parameter && e.parameter.action);
  var backend = MINIAPP_adminWriteValue_(e && e.parameter && e.parameter.backend);
  if (action !== MINIAPP_ADMIN_WRITE_ACTION || backend !== '1') return null;

  var result;
  try {
    result = MINIAPP_adminWriteBackendExecute_(e);
  } catch (error) {
    console.error('MINIAPP admin backend fatal', error && error.stack ? error.stack : error);
    result = MINIAPP_adminWriteError_(
      'ADMIN_WRITE_SERVER_ERROR',
      'Не удалось сохранить изменение. Обновите админ-режим перед повтором.'
    );
  }
  result.version = MINIAPP_ADMIN_WRITE_BACKEND_VERSION;
  return MINIAPP_adminWriteBackendJson_(result);
}

function MINIAPP_adminWriteBackendExecute_(e) {
  if (typeof MINIAPP_adminWriteDecodePayload_ !== 'function' ||
      typeof MINIAPP_adminWriteFindJournalRequest_ !== 'function' ||
      typeof MINIAPP_adminWriteFinalDispatch_ !== 'function' ||
      typeof MINIAPP_findCrmProfile_ !== 'function' ||
      typeof MINIAPP_getTelegramAdminInfo_ !== 'function') {
    return MINIAPP_adminWriteError_('WRITE_HELPERS_MISSING', 'Сервер редактирования установлен не полностью.');
  }

  var requestId = MINIAPP_adminWriteRequestId_(e && e.parameter && e.parameter.requestId);
  var adminId = MINIAPP_adminWriteTelegramId_(e && e.parameter && e.parameter.adminTelegramId);
  var op = MINIAPP_adminWriteValue_(e && e.parameter && e.parameter.op);
  var payloadRaw = MINIAPP_adminWriteValue_(e && e.parameter && e.parameter.payload);
  var timestampText = MINIAPP_adminWriteValue_(e && e.parameter && e.parameter.timestamp);
  var signature = MINIAPP_adminWriteValue_(e && e.parameter && e.parameter.signature).toLowerCase();

  if (!requestId) return MINIAPP_adminWriteError_('INVALID_REQUEST_ID', 'Некорректный идентификатор операции.');
  if (!adminId) return MINIAPP_adminWriteError_('ADMIN_ID_INVALID', 'Не удалось определить администратора.');
  if (!MINIAPP_ADMIN_WRITE_BACKEND_ALLOWED_OPS[op]) {
    return MINIAPP_adminWriteError_('OPERATION_NOT_ALLOWED', 'Эта операция не разрешена в v0.6.');
  }
  if (!/^\d{10,13}$/.test(timestampText)) {
    return MINIAPP_adminWriteError_('BACKEND_TIMESTAMP_INVALID', 'Некорректная серверная метка времени.');
  }
  if (!/^[0-9a-f]{64}$/.test(signature)) {
    return MINIAPP_adminWriteError_('BACKEND_SIGNATURE_INVALID', 'Серверная подпись отсутствует или повреждена.');
  }

  var nowSec = Math.floor(Date.now() / 1000);
  var timestampSec = Number(timestampText);
  if (!isFinite(timestampSec) ||
      nowSec - timestampSec > MINIAPP_ADMIN_WRITE_BACKEND_MAX_AGE_SEC ||
      timestampSec - nowSec > MINIAPP_ADMIN_WRITE_BACKEND_FUTURE_SKEW_SEC) {
    return MINIAPP_adminWriteError_('BACKEND_REQUEST_EXPIRED', 'Серверный запрос устарел.');
  }

  var tokenProperty = typeof MINIAPP_TOKEN_PROPERTY !== 'undefined'
    ? MINIAPP_TOKEN_PROPERTY : 'TELEGRAM_BOT_TOKEN';
  var botToken = MINIAPP_adminWriteValue_(
    PropertiesService.getScriptProperties().getProperty(tokenProperty)
  );
  if (!botToken) return MINIAPP_adminWriteError_('BACKEND_SECRET_MISSING', 'Не найден серверный секрет Telegram.');

  var canonical = MINIAPP_adminWriteBackendCanonical_(
    requestId, adminId, op, timestampText, payloadRaw
  );
  var expected = MINIAPP_adminWriteBackendHmacHex_(botToken, canonical);
  if (!MINIAPP_adminWriteBackendConstantTimeEqual_(expected, signature)) {
    return MINIAPP_adminWriteError_('BACKEND_SIGNATURE_MISMATCH', 'Серверная подпись не подтверждена.');
  }

  var payload;
  try {
    payload = MINIAPP_adminWriteDecodePayload_(payloadRaw);
  } catch (_) {
    return MINIAPP_adminWriteError_('PAYLOAD_INVALID', 'Не удалось прочитать данные изменения.');
  }

  var cached = CacheService.getScriptCache().get(MINIAPP_ADMIN_WRITE_CACHE_PREFIX + requestId);
  if (cached) {
    try {
      var cachedResult = JSON.parse(cached);
      cachedResult.duplicate = true;
      cachedResult.idempotency = 'CACHE';
      cachedResult.version = MINIAPP_ADMIN_WRITE_BACKEND_VERSION;
      return cachedResult;
    } catch (_) {}
  }

  var lock = LockService.getScriptLock();
  var mutationStarted = false;
  try {
    if (!lock.tryLock(20000)) {
      return MINIAPP_adminWriteError_('WRITE_BUSY', 'База занята другой операцией. Повторите через несколько секунд.');
    }

    var journalDuplicate = MINIAPP_adminWriteFindJournalRequest_(requestId);
    if (journalDuplicate) {
      var duplicateResult = {
        ok: true,
        duplicate: true,
        idempotency: 'JOURNAL',
        requestId: requestId,
        op: journalDuplicate.op || op,
        entityType: journalDuplicate.entityType || '',
        entityKey: journalDuplicate.entityKey || '',
        row: Number(journalDuplicate.row || 0),
        version: MINIAPP_ADMIN_WRITE_BACKEND_VERSION,
        message: 'Эта операция уже была сохранена ранее.'
      };
      duplicateResult.adminSnapshot = MINIAPP_adminWriteRefreshAdminSnapshot_();
      MINIAPP_adminWriteCacheResult_(requestId, duplicateResult);
      return duplicateResult;
    }

    // Defense in depth: even a valid Worker signature is not enough. The admin
    // must still be in CRM and still be a Telegram administrator right now.
    var profile = MINIAPP_findCrmProfile_(adminId);
    if (!profile || !profile.found || MINIAPP_adminWriteValue_(profile.chatState) !== 'В чате') {
      return MINIAPP_adminWriteError_('ADMIN_NOT_IN_CHAT', 'Админ больше не состоит в Чате Победителей.');
    }
    var adminInfo = MINIAPP_getTelegramAdminInfo_(adminId);
    if (!adminInfo || !adminInfo.isAdmin) {
      return MINIAPP_adminWriteError_('ADMIN_REQUIRED', 'Права администратора больше не подтверждаются.');
    }

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var context = {
      ss: ss,
      adminId: adminId,
      adminUsername: MINIAPP_adminWriteUsername_(profile.username || '') || '',
      requestId: requestId,
      op: op,
      payload: payload
    };

    if (typeof beginPublicDataMutation_ === 'function') {
      try {
        beginPublicDataMutation_('miniapp_admin_write_final:' + op + ':' + requestId);
        mutationStarted = true;
      } catch (_) {}
    }

    var result = MINIAPP_adminWriteFinalDispatch_(context);
    if (!result || !result.ok) {
      return result || MINIAPP_adminWriteError_('WRITE_FAILED', 'Изменение не сохранено.');
    }

    // Store result before snapshot refresh. If the network dies after the Sheet
    // commit, a Worker retry with the same requestId cannot repeat the mutation.
    MINIAPP_adminWriteCacheResult_(requestId, result);
    result.adminSnapshot = MINIAPP_adminWriteRefreshAdminSnapshot_();
    result.version = MINIAPP_ADMIN_WRITE_BACKEND_VERSION;
    MINIAPP_adminWriteCacheResult_(requestId, result);
    return result;
  } finally {
    if (mutationStarted && typeof finishPublicDataMutation_ === 'function') {
      try {
        finishPublicDataMutation_('miniapp_admin_write_final:' + op + ':' + requestId);
      } catch (_) {}
    }
    try { lock.releaseLock(); } catch (_) {}
  }
}

function MINIAPP_adminWriteBackendCanonical_(requestId, adminId, op, timestamp, payloadRaw) {
  return [
    'ROYAL_CRM_ADMIN_WRITE_V1',
    String(requestId || ''),
    String(adminId || ''),
    String(op || ''),
    String(timestamp || ''),
    String(payloadRaw || '')
  ].join('\n');
}

function MINIAPP_adminWriteBackendHmacHex_(secret, text) {
  var bytes = Utilities.computeHmacSha256Signature(
    String(text || ''),
    String(secret || ''),
    Utilities.Charset.UTF_8
  );
  return bytes.map(function(b) {
    var n = b < 0 ? b + 256 : b;
    return ('0' + n.toString(16)).slice(-2);
  }).join('');
}

function MINIAPP_adminWriteBackendConstantTimeEqual_(a, b) {
  a = String(a || '');
  b = String(b || '');
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function MINIAPP_adminWriteBackendJson_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data || {}))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Source-only preflight. Does not change participants or teams. */
function MINIAPP_adminWritePreflight() {
  var issues = [];
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var base = ss.getSheetByName(SHEET_BASE);
  var teams = ss.getSheetByName(SHEET_TEAMS);
  var helper = ss.getSheetByName(typeof FINALROLE_HELPER_SHEET_ !== 'undefined' ? FINALROLE_HELPER_SHEET_ : 'Списки');

  if (!base) issues.push('BASE_SHEET_MISSING');
  if (!teams) issues.push('TEAMS_SHEET_MISSING');
  if (!helper) issues.push('HELPER_SHEET_MISSING');
  if (typeof MINIAPP_validateInitData_ !== 'function') issues.push('MINIAPP_API_MISSING');
  if (typeof MINIAPP_adminWriteCreateParticipant_ !== 'function') issues.push('WRITE_29_HELPERS_MISSING');
  if (typeof MINIAPP_adminWriteHardenedUpdateParticipant_ !== 'function') issues.push('WRITE_31_HARDENED_MISSING');
  if (typeof MINIAPP_adminTeamPhotoPrepareUpload_ !== 'function') issues.push('WRITE_32_PHOTO_UPLOAD_MISSING');
  if (typeof MINIAPP_adminTeamPhotoApplyCell_ !== 'function') issues.push('WRITE_32_CELLIMAGE_MISSING');
  if (typeof MINIAPP_adminWriteFinalDispatch_ !== 'function') issues.push('WRITE_33_FINAL_DISPATCH_MISSING');
  if (typeof MINIAPP_adminWriteFinalMeta_ !== 'function') issues.push('WRITE_33_FINAL_META_MISSING');
  if (typeof MINIAPP_adminWriteFinalJournalData_ !== 'function') issues.push('WRITE_33_FINAL_JOURNAL_MISSING');
  if (typeof MINIAPP_adminWriteFinalDeleteParticipant_ !== 'function') issues.push('WRITE_33_PARTICIPANT_DELETE_MISSING');
  if (typeof MINIAPP_adminWriteFinalDeleteTeam_ !== 'function') issues.push('WRITE_33_TEAM_DELETE_MISSING');
  if (typeof MINIAPP_teamGithubUpsert_ !== 'function') issues.push('PERSISTENT_TEAM_MEDIA_UPSERT_MISSING');
  if (typeof processManualCounterEdits_ !== 'function') issues.push('MANUAL_COUNTER_INVARIANT_MISSING');
  if (typeof sortBaseByChatState_ !== 'function') issues.push('BASE_SORT_INVARIANT_MISSING');
  if (typeof finalRoleNormalizeRowSlot_ !== 'function') issues.push('FINAL_ROLE_NORMALIZER_MISSING');
  if (typeof finalRoleCascadeTeamRename_ !== 'function') issues.push('TEAM_CASCADE_MISSING');
  if (typeof MINIAPP_exportAdminSnapshotUnlocked_ !== 'function') issues.push('ADMIN_SNAPSHOT_EXPORTER_MISSING');

  var tokenProperty = typeof MINIAPP_TOKEN_PROPERTY !== 'undefined'
    ? MINIAPP_TOKEN_PROPERTY : 'TELEGRAM_BOT_TOKEN';
  if (!PropertiesService.getScriptProperties().getProperty(tokenProperty)) {
    issues.push('BOT_TOKEN_MISSING');
  }

  var endpoint = '';
  try { endpoint = String(ScriptApp.getService().getUrl() || '').trim(); } catch (_) {}
  if (!endpoint) issues.push('WEB_APP_URL_MISSING');

  var result = {
    ok: issues.length === 0,
    version: MINIAPP_ADMIN_WRITE_BACKEND_VERSION,
    hardenedVersion: typeof MINIAPP_ADMIN_WRITE_HARDENED_VERSION !== 'undefined'
      ? MINIAPP_ADMIN_WRITE_HARDENED_VERSION : '',
    finalVersion: typeof MINIAPP_ADMIN_WRITE_FINAL_VERSION !== 'undefined'
      ? MINIAPP_ADMIN_WRITE_FINAL_VERSION : '',
    photoVersion: typeof MINIAPP_ADMIN_TEAM_PHOTO_VERSION !== 'undefined'
      ? MINIAPP_ADMIN_TEAM_PHOTO_VERSION : '',
    issues: issues,
    endpointPresent: !!endpoint,
    firstEmptyParticipantRow: base ? MINIAPP_adminWriteFindEmptyParticipantRow_(base) : 0,
    firstEmptyTeamRow: teams ? MINIAPP_adminWriteFindEmptyTeamRow_(teams) : 0,
    deleteEnabled: typeof MINIAPP_adminWriteFinalDeleteParticipant_ === 'function' &&
      typeof MINIAPP_adminWriteFinalDeleteTeam_ === 'function',
    transport: 'worker-signed-hmac',
    teamPhoto: typeof MINIAPP_adminTeamPhotoPrepareUpload_ === 'function' &&
      typeof MINIAPP_adminTeamPhotoApplyCell_ === 'function' &&
      typeof MINIAPP_teamGithubUpsert_ === 'function',
    counterHistoryInvariant: typeof processManualCounterEdits_ === 'function',
    baseSortInvariant: typeof sortBaseByChatState_ === 'function',
    teamRenameCascadeInvariant: typeof finalRoleCascadeTeamRename_ === 'function'
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}
