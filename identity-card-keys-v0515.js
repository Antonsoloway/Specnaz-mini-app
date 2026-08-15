/* Royal CRM Mini App — identity card keys v0.5.15 */
(() => {
  function withParticipantKey(html, participant) {
    const key = String(participant?.participantKey || '').trim();
    if (!key || !html) return html;
    return String(html).replace(
      /<div class="person-avatar-wrap([^\"]*)"/,
      `<div class="person-avatar-wrap$1" data-participant-key="${esc(key)}"`
    );
  }

  if (typeof participantCard === 'function') {
    const nativeParticipantCard = participantCard;
    participantCard = function participantCardV0515(participant) {
      return withParticipantKey(nativeParticipantCard(participant), participant);
    };
  }

  if (typeof teamMemberCard === 'function') {
    const nativeTeamMemberCard = teamMemberCard;
    teamMemberCard = function teamMemberCardV0515(participant, teamRef) {
      return withParticipantKey(nativeTeamMemberCard(participant, teamRef), participant);
    };
  }

  window.__ROYAL_IDENTITY_CARD_KEYS_VERSION__ = '0.5.15';
})();