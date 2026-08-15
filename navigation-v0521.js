/* Royal CRM Mini App — navigation v0.5.21
 * Exact-origin back navigation + Telegram native/system BackButton.
 * Telegram ID / participant data logic is untouched.
 */
(() => {
  const VERSION = '0.5.21';
  const stack = [];
  let restoring = false;

  const tg = window.Telegram?.WebApp || null;
  const tgBack = tg?.BackButton || null;

  function panel() {
    return document.getElementById('panel');
  }

  function currentPage() {
    try {
      if (typeof activePage !== 'undefined' && activePage) return String(activePage);
    } catch (_) {}
    return 'home';
  }

  function syncTelegramBack() {
    if (!tgBack) return;
    try {
      if (stack.length > 0) tgBack.show();
      else tgBack.hide();
    } catch (_) {}
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
      '.team-detail-head,.specnaz-menu-head,.hero-list,.history-list,.participant-detail-card,.guide-head'
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
    stack.push(captureCurrent());
    if (stack.length > 20) stack.shift();
    syncTelegramBack();
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
    if (!state) {
      syncTelegramBack();
      return;
    }
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
    syncTelegramBack();
  }

  function back() {
    const state = stack.pop();
    if (!state) {
      syncTelegramBack();
      if (typeof renderPage === 'function') renderPage('home');
      return;
    }
    restore(state);
  }

  function clear() {
    stack.length = 0;
    syncTelegramBack();
  }

  function makeBackButton(button) {
    if (!button) return;
    button.classList.add('royal-back-button');
    button.setAttribute('data-royal-back', '1');
    button.removeAttribute('data-page');
    button.removeAttribute('data-specnaz17-view');
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

  function telegramBackHandler() {
    if (stack.length > 0) {
      back();
      return;
    }
    syncTelegramBack();
  }

  if (tgBack) {
    try {
      const previous = window.__ROYAL_TELEGRAM_BACK_HANDLER__;
      if (previous && typeof tgBack.offClick === 'function') tgBack.offClick(previous);
    } catch (_) {}
    try {
      tgBack.onClick(telegramBackHandler);
      window.__ROYAL_TELEGRAM_BACK_HANDLER__ = telegramBackHandler;
    } catch (_) {}
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
    syncTelegramBack,
    get depth() { return stack.length; }
  };

  syncTelegramBack();
  window.__ROYAL_NAV_VERSION__ = VERSION;
})();
