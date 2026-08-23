/* Royal CRM Mini App — v0.6.1 reliable Specnaz history Telegram links v2 */
(() => {
  'use strict';

  const VERSION = '0.6.1-history-link.2';
  const tg = window.Telegram?.WebApp;
  const TOUCH_SLOP_PX = 42;
  const TOUCH_MAX_MS = 1800;
  const SAME_TAP_DEDUP_MS = 900;

  let touch = null;
  let lastUrl = '';
  let lastAt = 0;

  function safeHistoryUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const url = new URL(raw);
      return (url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'tg:') ? raw : '';
    } catch (_) {
      return /^tg:\/\//i.test(raw) ? raw : '';
    }
  }

  function findLink(target) {
    return target?.closest?.('[data-history-link17]') || null;
  }

  function destination(link) {
    return safeHistoryUrl(link?.dataset?.historyLink17 || link?.getAttribute?.('href'));
  }

  function consume(event) {
    try { event.preventDefault(); } catch (_) {}
    try { event.stopImmediatePropagation(); } catch (_) {}
    try { event.stopPropagation(); } catch (_) {}
  }

  function sameSyntheticTap(url) {
    const now = Date.now();
    if (url && url === lastUrl && now - lastAt < SAME_TAP_DEDUP_MS) return true;
    lastUrl = url;
    lastAt = now;
    return false;
  }

  function openNative(url) {
    const safe = safeHistoryUrl(url);
    if (!safe || sameSyntheticTap(safe)) return;

    // One native navigation call per physical tap. The old v1 retry could race
    // Telegram's in-app chat overlay after returning to the Mini App.
    try {
      if (/^https:\/\/t\.me\//i.test(safe) && typeof tg?.openTelegramLink === 'function') {
        tg.openTelegramLink(safe);
        return;
      }
      if (typeof tg?.openLink === 'function') {
        tg.openLink(safe);
        return;
      }
    } catch (_) {}

    // Last-resort fallback keeps the real href usable instead of swallowing it.
    try { window.location.href = safe; } catch (_) {}
  }

  // Use touchend as the primary Android Telegram path. Capturing on window is
  // deliberate: it runs before the legacy document-level Specnaz click router,
  // so only one navigation owner exists for the tap.
  window.addEventListener('touchstart', event => {
    const link = findLink(event.target);
    const point = event.touches?.[0];
    if (!link || !point) {
      touch = null;
      return;
    }
    touch = {
      link,
      url: destination(link),
      x: Number(point.clientX || 0),
      y: Number(point.clientY || 0),
      at: Date.now()
    };
  }, { capture: true, passive: true });

  window.addEventListener('touchend', event => {
    const current = touch;
    touch = null;
    if (!current?.url) return;
    const point = event.changedTouches?.[0];
    if (!point) return;
    const link = findLink(event.target) || current.link;
    if (link !== current.link) return;
    const dx = Number(point.clientX || 0) - current.x;
    const dy = Number(point.clientY || 0) - current.y;
    if (Math.hypot(dx, dy) > TOUCH_SLOP_PX) return;
    if (Date.now() - current.at > TOUCH_MAX_MS) return;
    consume(event);
    openNative(current.url);
  }, { capture: true, passive: false });

  window.addEventListener('touchcancel', () => { touch = null; }, true);

  // Mouse/stylus and WebViews that emit click without touch events.
  window.addEventListener('click', event => {
    const link = findLink(event.target);
    if (!link) return;
    const url = destination(link);
    if (!url) return;
    consume(event);
    openNative(url);
  }, true);

  window.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const link = findLink(event.target);
    if (!link) return;
    const url = destination(link);
    if (!url) return;
    consume(event);
    lastUrl = '';
    lastAt = 0;
    openNative(url);
  }, true);

  // Telegram keeps the Mini App as a bottom sheet while a chat is opened.
  // Returning must immediately allow the next physical tap, including the same URL.
  const rearm = () => {
    touch = null;
    lastUrl = '';
    lastAt = 0;
  };
  window.addEventListener('focus', rearm, true);
  window.addEventListener('pageshow', rearm, true);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') rearm();
  }, true);

  window.__ROYAL_HISTORY_LINK_RELIABILITY__ = VERSION;
})();
