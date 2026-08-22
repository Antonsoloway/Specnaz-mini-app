import currentWorker from './entry-v1100.js';
import { loadPrivateSnapshotCached } from './private-snapshot-cache.js';

const WRAPPER_VERSION = '1.11.2';
const ALLOWED_CHAT_STATE = 'В чате';
const CONFIRMED_ALIASES = new Map([
  ['hepbbi b hopme', ['нервы в норме']],
  ['hepbbl b hopme', ['нервы в норме']],
  ['mbl pycckue', ['мы русские']],
  ['ckazka', ['сказка']],
  ['behom', ['веном']],
  ['molot poka', ['молот рока']],
  ['xaoc', ['хаос']],
  ['topmo3ob het', ['тормозов нет']]
]);
const LAT_FALLBACK = {a:'а',b:'б',c:'к',d:'д',e:'е',f:'ф',g:'г',h:'х',i:'и',j:'дж',k:'к',l:'л',m:'м',n:'н',o:'о',p:'п',q:'к',r:'р',s:'с',t:'т',u:'у',v:'в',w:'в',x:'кс',y:'й',z:'з'};
const PSEUDO_VISUAL = {a:'а',b:'в',c:'с',e:'е',h:'н',k:'к',m:'м',o:'о',p:'р',t:'т',x:'х',y:'у',u:'и',i:'и','0':'о','3':'з','4':'ч','6':'б','9':'я'};

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
        snapshotSearchKeys: 'preserved+deterministic-pseudo',
        teamStatus: 'preserved'
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
    const source = await loadPrivateSnapshotCached(env);
    mergeSearchKeys(payload.snapshot, source);
    const headers = new Headers(base.headers);
    headers.set('Content-Type', 'application/json; charset=utf-8');
    headers.set('Cache-Control', 'no-store');
    headers.delete('Content-Length');
    headers.delete('ETag');
    return new Response(JSON.stringify(payload), { status: base.status, headers });
  } catch (error) {
    console.warn('snapshot searchKeys/status merge failed', error?.message || 'unknown');
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
    const values = [p?.name, p?.telegramName, p?.username];
    (Array.isArray(p?.memberships) ? p.memberships : []).forEach(m => values.push(m?.team, m?.teamRaw, m?.nickname, m?.role, m?.game));
    p.searchKeys = augmentKeys(safeKeys(raw?.searchKeys), values);
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
    t.searchKeys = augmentKeys(safeKeys(raw?.searchKeys), [t?.name, t?.game, ...(Array.isArray(t?.games) ? t.games : [])]);
    t.status = String(raw?.status || '').trim();
  });

  snapshot.searchIndexVersion = String(source?.searchIndexVersion || '');
  snapshot.unifiedSnapshotVersion = String(source?.unifiedSnapshotVersion || '');
}

function augmentKeys(existing, values) {
  const seen = new Set((Array.isArray(existing) ? existing : []).map(item => normalize(item)).filter(Boolean));
  const out = Array.isArray(existing) ? existing.slice() : [];
  const add = value => {
    const n = normalize(value);
    if (!n || seen.has(n) || out.length >= 100) return;
    seen.add(n);
    out.push(n.slice(0,180));
    const compact = n.replace(/\s+/g,'');
    if (compact && !seen.has(compact) && out.length < 100) { seen.add(compact); out.push(compact.slice(0,180)); }
  };

  (Array.isArray(values) ? values : []).forEach(value => {
    const n = normalize(value);
    if (!n) return;
    add(n);
    const pseudo = pseudoRead(n);
    if (pseudo && pseudo !== n) add(pseudo);
    const aliases = CONFIRMED_ALIASES.get(n) || [];
    aliases.forEach(add);
  });
  return out.slice(0,100);
}

function pseudoRead(value) {
  const base = normalize(value);
  if (!base || !/[a-z]/.test(base)) return '';
  return normalize(base.split(' ').map(token => /[a-z]/.test(token) ? pseudoToken(token) : token).join(' '));
}

function pseudoToken(value) {
  let raw = normalize(value).replace(/\s+/g,'');
  if (!raw || !/[a-z0-9]/.test(raw) || /[а-я]/u.test(raw)) return raw;
  raw = raw.replace(/bi/g,'ы').replace(/bl/g,'ы');
  let out = '';
  for (const ch of Array.from(raw)) {
    if (/[а-я]/u.test(ch)) { out += ch; continue; }
    if (Object.prototype.hasOwnProperty.call(PSEUDO_VISUAL,ch)) { out += PSEUDO_VISUAL[ch]; continue; }
    out += LAT_FALLBACK[ch] ?? ch;
  }
  return normalize(out);
}

function safeKeys(value) {
  const seen = new Set();
  const out = [];
  (Array.isArray(value) ? value : []).forEach(item => {
    const text = String(item == null ? '' : item).trim().slice(0, 180);
    const n = normalize(text);
    if (!text || !n || seen.has(n)) return;
    seen.add(n);
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
