/* Royal CRM Mini App — active teams / specnaz team directory v0.5.59
 * Source of truth: team.status from snapshot, identity = team name + game.
 * No fuzzy identity and no global MutationObserver.
 */
(() => {
  const VERSION = '0.5.59';
  const ACTIVE_STATUS = 'Активен';
  const ICON_SRC = 'assets/specnaz-active-team-v0559.jpg';

  function canonicalGame(value) {
    const raw = String(value || '').trim();
    const low = raw.toLocaleLowerCase('ru-RU');
    if (low === 'рм' || low.includes('royal match')) return 'Royal Match';
    if (low === 'рк' || low.includes('royal kingdom')) return 'Royal Kingdom';
    return raw;
  }

  function normalizeName(value) {
    return String(value || '').trim().toLocaleLowerCase('ru-RU');
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
      const image = document.createElement('img');
      image.className = 'active-team-icon-image-v0559';
      image.src = ICON_SRC;
      image.alt = '';
      image.loading = 'eager';
      button.appendChild(image);
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

  function renderActiveTeamsPage() {
    const panel = document.getElementById('panel');
    if (!panel) return false;
    const list = sortedActiveTeams();
    const cards = list.map(team => {
      try { return typeof teamCard === 'function' ? teamCard(team) : ''; }
      catch (_) { return ''; }
    }).filter(Boolean).join('');

    panel.hidden = false;
    panel.innerHTML = `<section class="active-teams-page-v0559"><button type="button" class="royal-back-button" data-royal-back="1">← Назад</button><div class="active-teams-head-v0559"><h2>Команды принимающие участие в спецназе</h2><p>Активные команды по данным Royal CRM.</p><span class="active-teams-count-v0559">${list.length} команд</span></div><div class="active-teams-list-v0559">${cards || '<div class="active-teams-empty-v0559">Активные команды пока не найдены</div>'}</div></section>`;

    try { setActiveNav('teams'); } catch (_) {}
    try { activePage = 'active-teams'; } catch (_) {}
    try { window.RoyalNav?.enhanceVisibleBack?.(); } catch (_) {}
    decorateTeamNodes(panel);
    try { window.RoyalTeamGameColors?.refresh?.(); } catch (_) {}
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
