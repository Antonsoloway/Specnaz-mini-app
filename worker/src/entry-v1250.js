import currentWorker from './entry-v1241.js';

const WRAPPER_VERSION = '1.25.0';
const WRITE4 = '0.6.0-write.4';
const WRITE5 = '0.6.0-write.5';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/health' && request.method === 'GET') {
      const base = await currentWorker.fetch(request, env, ctx);
      return jsonFrom(base, {
        ok: true,
        service: 'royal-crm-miniapp-api',
        version: WRAPPER_VERSION,
        adminWrite: 'worker-signed-hmac-write5',
        adminDelete: 'participant-exited+team-inactive-empty',
        adminTeamPhoto: 'private-admin-snapshot+sha256-media+source-fallback'
      }, 200);
    }

    if (url.pathname === '/admin-data' && request.method === 'GET') {
      return handleAdminData(request, env, ctx);
    }

    if (url.pathname === '/admin-write' && request.method === 'POST') {
      const base = await currentWorker.fetch(request, env, ctx);
      let data;
      try { data = await base.clone().json(); }
      catch { return base; }
      return jsonFrom(base, { ...data, workerVersion: WRAPPER_VERSION }, base.status);
    }

    return currentWorker.fetch(request, env, ctx);
  }
};

async function handleAdminData(request, env, ctx) {
  const base = await currentWorker.fetch(request, env, ctx);
  if (!base.ok) return base;

  let data;
  try { data = await base.clone().json(); }
  catch { return base; }
  if (!data?.ok || !data?.adminData) return base;

  const readiness = writeReadiness(data.adminData.write);
  data.version = WRAPPER_VERSION;
  data.permissions = {
    ...(data.permissions || {}),
    canEdit: data.permissions?.isAdmin === true && readiness.canEdit,
    canDelete: data.permissions?.isAdmin === true && readiness.canDelete,
    phase: readiness.canDelete
      ? 'write-preview-delete-ready'
      : readiness.canEdit
        ? 'write-preview-final'
        : 'read-only-waiting-write5'
  };

  return jsonFrom(base, data, 200);
}

function writeReadiness(write) {
  const meta = write || {};
  const photo = meta.teamPhoto || {};
  const operations = Array.isArray(meta.operations) ? meta.operations : [];
  const baseReady = Boolean(
    meta.enabled === true &&
    meta.transport === 'worker-signed-hmac' &&
    typeof meta.endpoint === 'string' && meta.endpoint.trim() &&
    photo.enabled === true &&
    photo.renameCleanup === true &&
    operations.includes('updateParticipant') &&
    operations.includes('createParticipant') &&
    operations.includes('updateTeam') &&
    operations.includes('createTeam')
  );
  const write4Ready = baseReady && meta.version === WRITE4 && meta.deleteEnabled === false;
  const write5Ready = baseReady &&
    meta.version === WRITE5 &&
    meta.deleteEnabled === true &&
    operations.includes('deleteParticipant') &&
    operations.includes('deleteTeam');
  return {
    canEdit: Boolean(write4Ready || write5Ready),
    canDelete: Boolean(write5Ready)
  };
}

function jsonFrom(response, payload, status) {
  const headers = new Headers(response.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.delete('Content-Length');
  headers.delete('ETag');
  return new Response(JSON.stringify(payload), { status, headers });
}
