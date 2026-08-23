/* Royal CRM v0.6.1 — stop the hidden 20s snapshot watchdog from repainting Telegram WebView.
 *
 * admin-write-v0600-v3.js historically schedules a permanent public/admin snapshot refresh:
 *   first after 5s, then every 20s, and again 1s after visibility return.
 * The callback calls loadSnapshot() even when nothing changed. On Android Telegram WebView this
 * produces a short full-surface compositor flash roughly every 20–25 seconds.
 *
 * Mutation-specific refreshes are NOT blocked: their timers use simple Promise resolve callbacks,
 * so writes still poll the fresh public snapshot immediately after a committed change.
 */
(() => {
  'use strict';
  if (String(window.__ROYAL_BUILD__ || '') !== '0.6.1') return;
  if (window.__ROYAL_BACKGROUND_REFRESH_GUARD_V061__) return;

  const nativeSetTimeout = window.setTimeout.bind(window);
  const nativeClearTimeout = window.clearTimeout.bind(window);
  const suppressedIds = new Set();
  let serial = 0;
  let suppressed = 0;

  function isLegacyLiveSnapshotWatchdog(callback, delay) {
    if (typeof callback !== 'function') return false;
    const ms = Number(delay || 0);
    if (ms < 900 || ms > 21000) return false;
    let source = '';
    try { source = Function.prototype.toString.call(callback); } catch (_) {}
    return source.includes('refreshPublicSnapshotOnce') &&
      source.includes('refreshVisibleAdminSnapshot') &&
      source.includes('scheduleLiveSnapshotRefresh');
  }

  window.setTimeout = function royalSetTimeoutV061(callback, delay, ...args) {
    if (isLegacyLiveSnapshotWatchdog(callback, delay)) {
      suppressed += 1;
      const id = -610700 - (++serial);
      suppressedIds.add(id);
      return id;
    }
    return nativeSetTimeout(callback, delay, ...args);
  };

  window.clearTimeout = function royalClearTimeoutV061(id) {
    if (suppressedIds.delete(id)) return;
    return nativeClearTimeout(id);
  };

  window.__ROYAL_BACKGROUND_REFRESH_GUARD_V061__ = {
    version: '0.6.1-background-refresh-guard.1',
    get suppressed() { return suppressed; },
    reason: 'disable legacy 5s/20s/visibility live snapshot watchdog; mutation polling preserved'
  };
})();
