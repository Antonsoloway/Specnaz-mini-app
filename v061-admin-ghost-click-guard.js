/* Royal CRM Mini App v0.6.1 — consume trailing Android click after admin pointerup navigation */
(() => {
  'use strict';
  if (String(window.__ROYAL_BUILD__ || '') !== '0.6.1') return;
  if (window.__ROYAL_ADMIN_GHOST_CLICK_GUARD_V061__) return;

  const VERSION = '0.6.1-admin-ghost-click.1';
  const ADMIN_SURFACE = [
    '.royal-admin-screen',
    '.royal-admin-participant-detail',
    '.royal-admin-team-detail-shell',
    '.royal-admin-participant-ranking-shell',
    '.royal-admin-team-ranking-shell',
    '[data-admin-participant="1"]',
    '[data-admin-team="1"]'
  ].join(',');
  const FORWARD_TARGET = [
    '[data-admin-participant-team="1"]',
    '[data-admin-route-team="1"]',
    '[data-admin-ranking-team="1"]',
    '.royal-admin-participant-detail .participant-profile-membership',
    '[data-admin-ranking-participant="1"]',
    '.royal-admin-team-detail-shell .team-member[data-telegram-id]',
    '[data-admin-participant="1"] > summary',
    '[data-admin-team="1"] > summary'
  ].join(',');
  const TAP_SLOP_SQ = 196;
  const SHIELD_RADIUS_SQ = 2304;
  const MAX_PRESS_MS = 900;
  const SHIELD_MS = 950;
  const UNCONDITIONAL_CLICK_MS = 180;

  let press = null;
  let shield = null;

  function adminVisible(target) {
    return !!target?.closest?.(ADMIN_SURFACE) || !!document.querySelector(ADMIN_SURFACE);
  }

  function forwardTarget(target) {
    return target?.closest?.(FORWARD_TARGET) || null;
  }

  function routeReady(target) {
    const node = forwardTarget(target);
    if (!node) return false;
    if (node.matches?.('[data-admin-participant-team="1"],[data-admin-route-team="1"],[data-admin-ranking-team="1"],.participant-profile-membership,[data-admin-team="1"] > summary')) {
      return typeof window.RoyalAdminTeamDetailV0600?.open === 'function';
    }
    return typeof window.RoyalAdminParticipantDetailV0600?.open === 'function';
  }

  function arm(event) {
    shield = {
      armedAt: Date.now(),
      until: Date.now() + SHIELD_MS,
      x: Number(event?.clientX || 0),
      y: Number(event?.clientY || 0)
    };
  }

  function consumeGhostClick(event) {
    const saved = shield;
    if (!saved) return false;
    const now = Date.now();
    if (now >= saved.until) {
      shield = null;
      return false;
    }
    if (!adminVisible(event?.target)) return false;

    const age = now - saved.armedAt;
    const x = Number(event?.clientX || 0);
    const y = Number(event?.clientY || 0);
    const dx = x - saved.x;
    const dy = y - saved.y;
    const samePhysicalTap = (dx * dx + dy * dy) <= SHIELD_RADIUS_SQ;
    const missingCoordinates = x === 0 && y === 0;

    if (age <= UNCONDITIONAL_CLICK_MS || samePhysicalTap || missingCoordinates) {
      shield = null;
      event.preventDefault();
      event.stopImmediatePropagation();
      return true;
    }
    return false;
  }

  // This module is intentionally loaded before v061-admin-context-integrity.js.
  // It observes the same physical gesture first, but leaves pointerup routing to
  // the existing admin router. Only the synthetic click generated afterwards is consumed.
  window.addEventListener('pointerdown', event => {
    shield = null;
    if (!adminVisible(event.target) || !forwardTarget(event.target)) {
      press = null;
      return;
    }
    press = {
      pointerId: event.pointerId,
      target: event.target,
      x: Number(event.clientX || 0),
      y: Number(event.clientY || 0),
      at: Date.now(),
      moved: false
    };
  }, true);

  window.addEventListener('pointermove', event => {
    const saved = press;
    if (!saved || saved.pointerId !== event.pointerId) return;
    const dx = Number(event.clientX || 0) - saved.x;
    const dy = Number(event.clientY || 0) - saved.y;
    if ((dx * dx + dy * dy) > TAP_SLOP_SQ) saved.moved = true;
  }, { capture:true, passive:true });

  window.addEventListener('pointerup', event => {
    const saved = press;
    press = null;
    if (!saved || saved.pointerId !== event.pointerId || saved.moved) return;
    const dx = Number(event.clientX || 0) - saved.x;
    const dy = Number(event.clientY || 0) - saved.y;
    if ((dx * dx + dy * dy) > TAP_SLOP_SQ || Date.now() - saved.at > MAX_PRESS_MS) return;
    if (routeReady(event.target) || routeReady(saved.target)) arm(event);
  }, true);

  window.addEventListener('pointercancel', () => { press = null; }, true);
  window.addEventListener('click', event => { consumeGhostClick(event); }, true);

  window.__ROYAL_ADMIN_GHOST_CLICK_GUARD_V061__ = {
    version: VERSION,
    armed: () => !!shield
  };
})();
