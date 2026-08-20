import currentWorker from './entry-v1220.js';

const WRAPPER_VERSION = '1.23.0-dev';
const TEAM_MEDIA_PREFIX = 'media/teams/';

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
        adminWrite: 'worker-signed-hmac-hardened',
        teamPhotoBridge: 'public-hash-only-private-github'
      }), { status: 200, headers });
    }

    // Google Sheets CellImage cannot attach the Mini App bearer session.
    // This endpoint exposes ONLY one already-known team image by its stable
    // 64-hex identity hash. It cannot read arbitrary private repository paths.
    if (url.pathname === '/team-photo-public' && request.method === 'GET') {
      return handlePublicTeamPhoto(request, env, url);
    }

    return currentWorker.fetch(request, env, ctx);
  }
};

async function handlePublicTeamPhoto(request, env, url) {
  const key = String(url.searchParams.get('key') || '').trim().toLowerCase();
  const version = String(url.searchParams.get('v') || '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(key)) {
    return new Response('Not found', {
      status: 404,
      headers: { 'Cache-Control': 'public, max-age=60', 'X-Content-Type-Options': 'nosniff' }
    });
  }
  if (version && !/^[0-9a-f]{8,64}$/.test(version)) {
    return new Response('Not found', {
      status: 404,
      headers: { 'Cache-Control': 'public, max-age=60', 'X-Content-Type-Options': 'nosniff' }
    });
  }

  const repo = String(env.DATA_REPO || '').trim();
  const branch = String(env.DATA_BRANCH || 'main').trim();
  const token = String(env.GITHUB_TOKEN || '').trim();
  if (!repo || !token) {
    return new Response('Unavailable', {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
    });
  }

  const path = `${TEAM_MEDIA_PREFIX}${key}.bin`;
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  let github;
  try {
    github = await fetch(
      `https://api.github.com/repos/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.raw+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'Royal-CRM-Team-Photo-Bridge'
        },
        cache: 'no-store'
      }
    );
  } catch (error) {
    console.warn('public team photo GitHub fetch failed', error?.message || 'unknown');
    return new Response('Unavailable', {
      status: 502,
      headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
    });
  }

  if (github.status === 404) {
    return new Response('Not found', {
      status: 404,
      headers: { 'Cache-Control': 'public, max-age=60', 'X-Content-Type-Options': 'nosniff' }
    });
  }
  if (!github.ok) {
    return new Response('Unavailable', {
      status: 502,
      headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
    });
  }

  const bytes = new Uint8Array(await github.arrayBuffer());
  const contentType = detectImageType(bytes);
  if (!contentType || !bytes.length || bytes.length > 8 * 1024 * 1024) {
    return new Response('Invalid image', {
      status: 415,
      headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
    });
  }

  const headers = new Headers();
  headers.set('Content-Type', contentType);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
  headers.set(
    'Cache-Control',
    version ? 'public, max-age=31536000, immutable' : 'public, max-age=300'
  );
  return new Response(bytes, { status: 200, headers });
}

function detectImageType(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  if (bytes.length >= 6) {
    const signature = String.fromCharCode(...bytes.subarray(0, 6));
    if (signature === 'GIF87a' || signature === 'GIF89a') return 'image/gif';
  }
  if (bytes.length >= 12) {
    const riff = String.fromCharCode(...bytes.subarray(0, 4));
    const webp = String.fromCharCode(...bytes.subarray(8, 12));
    if (riff === 'RIFF' && webp === 'WEBP') return 'image/webp';
  }
  return '';
}
