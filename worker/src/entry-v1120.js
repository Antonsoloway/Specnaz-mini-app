import currentWorker from './entry-v1110.js';

const WRAPPER_VERSION = '1.12.0';
const ALLOWED_CHAT_STATE = 'В чате';
const BOT_USERNAME = 'doveofpeace_bot';
const recentRequests = new Map();

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/health' && request.method === 'GET') {
      const base = await currentWorker.fetch(request, env, ctx);
      const headers = new Headers(base.headers);
      headers.set('Content-Type', 'application/json; charset=utf-8');
      headers.set('Cache-Control', 'no-store');
      headers.delete('Content-Length');
      headers.delete('ETag');
      return new Response(JSON.stringify({
        ok: true,
        service: 'royal-crm-miniapp-api',
        version: WRAPPER_VERSION,
        participantIdentity: 'telegramId-only',
        snapshotSearchKeys: 'preserved+deterministic-pseudo',
        teamStatus: 'preserved',
        contactById: 'bot-inline-profile-button'
      }), { status: 200, headers });
    }

    if (url.pathname === '/contact-by-id' && request.method === 'OPTIONS') {
      return corsPreflight(request, env);
    }

    if (url.pathname === '/contact-by-id' && request.method === 'POST') {
      return handleContactById(request, env, ctx);
    }

    return currentWorker.fetch(request, env, ctx);
  }
};

async function handleContactById(request, env, ctx) {
  const auth = await authorizeViaSnapshot(request, env, ctx);
  if (!auth.ok) return auth;

  let authPayload;
  try { authPayload = await auth.clone().json(); }
  catch { return auth; }
  if (!authPayload?.ok || !authPayload?.snapshot) return auth;

  const requesterId = sessionTelegramId(request.headers.get('Authorization'));
  if (!requesterId) {
    return jsonFrom(auth, { ok:false, error:'REQUESTER_ID_MISSING', message:'Не удалось определить пользователя приложения.' }, 401);
  }

  let body;
  try { body = await request.json(); }
  catch { body = {}; }
  const targetId = cleanTelegramId(body?.telegramId);
  if (!targetId) {
    return jsonFrom(auth, { ok:false, error:'TARGET_ID_MISSING', message:'Telegram ID участника не найден.' }, 400);
  }

  const participants = Array.isArray(authPayload?.snapshot?.participants) ? authPayload.snapshot.participants : [];
  const requester = participants.find(p => cleanTelegramId(p?.telegramId) === requesterId && String(p?.chatState || '').trim() === ALLOWED_CHAT_STATE);
  const target = participants.find(p => cleanTelegramId(p?.telegramId) === targetId && String(p?.chatState || '').trim() === ALLOWED_CHAT_STATE);

  if (!requester) {
    return jsonFrom(auth, { ok:false, error:'REQUESTER_NOT_IN_CHAT', message:'Доступ к этой функции есть только участникам чата.' }, 403);
  }
  if (!target) {
    return jsonFrom(auth, { ok:false, error:'TARGET_NOT_FOUND', message:'Участник больше не найден в актуальном составе.' }, 404);
  }

  const targetUsername = String(target?.username || '').trim().replace(/^@+/, '');
  if (targetUsername) {
    return jsonFrom(auth, {
      ok:false,
      error:'USERNAME_AVAILABLE',
      message:'У участника уже есть @username — используйте обычную ссылку.'
    }, 409);
  }

  const botToken = String(env.BOT_TOKEN || '').trim();
  if (!botToken) {
    return jsonFrom(auth, { ok:false, error:'BOT_CONFIG_MISSING', message:'Голубец временно не может отправить ссылку.' }, 500);
  }

  const now = Date.now();
  const cooldownKey = `${requesterId}:${targetId}`;
  const previous = Number(recentRequests.get(cooldownKey) || 0);
  if (previous && now - previous < 4000) {
    return jsonFrom(auth, {
      ok:true,
      sent:false,
      duplicate:true,
      botUsername:BOT_USERNAME,
      message:'Ссылка уже отправлена Голубцом.'
    }, 200);
  }
  recentRequests.set(cooldownKey, now);
  if (recentRequests.size > 500) {
    const cutoff = now - 60000;
    for (const [key, value] of recentRequests.entries()) {
      if (Number(value || 0) < cutoff) recentRequests.delete(key);
    }
  }

  const targetName = displayName(target);
  const tgApi = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const payload = {
    chat_id: requesterId,
    text: `Связаться с участником: ${targetName}\n\nНажмите кнопку ниже, чтобы открыть профиль Telegram.`,
    disable_notification: true,
    reply_markup: {
      inline_keyboard: [[
        { text: '👤 Открыть профиль', url: `tg://user?id=${targetId}` }
      ]]
    }
  };

  try {
    const response = await fetch(tgApi, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
      cache: 'no-store'
    });
    const telegram = await response.json().catch(() => ({}));
    if (!response.ok || !telegram?.ok) {
      recentRequests.delete(cooldownKey);
      const description = String(telegram?.description || '');
      const cannotWrite = response.status === 403 || /blocked|chat not found|bot can't initiate/i.test(description);
      return jsonFrom(auth, {
        ok:false,
        error:cannotWrite ? 'BOT_CANNOT_MESSAGE_REQUESTER' : 'BOT_API_ERROR',
        message:cannotWrite
          ? 'Голубец не может написать вам в ЛС. Откройте чат с Голубцом и разрешите ему сообщения.'
          : 'Не удалось отправить кнопку профиля. Попробуйте ещё раз.',
        upstreamStatus:response.status
      }, cannotWrite ? 409 : 502);
    }

    return jsonFrom(auth, {
      ok:true,
      sent:true,
      botUsername:BOT_USERNAME,
      targetName,
      messageId:Number(telegram?.result?.message_id || 0)
    }, 200);
  } catch (error) {
    recentRequests.delete(cooldownKey);
    console.warn('contact-by-id send failed', error?.message || 'unknown');
    return jsonFrom(auth, {
      ok:false,
      error:'BOT_API_EXCEPTION',
      message:'Сервис связи временно недоступен. Попробуйте ещё раз.'
    }, 502);
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
  return currentWorker.fetch(new Request(url.toString(), { method:'GET', headers }), env, ctx);
}

function sessionTelegramId(authorization) {
  const raw = String(authorization || '').trim();
  const session = raw.replace(/^Bearer\s+/i, '').trim();
  if (!session) return '';
  try {
    const payloadPart = session.split('.')[0] || '';
    let text = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    while (text.length % 4) text += '=';
    const binary = atob(text);
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    return cleanTelegramId(payload?.tg);
  } catch {
    return '';
  }
}

function cleanTelegramId(value) {
  const text = String(value == null ? '' : value).trim().replace(/\.0$/, '');
  return /^\d+$/.test(text) ? text : '';
}

function displayName(participant) {
  return String(participant?.name || participant?.telegramName || 'Участник').trim().slice(0, 120) || 'Участник';
}

function corsPreflight(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env.FRONTEND_ORIGIN || '').trim();
  const headers = new Headers();
  if (origin && allowed && origin === allowed) headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Vary', 'Origin');
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  headers.set('Access-Control-Max-Age', '600');
  return new Response(null, { status:204, headers });
}

function jsonFrom(response, payload, status) {
  const headers = new Headers(response.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.delete('Content-Length');
  headers.delete('ETag');
  return new Response(JSON.stringify(payload), { status, headers });
}
