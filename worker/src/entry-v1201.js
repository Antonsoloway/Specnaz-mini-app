import currentWorker from './entry-v1200.js';

const WRAPPER_VERSION = '1.20.1-dev';

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
        adminMode: 'telegram-admin-checked',
        adminData: 'private-admin-snapshot',
        adminWrite: 'protected-apps-script-preview'
      }), { status: 200, headers });
    }

    if (url.pathname === '/admin-data' && request.method === 'GET') {
      const base = await currentWorker.fetch(request, env, ctx);
      if (!base.ok) return base;
      let data;
      try { data = await base.clone().json(); }
      catch { return base; }
      if (!data?.ok || !data?.adminData) return base;

      const write = data.adminData.write || {};
      const enabled = Boolean(write.enabled && write.endpoint && Array.isArray(write.operations));
      data.version = WRAPPER_VERSION;
      data.permissions = {
        ...(data.permissions || {}),
        isAdmin: true,
        canViewAdmin: true,
        canEdit: enabled,
        phase: enabled ? 'write-preview' : 'read-only'
      };

      const headers = new Headers(base.headers);
      headers.set('Content-Type', 'application/json; charset=utf-8');
      headers.set('Cache-Control', 'no-store');
      headers.delete('Content-Length');
      headers.delete('ETag');
      return new Response(JSON.stringify(data), { status: 200, headers });
    }

    return currentWorker.fetch(request, env, ctx);
  }
};
