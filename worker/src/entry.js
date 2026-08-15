import baseWorker from './index.js';

const WRAPPER_VERSION = '1.1.1';
const ALLOWED_CHAT_STATE = 'В чате';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/health' && request.method === 'GET') {
      const baseResponse = await baseWorker.fetch(request, env, ctx);
      const headers = new Headers(baseResponse.headers);
      headers.set('Content-Type', 'application/json; charset=utf-8');
      return new Response(JSON.stringify({
        ok: true,
        service: 'royal-crm-miniapp-api',
        version: WRAPPER_VERSION
      }), { status: 200, headers });
    }

    if (url.pathname !== '/avatar' || request.method !== 'GET') {
      return baseWorker.fetch(request, env, ctx);
    }

    // First use the existing, stricter implementation. It validates Origin,
    // session token, current chat membership and ownership of avatarFileId.
    const primaryResponse = await baseWorker.fetch(request, env, ctx);
    if (primaryResponse.ok) return primaryResponse;

    let errorCode = '';
    try {
      const body = await primaryResponse.clone().json();
      errorCode = String(body?.error || '');
    } catch (_) {}

    // Only fall back after the base Worker has already authenticated the request
    // and confirmed that the requested fileId belongs to an in-chat participant.
    if (!['AVATAR_FILE_UNAVAILABLE', 'AVATAR_FETCH_FAILED'].includes(errorCode)) {
      return primaryResponse;
    }

    try {
      const requestedFileId = String(url.searchParams.get('fileId') || '').trim();
      if (!requestedFileId) return primaryResponse;

      const snapshot = await loadPrivateSnapshot(env);
      const owner = (snapshot.participants || []).find(p =>
        String(p.chatState || '').trim() === ALLOWED_CHAT_STATE &&
        String(p.avatarFileId || '') === requestedFileId
      );
      const telegramId = String(owner?.telegramId || '').trim();
      if (!telegramId) return primaryResponse;

      const freshFileId = await getFreshProfilePhotoFileId(telegramId, env.BOT_TOKEN);
      if (!freshFileId) return primaryResponse;

      const filePath = await getTelegramFilePath(freshFileId, env.BOT_TOKEN);
      if (!filePath) return primaryResponse;

      const fileResponse = await fetch(`https://api.telegram.org/file/bot${env.BOT_TOKEN}/${filePath}`, {
        cache: 'no-store'
      });
      if (!fileResponse.ok || !fileResponse.body) return primaryResponse;

      const headers = new Headers(primaryResponse.headers);
      headers.set('Content-Type', fileResponse.headers.get('Content-Type') || 'image/jpeg');
      headers.set('Cache-Control', 'private, max-age=3600');
      headers.set('X-Content-Type-Options', 'nosniff');
      headers.delete('Content-Length');

      console.log('avatar fallback: fresh Telegram profile photo served');
      return new Response(fileResponse.body, { status: 200, headers });
    } catch (error) {
      console.warn('avatar fallback failed', error?.message || 'unknown');
      return primaryResponse;
    }
  }
};

async function loadPrivateSnapshot(env) {
  const repo = String(env.DATA_REPO || '').trim();
  const branch = String(env.DATA_BRANCH || 'main').trim();
  const path = String(env.DATA_PATH || 'snapshot.json').trim();
  if (!repo || !env.GITHUB_TOKEN) throw new Error('snapshot config missing');

  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const response = await fetch(
    `https://api.github.com/repos/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`,
    {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Royal-CRM-MiniApp-Worker'
      },
      cache: 'no-store'
    }
  );
  if (!response.ok) throw new Error(`snapshot ${response.status}`);

  const body = await response.json();
  const encoded = String(body?.content || '').replace(/\s+/g, '');
  if (!encoded) throw new Error('snapshot empty');

  const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function getFreshProfilePhotoFileId(telegramId, botToken) {
  if (!botToken) return '';
  const url = new URL(`https://api.telegram.org/bot${botToken}/getUserProfilePhotos`);
  url.searchParams.set('user_id', telegramId);
  url.searchParams.set('offset', '0');
  url.searchParams.set('limit', '1');

  const response = await fetch(url.toString(), { cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  const sizes = Array.isArray(body?.result?.photos?.[0]) ? body.result.photos[0] : [];
  if (!response.ok || !body?.ok || !sizes.length) return '';

  for (let i = sizes.length - 1; i >= 0; i -= 1) {
    const fileId = String(sizes[i]?.file_id || '').trim();
    if (fileId) return fileId;
  }
  return '';
}

async function getTelegramFilePath(fileId, botToken) {
  const url = new URL(`https://api.telegram.org/bot${botToken}/getFile`);
  url.searchParams.set('file_id', fileId);
  const response = await fetch(url.toString(), { cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.ok) return '';
  return String(body?.result?.file_path || '').trim();
}
