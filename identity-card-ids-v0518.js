/* Royal CRM Mini App — Telegram ID card binding v0.5.18.1 / v0.6.1 avatar fallback */
(() => {
  function cleanId(value) {
    const id = String(value || '').trim();
    return /^\d+$/.test(id) ? id : '';
  }

  function ensureAvatarLoader(out) {
    if (!out || /<img\b[^>]*class="[^"]*person-avatar/.test(out)) return out;
    return out.replace(
      /(<div class="person-avatar-wrap[^"]*"[^>]*data-telegram-id="\d+"[^>]*>)([\s\S]*?)(<\/div>)/,
      '$1$2<img class="person-avatar" alt="" data-avatar-file="" data-avatar-live-fallback="1">$3'
    );
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

    // v0.6.1: even when snapshot.avatarFileId is empty, leave an <img> slot.
    // Persistent media loader can then call the authenticated Worker by telegramId
    // and resolve private cached/last-known/live Telegram avatar sources.
    out = ensureAvatarLoader(out);

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

  window.__ROYAL_IDENTITY_MODE__ = 'telegramId-avatar-fallback-v0518.1';
})();
