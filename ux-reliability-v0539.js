/* Royal CRM Mini App — UX reliability v0.5.39
 * - extended RU/LAT team search (NAS NE DOGONYAT <-> НАС НЕ ДОГОНЯТ)
 * - live team counters from the exact currently displayed participant set
 * - no team-photo request when the team has no photo marker
 * - iOS Telegram WebView one-tap activation layer
 * - floating top/bottom navigation for long lists
 */
(() => {
  const VERSION = '0.5.39';
  const IN_CHAT = 'В чате';
  const tgWebApp = window.Telegram?.WebApp || null;

  function clean(value) {
    return String(value == null ? '' : value).trim();
  }

  function canonicalGame(value) {
    const raw = clean(value);
    const low = raw.toLocaleLowerCase('ru-RU');
    if (low === 'рм' || low.includes('royal match')) return 'Royal Match';
    if (low === 'рк' || low.includes('royal kingdom')) return 'Royal Kingdom';
    return raw;
  }

  function normalizeSearch(value) {
    return clean(value)
      .toLocaleLowerCase('ru-RU')
      .replace(/ё/g, 'е')
      .replace(/[’'`]/g, '')
      .replace(/[^a-zа-я0-9@]+/giu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const CYR_TO_LAT = {
    а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'
  };

  function cyrToLat(value) {
    return Array.from(normalizeSearch(value)).map(ch => CYR_TO_LAT[ch] ?? ch).join('');
  }

  const LAT_MULTI = [
    ['shch','щ'],['sch','щ'],['yo','е'],['zh','ж'],['kh','х'],['ts','ц'],['ch','ч'],['sh','ш'],['yu','ю'],['ya','я'],['ye','е']
  ];
  const LAT_SINGLE = {
    a:'а',b:'б',c:'к',d:'д',e:'е',f:'ф',g:'г',h:'х',i:'и',j:'й',k:'к',l:'л',m:'м',n:'н',o:'о',p:'п',q:'к',r:'р',s:'с',t:'т',u:'у',v:'в',w:'в',x:'кс',y:'й',z:'з'
  };

  function latToCyr(value) {
    let text = normalizeSearch(value);
    const placeholders = [];
    LAT_MULTI.forEach(([latin, cyr]) => {
      const marker = `\uE000${placeholders.length}\uE001`;
      placeholders.push(cyr);
      text = text.replace(new RegExp(latin, 'g'), marker);
    });
    text = Array.from(text).map(ch => LAT_SINGLE[ch] ?? ch).join('');
    placeholders.forEach((cyr, index) => {
      text = text.replaceAll(`\uE000${index}\uE001`, cyr);
    });
    return text;
  }

  function valueList(value) {
    if (Array.isArray(value)) return value.flatMap(valueList);
    const text = clean(value);
    return text ? [text] : [];
  }

  function expandedSearchText(values) {
    const variants = new Set();
    valueList(values).forEach(value => {
      const base = normalizeSearch(value);
      if (!base) return;
      const latin = cyrToLat(base);
      const cyr = latToCyr(base);
      [base, latin, cyr].forEach(v => {
        const normalized = normalizeSearch(v);
        if (!normalized) return;
        variants.add(normalized);
        variants.add(normalized.replace(/\s+/g, ''));
      });
    });
    return [...variants].join(' ');
  }

  function teamAliases(team) {
    return [
      team?.name,
      team?.game,
      team?.games,
      team?.alias,
      team?.aliases,
      team?.searchName,
      team?.searchNames,
      team?.nameRu,
      team?.ruName,
      team?.russianName
    ];
  }

  if (typeof teamSearchText === 'function') {
    teamSearchText = function teamSearchTextV0539(team) {
      return expandedSearchText(teamAliases(team));
    };
  }

  if (typeof participantSearchText === 'function') {
    participantSearchText = function participantSearchTextV0539(participant) {
      const memberships = Array.isArray(participant?.memberships) ? participant.memberships : [];
      const membershipValues = memberships.flatMap(m => [
        m?.team, m?.teamRaw, m?.teamAlias, m?.nickname, m?.role, m?.game
      ]);
      return expandedSearchText([
        participant?.name,
        participant?.telegramName,
        participant?.username,
        membershipValues
      ]);
    };
  }

  function parseTeamRef(value) {
    const raw = clean(value);
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return { name: clean(parsed[0]), game: canonicalGame(parsed[1]) };
      }
    } catch (_) {}
    return { name: raw, game: '' };
  }

  function teamGame(team) {
    return canonicalGame(team?.game || (Array.isArray(team?.games) ? team.games[0] : '') || '');
  }

  function normalizeTeamName(value) {
    try { return typeof normalizeTeam === 'function' ? normalizeTeam(value) : clean(value).toLocaleLowerCase('ru-RU'); }
    catch (_) { return clean(value).toLocaleLowerCase('ru-RU'); }
  }

  function findTeamByRef(teamRef) {
    const ref = parseTeamRef(teamRef);
    const teams = Array.isArray(snapshotState?.teams) ? snapshotState.teams : [];
    const nameKey = normalizeTeamName(ref.name);
    let match = teams.find(team => {
      if (normalizeTeamName(team?.name) !== nameKey) return false;
      if (!ref.game) return true;
      return teamGame(team) === ref.game || (Array.isArray(team?.games) && team.games.map(canonicalGame).includes(ref.game));
    });
    if (!match && !ref.game) match = teams.find(team => normalizeTeamName(team?.name) === nameKey);
    return match || null;
  }

  function participantIsCurrent(participant) {
    const state = clean(participant?.chatState);
    return !state || state === IN_CHAT;
  }

  function matchingMemberships(participant, team) {
    const nameKey = normalizeTeamName(team?.name);
    const game = teamGame(team);
    return (Array.isArray(participant?.memberships) ? participant.memberships : []).filter(m => {
      if (normalizeTeamName(m?.team) !== nameKey) return false;
      if (!game) return true;
      const mg = canonicalGame(m?.game);
      return !mg || mg === game;
    });
  }

  function liveTeamStats(team) {
    const participants = (Array.isArray(snapshotState?.participants) ? snapshotState.participants : []).filter(participantIsCurrent);
    const memberIds = new Set();
    const leaders = new Set();
    const assistants = new Set();
    const players = new Set();

    participants.forEach((participant, index) => {
      const memberships = matchingMemberships(participant, team);
      if (!memberships.length) return;
      const id = clean(participant?.telegramId) || `row:${participant?.row || index}`;
      memberIds.add(id);
      memberships.forEach(m => {
        const role = clean(m?.role);
        if (role === 'Лидер') leaders.add(id);
        else if (role === 'Помощник') assistants.add(id);
        else if (role === 'Игрок') players.add(id);
      });
    });

    return {
      memberCount: memberIds.size,
      leaderCount: leaders.size,
      assistantCount: assistants.size,
      playerCount: players.size
    };
  }

  function reconcileTeamStats() {
    const teams = Array.isArray(snapshotState?.teams) ? snapshotState.teams : [];
    teams.forEach(team => Object.assign(team, liveTeamStats(team)));
  }

  if (typeof teamCard === 'function') {
    const previousTeamCard = teamCard;
    teamCard = function teamCardV0539(team) {
      if (team) Object.assign(team, liveTeamStats(team));
      return previousTeamCard(team);
    };
  }

  function fixNoPhotoAfterRender(team) {
    if (!team || clean(team?.photoUrl)) return;
    const panel = document.getElementById('panel');
    const box = panel?.querySelector('.team-photo-box');
    if (!box) return;
    box.classList.add('photo-error', 'no-photo-v0539');
    box.querySelector('.team-photo')?.remove();
  }

  if (typeof renderTeamDetail === 'function') {
    const nativeRenderTeamDetail = renderTeamDetail;
    renderTeamDetail = function renderTeamDetailV0539(teamRef) {
      const team = findTeamByRef(teamRef);
      if (team) Object.assign(team, liveTeamStats(team));
      const result = nativeRenderTeamDetail(teamRef);
      // media-v0517 schedules its proxy request with setTimeout(0). Remove the
      // <img> synchronously when there is no photo, so that request never starts.
      fixNoPhotoAfterRender(team);
      scheduleJumpUpdate();
      return result;
    };
  }

  if (typeof loadSnapshot === 'function') {
    const nativeLoadSnapshot = loadSnapshot;
    loadSnapshot = async function loadSnapshotV0539() {
      const result = await nativeLoadSnapshot();
      reconcileTeamStats();
      scheduleJumpUpdate();
      return result;
    };
  }

  /* ---------- iOS one-tap layer ---------- */
  const isIOS = (() => {
    const ua = String(navigator.userAgent || '');
    return /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1);
  })();

  let touchPress = null;
  let syntheticClick = false;
  let lastActivated = null;
  let lastActivatedAt = 0;

  function telegramOpen(url) {
    const target = clean(url);
    if (!target) return false;
    try {
      if (/^https:\/\/t\.me\//i.test(target) && tgWebApp?.openTelegramLink) {
        tgWebApp.openTelegramLink(target);
        return true;
      }
      if (tgWebApp?.openLink) {
        tgWebApp.openLink(target);
        return true;
      }
    } catch (_) {}
    try {
      window.location.href = target;
      return true;
    } catch (_) {
      return false;
    }
  }

  function profileIdFromCard(card) {
    const raw = clean(
      card?.dataset?.profileTelegramId ||
      card?.dataset?.participantTelegramId ||
      card?.dataset?.directoryTelegramId ||
      card?.querySelector?.('[data-telegram-id]')?.dataset?.telegramId
    ).replace(/\.0$/, '');
    return /^\d+$/.test(raw) ? raw : '';
  }

  function isIndependentProfileAction(target) {
    return !!target?.closest?.([
      '[data-team]','[data-user-menu]','.rank-badge--compact','.hero-rank','.rank-list-slot',
      '.mayak-achievement-v0536','.participant-admin-badge-v0533','.participant-admin-badge-v0534',
      'a','button','input','textarea','select','summary'
    ].join(','));
  }

  function activateSynthetic(element) {
    if (!element || typeof element.click !== 'function') return false;
    syntheticClick = true;
    try { element.click(); }
    finally { syntheticClick = false; }
    return true;
  }

  function activateIosTarget(target) {
    if (!target) return false;

    const back = target.closest?.('[data-royal-back]');
    if (back && window.RoyalNav?.back) {
      window.RoyalNav.back();
      return back;
    }

    const action = target.closest?.('[data-user-action]');
    if (action) {
      const kind = clean(action.dataset.userAction);
      if (kind === 'cancel') {
        try { closeUserMenu(); } catch (_) {}
        return action;
      }
      const sheet = action.closest('#userActionSheet');
      const username = clean(sheet?.querySelector('.action-sheet-user')?.textContent).replace(/^@+/, '');
      if (kind === 'dm' && username) {
        try { closeUserMenu(); } catch (_) {}
        telegramOpen(`https://t.me/${encodeURIComponent(username)}`);
        return action;
      }
      if (kind === 'invite' && username) {
        try { closeUserMenu(); } catch (_) {}
        const profile = `https://t.me/${username}`;
        telegramOpen(`https://t.me/share/url?url=${encodeURIComponent(profile)}&text=${encodeURIComponent(`@${username}`)}`);
        return action;
      }
    }

    const user = target.closest?.('[data-user-menu]');
    if (user && typeof openUserMenu === 'function') {
      openUserMenu(user.dataset.userMenu, user.dataset.userName);
      return user;
    }

    const teamButton = target.closest?.('[data-team]');
    if (teamButton && typeof renderTeamDetail === 'function') {
      let ref = clean(teamButton.dataset.team);
      try { ref = decodeURIComponent(ref); } catch (_) {}
      renderTeamDetail(ref);
      return teamButton;
    }

    const pageButton = target.closest?.('button[data-page]');
    if (pageButton && typeof renderPage === 'function') {
      try { window.RoyalNav?.clear?.(); } catch (_) {}
      renderPage(pageButton.dataset.page);
      return pageButton;
    }

    const historyLink = target.closest?.('[data-participant-history-link]');
    if (historyLink) {
      telegramOpen(historyLink.dataset.participantHistoryLink || historyLink.getAttribute('href'));
      return historyLink;
    }

    const telegramLink = target.closest?.('a[href^="https://t.me/"],a[href^="tg://"]');
    if (telegramLink) {
      telegramOpen(telegramLink.getAttribute('href'));
      return telegramLink;
    }

    const card = target.closest?.('.person-card[data-profile-card="1"],.team-member[data-profile-card="1"],.directory-person-card[data-profile-card="1"],.hero-card[data-profile-card="1"]');
    if (card && !isIndependentProfileAction(target)) {
      const id = profileIdFromCard(card);
      if (id && typeof window.RoyalOpenParticipantByTelegramId === 'function') {
        window.RoyalOpenParticipantByTelegramId(id);
        return card;
      }
    }

    const generic = target.closest?.('button,[role="button"]');
    if (generic) {
      activateSynthetic(generic);
      return generic;
    }

    return false;
  }

  if (isIOS) {
    window.addEventListener('touchstart', event => {
      const touch = event.changedTouches?.[0];
      if (!touch || event.changedTouches.length !== 1) {
        touchPress = null;
        return;
      }
      touchPress = {
        id: touch.identifier,
        x: Number(touch.clientX || 0),
        y: Number(touch.clientY || 0),
        t: Date.now(),
        target: event.target
      };
    }, { capture:true, passive:true });

    window.addEventListener('touchend', event => {
      const saved = touchPress;
      touchPress = null;
      if (!saved) return;
      const touch = [...(event.changedTouches || [])].find(item => item.identifier === saved.id) || event.changedTouches?.[0];
      if (!touch) return;
      const dx = Number(touch.clientX || 0) - saved.x;
      const dy = Number(touch.clientY || 0) - saved.y;
      if ((dx * dx + dy * dy) > 225 || Date.now() - saved.t > 1100) return;

      const activated = activateIosTarget(event.target || saved.target);
      if (!activated) return;

      lastActivated = activated;
      lastActivatedAt = Date.now();
      event.preventDefault();
      event.stopImmediatePropagation();
    }, { capture:true, passive:false });

    window.addEventListener('touchcancel', () => { touchPress = null; }, { capture:true, passive:true });

    // A prevented touchend normally suppresses click. Some Telegram/iOS builds
    // still emit one; block only that immediate duplicate.
    window.addEventListener('click', event => {
      if (syntheticClick || !lastActivated || Date.now() - lastActivatedAt > 850) return;
      const target = event.target;
      if (target === lastActivated || lastActivated.contains?.(target) || target?.contains?.(lastActivated)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
  }

  /* ---------- Floating navigation for long lists ---------- */
  let jumpBox = null;
  let jumpTimer = 0;

  function ensureJumpBox() {
    if (jumpBox?.isConnected) return jumpBox;
    jumpBox = document.createElement('div');
    jumpBox.className = 'royal-list-jump-v0539';
    jumpBox.setAttribute('aria-label', 'Быстрая навигация по списку');
    jumpBox.innerHTML = `
      <button type="button" data-scroll-edge="top" aria-label="К началу списка" title="К началу списка">↑</button>
      <button type="button" data-scroll-edge="bottom" aria-label="В конец списка" title="В конец списка">↓</button>`;
    document.body.appendChild(jumpBox);
    return jumpBox;
  }

  function currentPanelHasLongList() {
    const panel = document.getElementById('panel');
    if (!panel || panel.hidden) return false;
    return !!panel.querySelector([
      '.people-list','.teams-list','.team-members-list','.hero-list','.history-list',
      '.participant-trip-list','.mayak-participants-page-v0536 .people-list','.directory-list'
    ].join(','));
  }

  function maxScrollY() {
    const root = document.scrollingElement || document.documentElement;
    return Math.max(0, Number(root.scrollHeight || 0) - Number(window.innerHeight || 0));
  }

  function updateJumpBox() {
    const box = ensureJumpBox();
    const max = maxScrollY();
    const y = Number(window.scrollY || (document.scrollingElement?.scrollTop || 0));
    const useful = currentPanelHasLongList() && max > 520;
    box.classList.toggle('is-visible', useful);
    if (!useful) return;
    const top = box.querySelector('[data-scroll-edge="top"]');
    const bottom = box.querySelector('[data-scroll-edge="bottom"]');
    if (top) top.hidden = y < 220;
    if (bottom) bottom.hidden = y > max - 220;
  }

  function scheduleJumpUpdate() {
    clearTimeout(jumpTimer);
    jumpTimer = window.setTimeout(updateJumpBox, 30);
  }

  function scrollToTopOfCurrentList() {
    const search = document.getElementById('participantSearch') || document.getElementById('teamSearch');
    const anchor = search?.closest?.('.search-box') || document.querySelector('#panel .section-title-row') || document.getElementById('panel');
    const top = anchor ? Math.max(0, anchor.getBoundingClientRect().top + window.scrollY - 12) : 0;
    try { window.scrollTo({ top, behavior:'smooth' }); }
    catch (_) { window.scrollTo(0, top); }
  }

  function scrollToBottomOfCurrentList() {
    const max = maxScrollY();
    try { window.scrollTo({ top:max, behavior:'smooth' }); }
    catch (_) { window.scrollTo(0, max); }
  }

  document.addEventListener('click', event => {
    const button = event.target?.closest?.('[data-scroll-edge]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    if (button.dataset.scrollEdge === 'top') scrollToTopOfCurrentList();
    else scrollToBottomOfCurrentList();
  }, true);

  window.addEventListener('scroll', updateJumpBox, { passive:true });
  window.addEventListener('resize', scheduleJumpUpdate, { passive:true });
  window.addEventListener('pageshow', scheduleJumpUpdate);

  ['renderParticipantsPage','renderTeamsPage','renderPage'].forEach(name => {
    try {
      const original = window[name];
      if (typeof original !== 'function') return;
      window[name] = function() {
        const result = original.apply(this, arguments);
        scheduleJumpUpdate();
        return result;
      };
    } catch (_) {}
  });

  ensureJumpBox();
  scheduleJumpUpdate();

  window.RoyalUX0539 = {
    version: VERSION,
    expandedSearchText,
    liveTeamStats,
    refreshTeamStats: reconcileTeamStats,
    refreshJumpButtons: scheduleJumpUpdate,
    isIOS
  };
  window.__ROYAL_UX_RELIABILITY_VERSION__ = VERSION;
})();
