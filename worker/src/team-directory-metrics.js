// Read only the numeric CRM aggregates needed by the ordinary team directory.
// Never return private participants, editor fields, journal, or game events.
const number = value => {
  const n = Number(String(value ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const clean = value => String(value ?? '').trim().toLocaleLowerCase('ru-RU');
const game = value => {
  const v = clean(value);
  return v === 'рм' || v === 'rm' ? 'royal match' : v === 'рк' || v === 'rk' ? 'royal kingdom' : v;
};
export const directoryTeamKey = (name, value) => JSON.stringify([clean(name), game(value)]);

export function projectDirectoryMetrics(source) {
  const data = source?.adminData;
  if (!Array.isArray(data?.teams) || !Array.isArray(data?.participants)) throw Error('directory source invalid');
  const members = new Map(), seen = new Set();
  for (const p of data.participants) {
    const id = String(p?.telegramId ?? '').trim().replace(/\.0$/, '');
    if (!id || seen.has(id) || number(p?.specnaz) <= 0) continue;
    seen.add(id);
    const keys = new Set((p.memberships || []).filter(m => clean(m?.team) && game(m?.game))
      .map(m => directoryTeamKey(m.team, m.game)));
    for (const key of keys) members.set(key, (members.get(key) || 0) + 1);
  }
  const result = new Map();
  for (const t of data.teams) {
    const key = directoryTeamKey(t?.name, t?.game);
    // Ambiguous duplicate CRM identities cannot lend a metric to another row.
    if (result.has(key)) { result.set(key, null); continue; }
    result.set(key, { specnazTrips: number(t?.specnazTrips), specnazMemberCount: members.get(key) || 0,
      activityBase: number(t?.activityBase), activityOutside: number(t?.activityOutside) });
  }
  return result;
}

export function createDirectoryMetricsLoader(fetcher = fetch, now = Date.now) {
  let cachedKey = '', cached = null, at = 0, pending = null;
  return async function load(env) {
    const repo = String(env.DATA_REPO || '').trim(), branch = String(env.DATA_BRANCH || 'main').trim();
    const path = String(env.ADMIN_DATA_PATH || 'admin-snapshot.json').trim(), token = String(env.GITHUB_TOKEN || '').trim();
    if (!repo || !token || !path) throw Error('directory config missing');
    const key = JSON.stringify([repo, branch, path, token]);
    if (cachedKey !== key) { cachedKey = key; cached = null; at = 0; pending = null; }
    if (cached && now() - at < 60_000) return cached;
    if (pending) return pending;
    const request = (async () => {
      const controller = new AbortController(); let timer;
      try {
        const timeout = new Promise((_, reject) => { timer = setTimeout(() => {
          controller.abort(); reject(Error('directory timeout'));
        }, 2200); });
        const read = async () => {
          const encoded = path.split('/').map(encodeURIComponent).join('/');
          const response = await fetcher(`https://api.github.com/repos/${repo}/contents/${encoded}?ref=${encodeURIComponent(branch)}`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.raw+json',
              'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Royal-CRM-Directory' }, signal: controller.signal });
          if (!response.ok) throw Error('directory upstream ' + response.status);
          return projectDirectoryMetrics(await response.json());
        };
        const metrics = await Promise.race([read(), timeout]);
        if (cachedKey === key) { cached = metrics; at = now(); }
        return metrics;
      } catch (error) {
        if (cachedKey === key && cached && now() - at <= 600_000) return cached;
        throw error;
      } finally { clearTimeout(timer); }
    })();
    pending = request;
    try { return await request; } finally { if (pending === request) pending = null; }
  };
}

export function applyDirectoryMetrics(snapshot, metrics) {
  const rosters = new Map();
  for (const [index, p] of (snapshot.participants || []).entries()) {
    if (p?.chatState && p.chatState !== 'В чате') continue;
    const id = String(p?.telegramId || `row:${p?.row || index}`);
    for (const m of p.memberships || []) {
      if (!clean(m?.team) || !game(m?.game)) continue;
      const key = directoryTeamKey(m.team, m.game);
      const roster = rosters.get(key) || { members:new Set(), leaders:new Set(), assistants:new Set(), players:new Set() };
      roster.members.add(id);
      if (m.role === 'Лидер') roster.leaders.add(id);
      else if (m.role === 'Помощник') roster.assistants.add(id);
      else if (m.role === 'Игрок') roster.players.add(id);
      rosters.set(key, roster);
    }
  }
  const teams = snapshot.teams.map(t => {
    const r = rosters.get(directoryTeamKey(t.name, t.game || t.games?.[0]));
    return { ...t, memberCount:r?.members.size || 0, leaderCount:r?.leaders.size || 0,
      assistantCount:r?.assistants.size || 0, playerCount:r?.players.size || 0 };
  }).filter(t => clean(t.status) !== 'неактивен' && t.memberCount > 0)
    .map(t => ({ ...t, ...(metrics.get(directoryTeamKey(t.name, t.game || t.games?.[0])) || {}) }));
  return { ...snapshot, teams, stats: { ...snapshot.stats, teams: teams.length }, teamDirectoryVersion: '1.0.0' };
}
