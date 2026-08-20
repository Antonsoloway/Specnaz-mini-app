/* Royal CRM Mini App — v0.6 admin navigation guard
 * Keeps navigation inside admin mode. Any participant/team transition originating
 * from admin UI is routed to the private admin detail instead of ordinary/public UI.
 */
(() => {
  const VERSION = '0.6.0-admin-navigation-guard.1';

  const clean = value => String(value == null ? '' : value).trim();
  function id(value) {
    const match = clean(value).replace(/\.0$/, '').match(/\d{5,20}/);
    return match ? match[0] : '';
  }
  function canonicalGame(value) {
    const raw = clean(value);
    const low = raw.toLocaleLowerCase('ru-RU');
    if (low === 'рм' || low.includes('royal match')) return 'Royal Match';
    if (low === 'рк' || low.includes('royal kingdom')) return 'Royal Kingdom';
    return raw;
  }
  function blockOrdinary(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  function openAdminTeam(name, game, event) {
    const teamName = clean(name);
    const teamGame = canonicalGame(game);
    if (!teamName || !teamGame || !window.RoyalAdminTeamDetailV0600?.open) return false;
    blockOrdinary(event);
    window.RoyalAdminTeamDetailV0600.open(teamName, teamGame);
    return true;
  }
  function openAdminParticipant(telegramId, event) {
    const pid = id(telegramId);
    if (!pid || !window.RoyalAdminParticipantDetailV0600?.open) return false;
    blockOrdinary(event);
    window.RoyalAdminParticipantDetailV0600.open(pid);
    return true;
  }

  function installStyle() {
    if (document.querySelector('style[data-admin-navigation-guard-v0600="1"]')) return;
    const style = document.createElement('style');
    style.dataset.adminNavigationGuardV0600 = '1';
    style.textContent = `
      .royal-admin-participant-list-membership{cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:rgba(84,169,235,.14)}
      .royal-admin-participant-list-membership>*{pointer-events:none!important}
      .royal-admin-team-detail-shell .team-member[data-telegram-id]{cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:rgba(84,169,235,.14)}
      .royal-admin-team-detail-shell .team-member[data-telegram-id] .person-avatar-wrap,
      .royal-admin-team-detail-shell .team-member[data-telegram-id] .person-avatar-wrap *{pointer-events:none!important}
    `;
    document.head.appendChild(style);
  }

  document.addEventListener('click', event => {
    const teamTarget = event.target?.closest?.('[data-admin-route-team="1"],[data-admin-participant-team="1"]');
    if (teamTarget) {
      if (openAdminTeam(teamTarget.dataset.teamName, teamTarget.dataset.teamGame, event)) return;
    }

    const rankingParticipant = event.target?.closest?.('[data-admin-ranking-participant="1"]');
    if (rankingParticipant && openAdminParticipant(rankingParticipant.dataset.telegramId, event)) return;

    const rankingTeam = event.target?.closest?.('[data-admin-ranking-team="1"]');
    if (rankingTeam && openAdminTeam(rankingTeam.dataset.teamName, rankingTeam.dataset.teamGame, event)) return;

    const member = event.target?.closest?.('.royal-admin-team-detail-shell .team-member[data-telegram-id]');
    if (member) {
      if (event.target?.closest?.('[data-user-menu],button,a,input,select,textarea')) return;
      if (openAdminParticipant(member.dataset.telegramId, event)) return;
    }

    const participantSummary = event.target?.closest?.('[data-admin-participant="1"] > summary');
    if (participantSummary) {
      if (event.target?.closest?.('button,a,input,select,textarea')) return;
      const record = participantSummary.closest('[data-admin-participant="1"]');
      if (openAdminParticipant(record?.dataset?.adminParticipantId, event)) return;
    }

    const teamSummary = event.target?.closest?.('[data-admin-team="1"] > summary');
    if (teamSummary) {
      if (event.target?.closest?.('button,a,input,select,textarea')) return;
      const record = teamSummary.closest('[data-admin-team="1"]');
      const name = clean(record?.dataset?.adminTeamName || record?.querySelector('.royal-admin-summary-main strong')?.textContent);
      const game = canonicalGame(record?.dataset?.adminTeamFullGame || record?.querySelector('.royal-admin-summary-main small')?.textContent);
      openAdminTeam(name, game, event);
    }
  }, true);

  installStyle();
  window.RoyalAdminNavigationGuardV0600 = { version:VERSION };
})();
