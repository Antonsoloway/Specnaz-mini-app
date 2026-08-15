import baseWorker from './index.js';

const WRAPPER_VERSION = '1.2.0';
const ALLOWED_CHAT_STATE = 'В чате';
const MEDIA_ROOT = 'media';

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
        version: WRAPPER_VERSION,
        mediaCache: 'private-github'
      }), { status: 200, headers });
    }

    if (url.pathname === '/avatar' && request.method === 'GET') {
      return handleAvatar(request, env, ctx, url);
    }

    if (url.pathname === '/team-photo' && request.method === 'GET') {
      return handleTeamPhoto(request, env, ctx, url);
    }

    return baseWorker.fetch(request, env, ctx);
  }
};

async function handleAvatar(request, env, ctx, url) {
  const authResponse = await authorizeProtectedRequest(request, env, ctx);
  if (!authResponse.ok) return authResponse;

  const requestedFileId = String(url.searchParams.get('fileId') || '').trim();
  if (!requestedFileId) {
    return jsonFromAuth(authResponse, {
      ok: false,
      error: 'AVATAR_FILE_ID_MISSING',
      message: 'Аватар не указан.'
    }, 400);
  }

  try {
    const snapshot = await loadPrivateSnapshot(env);
    const owner = (snapshot.participants || []).find(p =>
      String(p.chatState || '').trim() === ALLOWED_CHAT_STATE &&
      String(p.avatarFileId || '') === requestedFileId
    );

    if (!owner) {
      return jsonFromAuth(authResponse, {
        ok: false,
        error: 'AVATAR_NOT_ALLOWED',
        message: 'Аватар недоступен.'
      }, 404);
    }

    const mediaPath = await mediaPathFor('avatars', requestedFileId);
    const cached = await readMediaFromGitHub(env, mediaPath);
    if (cached) {
      return mediaResponse(authResponse, cached.bytes, cached.contentType, 'HIT');
    }

    let sourceFileId = requestedFileId;
    let filePath = await getTelegramFilePath(sourceFileId, env.BOT_TOKEN);

    if (!filePath) {
      const telegramId = String(owner.telegramId || '').trim();
      if (telegramId) {
        sourceFileId = await getFreshProfilePhotoFileId(telegramId, env.BOT_TOKEN);
        if (sourceFileId) filePath = await getTelegramFilePath(sourceFileId, env.BOT_TOKEN);
      }
    }

    if (!filePath) {
      return jsonFromAuth(authResponse, {
        ok: false,
        error: 'AVATAR_FILE_UNAVAILABLE',
        message: 'Аватар временно недоступен.'
      }, 502);
    }

    const upstream = await fetch(`https://api.telegram.org/file/bot${env.BOT_TOKEN}/${filePath}`, {
      cache: 'no-store'
    });

    if (!upstream.ok) {
      return jsonFromAuth(authResponse, {
        ok: false,
        error: 'AVATAR_FETCH_FAILED',
        message: 'Аватар временно недоступен.'
      }, 502);
    }

    const bytes = new Uint8Array(await upstream.arrayBuffer());
    if (!bytes.length) {
      return jsonFromAuth(authResponse, {
        ok: false,
        error: 'AVATAR_FETCH_FAILED',
        message: 'Аватар временно недоступен.'
      }, 502);
    }

    const contentType = normalizeImageType(upstream.headers.get('Content-Type'), bytes);
    ctx.waitUntil(writeMediaToGitHub(env, mediaPath, bytes, `cache avatar ${mediaPath.split('/').pop()}`));

    return mediaResponse(authResponse, bytes, contentType, 'MISS');
  } catch (error) {
    console.warn('avatar cache failed', error?.message || 'unknown');
    return jsonFromAuth(authResponse, {
      ok: false,
      error: 'AVATAR_SERVER_ERROR',
      message: 'Аватар временно недоступен.'
    }, 502);
  }
}

async function handleTeamPhoto(request, env, ctx, url) {
  const authResponse = await authorizeProtectedRequest(request, env, ctx);
  if (!authResponse.ok) return authResponse;

  const teamName = String(url.searchParams.get('team') || '').trim();
  if (!teamName) {
    return jsonFromAuth(authResponse, {
      ok: false,
      error: 'TEAM_PHOTO_TEAM_MISSING',
      message: 'Команда не указана.'
    }, 400);
  }

  try {
    const snapshot = await loadPrivateSnapshot(env);
    const wanted = normalizeTeam(teamName);
    const team = (snapshot.teams || []).find(t => normalizeTeam(t?.name) === wanted);
    const photoUrl = String(team?.photoUrl || '').trim();

    if (!team || !photoUrl) {
      return jsonFromAuth(authResponse, {
        ok: false,
        error: 'TEAM_PHOTO_NOT_FOUND',
        message: 'Фото команды не найдено.'
      }, 404);
    }

    const mediaPath = await mediaPathFor('teams', photoUrl);
    const cached = await readMediaFromGitHub(env, mediaPath);
    if (cached) {
      return mediaResponse(authResponse, cached.bytes, cached.contentType, 'HIT');
    }

    const upstream = await fetch(photoUrl, {
      redirect: 'follow',
      cache: 'no-store',
      headers: { 'User-Agent': 'Royal-CRM-MiniApp-Worker/1.2' }
    });

    if (!upstream.ok) {
      console.warn('team photo upstream failed', upstream.status);
      return jsonFromAuth(authResponse, {
        ok: false,
        error: 'TEAM_PHOTO_FETCH_FAILED',
        message: 'Фото команды временно недоступно.'
      }, 502);
    }

    const bytes = new Uint8Array(await upstream.arrayBuffer());
    if (!bytes.length) {
      return jsonFromAuth(authResponse, {
        ok: false,
        error: 'TEAM_PHOTO_FETCH_FAILED',
        message: 'Фото команды временно недоступно.'
      }, 502);
    }

    const contentType = normalizeImageType(upstream.headers.get('Content-Type'), bytes);
    if (!contentType.startsWith('image/')) {
      return jsonFromAuth(authResponse, {
        ok: false,
        error: 'TEAM_PHOTO_INVALID_TYPE',
        message: 'Фото команды временно недоступно.'
      }, 502);
    }

    ctx.waitUntil(writeMediaToGitHub(env, mediaPath, bytes, `cache team photo ${mediaPath.split('/').pop()}`));
    return mediaResponse(authResponse, bytes, contentType, 'MISS');
  } catch (error) {
    console.warn('team photo cache failed', error?.message || 'unknown');
    return jsonFromAuth(authResponse, {
      ok: false,
      error: 'TEAM_PHOTO_SERVER_ERROR',
      message: 'Фото команды временно недоступно.'
    }, 502);
  }
}

async function authorizeProtectedRequest(request, env, ctx) {
  const sourceUrl = new URL(request.url);
  sourceUrl.pathname = '/snapshot';
  sourceUrl.search = '';

  const headers = new Headers();
  const authorization = request.headers.get('Authorization');
  const origin = request.headers.get('Origin');
  if (authorization) headers.set('Authorization', authorization);
  if (origin) headers.set('Origin', origin);

  return baseWorker.fetch(new Request(sourceUrl.toString(), {
    method: 'GET',
    headers
  }), env, ctx);
}

function mediaResponse(authResponse, bytes, contentType, cacheState) {
  const headers = new Headers(authResponse.headers);
  headers.set('Content-Type', contentType || 'image/jpeg');
  headers.set('Cache-Control', 'private, max-age=86400');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Royal-Media-Cache', cacheState);
  headers.delete('Content-Length');
  headers.delete('ETag');
  return new Response(bytes, { status: 200, headers });
}

function jsonFromAuth(authResponse, body, status) {
  const headers = new Headers(authResponse.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.delete('Content-Length');
  headers.delete('ETag');
  return new Response(JSON.stringify(body), { status, headers });
}

function normalizeTeam(value) {
  return String(value || '').trim().toLocaleLowerCase('ru-RU');
}

async function mediaPathFor(kind, sourceKey) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(sourceKey || '')));
  const hash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${MEDIA_ROOT}/${kind}/${hash}.bin`;
}

function githubHeaders(env, accept = 'application/vnd.github+json') {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: accept,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Royal-CRM-MiniApp-Worker'
  };
}

function repoConfig(env) {
  const repo = String(env.DATA_REPO || '').trim();
  const branch = String(env.DATA_BRANCH || 'main').trim();
  if (!repo || !env.GITHUB_TOKEN) throw new Error('GitHub media config missing');
  return { repo, branch };
}

async function readMediaFromGitHub(env, path) {
  const { repo, branch } = repoConfig(env);
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const response = await fetch(`https://api.github.com/repos/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`, {
    headers: githubHeaders(env),
    cache: 'no-store'
  });

  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`media read ${response.status}`);

  const body = await response.json();
  const encoded = String(body?.content || '').replace(/\s+/g, '');
  if (!encoded) return null;

  const bytes = base64ToBytes(encoded);
  return { bytes, contentType: detectImageType(bytes) };
}

async function writeMediaToGitHub(env, path, bytes, message) {
  try {
    const { repo, branch } = repoConfig(env);
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    const response = await fetch(`https://api.github.com/repos/${repo}/contents/${encodedPath}`, {
      method: 'PUT',
      headers: {
        ...githubHeaders(env),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message,
        content: bytesToBase64(bytes),
        branch
      })
    });

    if (response.ok || response.status === 409 || response.status === 422) {
      console.log('media cached', path, response.status);
      return;
    }

    console.warn('media cache write failed', path, response.status);
  } catch (error) {
    console.warn('media cache write exception', path, error?.message || 'unknown');
  }
}

async function loadPrivateSnapshot(env) {
  const { repo, branch } = repoConfig(env);
  const path = String(env.DATA_PATH || 'snapshot.json').trim();
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const response = await fetch(`https://api.github.com/repos/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`, {
    headers: githubHeaders(env),
    cache: 'no-store'
  });

  if (!response.ok) throw new Error(`snapshot ${response.status}`);
  const body = await response.json();
  const encoded = String(body?.content || '').replace(/\s+/g, '');
  if (!encoded) throw new Error('snapshot empty');
  return JSON.parse(new TextDecoder().decode(base64ToBytes(encoded)));
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
  if (!fileId || !botToken) return '';
  const url = new URL(`https://api.telegram.org/bot${botToken}/getFile`);
  url.searchParams.set('file_id', fileId);
  const response = await fetch(url.toString(), { cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.ok) return '';
  return String(body?.result?.file_path || '').trim();
}

function base64ToBytes(encoded) {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes) {
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
}

function normalizeImageType(headerType, bytes) {
  const header = String(headerType || '').split(';')[0].trim().toLowerCase();
  if (header.startsWith('image/')) return header;
  return detectImageType(bytes);
}

function detectImageType(bytes) {
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
