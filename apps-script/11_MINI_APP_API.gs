/**
 * ROYAL CRM — Telegram Mini App API
 * Версия 0.2.0
 *
 * Назначение:
 * 1) проверяет Telegram.WebApp.initData по токену бота;
 * 2) допускает только Telegram ID, который есть в «База участников»
 *    и у которого «Состояние чата» = «В чате»;
 * 3) определяет главную роль: Админ / Лидер / Помощник / Игрок / Участник;
 * 4) возвращает только профиль открывшего Mini App пользователя.
 *
 * Секреты в этом файле НЕ хранятся.
 * TELEGRAM_BOT_TOKEN берётся из Script Properties.
 */

const MINIAPP_VERSION = '0.2.0';
const MINIAPP_TOKEN_PROPERTY = 'TELEGRAM_BOT_TOKEN';
const MINIAPP_CHAT_ID_PROPERTY = 'MINI_APP_CHAT_ID';
const MINIAPP_DEFAULT_CHAT_ID = '-1002109152418';
const MINIAPP_INITDATA_MAX_AGE_SEC = 24 * 60 * 60;
const MINIAPP_ALLOWED_CHAT_STATE = 'В чате';

function MINIAPP_doPost_(e) {
  try {
    const action = MINIAPP_value_(e && e.parameter && e.parameter.action);
    if (action !== 'auth') {
      return MINIAPP_json_({
        ok: false,
        error: 'UNKNOWN_ACTION',
        version: MINIAPP_VERSION
      });
    }

    const initData = MINIAPP_value_(e && e.parameter && e.parameter.initData);
    if (!initData) {
      return MINIAPP_json_({
        ok: false,
        access: false,
        error: 'INIT_DATA_MISSING',
        message: 'Откройте приложение из Telegram.',
        version: MINIAPP_VERSION
      });
    }

    const validated = MINIAPP_validateInitData_(initData);
    if (!validated.ok) {
      return MINIAPP_json_({
        ok: false,
        access: false,
        error: validated.error,
        message: 'Не удалось подтвердить Telegram-пользователя.',
        version: MINIAPP_VERSION
      });
    }

    const tgUser = validated.user;
    const profile = MINIAPP_findCrmProfile_(tgUser.id);

    if (!profile.found || profile.chatState !== MINIAPP_ALLOWED_CHAT_STATE) {
      return MINIAPP_json_({
        ok: true,
        access: false,
        reason: profile.found ? 'NOT_IN_CHAT' : 'NOT_IN_CRM',
        message: 'Извините, вы не состоите в спецназе.',
        version: MINIAPP_VERSION
      });
    }

    const adminInfo = MINIAPP_getTelegramAdminInfo_(tgUser.id);
    const primaryRole = MINIAPP_resolvePrimaryRole_(adminInfo.isAdmin, profile.memberships);

    return MINIAPP_json_({
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
    });
  } catch (error) {
    console.error('MINIAPP_doPost_ error', error && error.stack ? error.stack : error);
    return MINIAPP_json_({
      ok: false,
      access: false,
      error: 'SERVER_ERROR',
      message: 'Временная ошибка сервера. Попробуйте ещё раз.',
      version: MINIAPP_VERSION
    });
  }
}

function MINIAPP_validateInitData_(initData) {
  const props = PropertiesService.getScriptProperties();
  const botToken = MINIAPP_value_(props.getProperty(MINIAPP_TOKEN_PROPERTY));
  if (!botToken) return { ok: false, error: 'BOT_TOKEN_MISSING' };

  const parsed = MINIAPP_parseQueryString_(initData);
  const receivedHash = MINIAPP_value_(parsed.hash).toLowerCase();
  if (!receivedHash) return { ok: false, error: 'HASH_MISSING' };

  const keys = Object.keys(parsed)
    .filter(function(key) { return key !== 'hash'; })
    .sort();

  const dataCheckString = keys.map(function(key) {
    return key + '=' + parsed[key];
  }).join('\n');

  // Telegram: secret_key = HMAC_SHA256(bot_token, key='WebAppData')
  const secretKey = Utilities.computeHmacSha256Signature(
    Utilities.newBlob(botToken).getBytes(),
    Utilities.newBlob('WebAppData').getBytes()
  );

  // hash = HMAC_SHA256(data_check_string, key=secret_key)
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
  if (!authDate || authDate > nowSec + 60) {
    return { ok: false, error: 'AUTH_DATE_INVALID' };
  }
  if (nowSec - authDate > MINIAPP_INITDATA_MAX_AGE_SEC) {
    return { ok: false, error: 'INIT_DATA_EXPIRED' };
  }

  let user = null;
  try {
    user = JSON.parse(parsed.user || 'null');
  } catch (error) {
    return { ok: false, error: 'USER_JSON_INVALID' };
  }

  if (!user || user.id === undefined || user.id === null) {
    return { ok: false, error: 'USER_MISSING' };
  }

  return { ok: true, user: user, authDate: authDate };
}

function MINIAPP_findCrmProfile_(telegramId) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_BASE);
  if (!sheet) throw new Error('Лист «' + SHEET_BASE + '» не найден');

  const lastRow = Math.min(Math.max(sheet.getLastRow(), BASE_FIRST_ROW), BASE_LAST_ROW);
  if (lastRow < BASE_FIRST_ROW) return { found: false };

  const idRange = sheet.getRange(BASE_FIRST_ROW, COL_TG_ID, lastRow - BASE_FIRST_ROW + 1, 1);
  const foundCell = idRange
    .createTextFinder(String(telegramId))
    .matchEntireCell(true)
    .findNext();

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

  if (!token) {
    return { isAdmin: false, status: '', check: 'BOT_TOKEN_MISSING' };
  }

  try {
    const url = 'https://api.telegram.org/bot' + token + '/getChatMember' +
      '?chat_id=' + encodeURIComponent(chatId) +
      '&user_id=' + encodeURIComponent(String(telegramId));

    const response = UrlFetchApp.fetch(url, {
      method: 'get',
      muteHttpExceptions: true
    });

    const httpCode = response.getResponseCode();
    const body = JSON.parse(response.getContentText() || '{}');
    if (httpCode < 200 || httpCode >= 300 || !body.ok || !body.result) {
      return {
        isAdmin: false,
        status: '',
        check: 'BOT_API_ERROR'
      };
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

  const roles = (memberships || []).map(function(item) {
    return MINIAPP_value_(item.role);
  });

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
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function MINIAPP_value_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function MINIAPP_json_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
