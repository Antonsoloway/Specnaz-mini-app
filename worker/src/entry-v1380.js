import currentWorker from './entry-v1370.js';
import { loadPrivateSnapshotCached } from './private-snapshot-cache.js';

const WRAPPER_VERSION = '1.38.0';
const ADMIN_WRITE_CANONICAL_PREFIX = 'ROYAL_CRM_ADMIN_WRITE_V1';
const ADMIN_REFRESH_CANONICAL_PREFIX = 'ROYAL_CRM_ADMIN_REFRESH_V1';
const DEFAULT_ADMIN_DATA_PATH = 'admin-snapshot.json';
const TEAM_MEDIA_ROOT = 'media/teams';
const ADMIN_CHECK_TTL_MS = 60 * 1000;
const ADMIN_SNAPSHOT_TTL_MS = 12 * 1000;
const APPS_SCRIPT_RETRY_MS = [300, 900];
const TRANSIENT_UPSTREAM = new Set([408, 425, 429, 500, 502, 503, 504]);
const ALLOWED_OPERATIONS = new Set([
  'updateParticipant',
  'createParticipant',
  'deleteParticipant',
  'updateTeam',
  'createTeam',
  'deleteTeam'
]);

const adminStatusCache = new Map();
const adminStatusPending = new Map();
let adminSnapshotCache = null;
let adminSnapshotExpiresAt = 0;
let adminSnapshotPending = null;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if ((url.pathname === '/admin-write' || url.pathname === '/admin-team-photo') && request.method === 'OPTIONS') {
      return corsPreflight(request, env);
    }

    if (url.pathname === '/admin-team-photo' && request.method === 'GET') {
      try {
        return await handleFastAdminTeamPhoto(request, env, url);
      } catch (error) {
        console.error('v1380 admin-team-photo failed', error?.stack || error?.message || error);
        return json({
          ok: false,
          error: String(error?.code || 'ADMIN_TEAM_PHOTO_SERVER_ERROR'),
          message: String(error?.publicMessage || 'Фото команды временно недоступно.')
        }, Number(error?.status || 502), corsHeaders(request, env));
      }
    }

    if (url.pathname === '/admin-write' && request.method === 'POST') {
      try {
        return await handleFastAdminWrite(request, env, ctx);
      } catch (error) {
        console.error('v1380 admin-write failed', error?.stack || error?.message || error);
        return json({
          ok: false,
          error: String(error?.code || 'ADMIN_WRITE_SERVER_ERROR'),
          message: String(error?.publicMessage || 'Сохранение временно недоступно. Повторите попытку.')
        }, Number(error?.status || 502), corsHeaders(request, env));
      }
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
        adminWritePath: 'direct-single-auth+cors-safe+apps-script-retry',
        adminTeamPhotoPath: 'direct-private-media+legacy-name-fallback'
      }, 200);
    }
    return base;
  }
};

async function handleFastAdminTeamPhoto(request, env, url) {
  const admin = await authorizeAdmin(request, env);
  const name = String(url.searchParams.get('team') || '').trim();
  const game = canonicalGame(url.searchParams.get('game') || '');
  if (!name || !game) throw appError(400, 'TEAM_IDENTITY_REQUIRED', 'Команда не указана.');

  const normalizedName = normalizeTeam(name);
  const identity = `${normalizedName}\n${game.toLocaleLowerCase('ru-RU')}`;
  const stableHash = await sha256HexText(identity);

  // Current v1.1 media identity: normalized team + game.
  const currentMedia = await readPrivateTeamMedia(env, stableHash);
  if (currentMedia) {
    return imageResponse(request, env, currentMedia.bytes, currentMedia.contentType, 'V1380-CURRENT');
  }

  // A large part of the historical private cache was created before game was
  // added to the media identity. Those files are still valid and were the
  // reason many admin cards showed a castle/lock while the image actually
  // existed in royal-crm-data. Recover them before relying on expiring Sheets URLs.
  const legacyHash = await sha256HexText(normalizedName);
  const legacyMedia = await readPrivateTeamMedia(env, legacyHash);
  if (legacyMedia) {
    return imageResponse(request, env, legacyMedia.bytes, legacyMedia.contentType, 'V1380-LEGACY-NAME');
  }

  // Compatibility for teams that have not been materialized in private media.
  // Admin snapshot is cached briefly and public private snapshot is already
  // single-flight cached, so visible cards do not trigger a Telegram/GitHub
  // authorization fan-out per image anymore.
  let sourceUrl = '';
  try {
    const adminSnapshot = await loadAdminSnapshot(env, false);
    sourceUrl = teamPhotoUrl(adminSnapshot?.adminData?.teams, normalizedName, game);
  } catch (error) {
    console.warn('v1380 admin photo admin-snapshot fallback failed', error?.message || 'unknown');
  }
  if (!sourceUrl) {
    try {
      const snapshot = await loadPrivateSnapshotCached(env);
      sourceUrl = teamPhotoUrl(snapshot?.teams, normalizedName, game);
    } catch (error) {
      console.warn('v1380 admin photo public-snapshot fallback failed', error?.message || 'unknown');
    }
  }
  if (!sourceUrl) throw appError(404, 'TEAM_PHOTO_NOT_FOUND', 'Фото команды не найдено.');

  const upstream = await fetch(sourceUrl, {
    method: 'GET',
    redirect: 'follow',
    cache: 'no-store',
    headers: { 'User-Agent': 'Royal-CRM-Admin-Team-Photo/v1380' }
  });
  if (!upstream.ok) throw appError(upstream.status === 404 ? 404 : 502, 'TEAM_PHOTO_SOURCE_FAILED', 'Фото команды временно недоступно.');
  const bytes = new Uint8Array(await upstream.arrayBuffer());
  const contentType = detectImageType(bytes, upstream.headers.get('Content-Type'));
  if (!bytes.length || bytes.length > 8 * 1024 * 1024 || !contentType) {
    throw appError(415, 'TEAM_PHOTO_SOURCE_INVALID', 'Фото команды имеет неподдерживаемый формат.');
  }
  return imageResponse(request, env, bytes, contentType, 'V1380-SOURCE');
}

async function handleFastAdminWrite(request, env, ctx) {
  const admin = await authorizeAdmin(request, env);
  let body = null;
  try { body = await request.json(); }
  catch { throw appError(400, 'WRITE_BODY_INVALID', 'Некорректные данные изменения.'); }

  const op = String(body?.op || '').trim();
  const requestId = normalizeRequestId(body?.requestId);
  const payload = body?.payload;
  if (!ALLOWED_OPERATIONS.has(op)) throw appError(400, 'OPERATION_NOT_ALLOWED', 'Эта операция не разрешена.');
  if (!requestId) throw appError(400, 'INVALID_REQUEST_ID', 'Некорректный идентификатор операции.');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw appError(400, 'PAYLOAD_INVALID', 'Некорректные данные изменения.');
  }

  const source = await loadAdminSnapshot(env, true);
  const writeMeta = source?.adminData?.write || {};
  if (!isWriteReady(writeMeta)) {
    throw appError(503, 'ADMIN_WRITE_NOT_READY', 'Сервер редактирования ещё не готов.');
  }
  const endpoint = safeAppsScriptEndpoint(writeMeta.endpoint);
  if (!endpoint) throw appError(503, 'ADMIN_WRITE_ENDPOINT_INVALID', 'Маршрут сохранения недоступен.');

  const botToken = String(env.BOT_TOKEN || '').trim();
  if (!botToken) throw appError(500, 'ADMIN_WRITE_SECRET_MISSING', 'Серверный секрет редактирования не настроен.');

  const payloadEncoded = encodeBase64UrlUtf8(JSON.stringify(payload));
  const timestamp = String(Math.floor(Date.now() / 1000));
  const canonical = [
    ADMIN_WRITE_CANONICAL_PREFIX,
    requestId,
    admin.telegramId,
    op,
    timestamp,
    payloadEncoded
  ].join('\n');
  const signature = await hmacSha256Hex(botToken, canonical);
  const form = new URLSearchParams({
    miniapp: '1',
    action: 'admin-write',
    backend: '1',
    adminTelegramId: admin.telegramId,
    requestId,
    op,
    payload: payloadEncoded,
    timestamp,
    signature
  });

  const upstream = await fetchAppsScriptWithRetry(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'User-Agent': 'Royal-CRM-MiniApp-Worker/admin-write-v1380'
    },
    body: form.toString(),
    redirect: 'follow',
    cache: 'no-store'
  });

  const text = await upstream.text();
  let result = null;
  try { result = JSON.parse(text || '{}'); }
  catch {
    console.warn('v1380 admin-write invalid Apps Script response', upstream.status, text.slice(0, 180));
    throw appError(502, 'ADMIN_WRITE_UPSTREAM_INVALID', 'Сервер Google Sheets вернул неожиданный ответ.');
  }

  const status = result?.ok ? 200 : result?.conflict ? 409 : mapUpstreamErrorStatus(result?.error);
  let snapshotDispatch = 'not-scheduled';
  if (result?.ok && ctx && typeof ctx.waitUntil === 'function') {
    snapshotDispatch = 'worker-wait-until-v1380';
    ctx.waitUntil(
      requestImmediateSnapshotRefresh(endpoint, botToken, admin.telegramId, requestId)
        .catch(error => console.warn('v1380 admin snapshot background kick failed', error?.message || 'unknown'))
    );
  }

  // A committed write makes the cached admin snapshot stale immediately.
  if (result?.ok) invalidateAdminSnapshotCache();

  return json({
    ...result,
    workerVersion: WRAPPER_VERSION,
    transport: 'worker-signed-hmac-v1380',
    snapshotDispatch
  }, status, corsHeaders(request, env));
}

async function authorizeAdmin(request, env) {
  const sessionSecret = String(env.SESSION_SECRET || '').trim();
  if (!sessionSecret) throw appError(500, 'SESSION_SECRET_MISSING', 'Серверная сессия не настроена.');
  const token = bearerToken(request);
  if (!token) throw appError(401, 'SESSION_MISSING', 'Требуется авторизация.');
  const session = await verifySession(token, sessionSecret);
  const telegramId = cleanTelegramId(session?.tg);
  if (!telegramId) throw appError(401, 'ADMIN_REQUESTER_ID_MISSING', 'Не удалось определить администратора.');

  const check = await getTelegramAdminStatusCached(telegramId, env);
  if (!check.ok) throw appError(check.status || 502, check.error || 'ADMIN_CHECK_FAILED', 'Не удалось подтвердить права администратора.');
  if (!check.isAdmin) throw appError(403, 'ADMIN_REQUIRED', 'Изменения доступны только администраторам чата.');
  return { telegramId, session, telegramStatus: check.telegramStatus };
}

async function getTelegramAdminStatusCached(telegramId, env) {
  const now = Date.now();
  const cached = adminStatusCache.get(telegramId);
  if (cached && now - cached.at < ADMIN_CHECK_TTL_MS) return cached.value;
  if (adminStatusPending.has(telegramId)) return adminStatusPending.get(telegramId);

  const task = (async () => {
    const chatId = String(env.TELEGRAM_CHAT_ID || '').trim();
    const botToken = String(env.BOT_TOKEN || '').trim();
    if (!chatId || !botToken) return { ok:false, error:'ADMIN_CONFIG_MISSING', status:500, isAdmin:false };
    try {
      const url = new URL(`https://api.telegram.org/bot${botToken}/getChatMember`);
      url.searchParams.set('chat_id', chatId);
      url.searchParams.set('user_id', telegramId);
      const response = await fetch(url.toString(), { method:'GET', cache:'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.ok || !body?.result) {
        return { ok:false, error:'TELEGRAM_ADMIN_CHECK_FAILED', status:502, isAdmin:false };
      }
      const status = String(body.result.status || '');
      return {
        ok:true,
        isAdmin:status === 'creator' || status === 'administrator',
        telegramStatus:status,
        status:200
      };
    } catch (error) {
      console.warn('v1380 Telegram admin check failed', error?.message || 'unknown');
      return { ok:false, error:'TELEGRAM_ADMIN_CHECK_EXCEPTION', status:502, isAdmin:false };
    }
  })();
  adminStatusPending.set(telegramId, task);
  try {
    const value = await task;
    if (value.ok) adminStatusCache.set(telegramId, { at:Date.now(), value });
    return value;
  } finally {
    if (adminStatusPending.get(telegramId) === task) adminStatusPending.delete(telegramId);
  }
}

async function loadAdminSnapshot(env, force) {
  const now = Date.now();
  if (!force && adminSnapshotCache && now < adminSnapshotExpiresAt) return adminSnapshotCache;
  if (!force && adminSnapshotPending) return adminSnapshotPending;

  const task = (async () => {
    const repo = String(env.DATA_REPO || '').trim();
    const branch = String(env.DATA_BRANCH || 'main').trim();
    const path = String(env.ADMIN_DATA_PATH || DEFAULT_ADMIN_DATA_PATH).trim();
    const token = String(env.GITHUB_TOKEN || '').trim();
    if (!repo || !token || !path) throw appError(500, 'ADMIN_DATA_CONFIG_MISSING', 'Админские данные не настроены.');
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    const response = await fetch(`https://api.github.com/repos/${repo}/contents/${encoded}?ref=${encodeURIComponent(branch)}`, {
      method:'GET',
      headers:{
        Authorization:`Bearer ${token}`,
        Accept:'application/vnd.github.raw+json',
        'X-GitHub-Api-Version':'2022-11-28',
        'User-Agent':'Royal-CRM-MiniApp-v1380'
      },
      cache:'no-store'
    });
    if (!response.ok) throw appError(502, 'ADMIN_DATA_FETCH_FAILED', 'Не удалось загрузить актуальные админские данные.');
    const text = await response.text();
    if (!text.trim()) throw appError(502, 'ADMIN_DATA_EMPTY', 'Админские данные пусты.');
    const parsed = JSON.parse(text);
    adminSnapshotCache = parsed;
    adminSnapshotExpiresAt = Date.now() + ADMIN_SNAPSHOT_TTL_MS;
    return parsed;
  })();

  if (!force) adminSnapshotPending = task;
  try { return await task; }
  finally { if (!force && adminSnapshotPending === task) adminSnapshotPending = null; }
}

function invalidateAdminSnapshotCache() {
  adminSnapshotCache = null;
  adminSnapshotExpiresAt = 0;
}

async function readPrivateTeamMedia(env, hash) {
  if (!/^[0-9a-f]{64}$/.test(String(hash || ''))) return null;
  const repo = String(env.DATA_REPO || '').trim();
  const branch = String(env.DATA_BRANCH || 'main').trim();
  const token = String(env.GITHUB_TOKEN || '').trim();
  if (!repo || !token) return null;
  const path = `${TEAM_MEDIA_ROOT}/${hash}.bin`;
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  const response = await fetch(`https://api.github.com/repos/${repo}/contents/${encoded}?ref=${encodeURIComponent(branch)}`, {
    method:'GET',
    headers:{
      Authorization:`Bearer ${token}`,
      Accept:'application/vnd.github.raw+json',
      'X-GitHub-Api-Version':'2022-11-28',
      'User-Agent':'Royal-CRM-Admin-Team-Photo-v1380'
    },
    cache:'no-store'
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`private team media ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const contentType = detectImageType(bytes, response.headers.get('Content-Type'));
  if (!bytes.length || !contentType) return null;
  return { bytes, contentType };
}

function teamPhotoUrl(teams, normalizedName, game) {
  const list = Array.isArray(teams) ? teams : [];
  const exact = list.find(item => normalizeTeam(item?.name) === normalizedName && canonicalGame(item?.game || item?.games?.[0]) === game);
  return String(exact?.photoUrl || '').trim();
}

function isWriteReady(meta) {
  const operations = Array.isArray(meta?.operations) ? meta.operations : [];
  const source = String(meta?.endpointSource || '');
  const pinned = meta?.endpointPinned === true && (source === 'script-property' || source === 'deployment-constant');
  const base = meta?.enabled === true && meta?.transport === 'worker-signed-hmac' && pinned && safeAppsScriptEndpoint(meta?.endpoint) &&
    operations.includes('updateParticipant') && operations.includes('createParticipant') &&
    operations.includes('updateTeam') && operations.includes('createTeam');
  if (!base) return false;
  if (meta?.version === '0.6.0-write.4') return meta?.deleteEnabled === false;
  if (meta?.version === '0.6.0-write.5') {
    return meta?.deleteEnabled === true && operations.includes('deleteParticipant') && operations.includes('deleteTeam');
  }
  return false;
}

async function fetchAppsScriptWithRetry(endpoint, init) {
  let lastError = null;
  for (let attempt = 0; attempt <= APPS_SCRIPT_RETRY_MS.length; attempt += 1) {
    try {
      const response = await fetch(endpoint, init);
      if (!TRANSIENT_UPSTREAM.has(response.status) || attempt >= APPS_SCRIPT_RETRY_MS.length) return response;
      try { await response.body?.cancel?.(); } catch {}
      lastError = new Error(`Apps Script HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt >= APPS_SCRIPT_RETRY_MS.length) break;
    }
    await sleep(APPS_SCRIPT_RETRY_MS[attempt]);
  }
  console.warn('v1380 Apps Script transport failed', lastError?.message || 'unknown');
  throw appError(502, 'ADMIN_WRITE_UPSTREAM_UNREACHABLE', 'Сервер Google Sheets временно недоступен. Повторите попытку.');
}

async function requestImmediateSnapshotRefresh(endpoint, botToken, adminId, requestId) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const canonical = [ADMIN_REFRESH_CANONICAL_PREFIX, requestId, adminId, timestamp].join('\n');
  const signature = await hmacSha256Hex(botToken, canonical);
  const form = new URLSearchParams({
    miniapp:'1', action:'admin-snapshot-refresh', backend:'1',
    adminTelegramId:adminId, requestId, timestamp, signature
  });
  const response = await fetchAppsScriptWithRetry(endpoint, {
    method:'POST',
    headers:{
      'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8',
      'User-Agent':'Royal-CRM-MiniApp-Worker/admin-snapshot-refresh-v1380'
    },
    body:form.toString(), redirect:'follow', cache:'no-store'
  });
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text || '{}'); } catch {}
  if (!response.ok || !data?.ok) throw new Error(String(data?.error || 'ADMIN_REFRESH_UPSTREAM_FAILED'));
  return data;
}

function safeAppsScriptEndpoint(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.hostname !== 'script.google.com') return '';
    if (!/^\/macros\/s\/[A-Za-z0-9_-]+\/(exec|dev)$/.test(url.pathname)) return '';
    return url.toString();
  } catch { return ''; }
}

function canonicalGame(value) {
  const text = String(value || '').trim();
  const low = text.toLocaleLowerCase('ru-RU');
  if (low === 'рм' || low.includes('royal match')) return 'Royal Match';
  if (low === 'рк' || low.includes('royal kingdom')) return 'Royal Kingdom';
  return text;
}

function normalizeTeam(value) {
  return String(value || '').trim().toLocaleLowerCase('ru-RU');
}

function normalizeRequestId(value) {
  const text = String(value || '').trim();
  return /^[A-Za-z0-9_-]{20,100}$/.test(text) ? text : '';
}

function bearerToken(request) {
  const header = String(request.headers.get('Authorization') || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

async function verifySession(token, secret) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) throw appError(401, 'SESSION_INVALID', 'Сессия недействительна.');
  const [payloadPart, sigPart] = parts;
  const expected = base64UrlEncode(await hmacSha256(secret, payloadPart));
  if (!constantTimeEqual(expected, sigPart)) throw appError(401, 'SESSION_INVALID', 'Сессия недействительна.');
  let payload = null;
  try { payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadPart))); }
  catch { throw appError(401, 'SESSION_INVALID', 'Сессия недействительна.'); }
  const now = Math.floor(Date.now() / 1000);
  if (!payload?.tg || !payload?.exp || Number(payload.exp) < now) throw appError(401, 'SESSION_EXPIRED', 'Откройте приложение заново.');
  return payload;
}

async function hmacSha256(secret, value) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(secret || '')), { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
  const result = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(value || '')));
  return new Uint8Array(result);
}

async function hmacSha256Hex(secret, value) {
  return bytesToHex(await hmacSha256(secret, value));
}

async function sha256HexText(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
  return bytesToHex(new Uint8Array(digest));
}

function encodeBase64UrlUtf8(text) {
  const bytes = new TextEncoder().encode(String(text || ''));
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  let text = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  while (text.length % 4) text += '=';
  const binary = atob(text);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function bytesToHex(bytes) {
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(a, b) {
  a = String(a || '');
  b = String(b || '');
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function cleanTelegramId(value) {
  const text = String(value == null ? '' : value).trim().replace(/\.0$/, '');
  return /^\d+$/.test(text) ? text : '';
}

function detectImageType(bytes, headerType) {
  const header = String(headerType || '').split(';')[0].trim().toLowerCase();
  if (header.startsWith('image/')) return header;
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length >= 6) {
    const sig = String.fromCharCode(...bytes.subarray(0, 6));
    if (sig === 'GIF87a' || sig === 'GIF89a') return 'image/gif';
  }
  if (bytes.length >= 12) {
    const riff = String.fromCharCode(...bytes.subarray(0, 4));
    const webp = String.fromCharCode(...bytes.subarray(8, 12));
    if (riff === 'RIFF' && webp === 'WEBP') return 'image/webp';
  }
  return '';
}

function imageResponse(request, env, bytes, contentType, source) {
  const headers = new Headers(corsHeaders(request, env));
  headers.set('Content-Type', contentType || 'image/jpeg');
  headers.set('Cache-Control', 'private, max-age=3600');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Royal-Admin-Media', source);
  return new Response(bytes, { status:200, headers });
}

function corsHeaders(request, env) {
  const allowed = String(env.FRONTEND_ORIGIN || '*').replace(/\/$/, '');
  const origin = String(request.headers.get('Origin') || '').replace(/\/$/, '');
  const allowOrigin = allowed === '*' ? '*' : (origin === allowed ? origin : allowed);
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Max-Age': '600',
    'Vary': 'Origin'
  };
}

function corsPreflight(request, env) {
  return new Response(null, { status:204, headers:corsHeaders(request, env) });
}

function json(data, status=200, headers={}) {
  const out = new Headers(headers);
  out.set('Content-Type', 'application/json; charset=utf-8');
  out.set('Cache-Control', 'no-store');
  out.set('X-Content-Type-Options', 'nosniff');
  return new Response(JSON.stringify(data), { status, headers:out });
}

function jsonFrom(response, payload, status) {
  const headers = new Headers(response.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.delete('Content-Length');
  headers.delete('ETag');
  return new Response(JSON.stringify(payload), { status, headers });
}

function mapUpstreamErrorStatus(code) {
  const value = String(code || '');
  if (value === 'ADMIN_REQUIRED' || value === 'ADMIN_NOT_IN_CHAT') return 403;
  if (value === 'PARTICIPANT_NOT_FOUND' || value === 'TEAM_NOT_FOUND') return 404;
  if (value.includes('_DELETE_') || value === 'WRITE_BUSY') return 409;
  if (value.startsWith('BACKEND_')) return 502;
  return 400;
}

function appError(status, code, publicMessage='') {
  const error = new Error(code);
  error.status = status;
  error.code = code;
  error.publicMessage = publicMessage;
  return error;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
