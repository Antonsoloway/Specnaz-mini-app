import currentWorker from './entry-v1260.js';

const WRAPPER_VERSION = '1.27.0';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/health' && request.method === 'GET') {
      const base = await currentWorker.fetch(request, env, ctx);
      let data = {};
      try { data = await base.clone().json(); } catch {}
      return jsonFrom(base, {
        ...data,
        ok: true,
        service: 'royal-crm-miniapp-api',
        version: WRAPPER_VERSION,
        adminWriteEndpoint: 'pinned-deployment-config'
      }, 200);
    }

    if (url.pathname === '/admin-data' && request.method === 'GET') {
      const base = await currentWorker.fetch(request, env, ctx);
      if (!base.ok) return base;

      let data;
      try { data = await base.clone().json(); }
      catch { return base; }
      if (!data?.ok || !data?.adminData) return base;

      const write = data.adminData.write || {};
      const source = String(write.endpointSource || '');
      const endpointPinned = write.endpointPinned === true &&
        (source === 'script-property' || source === 'deployment-constant');
      data.version = WRAPPER_VERSION;
      data.permissions = {
        ...(data.permissions || {}),
        canEdit: endpointPinned && data.permissions?.canEdit === true,
        canDelete: endpointPinned && data.permissions?.canDelete === true,
        phase: endpointPinned
          ? data.permissions?.phase
          : 'read-only-waiting-endpoint-pin'
      };
      return jsonFrom(base, data, 200);
    }

    return currentWorker.fetch(request, env, ctx);
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
