/* Royal CRM Mini App — v0.6.1 runtime compatibility bridge */
(() => {
  'use strict';

  const VERSION = '0.6.1-runtime.1';

  function exposeRuntime() {
    if (window.RoyalAppV0600?.fetchProtectedMediaObjectUrl) return true;
    if (typeof protectedMediaObjectUrl !== 'function' || typeof releaseProtectedMedia !== 'function') return false;

    window.RoyalAppV0600 = {
      version: typeof BUILD !== 'undefined' ? String(BUILD || '0.6.1') : '0.6.1',
      fetchProtectedMediaObjectUrl: protectedMediaObjectUrl,
      releaseProtectedMedia,
      reloadSnapshot: async () => {
        if (typeof loadSnapshot !== 'function') return null;
        const snapshot = await loadSnapshot(true);
        try {
          if (typeof activePage !== 'undefined' && activePage !== 'home' && typeof renderPage === 'function') {
            renderPage(activePage);
          }
        } catch (_) {}
        return snapshot;
      }
    };
    return true;
  }

  function replayLifecycle() {
    if (!exposeRuntime()) return;
    try {
      const data = typeof authState !== 'undefined' ? authState : null;
      if (!data?.access) return;
      const user = data.user || {};
      window.RoyalMusicV0600?.handleAppEvent?.('auth-ready', {
        access: true,
        user: {
          participantKey: String(user.participantKey || ''),
          crmName: String(user.crmName || ''),
          telegramFirstName: String(user.telegramFirstName || '')
        }
      });
      if (typeof snapshotState !== 'undefined' && snapshotState) {
        window.RoyalMusicV0600?.handleAppEvent?.('snapshot-ready', { stats: snapshotState.stats || {} });
      }
    } catch (error) {
      console.warn('v0.6.1 runtime lifecycle replay failed', error?.message || error);
    }
  }

  exposeRuntime();
  replayLifecycle();

  window.addEventListener('royal:auth-ready', () => {
    exposeRuntime();
    replayLifecycle();
  });
  window.addEventListener('royal:snapshot-ready', () => replayLifecycle());

  setTimeout(replayLifecycle, 0);
  setTimeout(replayLifecycle, 500);
  setTimeout(replayLifecycle, 1500);

  window.__ROYAL_V061_RUNTIME_COMPAT__ = VERSION;
})();
