/* Royal CRM Mini App — Telegram ID card binding v0.5.18 */
(() => {
  function cleanId(value) {
    const id = String(value || '').trim();
    return /^\d+$/.test(id) ? id : '';
  }

  function bindIdentity(html, participant) {
    const id = cleanId(participant?.telegramId);
    if (!id || !html) return html;
    let out = String(html);

    out = out.replace(
      /<div class="person-avatar-wrap([^\"]*)"/,
      `<div class="person-avatar-wrap$1" data-telegram-id="${id}" role="button" tabindex="0"`
    );

    out = out.replace(
      /<article class="person-card"/,
      `<article class="person-card" data-participant-telegram-id="${id}"`
    );

    out = out.replace(
      /<article class="team-member"/,
      `<article class="team-member" data-participant-telegram-id="${id}"`
    );

    return out;
  }

  if (typeof participantCard === 'function') {
    const nativeParticipantCard = participantCard;
    participantCard = function(participant) {
      return bindIdentity(nativeParticipantCard(participant), participant);
    };
  }

  if (typeof teamMemberCard === 'function') {
    const nativeTeamMemberCard = teamMemberCard;
    teamMemberCard = function(participant, teamRef) {
      return bindIdentity(nativeTeamMemberCard(participant, teamRef), participant);
    };
  }

  window.__ROYAL_IDENTITY_MODE__ = 'telegramId-only-v0518';
})();
