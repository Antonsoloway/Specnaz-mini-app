const SNAPSHOT_MEMORY_TTL_MS = 60_000;
const SESSION_TTL_SEC = 6 * 60 * 60;
const INIT_DATA_MAX_AGE_SEC = 5 * 60;
const ALLOWED_CHAT_STATE = 'В чате';
const WORKER_VERSION = '1.1.0';

let snapshotMemory = null;
let snapshotFetchedAt = 0;
let snapshotEtag = '';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      if (url.pathname === '/health' && request.method === 'GET') {
        return json({ ok: true, service: 'royal-crm-miniapp-api', version: WORKER_VERSION }, 200, cors);
      }

      if (url.pathname === '/auth' && request.method === 'POST') {
        enforceOrigin(request, env);
        return await handleAuth(request, env, cors);
      }

      if (url.pathname === '/snapshot' && request.method === 'GET') {
        enforceOrigin(request, env);
        return await handleSnapshot(request, env, cors);
      }

      if (url.pathname === '/avatar' && request.method === 'GET') {
        enforceOrigin(request, env);
        return await handleAvatar(request, env, cors, url);
      }

      return json({ ok: false, error: 'NOT_FOUND' }, 404, cors);
    } catch (error) {
      console.error(error);
      const status = Number(error?.status || 500);
      return json({
        ok: false,
        error: error?.code || 'SERVER_ERROR',
        message: error?.publicMessage || 'Временная ошибка сервера.'
      }, status, cors);
    }
  }
};

async function handleAuth(request, env, cors) {
  requireSecret(env.BOT_TOKEN, 'BOT_TOKEN');
  requireSecret(env.SESSION_SECRET, 'SESSION_SECRET');
  requireSecret(env.GITHUB_TOKEN, 'GITHUB_TOKEN');
  requireSecret(env.DATA_REPO, 'DATA_REPO');

  let body;
  try {
    body = await request.json();
  } catch {
    throw appError(400, 'BAD_JSON', 'Неверный формат запроса.');
  }

  const initData = String(body?.initData || '');
  if (!initData) throw appError(401, 'INIT_DATA_MISSING', 'Откройте приложение из Telegram.');

  const validated = await validateTelegramInitData(initData, env.BOT_TOKEN);
  const snapshot = await loadSnapshot(env);
  const telegramId = String(validated.user.id);
  const profile = (snapshot.participants || []).find(p => String(p.telegramId || '') === telegramId);

  if (!profile || String(profile.chatState || '').trim() !== ALLOWED_CHAT_STATE) {
    return json({
      ok: true,
      access: false,
      reason: profile ? 'NOT_IN_CHAT' : 'NOT_IN_CRM',
      message: 'Извините, вы не состоите в спецназе.'
    }, 200, cors);
  }

  const adminInfo = await getTelegramAdminInfo(telegramId, env);
  const role = resolveRole(adminInfo.isAdmin, profile.memberships || []);
  const session = await issueSession({
    tg: telegramId,
    role: role.code,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SEC
  }, env.SESSION_SECRET);

  return json({
    ok: true,
    access: true,
    version: WORKER_VERSION,
    session,
    expiresIn: SESSION_TTL_SEC,
    snapshot: {
      dataHash: snapshot.dataHash || '',
      generatedAt: snapshot.generatedAt || '',
      stats: snapshot.stats || {}
    },
    user: {
      telegramFirstName: validated.user.first_name || '',
      telegramLastName: validated.user.last_name || '',
      telegramUsername: validated.user.username || '',
      crmName: profile.name || '',
      crmTelegramName: profile.telegramName || '',
      crmUsername: profile.username || '',
      chatState: profile.chatState || ''
    },
    role: {
      code: role.code,
      title: role.title,
      isChatAdmin: adminInfo.isAdmin,
      telegramStatus: adminInfo.status,
      adminCheck: adminInfo.check
    },
    memberships: profile.memberships || [],
    permissions: permissions(role.code)
  }, 200, cors);
}

async function handleSnapshot(request, env, cors) {
  requireSecret(env.SESSION_SECRET, 'SESSION_SECRET');
  const token = bearerToken(request);
  if (!token) throw appError(401, 'SESSION_MISSING', 'Требуется авторизация.');

  const session = await verifySession(token, env.SESSION_SECRET);
  const snapshot = await loadSnapshot(env);
  const profile = (snapshot.participants || []).find(p => String(p.telegramId || '') === String(session.tg));

  if (!profile || String(profile.chatState || '').trim() !== ALLOWED_CHAT_STATE) {
    throw appError(403, 'ACCESS_REVOKED', 'Доступ к приложению больше не активен.');
  }

  const safeSnapshot = sanitizeSnapshot(snapshot);
  const headers = new Headers(cors);
  headers.set('Cache-Control', 'private, max-age=60');
  if (snapshot.dataHash) headers.set('ETag', `"${snapshot.dataHash}"`);

  return new Response(JSON.stringify({ ok: true, snapshot: safeSnapshot }), {
    status: 200,
    headers: withJson(headers)
  });
}

async function handleAvatar(request, env, cors, url) {
  requireSecret(env.BOT_TOKEN, 'BOT_TOKEN');
  requireSecret(env.SESSION_SECRET, 'SESSION_SECRET');
  const token = bearerToken(request);
  if (!token) throw appError(401, 'SESSION_MISSING', 'Требуется авторизация.');

  const session = await verifySession(token, env.SESSION_SECRET);
  const snapshot = await loadSnapshot(env);
  const viewer = (snapshot.participants || []).find(p => String(p.telegramId || '') === String(session.tg));
  if (!viewer || String(viewer.chatState || '').trim() !== ALLOWED_CHAT_STATE) {
    throw appError(403, 'ACCESS_REVOKED', 'Доступ к приложению больше не активен.');
  }

  const fileId = String(url.searchParams.get('fileId') || '').trim();
  if (!fileId) throw appError(400, 'AVATAR_FILE_MISSING', 'Аватар не найден.');

  const allowed = (snapshot.participants || []).some(p =>
    String(p.chatState || '').trim() === ALLOWED_CHAT_STATE &&
    String(p.avatarFileId || '') === fileId
  );
  if (!allowed) throw appError(404, 'AVATAR_NOT_FOUND', 'Аватар не найден.');

  const getFileUrl = new URL(`https://api.telegram.org/bot${env.BOT_TOKEN}/getFile`);
  getFileUrl.searchParams.set('file_id', fileId);
  const getFileResponse = await fetch(getFileUrl.toString(), { cache: 'no-store' });
  const fileInfo = await getFileResponse.json().catch(() => ({}));
  const filePath = String(fileInfo?.result?.file_path || '');
  if (!getFileResponse.ok || !fileInfo?.ok || !filePath) {
    throw appError(404, 'AVATAR_FILE_UNAVAILABLE', 'Аватар временно недоступен.');
  }

  const fileResponse = await fetch(`https://api.telegram.org/file/bot${env.BOT_TOKEN}/${filePath}`);
  if (!fileResponse.ok || !fileResponse.body) {
    throw appError(502, 'AVATAR_FETCH_FAILED', 'Аватар временно недоступен.');
  }

  const headers = new Headers(cors);
  headers.set('Content-Type', fileResponse.headers.get('Content-Type') || 'image/jpeg');
  headers.set('Cache-Control', 'private, max-age=86400');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(fileResponse.body, { status: 200, headers });
}

async function validateTelegramInitData(initData, botToken) {
  const params = new URLSearchParams(initData);
  const receivedHash = String(params.get('hash') || '').toLowerCase();
  if (!receivedHash) throw appError(401, 'HASH_MISSING', 'Не удалось подтвердить Telegram-пользователя.');

  const pairs = [];
  for (const [key, value] of params.entries()) {
    if (key !== 'hash') pairs.push([key, value]);
  }
  pairs.sort((a, b) => a[0].localeCompare(b[0]));
  const dataCheckString = pairs.map(([key, value]) => `${key}=${value}`).join('\n');

  const webAppKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode('WebAppData'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const secretKey = await crypto.subtle.sign('HMAC', webAppKey, new TextEncoder().encode(botToken));
  const secretCryptoKey = await crypto.subtle.importKey(
    'raw',
    secretKey,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const calculated = await crypto.subtle.sign('HMAC', secretCryptoKey, new TextEncoder().encode(dataCheckString));
  const calculatedHash = bytesToHex(new Uint8Array(calculated));

  if (!constantTimeEqual(calculatedHash, receivedHash)) {
    throw appError(401, 'INVALID_HASH', 'Не удалось подтвердить Telegram-пользователя.');
  }

  const authDate = Number(params.get('auth_date') || 0);
  const now = Math.floor(Date.now() / 1000);
  if (!authDate || authDate > now + 60) throw appError(401, 'AUTH_DATE_INVALID', 'Данные Telegram недействительны.');
  if (now - authDate > INIT_DATA_MAX_AGE_SEC) throw appError(401, 'INIT_DATA_EXPIRED', 'Откройте приложение заново из Telegram.');

  let user;
  try {
    user = JSON.parse(params.get('user') || 'null');
  } catch {
    throw appError(401, 'USER_JSON_INVALID', 'Не удалось прочитать Telegram-пользователя.');
  }
  if (!user?.id) throw appError(401, 'USER_MISSING', 'Telegram не передал пользователя.');

  return { user, authDate };
}

async function getTelegramAdminInfo(telegramId, env) {
  const chatId = String(env.TELEGRAM_CHAT_ID || '').trim();
  if (!chatId) return { isAdmin: false, status: '', check: 'CHAT_ID_MISSING' };

  try {
    const url = new URL(`https://api.telegram.org/bot${env.BOT_TOKEN}/getChatMember`);
    url.searchParams.set('chat_id', chatId);
    url.searchParams.set('user_id', telegramId);
    const response = await fetch(url.toString());
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok || !body.result) {
      return { isAdmin: false, status: '', check: 'BOT_API_ERROR' };
    }
    const status = String(body.result.status || '');
    return {
      isAdmin: status === 'creator' || status === 'administrator',
      status,
      check: 'OK'
    };
  } catch {
    return { isAdmin: false, status: '', check: 'BOT_API_EXCEPTION' };
  }
}

function resolveRole(isAdmin, memberships) {
  if (isAdmin) return { code: 'admin', title: 'Админ' };
  const roles = (memberships || []).map(m => String(m.role || '').trim());
  if (roles.includes('Лидер')) return { code: 'leader', title: 'Лидер' };
  if (roles.includes('Помощник')) return { code: 'assistant', title: 'Помощник' };
  if (roles.includes('Игрок')) return { code: 'player', title: 'Игрок' };
  return { code: 'participant', title: 'Участник' };
}

function permissions(roleCode) {
  return {
    canUseApp: true,
    canReadDirectory: true,
    canManageAll: roleCode === 'admin',
    canManageOwnTeam: ['admin', 'leader', 'assistant'].includes(roleCode),
    canCreateHelpRequest: ['admin', 'leader', 'assistant'].includes(roleCode)
  };
}

async function loadSnapshot(env) {
  const now = Date.now();
  if (snapshotMemory && now - snapshotFetchedAt < SNAPSHOT_MEMORY_TTL_MS) return snapshotMemory;

  const repo = String(env.DATA_REPO || '').trim();
  const branch = String(env.DATA_BRANCH || 'main').trim();
  const path = String(env.DATA_PATH || 'snapshot.json').trim();
  if (!repo) throw appError(500, 'DATA_REPO_MISSING');

  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const url = `https://api.github.com/repos/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;
  const headers = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Royal-CRM-MiniApp-Worker'
  };
  if (snapshotEtag) headers['If-None-Match'] = snapshotEtag;

  const response = await fetch(url, { headers });
  if (response.status === 304 && snapshotMemory) {
    snapshotFetchedAt = now;
    return snapshotMemory;
  }
  if (!response.ok) {
    throw appError(502, 'SNAPSHOT_FETCH_FAILED', 'Не удалось загрузить актуальные данные CRM.');
  }

  const body = await response.json();
  const encoded = String(body.content || '').replace(/\s+/g, '');
  if (!encoded) throw appError(502, 'SNAPSHOT_EMPTY');

  let snapshot;
  try {
    snapshot = JSON.parse(decodeBase64Utf8(encoded));
  } catch {
    throw appError(502, 'SNAPSHOT_PARSE_FAILED');
  }

  snapshotMemory = snapshot;
  snapshotFetchedAt = now;
  snapshotEtag = response.headers.get('ETag') || '';
  return snapshot;
}

function sanitizeSnapshot(snapshot) {
  return {
    schemaVersion: snapshot.schemaVersion || '',
    generatedAt: snapshot.generatedAt || '',
    dataHash: snapshot.dataHash || '',
    stats: snapshot.stats || {},
    participants: (snapshot.participants || [])
      .filter(p => String(p.chatState || '').trim() === ALLOWED_CHAT_STATE)
      .map(p => ({
        name: p.name || '',
        telegramName: p.telegramName || '',
        username: p.username || '',
        avatarFileId: p.avatarFileId || '',
        chatState: p.chatState || '',
        memberships: p.memberships || []
      })),
    teams: (snapshot.teams || []).map(t => ({
      name: t.name || '',
      games: t.games || [],
      photoUrl: t.photoUrl || '',
      memberCount: Number(t.memberCount || 0),
      leaderCount: Number(t.leaderCount || 0),
      assistantCount: Number(t.assistantCount || 0),
      playerCount: Number(t.playerCount || 0)
    }))
  };
}

async function issueSession(payload, secret) {
  const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await hmacSha256(secret, encodedPayload);
  return `${encodedPayload}.${base64UrlEncode(signature)}`;
}

async function verifySession(token, secret) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) throw appError(401, 'SESSION_INVALID', 'Сессия недействительна.');
  const [payloadPart, sigPart] = parts;
  const expected = base64UrlEncode(await hmacSha256(secret, payloadPart));
  if (!constantTimeEqual(expected, sigPart)) throw appError(401, 'SESSION_INVALID', 'Сессия недействительна.');

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadPart)));
  } catch {
    throw appError(401, 'SESSION_INVALID', 'Сессия недействительна.');
  }
  const now = Math.floor(Date.now() / 1000);
  if (!payload?.tg || !payload?.exp || payload.exp < now) throw appError(401, 'SESSION_EXPIRED', 'Откройте приложение заново.');
  return payload;
}

async function hmacSha256(secret, value) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const result = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(value)));
  return new Uint8Array(result);
}

function bearerToken(request) {
  const header = String(request.headers.get('Authorization') || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function enforceOrigin(request, env) {
  const allowed = String(env.FRONTEND_ORIGIN || '').replace(/\/$/, '');
  if (!allowed) return;
  const origin = String(request.headers.get('Origin') || '').replace(/\/$/, '');
  if (origin && origin !== allowed) throw appError(403, 'ORIGIN_DENIED', 'Запрос с этого сайта запрещён.');
}

function corsHeaders(request, env) {
  const allowed = String(env.FRONTEND_ORIGIN || '*').replace(/\/$/, '');
  const origin = String(request.headers.get('Origin') || '').replace(/\/$/, '');
  const allowOrigin = allowed === '*' ? '*' : (origin === allowed ? origin : allowed);
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: withJson(new Headers(headers)) });
}

function withJson(headers) {
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('X-Content-Type-Options', 'nosniff');
  return headers;
}

function requireSecret(value, name) {
  if (!String(value || '').trim()) throw appError(500, `${name}_MISSING`);
}

function appError(status, code, publicMessage = '') {
  const error = new Error(code);
  error.status = status;
  error.code = code;
  error.publicMessage = publicMessage;
  return error;
}

function bytesToHex(bytes) {
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(a, b) {
  a = String(a || '');
  b = String(b || '');
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
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
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

function decodeBase64Utf8(value) {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
