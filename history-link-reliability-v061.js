/* Royal CRM Mini App — v0.6.1 reliable Specnaz history Telegram links */
(() => {
  'use strict';

  const VERSION = '0.6.1-history-link.1';
  const tg = window.Telegram?.WebApp;
  const TAP_SLOP_PX = 18;
  const TAP_MAX_MS = 1100;
  const CLICK_DEDUP_MS = 650;
  const TELEGRAM_RETRY_MS = 320;

  let press = null;
  let lastOpenUrl = '';
  let lastOpenAt = 0;
  let retryTimer = 0;
  let leftMiniApp = false;

  function safeHistoryUrl(value) {
    const url = String(value || '').trim();
    return /^(https?:\/\/|tg:\/\/)/i.test(url) ? url : '';
  }

  function historyLink(target) {
    return target?.closest?.('[data-history-link17]') || null;
  }

  function clearRetry() {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = 0;
    }
  }

  function markLeft() {
    leftMiniApp = true;
    clearRetry();
  }

  function rearm() {
    press = null;
    lastOpenAt = 0;
    lastOpenUrl = '';
    leftMiniApp = false;
    clearRetry();
    try { tg?.ready?.(); } catch (_) {}
  }

  function openTelegramHistory(url) {
    const safe = safeHistoryUrl(url);
    if (!safe) return;

    const now = Date.now();
    if (safe === lastOpenUrl && now - lastOpenAt < CLICK_DEDUP_MS) return;
    lastOpenUrl = safe;
    lastOpenAt = now;
    leftMiniApp = false;
    clearRetry();

    try { tg?.ready?.(); } catch (_) {}

    try {
      if (/^https:\/\/t\.me\//i.test(safe) && typeof tg?.openTelegramLink === 'function') {
        tg.openTelegramLink(safe);
        // Android Telegram occasionally drops the first deep-link call after
        // returning from a previous chat. Retry the same destination once only
        // if the Mini App never lost focus/visibility.
        retryTimer = window.setTimeout(() => {
          retryTimer = 0;
          if (leftMiniApp) return;
          try {
            tg?.ready?.();
            tg?.openTelegramLink?.(safe);
          } catch (_) {}
        }, TELEGRAM_RETRY_MS);
        return;
      }
      if (typeof tg?.openLink === 'function') {
        tg.openLink(safe);
        return;
      }
      window.open(safe, '_blank', 'noopener');
    } catch (_) {
      try { window.open(safe, '_blank', 'noopener'); } catch (_) {}
    }
  }

  window.addEventListener('pointerdown', event => {
    const link = historyLink(event.target);
    if (!link) return;
    press = {
      pointerId: event.pointerId,
      link,
      url: safeHistoryUrl(link.dataset.historyLink17 || link.getAttribute('href')),
      x: Number(event.clientX || 0),
      y: Number(event.clientY || 0),
      at: Date.now()
    };
  }, true);

  window.addEventListener('pointerup', event => {
    const current = press;
    press = null;
    if (!current || current.pointerId !== event.pointerId) return;
    const link = historyLink(event.target);
    if (!link || link !== current.link || !current.url) return;
    const dx = Number(event.clientX || 0) - current.x;
    const dy = Number(event.clientY || 0) - current.y;
    const distance = Math.hypot(dx, dy);
    const elapsed = Date.now() - current.at;
    if (distance > TAP_SLOP_PX || elapsed > TAP_MAX_MS) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openTelegramHistory(current.url);
  }, true);

  window.addEventListener('pointercancel', () => { press = null; }, true);

  // Fallback for WebViews that suppress pointerup-generated navigation but
  // still dispatch click. The dedupe window prevents a double-open.
  window.addEventListener('click', event => {
    const link = historyLink(event.target);
    if (!link) return;
    const url = safeHistoryUrl(link.dataset.historyLink17 || link.getAttribute('href'));
    if (!url) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openTelegramHistory(url);
  }, true);

  window.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const link = historyLink(event.target);
    if (!link) return;
    const url = safeHistoryUrl(link.dataset.historyLink17 || link.getAttribute('href'));
    if (!url) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openTelegramHistory(url);
  }, true);

  window.addEventListener('blur', markLeft, true);
  window.addEventListener('pagehide', markLeft, true);
  window.addEventListener('pageshow', rearm, true);
  window.addEventListener('focus', rearm, true);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') markLeft();
    else rearm();
  }, true);

  window.__ROYAL_HISTORY_LINK_RELIABILITY__ = VERSION;
})();
