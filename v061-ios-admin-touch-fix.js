/* Royal CRM Mini App v0.6.1 — iOS admin modal touch reliability v3
 * iOS Telegram WKWebView must keep native form-control activation. The v2
 * nested fixed scroller was reliable for buttons but could make text/select
 * controls require repeated taps. v3 uses one scrolling layer and leaves
 * input/select activation native; only action buttons keep the tap bridge.
 */
(() => {
  'use strict';
  if (String(window.__ROYAL_BUILD__ || '') !== '0.6.1') return;

  const VERSION = '0.6.1-ios-admin-touch.3';
  const ua = String(navigator.userAgent || '');
  const platform = String(navigator.platform || '');
  const isIOS = /iPad|iPhone|iPod/i.test(ua) || (platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1);
  if (!isIOS) return;

  try { delete window.__ROYAL_IOS_ADMIN_TOUCH_FIX_V061__; } catch (_) {}

  const MODAL = '[data-admin-write-modal="1"]';
  const BUTTON_SELECTOR = `${MODAL} button:not(:disabled)`;
  const CONTROL_SELECTOR = `${MODAL} input:not(:disabled),${MODAL} select:not(:disabled),${MODAL} textarea:not(:disabled)`;
  const TAP_SLOP_SQ = 225;
  const MAX_TAP_MS = 1100;
  let buttonTouch = null;
  let controlTouch = null;
  let syntheticTarget = null;
  let syntheticUntil = 0;

  const now = () => Date.now();
  const point = touch => ({ x:Number(touch?.clientX || 0), y:Number(touch?.clientY || 0) });

  function modalButton(target) {
    const button = target?.closest?.(BUTTON_SELECTOR) || null;
    if (!button || !button.isConnected || button.disabled) return null;
    if (button.closest?.('.royal-admin-photo-picker')) return null;
    return button;
  }

  function modalControl(target) {
    const control = target?.closest?.(CONTROL_SELECTOR) || null;
    if (!control || !control.isConnected || control.disabled) return null;
    return control;
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

  function decorateBackdrop(backdrop) {
    if (!backdrop) return;
    backdrop.dataset.v061IosTouch = VERSION;
    backdrop.classList.remove('v061-ios-admin-touch','v061-ios-admin-touch-v2');
    backdrop.classList.add('v061-ios-admin-touch-v3');
  }

  function decorateExisting() {
    document.querySelectorAll(MODAL).forEach(decorateBackdrop);
  }

  const style = document.createElement('style');
  style.dataset.v061IosAdminTouchV3 = '1';
  style.textContent = `
    ${MODAL}.v061-ios-admin-touch-v3{
      position:fixed!important;
      inset:0!important;
      z-index:99999!important;
      display:block!important;
      overflow-x:hidden!important;
      overflow-y:auto!important;
      -webkit-overflow-scrolling:auto!important;
      overscroll-behavior-y:contain!important;
      touch-action:pan-y!important;
      padding:0!important;
      background:rgba(3,8,12,.88)!important;
      -webkit-backdrop-filter:none!important;
      backdrop-filter:none!important;
    }
    ${MODAL}.v061-ios-admin-touch-v3 .royal-admin-modal{
      position:relative!important;
      inset:auto!important;
      width:100%!important;
      height:auto!important;
      min-height:100dvh!important;
      max-height:none!important;
      margin:0!important;
      overflow:visible!important;
      transform:none!important;
      -webkit-transform:none!important;
      will-change:auto!important;
      border-radius:0!important;
      padding-top:max(18px,env(safe-area-inset-top))!important;
      padding-bottom:calc(28px + env(safe-area-inset-bottom))!important;
    }
    ${MODAL}.v061-ios-admin-touch-v3 .royal-admin-form-actions{
      position:static!important;
      inset:auto!important;
      transform:none!important;
      -webkit-transform:none!important;
      pointer-events:auto!important;
      background:#101b24!important;
      padding:12px 0 0!important;
    }
    ${MODAL}.v061-ios-admin-touch-v3 .royal-admin-form,
    ${MODAL}.v061-ios-admin-touch-v3 .royal-admin-form-grid,
    ${MODAL}.v061-ios-admin-touch-v3 .royal-admin-slot-editor,
    ${MODAL}.v061-ios-admin-touch-v3 label,
    ${MODAL}.v061-ios-admin-touch-v3 button,
    ${MODAL}.v061-ios-admin-touch-v3 input,
    ${MODAL}.v061-ios-admin-touch-v3 select,
    ${MODAL}.v061-ios-admin-touch-v3 textarea{
      pointer-events:auto!important;
    }
    ${MODAL}.v061-ios-admin-touch-v3 .royal-admin-input>span{
      pointer-events:none!important;
    }
    ${MODAL}.v061-ios-admin-touch-v3 button{
      touch-action:manipulation!important;
      -webkit-tap-highlight-color:rgba(98,176,235,.18)!important;
      cursor:pointer!important;
    }
    ${MODAL}.v061-ios-admin-touch-v3 input,
    ${MODAL}.v061-ios-admin-touch-v3 select,
    ${MODAL}.v061-ios-admin-touch-v3 textarea{
      position:relative!important;
      z-index:1!important;
      touch-action:manipulation!important;
      font-size:16px!important;
      -webkit-user-select:text!important;
      user-select:text!important;
    }
    ${MODAL}.v061-ios-admin-touch-v3 select{
      -webkit-appearance:menulist!important;
      appearance:auto!important;
    }
  `;
  document.head.appendChild(style);

  // Use Touch Events on iOS even when PointerEvent exists. Native WKWebView
  // control activation is touch-driven; do not preventDefault for form controls.
  window.addEventListener('touchstart', event => {
    if (event.touches?.length !== 1) {
      buttonTouch = null;
      controlTouch = null;
      return;
    }
    const t = event.touches[0];
    const p = point(t);
    const button = modalButton(event.target);
    const control = button ? null : modalControl(event.target);
    buttonTouch = button ? { target:button, id:t.identifier, x:p.x, y:p.y, at:now(), moved:false } : null;
    controlTouch = control ? { target:control, id:t.identifier, x:p.x, y:p.y, at:now(), moved:false } : null;
  }, { capture:true, passive:true });

  window.addEventListener('touchmove', event => {
    for (const saved of [buttonTouch, controlTouch]) {
      if (!saved) continue;
      const t = Array.from(event.touches || []).find(item => item.identifier === saved.id);
      if (!t) continue;
      const p = point(t);
      const dx = p.x - saved.x;
      const dy = p.y - saved.y;
      if ((dx*dx + dy*dy) > TAP_SLOP_SQ) saved.moved = true;
    }
  }, { capture:true, passive:true });

  window.addEventListener('touchend', event => {
    const savedButton = buttonTouch;
    const savedControl = controlTouch;
    buttonTouch = null;
    controlTouch = null;

    if (savedButton && !savedButton.moved && now()-savedButton.at <= MAX_TAP_MS) {
      const t = Array.from(event.changedTouches || []).find(item => item.identifier === savedButton.id);
      if (t) {
        const p = point(t);
        const dx = p.x - savedButton.x;
        const dy = p.y - savedButton.y;
        if ((dx*dx + dy*dy) <= TAP_SLOP_SQ && savedButton.target?.isConnected && !savedButton.target.disabled) {
          event.preventDefault();
          event.stopImmediatePropagation();
          dispatchButton(savedButton.target);
          return;
        }
      }
    }

    // Do not cancel the native click/picker/keyboard. focus() is only a repair
    // for the WKWebView cases where the control otherwise stays unfocused.
    if (savedControl && !savedControl.moved && now()-savedControl.at <= MAX_TAP_MS) {
      const t = Array.from(event.changedTouches || []).find(item => item.identifier === savedControl.id);
      if (!t || !savedControl.target?.isConnected || savedControl.target.disabled) return;
      const p = point(t);
      const dx = p.x - savedControl.x;
      const dy = p.y - savedControl.y;
      if ((dx*dx + dy*dy) > TAP_SLOP_SQ) return;
      try {
        savedControl.target.focus({ preventScroll:true });
      } catch (_) {
        try { savedControl.target.focus(); } catch (_) {}
      }
    }
  }, { capture:true, passive:false });

  window.addEventListener('touchcancel', () => {
    buttonTouch = null;
    controlTouch = null;
  }, true);

  // Consume only the delayed trusted duplicate click caused by our synthetic
  // button dispatch. Native input/select clicks are never touched here.
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
        if (node.matches?.(MODAL)) decorateBackdrop(node);
        node.querySelectorAll?.(MODAL).forEach(decorateBackdrop);
      }
    }
  });
  observer.observe(document.body, { childList:true, subtree:true });

  window.addEventListener('pageshow', decorateExisting);
  decorateExisting();
  window.__ROYAL_IOS_ADMIN_TOUCH_FIX_V061__ = VERSION;
})();
