import currentWorker from './entry-v1100.js';

const WRAPPER_VERSION = '1.11.0';
const ALLOWED_CHAT_STATE = 'В чате';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/health' && request.method === 'GET') {
      const base = await currentWorker.fetch(request, env, ctx);
      const headers = new Headers(base.headers);
      headers.set('Content-Type', 'application/json; charset=utf-8');
      headers.set('Cache-Control', 'no-store');
      return new Response(JSON.stringify({
        ok: true,
        service: 'royal-crm-miniapp-api',
        version: WRAPPER_VERSION,
        participantIdentity: 'telegramId-only',
        snapshotSearchKeys: 'preserved'
      }), { status: 200, headers });
    }

    if (url.pathname === '/snapshot' && request.method === 'GET') {
      return handleSnapshotWithSearchKeys(request, env, ctx);
    }

    return currentWorker.fetch(request, env, ctx);
  }
};

async function handleSnapshotWithSearchKeys(request, env, ctx) {
  const base = await currentWorker.fetch(request, env, ctx);
  if (!base.ok) return base;

  let payload;
  try { payload = await base.clone().json(); }
  catch { return base; }
  if (!payload?.ok || !payload?.snapshot) return base;

  try {
    const source = await loadPrivateSnapshot(env);
    mergeSearchKeys(payload.snapshot, source);
    const headers = new Headers(base.headers);
    headers.set('Content-Type', 'application/json; charset=utf-8');
    headers.set('Cache-Control', 'no-store');
    headers.delete('Content-Length');
    headers.delete('ETag');
    return new Response(JSON.stringify(payload), { status: base.status, headers });
  } catch (error) {
    console.warn('snapshot searchKeys merge failed', error?.message || 'unknown');
    return base;
  }
}

function mergeSearchKeys(snapshot, source) {
  const sourceParticipants = Array.isArray(source?.participants) ? source.participants : [];
  const sourceTeams = Array.isArray(source?.teams) ? source.teams : [];

  const participantsById = new Map();
  sourceParticipants.forEach(p => {
    const id = cleanTelegramId(p?.telegramId);
    if (!id || String(p?.chatState || '').trim() !== ALLOWED_CHAT_STATE) return;
    participantsById.set(id, p);
  });

  (Array.isArray(snapshot?.participants) ? snapshot.participants : []).forEach(p => {
    const raw = participantsById.get(cleanTelegramId(p?.telegramId));
    p.searchKeys = safeKeys(raw?.searchKeys);
  });

  const teamsByKey = new Map();
  const teamsByNameGame = new Map();
  sourceTeams.forEach(t => {
    const key = String(t?.key || '').trim();
    if (key) teamsByKey.set(key, t);
    const nameGame = teamNameGameKey(t?.name, t?.game || (Array.isArray(t?.games) ? t.games[0] : ''));
    if (nameGame) teamsByNameGame.set(nameGame, t);
  });

  (Array.isArray(snapshot?.teams) ? snapshot.teams : []).forEach(t => {
    const raw = teamsByKey.get(String(t?.key || '').trim()) || teamsByNameGame.get(teamNameGameKey(t?.name, t?.game || (Array.isArray(t?.games) ? t.games[0] : '')));
    t.searchKeys = safeKeys(raw?.searchKeys);
  });

  snapshot.searchIndexVersion = String(source?.searchIndexVersion || '');
  snapshot.unifiedSnapshotVersion = String(source?.unifiedSnapshotVersion || '');
}

function safeKeys(value) {
  const seen = new Set();
  const out = [];
  (Array.isArray(value) ? value : []).forEach(item => {
    const text = String(item == null ? '' : item).trim().slice(0, 180);
    if (!text || seen.has(text)) return;
    seen.add(text);
    out.push(text);
  });
  return out.slice(0, 100);
}

function teamNameGameKey(name, game) {
  const n = normalize(name);
  const g = normalize(game);
  return n ? `${n}\n${g}` : '';
}

function normalize(value) {
  let text = String(value == null ? '' : value);
  try { text = text.normalize('NFKC'); } catch {}
  return text
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanTelegramId(value) {
  const text = String(value == null ? '' : value).trim().replace(/\.0$/, '');
  return /^\d+$/.test(text) ? text : '';
}

async function loadPrivateSnapshot(env) {
  const repo = String(env.DATA_REPO || '').trim();
  const branch = String(env.DATA_BRANCH || 'main').trim();
  const path = String(env.DATA_PATH || 'snapshot.json').trim();
  if (!repo || !env.GITHUB_TOKEN) throw new Error('GitHub snapshot config missing');

  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const response = await fetch(
    `https://api.github.com/repos/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`,
    {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Royal-CRM-MiniApp-Worker'
      },
      cache: 'no-store'
    }
  );
  if (!response.ok) throw new Error(`snapshot ${response.status}`);
  const body = await response.json();
  const encoded = String(body?.content || '').replace(/\s+/g, '');
  if (!encoded) throw new Error('snapshot empty');
  return JSON.parse(new TextDecoder().decode(base64ToBytes(encoded)));
}

function base64ToBytes(encoded) {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
