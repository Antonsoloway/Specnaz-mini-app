const DEFAULT_COMPETITION_INDEX_URL = 'https://specnaz-ai-telegram-gateway.soloway3852.workers.dev/api/internal/competition-index';
const INDEX_CACHE_TTL_MS = 5 * 60 * 1000;
const FORCE_REFRESH_COOLDOWN_MS = 5 * 60 * 1000;
const MAX_INDEX_BYTES = 20 * 1024 * 1024;

const indexCaches = { standard:null, owner:null };
const indexCacheAts = { standard:0, owner:0 };
const indexPending = { standard:null, owner:null };
const lastForceRefreshAt = { standard:0, owner:0 };

export function resetBattleBaseIndexCacheV1() {
  for (const scope of ['standard','owner']) {
    indexCaches[scope] = null;
    indexCacheAts[scope] = 0;
    indexPending[scope] = null;
    lastForceRefreshAt[scope] = 0;
  }
}

const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const normalizeText = value => String(value ?? '').normalize('NFKC')
  .toLocaleLowerCase('ru-RU').replace(/ё/g, 'е')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/gu, ' ').trim();
const compactText = value => normalizeText(value).replace(/\s+/gu, '');
const apiError = (status, code, publicMessage) => Object.assign(new Error(code), {status, code, publicMessage});

function dateBoundary(value, end = false) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw apiError(400, 'BATTLE_BASE_DATE_INVALID', 'Проверьте даты фильтра.');
  }
  const timestamp = Date.parse(value + 'T00:00:00Z');
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) {
    throw apiError(400, 'BATTLE_BASE_DATE_INVALID', 'Проверьте даты фильтра.');
  }
  return Math.floor(timestamp / 1000) + (end ? 86399 : 0);
}
function boundedInteger(value, fallback, min, max, code) {
  if (value == null || value === '') return fallback;
  if (!/^\d+$/.test(String(value))) throw apiError(400, code, 'Параметры поиска имеют неверный формат.');
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) throw apiError(400, code, 'Параметры поиска имеют неверный формат.');
  return number;
}
export function validateBattleBaseQuery(url) {
  const params = url instanceof URL ? url.searchParams : new URLSearchParams(url || '');
  const q = String(params.get('q') || '').trim();
  if (q.length > 160) throw apiError(400, 'BATTLE_BASE_QUERY_TOO_LONG', 'Слишком длинный поисковый запрос.');
  const game = String(params.get('game') || '');
  const eventType = String(params.get('eventType') || '');
  const stage = String(params.get('stage') || '');
  const status = String(params.get('status') || 'parsed');
  const requestedClass = String(params.get('resultClass') || 'all');
  if (game && !['RM', 'RK'].includes(game)) throw apiError(400, 'BATTLE_BASE_GAME_INVALID', 'Неизвестная игра.');
  if (eventType && !['battle', 'tournament'].includes(eventType)) throw apiError(400, 'BATTLE_BASE_EVENT_INVALID', 'Неизвестный тип события.');
  if (stage && !['final', 'intermediate'].includes(stage)) throw apiError(400, 'BATTLE_BASE_STAGE_INVALID', 'Неизвестный этап.');
  if (!['parsed', 'review', 'all'].includes(status)) throw apiError(400, 'BATTLE_BASE_STATUS_INVALID', 'Неизвестный статус распознавания.');
  if (!['all', 'standard'].includes(requestedClass)) throw apiError(400, 'BATTLE_BASE_CLASS_INVALID', 'Неизвестный тип архива.');
  const from = dateBoundary(params.get('from'));
  const to = dateBoundary(params.get('to'), true);
  if (from !== null && to !== null && from > to) throw apiError(400, 'BATTLE_BASE_DATE_RANGE_INVALID', 'Начальная дата позже конечной.');
  const scoreMin = boundedInteger(params.get('scoreMin'), null, 0, 1000000000, 'BATTLE_BASE_SCORE_INVALID');
  const limit = boundedInteger(params.get('limit'), 20, 1, 50, 'BATTLE_BASE_LIMIT_INVALID');
  const offset = boundedInteger(params.get('offset'), 0, 0, 5000, 'BATTLE_BASE_OFFSET_INVALID');
  return {
    q, game, eventType, stage, status,
    resultClass: requestedClass,
    from, to, scoreMin, limit, offset,
    refresh: params.get('refresh') === '1'
  };
}
function searchHaystack(result) {
  const teams = Array.isArray(result?.visibleTeams) ? result.visibleTeams : [];
  const sources = Array.isArray(result?.sources) ? result.sources : [];
  const values = [];
  for (const team of teams) {
    values.push(team?.name || '');
    if (Array.isArray(team?.searchKeys)) values.push(...team.searchKeys);
  }
  for (const source of sources) values.push(source?.author || '', source?.username || '', source?.caption || '', source?.topic || '');
  return values.join(' ');
}
function matchesQuery(result, query) {
  if (!query) return true;
  const haystack = searchHaystack(result);
  const normalizedQuery = normalizeText(query);
  const compactQuery = compactText(query);
  const normalizedHaystack = normalizeText(haystack);
  if (compactQuery && compactText(haystack).includes(compactQuery)) return true;
  const words = normalizedQuery.split(' ').filter(Boolean);
  return words.length > 0 && words.every(word => normalizedHaystack.includes(word));
}
export function filterBattleBaseResults(index, query) {
  const source = Array.isArray(index?.results) ? index.results : [];
  const filtered = source.filter(result => {
    if (!object(result)) return false;
    if (result.resultClass === 'epic') return false;
    if (query.resultClass !== 'all' && result.resultClass !== query.resultClass) return false;
    if (query.status !== 'all' && result.status !== query.status) return false;
    if (query.game && result.game !== query.game) return false;
    if (query.eventType && result.eventType !== query.eventType) return false;
    if (query.stage && result.stage !== query.stage) return false;
    if (query.from !== null || query.to !== null) {
      const publications = Array.isArray(result.publicationUnixValues)
        ? result.publicationUnixValues.map(Number).filter(value => Number.isFinite(value) && value > 0)
        : [Number(result.firstPublicationUnix)].filter(value => Number.isFinite(value) && value > 0);
      const matchesPublication = publications.some(publication =>
        (query.from === null || publication >= query.from) && (query.to === null || publication <= query.to));
      if (!matchesPublication) return false;
    }
    if (query.scoreMin !== null) {
      const score = Number(result.communityTeam?.score);
      if (!Number.isFinite(score) || score < query.scoreMin) return false;
    }
    if (!matchesQuery(result, query.q)) return false;
    return true;
  });
  filtered.sort((left, right) => {
    const a = Number(left.firstPublicationUnix) || 0;
    const b = Number(right.firstPublicationUnix) || 0;
    return b - a || String(right.resultId || '').localeCompare(String(left.resultId || ''));
  });
  return filtered;
}
async function fetchCompetitionIndex(env, force = false, fetchSource = fetch, authorization = '') {
  const sessionAuthorization = String(authorization || '').trim();
  if (!/^Bearer\s+\S{20,}$/i.test(sessionAuthorization)) throw apiError(401, 'SESSION_MISSING', 'Требуется авторизация Telegram.');
  const source = String(env?.COMPETITION_INDEX_URL || DEFAULT_COMPETITION_INDEX_URL).trim();
  let url;
  try { url = new URL(source); }
  catch (_) { throw apiError(503, 'BATTLE_BASE_SOURCE_INVALID', 'Источник базы битв не настроен.'); }
  if (url.protocol !== 'https:') throw apiError(503, 'BATTLE_BASE_SOURCE_INVALID', 'Источник базы битв не настроен.');
  if (force) url.searchParams.set('refresh', '1');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetchSource(url.toString(), {
      method: 'GET',
      headers: { Authorization: sessionAuthorization, Accept: 'application/json' },
      cache: 'no-store',
      redirect: 'manual',
      signal: controller.signal
    });
    if (!response.ok) throw apiError(502, 'BATTLE_BASE_SOURCE_UNAVAILABLE', 'База битв временно недоступна.');
    const text = await response.text();
    if (!text || text.length > MAX_INDEX_BYTES) throw apiError(502, 'BATTLE_BASE_SOURCE_SIZE_INVALID', 'Не удалось загрузить индекс базы битв.');
    let payload;
    try { payload = JSON.parse(text); }
    catch (_) { throw apiError(502, 'BATTLE_BASE_SOURCE_INVALID_JSON', 'Источник базы битв вернул неверные данные.'); }
    if (payload?.ok !== true || payload?.version !== 'competition-index-api-v1' || !Array.isArray(payload.results) || payload.results.length > 5000) {
      throw apiError(502, 'BATTLE_BASE_SOURCE_CONTRACT_INVALID', 'Формат базы битв не распознан.');
    }
    return payload;
  } catch (error) {
    if (error?.status) throw error;
    throw apiError(502, 'BATTLE_BASE_SOURCE_FAILED', error?.name === 'AbortError'
      ? 'Источник базы битв не ответил вовремя.'
      : 'Не удалось связаться с базой битв.');
  } finally {
    clearTimeout(timer);
  }
}
async function loadCompetitionIndex(env, force = false, fetchSource = fetch, authorization = '', owner = false) {
  const scope = owner ? 'owner' : 'standard';
  const now = Date.now();
  if (indexCaches[scope] && now - indexCacheAts[scope] < INDEX_CACHE_TTL_MS && !force) {
    return { index:indexCaches[scope], ageMs:now-indexCacheAts[scope], memoryCache:true };
  }
  if (force && indexCaches[scope] && now - lastForceRefreshAt[scope] < FORCE_REFRESH_COOLDOWN_MS) {
    return { index:indexCaches[scope], ageMs:now-indexCacheAts[scope], memoryCache:true, refreshCooldown:true };
  }
  if (indexPending[scope]) return indexPending[scope];
  if (force) lastForceRefreshAt[scope] = now;
  const task = (async () => {
    const index = await fetchCompetitionIndex(env, force, fetchSource, authorization);
    indexCaches[scope] = index;
    indexCacheAts[scope] = Date.now();
    return { index, ageMs:0, memoryCache:false };
  })();
  indexPending[scope] = task;
  try { return await task; }
  finally { if (indexPending[scope] === task) indexPending[scope] = null; }
}
function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type',
    'Access-Control-Max-Age': '600',
    'Vary': 'Origin',
    'Cache-Control': 'private, no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff'
  };
}
function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers });
}
export function createAdminBattleBaseApi({ authorizeAdmin, fetchSource = fetch } = {}) {
  return async function handleAdminBattleBase(request, env) {
    const origin = String(env?.FRONTEND_ORIGIN || 'https://antonsoloway.github.io').replace(/\/$/, '');
    const requestOrigin = request.headers.get('Origin');
    const headers = corsHeaders(origin);
    if (requestOrigin && requestOrigin !== origin) return json({ ok: false, error: 'ORIGIN_DENIED' }, 403, headers);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'GET') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, headers);
    try {
      if (typeof authorizeAdmin !== 'function') throw apiError(500, 'ADMIN_AUTH_NOT_CONFIGURED', 'Проверка прав администратора не настроена.');
      const admin = await authorizeAdmin(request, env);
      const query = validateBattleBaseQuery(new URL(request.url));
      const loaded = await loadCompetitionIndex(env, query.refresh, fetchSource, request.headers.get('Authorization') || '', false);
      const all = filterBattleBaseResults(loaded.index, query);
      const results = all.slice(query.offset, query.offset + query.limit);
      const counts = loaded.index.counts || {};
      return json({
        ok: true,
        results,
        pagination: {
          total: all.length,
          offset: query.offset,
          limit: query.limit,
          hasMore: query.offset + results.length < all.length
        },
        counts,
        indexGeneratedAt: loaded.index.generatedAt || null,
        indexStale: loaded.index.stale === true,
        indexAgeSeconds: Math.max(0, Math.floor((Date.now() - Date.parse(loaded.index.generatedAt || '')) / 1000)) || 0,
        memoryCache: loaded.memoryCache === true,
        refreshCooldown: loaded.refreshCooldown === true,
        capabilities: { ownerEpicArchive: false }
      }, 200, headers);
    } catch (error) {
      const status = Number(error?.status || 502);
      return json({
        ok: false,
        error: String(error?.code || 'BATTLE_BASE_FAILED'),
        message: String(error?.publicMessage || 'База битв временно недоступна.')
      }, status, headers);
    }
  };
}
