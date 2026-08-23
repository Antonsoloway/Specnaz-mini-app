import currentWorker from './entry-v1290.js';

const WRAPPER_VERSION = '1.31.1';
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

  // Reuse the protected snapshot route for session validation and allow-listing.
  // The sanitized snapshot contains only participants that the Mini App may see.
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
    const fileId = await getLatestProfilePhotoFileId(telegramId, botToken);
    if (!fileId) return notFoundResponse;

    // Do not pass the live file_id through the legacy /avatar?fileId route:
    // that route intentionally allows only file IDs already present in the
    // snapshot. A newly discovered live Telegram photo is therefore proxied
    // here, after the same authenticated participant allow-list check above.
    const filePath = await getTelegramFilePath(fileId, botToken);
    if (!filePath) return notFoundResponse;

    const upstream = await fetch(
      `https://api.telegram.org/file/bot${botToken}/${filePath}`,
      { method: 'GET', cache: 'no-store' }
    );
    if (!upstream.ok) return notFoundResponse;

    const bytes = new Uint8Array(await upstream.arrayBuffer());
    if (!bytes.length) return notFoundResponse;

    const contentType = normalizeImageType(upstream.headers.get('Content-Type'), bytes);
    if (!contentType.startsWith('image/')) return notFoundResponse;

    return mediaResponse(snapshotResponse, bytes, contentType);
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

async function getLatestProfilePhotoFileId(telegramId, botToken) {
  const tgUrl = new URL(`https://api.telegram.org/bot${botToken}/getUserProfilePhotos`);
  tgUrl.searchParams.set('user_id', telegramId);
  tgUrl.searchParams.set('offset', '0');
  tgUrl.searchParams.set('limit', '1');

  const response = await fetch(tgUrl.toString(), { method: 'GET', cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  const sizes = Array.isArray(body?.result?.photos?.[0]) ? body.result.photos[0] : [];
  if (!response.ok || !body?.ok || !sizes.length) return '';

  return sizes
    .filter(item => String(item?.file_id || '').trim())
    .sort((a, b) => {
      const areaA = Number(a?.width || 0) * Number(a?.height || 0);
      const areaB = Number(b?.width || 0) * Number(b?.height || 0);
      if (areaA !== areaB) return areaB - areaA;
      return Number(b?.file_size || 0) - Number(a?.file_size || 0);
    })[0]?.file_id || '';
}

async function getTelegramFilePath(fileId, botToken) {
  const tgUrl = new URL(`https://api.telegram.org/bot${botToken}/getFile`);
  tgUrl.searchParams.set('file_id', fileId);
  const response = await fetch(tgUrl.toString(), { method: 'GET', cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.ok) return '';
  return String(body?.result?.file_path || '').trim();
}

function mediaResponse(authResponse, bytes, contentType) {
  const headers = new Headers(authResponse.headers);
  headers.set('Content-Type', contentType || 'image/jpeg');
  headers.set('Cache-Control', 'private, max-age=3600');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Royal-Avatar-Source', 'telegram-live-fallback');
  headers.delete('Content-Length');
  headers.delete('ETag');
  return new Response(bytes, { status: 200, headers });
}

function normalizeImageType(headerType, bytes) {
  const header = String(headerType || '').split(';')[0].trim().toLowerCase();
  if (header.startsWith('image/')) return header;
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length >= 6) {
    const sig = String.fromCharCode(...bytes.subarray(0, 6));
    if (sig === 'GIF87a' || sig === 'GIF89a') return 'image/gif';
  }
  if (bytes.length >= 12) {
    const riff = String.fromCharCode(...bytes.subarray(0, 4));
    const webp = String.fromCharCode(...bytes.subarray(8, 12));
    if (riff === 'RIFF' && webp === 'WEBP') return 'image/webp';
  }
  return 'application/octet-stream';
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
