/* Royal CRM Mini App — Forward top / Back restore v0.5.58
 * Forward navigation opens every new screen at scrollY=0.
 * Back navigation is left to RoyalNav v0.5.21, which restores the captured scrollY.
 */
(() => {
  const VERSION = '0.5.58';
  let token = 0;

  function hardTop() {
    try { window.scrollTo(0, 0); } catch (_) {}
    try { if (document.scrollingElement) document.scrollingElement.scrollTop = 0; } catch (_) {}
    try { document.documentElement.scrollTop = 0; } catch (_) {}
    try { document.body.scrollTop = 0; } catch (_) {}
    try { document.getElementById('panel')?.scrollTo?.(0, 0); } catch (_) {}
  }

  function topAfterForwardRender() {
    const current = ++token;
    hardTop();
    requestAnimationFrame(() => {
      if (current !== token) return;
      hardTop();
      requestAnimationFrame(() => {
        if (current !== token) return;
        hardTop();
      });
    });
  }

  // Important: schedule only AFTER the click/pointer handler has rendered the new
  // screen. This allows RoyalNav.pushCurrent() to capture the old list scrollY first.
  function scheduleForwardTop() {
    setTimeout(topAfterForwardRender, 0);
  }

  function isBackTarget(target) {
    return !!target?.closest?.('[data-royal-back],.royal-back-button,.back-link[data-page="teams"]');
  }

  window.addEventListener('click', event => {
    const target = event.target;
    if (!target || isBackTarget(target)) return;

    // Main navigation and internal forward navigation.
    const forward = target.closest?.(
      'button[data-page],[data-team],[data-specnaz17-view],[data-project],[data-guide]'
    );
    if (!forward) return;

    // "menu" in спецназ can act as a Back action in RoyalNav; do not override it.
    if (forward.matches?.('[data-specnaz17-view="menu"]')) return;
    scheduleForwardTop();
  }, true);

  // Participant profile is opened from pointerup in participant-profile-v0523.js.
  window.addEventListener('pointerup', event => {
    const target = event.target;
    if (!target) return;
    if (!target.closest?.('.person-avatar-wrap,.hero-avatar,.history-avatar,.self-avatar')) return;
    scheduleForwardTop();
  }, true);

  // Changelog opening is intercepted earlier on window capture, so wrap only its
  // forward open method. RoyalNav Back restores the previous scroll independently.
  if (window.RoyalChangelog && typeof window.RoyalChangelog.open === 'function') {
    const nativeOpen = window.RoyalChangelog.open.bind(window.RoyalChangelog);
    window.RoyalChangelog.open = function(...args) {
      const result = nativeOpen(...args);
      topAfterForwardRender();
      return result;
    };
  }

  // Do NOT wrap RoyalNav.back(), do NOT listen to Telegram BackButton, and do NOT
  // force top on back clicks. RoyalNav already stores and restores state.scrollY.
  window.RoyalScrollTop = {
    version: VERSION,
    now: hardTop,
    afterForwardRender: topAfterForwardRender
  };
  window.__ROYAL_SCROLL_TOP_VERSION__ = VERSION;
})();
