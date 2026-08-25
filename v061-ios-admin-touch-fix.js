/* Royal CRM Mini App v0.6.1 — iOS admin modal touch reliability v2 */
(() => {
  'use strict';
  if (String(window.__ROYAL_BUILD__ || '') !== '0.6.1') return;

  const VERSION = '0.6.1-ios-admin-touch.2';
  const ua = String(navigator.userAgent || '');
  const platform = String(navigator.platform || '');
  const isIOS = /iPad|iPhone|iPod/i.test(ua) || (platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1);
  if (!isIOS) return;

  try { delete window.__ROYAL_IOS_ADMIN_TOUCH_FIX_V061__; } catch (_) {}

  const BUTTON_SELECTOR = '[data-admin-write-modal="1"] button:not(:disabled)';
  let press = null;
  let syntheticTarget = null;
  let syntheticUntil = 0;

  const now = () => Date.now();
  const pointFromPointer = event => ({
    x: Number(event?.clientX || 0),
    y: Number(event?.clientY || 0)
  });

  function isModalButton(target) {
    const button = target?.closest?.(BUTTON_SELECTOR) || null;
    if (!button || !button.isConnected || button.disabled) return null;
    if (button.closest?.('.royal-admin-photo-picker')) return null;
    return button;
  }

  function viewportHeight() {
    const h = Number(window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight || 0);
    if (h > 200) document.documentElement.style.setProperty('--v061-ios-admin-vh', `${Math.round(h)}px`);
  }

  function decorateBackdrop(backdrop) {
    if (!backdrop) return;
    backdrop.dataset.v061IosTouch = VERSION;
    backdrop.classList.add('v061-ios-admin-touch-v2');
    viewportHeight();
  }

  function decorateExisting() {
    document.querySelectorAll('[data-admin-write-modal="1"]').forEach(decorateBackdrop);
  }

  function dispatchButton(button) {
    if (!button?.isConnected || button.disabled) return false;
    syntheticTarget = button;
    syntheticUntil = now() + 900;

    if (String(button.type || '').toLowerCase() === 'submit') {
      const form = button.form || button.closest('form');
      if (!form) return false;
      try {
        if (typeof form.requestSubmit === 'function') form.requestSubmit(button);
        else form.dispatchEvent(new Event('submit', { bubbles:true, cancelable:true }));
        return true;
      } catch (_) {
        try {
          form.dispatchEvent(new Event('submit', { bubbles:true, cancelable:true }));
          return true;
        } catch (_) { return false; }
      }
    }

    try {
      button.dispatchEvent(new MouseEvent('click', {
        bubbles:true,
        cancelable:true,
        view:window,
        button:0
      }));
      return true;
    } catch (_) {
      try { button.click(); return true; }
      catch (_) { return false; }
    }
  }

  const style = document.createElement('style');
  style.dataset.v061IosAdminTouchV2 = '1';
  style.textContent = `
    [data-admin-write-modal="1"].v061-ios-admin-touch-v2{
      position:fixed!important;
      inset:0!important;
      z-index:99999!important;
      display:block!important;
      overflow:hidden!important;
      -webkit-backdrop-filter:none!important;
      backdrop-filter:none!important;
      background:rgba(3,8,12,.88)!important;
      touch-action:pan-y!important;
      overscroll-behavior:none!important;
    }
    [data-admin-write-modal="1"].v061-ios-admin-touch-v2 .royal-admin-modal{
      position:absolute!important;
      left:0!important;
      right:0!important;
      top:0!important;
      bottom:auto!important;
      width:100%!important;
      height:var(--v061-ios-admin-vh,100vh)!important;
      max-height:var(--v061-ios-admin-vh,100vh)!important;
      min-height:0!important;
      margin:0!important;
      overflow-x:hidden!important;
      overflow-y:scroll!important;
      -webkit-overflow-scrolling:touch!important;
      overscroll-behavior-y:contain!important;
      touch-action:pan-y!important;
      transform:none!important;
      -webkit-transform:none!important;
      will-change:auto!important;
      border-radius:0!important;
      padding-top:max(18px,env(safe-area-inset-top))!important;
      padding-bottom:calc(28px + env(safe-area-inset-bottom))!important;
    }
    [data-admin-write-modal="1"].v061-ios-admin-touch-v2 .royal-admin-form-actions{
      position:static!important;
      inset:auto!important;
      transform:none!important;
      -webkit-transform:none!important;
      pointer-events:auto!important;
      background:#101b24!important;
      padding:12px 0 0!important;
    }
    [data-admin-write-modal="1"].v061-ios-admin-touch-v2 .royal-admin-form,
    [data-admin-write-modal="1"].v061-ios-admin-touch-v2 .royal-admin-slot-editor,
    [data-admin-write-modal="1"].v061-ios-admin-touch-v2 label,
    [data-admin-write-modal="1"].v061-ios-admin-touch-v2 button,
    [data-admin-write-modal="1"].v061-ios-admin-touch-v2 input,
    [data-admin-write-modal="1"].v061-ios-admin-touch-v2 select,
    [data-admin-write-modal="1"].v061-ios-admin-touch-v2 textarea{
      pointer-events:auto!important;
    }
    [data-admin-write-modal="1"].v061-ios-admin-touch-v2 button{
      touch-action:manipulation!important;
      -webkit-tap-highlight-color:rgba(98,176,235,.18)!important;
      cursor:pointer!important;
    }
    [data-admin-write-modal="1"].v061-ios-admin-touch-v2 input,
    [data-admin-write-modal="1"].v061-ios-admin-touch-v2 select,
    [data-admin-write-modal="1"].v061-ios-admin-touch-v2 textarea{
      touch-action:auto!important;
      font-size:16px!important;
      -webkit-user-select:text!important;
      user-select:text!important;
    }
    [data-admin-write-modal="1"].v061-ios-admin-touch-v2 select{
      -webkit-appearance:menulist!important;
      appearance:auto!important;
    }
  `;
  document.head.appendChild(style);

  window.addEventListener('pointerdown', event => {
    if (event.pointerType && event.pointerType !== 'touch') return;
    const button = isModalButton(event.target);
    if (!button) { press = null; return; }
    const p = pointFromPointer(event);
    press = {
      id:event.pointerId,
      button,
      x:p.x,
      y:p.y,
      at:now(),
      moved:false
    };
  }, true);

  window.addEventListener('pointermove', event => {
    if (!press || press.id !== event.pointerId) return;
    const p = pointFromPointer(event);
    const dx = p.x - press.x;
    const dy = p.y - press.y;
    if ((dx * dx + dy * dy) > 225) press.moved = true;
  }, { capture:true, passive:true });

  window.addEventListener('pointerup', event => {
    const saved = press;
    press = null;
    if (!saved || saved.id !== event.pointerId || saved.moved || now() - saved.at > 1100) return;
    const p = pointFromPointer(event);
    const dx = p.x - saved.x;
    const dy = p.y - saved.y;
    if ((dx * dx + dy * dy) > 225 || !saved.button?.isConnected || saved.button.disabled) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    dispatchButton(saved.button);
  }, true);

  window.addEventListener('pointercancel', () => { press = null; }, true);

  if (!window.PointerEvent) {
    let touch = null;
    window.addEventListener('touchstart', event => {
      const button = isModalButton(event.target);
      if (!button || event.touches?.length !== 1) { touch = null; return; }
      const p = event.touches[0];
      touch = { button, id:p.identifier, x:Number(p.clientX||0), y:Number(p.clientY||0), at:now(), moved:false };
    }, { capture:true, passive:true });
    window.addEventListener('touchmove', event => {
      if (!touch) return;
      const p = Array.from(event.touches || []).find(item => item.identifier === touch.id);
      if (!p) return;
      const dx = Number(p.clientX||0) - touch.x;
      const dy = Number(p.clientY||0) - touch.y;
      if ((dx*dx + dy*dy) > 225) touch.moved = true;
    }, { capture:true, passive:true });
    window.addEventListener('touchend', event => {
      const saved = touch; touch = null;
      if (!saved || saved.moved || now()-saved.at > 1100) return;
      const p = Array.from(event.changedTouches || []).find(item => item.identifier === saved.id);
      if (!p) return;
      const dx = Number(p.clientX||0) - saved.x;
      const dy = Number(p.clientY||0) - saved.y;
      if ((dx*dx + dy*dy) > 225) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      dispatchButton(saved.button);
    }, { capture:true, passive:false });
    window.addEventListener('touchcancel', () => { touch = null; }, true);
  }

  window.addEventListener('click', event => {
    if (!event.isTrusted || !syntheticTarget || now() >= syntheticUntil) return;
    const button = event.target?.closest?.(BUTTON_SELECTOR) || null;
    if (button !== syntheticTarget) return;
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

  viewportHeight();
  window.visualViewport?.addEventListener?.('resize', viewportHeight, { passive:true });
  window.visualViewport?.addEventListener?.('scroll', viewportHeight, { passive:true });
  window.addEventListener('orientationchange', () => setTimeout(viewportHeight, 120), { passive:true });
  window.addEventListener('pageshow', () => { viewportHeight(); decorateExisting(); });

  decorateExisting();
  window.__ROYAL_IOS_ADMIN_TOUCH_FIX_V061__ = VERSION;
})();
