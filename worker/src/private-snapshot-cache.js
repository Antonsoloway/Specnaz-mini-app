const MEMORY_FRESH_TTL_MS = 60_000;
const STALE_FALLBACK_MAX_AGE_MS = 10 * 60_000;
const GITHUB_ATTEMPT_TIMEOUT_MS = 1_800;
const GITHUB_RETRY_DELAY_MS = 220;
const EDGE_CACHE_ORIGIN = 'https://royal-crm-miniapp-api.tropical-spoon.workers.dev';

let cacheKey = '';
let cachedSnapshot = null;
let cachedAt = 0;
let inFlight = null;

function config(env) {
  const repo = String(env.DATA_REPO || '').trim();
  const branch = String(env.DATA_BRANCH || 'main').trim();
  const path = String(env.DATA_PATH || 'snapshot.json').trim();
  const token = String(env.GITHUB_TOKEN || '').trim();
  if (!repo || !token) throw new Error('GitHub snapshot config missing');
  return { repo, branch, path, token, key: `${repo}\n${branch}\n${path}` };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cacheRequest(settings) {
  const encoded = [settings.repo, settings.branch, settings.path]
    .map(value => encodeURIComponent(String(value || '')))
    .join('/');
  return new Request(`${EDGE_CACHE_ORIGIN}/__internal_snapshot_cache__/${encoded}`, { method: 'GET' });
}

function validateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.participants)) {
    throw new Error('snapshot invalid');
  }
  return snapshot;
}

async function readEdgeCache(settings) {
  try {
    if (typeof caches === 'undefined' || !caches?.default) return null;
    const response = await caches.default.match(cacheRequest(settings));
    if (!response) return null;
    const storedAt = Number(response.headers.get('X-Royal-Snapshot-Stored-At') || 0);
    if (!Number.isFinite(storedAt) || storedAt <= 0) return null;
    const snapshot = validateSnapshot(await response.json());
    return { snapshot, storedAt, age: Math.max(0, Date.now() - storedAt) };
  } catch (error) {
    console.warn('snapshot edge cache read failed', error?.message || 'unknown');
    return null;
  }
}

async function writeEdgeCache(settings, snapshot, storedAt) {
  try {
    if (typeof caches === 'undefined' || !caches?.default) return;
    const headers = new Headers({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${Math.ceil(STALE_FALLBACK_MAX_AGE_MS / 1000)}`,
      'X-Royal-Snapshot-Stored-At': String(storedAt)
    });
    await caches.default.put(
      cacheRequest(settings),
      new Response(JSON.stringify(snapshot), { status: 200, headers })
    );
  } catch (error) {
    console.warn('snapshot edge cache write failed', error?.message || 'unknown');
  }
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...(options || {}), signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSnapshotFromGitHub(settings) {
  const encodedPath = settings.path.split('/').map(encodeURIComponent).join('/');
  const url = `https://api.github.com/repos/${settings.repo}/contents/${encodedPath}?ref=${encodeURIComponent(settings.branch)}`;
  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${settings.token}`,
          Accept: 'application/vnd.github.raw+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'Royal-CRM-MiniApp-Worker'
        },
        cache: 'no-store'
      }, GITHUB_ATTEMPT_TIMEOUT_MS);

      if (!response.ok) {
        const error = new Error(`snapshot ${response.status}`);
        error.status = response.status;
        throw error;
      }

      const text = await response.text();
      if (!text.trim()) throw new Error('snapshot empty');
      return validateSnapshot(JSON.parse(text));
    } catch (error) {
      lastError = error;
      if (attempt === 0) await sleep(GITHUB_RETRY_DELAY_MS);
    }
  }

  throw lastError || new Error('snapshot fetch failed');
}

// Every compatibility wrapper runs in the same Worker isolate. Memory is the
// fastest layer; Cloudflare Cache API bridges cold/new isolates; GitHub remains
// the source of truth. A bounded stale copy is used only when GitHub is
// temporarily unreachable, so transient dependency failures do not strand the
// Mini App on its degraded startup screen.
export async function loadPrivateSnapshotCached(env) {
  const settings = config(env);
  if (cacheKey !== settings.key) {
    cacheKey = settings.key;
    cachedSnapshot = null;
    cachedAt = 0;
    inFlight = null;
  }

  const now = Date.now();
  if (cachedSnapshot && now - cachedAt < MEMORY_FRESH_TTL_MS) return cachedSnapshot;
  if (inFlight) return inFlight;

  const request = (async () => {
    let edge = await readEdgeCache(settings);
    if (edge && edge.age < MEMORY_FRESH_TTL_MS) {
      cachedSnapshot = edge.snapshot;
      cachedAt = edge.storedAt;
      return edge.snapshot;
    }

    try {
      const snapshot = await fetchSnapshotFromGitHub(settings);
      const storedAt = Date.now();
      if (cacheKey === settings.key) {
        cachedSnapshot = snapshot;
        cachedAt = storedAt;
      }
      await writeEdgeCache(settings, snapshot, storedAt);
      return snapshot;
    } catch (error) {
      const memoryAge = cachedSnapshot ? Date.now() - cachedAt : Infinity;
      if (cachedSnapshot && memoryAge <= STALE_FALLBACK_MAX_AGE_MS) {
        console.warn('snapshot GitHub unavailable; serving bounded stale memory copy', error?.message || 'unknown');
        return cachedSnapshot;
      }

      if (!edge) edge = await readEdgeCache(settings);
      if (edge && edge.age <= STALE_FALLBACK_MAX_AGE_MS) {
        cachedSnapshot = edge.snapshot;
        cachedAt = edge.storedAt;
        console.warn('snapshot GitHub unavailable; serving bounded stale edge copy', error?.message || 'unknown');
        return edge.snapshot;
      }

      throw error;
    }
  })();

  inFlight = request;
  try {
    return await request;
  } finally {
    if (inFlight === request) inFlight = null;
  }
}
