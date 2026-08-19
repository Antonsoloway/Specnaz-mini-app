import currentWorker from './entry-v1120.js';

const WRAPPER_VERSION = '1.20.0-dev';
const DEFAULT_ADMIN_DATA_PATH = 'admin-snapshot.json';

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
        adminWrite: 'disabled-in-read-phase'
      }), { status: 200, headers });
    }

    if (url.pathname === '/admin-data' && request.method === 'OPTIONS') {
      return corsPreflight(request, env);
    }

    if (url.pathname === '/admin-data' && request.method === 'GET') {
      return handleAdminData(request, env, ctx);
    }

    return currentWorker.fetch(request, env, ctx);
  }
};

async function handleAdminData(request, env, ctx) {
  const auth = await authorizeViaSnapshot(request, env, ctx);
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

  return jsonFrom(auth, {
    ok: true,
    version: WRAPPER_VERSION,
    generatedAt: String(source?.generatedAt || adminData?.generatedAt || ''),
    permissions: {
      isAdmin: true,
      canViewAdmin: true,
      canEdit: false,
      phase: 'read-only'
    },
    telegramAdminStatus: adminCheck.telegramStatus,
    adminData
  }, 200);
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
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Royal-CRM-MiniApp-Admin'
      },
      cache: 'no-store'
    }
  );
  if (!response.ok) throw new Error(`admin snapshot ${response.status}`);
  const body = await response.json();
  const encoded = String(body?.content || '').replace(/\s+/g, '');
  if (!encoded) throw new Error('admin snapshot empty');
  return JSON.parse(new TextDecoder().decode(base64ToBytes(encoded)));
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
  return currentWorker.fetch(new Request(url.toString(), { method: 'GET', headers }), env, ctx);
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

function base64ToBytes(encoded) {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
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
