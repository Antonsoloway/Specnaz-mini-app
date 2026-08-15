import currentWorker from './entry-v180.js';

const WRAPPER_VERSION = '1.9.0';
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
        participantAdmin: 'telegram-getChatMember',
        adminsDirectory: 'telegram-getChatAdministrators'
      }), { status: 200, headers });
    }

    if (url.pathname === '/chat-admins' && request.method === 'GET') {
      return handleChatAdmins(request, env, ctx);
    }

    return currentWorker.fetch(request, env, ctx);
  }
};

async function handleChatAdmins(request, env, ctx) {
  const auth = await authorizeViaSnapshot(request, env, ctx);
  if (!auth.ok) return auth;

  let authPayload;
  try { authPayload = await auth.clone().json(); } catch { return auth; }
  if (!authPayload?.ok) return auth;

  const chatId = String(env.TELEGRAM_CHAT_ID || '').trim();
  const botToken = String(env.BOT_TOKEN || '').trim();
  if (!chatId || !botToken) {
    return jsonFrom(auth, { ok: false, error: 'CONFIG_MISSING', admins: [] }, 500);
  }

  try {
    const tgUrl = new URL(`https://api.telegram.org/bot${botToken}/getChatAdministrators`);
    tgUrl.searchParams.set('chat_id', chatId);
    const response = await fetch(tgUrl.toString(), { cache: 'no-store' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body?.ok || !Array.isArray(body?.result)) {
      return jsonFrom(auth, { ok: false, error: 'BOT_API_ERROR', admins: [] }, 502);
    }

    const participantIds = new Set(
      (Array.isArray(authPayload?.snapshot?.participants) ? authPayload.snapshot.participants : [])
        .filter(p => String(p?.chatState || '').trim() === ALLOWED_CHAT_STATE)
        .map(p => cleanTelegramId(p?.telegramId))
        .filter(Boolean)
    );

    const admins = body.result
      .map(item => {
        const user = item?.user || {};
        const telegramId = cleanTelegramId(user?.id);
        if (!telegramId || user?.is_bot) return null;
        return {
          telegramId,
          status: String(item?.status || ''),
          title: item?.status === 'creator' ? 'Создатель' : 'Админ',
          firstName: String(user?.first_name || ''),
          lastName: String(user?.last_name || ''),
          username: String(user?.username || ''),
          inCrm: participantIds.has(telegramId)
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.status === 'creator' && b.status !== 'creator') return -1;
        if (b.status === 'creator' && a.status !== 'creator') return 1;
        return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'ru', { sensitivity: 'base' });
      });

    return jsonFrom(auth, { ok: true, version: WRAPPER_VERSION, admins }, 200);
  } catch (error) {
    console.warn('chat-admins failed', error?.message || 'unknown');
    return jsonFrom(auth, { ok: false, error: 'BOT_API_EXCEPTION', admins: [] }, 502);
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
