import currentWorker from './entry-v1270.js';

const WRAPPER_VERSION = '1.28.0';
const SNAPSHOT_DISPATCH = 'worker-wait-until-signed-refresh';

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
        snapshotDispatch: SNAPSHOT_DISPATCH
      }, 200);
    }

    if (url.pathname === '/admin-data' && request.method === 'GET' && base.ok) {
      let data;
      try { data = await base.clone().json(); }
      catch { return base; }
      if (!data?.ok) return base;
      return jsonFrom(base, {
        ...data,
        version: WRAPPER_VERSION,
        snapshotDispatch: SNAPSHOT_DISPATCH
      }, base.status);
    }

    if (url.pathname === '/admin-write' && request.method === 'POST') {
      let data;
      try { data = await base.clone().json(); }
      catch { return base; }
      return jsonFrom(base, {
        ...data,
        workerVersion: WRAPPER_VERSION,
        snapshotDispatch: data?.snapshotDispatch || 'not-scheduled'
      }, base.status);
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
