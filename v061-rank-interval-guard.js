/* Royal CRM v0.6.1 — suppress legacy rank visibility polling while rank-system boots.
 * The legacy v0.5.59 rank runtime performs a global getBoundingClientRect pass every 1.6s.
 * In Android Telegram WebView that periodic full-layout work can trigger a one-frame compositor flicker.
 * This guard is loaded immediately before rank-system-v0524.js and restored immediately after it.
 */
(() => {
  if (String(window.__ROYAL_BUILD__ || '') !== '0.6.1') return;

  const nativeSetInterval = window.setInterval;
  let suppressed = 0;

  function guardedSetInterval(fn, delay, ...args) {
    const callbackName = String(fn?.name || '');
    if (Number(delay) === 1600 && callbackName === 'scheduleVisibleRefresh') {
      suppressed += 1;
      return -610000 - suppressed;
    }
    return nativeSetInterval.call(window, fn, delay, ...args);
  }

  window.setInterval = guardedSetInterval;
  window.RoyalV061RankIntervalGuard = {
    version: '0.6.1-rank-interval-guard.1',
    restore() {
      if (window.setInterval === guardedSetInterval) window.setInterval = nativeSetInterval;
      return suppressed;
    }
  };
})();
