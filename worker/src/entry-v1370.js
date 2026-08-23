import currentWorker from './entry-v1360.js';
import { loadPrivateSnapshotCached } from './private-snapshot-cache.js';

const WRAPPER_VERSION = '1.37.0';
const BOT_USERNAME = 'doveofpeace_bot';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/contact-by-id' && request.method === 'POST') {
      return handleContactFallback(request, env, ctx);
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
        contactById: 'profile-button+plain-dm-fallback'
      }, 200);
    }
    return base;
  }
};

async function handleContactFallback(request, env, ctx) {
  const workerRequest = request.clone();
  const base = await currentWorker.fetch(workerRequest, env, ctx);

  let payload = null;
  try { payload = await base.clone().json(); } catch {}
  if (base.ok || !payload || payload.error !== 'BOT_API_ERROR') return base;

  let body = {};
  try { body = await request.clone().json(); } catch {}
  const targetId = cleanTelegramId(body?.telegramId);
  const requesterId = sessionTelegramId(request.headers.get('Authorization'));
  if (!targetId || !requesterId || !String(env.BOT_TOKEN || '').trim()) return base;

  let targetName = 'Участник';
  try {
    const source = await loadPrivateSnapshotCached(env);
    const target = (Array.isArray(source?.participants) ? source.participants : []).find(item =>
      cleanTelegramId(item?.telegramId) === targetId
    );
    if (target) targetName = displayName(target);
  } catch (error) {
    console.warn('contact fallback snapshot lookup failed', error?.message || 'unknown');
  }

  const botApi = `https://api.telegram.org/bot${String(env.BOT_TOKEN).trim()}`;
  let fallbackOk = false;
  try {
    const response = await fetch(`${botApi}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json; charset=utf-8' },
      body: JSON.stringify({
        chat_id: requesterId,
        text: `Связаться с участником: ${targetName}\n\nTelegram не разрешил создать прямую кнопку открытия профиля для этого участника. Такое бывает из-за ограничений профиля или самого Telegram. Если у участника появится @username, обычная ссылка будет доступна.`,
        disable_notification: true
      }),
      cache: 'no-store'
    });
    const telegram = await response.json().catch(() => ({}));
    fallbackOk = Boolean(response.ok && telegram?.ok);
  } catch (error) {
    console.warn('contact plain-dm fallback failed', error?.message || 'unknown');
  }

  if (!fallbackOk) return base;

  return json({
    ok: false,
    error: 'TARGET_PROFILE_BUTTON_UNAVAILABLE',
    profileButtonAvailable: false,
    botUsername: BOT_USERNAME,
    message: 'Telegram не разрешил создать кнопку открытия профиля для этого участника. Голубец отправил пояснение в личку.'
  }, 409, corsHeaders(request, env));
}

function sessionTelegramId(authorization) {
  const raw = String(authorization || '').trim().replace(/^Bearer\s+/i, '').trim();
  if (!raw) return '';
  try {
    const payloadPart = raw.split('.')[0] || '';
    let text = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    while (text.length % 4) text += '=';
    const binary = atob(text);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    return cleanTelegramId(payload?.tg);
  } catch { return ''; }
}

function cleanTelegramId(value) {
  const text = String(value == null ? '' : value).trim().replace(/\.0$/, '');
  return /^\d+$/.test(text) ? text : '';
}

function displayName(participant) {
  return String(participant?.name || participant?.telegramName || 'Участник').trim().slice(0, 120) || 'Участник';
}

function corsHeaders(request, env) {
  const allowed = String(env.FRONTEND_ORIGIN || '*').replace(/\/$/, '');
  const origin = String(request.headers.get('Origin') || '').replace(/\/$/, '');
  const allowOrigin = allowed === '*' ? '*' : (origin === allowed ? origin : allowed);
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type,Authorization',
    'Access-Control-Max-Age':'86400',
    'Vary':'Origin'
  };
}

function json(data, status=200, headers={}) {
  const out = new Headers(headers);
  out.set('Content-Type','application/json; charset=utf-8');
  out.set('X-Content-Type-Options','nosniff');
  out.set('Cache-Control','no-store');
  return new Response(JSON.stringify(data), { status, headers: out });
}

function jsonFrom(response, payload, status) {
  const headers = new Headers(response.headers);
  headers.set('Content-Type','application/json; charset=utf-8');
  headers.set('Cache-Control','no-store');
  headers.delete('Content-Length');
  headers.delete('ETag');
  return new Response(JSON.stringify(payload), { status, headers });
}
