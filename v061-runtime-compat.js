/* Royal CRM Mini App — v0.6.1 runtime compatibility bridge */
(() => {
  'use strict';

  const VERSION = '0.6.1-runtime.2';
  const WORKER_ORIGIN = 'https://royal-crm-miniapp-api.tropical-spoon.workers.dev';
  const SNAPSHOT_RETRY_DELAYS_MS = [250, 700];
  let snapshotFetchWrapped = false;
  let snapshotRecoveryAttempts = 0;
  let snapshotRecoveryTimer = 0;

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function isSnapshotRequest(input) {
    try {
      const raw = typeof input === 'string' ? input : String(input?.url || '');
      if (!raw.startsWith(WORKER_ORIGIN)) return false;
      return new URL(raw).pathname === '/snapshot';
    } catch (_) {
      return false;
    }
  }

  function isRetryableSnapshotResponse(response) {
    return [429, 502, 503, 504].includes(Number(response?.status || 0));
  }

  function installSnapshotFetchRetry() {
    if (snapshotFetchWrapped || typeof window.fetch !== 'function') return;
    snapshotFetchWrapped = true;
    const upstreamFetch = window.fetch.bind(window);

    window.fetch = async function royalV061SnapshotFetch(input, init) {
      if (!isSnapshotRequest(input)) return upstreamFetch(input, init);

      let lastError = null;
      let lastResponse = null;
      const attempts = SNAPSHOT_RETRY_DELAYS_MS.length + 1;

      for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
          const response = await upstreamFetch(input, init);
          lastResponse = response;
          if (!isRetryableSnapshotResponse(response) || attempt === attempts - 1) return response;
          console.warn(`Snapshot HTTP ${response.status}; retry ${attempt + 1}/${attempts - 1}`);
        } catch (error) {
          lastError = error;
          if (attempt === attempts - 1) throw error;
          console.warn(`Snapshot fetch failed; retry ${attempt + 1}/${attempts - 1}:`, error?.code || error?.message || error);
        }
        await sleep(SNAPSHOT_RETRY_DELAYS_MS[attempt] || 0);
      }

      if (lastResponse) return lastResponse;
      throw lastError || new Error('SNAPSHOT_FETCH_FAILED');
    };
  }

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

  function scheduleSnapshotRecovery() {
    if (snapshotRecoveryAttempts >= 1 || snapshotRecoveryTimer) return;
    snapshotRecoveryAttempts += 1;
    snapshotRecoveryTimer = window.setTimeout(async () => {
      snapshotRecoveryTimer = 0;
      try {
        if (!window.RoyalAppV0600?.reloadSnapshot) return;
        await window.RoyalAppV0600.reloadSnapshot();
      } catch (error) {
        console.warn('v0.6.1 automatic snapshot recovery failed', error?.code || error?.message || error);
      }
    }, 900);
  }

  installSnapshotFetchRetry();
  exposeRuntime();
  replayLifecycle();

  window.addEventListener('royal:auth-ready', () => {
    exposeRuntime();
    replayLifecycle();
  });
  window.addEventListener('royal:snapshot-ready', () => {
    snapshotRecoveryAttempts = 0;
    if (snapshotRecoveryTimer) {
      clearTimeout(snapshotRecoveryTimer);
      snapshotRecoveryTimer = 0;
    }
    replayLifecycle();
  });
  window.addEventListener('royal:snapshot-error', () => scheduleSnapshotRecovery());

  setTimeout(replayLifecycle, 0);
  setTimeout(replayLifecycle, 500);
  setTimeout(replayLifecycle, 1500);

  window.__ROYAL_V061_RUNTIME_COMPAT__ = VERSION;
})();