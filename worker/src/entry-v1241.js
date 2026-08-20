import currentWorker from './entry-v1230.js';

const WRAPPER_VERSION = '1.24.1';
const MEDIA_ROOT = 'media/teams';

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
        adminWrite: 'worker-signed-hmac-final-write4',
        adminTeamPhoto: 'private-admin-snapshot+sha256-media+source-fallback'
      }), { status: 200, headers });
    }

    if (url.pathname === '/admin-team-photo' && request.method === 'OPTIONS') {
      return forwardAdminData(request, env, ctx, 'OPTIONS');
    }
    if (url.pathname === '/admin-team-photo' && request.method === 'GET') {
      return handleAdminTeamPhoto(request, env, ctx, url);
    }

    return currentWorker.fetch(request, env, ctx);
  }
};

async function handleAdminTeamPhoto(request, env, ctx, url) {
  const adminResponse = await forwardAdminData(request, env, ctx, 'GET');
  if (!adminResponse.ok) return adminResponse;

  let payload;
  try { payload = await adminResponse.clone().json(); }
  catch { return imageError(adminResponse, 'ADMIN_DATA_INVALID', 502); }
  if (!payload?.ok || !payload?.permissions?.isAdmin || !payload?.adminData) {
    return imageError(adminResponse, 'ADMIN_REQUIRED', 403);
  }

  const name = String(url.searchParams.get('team') || '').trim();
  const game = canonicalGame(url.searchParams.get('game') || '');
  if (!name || !game) return imageError(adminResponse, 'TEAM_IDENTITY_REQUIRED', 400);

  const teams = Array.isArray(payload.adminData.teams) ? payload.adminData.teams : [];
  const wantedName = normalizeTeam(name);
  const team = teams.find(item =>
    normalizeTeam(item?.name) === wantedName && canonicalGame(item?.game) === game
  ) || null;
  if (!team) return imageError(adminResponse, 'TEAM_NOT_FOUND', 404);

  // Primary source: stable private media keyed ONLY by normalized team + game.
  // This does not depend on ephemeral/blank Google CellImage content URLs.
  const identity = `${normalizeTeam(team.name)}\n${canonicalGame(team.game).toLowerCase()}`;
  const hash = await sha256Hex(identity);
  const raw = await readPrivateTeamMedia(env, hash);
  if (raw) return imageResponse(adminResponse, raw.bytes, raw.contentType, 'SHA256-MEDIA');

  // Compatibility only for old rows whose private media file has not been materialized yet.
  const photoUrl = String(team?.photoUrl || '').trim();
  if (!photoUrl) return imageError(adminResponse, 'TEAM_PHOTO_NOT_FOUND', 404);

  try {
    const source = new URL(photoUrl);
    if (source.protocol !== 'https:') return imageError(adminResponse, 'TEAM_PHOTO_SOURCE_UNSAFE', 415);
    const upstream = await fetch(source.toString(), {
      method: 'GET', redirect: 'follow', cache: 'no-store',
      headers: { 'User-Agent': 'Royal-CRM-Admin-Team-Photo-Fallback' }
    });
    if (!upstream.ok) {
      return imageError(adminResponse, 'TEAM_PHOTO_SOURCE_FAILED', upstream.status === 404 ? 404 : 502);
    }
    const bytes = new Uint8Array(await upstream.arrayBuffer());
    const contentType = detectImageType(bytes, upstream.headers.get('Content-Type'));
    if (!bytes.length || bytes.length > 8 * 1024 * 1024 || !contentType) {
      return imageError(adminResponse, 'TEAM_PHOTO_SOURCE_INVALID', 415);
    }
    return imageResponse(adminResponse, bytes, contentType, 'SOURCE-FALLBACK');
  } catch (error) {
    console.warn('admin team photo source fallback failed', error?.message || 'unknown');
    return imageError(adminResponse, 'TEAM_PHOTO_SOURCE_EXCEPTION', 502);
  }
}

async function readPrivateTeamMedia(env, hash) {
  const repo = String(env.DATA_REPO || '').trim();
  const branch = String(env.DATA_BRANCH || 'main').trim();
  const token = String(env.GITHUB_TOKEN || '').trim();
  if (!repo || !token || !/^[0-9a-f]{64}$/.test(hash)) return null;

  const path = `${MEDIA_ROOT}/${hash}.bin`;
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  try {
    const response = await fetch(
      `https://api.github.com/repos/${repo}/contents/${encoded}?ref=${encodeURIComponent(branch)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.raw+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'Royal-CRM-Admin-Team-Photo'
        },
        cache: 'no-store'
      }
    );
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`private media ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const contentType = detectImageType(bytes, response.headers.get('Content-Type'));
    return bytes.length && contentType ? { bytes, contentType } : null;
  } catch (error) {
    console.warn('admin private team media read failed', error?.message || 'unknown');
    return null;
  }
}

function forwardAdminData(request, env, ctx, method) {
  const url = new URL(request.url);
  url.pathname = '/admin-data';
  url.search = '';
  const headers = new Headers();
  const authorization = request.headers.get('Authorization');
  const origin = request.headers.get('Origin');
  if (authorization) headers.set('Authorization', authorization);
  if (origin) headers.set('Origin', origin);
  return currentWorker.fetch(new Request(url.toString(), { method, headers }), env, ctx);
}

function normalizeTeam(value) {
  return String(value || '').trim().toLocaleLowerCase('ru-RU');
}

function canonicalGame(value) {
  const text = String(value || '').trim();
  const low = text.toLocaleLowerCase('ru-RU');
  if (low === 'рм' || low.includes('royal match')) return 'Royal Match';
  if (low === 'рк' || low.includes('royal kingdom')) return 'Royal Kingdom';
  return text;
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text || '')));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function detectImageType(bytes, headerType) {
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
  return '';
}

function imageResponse(adminResponse, bytes, contentType, cacheState) {
  const headers = new Headers(adminResponse.headers);
  headers.set('Content-Type', contentType);
  headers.set('Cache-Control', 'private, max-age=86400');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Royal-Admin-Media', cacheState);
  headers.delete('Content-Length');
  headers.delete('ETag');
  return new Response(bytes, { status: 200, headers });
}

function imageError(adminResponse, error, status) {
  const headers = new Headers(adminResponse.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.delete('Content-Length');
  headers.delete('ETag');
  return new Response(JSON.stringify({ ok: false, error }), { status, headers });
}
