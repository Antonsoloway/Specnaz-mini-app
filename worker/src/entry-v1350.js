import currentWorker from './entry-v1340.js';
import { loadPrivateSnapshotCached } from './private-snapshot-cache.js';

const WRAPPER_VERSION = '1.35.0';
const ALLOWED_CHAT_STATE = 'В чате';
const BOT_USERNAME = 'doveofpeace_bot';
const recentRequests = new Map();

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/contact-by-id' && request.method === 'OPTIONS') {
      return corsPreflight(request, env);
    }

    if (url.pathname === '/contact-by-id' && request.method === 'POST') {
      return handleContactById(request, env);
    }

    const base = await currentWorker.fetch(request, env, ctx);
    if (url.pathname === '/health' && request.method === 'GET') {
      let data = {};
      try { data = await base.clone().json(); } catch {}
      return jsonFrom(base, {
        ...data,
        ok: true,
        service: 'royal-crm-miniapp-api',
        version: WRAPPER_VERSION,
        contactById: 'direct-session-verified-private-snapshot+bot-inline-profile-button'
      }, 200);
    }
    return base;
  }
};

async function handleContactById(request, env) {
  const cors = corsHeaders(request, env);
  try {
    enforceOrigin(request, env);
    requireSecret(env.SESSION_SECRET, 'SESSION_SECRET');
    requireSecret(env.BOT_TOKEN, 'BOT_TOKEN');

    const token = bearerToken(request);
    if (!token) throw appError(401, 'SESSION_MISSING', 'Требуется авторизация.');
    const session = await verifySession(token, env.SESSION_SECRET);
    const requesterId = cleanTelegramId(session?.tg);
    if (!requesterId) throw appError(401, 'REQUESTER_ID_MISSING', 'Не удалось определить пользователя приложения.');

    let body = {};
    try { body = await request.json(); } catch {}
    const targetId = cleanTelegramId(body?.telegramId);
    if (!targetId) throw appError(400, 'TARGET_ID_MISSING', 'Telegram ID участника не найден.');

    let source;
    try {
      source = await loadPrivateSnapshotCached(env);
    } catch (error) {
      console.warn('contact-by-id snapshot failed', error?.message || 'unknown');
      throw appError(502, 'SNAPSHOT_FETCH_FAILED', 'Справочник временно недоступен.');
    }

    const participants = Array.isArray(source?.participants) ? source.participants : [];
    const requester = participants.find(item =>
      cleanTelegramId(item?.telegramId) === requesterId &&
      String(item?.chatState || '').trim() === ALLOWED_CHAT_STATE
    );
    const target = participants.find(item =>
      cleanTelegramId(item?.telegramId) === targetId &&
      String(item?.chatState || '').trim() === ALLOWED_CHAT_STATE
    );

    if (!requester) throw appError(403, 'REQUESTER_NOT_IN_CHAT', 'Доступ к этой функции есть только участникам чата.');
    if (!target) throw appError(404, 'TARGET_NOT_FOUND', 'Участник больше не найден в актуальном составе.');

    const targetUsername = String(target?.username || '').trim().replace(/^@+/, '');
    if (targetUsername) {
      return json({
        ok: false,
        error: 'USERNAME_AVAILABLE',
        message: 'У участника уже есть @username — используйте обычную ссылку.'
      }, 409, cors);
    }

    const now = Date.now();
    const cooldownKey = `${requesterId}:${targetId}`;
    const previous = Number(recentRequests.get(cooldownKey) || 0);
    if (previous && now - previous < 4000) {
      return json({
        ok: true,
        sent: false,
        duplicate: true,
        botUsername: BOT_USERNAME,
        message: 'Ссылка уже отправлена Голубцом.'
      }, 200, cors);
    }
    recentRequests.set(cooldownKey, now);
    pruneRecent(now);

    const targetName = displayName(target);
    const response = await fetch(`https://api.telegram.org/bot${String(env.BOT_TOKEN).trim()}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        chat_id: requesterId,
        text: `Связаться с участником: ${targetName}\n\nНажмите кнопку ниже, чтобы открыть профиль Telegram.`,
        disable_notification: true,
        reply_markup: {
          inline_keyboard: [[{ text: '👤 Открыть профиль', url: `tg://user?id=${targetId}` }]]
        }
      }),
      cache: 'no-store'
    });
    const telegram = await response.json().catch(() => ({}));
    if (!response.ok || !telegram?.ok) {
      recentRequests.delete(cooldownKey);
      const description = String(telegram?.description || '');
      const cannotWrite = response.status === 403 || /blocked|chat not found|bot can't initiate/i.test(description);
      return json({
        ok: false,
        error: cannotWrite ? 'BOT_CANNOT_MESSAGE_REQUESTER' : 'BOT_API_ERROR',
        message: cannotWrite
          ? 'Голубец не может написать вам в ЛС. Откройте чат с Голубцом и разрешите ему сообщения.'
          : 'Не удалось отправить кнопку профиля. Попробуйте ещё раз.'
      }, cannotWrite ? 409 : 502, cors);
    }

    return json({
      ok: true,
      sent: true,
      botUsername: BOT_USERNAME,
      targetName,
      messageId: Number(telegram?.result?.message_id || 0)
    }, 200, cors);
  } catch (error) {
    const status = Number(error?.status || 500);
    return json({
      ok: false,
      error: String(error?.code || 'SERVER_ERROR'),
      message: String(error?.publicMessage || 'Сервис связи временно недоступен. Попробуйте ещё раз.')
    }, status, cors);
  }
}

function pruneRecent(now) {
  if (recentRequests.size <= 500) return;
  const cutoff = now - 60000;
  for (const [key, value] of recentRequests.entries()) {
    if (Number(value || 0) < cutoff) recentRequests.delete(key);
  }
}

function displayName(participant) {
  return String(participant?.name || participant?.telegramName || 'Участник').trim().slice(0, 120) || 'Участник';
}

async function verifySession(token, secret) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) throw appError(401, 'SESSION_INVALID', 'Сессия недействительна.');
  const [payloadPart, sigPart] = parts;
  const expected = base64UrlEncode(await hmacSha256(secret, payloadPart));
  if (!constantTimeEqual(expected, sigPart)) throw appError(401, 'SESSION_INVALID', 'Сессия недействительна.');
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadPart)));
  } catch {
    throw appError(401, 'SESSION_INVALID', 'Сессия недействительна.');
  }
  const now = Math.floor(Date.now() / 1000);
  if (!payload?.tg || !payload?.exp || Number(payload.exp) < now) {
    throw appError(401, 'SESSION_EXPIRED', 'Откройте приложение заново.');
  }
  return payload;
}

let hmacKeySecret = '';
let hmacKeyPromise = null;
async function hmacSha256(secret, value) {
  const normalized = String(secret || '');
  if (!hmacKeyPromise || hmacKeySecret !== normalized) {
    hmacKeySecret = normalized;
    hmacKeyPromise = crypto.subtle.importKey(
      'raw', new TextEncoder().encode(normalized),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
  }
  const key = await hmacKeyPromise;
  const result = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(value || '')));
  return new Uint8Array(result);
}

function bearerToken(request) {
  const header = String(request.headers.get('Authorization') || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function cleanTelegramId(value) {
  const text = String(value == null ? '' : value).trim().replace(/\.0$/, '');
  return /^\d+$/.test(text) ? text : '';
}

function enforceOrigin(request, env) {
  const allowed = String(env.FRONTEND_ORIGIN || '').replace(/\/$/, '');
  if (!allowed) return;
  const origin = String(request.headers.get('Origin') || '').replace(/\/$/, '');
  if (origin && origin !== allowed) throw appError(403, 'ORIGIN_DENIED', 'Запрос с этого сайта запрещён.');
}

function corsHeaders(request, env) {
  const allowed = String(env.FRONTEND_ORIGIN || '*').replace(/\/$/, '');
  const origin = String(request.headers.get('Origin') || '').replace(/\/$/, '');
  const allowOrigin = allowed === '*' ? '*' : (origin === allowed ? origin : allowed);
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function corsPreflight(request, env) {
  return new Response(null, { status: 204, headers: corsHeaders(request, env) });
}

function requireSecret(value, name) {
  if (!String(value || '').trim()) throw appError(500, `${name}_MISSING`);
}

function appError(status, code, publicMessage = '') {
  const error = new Error(code);
  error.status = status;
  error.code = code;
  error.publicMessage = publicMessage;
  return error;
}

function json(data, status = 200, headers = {}) {
  const out = new Headers(headers);
  out.set('Content-Type', 'application/json; charset=utf-8');
  out.set('X-Content-Type-Options', 'nosniff');
  out.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(data), { status, headers: out });
}

function jsonFrom(response, payload, status) {
  const headers = new Headers(response.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.delete('Content-Length');
  headers.delete('ETag');
  return new Response(JSON.stringify(payload), { status, headers });
}

function constantTimeEqual(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function base64UrlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  let text = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  while (text.length % 4) text += '=';
  const binary = atob(text);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
