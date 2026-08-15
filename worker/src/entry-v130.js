import currentWorker from './entry-v122.js';

const WRAPPER_VERSION = '1.3.0';
const MEDIA_ROOT = 'media';

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
        teamIdentity: 'name+game',
        mediaCache: 'private-github-raw'
      }), { status: 200, headers });
    }

    if (url.pathname === '/team-photo' && request.method === 'GET') {
      return handleTeamPhotoByIdentity(request, env, ctx, url);
    }

    return currentWorker.fetch(request, env, ctx);
  }
};

async function handleTeamPhotoByIdentity(request, env, ctx, url) {
  const teamName = String(url.searchParams.get('team') || '').trim();
  const game = canonicalGame(url.searchParams.get('game') || '');
  if (!teamName) return currentWorker.fetch(request, env, ctx);

  const snapshotUrl = new URL(request.url);
  snapshotUrl.pathname = '/snapshot';
  snapshotUrl.search = '';

  const authHeaders = new Headers();
  const authorization = request.headers.get('Authorization');
  const origin = request.headers.get('Origin');
  if (authorization) authHeaders.set('Authorization', authorization);
  if (origin) authHeaders.set('Origin', origin);

  const snapshotResponse = await currentWorker.fetch(
    new Request(snapshotUrl.toString(), { method: 'GET', headers: authHeaders }),
    env,
    ctx
  );
  if (!snapshotResponse.ok) return snapshotResponse;

  let payload;
  try {
    payload = await snapshotResponse.clone().json();
  } catch {
    return currentWorker.fetch(request, env, ctx);
  }

  const teams = Array.isArray(payload?.snapshot?.teams) ? payload.snapshot.teams : [];
  const wantedName = normalizeTeam(teamName);
  const sameName = teams.filter(t => normalizeTeam(t?.name) === wantedName);
  let team = null;

  if (game) {
    team = sameName.find(t => canonicalGame(t?.game || t?.games?.[0] || '') === game) || null;
  } else if (sameName.length === 1) {
    team = sameName[0];
  }

  if (!team) {
    return jsonFromSnapshot(snapshotResponse, {
      ok: false,
      error: sameName.length > 1 ? 'TEAM_GAME_REQUIRED' : 'TEAM_NOT_FOUND',
      message: sameName.length > 1 ? 'Для команды нужно указать игру.' : 'Команда не найдена.'
    }, sameName.length > 1 ? 400 : 404);
  }

  const exactGame = canonicalGame(team?.game || team?.games?.[0] || game);
  const sourceKey = identityKey(team.name, exactGame);

  try {
    const mediaPath = await mediaPathFor('teams', sourceKey);
    const raw = await readRawMediaFromGitHub(env, mediaPath);
    if (raw) return mediaResponse(snapshotResponse, raw.bytes, raw.contentType, 'RAW-HIT-V2');

    // Transitional compatibility: use the old name-only cache only when the
    // name is unique in the snapshot, so two games can never receive the same photo.
    if (sameName.length === 1) {
      const legacyPath = await mediaPathFor('teams', wantedName);
      const legacy = await readRawMediaFromGitHub(env, legacyPath);
      if (legacy) return mediaResponse(snapshotResponse, legacy.bytes, legacy.contentType, 'RAW-HIT-LEGACY');
      return currentWorker.fetch(request, env, ctx);
    }

    return jsonFromSnapshot(snapshotResponse, {
      ok: false,
      error: 'TEAM_PHOTO_NOT_CACHED',
      message: 'Фото этой команды ещё синхронизируется.'
    }, 404);
  } catch (error) {
    console.warn('team identity media failed', error?.message || 'unknown');
    return jsonFromSnapshot(snapshotResponse, {
      ok: false,
      error: 'TEAM_PHOTO_SERVER_ERROR',
      message: 'Фото команды временно недоступно.'
    }, 502);
  }
}

function canonicalGame(value) {
  const raw = String(value || '').trim();
  const low = raw.toLowerCase();
  if (low === 'рм' || low.includes('royal match')) return 'Royal Match';
  if (low === 'рк' || low.includes('royal kingdom')) return 'Royal Kingdom';
  return raw;
}

function normalizeTeam(value) {
  return String(value || '').trim().toLowerCase();
}

function identityKey(name, game) {
  return `${normalizeTeam(name)}\n${canonicalGame(game).toLowerCase()}`;
}

async function mediaPathFor(kind, sourceKey) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(String(sourceKey || ''))
  );
  const hash = [...new Uint8Array(digest)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `${MEDIA_ROOT}/${kind}/${hash}.bin`;
}

async function readRawMediaFromGitHub(env, path) {
  const repo = String(env.DATA_REPO || '').trim();
  const branch = String(env.DATA_BRANCH || 'main').trim();
  if (!repo || !env.GITHUB_TOKEN) throw new Error('GitHub media config missing');

  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const response = await fetch(
    `https://api.github.com/repos/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`,
    {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.raw+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Royal-CRM-MiniApp-Worker'
      },
      cache: 'no-store'
    }
  );

  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`raw media read ${response.status}`);

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length) return null;
  const contentType = normalizeImageType(response.headers.get('Content-Type'), bytes);
  if (!contentType.startsWith('image/')) throw new Error(`raw media type ${contentType}`);
  return { bytes, contentType };
}

function mediaResponse(snapshotResponse, bytes, contentType, cacheState) {
  const headers = new Headers(snapshotResponse.headers);
  headers.set('Content-Type', contentType || 'image/jpeg');
  headers.set('Cache-Control', 'private, max-age=86400');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Royal-Media-Cache', cacheState);
  headers.delete('Content-Length');
  headers.delete('ETag');
  return new Response(bytes, { status: 200, headers });
}

function jsonFromSnapshot(snapshotResponse, body, status) {
  const headers = new Headers(snapshotResponse.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.delete('Content-Length');
  headers.delete('ETag');
  return new Response(JSON.stringify(body), { status, headers });
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
