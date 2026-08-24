import currentWorker from './entry-v1380.js';

const WRAPPER_VERSION = '1.39.0';
const MUSIC_MEDIA = {
  'music-v061-02': { path:'media/app/v0600/music/track-02.mp3', mime:'audio/mpeg' },
  'music-v061-03': { path:'media/app/v0600/music/track-03.mp3', mime:'audio/mpeg' },
  'music-v061-04': { path:'media/app/v0600/music/track-04.mp3', mime:'audio/mpeg' },
  'music-v061-05': { path:'media/app/v0600/music/track-05.mp3', mime:'audio/mpeg' },
  'music-v061-06': { path:'media/app/v0600/music/track-06.mp3', mime:'audio/mpeg' }
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/project-mayak-media' && request.method === 'GET') {
      const asset = String(url.searchParams.get('asset') || '').trim();
      if (MUSIC_MEDIA[asset]) return handlePlaylistMedia(request, env, ctx, MUSIC_MEDIA[asset]);
    }

    const base = await currentWorker.fetch(request, env, ctx);
    if (url.pathname === '/health' && request.method === 'GET') {
      let data = {};
      try { data = await base.clone().json(); } catch {}
      return jsonFrom(base, {
        ...data,
        ok:true,
        service:'royal-crm-miniapp-api',
        version:WRAPPER_VERSION,
        backgroundPlaylist:'private-authenticated-random-6'
      }, 200);
    }
    return base;
  }
};

async function handlePlaylistMedia(request, env, ctx, item) {
  const auth = await authorizeViaSnapshot(request, env, ctx);
  if (!auth.ok) return auth;

  let authPayload = null;
  try { authPayload = await auth.clone().json(); } catch {}
  if (!authPayload?.ok) return auth;

  const repo = String(env.DATA_REPO || '').trim();
  const branch = String(env.DATA_BRANCH || 'main').trim();
  const token = String(env.GITHUB_TOKEN || '').trim();
  if (!repo || !token) return jsonFrom(auth, { ok:false, error:'PROJECT_MEDIA_CONFIG_MISSING' }, 500);

  const ghUrl = `https://api.github.com/repos/${repo}/contents/${encodePath(item.path)}?ref=${encodeURIComponent(branch)}`;
  const headers = {
    Authorization:`Bearer ${token}`,
    Accept:'application/vnd.github.raw+json',
    'X-GitHub-Api-Version':'2022-11-28',
    'User-Agent':'Royal-CRM-MiniApp-Playlist'
  };
  const range = request.headers.get('Range');
  if (range) headers.Range = range;

  let gh;
  try { gh = await fetch(ghUrl, { method:'GET', headers, cache:'no-store' }); }
  catch (error) {
    console.warn('playlist media github fetch failed', error?.message || 'unknown');
    return jsonFrom(auth, { ok:false, error:'PROJECT_MEDIA_FETCH_FAILED' }, 502);
  }
  if (!gh.ok && gh.status !== 206) {
    return jsonFrom(auth, { ok:false, error:'PROJECT_MEDIA_NOT_READY' }, gh.status === 404 ? 404 : 502);
  }

  const out = new Headers(auth.headers);
  out.set('Content-Type', item.mime);
  out.set('Cache-Control','private, max-age=86400');
  out.set('Accept-Ranges',gh.headers.get('Accept-Ranges') || 'bytes');
  const contentRange = gh.headers.get('Content-Range');
  const contentLength = gh.headers.get('Content-Length');
  if (contentRange) out.set('Content-Range',contentRange);
  if (contentLength) out.set('Content-Length',contentLength); else out.delete('Content-Length');
  out.delete('ETag');
  return new Response(gh.body, { status:gh.status, headers:out });
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
  headers.set('Content-Type','application/json; charset=utf-8');
  headers.set('Cache-Control','no-store');
  headers.delete('Content-Length');
  headers.delete('ETag');
  return new Response(JSON.stringify(payload), { status, headers });
}
