/* Royal CRM Mini App — participant card UX v0.5.31
 * Identity: raw Telegram ID only.
 * UX: the card is the primary profile action; rank/team/@nick stay independent actions.
 * No global MutationObserver.
 */
(() => {
  const VERSION = '0.5.31';

  function cleanId(value) {
    const id = String(value == null ? '' : value).trim().replace(/\.0$/, '');
    return /^\d+$/.test(id) ? id : '';
  }

  function openParticipant(id) {
    const telegramId = cleanId(id);
    if (!telegramId || typeof window.RoyalOpenParticipantByTelegramId !== 'function') return false;
    return !!window.RoyalOpenParticipantByTelegramId(telegramId);
  }

  function profileIdFromCard(card) {
    if (!card) return '';
    return cleanId(
      card.dataset?.participantTelegramId ||
      card.dataset?.directoryTelegramId ||
      card.dataset?.profileTelegramId ||
      card.querySelector?.('[data-telegram-id]')?.dataset?.telegramId
    );
  }

  function futureSlot() {
    const slot = document.createElement('span');
    slot.className = 'participant-achievements-future-slot';
    slot.setAttribute('aria-hidden', 'true');
    return slot;
  }

  function ensureAchievementsRow(nameNode, rankNode) {
    if (!nameNode || !rankNode) return;
    const parent = nameNode.parentElement;
    if (!parent) return;

    let row = nameNode.closest('.participant-name-achievements-row');
    if (!row) {
      row = document.createElement('div');
      row.className = 'participant-name-achievements-row';
      parent.insertBefore(row, nameNode);
      row.appendChild(nameNode);
    }

    let achievements = row.querySelector('.participant-achievements-row');
    if (!achievements) {
      achievements = document.createElement('span');
      achievements.className = 'participant-achievements-row';
      row.appendChild(achievements);
    }

    if (rankNode.parentElement !== achievements) achievements.appendChild(rankNode);
    if (!achievements.querySelector('.participant-achievements-future-slot')) achievements.appendChild(futureSlot());
  }

  function decoratePersonCard(card) {
    if (!card) return;
    const id = profileIdFromCard(card);
    if (id) {
      card.dataset.profileTelegramId = id;
      card.dataset.profileCard = '1';
      card.setAttribute('role', 'button');
      if (!card.hasAttribute('tabindex')) card.tabIndex = 0;
      card.setAttribute('aria-label', `Открыть профиль ${card.querySelector('.person-title')?.textContent?.trim() || 'участника'}`);
    }
    const title = card.querySelector('.person-title');
    const rankSlot = card.querySelector('.rank-list-slot');
    if (title && rankSlot) ensureAchievementsRow(title, rankSlot);
  }

  function decorateTeamMember(card) {
    if (!card) return;
    const id = profileIdFromCard(card);
    if (id) {
      card.dataset.profileTelegramId = id;
      card.dataset.profileCard = '1';
      card.setAttribute('role', 'button');
      if (!card.hasAttribute('tabindex')) card.tabIndex = 0;
    }
    const main = card.querySelector('.team-member-main');
    const name = main?.querySelector(':scope > strong');
    const rankSlot = main?.querySelector(':scope > .rank-list-slot');
    if (name && rankSlot) ensureAchievementsRow(name, rankSlot);
  }

  function decorateDirectoryCard(card) {
    if (!card || card.classList.contains('directory-person-card--external')) return;
    const id = profileIdFromCard(card);
    if (id) {
      card.dataset.profileTelegramId = id;
      card.dataset.profileCard = '1';
      card.setAttribute('role', 'button');
      if (!card.hasAttribute('tabindex')) card.tabIndex = 0;
    }
    const head = card.querySelector('.directory-person-head');
    const name = head?.querySelector(':scope > strong');
    const rank = head?.querySelector(':scope > .rank-badge--compact');
    if (name && rank) ensureAchievementsRow(name, rank);
  }

  function decorateHeroCard(card) {
    if (!card) return;
    const id = profileIdFromCard(card);
    if (id) {
      card.dataset.profileTelegramId = id;
      card.dataset.profileCard = '1';
      card.setAttribute('role', 'button');
      if (!card.hasAttribute('tabindex')) card.tabIndex = 0;
    }
    const main = card.querySelector('.hero-main');
    const name = main?.querySelector(':scope > strong');
    const rank = main?.querySelector(':scope > .hero-rank');
    if (name && rank) ensureAchievementsRow(name, rank);
  }

  function decorateDetailProfile() {
    const card = document.querySelector('.participant-detail-card');
    if (!card) return;
    card.querySelectorAll('.participant-rank-inline').forEach(node => node.remove());
    const identity = card.querySelector('.participant-detail-identity');
    const name = identity?.querySelector(':scope > h2');
    if (name && !identity.querySelector('.participant-detail-future-achievements')) {
      const row = document.createElement('div');
      row.className = 'participant-detail-name-row';
      identity.insertBefore(row, name);
      row.appendChild(name);
      const future = document.createElement('span');
      future.className = 'participant-detail-future-achievements';
      future.setAttribute('aria-label', 'Место для будущих ачивок');
      row.appendChild(future);
    }
  }

  function decorateVisibleCards() {
    document.querySelectorAll('.person-card').forEach(decoratePersonCard);
    document.querySelectorAll('.team-member').forEach(decorateTeamMember);
    document.querySelectorAll('.directory-person-card').forEach(decorateDirectoryCard);
    document.querySelectorAll('.hero-card').forEach(decorateHeroCard);
    decorateDetailProfile();
  }

  function scheduleDecorate(delay = 0) {
    window.setTimeout(decorateVisibleCards, delay);
  }

  function isIndependentAction(target) {
    return !!target?.closest?.([
      '.rank-badge--compact',
      '.rank-premium-name',
      '.username-link',
      '.hero-user',
      '.membership-pill',
      '.participant-profile-team-link',
      '.team-link',
      '[data-team]',
      '[data-user-menu]',
      '[data-participant-history-link]',
      '[data-history-link17]',
      'a',
      'button',
      'input',
      'textarea',
      'select',
      'summary'
    ].join(','));
  }

  function cardFromTarget(target) {
    return target?.closest?.('.person-card[data-profile-card="1"],.team-member[data-profile-card="1"],.directory-person-card[data-profile-card="1"],.hero-card[data-profile-card="1"]') || null;
  }

  document.addEventListener('click', event => {
    // Existing avatar pointer-up handler already opens the profile; avoid double navigation.
    if (event.target?.closest?.('.person-avatar-wrap,.hero-avatar')) {
      scheduleDecorate(0);
      return;
    }

    const card = cardFromTarget(event.target);
    if (card && !isIndependentAction(event.target)) {
      const id = profileIdFromCard(card);
      if (id) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openParticipant(id);
        scheduleDecorate(0);
        return;
      }
    }
    scheduleDecorate(0);
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card = cardFromTarget(event.target);
    if (!card || isIndependentAction(event.target)) return;
    const id = profileIdFromCard(card);
    if (!id) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openParticipant(id);
    scheduleDecorate(0);
  }, true);

  document.addEventListener('input', () => scheduleDecorate(0), true);
  document.addEventListener('pointerup', () => scheduleDecorate(0), true);

  if (typeof renderPage === 'function') {
    const nativeRenderPage = renderPage;
    renderPage = function(page) {
      const result = nativeRenderPage(page);
      scheduleDecorate(0);
      return result;
    };
  }

  const nativeOpenParticipant = window.RoyalOpenParticipantByTelegramId;
  if (typeof nativeOpenParticipant === 'function') {
    window.RoyalOpenParticipantByTelegramId = function(telegramId) {
      const result = nativeOpenParticipant(telegramId);
      if (result) scheduleDecorate(0);
      return result;
    };
  }

  decorateVisibleCards();
  scheduleDecorate(80);
  window.RoyalParticipantCardUX = { version: VERSION, decorate: decorateVisibleCards };
  window.__ROYAL_PARTICIPANT_CARD_UX_VERSION__ = VERSION;
})();
