/* Royal CRM Mini App — navigation v0.5.19
 * Exact-origin back navigation for internal screens.
 * Does not participate in participant identity. Telegram ID logic stays untouched.
 */
(() => {
  const VERSION = '0.5.19';
  const stack = [];
  let restoring = false;

  function panel() {
    return document.getElementById('panel');
  }

  function currentPage() {
    try {
      return String(typeof activePage !== 'undefined' && activePage ? activePage : 'home');
    } catch (_) {
      return 'home';
    }
  }

  function captureCurrent() {
    const p = panel();
    const page = currentPage();
    const state = {
      page,
      scrollY: Number(window.scrollY || 0),
      kind: 'page'
    };

    const participantSearch = document.getElementById('participantSearch');
    if (participantSearch) {
      state.kind = 'players';
      state.query = String(participantSearch.value || '');
      return state;
    }

    const teamSearch = document.getElementById('teamSearch');
    if (teamSearch) {
      state.kind = 'teams';
      state.query = String(teamSearch.value || '');
      return state;
    }

    const isRichInternal = !!p?.querySelector(
      '.team-detail-head,.specnaz-menu-head,.hero-list,.history-list,.participant-detail-card'
    );
    if (isRichInternal && p) {
      state.kind = 'html';
      state.html = p.innerHTML;
      state.panelHidden = !!p.hidden;
      return state;
    }

    return state;
  }

  function pushCurrent() {
    if (restoring) return;
    const state = captureCurrent();
    stack.push(state);
    if (stack.length > 20) stack.shift();
  }

  function restoreScroll(y) {
    const target = Number(y || 0);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try { window.scrollTo(0, target); } catch (_) {}
      });
    });
  }

  function restoreHtml(state) {
    const p = panel();
    if (!p) return;
    try { setActiveNav(state.page || 'home'); } catch (_) {}
    p.innerHTML = String(state.html || '');
    p.hidden = !!state.panelHidden;
    try { setupAvatarLoading(p); } catch (_) {}
    try {
      if (typeof mediaV0517LoadTeamPhoto === 'function' && p.querySelector('.team-detail-head')) {
        setTimeout(mediaV0517LoadTeamPhoto, 0);
      }
    } catch (_) {}
    enhanceVisibleBack();
  }

  function restore(state) {
    if (!state) return;
    restoring = true;
    try {
      if (state.kind === 'players' && typeof renderParticipantsPage === 'function') {
        renderParticipantsPage(state.query || '');
        try { setActiveNav('players'); } catch (_) {}
      } else if (state.kind === 'teams' && typeof renderTeamsPage === 'function') {
        renderTeamsPage(state.query || '');
        try { setActiveNav('teams'); } catch (_) {}
      } else if (state.kind === 'html') {
        restoreHtml(state);
      } else if (typeof renderPage === 'function') {
        renderPage(state.page || 'home');
      }
    } finally {
      restoring = false;
    }
    restoreScroll(state.scrollY);
  }

  function back() {
    const state = stack.pop();
    if (!state) {
      if (typeof renderPage === 'function') renderPage('home');
      return;
    }
    restore(state);
  }

  function clear() {
    stack.length = 0;
  }

  function makeBackButton(button) {
    if (!button) return;
    button.classList.add('royal-back-button');
    button.setAttribute('data-royal-back', '1');
    button.removeAttribute('data-page');
    button.removeAttribute('data-specnaz17-view');
    button.removeAttribute('data-participant-profile-back');
    button.textContent = '← Назад';
  }

  function enhanceVisibleBack() {
    const p = panel();
    if (!p) return;
    p.querySelectorAll('.back-link[data-page="teams"],.specnaz-back,[data-participant-profile-back]')
      .forEach(makeBackButton);
  }

  if (typeof renderTeamDetail === 'function') {
    const nativeRenderTeamDetail = renderTeamDetail;
    renderTeamDetail = function(teamRef) {
      if (!restoring) pushCurrent();
      const result = nativeRenderTeamDetail(teamRef);
      enhanceVisibleBack();
      return result;
    };
  }

  document.addEventListener('click', event => {
    const backButton = event.target?.closest?.('[data-royal-back]');
    if (backButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      back();
      return;
    }

    const legacyTeamBack = event.target?.closest?.('.back-link[data-page="teams"]');
    if (legacyTeamBack && stack.length) {
      event.preventDefault();
      event.stopImmediatePropagation();
      back();
      return;
    }

    const specnazButton = event.target?.closest?.('[data-specnaz17-view]');
    if (specnazButton) {
      const view = String(specnazButton.dataset.specnaz17View || '');
      if (view === 'menu' && stack.length) {
        event.preventDefault();
        event.stopImmediatePropagation();
        back();
        return;
      }
      if ((view === 'heroes' || view === 'history') && !restoring) {
        pushCurrent();
        setTimeout(enhanceVisibleBack, 0);
      }
      return;
    }

    const pageButton = event.target?.closest?.('button[data-page]');
    if (pageButton) clear();
  }, true);

  window.RoyalNav = {
    version: VERSION,
    pushCurrent,
    back,
    clear,
    captureCurrent,
    enhanceVisibleBack,
    get depth() { return stack.length; }
  };

  window.__ROYAL_NAV_VERSION__ = VERSION;
})();
