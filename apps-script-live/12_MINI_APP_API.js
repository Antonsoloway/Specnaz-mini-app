/**
 * ROYAL CRM — Telegram Mini App API
 * Файл: 12_MINI_APP_API.gs
 * Версия 0.2.5
 *
 * ВАЖНО: этот файл НЕ объявляет глобальные doGet/doPost.
 * Их существующие точки входа остаются в 01_CORE_MAIN и 05_RELIABLE_WEBHOOK_QUEUE.
 *
 * Основной транспорт v0.2.4: GET/JSONP напрямую валидирует Telegram initData.
 * Это обход нестабильного cross-origin POST в Telegram Android WebView.
 * Старый POST + poll оставлен как совместимый резерв.
 */

const MINIAPP_VERSION = '0.2.5';
const MINIAPP_TOKEN_PROPERTY = 'TELEGRAM_BOT_TOKEN';
const MINIAPP_CHAT_ID_PROPERTY = 'MINI_APP_CHAT_ID';
const MINIAPP_DEFAULT_CHAT_ID = '-1002109152418';
const MINIAPP_INITDATA_MAX_AGE_SEC = 5 * 60;
const MINIAPP_ALLOWED_CHAT_STATE = 'В чате';
const MINIAPP_RESULT_TTL_SEC = 120;

function MINIAPP_doPost_(e) {
  // v0.6 admin write: only signed Worker -> Apps Script POSTs are accepted.
  if (typeof MINIAPP_adminWriteBackendMaybeHandle_ === 'function') {
    const adminWriteResponse = MINIAPP_adminWriteBackendMaybeHandle_(e);
    if (adminWriteResponse) return adminWriteResponse;
  }

  let result;
  try {
    result = MINIAPP_buildAuthResult_(e);
  } catch (error) {
    console.error('MINIAPP_doPost_ error', error && error.stack ? error.stack : error);
    result = {
      ok: false,
      access: false,
      error: 'SERVER_ERROR',
      message: 'Временная ошибка сервера. Попробуйте ещё раз.',
      version: MINIAPP_VERSION
    };
  }

  const requestId = MINIAPP_requestId_(e && e.parameter && e.parameter.requestId);
  if (requestId) {
    CacheService.getScriptCache().put(
      MINIAPP_resultKey_(requestId),
      JSON.stringify(result),
      MINIAPP_RESULT_TTL_SEC
    );
    return MINIAPP_json_({ ok: true, accepted: true, version: MINIAPP_VERSION });
  }

  return MINIAPP_json_(result);
}

function MINIAPP_doGet_(e) {
  const fallbackResponse = MINIAPP_fallbackMaybeHandle_(e);
  if (fallbackResponse) return fallbackResponse;
  const action = MINIAPP_value_(e && e.parameter && e.parameter.action);
  const callback = MINIAPP_callback_(e && e.parameter && e.parameter.callback);

  if (!callback) {
    return MINIAPP_jsonp_('__miniappInvalid', {
      ok: false,
      access: false,
      error: 'INVALID_CALLBACK',
      version: MINIAPP_VERSION
    });
  }

  // v0.2.4: прямой JSONP auth. Никакой POST для первого входа не нужен.
  if (action === 'auth') {
    let result;
    try {
      result = MINIAPP_buildAuthResult_(e);
    } catch (error) {
      console.error('MINIAPP_doGet_ auth error', error && error.stack ? error.stack : error);
      result = {
        ok: false,
        access: false,
        error: 'SERVER_ERROR',
        message: 'Временная ошибка сервера. Попробуйте ещё раз.',
        version: MINIAPP_VERSION
      };
    }
    return MINIAPP_jsonp_(callback, result);
  }

  // Старый poll оставлен для обратной совместимости.
  if (action !== 'poll') {
    return MINIAPP_jsonp_(callback, {
      ok: false,
      access: false,
      error: 'UNKNOWN_GET_ACTION',
      version: MINIAPP_VERSION
    });
  }

  const requestId = MINIAPP_requestId_(e && e.parameter && e.parameter.requestId);
  if (!requestId) {
    return MINIAPP_jsonp_(callback, {
      ok: false,
      access: false,
      error: 'INVALID_REQUEST_ID',
      version: MINIAPP_VERSION
    });
  }

  const cache = CacheService.getScriptCache();
  const key = MINIAPP_resultKey_(requestId);
  const raw = cache.get(key);

  if (!raw) {
    return MINIAPP_jsonp_(callback, {
      ok: true,
      pending: true,
      version: MINIAPP_VERSION
    });
  }

  cache.remove(key);
  let data;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    data = {
      ok: false,
      access: false,
      error: 'RESULT_PARSE_ERROR',
      message: 'Не удалось прочитать результат авторизации.',
      version: MINIAPP_VERSION
    };
  }
  return MINIAPP_jsonp_(callback, data);
}

function MINIAPP_buildAuthResult_(e) {
  const action = MINIAPP_value_(e && e.parameter && e.parameter.action);
  if (action !== 'auth') {
    return { ok: false, access: false, error: 'UNKNOWN_ACTION', version: MINIAPP_VERSION };
  }

  const initData = MINIAPP_value_(e && e.parameter && e.parameter.initData);
  if (!initData) {
    return {
      ok: false,
      access: false,
      error: 'INIT_DATA_MISSING',
      message: 'Откройте приложение из Telegram.',
      version: MINIAPP_VERSION
    };
  }

  const validated = MINIAPP_validateInitData_(initData);
  if (!validated.ok) {
    return {
      ok: false,
      access: false,
      error: validated.error,
      message: 'Не удалось подтвердить Telegram-пользователя.',
      version: MINIAPP_VERSION
    };
  }

  const tgUser = validated.user;
  const profile = MINIAPP_findCrmProfile_(tgUser.id);

  if (!profile.found || profile.chatState !== MINIAPP_ALLOWED_CHAT_STATE) {
    return {
      ok: true,
      access: false,
      reason: profile.found ? 'NOT_IN_CHAT' : 'NOT_IN_CRM',
      message: 'Извините, вы не состоите в спецназе.',
      version: MINIAPP_VERSION
    };
  }

  const adminInfo = MINIAPP_getTelegramAdminInfo_(tgUser.id);
  const primaryRole = MINIAPP_resolvePrimaryRole_(adminInfo.isAdmin, profile.memberships);

  return {
    ok: true,
    access: true,
    version: MINIAPP_VERSION,
    user: {
      telegramId: String(tgUser.id),
      telegramFirstName: tgUser.first_name || '',
      telegramLastName: tgUser.last_name || '',
      telegramUsername: tgUser.username || '',
      crmName: profile.name,
      crmTelegramName: profile.telegramName,
      crmUsername: profile.username,
      chatState: profile.chatState
    },
    role: {
      code: primaryRole.code,
      title: primaryRole.title,
      isChatAdmin: adminInfo.isAdmin,
      telegramStatus: adminInfo.status,
      adminCheck: adminInfo.check
    },
    memberships: profile.memberships,
    permissions: MINIAPP_permissions_(primaryRole.code)
  };
}

function MINIAPP_validateInitData_(initData) {
  const props = PropertiesService.getScriptProperties();
  const botToken = MINIAPP_value_(props.getProperty(MINIAPP_TOKEN_PROPERTY));
  if (!botToken) return { ok: false, error: 'BOT_TOKEN_MISSING' };

  const parsed = MINIAPP_parseQueryString_(initData);
  const receivedHash = MINIAPP_value_(parsed.hash).toLowerCase();
  if (!receivedHash) return { ok: false, error: 'HASH_MISSING' };

  const keys = Object.keys(parsed).filter(function(key) { return key !== 'hash'; }).sort();
  const dataCheckString = keys.map(function(key) { return key + '=' + parsed[key]; }).join('\n');

  const secretKey = Utilities.computeHmacSha256Signature(
    Utilities.newBlob(botToken).getBytes(),
    Utilities.newBlob('WebAppData').getBytes()
  );
  const calculatedBytes = Utilities.computeHmacSha256Signature(
    Utilities.newBlob(dataCheckString).getBytes(),
    secretKey
  );
  const calculatedHash = MINIAPP_bytesToHex_(calculatedBytes);

  if (!MINIAPP_constantTimeEqual_(calculatedHash, receivedHash)) {
    return { ok: false, error: 'INVALID_HASH' };
  }

  const authDate = Number(parsed.auth_date || 0);
  const nowSec = Math.floor(Date.now() / 1000);
  if (!authDate || authDate > nowSec + 60) return { ok: false, error: 'AUTH_DATE_INVALID' };
  if (nowSec - authDate > MINIAPP_INITDATA_MAX_AGE_SEC) return { ok: false, error: 'INIT_DATA_EXPIRED' };

  let user = null;
  try {
    user = JSON.parse(parsed.user || 'null');
  } catch (error) {
    return { ok: false, error: 'USER_JSON_INVALID' };
  }
  if (!user || user.id === undefined || user.id === null) return { ok: false, error: 'USER_MISSING' };
  return { ok: true, user: user, authDate: authDate };
}

function MINIAPP_findCrmProfile_(telegramId) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_BASE);
  if (!sheet) throw new Error('Лист «' + SHEET_BASE + '» не найден');

  const lastRow = Math.min(Math.max(sheet.getLastRow(), BASE_FIRST_ROW), BASE_LAST_ROW);
  if (lastRow < BASE_FIRST_ROW) return { found: false };

  const foundCell = sheet.getRange(BASE_FIRST_ROW, COL_TG_ID, lastRow - BASE_FIRST_ROW + 1, 1)
    .createTextFinder(String(telegramId)).matchEntireCell(true).findNext();
  if (!foundCell) return { found: false };

  const rowNumber = foundCell.getRow();
  const row = sheet.getRange(rowNumber, 1, 1, COL_CHAT_STATE).getDisplayValues()[0];
  const memberships = [];

  SLOT_DEFS.forEach(function(slot) {
    const team = MINIAPP_value_(row[slot.teamCol - 1]);
    const nick = MINIAPP_value_(row[slot.nickCol - 1]);
    const role = MINIAPP_value_(row[slot.roleCol - 1]);
    const game = MINIAPP_value_(row[slot.gameCol - 1]);
    if (!team && !nick && !role && !game) return;
    memberships.push({
      slot: slot.number,
      team: MINIAPP_stripGameSuffix_(team),
      teamRaw: team,
      nickname: nick,
      role: role,
      game: game
    });
  });

  return {
    found: true,
    row: rowNumber,
    name: MINIAPP_value_(row[COL_NAME - 1]),
    telegramName: MINIAPP_value_(row[COL_TG_NAME - 1]),
    username: MINIAPP_value_(row[COL_TG_USERNAME - 1]),
    telegramId: MINIAPP_value_(row[COL_TG_ID - 1]),
    chatState: MINIAPP_value_(row[COL_CHAT_STATE - 1]),
    memberships: memberships
  };
}

function MINIAPP_getTelegramAdminInfo_(telegramId) {
  const props = PropertiesService.getScriptProperties();
  const token = MINIAPP_value_(props.getProperty(MINIAPP_TOKEN_PROPERTY));
  const chatId = MINIAPP_value_(props.getProperty(MINIAPP_CHAT_ID_PROPERTY)) || MINIAPP_DEFAULT_CHAT_ID;
  if (!token) return { isAdmin: false, status: '', check: 'BOT_TOKEN_MISSING' };

  try {
    const url = 'https://api.telegram.org/bot' + token + '/getChatMember' +
      '?chat_id=' + encodeURIComponent(chatId) +
      '&user_id=' + encodeURIComponent(String(telegramId));
    const response = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true });
    const httpCode = response.getResponseCode();
    const body = JSON.parse(response.getContentText() || '{}');
    if (httpCode < 200 || httpCode >= 300 || !body.ok || !body.result) {
      return { isAdmin: false, status: '', check: 'BOT_API_ERROR' };
    }
    const status = MINIAPP_value_(body.result.status);
    return {
      isAdmin: status === 'creator' || status === 'administrator',
      status: status,
      check: 'OK'
    };
  } catch (error) {
    return { isAdmin: false, status: '', check: 'BOT_API_EXCEPTION' };
  }
}

function MINIAPP_resolvePrimaryRole_(isChatAdmin, memberships) {
  if (isChatAdmin) return { code: 'admin', title: 'Админ' };
  const roles = (memberships || []).map(function(item) { return MINIAPP_value_(item.role); });
  if (roles.indexOf('Лидер') !== -1) return { code: 'leader', title: 'Лидер' };
  if (roles.indexOf('Помощник') !== -1) return { code: 'assistant', title: 'Помощник' };
  if (roles.indexOf('Игрок') !== -1) return { code: 'player', title: 'Игрок' };
  return { code: 'participant', title: 'Участник' };
}

function MINIAPP_permissions_(roleCode) {
  return {
    canUseApp: true,
    canReadDirectory: true,
    canManageAll: roleCode === 'admin',
    canManageOwnTeam: roleCode === 'admin' || roleCode === 'leader' || roleCode === 'assistant',
    canCreateHelpRequest: roleCode === 'admin' || roleCode === 'leader' || roleCode === 'assistant'
  };
}

function MINIAPP_parseQueryString_(query) {
  const out = {};
  String(query || '').split('&').forEach(function(part) {
    if (!part) return;
    const eq = part.indexOf('=');
    const rawKey = eq === -1 ? part : part.slice(0, eq);
    const rawValue = eq === -1 ? '' : part.slice(eq + 1);
    const key = decodeURIComponent(rawKey.replace(/\+/g, ' '));
    const value = decodeURIComponent(rawValue.replace(/\+/g, ' '));
    out[key] = value;
  });
  return out;
}

function MINIAPP_requestId_(value) {
  const id = MINIAPP_value_(value);
  return /^[A-Za-z0-9_-]{20,100}$/.test(id) ? id : '';
}

function MINIAPP_callback_(value) {
  const callback = MINIAPP_value_(value);
  return /^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/.test(callback) ? callback : '';
}

function MINIAPP_resultKey_(requestId) {
  return 'miniapp:result:' + requestId;
}

function MINIAPP_stripGameSuffix_(team) {
  return MINIAPP_value_(team).replace(/\s+—\s+(РМ|РК)$/u, '');
}

function MINIAPP_bytesToHex_(bytes) {
  return (bytes || []).map(function(byte) {
    const value = (byte + 256) % 256;
    return ('0' + value.toString(16)).slice(-2);
  }).join('');
}

function MINIAPP_constantTimeEqual_(a, b) {
  a = String(a || '');
  b = String(b || '');
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function MINIAPP_value_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function MINIAPP_json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function MINIAPP_jsonp_(callback, data) {
  const safeCallback = MINIAPP_callback_(callback) || '__miniappInvalid';
  return ContentService
    .createTextOutput(safeCallback + '(' + JSON.stringify(data) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
