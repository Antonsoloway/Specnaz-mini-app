import currentWorker from './entry-v1320.js';
import { loadPrivateSnapshotCached } from './private-snapshot-cache.js';

const WRAPPER_VERSION = '1.33.0';
const ALLOWED_CHAT_STATE = 'В чате';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/snapshot' && request.method === 'GET') {
      return handleDirectSnapshot(request, env);
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
        snapshotDelivery: 'direct-session-verified-private-cache',
        snapshotIdentity: 'telegramId-only',
        snapshotLegacyHmacFanout: 'bypassed'
      }, 200);
    }

    return base;
  }
};

async function handleDirectSnapshot(request, env) {
  const cors = corsHeaders(request, env);
  try {
    enforceOrigin(request, env);
    requireSecret(env.SESSION_SECRET, 'SESSION_SECRET');
    requireSecret(env.GITHUB_TOKEN, 'GITHUB_TOKEN');
    requireSecret(env.DATA_REPO, 'DATA_REPO');

    const token = bearerToken(request);
    if (!token) throw appError(401, 'SESSION_MISSING', 'Требуется авторизация.');

    const session = await verifySession(token, env.SESSION_SECRET);
    let source;
    try {
      source = await loadPrivateSnapshotCached(env);
    } catch (error) {
      console.warn('direct snapshot source failed', error?.message || 'unknown');
      throw appError(502, 'SNAPSHOT_FETCH_FAILED', 'Не удалось загрузить актуальные данные CRM.');
    }

    const viewer = (Array.isArray(source?.participants) ? source.participants : []).find(item =>
      cleanTelegramId(item?.telegramId) === cleanTelegramId(session?.tg) &&
      String(item?.chatState || '').trim() === ALLOWED_CHAT_STATE
    );
    if (!viewer) throw appError(403, 'ACCESS_REVOKED', 'Доступ к приложению больше не активен.');

    const snapshot = sanitizeSnapshot(source);
    const headers = new Headers(cors);
    headers.set('Content-Type', 'application/json; charset=utf-8');
    headers.set('Cache-Control', 'private, max-age=60');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('X-Royal-Snapshot-Path', 'direct-v1330');
    if (source?.dataHash) headers.set('ETag', `"${String(source.dataHash)}"`);

    return new Response(JSON.stringify({ ok: true, snapshot }), { status: 200, headers });
  } catch (error) {
    const status = Number(error?.status || 500);
    return json({
      ok: false,
      error: String(error?.code || 'SERVER_ERROR'),
      message: String(error?.publicMessage || 'Временная ошибка сервера.')
    }, status, cors);
  }
}

function sanitizeSnapshot(source) {
  const sourceParticipants = Array.isArray(source?.participants) ? source.participants : [];
  const participants = sourceParticipants
    .filter(item => String(item?.chatState || '').trim() === ALLOWED_CHAT_STATE)
    .map(item => ({
      telegramId: cleanTelegramId(item?.telegramId),
      name: String(item?.name || ''),
      telegramName: String(item?.telegramName || ''),
      username: String(item?.username || ''),
      avatarFileId: String(item?.avatarFileId || ''),
      chatState: ALLOWED_CHAT_STATE,
      specnazTrips: Number(item?.specnazTrips || 0),
      specnazRank: String(item?.specnazRank || rankFromTrips(item?.specnazTrips || 0)),
      memberships: sanitizeMemberships(item?.memberships),
      searchKeys: sanitizeSearchKeys(item?.searchKeys)
    }))
    .filter(item => item.telegramId);

  const participantIds = new Set(participants.map(item => item.telegramId));
  const teams = (Array.isArray(source?.teams) ? source.teams : []).map(item => ({
    key: String(item?.key || ''),
    name: String(item?.name || ''),
    game: String(item?.game || ''),
    games: Array.isArray(item?.games) ? item.games.map(value => String(value || '')) : [],
    photoUrl: String(item?.photoUrl || ''),
    memberCount: Number(item?.memberCount || 0),
    leaderCount: Number(item?.leaderCount || 0),
    assistantCount: Number(item?.assistantCount || 0),
    playerCount: Number(item?.playerCount || 0),
    status: String(item?.status || ''),
    searchKeys: sanitizeSearchKeys(item?.searchKeys)
  }));

  return {
    schemaVersion: String(source?.schemaVersion || ''),
    generatedAt: String(source?.generatedAt || ''),
    dataHash: String(source?.dataHash || ''),
    stats: source?.stats && typeof source.stats === 'object' ? source.stats : {},
    profileStatsVersion: String(source?.profileStatsVersion || ''),
    specnazHistoryVersion: String(source?.specnazHistoryVersion || source?.specnazHistory?.version || ''),
    searchIndexVersion: String(source?.searchIndexVersion || ''),
    unifiedSnapshotVersion: String(source?.unifiedSnapshotVersion || ''),
    participants,
    teams,
    specnazHistory: sanitizeHistory(source?.specnazHistory, participantIds)
  };
}

function sanitizeMemberships(value) {
  return (Array.isArray(value) ? value : []).map(item => ({
    slot: Number(item?.slot || 0),
    team: String(item?.team || ''),
    teamRaw: String(item?.teamRaw || ''),
    teamKey: String(item?.teamKey || ''),
    nickname: String(item?.nickname || ''),
    role: String(item?.role || ''),
    game: String(item?.game || '')
  }));
}

function sanitizeSearchKeys(value) {
  const seen = new Set();
  const out = [];
  (Array.isArray(value) ? value : []).forEach(item => {
    const text = String(item == null ? '' : item).trim().slice(0, 180);
    const key = text.toLocaleLowerCase('ru-RU');
    if (!text || seen.has(key) || out.length >= 100) return;
    seen.add(key);
    out.push(text);
  });
  return out;
}

function sanitizeHistory(history, participantIds) {
  const sections = Array.isArray(history?.sections) ? history.sections : [];
  return {
    version: String(history?.version || ''),
    updatedAt: String(history?.updatedAt || ''),
    sections: sections.map(section => ({
      title: String(section?.title || ''),
      rows: (Array.isArray(section?.rows) ? section.rows : []).map(row => {
        const rawId = cleanTelegramId(row?.telegramId);
        const clean = {
          telegramId: rawId && participantIds.has(rawId) ? rawId : '',
          date: String(row?.date || ''),
          name: String(row?.name || ''),
          team: String(row?.team || ''),
          before: String(row?.before || ''),
          after: String(row?.after || ''),
          added: String(row?.added || ''),
          rank: String(row?.rank || ''),
          message: String(row?.message || '')
        };
        const rich = sanitizeHistoryRich(row?.messageRich);
        if (rich.length) clean.messageRich = rich;
        return clean;
      })
    }))
  };
}

function sanitizeHistoryRich(value) {
  if (!Array.isArray(value)) return [];
  return value.map(segment => {
    const text = String(segment?.text || '');
    const url = safeHistoryUrl(segment?.url);
    return url ? { text, url } : { text };
  }).filter(segment => segment.text);
}

function safeHistoryUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'tg:') return raw;
  } catch {}
  return '';
}

function rankFromTrips(value) {
  const score = Number(value || 0);
  const levels = [
    [80, 'БОГ СПЕЦНАЗА'], [60, 'Легендарный'], [48, 'Бессмертный'],
    [38, 'Величайший'], [30, 'Маэстро'], [22, 'Выдающийся'],
    [14, 'Знаменитый'], [8, 'Известный'], [4, 'Узнаваемый'],
    [1, 'Начинающий'], [0, 'Новичок']
  ];
  for (const [min, title] of levels) if (score >= min) return title;
  return 'Новичок';
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
  if (!payload?.tg || !payload?.exp || Number(payload.exp) < now) {
    throw appError(401, 'SESSION_EXPIRED', 'Откройте приложение заново.');
  }
  return payload;
}

let hmacKeySecret = '';
let hmacKeyPromise = null;

async function hmacSha256(secret, value) {
  const normalized = String(secret || '');
  if (!hmacKeyPromise || hmacKeySecret !== normalized) {
    hmacKeySecret = normalized;
    hmacKeyPromise = crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(normalized),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
  }
  const key = await hmacKeyPromise;
  const result = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(value || '')));
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

function json(data, status = 200, headers = {}) {
  const out = new Headers(headers);
  out.set('Content-Type', 'application/json; charset=utf-8');
  out.set('X-Content-Type-Options', 'nosniff');
  out.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(data), { status, headers: out });
}

function jsonFrom(response, payload, status) {
  const headers = new Headers(response.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.delete('Content-Length');
  headers.delete('ETag');
  return new Response(JSON.stringify(payload), { status, headers });
}

function constantTimeEqual(a, b) {
  a = String(a || '');
  b = String(b || '');
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
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
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function cleanTelegramId(value) {
  const text = String(value == null ? '' : value).trim().replace(/\.0$/, '');
  return /^\d+$/.test(text) ? text : '';
}
