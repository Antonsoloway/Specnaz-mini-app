/* Royal CRM Mini App v0.6.1 — iOS admin modal touch reliability */
(() => {
  'use strict';
  if (String(window.__ROYAL_BUILD__ || '') !== '0.6.1') return;
  if (window.__ROYAL_IOS_ADMIN_TOUCH_FIX_V061__) return;

  const VERSION = '0.6.1-ios-admin-touch.1';
  const ua = String(navigator.userAgent || '');
  const platform = String(navigator.platform || '');
  const isIOS = /iPad|iPhone|iPod/i.test(ua) || (platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1);
  if (!isIOS) return;

  const ACTION_SELECTOR = [
    '[data-write-close="1"]',
    '[data-write-clear-slot="1"]',
    '.royal-admin-form-button.is-save',
    '.royal-admin-form-button.is-delete',
    '.royal-admin-direct-delete',
    '[data-admin-create-participant="1"]',
    '[data-admin-create-team="1"]',
    '[data-admin-edit-participant="1"]',
    '[data-admin-edit-team="1"]'
  ].join(',');

  let touch = null;
  let syntheticTarget = null;
  let syntheticUntil = 0;

  function modalFor(target) {
    return target?.closest?.('[data-admin-write-modal="1"] .royal-admin-modal') || null;
  }

  function actionFor(target) {
    const action = target?.closest?.(ACTION_SELECTOR) || null;
    if (!action || action.disabled || !modalFor(action)) return null;
    return action;
  }

  function decorateBackdrop(backdrop) {
    if (!backdrop || backdrop.dataset.v061IosTouch === VERSION) return;
    backdrop.dataset.v061IosTouch = VERSION;
    backdrop.classList.add('v061-ios-admin-touch');
  }

  function decorateExisting() {
    document.querySelectorAll('[data-admin-write-modal="1"]').forEach(decorateBackdrop);
  }

  const style = document.createElement('style');
  style.dataset.v061IosAdminTouch = '1';
  style.textContent = `
    [data-admin-write-modal="1"].v061-ios-admin-touch{
      -webkit-backdrop-filter:none!important;
      backdrop-filter:none!important;
      overflow-y:auto!important;
      -webkit-overflow-scrolling:touch!important;
      align-items:flex-start!important;
      touch-action:pan-y!important;
      overscroll-behavior:contain!important;
    }
    [data-admin-write-modal="1"].v061-ios-admin-touch .royal-admin-modal{
      width:min(680px,100%)!important;
      max-height:none!important;
      min-height:100%!important;
      overflow:visible!important;
      touch-action:pan-y!important;
      -webkit-overflow-scrolling:touch!important;
      transform:translateZ(0);
    }
    [data-admin-write-modal="1"].v061-ios-admin-touch button,
    [data-admin-write-modal="1"].v061-ios-admin-touch input,
    [data-admin-write-modal="1"].v061-ios-admin-touch select,
    [data-admin-write-modal="1"].v061-ios-admin-touch label{
      -webkit-tap-highlight-color:rgba(98,176,235,.16);
    }
    [data-admin-write-modal="1"].v061-ios-admin-touch button{
      touch-action:manipulation!important;
      cursor:pointer!important;
      position:relative;
      z-index:2;
    }
    [data-admin-write-modal="1"].v061-ios-admin-touch input,
    [data-admin-write-modal="1"].v061-ios-admin-touch select{
      font-size:16px!important;
      touch-action:manipulation!important;
      position:relative;
      z-index:2;
    }
    [data-admin-write-modal="1"].v061-ios-admin-touch .royal-admin-form-actions{
      -webkit-transform:translateZ(0);
      transform:translateZ(0);
      pointer-events:auto!important;
    }
  `;
  document.head.appendChild(style);

  window.addEventListener('touchstart', event => {
    const action = actionFor(event.target);
    if (!action || event.touches?.length !== 1) {
      touch = null;
      return;
    }
    const point = event.touches[0];
    touch = {
      action,
      id: point.identifier,
      x: Number(point.clientX || 0),
      y: Number(point.clientY || 0),
      at: Date.now(),
      moved: false
    };
  }, { capture:true, passive:true });

  window.addEventListener('touchmove', event => {
    if (!touch) return;
    const points = Array.from(event.touches || []);
    const point = points.find(item => item.identifier === touch.id);
    if (!point) return;
    const dx = Number(point.clientX || 0) - touch.x;
    const dy = Number(point.clientY || 0) - touch.y;
    if ((dx * dx + dy * dy) > 196) touch.moved = true;
  }, { capture:true, passive:true });

  window.addEventListener('touchend', event => {
    const saved = touch;
    touch = null;
    if (!saved || saved.moved || Date.now() - saved.at > 1000) return;
    const changed = Array.from(event.changedTouches || []);
    const point = changed.find(item => item.identifier === saved.id);
    if (!point || !saved.action?.isConnected || saved.action.disabled) return;

    const dx = Number(point.clientX || 0) - saved.x;
    const dy = Number(point.clientY || 0) - saved.y;
    if ((dx * dx + dy * dy) > 196) return;

    // iOS Telegram WebView occasionally drops the follow-up click for controls
    // inside the fixed, scrollable admin sheet. Convert the completed tap into
    // the same normal click path used by the existing admin-write module.
    event.preventDefault();
    syntheticTarget = saved.action;
    syntheticUntil = Date.now() + 700;
    saved.action.click();
  }, { capture:true, passive:false });

  window.addEventListener('touchcancel', () => { touch = null; }, true);

  // If WebKit still emits its delayed trusted click after the synthetic click,
  // consume only that duplicate so Save/Delete/Clear never execute twice.
  window.addEventListener('click', event => {
    if (!event.isTrusted || !syntheticTarget || Date.now() >= syntheticUntil) return;
    const target = event.target?.closest?.(ACTION_SELECTOR);
    if (target !== syntheticTarget) return;
    syntheticTarget = null;
    syntheticUntil = 0;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  const observer = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes || []) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.('[data-admin-write-modal="1"]')) decorateBackdrop(node);
        node.querySelectorAll?.('[data-admin-write-modal="1"]').forEach(decorateBackdrop);
      }
    }
  });
  observer.observe(document.body, { childList:true, subtree:true });

  decorateExisting();
  window.addEventListener('pageshow', decorateExisting);
  window.__ROYAL_IOS_ADMIN_TOUCH_FIX_V061__ = VERSION;
})();
