import currentWorker from './entry-v1210.js';

const WRAPPER_VERSION = '1.22.0-dev';
const SUPPORTED_WRITE_VERSIONS = new Set(['0.6.0-write.4','0.6.0-write.5']);

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
        adminWrite: 'worker-signed-hmac-hardened',
        supportedWriteVersions: [...SUPPORTED_WRITE_VERSIONS]
      }), { status: 200, headers });
    }

    if (url.pathname === '/admin-data' && request.method === 'GET') {
      const base = await currentWorker.fetch(request, env, ctx);
      if (!base.ok) return base;

      let data;
      try { data = await base.clone().json(); }
      catch { return base; }
      if (!data?.ok || !data?.adminData) return base;

      const enabled = isHardenedWriteReady(data.adminData.write);
      data.version = WRAPPER_VERSION;
      data.permissions = {
        ...(data.permissions || {}),
        isAdmin: true,
        canViewAdmin: true,
        canEdit: enabled,
        phase: enabled ? 'write-preview' : 'read-only'
      };

      return jsonFrom(base, data, 200);
    }

    // Transition gate: even though entry-v1210 already performs the full
    // session + Telegram-admin authorization, do not let it forward a mutation
    // unless the private snapshot proves that the hardened Apps Script backend
    // is actually live. This prevents mixed write.2/write.3 deployments.
    if (url.pathname === '/admin-write' && request.method === 'POST') {
      const source = new URL(request.url);
      source.pathname = '/admin-data';
      source.search = '';
      const headers = new Headers();
      const authorization = request.headers.get('Authorization');
      const origin = request.headers.get('Origin');
      if (authorization) headers.set('Authorization', authorization);
      if (origin) headers.set('Origin', origin);

      const gate = await currentWorker.fetch(
        new Request(source.toString(), { method:'GET', headers }),
        env,
        ctx
      );
      if (!gate.ok) return gate;

      let gateData;
      try { gateData = await gate.clone().json(); }
      catch { return gate; }
      if (!gateData?.ok || !isHardenedWriteReady(gateData?.adminData?.write)) {
        return jsonFrom(gate, {
          ok:false,
          error:'ADMIN_WRITE_NOT_READY',
          message:'Защищённый режим редактирования ещё не активирован полностью.',
          version:WRAPPER_VERSION
        }, 503);
      }

      return currentWorker.fetch(request, env, ctx);
    }

    return currentWorker.fetch(request, env, ctx);
  }
};

function isHardenedWriteReady(write) {
  const meta = write || {};
  const operations = Array.isArray(meta.operations) ? meta.operations : [];
  const baseOperationsReady =
    operations.includes('updateParticipant') &&
    operations.includes('createParticipant') &&
    operations.includes('updateTeam') &&
    operations.includes('createTeam');
  const deleteContractReady = meta.version === '0.6.0-write.4'
    ? meta.deleteEnabled === false
    : meta.version === '0.6.0-write.5' &&
      meta.deleteEnabled === true &&
      operations.includes('deleteParticipant') &&
      operations.includes('deleteTeam');
  return Boolean(
    meta.enabled === true &&
    SUPPORTED_WRITE_VERSIONS.has(meta.version) &&
    meta.transport === 'worker-signed-hmac' &&
    typeof meta.endpoint === 'string' && meta.endpoint.trim() &&
    baseOperationsReady &&
    deleteContractReady
  );
}

function jsonFrom(response, payload, status) {
  const headers = new Headers(response.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.delete('Content-Length');
  headers.delete('ETag');
  return new Response(JSON.stringify(payload), { status, headers });
}
