import currentWorker from './entry.js';

const WRAPPER_VERSION = '1.2.2';
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
        mediaCache: 'private-github-raw'
      }), { status: 200, headers });
    }

    if (url.pathname === '/team-photo' && request.method === 'GET') {
      return handleTeamPhotoRaw(request, env, ctx, url);
    }

    return currentWorker.fetch(request, env, ctx);
  }
};

async function handleTeamPhotoRaw(request, env, ctx, url) {
  const teamName = String(url.searchParams.get('team') || '').trim();
  if (!teamName) return currentWorker.fetch(request, env, ctx);

  // Reuse the existing protected /snapshot endpoint for authorization and
  // team allow-list validation. No auth logic is duplicated here.
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

  const snapshot = payload?.snapshot || {};
  const wanted = normalizeTeam(teamName);
  const team = (snapshot.teams || []).find(t => normalizeTeam(t?.name) === wanted);
  if (!team) return currentWorker.fetch(request, env, ctx);

  try {
    const mediaPath = await mediaPathFor('teams', wanted);
    const raw = await readRawMediaFromGitHub(env, mediaPath);
    if (!raw) return currentWorker.fetch(request, env, ctx);

    const headers = new Headers(snapshotResponse.headers);
    headers.set('Content-Type', raw.contentType);
    headers.set('Cache-Control', 'private, max-age=86400');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('X-Royal-Media-Cache', 'RAW-HIT');
    headers.delete('Content-Length');
    headers.delete('ETag');

    return new Response(raw.bytes, { status: 200, headers });
  } catch (error) {
    console.warn('raw team photo cache failed', error?.message || 'unknown');
    return currentWorker.fetch(request, env, ctx);
  }
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

function normalizeTeam(value) {
  return String(value || '').trim().toLowerCase();
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
