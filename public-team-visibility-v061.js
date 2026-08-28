/* Royal CRM Mini App v0.6.1 — public team visibility policy
 * Public runtime must never expose teams whose live team status is "Неактивен".
 * Admin mode keeps using the private admin snapshot and therefore still shows
 * inactive teams for maintenance/history.
 */
(() => {
  'use strict';
  if (String(window.__ROYAL_BUILD__ || '') !== '0.6.1') return;
  if (window.__ROYAL_PUBLIC_TEAM_VISIBILITY_V061__) return;

  const VERSION = '0.6.1-public-team-visibility.1';
  const INACTIVE = 'неактивен';

  function statusOf(team) {
    return String(team?.status || '').trim().toLocaleLowerCase('ru-RU');
  }

  function isPublicTeam(team) {
    return statusOf(team) !== INACTIVE;
  }

  function applyPublicTeamPolicy() {
    let snapshot;
    try { snapshot = snapshotState; }
    catch (_) { return false; }
    if (!snapshot || !Array.isArray(snapshot.teams)) return false;

    const all = snapshot.teams;
    const visible = all.filter(isPublicTeam);
    const hidden = all.length - visible.length;

    if (hidden > 0) snapshot.teams = visible;
    if (snapshot.stats && typeof snapshot.stats === 'object') {
      snapshot.stats = { ...snapshot.stats, teams: visible.length };
    }

    window.__ROYAL_PUBLIC_TEAM_VISIBILITY_STATE__ = {
      version: VERSION,
      visible: visible.length,
      hiddenInactive: hidden
    };
    return hidden > 0;
  }

  window.addEventListener('royal:snapshot-ready', () => {
    applyPublicTeamPolicy();
  });

  // Covers an already-resolved snapshot during warm-cache/page restore races.
  [0, 120, 600].forEach(delay => window.setTimeout(applyPublicTeamPolicy, delay));

  window.RoyalPublicTeamVisibilityV061 = {
    version: VERSION,
    refresh: applyPublicTeamPolicy,
    isPublicTeam
  };
  window.__ROYAL_PUBLIC_TEAM_VISIBILITY_V061__ = VERSION;
})();
