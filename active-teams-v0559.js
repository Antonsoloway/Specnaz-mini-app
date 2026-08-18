/* Royal CRM Mini App — active teams / specnaz team directory v0.5.59
 * Source of truth: team.status from snapshot, identity = team name + game.
 * No fuzzy identity and no global MutationObserver.
 */
(() => {
  const VERSION = '0.5.59';
  const ACTIVE_STATUS = 'Активен';
  const GAME_ALL = 'all';
  const GAME_RM = 'rm';
  const GAME_RK = 'rk';

  function canonicalGame(value) {
    const raw = String(value || '').trim();
    const low = raw.toLocaleLowerCase('ru-RU');
    if (low === 'рм' || low.includes('royal match')) return 'Royal Match';
    if (low === 'рк' || low.includes('royal kingdom')) return 'Royal Kingdom';
    return raw;
  }

  function gameCode(value) {
    const game = canonicalGame(value);
    if (game === 'Royal Match') return GAME_RM;
    if (game === 'Royal Kingdom') return GAME_RK;
    return '';
  }

  function normalizeName(value) {
    return String(value || '').trim().toLocaleLowerCase('ru-RU');
  }

  function normalizeSearch(value) {
    let text = String(value == null ? '' : value);
    try { text = text.normalize('NFKC'); } catch (_) {}
    return text
      .toLocaleLowerCase('ru-RU')
      .replace(/ё/g, 'е')
      .replace(/^@+/, '')
      .replace(/[’'`]/g, '')
      .replace(/[^a-zа-я0-9@]+/giu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function compact(value) {
    return normalizeSearch(value).replace(/\s+/g, '');
  }

  function teamGame(team) {
    return canonicalGame(team?.game || (Array.isArray(team?.games) ? team.games[0] : '') || '');
  }

  function keyFor(name, game) {
    return `${normalizeName(name)}\n${canonicalGame(game).toLocaleLowerCase('ru-RU')}`;
  }

  function decodeRef(value) {
    let raw = String(value || '');
    try { raw = decodeURIComponent(raw); } catch (_) {}
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return { name: String(parsed[0] || '').trim(), game: canonicalGame(parsed[1]) };
    } catch (_) {}
    return { name: raw.trim(), game: '' };
  }

  function teams() {
    try { return Array.isArray(snapshotState?.teams) ? snapshotState.teams : []; }
    catch (_) { return []; }
  }

  function findTeam(name, game) {
    const wantedName = normalizeName(name);
    const wantedGame = canonicalGame(game);
    if (!wantedName) return null;
    if (wantedGame) {
      const wantedKey = keyFor(name, wantedGame);
      const exact = teams().find(team => keyFor(team?.name, teamGame(team)) === wantedKey);
      if (exact) return exact;
    }
    const byName = teams().filter(team => normalizeName(team?.name) === wantedName);
    return byName.length === 1 ? byName[0] : null;
  }

  function teamForNode(node) {
    if (!node) return null;
    const ref = decodeRef(node.dataset?.team || '');
    let team = findTeam(ref.name, ref.game);
    if (team) return team;

    const name = node.querySelector?.('span,strong,.team-card-main>strong')?.textContent?.trim() || ref.name || '';
    const text = node.textContent || '';
    const game = /royal\s*kingdom|(^|\s)рк(\s|$)/i.test(text) ? 'Royal Kingdom'
      : /royal\s*match|(^|\s)рм(\s|$)/i.test(text) ? 'Royal Match' : '';
    return findTeam(name, game);
  }

  function isActive(team) {
    return String(team?.status || '').trim() === ACTIVE_STATUS;
  }

  function markNode(node) {
    if (!node) return;
    const team = teamForNode(node);
    node.classList.toggle('active-team-gold-v0559', !!team && isActive(team));
    if (team) node.dataset.teamStatusV0559 = String(team.status || '');
  }

  function decorateTeamNodes(root = document) {
    root.querySelectorAll?.('.membership-pill[data-team],.participant-profile-team-link[data-team],.participant-profile-membership[data-team],.self-membership[data-team],.team-card[data-team]')
      .forEach(markNode);
  }

  function detailTeam() {
    const head = document.querySelector('.team-detail-head');
    if (!head) return null;
    const name = head.querySelector('h2')?.textContent?.trim() || '';
    const game = canonicalGame(head.querySelector('.muted')?.textContent || '');
    return findTeam(name, game);
  }

  function decorateTeamDetail() {
    const head = document.querySelector('.team-detail-head');
    if (!head) return;
    const team = detailTeam();
    const active = !!team && isActive(team);
    head.classList.toggle('active-team-detail-v0559', active);

    const existing = head.querySelector('[data-active-teams-open]');
    if (!active) {
      existing?.remove();
      return;
    }

    if (!existing) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'active-team-directory-button-v0559';
      button.dataset.activeTeamsOpen = '1';
      button.setAttribute('aria-label', 'Команды принимающие участие в спецназе');
      button.title = 'Команды принимающие участие в спецназе';
      head.appendChild(button);
    }
  }

  function sortedActiveTeams() {
    return teams().filter(isActive).slice().sort((a, b) => {
      const ag = teamGame(a) === 'Royal Match' ? 0 : teamGame(a) === 'Royal Kingdom' ? 1 : 2;
      const bg = teamGame(b) === 'Royal Match' ? 0 : teamGame(b) === 'Royal Kingdom' ? 1 : 2;
      return ag - bg || String(a?.name || '').localeCompare(String(b?.name || ''), 'ru', { sensitivity: 'base' });
    });
  }

  function activeTeamHaystack(team) {
    const values = [
      team?.name,
      team?.game,
      ...(Array.isArray(team?.games) ? team.games : []),
      ...(Array.isArray(team?.searchKeys) ? team.searchKeys : [])
    ].filter(Boolean);
    const parts = new Set();
    values.forEach(value => {
      const normalized = normalizeSearch(value);
      const compacted = compact(value);
      if (normalized) parts.add(normalized);
      if (compacted) parts.add(compacted);
    });
    return [...parts].join(' ');
  }

  function queryForms(value) {
    const normalized = normalizeSearch(value);
    if (!normalized) return [];
    const forms = new Set([normalized, compact(value)]);
    try {
      const pseudo = window.RoyalHybridSearch?.pseudoRead?.(normalized) || '';
      const pseudoNormalized = normalizeSearch(pseudo);
      if (pseudoNormalized) {
        forms.add(pseudoNormalized);
        forms.add(compact(pseudoNormalized));
      }
    } catch (_) {}
    return [...forms].filter(Boolean);
  }

  function activeTeamMatchesQuery(team, query) {
    const forms = queryForms(query);
    if (!forms.length) return true;
    const haystack = activeTeamHaystack(team);
    if (forms.some(form => haystack.includes(form))) return true;
    const words = normalizeSearch(query).split(' ').filter(Boolean);
    return words.length > 1 && words.every(word => queryForms(word).some(form => haystack.includes(form)));
  }

  function activeTeamMatchesGame(team, gameFilter) {
    if (gameFilter === GAME_ALL) return true;
    return gameCode(teamGame(team)) === gameFilter;
  }

  function renderDirectoryList(allTeams, state) {
    const container = document.querySelector('#panel .active-teams-list-v0559');
    const count = document.querySelector('#panel .active-teams-count-v0559');
    if (!container) return;

    const eligible = allTeams.filter(team => activeTeamMatchesGame(team, state.game));
    const visible = eligible.filter(team => activeTeamMatchesQuery(team, state.query));
    const hasQuery = !!normalizeSearch(state.query);

    const cards = visible.map(team => {
      try { return typeof teamCard === 'function' ? teamCard(team) : ''; }
      catch (_) { return ''; }
    }).filter(Boolean).join('');

    container.innerHTML = cards || '<div class="active-teams-empty-v0559">Ничего не найдено</div>';

    if (count) {
      if (state.game === GAME_ALL) count.textContent = hasQuery ? `${visible.length} из ${allTeams.length} команд` : `${allTeams.length} команд`;
      else count.textContent = hasQuery ? `${visible.length} из ${eligible.length} команд` : `${eligible.length} из ${allTeams.length} команд`;
    }

    decorateTeamNodes(container);
    try { window.RoyalTeamGameColors?.refresh?.(); } catch (_) {}
    try { window.RoyalUX0539?.refreshJumpButtons?.(); } catch (_) {}
  }

  function setDirectoryFilterButtons(state) {
    document.querySelectorAll('#panel .active-teams-filter-v0559 .royal-game-filter-btn').forEach(button => {
      const active = button.dataset.gameFilter === state.game;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function renderActiveTeamsPage() {
    const panel = document.getElementById('panel');
    if (!panel) return false;
    const list = sortedActiveTeams();
    const state = { game: GAME_ALL, query: '' };

    panel.hidden = false;
    panel.innerHTML = `<section class="active-teams-page-v0559"><button type="button" class="royal-back-button" data-royal-back="1">← Назад</button><div class="active-teams-head-v0559"><h2>Команды принимающие участие в спецназе</h2><p>Команды, участвующие в спецназе и(или) регулярно выкладывающие скрины в базе спецназа.</p><span class="active-teams-count-v0559">${list.length} команд</span></div><div class="active-teams-controls-v0559"><div class="royal-game-filter active-teams-filter-v0559" role="group" aria-label="Фильтр команд спецназа по игре"><button type="button" class="royal-game-filter-btn is-active" data-game-filter="all" aria-pressed="true">Все</button><button type="button" class="royal-game-filter-btn" data-game-filter="rm" aria-pressed="false">РМ</button><button type="button" class="royal-game-filter-btn" data-game-filter="rk" aria-pressed="false">РК</button></div><label class="search-box active-teams-search-box-v0559"><span>🔎</span><input id="activeTeamSearch" type="search" placeholder="Название команды или игра…" autocomplete="off" autocapitalize="none" spellcheck="false"></label></div><div class="active-teams-list-v0559"></div></section>`;

    const input = document.getElementById('activeTeamSearch');
    if (input) {
      input.addEventListener('input', () => {
        state.query = input.value || '';
        renderDirectoryList(list, state);
      }, { passive: true });
      input.addEventListener('search', () => {
        state.query = input.value || '';
        renderDirectoryList(list, state);
      }, { passive: true });
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter') setTimeout(() => { try { input.blur(); } catch (_) {} }, 0);
      });
    }

    panel.querySelectorAll('.active-teams-filter-v0559 .royal-game-filter-btn').forEach(button => {
      button.addEventListener('click', () => {
        const code = button.dataset.gameFilter || GAME_ALL;
        if (![GAME_ALL, GAME_RM, GAME_RK].includes(code)) return;
        state.game = code;
        setDirectoryFilterButtons(state);
        renderDirectoryList(list, state);
      });
    });

    try { setActiveNav('teams'); } catch (_) {}
    try { activePage = 'active-teams'; } catch (_) {}
    try { window.RoyalNav?.enhanceVisibleBack?.(); } catch (_) {}
    renderDirectoryList(list, state);
    try { window.RoyalScrollTop?.afterForwardRender?.(); } catch (_) {}
    return true;
  }

  function decorateAll() {
    decorateTeamNodes(document);
    decorateTeamDetail();
  }

  function schedule(delay = 0) {
    window.setTimeout(decorateAll, delay);
  }

  if (typeof renderParticipantsPage === 'function') {
    const native = renderParticipantsPage;
    renderParticipantsPage = function(...args) {
      const result = native.apply(this, args);
      schedule(0); schedule(80);
      return result;
    };
  }

  if (typeof renderTeamsPage === 'function') {
    const native = renderTeamsPage;
    renderTeamsPage = function(...args) {
      const result = native.apply(this, args);
      schedule(0); schedule(80);
      return result;
    };
  }

  if (typeof renderTeamDetail === 'function') {
    const native = renderTeamDetail;
    renderTeamDetail = function(...args) {
      const result = native.apply(this, args);
      schedule(0); schedule(80);
      return result;
    };
  }

  if (typeof renderPage === 'function') {
    const native = renderPage;
    renderPage = function(page, ...args) {
      if (String(page || '') === 'active-teams') return renderActiveTeamsPage();
      const result = native.call(this, page, ...args);
      schedule(0); schedule(80);
      return result;
    };
  }

  const nativeOpenParticipant = window.RoyalOpenParticipantByTelegramId;
  if (typeof nativeOpenParticipant === 'function') {
    window.RoyalOpenParticipantByTelegramId = function(...args) {
      const result = nativeOpenParticipant.apply(this, args);
      schedule(0); schedule(80);
      return result;
    };
  }

  document.addEventListener('click', event => {
    const opener = event.target?.closest?.('[data-active-teams-open]');
    if (opener) {
      event.preventDefault();
      event.stopImmediatePropagation();
      try { window.RoyalNav?.pushCurrent?.(); } catch (_) {}
      renderActiveTeamsPage();
      return;
    }
    schedule(0);
  }, true);

  document.addEventListener('input', () => schedule(0), true);
  window.addEventListener('pageshow', () => { schedule(0); schedule(100); });

  schedule(0);
  schedule(120);
  window.RoyalActiveTeams = {
    version: VERSION,
    status: ACTIVE_STATUS,
    refresh: decorateAll,
    openDirectory: renderActiveTeamsPage,
    getActiveTeams: sortedActiveTeams
  };
  window.__ROYAL_ACTIVE_TEAMS_VERSION__ = VERSION;
})();