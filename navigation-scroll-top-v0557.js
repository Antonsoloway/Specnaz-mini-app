/* Royal CRM Mini App — Global scroll-to-top navigation v0.5.57
 * Every newly opened screen starts at the top, regardless of the previous screen scroll position.
 */
(() => {
  const VERSION = '0.5.57';
  let topToken = 0;

  function hardTop() {
    try { window.scrollTo(0, 0); } catch (_) {}
    try { if (document.scrollingElement) document.scrollingElement.scrollTop = 0; } catch (_) {}
    try { document.documentElement.scrollTop = 0; } catch (_) {}
    try { document.body.scrollTop = 0; } catch (_) {}
    try { document.getElementById('panel')?.scrollTo?.(0, 0); } catch (_) {}
  }

  function topAfterRender() {
    const token = ++topToken;
    hardTop();
    requestAnimationFrame(() => {
      if (token !== topToken) return;
      hardTop();
      requestAnimationFrame(() => {
        if (token !== topToken) return;
        hardTop();
      });
    });
  }

  try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch (_) {}

  function wrapGlobal(name) {
    const native = window[name];
    if (typeof native !== 'function' || native.__royalTopWrapped) return;
    const wrapped = function(...args) {
      hardTop();
      const result = native.apply(this, args);
      topAfterRender();
      return result;
    };
    wrapped.__royalTopWrapped = true;
    wrapped.__royalTopNative = native;
    window[name] = wrapped;
  }

  // Main page routes and rich internal screens.
  ['renderPage', 'renderTeamDetail', 'renderParticipantsPage', 'renderTeamsPage', 'RoyalOpenParticipantByTelegramId']
    .forEach(wrapGlobal);

  // App back navigation used by visible Back buttons and any code calling RoyalNav.back().
  if (window.RoyalNav && typeof window.RoyalNav.back === 'function') {
    const nativeBack = window.RoyalNav.back.bind(window.RoyalNav);
    window.RoyalNav.back = function(...args) {
      const result = nativeBack(...args);
      topAfterRender();
      return result;
    };
  }

  // Changelog is also a full app screen.
  if (window.RoyalChangelog && typeof window.RoyalChangelog.open === 'function') {
    const nativeOpen = window.RoyalChangelog.open.bind(window.RoyalChangelog);
    window.RoyalChangelog.open = function(...args) {
      hardTop();
      const result = nativeOpen(...args);
      topAfterRender();
      return result;
    };
  }

  // Window capture runs before RoyalNav's document-capture handler, so even a
  // Back click that uses stopImmediatePropagation is normalized to the top after restore.
  window.addEventListener('click', event => {
    const navTarget = event.target?.closest?.(
      'button[data-page],[data-team],[data-royal-back],[data-specnaz17-view],[data-project],[data-guide],#versionBadge'
    );
    if (!navTarget) return;
    setTimeout(topAfterRender, 0);
  }, true);

  // Participant profile opens from pointerup rather than a normal click.
  window.addEventListener('pointerup', event => {
    if (!event.target?.closest?.('.person-avatar-wrap,.hero-avatar,.history-avatar,.self-avatar')) return;
    setTimeout(topAfterRender, 0);
  }, true);

  // Telegram's native BackButton calls the old RoyalNav closure directly; add a
  // second non-invasive listener that only normalizes the final scroll position.
  try {
    window.Telegram?.WebApp?.BackButton?.onClick?.(() => setTimeout(topAfterRender, 0));
  } catch (_) {}

  // Expose for any future full-screen section.
  window.RoyalScrollTop = { version: VERSION, now: hardTop, afterRender: topAfterRender };
  window.__ROYAL_SCROLL_TOP_VERSION__ = VERSION;
})();
