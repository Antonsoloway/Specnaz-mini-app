import currentWorker from './entry-v130.js';

const WRAPPER_VERSION = '1.4.0';

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
        mediaCache: 'private-github-raw'
      }), { status: 200, headers });
    }

    if (url.pathname === '/auth' && request.method === 'POST') {
      return handleAuthWithProfile(request, env, ctx);
    }

    return currentWorker.fetch(request, env, ctx);
  }
};

async function handleAuthWithProfile(request, env, ctx) {
  const copy = request.clone();
  const response = await currentWorker.fetch(request, env, ctx);
  if (!response.ok) return response;

  let payload;
  try {
    payload = await response.clone().json();
  } catch {
    return response;
  }
  if (!payload?.ok || !payload?.access) return response;

  try {
    const body = await copy.json();
    const telegramId = telegramIdFromInitData(body?.initData || '');
    if (!telegramId) return response;

    const snapshot = await loadPrivateSnapshot(env);
    const profile = (snapshot.participants || []).find(
      p => String(p?.telegramId || '') === telegramId
    );
    if (!profile) return response;

    const hasTrips = profile.specnazTrips !== undefined && profile.specnazTrips !== null;
    const trips = hasTrips ? Number(profile.specnazTrips || 0) : null;
    payload.profileStats = {
      avatarFileId: String(profile.avatarFileId || ''),
      specnazTrips: trips,
      specnazRank: String(profile.specnazRank || (trips !== null ? rankFromTrips(trips) : '')),
      statsVersion: String(snapshot.profileStatsVersion || '')
    };

    const headers = new Headers(response.headers);
    headers.set('Content-Type', 'application/json; charset=utf-8');
    headers.set('Cache-Control', 'no-store');
    headers.delete('Content-Length');
    return new Response(JSON.stringify(payload), { status: response.status, headers });
  } catch (error) {
    console.warn('profile auth enrichment failed', error?.message || 'unknown');
    return response;
  }
}

function telegramIdFromInitData(initData) {
  try {
    const params = new URLSearchParams(String(initData || ''));
    const user = JSON.parse(params.get('user') || '{}');
    return user?.id ? String(user.id) : '';
  } catch {
    return '';
  }
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
