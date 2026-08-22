const CACHE_TTL_MS = 60_000;

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

// Every compatibility wrapper runs in the same Worker isolate. Sharing one
// short-lived promise prevents /auth and /snapshot from downloading and
// decoding the same private CRM file several times in sequence.
export async function loadPrivateSnapshotCached(env) {
  const settings = config(env);
  if (cacheKey !== settings.key) {
    cacheKey = settings.key;
    cachedSnapshot = null;
    cachedAt = 0;
    inFlight = null;
  }

  const now = Date.now();
  if (cachedSnapshot && now - cachedAt < CACHE_TTL_MS) return cachedSnapshot;
  if (inFlight) return inFlight;

  const encodedPath = settings.path.split('/').map(encodeURIComponent).join('/');
  const url = `https://api.github.com/repos/${settings.repo}/contents/${encodedPath}?ref=${encodeURIComponent(settings.branch)}`;
  const request = (async () => {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${settings.token}`,
        Accept: 'application/vnd.github.raw+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Royal-CRM-MiniApp-Worker'
      },
      cache: 'no-store'
    });
    if (!response.ok) throw new Error(`snapshot ${response.status}`);

    const text = await response.text();
    if (!text.trim()) throw new Error('snapshot empty');
    const snapshot = JSON.parse(text);
    if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.participants)) {
      throw new Error('snapshot invalid');
    }
    if (cacheKey === settings.key) {
      cachedSnapshot = snapshot;
      cachedAt = Date.now();
    }
    return snapshot;
  })();

  inFlight = request;
  try {
    return await request;
  } finally {
    if (inFlight === request) inFlight = null;
  }
}
