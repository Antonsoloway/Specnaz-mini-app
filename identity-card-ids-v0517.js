/* Royal CRM Mini App — Telegram ID card binding v0.5.17 */
(() => {
  function withTelegramId(html, participant) {
    const id = String(participant?.telegramId || '').trim();
    if (!/^\d+$/.test(id) || !html) return html;
    return String(html).replace(
      /<div class="person-avatar-wrap([^\"]*)"/,
      `<div class="person-avatar-wrap$1" data-telegram-id="${esc(id)}"`
    );
  }

  if (typeof participantCard === 'function') {
    const nativeParticipantCard = participantCard;
    participantCard = function(participant) {
      return withTelegramId(nativeParticipantCard(participant), participant);
    };
  }

  if (typeof teamMemberCard === 'function') {
    const nativeTeamMemberCard = teamMemberCard;
    teamMemberCard = function(participant, teamRef) {
      return withTelegramId(nativeTeamMemberCard(participant, teamRef), participant);
    };
  }

  window.__ROYAL_IDENTITY_MODE__ = 'telegramId-only';
})();
