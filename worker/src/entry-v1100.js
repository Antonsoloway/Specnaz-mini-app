import currentWorker from './entry-v190.js';

const WRAPPER_VERSION = '1.10.0';
const MAYAK_MEDIA = {
  'leaderboard-players': { path: 'media/projects/mayak/leaderboard-players.jpg', mime: 'image/jpeg' },
  'leaderboard-team': { path: 'media/projects/mayak/leaderboard-team.jpg', mime: 'image/jpeg' },
  'audio': { path: 'media/projects/mayak/proekt-mayak.mp3', mime: 'audio/mpeg' },
  'background-v0600': { path: 'media/app/v0600/project-mayak-background.mp3', mime: 'audio/mpeg' },
  'video': { path: 'media/projects/mayak/mayak-video.mp4', mime: 'video/mp4' }
};

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
        adminsDirectory: 'telegram-getChatAdministrators',
        projectMayakMedia: 'private-github-authenticated'
      }), { status: 200, headers });
    }

    if (url.pathname === '/project-mayak-media' && request.method === 'GET') {
      return handleMayakMedia(request, env, ctx);
    }

    return currentWorker.fetch(request, env, ctx);
  }
};

async function handleMayakMedia(request, env, ctx) {
  const auth = await authorizeViaSnapshot(request, env, ctx);
  if (!auth.ok) return auth;

  let authPayload = null;
  try { authPayload = await auth.clone().json(); } catch {}
  if (!authPayload?.ok) return auth;

  const url = new URL(request.url);
  const asset = String(url.searchParams.get('asset') || '').trim();
  const item = MAYAK_MEDIA[asset];
  if (!item) return jsonFrom(auth, { ok:false, error:'PROJECT_MEDIA_UNKNOWN' }, 404);

  const repo = String(env.DATA_REPO || '').trim();
  const branch = String(env.DATA_BRANCH || 'main').trim();
  const token = String(env.GITHUB_TOKEN || '').trim();
  if (!repo || !token) return jsonFrom(auth, { ok:false, error:'PROJECT_MEDIA_CONFIG_MISSING' }, 500);

  const ghUrl = `https://api.github.com/repos/${repo}/contents/${encodePath(item.path)}?ref=${encodeURIComponent(branch)}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.raw+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Royal-CRM-MiniApp-Worker'
  };
  const requestedRange = request.headers.get('Range');
  if (requestedRange) headers.Range = requestedRange;

  let gh;
  try {
    gh = await fetch(ghUrl, { method:'GET', headers, cache:'no-store' });
  } catch (error) {
    console.warn('project-mayak-media github fetch failed', error?.message || 'unknown');
    return jsonFrom(auth, { ok:false, error:'PROJECT_MEDIA_FETCH_FAILED' }, 502);
  }

  if (!gh.ok && gh.status !== 206) {
    return jsonFrom(auth, { ok:false, error:'PROJECT_MEDIA_NOT_READY', upstreamStatus:gh.status }, gh.status === 404 ? 404 : 502);
  }

  const outHeaders = new Headers(auth.headers);
  outHeaders.set('Content-Type', item.mime);
  outHeaders.set('Cache-Control', 'private, max-age=86400');
  outHeaders.set('Accept-Ranges', gh.headers.get('Accept-Ranges') || 'bytes');
  const contentRange = gh.headers.get('Content-Range');
  const contentLength = gh.headers.get('Content-Length');
  if (contentRange) outHeaders.set('Content-Range', contentRange);
  if (contentLength) outHeaders.set('Content-Length', contentLength);
  else outHeaders.delete('Content-Length');
  outHeaders.delete('ETag');

  return new Response(gh.body, { status: gh.status, headers: outHeaders });
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

function encodePath(path) {
  return String(path || '').split('/').map(encodeURIComponent).join('/');
}

function jsonFrom(response, payload, status) {
  const headers = new Headers(response.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.delete('Content-Length');
  headers.delete('ETag');
  return new Response(JSON.stringify(payload), { status, headers });
}
