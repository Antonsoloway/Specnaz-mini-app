import currentWorker from './entry-v1290.js';

const WRAPPER_VERSION = '1.31.0';
const AVATAR_FALLBACK = 'telegram-getUserProfilePhotos';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/avatar' && request.method === 'GET' && url.searchParams.get('telegramId')) {
      const base = await currentWorker.fetch(request, env, ctx);
      if (base.status !== 404) return base;

      let payload = null;
      try { payload = await base.clone().json(); } catch {}
      if (payload?.error !== 'AVATAR_NOT_FOUND') return base;

      return handleMissingAvatar(request, env, ctx, url, base);
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
        avatarFallback: AVATAR_FALLBACK
      }, 200);
    }

    return base;
  }
};

async function handleMissingAvatar(request, env, ctx, url, notFoundResponse) {
  const telegramId = cleanTelegramId(url.searchParams.get('telegramId'));
  if (!telegramId) return notFoundResponse;

  const snapshotResponse = await authorizeSnapshot(request, env, ctx);
  if (!snapshotResponse.ok) return snapshotResponse;

  let snapshotPayload = null;
  try { snapshotPayload = await snapshotResponse.clone().json(); } catch {}
  const participant = (Array.isArray(snapshotPayload?.snapshot?.participants)
    ? snapshotPayload.snapshot.participants
    : []).find(item => cleanTelegramId(item?.telegramId) === telegramId);
  if (!participant) return notFoundResponse;

  const botToken = String(env.BOT_TOKEN || '').trim();
  if (!botToken) return notFoundResponse;

  try {
    const tgUrl = new URL(`https://api.telegram.org/bot${botToken}/getUserProfilePhotos`);
    tgUrl.searchParams.set('user_id', telegramId);
    tgUrl.searchParams.set('offset', '0');
    tgUrl.searchParams.set('limit', '1');

    const response = await fetch(tgUrl.toString(), { method: 'GET', cache: 'no-store' });
    const body = await response.json().catch(() => ({}));
    const sizes = Array.isArray(body?.result?.photos?.[0]) ? body.result.photos[0] : [];
    const fileId = selectLargestPhotoFileId(sizes);
    if (!response.ok || !body?.ok || !fileId) return notFoundResponse;

    const rewritten = new URL(request.url);
    rewritten.searchParams.delete('telegramId');
    rewritten.searchParams.set('fileId', fileId);
    return currentWorker.fetch(new Request(rewritten.toString(), request), env, ctx);
  } catch (error) {
    console.warn('avatar live fallback failed', telegramId, error?.message || 'unknown');
    return notFoundResponse;
  }
}

async function authorizeSnapshot(request, env, ctx) {
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

function selectLargestPhotoFileId(sizes) {
  return sizes
    .filter(item => String(item?.file_id || '').trim())
    .sort((a, b) => {
      const areaA = Number(a?.width || 0) * Number(a?.height || 0);
      const areaB = Number(b?.width || 0) * Number(b?.height || 0);
      if (areaA !== areaB) return areaB - areaA;
      return Number(b?.file_size || 0) - Number(a?.file_size || 0);
    })[0]?.file_id || '';
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
