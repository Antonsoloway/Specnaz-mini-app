/* Royal CRM Mini App — dedicated section screens v0.5.22
 * UI only. Participant identity/data logic is untouched.
 */
(() => {
  const VERSION = '0.5.22';
  const ROOT_PAGES = new Set(['players', 'teams', 'help', 'projects', 'guide', 'profile']);

  function getActivePage() {
    try {
      return String(activePage || 'home');
    } catch (_) {
      return 'home';
    }
  }

  function applyShell(page) {
    const target = String(page || getActivePage() || 'home');
    document.body.classList.toggle('royal-section-screen', target !== 'home');
  }

  function isInternalPanel(panel) {
    if (!panel) return false;
    return !!panel.querySelector(
      '.team-detail-head,.participant-detail-card,.hero-list,.history-list,.participant-history-title'
    );
  }

  function ensureRootBack(page) {
    const target = String(page || getActivePage() || 'home');
    if (!ROOT_PAGES.has(target)) return;

    const panel = document.getElementById('panel');
    if (!panel || panel.hidden || isInternalPanel(panel)) return;
    if (panel.querySelector(':scope > [data-royal-back]')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'royal-back-button royal-root-back';
    button.setAttribute('data-royal-back', '1');
    button.textContent = '← Назад';
    panel.prepend(button);
  }

  function revealSection(page, scrollToTop) {
    const target = String(page || getActivePage() || 'home');
    applyShell(target);
    if (target !== 'home') ensureRootBack(target);

    if (target !== 'home' && scrollToTop) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const panel = document.getElementById('panel');
          if (!panel) return;
          try { panel.scrollIntoView({ block: 'start', behavior: 'auto' }); } catch (_) {}
        });
      });
    }
  }

  if (typeof setActiveNav === 'function') {
    const nativeSetActiveNav = setActiveNav;
    setActiveNav = function(page) {
      const result = nativeSetActiveNav(page);
      applyShell(page);
      return result;
    };
  }

  if (typeof renderParticipantsPage === 'function') {
    const nativeRenderParticipantsPage = renderParticipantsPage;
    renderParticipantsPage = function(query) {
      const result = nativeRenderParticipantsPage(query);
      revealSection('players', false);
      return result;
    };
  }

  if (typeof renderTeamsPage === 'function') {
    const nativeRenderTeamsPage = renderTeamsPage;
    renderTeamsPage = function(query) {
      const result = nativeRenderTeamsPage(query);
      revealSection('teams', false);
      return result;
    };
  }

  if (typeof renderPage === 'function') {
    const nativeRenderPage = renderPage;
    renderPage = function(page) {
      const result = nativeRenderPage(page);
      revealSection(page, page !== 'home');
      return result;
    };
  }

  // navigation-v0521 clears its stack for root buttons first. This listener is
  // registered later, so it records the exact screen we are leaving after that clear.
  document.addEventListener('click', event => {
    const button = event.target?.closest?.('button[data-page]');
    if (!button) return;

    const target = String(button.dataset.page || '');
    if (!target || target === 'home') return;

    let allowed = false;
    try { allowed = !!authState?.access; } catch (_) {}
    if (!allowed) return;

    const current = getActivePage();
    if (current === target) return;

    try { window.RoyalNav?.pushCurrent?.(); } catch (_) {}
  }, true);

  applyShell(getActivePage());

  window.RoyalSectionShell = {
    version: VERSION,
    apply: applyShell,
    ensureBack: ensureRootBack,
    reveal: revealSection
  };
  window.__ROYAL_SECTION_SHELL_VERSION__ = VERSION;
})();
