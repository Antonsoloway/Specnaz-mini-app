/* Royal CRM Mini App v0.6.1 — profile team navigation */
(() => {
  function openTeam(team, game) {
    if (!team) return false;
    const api = window.RoyalTeamDetail || window.RoyalOpenTeam || window.RoyalAdminTeamDetailV0600;
    try {
      if (window.RoyalAdminTeamDetailV0600?.open && game) {
        window.RoyalAdminTeamDetailV0600.open(team, game);
        return true;
      }
      if (window.RoyalTeamDetail?.open) {
        window.RoyalTeamDetail.open(team, game || '');
        return true;
      }
    } catch (_) {}
    return !!api;
  }

  document.addEventListener('click', event => {
    const card = event.target?.closest?.('.participant-profile-membership');
    if (!card) return;
    const team = card.querySelector('b')?.textContent?.trim();
    const game = card.querySelector('small')?.textContent?.split('·').pop()?.trim() || '';
    if (!team) return;
    if (openTeam(team, game)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  window.__ROYAL_PROFILE_TEAM_LINK_V061__ = true;
})();
