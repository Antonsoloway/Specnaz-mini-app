import currentWorker from './entry-v1280.js';

const WRAPPER_VERSION = '1.29.0';
const BACKGROUND_MUSIC = 'private-authenticated-v0600';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const base = await currentWorker.fetch(request, env, ctx);

    if (url.pathname === '/health' && request.method === 'GET') {
      let data = {};
      try { data = await base.clone().json(); } catch {}
      return jsonFrom(base, {
        ...data,
        ok: true,
        service: 'royal-crm-miniapp-api',
        version: WRAPPER_VERSION,
        backgroundMusic: BACKGROUND_MUSIC
      }, 200);
    }

    return base;
  }
};

function jsonFrom(response, payload, status) {
  const headers = new Headers(response.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.delete('Content-Length');
  headers.delete('ETag');
  return new Response(JSON.stringify(payload), { status, headers });
}
