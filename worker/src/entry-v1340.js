import currentWorker from './entry-v1330.js';

const WRAPPER_VERSION = '1.34.0';
const DEFAULT_ADMIN_DATA_PATH = 'admin-snapshot.json';
const WRITE4 = '0.6.0-write.4';
const WRITE5 = '0.6.0-write.5';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/admin-data' && request.method === 'OPTIONS') {
      return corsPreflight(request, env);
    }

    if (url.pathname === '/admin-data' && request.method === 'GET') {
      return handleAdminData(request, env, ctx);
    }

    const base = await currentWorker.fetch(request, env, ctx);
    if (url.pathname === '/health' && request.method === 'GET') {
      let data = {};
      try { data = await base.clone().json(); } catch {}
      return jsonFrom(base, {
        ...data,
        ok: true,
        service: 'royal-crm-miniapp-api',
        version: WRAPPER_VERSION,
        adminDataAuth: 'direct-v1330-snapshot-session',
        adminDataSource: 'private-admin-snapshot',
        adminPermissions: 'write5+pinned-endpoint'
      }, 200);
    }

    return base;
  }
};

async function handleAdminData(request, env, ctx) {
  const auth = await authorizeViaDirectSnapshot(request, env, ctx);
  if (!auth.ok) return auth;

  let authPayload;
  try { authPayload = await auth.clone().json(); }
  catch { return auth; }
  if (!authPayload?.ok) return auth;

  const requesterId = sessionTelegramId(request.headers.get('Authorization'));
  if (!requesterId) {
    return jsonFrom(auth, {
      ok: false,
      error: 'ADMIN_REQUESTER_ID_MISSING',
      message: 'Не удалось определить администратора.'
    }, 401);
  }

  const adminCheck = await getTelegramAdminStatus(requesterId, env);
  if (!adminCheck.ok) {
    return jsonFrom(auth, {
      ok: false,
      error: adminCheck.error || 'ADMIN_CHECK_FAILED',
      message: 'Не удалось подтвердить права администратора.'
    }, adminCheck.status || 502);
  }
  if (!adminCheck.isAdmin) {
    return jsonFrom(auth, {
      ok: false,
      error: 'ADMIN_REQUIRED',
      message: 'Админ-режим доступен только администраторам чата.'
    }, 403);
  }

  let source;
  try {
    source = await loadPrivateAdminSnapshot(env);
  } catch (error) {
    console.warn('admin-data snapshot failed', error?.message || 'unknown');
    return jsonFrom(auth, {
      ok: false,
      error: 'ADMIN_DATA_NOT_READY',
      message: 'Админские данные ещё не подготовлены.'
    }, 503);
  }

  const adminData = source?.adminData;
  if (!adminData || !Array.isArray(adminData?.participants) || !Array.isArray(adminData?.teams)) {
    return jsonFrom(auth, {
      ok: false,
      error: 'ADMIN_DATA_INVALID',
      message: 'Админский снимок имеет неверный формат.'
    }, 503);
  }

  const readiness = writeReadiness(adminData.write);
  return jsonFrom(auth, {
    ok: true,
    version: WRAPPER_VERSION,
    generatedAt: String(source?.generatedAt || adminData?.generatedAt || ''),
    permissions: {
      isAdmin: true,
      canViewAdmin: true,
      canEdit: readiness.canEdit,
      canDelete: readiness.canDelete,
      phase: readiness.phase
    },
    telegramAdminStatus: adminCheck.telegramStatus,
    snapshotDispatch: 'worker-wait-until-signed-refresh',
    adminData
  }, 200);
}

function writeReadiness(write) {
  const meta = write || {};
  const photo = meta.teamPhoto || {};
  const operations = Array.isArray(meta.operations) ? meta.operations : [];
  const source = String(meta.endpointSource || '');
  const endpointPinned = meta.endpointPinned === true &&
    (source === 'script-property' || source === 'deployment-constant');
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
  const canEdit = Boolean(endpointPinned && (write4Ready || write5Ready));
  const canDelete = Boolean(endpointPinned && write5Ready);
  return {
    canEdit,
    canDelete,
    phase: canDelete
      ? 'write-preview-delete-ready'
      : canEdit
        ? 'write-preview-final'
        : endpointPinned
          ? 'read-only-waiting-write5'
          : 'read-only-waiting-endpoint-pin'
  };
}

async function authorizeViaDirectSnapshot(request, env, ctx) {
  const url = new URL(request.url);
  url.pathname = '/snapshot';
  url.search = '';
  const headers = new Headers();
  const authorization = request.headers.get('Authorization');
  const origin = request.headers.get('Origin');
  if (authorization) headers.set('Authorization', authorization);
  if (origin) headers.set('Origin', origin);
  return currentWorker.fetch(new Request(url.toString(), { method: 'GET', headers }), env, ctx);
}

async function getTelegramAdminStatus(telegramId, env) {
  const chatId = String(env.TELEGRAM_CHAT_ID || '').trim();
  const botToken = String(env.BOT_TOKEN || '').trim();
  if (!chatId || !botToken) {
    return { ok: false, error: 'ADMIN_CONFIG_MISSING', status: 500, isAdmin: false };
  }

  try {
    const url = new URL(`https://api.telegram.org/bot${botToken}/getChatMember`);
    url.searchParams.set('chat_id', chatId);
    url.searchParams.set('user_id', telegramId);
    const response = await fetch(url.toString(), { cache: 'no-store' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body?.ok || !body?.result) {
      return { ok: false, error: 'TELEGRAM_ADMIN_CHECK_FAILED', status: 502, isAdmin: false };
    }
    const status = String(body.result.status || '');
    return {
      ok: true,
      isAdmin: status === 'creator' || status === 'administrator',
      telegramStatus: status
    };
  } catch (error) {
    console.warn('admin getChatMember failed', error?.message || 'unknown');
    return { ok: false, error: 'TELEGRAM_ADMIN_CHECK_EXCEPTION', status: 502, isAdmin: false };
  }
}

async function loadPrivateAdminSnapshot(env) {
  const repo = String(env.DATA_REPO || '').trim();
  const branch = String(env.DATA_BRANCH || 'main').trim();
  const path = String(env.ADMIN_DATA_PATH || DEFAULT_ADMIN_DATA_PATH).trim();
  const token = String(env.GITHUB_TOKEN || '').trim();
  if (!repo || !token || !path) throw new Error('Admin GitHub config missing');

  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const response = await fetch(
    `https://api.github.com/repos/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.raw+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Royal-CRM-MiniApp-Admin'
      },
      cache: 'no-store'
    }
  );
  if (!response.ok) throw new Error(`admin snapshot ${response.status}`);
  const text = await response.text();
  if (!text.trim()) throw new Error('admin snapshot empty');
  return JSON.parse(text);
}

function sessionTelegramId(authorization) {
  const raw = String(authorization || '').trim();
  const session = raw.replace(/^Bearer\s+/i, '').trim();
  if (!session) return '';
  try {
    const payloadPart = session.split('.')[0] || '';
    let text = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    while (text.length % 4) text += '=';
    const binary = atob(text);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    return cleanTelegramId(payload?.tg);
  } catch {
    return '';
  }
}

function cleanTelegramId(value) {
  const text = String(value == null ? '' : value).trim().replace(/\.0$/, '');
  return /^\d+$/.test(text) ? text : '';
}

function corsPreflight(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env.FRONTEND_ORIGIN || '').trim();
  const headers = new Headers();
  if (origin && allowed && origin === allowed) headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Vary', 'Origin');
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  headers.set('Access-Control-Max-Age', '600');
  return new Response(null, { status: 204, headers });
}

function jsonFrom(response, payload, status) {
  const headers = new Headers(response.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.delete('Content-Length');
  headers.delete('ETag');
  return new Response(JSON.stringify(payload), { status, headers });
}
