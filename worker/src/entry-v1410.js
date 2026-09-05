import currentWorker from './entry-v1390.js';

const WRAPPER_VERSION = '1.41.0';
const DEFAULT_ACHIEVEMENTS_PATH = 'achievements.json';
const REGISTRY_TTL_MS = 10 * 1000;
const MAX_ACHIEVEMENT_JOURNAL_ROWS = 500;

let registryCache = null;
let registryExpiresAt = 0;
let registryPending = null;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/admin-achievements' && request.method === 'OPTIONS') {
      return achievementPreflight(request, env);
    }

    if (url.pathname === '/admin-achievements' && request.method === 'POST') {
      try {
        return await handleAchievementWrite(request, env, ctx);
      } catch (error) {
        console.error('v1410 admin-achievements failed', error?.stack || error?.message || error);
        return json({
          ok:false,
          error:String(error?.code || 'ACHIEVEMENT_WRITE_FAILED'),
          message:String(error?.publicMessage || 'Не удалось сохранить награды. Повторите попытку.')
        }, Number(error?.status || 502), achievementCorsHeaders(request, env));
      }
    }

    const base = await currentWorker.fetch(request, env, ctx);

    if (request.method === 'GET' && base.ok && (url.pathname === '/snapshot' || url.pathname === '/admin-data')) {
      try {
        return await mergeAchievementsIntoResponse(base, env, url.pathname);
      } catch (error) {
        console.warn('v1410 achievement merge skipped', url.pathname, error?.message || 'unknown');
        return base;
      }
    }

    if (url.pathname === '/health' && request.method === 'GET') {
      let data = {};
      try { data = await base.clone().json(); } catch {}
      return jsonFrom(base, {
        ...data,
        ok:true,
        service:'royal-crm-miniapp-api',
        version:WRAPPER_VERSION,
        achievements:'private-registry+public-projection',
        achievementAdminWrite:'/admin-achievements',
        achievementJournal:'private-registry+admin-journal-v2'
      }, 200);
    }

    return base;
  }
};

async function mergeAchievementsIntoResponse(base, env, pathname) {
  const payload = await base.clone().json();
  if (!payload?.ok) return base;
  const registry = await loadRegistry(env, false);
  const catalog = publicCatalog(registry);

  if (pathname === '/snapshot' && payload?.snapshot && Array.isArray(payload.snapshot.participants)) {
    payload.snapshot.participants = attachParticipantAchievements(payload.snapshot.participants, registry);
    payload.snapshot.achievementCatalog = catalog;
    payload.snapshot.achievementRegistryVersion = String(registry?.version || '1.0.0');
    return jsonFrom(base, payload, base.status);
  }

  if (pathname === '/admin-data' && payload?.adminData && Array.isArray(payload.adminData.participants)) {
    payload.adminData.participants = attachParticipantAchievements(payload.adminData.participants, registry);
    payload.adminData.achievementCatalog = catalog;
    payload.adminData.journal = mergeAchievementJournal(payload.adminData.journal, registry?.journal);
    payload.achievementCatalog = catalog;
    return jsonFrom(base, payload, base.status);
  }

  return base;
}

function attachParticipantAchievements(participants, registry) {
  const map = registry?.participants && typeof registry.participants === 'object'
    ? registry.participants
    : {};
  const allowed = new Set(publicCatalog(registry).map(item => item.code));
  return participants.map(participant => {
    const telegramId = cleanTelegramId(participant?.telegramId);
    const source = Array.isArray(map[telegramId]) ? map[telegramId] : [];
    const achievements = [...new Set(source.map(cleanCode).filter(code => code && allowed.has(code)))];
    return { ...participant, achievements };
  });
}

function mergeAchievementJournal(existingJournal, achievementRows) {
  const existing = existingJournal && typeof existingJournal === 'object'
    ? { ...existingJournal }
    : { version:'0.6.0-read', rows:[] };
  const baseRows = Array.isArray(existing.rows) ? existing.rows : [];
  const extraRows = Array.isArray(achievementRows) ? achievementRows : [];
  const seen = new Set();
  const combined = [];

  for (const row of [...extraRows, ...baseRows]) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const key = String(row.requestId || row.eventId || '').trim() || JSON.stringify(row).slice(0, 240);
    if (seen.has(key)) continue;
    seen.add(key);
    combined.push(row);
  }

  combined.sort((left, right) => journalEpoch(right) - journalEpoch(left));
  existing.version = `${String(existing.version || '0.6.0-read')}+achievements.1`;
  existing.rows = combined;
  return existing;
}

function journalEpoch(row) {
  const raw = String(row?.occurredAtIso || row?.at || '').trim();
  if (!raw) return 0;
  const direct = Date.parse(raw);
  if (Number.isFinite(direct)) return direct;
  const match = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return 0;
  return Date.UTC(
    Number(match[3]), Number(match[2]) - 1, Number(match[1]),
    Number(match[4]) - 3, Number(match[5]), Number(match[6] || 0)
  );
}

async function handleAchievementWrite(request, env) {
  const auth = await authorizeAdminViaAdminData(request, env);
  if (!auth.response.ok || !auth.payload?.ok || !auth.payload?.adminData) return auth.response;

  let body = null;
  try { body = await request.json(); }
  catch { throw appError(400, 'ACHIEVEMENT_BODY_INVALID', 'Некорректные данные наград.'); }

  const telegramId = cleanTelegramId(body?.telegramId);
  if (!telegramId) throw appError(400, 'PARTICIPANT_ID_INVALID', 'Участник не указан.');

  const requestId = normalizeRequestId(body?.requestId) || makeServerRequestId();
  const participants = Array.isArray(auth.payload.adminData.participants)
    ? auth.payload.adminData.participants
    : [];
  const targetRecord = participants.find(item => cleanTelegramId(item?.telegramId) === telegramId) || null;
  if (!targetRecord) throw appError(404, 'PARTICIPANT_NOT_FOUND', 'Участник не найден в админской базе.');

  const loaded = await loadRegistryRecord(env, true);
  const catalog = publicCatalog(loaded.registry);
  const allowed = new Set(catalog.map(item => item.code));
  if (!Array.isArray(body?.achievements)) {
    throw appError(400, 'ACHIEVEMENTS_INVALID', 'Список наград имеет неверный формат.');
  }
  const requested = [...new Set(body.achievements.map(cleanCode).filter(Boolean))].sort();
  if (requested.some(code => !allowed.has(code))) {
    throw appError(400, 'ACHIEVEMENT_UNKNOWN', 'Одна из наград пока не поддерживается.');
  }

  const actorRecord = participants.find(item => cleanTelegramId(item?.telegramId) === auth.requesterId) || null;
  const saved = await saveAchievementMutation(env, loaded, {
    telegramId,
    requested,
    requestId,
    catalog,
    actor:journalActor(actorRecord),
    target:journalTarget(targetRecord)
  });

  registryCache = saved.registry;
  registryExpiresAt = Date.now() + REGISTRY_TTL_MS;
  registryPending = null;

  return jsonFrom(auth.response, {
    ok:true,
    telegramId,
    achievements:saved.achievements,
    achievementCatalog:publicCatalog(saved.registry),
    updatedAt:String(saved.registry.updatedAt || ''),
    changed:saved.changed,
    idempotent:saved.idempotent,
    requestId,
    journalEntry:saved.journalEntry || null,
    journalRecorded:!!saved.journalEntry,
    workerVersion:WRAPPER_VERSION
  }, 200);
}

async function saveAchievementMutation(env, initialRecord, mutation) {
  let record = initialRecord;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const registry = normalizeRegistry(record.registry);
    const duplicate = registry.journal.find(row => String(row?.requestId || '') === mutation.requestId) || null;
    if (duplicate) {
      const current = currentAchievementCodes(registry, mutation.telegramId);
      return {
        registry,
        achievements:current,
        changed:false,
        idempotent:true,
        journalEntry:duplicate
      };
    }

    const before = currentAchievementCodes(registry, mutation.telegramId);
    if (sameStringSet(before, mutation.requested)) {
      return {
        registry,
        achievements:before,
        changed:false,
        idempotent:false,
        journalEntry:null
      };
    }

    const occurredAtIso = new Date().toISOString();
    const event = buildAchievementJournalEntry({
      ...mutation,
      before,
      after:mutation.requested,
      occurredAtIso
    });
    registry.participants[mutation.telegramId] = [...mutation.requested];
    registry.updatedAt = occurredAtIso;
    registry.journal = [
      event,
      ...registry.journal.filter(row => String(row?.requestId || '') !== mutation.requestId)
    ].slice(0, MAX_ACHIEVEMENT_JOURNAL_ROWS);

    const written = await writeRegistry(env, registry, record.sha);
    if (written.ok) {
      return {
        registry,
        achievements:[...mutation.requested],
        changed:true,
        idempotent:false,
        journalEntry:event
      };
    }
    if (written.status !== 409 || attempt === 2) {
      throw appError(written.status === 403 ? 500 : 502, 'ACHIEVEMENT_REGISTRY_WRITE_FAILED', 'Не удалось записать награды и журнал.');
    }
    record = await loadRegistryRecord(env, true);
  }
  throw appError(502, 'ACHIEVEMENT_REGISTRY_CONFLICT', 'Награды изменились одновременно. Повторите сохранение.');
}

function buildAchievementJournalEntry({ requestId, catalog, actor, target, before, after, occurredAtIso }) {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  const byCode = new Map(catalog.map(item => [item.code, item]));
  const added = after.filter(code => !beforeSet.has(code));
  const removed = before.filter(code => !afterSet.has(code));
  const diffs = [];

  for (const code of added) {
    const title = String(byCode.get(code)?.title || code).trim();
    diffs.push({
      kind:'added',
      field:`achievement_${code}`,
      label:`Награда «${title}»`,
      before:'Не выдана',
      after:'Выдана'
    });
  }
  for (const code of removed) {
    const title = String(byCode.get(code)?.title || code).trim();
    diffs.push({
      kind:'removed',
      field:`achievement_${code}`,
      label:`Награда «${title}»`,
      before:'Выдана',
      after:'Снята'
    });
  }

  const summaryParts = [
    ...added.map(code => `«${String(byCode.get(code)?.title || code).trim()}» выдана`),
    ...removed.map(code => `«${String(byCode.get(code)?.title || code).trim()}» снята`)
  ];
  const summary = summaryParts.length === 1
    ? `Награда ${summaryParts[0]}.`
    : `Изменены награды: ${summaryParts.join(', ')}.`;

  return {
    schemaVersion:'2',
    version:'1.41.0-achievement-journal.1',
    occurredAtIso,
    timezone:'Europe/Moscow',
    eventId:`achievement-${requestId}`,
    requestId,
    source:{ type:'miniapp', channel:'admin-achievements', label:'Mini App' },
    actor,
    target:{ entityType:'participant', label:target.label, row:target.row || 0 },
    action:{ type:'updateParticipantAchievements' },
    outcome:{ status:'committed', summary },
    diff:diffs
  };
}

function journalActor(record) {
  const username = normalizeUsername(record?.username);
  const label = username || cleanDisplay(record?.name) || cleanDisplay(record?.telegramName) || 'Администратор';
  return {
    type:'admin',
    displayName:label,
    username
  };
}

function journalTarget(record) {
  const label = cleanDisplay(record?.name) || cleanDisplay(record?.telegramName) || normalizeUsername(record?.username) || 'Участник';
  return { label, row:Number(record?.row || 0) || 0 };
}

function cleanDisplay(value) {
  const text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  if (!text || /^\d{7,}$/.test(text)) return '';
  return text.slice(0, 160);
}

function normalizeUsername(value) {
  const text = String(value == null ? '' : value).trim().replace(/^@+/, '');
  return text ? `@${text.slice(0, 64)}` : '';
}

function currentAchievementCodes(registry, telegramId) {
  const source = Array.isArray(registry?.participants?.[telegramId])
    ? registry.participants[telegramId]
    : [];
  return [...new Set(source.map(cleanCode).filter(Boolean))].sort();
}

function sameStringSet(left, right) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

async function authorizeAdminViaAdminData(request, env) {
  const requesterId = sessionTelegramId(request.headers.get('Authorization'));
  const url = new URL(request.url);
  url.pathname = '/admin-data';
  url.search = '';
  const headers = new Headers();
  const authorization = request.headers.get('Authorization');
  const origin = request.headers.get('Origin');
  if (authorization) headers.set('Authorization', authorization);
  if (origin) headers.set('Origin', origin);
  const response = await currentWorker.fetch(new Request(url.toString(), { method:'GET', headers }), env, { waitUntil(){} });
  let payload = null;
  try { payload = await response.clone().json(); } catch {}
  return { response, payload, requesterId };
}

async function loadRegistry(env, force=false) {
  if (!force && registryCache && Date.now() < registryExpiresAt) return registryCache;
  if (!force && registryPending) return registryPending;
  const task = loadRegistryRecord(env, force).then(record => record.registry);
  if (!force) registryPending = task;
  try {
    const registry = await task;
    registryCache = registry;
    registryExpiresAt = Date.now() + REGISTRY_TTL_MS;
    return registry;
  } finally {
    if (!force && registryPending === task) registryPending = null;
  }
}

async function loadRegistryRecord(env, force=false) {
  if (!force && registryCache && Date.now() < registryExpiresAt) {
    return { registry:registryCache, sha:'' };
  }
  const repo = String(env.DATA_REPO || '').trim();
  const branch = String(env.DATA_BRANCH || 'main').trim();
  const path = String(env.ACHIEVEMENTS_PATH || DEFAULT_ACHIEVEMENTS_PATH).trim();
  const token = String(env.GITHUB_TOKEN || '').trim();
  if (!repo || !token || !path) throw appError(500, 'ACHIEVEMENT_CONFIG_MISSING', 'Хранилище наград не настроено.');

  const response = await fetch(`https://api.github.com/repos/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`, {
    method:'GET',
    headers:githubHeaders(token),
    cache:'no-store'
  });
  if (response.status === 404) {
    return { registry:normalizeRegistry(null), sha:'' };
  }
  if (!response.ok) throw appError(502, 'ACHIEVEMENT_REGISTRY_FETCH_FAILED', 'Не удалось загрузить награды.');
  const body = await response.json();
  const encoded = String(body?.content || '').replace(/\s+/g, '');
  const parsed = encoded ? JSON.parse(base64ToText(encoded)) : null;
  return { registry:normalizeRegistry(parsed), sha:String(body?.sha || '') };
}

async function writeRegistry(env, registry, sha) {
  const repo = String(env.DATA_REPO || '').trim();
  const branch = String(env.DATA_BRANCH || 'main').trim();
  const path = String(env.ACHIEVEMENTS_PATH || DEFAULT_ACHIEVEMENTS_PATH).trim();
  const token = String(env.GITHUB_TOKEN || '').trim();
  const payload = {
    message:'Update participant achievements and journal',
    content:textToBase64(JSON.stringify(registry, null, 2) + '\n'),
    branch
  };
  if (sha) payload.sha = sha;
  const response = await fetch(`https://api.github.com/repos/${repo}/contents/${encodePath(path)}`, {
    method:'PUT',
    headers:{ ...githubHeaders(token), 'Content-Type':'application/json' },
    body:JSON.stringify(payload),
    cache:'no-store'
  });
  if (!response.ok) return { ok:false, status:response.status, sha:'' };
  const body = await response.json().catch(() => ({}));
  return { ok:true, status:response.status, sha:String(body?.content?.sha || '') };
}

function normalizeRegistry(value) {
  const source = value && typeof value === 'object' ? value : {};
  const catalog = source.catalog && typeof source.catalog === 'object'
    ? { ...source.catalog }
    : {};
  if (!catalog.mayak) {
    catalog.mayak = {
      code:'mayak',
      title:'МАЯК',
      description:'Участник проекта «МАЯК»',
      project:'mayak',
      active:true
    };
  }
  const participants = {};
  if (source.participants && typeof source.participants === 'object') {
    for (const [rawId, rawCodes] of Object.entries(source.participants)) {
      const id = cleanTelegramId(rawId);
      if (!id) continue;
      participants[id] = Array.isArray(rawCodes)
        ? [...new Set(rawCodes.map(cleanCode).filter(Boolean))].sort()
        : [];
    }
  }
  const journal = Array.isArray(source.journal)
    ? source.journal.filter(item => item && typeof item === 'object' && !Array.isArray(item)).slice(0, MAX_ACHIEVEMENT_JOURNAL_ROWS)
    : [];
  return {
    version:String(source.version || '1.0.0'),
    updatedAt:String(source.updatedAt || ''),
    catalog,
    participants,
    journal
  };
}

function publicCatalog(registry) {
  const source = registry?.catalog && typeof registry.catalog === 'object' ? registry.catalog : {};
  return Object.values(source)
    .filter(item => item && item.active !== false)
    .map(item => ({
      code:cleanCode(item.code),
      title:String(item.title || item.code || '').trim(),
      description:String(item.description || '').trim(),
      project:String(item.project || '').trim()
    }))
    .filter(item => item.code && item.title)
    .sort((a,b) => a.title.localeCompare(b.title, 'ru', { sensitivity:'base' }));
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

function normalizeRequestId(value) {
  const text = String(value == null ? '' : value).trim();
  return /^[A-Za-z0-9._:-]{8,120}$/.test(text) ? text : '';
}

function makeServerRequestId() {
  const random = crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Math.random().toString(36).slice(2);
  return `ach-${Date.now().toString(36)}-${random.slice(0, 20)}`;
}

function cleanTelegramId(value) {
  const text = String(value == null ? '' : value).trim().replace(/\.0$/, '');
  return /^\d{5,20}$/.test(text) ? text : '';
}

function cleanCode(value) {
  return String(value == null ? '' : value).trim().toLocaleLowerCase('en-US').replace(/[^a-z0-9_-]+/g, '');
}

function githubHeaders(token) {
  return {
    Authorization:`Bearer ${token}`,
    Accept:'application/vnd.github+json',
    'X-GitHub-Api-Version':'2022-11-28',
    'User-Agent':'Royal-CRM-MiniApp-Achievements'
  };
}

function encodePath(path) {
  return String(path || '').split('/').map(encodeURIComponent).join('/');
}

function base64ToText(encoded) {
  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function textToBase64(text) {
  const bytes = new TextEncoder().encode(String(text || ''));
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function achievementPreflight(request, env) {
  const headers = achievementCorsHeaders(request, env);
  headers.set('Access-Control-Allow-Methods','POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers','Authorization, Content-Type');
  headers.set('Access-Control-Max-Age','600');
  return new Response(null, { status:204, headers });
}

function achievementCorsHeaders(request, env) {
  const headers = new Headers();
  const requestOrigin = String(request.headers.get('Origin') || '').trim();
  const allowed = String(env.FRONTEND_ORIGIN || '').trim();
  if (requestOrigin && (!allowed || requestOrigin === allowed)) headers.set('Access-Control-Allow-Origin', requestOrigin);
  else if (allowed) headers.set('Access-Control-Allow-Origin', allowed);
  headers.set('Vary','Origin');
  headers.set('Cache-Control','no-store');
  return headers;
}

function appError(status, code, publicMessage) {
  const error = new Error(code);
  error.status = status;
  error.code = code;
  error.publicMessage = publicMessage;
  return error;
}

function json(payload, status=200, headers=new Headers()) {
  const out = new Headers(headers);
  out.set('Content-Type','application/json; charset=utf-8');
  out.set('Cache-Control','no-store');
  return new Response(JSON.stringify(payload), { status, headers:out });
}

function jsonFrom(response, payload, status) {
  const headers = new Headers(response.headers);
  headers.set('Content-Type','application/json; charset=utf-8');
  headers.set('Cache-Control','no-store');
  headers.delete('Content-Length');
  headers.delete('ETag');
  return new Response(JSON.stringify(payload), { status, headers });
}
