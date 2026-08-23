/* Royal CRM v0.6.1 — suppress legacy rank visibility polling while rank-system boots.
 * The legacy v0.5.59 rank runtime repeatedly scans every compact rank with getBoundingClientRect:
 * every 1.6s and again on scroll/resize. Android Telegram WebView can flash a compositor tile
 * while that synchronous layout work and rank animation are active on long lists.
 * This guard is loaded immediately before rank-system-v0524.js and restored immediately after it.
 */
(() => {
  if (String(window.__ROYAL_BUILD__ || '') !== '0.6.1') return;

  const nativeSetInterval = window.setInterval;
  const nativeAddEventListener = window.addEventListener;
  let suppressedIntervals = 0;
  let suppressedListeners = 0;

  function isLegacyRankVisibilityCallback(fn) {
    return String(fn?.name || '') === 'scheduleVisibleRefresh';
  }

  function guardedSetInterval(fn, delay, ...args) {
    if (Number(delay) === 1600 && isLegacyRankVisibilityCallback(fn)) {
      suppressedIntervals += 1;
      return -610000 - suppressedIntervals;
    }
    return nativeSetInterval.call(window, fn, delay, ...args);
  }

  function guardedAddEventListener(type, listener, options) {
    const eventType = String(type || '');
    if ((eventType === 'scroll' || eventType === 'resize') && isLegacyRankVisibilityCallback(listener)) {
      suppressedListeners += 1;
      return;
    }
    return nativeAddEventListener.call(window, type, listener, options);
  }

  window.setInterval = guardedSetInterval;
  window.addEventListener = guardedAddEventListener;

  window.RoyalV061RankIntervalGuard = {
    version: '0.6.1-rank-interval-guard.2',
    restore() {
      if (window.setInterval === guardedSetInterval) window.setInterval = nativeSetInterval;
      if (window.addEventListener === guardedAddEventListener) window.addEventListener = nativeAddEventListener;
      return {
        intervals: suppressedIntervals,
        listeners: suppressedListeners
      };
    }
  };
})();
