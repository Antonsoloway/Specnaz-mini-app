import currentWorker from './entry-v170.js';

const WRAPPER_VERSION = '1.8.0';
const ALLOWED_CHAT_STATE = 'В чате';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/health' && request.method === 'GET') {
      const base = await currentWorker.fetch(request, env, ctx);
      const headers = new Headers(base.headers);
      headers.set('Content-Type', 'application/json; charset=utf-8');
      return new Response(JSON.stringify({
        ok: true,
        service: 'royal-crm-miniapp-api',
        version: WRAPPER_VERSION,
        participantIdentity: 'telegramId-only',
        participantAdmin: 'telegram-getChatMember'
      }), { status: 200, headers });
    }

    if (url.pathname === '/participant-role' && request.method === 'GET') {
      return handleParticipantRole(request, env, ctx, url);
    }

    return currentWorker.fetch(request, env, ctx);
  }
};

async function handleParticipantRole(request, env, ctx, url) {
  const auth = await authorizeViaSnapshot(request, env, ctx);
  if (!auth.ok) return auth;

  let authPayload;
  try { authPayload = await auth.clone().json(); } catch { return auth; }
  if (!authPayload?.ok) return auth;

  const telegramId = cleanTelegramId(url.searchParams.get('telegramId'));
  if (!telegramId) {
    return jsonFrom(auth, { ok: false, error: 'TELEGRAM_ID_MISSING' }, 400);
  }

  const participants = Array.isArray(authPayload?.snapshot?.participants)
    ? authPayload.snapshot.participants
    : [];
  const participant = participants.find(p =>
    cleanTelegramId(p?.telegramId) === telegramId &&
    String(p?.chatState || '').trim() === ALLOWED_CHAT_STATE
  );

  if (!participant) {
    return jsonFrom(auth, { ok: false, error: 'PARTICIPANT_NOT_FOUND' }, 404);
  }

  const chatId = String(env.TELEGRAM_CHAT_ID || '').trim();
  const botToken = String(env.BOT_TOKEN || '').trim();
  if (!chatId || !botToken) {
    return jsonFrom(auth, {
      ok: true,
      telegramId,
      isChatAdmin: false,
      telegramStatus: '',
      check: 'CONFIG_MISSING'
    }, 200);
  }

  try {
    const tgUrl = new URL(`https://api.telegram.org/bot${botToken}/getChatMember`);
    tgUrl.searchParams.set('chat_id', chatId);
    tgUrl.searchParams.set('user_id', telegramId);

    const response = await fetch(tgUrl.toString(), { cache: 'no-store' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body?.ok || !body?.result) {
      return jsonFrom(auth, {
        ok: true,
        telegramId,
        isChatAdmin: false,
        telegramStatus: '',
        check: 'BOT_API_ERROR'
      }, 200);
    }

    const status = String(body.result.status || '');
    return jsonFrom(auth, {
      ok: true,
      telegramId,
      isChatAdmin: status === 'creator' || status === 'administrator',
      telegramStatus: status,
      check: 'OK'
    }, 200);
  } catch (error) {
    console.warn('participant-role failed', error?.message || 'unknown');
    return jsonFrom(auth, {
      ok: true,
      telegramId,
      isChatAdmin: false,
      telegramStatus: '',
      check: 'BOT_API_EXCEPTION'
    }, 200);
  }
}

async function authorizeViaSnapshot(request, env, ctx) {
  const url = new URL(request.url);
  url.pathname = '/snapshot';
  url.search = '';
  const headers = new Headers();
  const authorization = request.headers.get('Authorization');
  const origin = request.headers.get('Origin');
  if (authorization) headers.set('Authorization', authorization);
  if (origin) headers.set('Origin', origin);
  return currentWorker.fetch(new Request(url.toString(), { method: 'GET', headers }), env, ctx);
}

function cleanTelegramId(value) {
  const text = String(value == null ? '' : value).trim().replace(/\.0$/, '');
  return /^\d+$/.test(text) ? text : '';
}

function jsonFrom(response, payload, status) {
  const headers = new Headers(response.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.delete('Content-Length');
  headers.delete('ETag');
  return new Response(JSON.stringify(payload), { status, headers });
}
