/* Royal CRM Mini App v0.6.1 — public team visibility policy
 * Public runtime must never expose teams whose live team status is "Неактивен".
 * Admin mode keeps using the private admin snapshot and therefore still shows
 * inactive teams for maintenance/history.
 */
(() => {
  'use strict';
  if (window.__ROYAL_PUBLIC_TEAM_VISIBILITY_V061__) return;

  const VERSION = '0.6.13-public-team-visibility.2';
  const INACTIVE = 'неактивен';

  function statusOf(team) {
    return String(team?.status || '').trim().toLocaleLowerCase('ru-RU');
  }

  function isPublicTeam(team) {
    return statusOf(team) !== INACTIVE && Number(team?.memberCount || 0) > 0;
  }

  function applyPublicTeamPolicy() {
    let snapshot;
    try { snapshot = snapshotState; }
    catch (_) { return false; }
    if (!snapshot || !Array.isArray(snapshot.teams)) return false;

    // Use the same current roster counters as the visible team card.
    window.RoyalUX0539?.refreshTeamStats?.();

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

  // Apply synchronously before rendering too: warm snapshots and Back restores
  // must not briefly publish an inactive/empty directory row.
  if (typeof renderTeamsPage === 'function') {
    const native = renderTeamsPage;
    renderTeamsPage = function (...args) { applyPublicTeamPolicy(); return native(...args); };
  }

  // Covers an already-resolved snapshot during warm-cache/page restore races.
  [0, 120, 600].forEach(delay => window.setTimeout(applyPublicTeamPolicy, delay));

  window.RoyalPublicTeamVisibilityV061 = {
    version: VERSION,
    refresh: applyPublicTeamPolicy,
    isPublicTeam
  };
  window.__ROYAL_PUBLIC_TEAM_VISIBILITY_V061__ = VERSION;
})();
