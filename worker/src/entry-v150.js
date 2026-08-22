import currentWorker from './entry-v140.js';
import { loadPrivateSnapshotCached } from './private-snapshot-cache.js';

const WRAPPER_VERSION = '1.5.1';
const ALLOWED_CHAT_STATE = 'В чате';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/health' && request.method === 'GET') {
      const base = await currentWorker.fetch(request, env, ctx);
      const headers = new Headers(base.headers);
      headers.set('Content-Type', 'application/json; charset=utf-8');
      return new Response(JSON.stringify({
        ok: true,
        service: 'royal-crm-miniapp-api',
        version: WRAPPER_VERSION,
        teamIdentity: 'name+game',
        profileStats: 'snapshot',
        specnazHistory: 'private-snapshot-rich-links',
        mediaCache: 'private-github-raw'
      }), { status: 200, headers });
    }

    if (url.pathname === '/snapshot' && request.method === 'GET') {
      return handleSnapshotWithSpecnaz(request, env, ctx);
    }

    return currentWorker.fetch(request, env, ctx);
  }
};

async function handleSnapshotWithSpecnaz(request, env, ctx) {
  const response = await currentWorker.fetch(request, env, ctx);
  if (!response.ok) return response;

  let payload;
  try {
    payload = await response.clone().json();
  } catch {
    return response;
  }
  if (!payload?.ok || !payload?.snapshot) return response;

  try {
    const source = await loadPrivateSnapshotCached(env);
    payload.snapshot = sanitizeSnapshotForApp(source, payload.snapshot);

    const headers = new Headers(response.headers);
    headers.set('Content-Type', 'application/json; charset=utf-8');
    headers.set('Cache-Control', 'private, max-age=30');
    headers.delete('Content-Length');
    headers.delete('ETag');
    return new Response(JSON.stringify(payload), { status: response.status, headers });
  } catch (error) {
    console.warn('specnaz snapshot enrichment failed', error?.message || 'unknown');
    return response;
  }
}

function sanitizeSnapshotForApp(source, fallback) {
  const participants = (source?.participants || [])
    .filter(p => String(p?.chatState || '').trim() === ALLOWED_CHAT_STATE)
    .map(p => ({
      name: String(p?.name || ''),
      telegramName: String(p?.telegramName || ''),
      username: String(p?.username || ''),
      avatarFileId: String(p?.avatarFileId || ''),
      chatState: ALLOWED_CHAT_STATE,
      specnazTrips: Number(p?.specnazTrips || 0),
      specnazRank: String(p?.specnazRank || rankFromTrips(p?.specnazTrips || 0)),
      memberships: (Array.isArray(p?.memberships) ? p.memberships : []).map(m => ({
        slot: Number(m?.slot || 0),
        team: String(m?.team || ''),
        teamRaw: String(m?.teamRaw || ''),
        teamKey: String(m?.teamKey || ''),
        nickname: String(m?.nickname || ''),
        role: String(m?.role || ''),
        game: String(m?.game || '')
      }))
    }));

  const teams = (source?.teams || []).map(t => ({
    key: String(t?.key || ''),
    name: String(t?.name || ''),
    game: String(t?.game || ''),
    games: Array.isArray(t?.games) ? t.games.map(String) : [],
    photoUrl: String(t?.photoUrl || ''),
    memberCount: Number(t?.memberCount || 0),
    leaderCount: Number(t?.leaderCount || 0),
    assistantCount: Number(t?.assistantCount || 0),
    playerCount: Number(t?.playerCount || 0)
  }));

  return {
    schemaVersion: String(source?.schemaVersion || fallback?.schemaVersion || ''),
    generatedAt: String(source?.generatedAt || fallback?.generatedAt || ''),
    dataHash: String(source?.dataHash || fallback?.dataHash || ''),
    stats: source?.stats || fallback?.stats || {},
    profileStatsVersion: String(source?.profileStatsVersion || ''),
    specnazHistoryVersion: String(source?.specnazHistoryVersion || source?.specnazHistory?.version || ''),
    participants,
    teams,
    specnazHistory: sanitizeHistory(source?.specnazHistory)
  };
}

function sanitizeHistory(history) {
  const sections = Array.isArray(history?.sections) ? history.sections : [];
  return {
    version: String(history?.version || ''),
    updatedAt: String(history?.updatedAt || ''),
    sections: sections.map(section => ({
      title: String(section?.title || ''),
      rows: (Array.isArray(section?.rows) ? section.rows : []).map(row => {
        const clean = {
          date: String(row?.date || ''),
          name: String(row?.name || ''),
          team: String(row?.team || ''),
          before: String(row?.before || ''),
          after: String(row?.after || ''),
          added: String(row?.added || ''),
          rank: String(row?.rank || ''),
          message: String(row?.message || '')
        };
        const rich = sanitizeMessageRich(row?.messageRich);
        if (rich.length) clean.messageRich = rich;
        return clean;
      })
    }))
  };
}

function sanitizeMessageRich(value) {
  if (!Array.isArray(value)) return [];
  return value.map(segment => {
    const text = String(segment?.text || '');
    const url = safeHistoryUrl(segment?.url);
    const clean = { text };
    if (url) clean.url = url;
    return clean;
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
