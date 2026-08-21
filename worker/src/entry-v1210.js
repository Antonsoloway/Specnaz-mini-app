import currentWorker from './entry-v1200.js';

const WRAPPER_VERSION = '1.21.0-dev';
const ADMIN_WRITE_CANONICAL_PREFIX = 'ROYAL_CRM_ADMIN_WRITE_V1';
const ALLOWED_OPERATIONS = new Set([
  'updateParticipant',
  'createParticipant',
  'deleteParticipant',
  'updateTeam',
  'createTeam',
  'deleteTeam'
]);

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
        adminWrite: 'worker-signed-hmac'
      }), { status: 200, headers });
    }

    if (url.pathname === '/admin-write' && request.method === 'OPTIONS') {
      return corsPreflight(request, env);
    }

    if (url.pathname === '/admin-write' && request.method === 'POST') {
      return handleAdminWrite(request, env, ctx);
    }

    return currentWorker.fetch(request, env, ctx);
  }
};

async function handleAdminWrite(request, env, ctx) {
  // Reuse /admin-data itself as the authorization gate. That route already:
  // 1) verifies the normal Worker session, 2) extracts Telegram ID,
  // 3) performs a fresh Telegram getChatMember admin check, and
  // 4) loads the private admin snapshot.
  const adminResponse = await authorizeViaAdminData(request, env, ctx);
  if (!adminResponse.ok) return adminResponse;

  let adminPayload;
  try { adminPayload = await adminResponse.clone().json(); }
  catch {
    return jsonFrom(adminResponse, {
      ok: false,
      error: 'ADMIN_AUTH_INVALID',
      message: 'Не удалось подтвердить админский режим.'
    }, 502);
  }

  if (!adminPayload?.ok || !adminPayload?.permissions?.isAdmin) {
    return jsonFrom(adminResponse, {
      ok: false,
      error: 'ADMIN_REQUIRED',
      message: 'Изменения доступны только администраторам чата.'
    }, 403);
  }

  const adminId = sessionTelegramId(request.headers.get('Authorization'));
  if (!adminId) {
    return jsonFrom(adminResponse, {
      ok: false,
      error: 'ADMIN_REQUESTER_ID_MISSING',
      message: 'Не удалось определить администратора.'
    }, 401);
  }

  let body;
  try { body = await request.json(); }
  catch {
    return jsonFrom(adminResponse, {
      ok: false,
      error: 'WRITE_BODY_INVALID',
      message: 'Некорректные данные изменения.'
    }, 400);
  }

  const op = String(body?.op || '').trim();
  const requestId = normalizeRequestId(body?.requestId);
  const payload = body?.payload;
  if (!ALLOWED_OPERATIONS.has(op)) {
    return jsonFrom(adminResponse, {
      ok: false,
      error: 'OPERATION_NOT_ALLOWED',
      message: 'Эта операция не разрешена в v0.6.'
    }, 400);
  }
  if (!requestId) {
    return jsonFrom(adminResponse, {
      ok: false,
      error: 'INVALID_REQUEST_ID',
      message: 'Некорректный идентификатор операции.'
    }, 400);
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return jsonFrom(adminResponse, {
      ok: false,
      error: 'PAYLOAD_INVALID',
      message: 'Некорректные данные изменения.'
    }, 400);
  }

  const writeMeta = adminPayload?.adminData?.write || {};
  const endpoint = safeAppsScriptEndpoint(writeMeta?.endpoint);
  if (!writeMeta?.enabled || !endpoint) {
    return jsonFrom(adminResponse, {
      ok: false,
      error: 'ADMIN_WRITE_NOT_READY',
      message: 'Сервер редактирования Apps Script ещё не активирован.'
    }, 503);
  }
  const endpointSource = String(writeMeta?.endpointSource || '');
  const endpointIsPinned = writeMeta?.endpointPinned === true &&
    (endpointSource === 'script-property' || endpointSource === 'deployment-constant');
  if (!endpointIsPinned) {
    return jsonFrom(adminResponse, {
      ok: false,
      error: 'ADMIN_WRITE_ENDPOINT_NOT_PINNED',
      message: 'Маршрут редактирования ещё не привязан к deployment «Таблица ЧП 1.3».'
    }, 503);
  }

  const botToken = String(env.BOT_TOKEN || '').trim();
  if (!botToken) {
    return jsonFrom(adminResponse, {
      ok: false,
      error: 'ADMIN_WRITE_SECRET_MISSING',
      message: 'Серверный секрет редактирования не настроен.'
    }, 500);
  }

  const payloadEncoded = encodeBase64UrlUtf8(JSON.stringify(payload));
  const timestamp = String(Math.floor(Date.now() / 1000));
  const canonical = [
    ADMIN_WRITE_CANONICAL_PREFIX,
    requestId,
    adminId,
    op,
    timestamp,
    payloadEncoded
  ].join('\n');
  const signature = await hmacSha256Hex(botToken, canonical);

  const form = new URLSearchParams({
    miniapp: '1',
    action: 'admin-write',
    backend: '1',
    adminTelegramId: adminId,
    requestId,
    op,
    payload: payloadEncoded,
    timestamp,
    signature
  });

  let upstream;
  try {
    upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'User-Agent': 'Royal-CRM-MiniApp-Worker/admin-write'
      },
      body: form.toString(),
      redirect: 'follow',
      cache: 'no-store'
    });
  } catch (error) {
    console.warn('admin-write Apps Script fetch failed', error?.message || 'unknown');
    return jsonFrom(adminResponse, {
      ok: false,
      error: 'ADMIN_WRITE_UPSTREAM_UNREACHABLE',
      message: 'Сервер Google Sheets временно недоступен. Повторите попытку.'
    }, 502);
  }

  const text = await upstream.text();
  let result;
  try { result = JSON.parse(text || '{}'); }
  catch {
    console.warn('admin-write Apps Script invalid response', upstream.status, text.slice(0, 200));
    return jsonFrom(adminResponse, {
      ok: false,
      error: 'ADMIN_WRITE_UPSTREAM_INVALID',
      message: 'Сервер Google Sheets вернул неожиданный ответ.'
    }, 502);
  }

  const status = result?.ok ? 200 : result?.conflict ? 409 : mapUpstreamErrorStatus(result?.error);
  return jsonFrom(adminResponse, {
    ...result,
    workerVersion: WRAPPER_VERSION,
    transport: 'worker-signed-hmac'
  }, status);
}

async function authorizeViaAdminData(request, env, ctx) {
  const source = new URL(request.url);
  source.pathname = '/admin-data';
  source.search = '';
  const headers = new Headers();
  const authorization = request.headers.get('Authorization');
  const origin = request.headers.get('Origin');
  if (authorization) headers.set('Authorization', authorization);
  if (origin) headers.set('Origin', origin);
  return currentWorker.fetch(new Request(source.toString(), { method: 'GET', headers }), env, ctx);
}

function safeAppsScriptEndpoint(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return '';
    if (url.hostname !== 'script.google.com') return '';
    if (!/^\/macros\/s\/[A-Za-z0-9_-]+\/(exec|dev)$/.test(url.pathname)) return '';
    return url.toString();
  } catch {
    return '';
  }
}

function normalizeRequestId(value) {
  const text = String(value || '').trim();
  return /^[A-Za-z0-9_-]{20,100}$/.test(text) ? text : '';
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
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
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

function encodeBase64UrlUtf8(text) {
  const bytes = new TextEncoder().encode(String(text || ''));
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function hmacSha256Hex(secret, text) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(secret || '')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(String(text || ''))
  );
  return [...new Uint8Array(signature)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

function mapUpstreamErrorStatus(code) {
  const value = String(code || '');
  if (value === 'ADMIN_REQUIRED' || value === 'ADMIN_NOT_IN_CHAT') return 403;
  if (value === 'PARTICIPANT_NOT_FOUND' || value === 'TEAM_NOT_FOUND') return 404;
  if (value.includes('_DELETE_')) return 409;
  if (value === 'WRITE_BUSY') return 409;
  if (value.startsWith('BACKEND_')) return 502;
  return 400;
}

function corsPreflight(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env.FRONTEND_ORIGIN || '').trim();
  const headers = new Headers();
  if (origin && allowed && origin === allowed) headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Vary', 'Origin');
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
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
