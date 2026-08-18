/* Royal CRM Mini App — contact by Telegram ID v0.5.59
 * Participants without @username get a "Связаться" action in the same identity slot.
 * Participant identity: raw Telegram ID only.
 */
(() => {
  const VERSION = '0.5.59';

  function cleanId(value) {
    const id = String(value == null ? '' : value).trim().replace(/\.0$/, '');
    return /^\d+$/.test(id) ? id : '';
  }

  function participantIdFromCard(card) {
    if (!card) return '';
    return cleanId(
      card.dataset?.participantTelegramId ||
      card.dataset?.directoryTelegramId ||
      card.dataset?.profileTelegramId ||
      card.querySelector?.('[data-telegram-id]')?.dataset?.telegramId
    );
  }

  function contactButtonHtml(id, compact = false) {
    const clean = cleanId(id);
    if (!clean) return '';
    return `<button type="button" class="username-link contact-by-id-v0559${compact ? ' compact' : ''}" data-contact-telegram-id="${clean}" aria-label="Связаться с участником">Связаться</button>`;
  }

  function hasUsernameAction(root) {
    return !!root?.querySelector?.('[data-user-menu]');
  }

  function hasContactAction(root) {
    return !!root?.querySelector?.('[data-contact-telegram-id]');
  }

  function insertBeforeFirst(parent, button, selectors) {
    if (!parent || !button) return;
    for (const selector of selectors) {
      const node = parent.querySelector(`:scope > ${selector}`);
      if (node) {
        parent.insertBefore(button, node);
        return;
      }
    }
    parent.appendChild(button);
  }

  function makeButton(id, compact = false) {
    const clean = cleanId(id);
    if (!clean) return null;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `username-link contact-by-id-v0559${compact ? ' compact' : ''}`;
    button.dataset.contactTelegramId = clean;
    button.textContent = 'Связаться';
    button.setAttribute('aria-label', 'Связаться с участником');
    return button;
  }

  function decoratePersonCard(card) {
    if (!card || hasUsernameAction(card) || hasContactAction(card)) return;
    const id = participantIdFromCard(card);
    if (!id) return;
    const main = card.querySelector('.person-main');
    if (!main) return;
    insertBeforeFirst(main, makeButton(id, false), ['.telegram-name', '.membership-list']);
  }

  function decorateTeamMember(card) {
    if (!card || hasUsernameAction(card) || hasContactAction(card)) return;
    const id = participantIdFromCard(card);
    if (!id) return;
    const main = card.querySelector('.team-member-main');
    if (!main) return;
    insertBeforeFirst(main, makeButton(id, true), ['.telegram-name', '.team-member-role', '.membership-list']);
  }

  function decorateDirectoryCard(card) {
    if (!card || card.classList.contains('directory-person-card--external') || hasUsernameAction(card) || hasContactAction(card)) return;
    const id = participantIdFromCard(card);
    if (!id) return;
    const main = card.querySelector('.directory-person-main,.directory-person-body,.directory-person-head') || card;
    insertBeforeFirst(main, makeButton(id, true), ['.telegram-name', '.directory-person-meta', '.membership-list']);
  }

  function decorateHeroCard(card) {
    if (!card || hasUsernameAction(card) || hasContactAction(card)) return;
    const id = participantIdFromCard(card);
    if (!id) return;
    const main = card.querySelector('.hero-main');
    if (!main) return;
    insertBeforeFirst(main, makeButton(id, true), ['.hero-meta', '.membership-list']);
  }

  function decorateParticipantDetail() {
    const card = document.querySelector('.participant-detail-card');
    if (!card || hasUsernameAction(card) || hasContactAction(card)) return;
    const identity = card.querySelector('.participant-detail-identity');
    const id = cleanId(card.querySelector('[data-telegram-id]')?.dataset?.telegramId);
    if (!identity || !id) return;
    identity.appendChild(makeButton(id, false));
  }

  function decorateVisible() {
    document.querySelectorAll('.person-card').forEach(decoratePersonCard);
    document.querySelectorAll('.team-member').forEach(decorateTeamMember);
    document.querySelectorAll('.directory-person-card').forEach(decorateDirectoryCard);
    document.querySelectorAll('.hero-card').forEach(decorateHeroCard);
    decorateParticipantDetail();
  }

  function schedule(delay = 0) {
    window.setTimeout(decorateVisible, delay);
  }

  function openTelegramProfileById(value) {
    const id = cleanId(value);
    if (!id) return false;
    const url = `tg://user?id=${encodeURIComponent(id)}`;
    try {
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.('light');
    } catch (_) {}

    // Keep this inside the real user gesture. Telegram Android WebView hands
    // tg://user?id=... back to the Telegram client. Do not send it through
    // WebApp.openTelegramLink(), which is for https://t.me links.
    try {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.style.position = 'fixed';
      anchor.style.left = '-10000px';
      anchor.style.top = '-10000px';
      anchor.setAttribute('aria-hidden', 'true');
      document.body.appendChild(anchor);
      anchor.click();
      window.setTimeout(() => anchor.remove(), 250);
      return true;
    } catch (_) {
      try {
        window.location.href = url;
        return true;
      } catch (_) {
        return false;
      }
    }
  }

  document.addEventListener('click', event => {
    const button = event.target?.closest?.('[data-contact-telegram-id]');
    if (!button) return;
    const id = cleanId(button.dataset.contactTelegramId);
    if (!id) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openTelegramProfileById(id);
  }, true);

  if (typeof renderPage === 'function') {
    const nativeRenderPage = renderPage;
    renderPage = function(page) {
      const result = nativeRenderPage(page);
      schedule(0);
      return result;
    };
  }

  const nativeOpenParticipant = window.RoyalOpenParticipantByTelegramId;
  if (typeof nativeOpenParticipant === 'function') {
    window.RoyalOpenParticipantByTelegramId = function(telegramId) {
      const result = nativeOpenParticipant(telegramId);
      if (result) schedule(0);
      return result;
    };
  }

  document.addEventListener('input', () => schedule(0), true);
  document.addEventListener('pointerup', () => schedule(0), true);

  decorateVisible();
  schedule(80);

  window.RoyalContactByTelegramId = {
    version: VERSION,
    decorate: decorateVisible,
    open: openTelegramProfileById,
    buttonHtml: contactButtonHtml
  };
  window.__ROYAL_CONTACT_BY_ID_VERSION__ = VERSION;
})();