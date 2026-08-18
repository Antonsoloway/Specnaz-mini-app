/* Royal CRM Mini App — contact by Telegram ID v0.5.59
 * Participants without @username get a "Связаться" action.
 * Direct tg://user links from Mini App are intentionally NOT used: Telegram ID links
 * are delivered as inline buttons in bot messages.
 */
(() => {
  const VERSION = '0.5.59.2';
  const BOT_LINK = 'https://t.me/doveofpeace_bot';

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

  function hasUsernameAction(root) { return !!root?.querySelector?.('[data-user-menu]'); }
  function hasContactAction(root) { return !!root?.querySelector?.('[data-contact-telegram-id]'); }

  function insertBeforeFirst(parent, button, selectors) {
    if (!parent || !button) return;
    for (const selector of selectors) {
      const node = parent.querySelector(`:scope > ${selector}`);
      if (node) { parent.insertBefore(button, node); return; }
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
    const main = card.querySelector('.person-main');
    if (!id || !main) return;
    insertBeforeFirst(main, makeButton(id), ['.telegram-name', '.membership-list']);
  }

  function decorateTeamMember(card) {
    if (!card || hasUsernameAction(card) || hasContactAction(card)) return;
    const id = participantIdFromCard(card);
    const main = card.querySelector('.team-member-main');
    if (!id || !main) return;
    insertBeforeFirst(main, makeButton(id, true), ['.telegram-name', '.team-member-role', '.membership-list']);
  }

  function decorateDirectoryCard(card) {
    if (!card || card.classList.contains('directory-person-card--external') || hasUsernameAction(card) || hasContactAction(card)) return;
    const id = participantIdFromCard(card);
    const main = card.querySelector('.directory-person-main,.directory-person-body,.directory-person-head') || card;
    if (!id || !main) return;
    insertBeforeFirst(main, makeButton(id, true), ['.telegram-name', '.directory-person-meta', '.membership-list']);
  }

  function decorateHeroCard(card) {
    if (!card || hasUsernameAction(card) || hasContactAction(card)) return;
    const id = participantIdFromCard(card);
    const main = card.querySelector('.hero-main');
    if (!id || !main) return;
    insertBeforeFirst(main, makeButton(id, true), ['.hero-meta', '.membership-list']);
  }

  function decorateParticipantDetail() {
    const card = document.querySelector('.participant-detail-card');
    if (!card || hasUsernameAction(card) || hasContactAction(card)) return;
    const identity = card.querySelector('.participant-detail-identity');
    const id = cleanId(card.querySelector('[data-telegram-id]')?.dataset?.telegramId);
    if (!identity || !id) return;
    identity.appendChild(makeButton(id));
  }

  function decorateVisible() {
    document.querySelectorAll('.person-card').forEach(decoratePersonCard);
    document.querySelectorAll('.team-member').forEach(decorateTeamMember);
    document.querySelectorAll('.directory-person-card').forEach(decorateDirectoryCard);
    document.querySelectorAll('.hero-card').forEach(decorateHeroCard);
    decorateParticipantDetail();
  }

  function schedule(delay = 0) { window.setTimeout(decorateVisible, delay); }

  function showMessage(text) {
    const webapp = window.Telegram?.WebApp;
    try {
      if (webapp?.showAlert) { webapp.showAlert(String(text || '')); return; }
    } catch (_) {}
    try { window.alert(String(text || '')); } catch (_) {}
  }

  function openBotChat() {
    const webapp = window.Telegram?.WebApp;
    try {
      if (webapp?.openTelegramLink) { webapp.openTelegramLink(BOT_LINK); return true; }
    } catch (_) {}
    try { window.location.href = BOT_LINK; return true; } catch (_) { return false; }
  }

  function showContactReady(targetName) {
    const webapp = window.Telegram?.WebApp;
    const suffix = String(targetName || '').trim() ? ` для «${String(targetName).trim()}»` : '';
    const message = `Голубец отправил вам кнопку «Открыть профиль»${suffix}.`;

    try {
      if (webapp?.showPopup) {
        webapp.showPopup({
          title: 'Ссылка готова',
          message,
          buttons: [
            { id: 'open_bot', type: 'default', text: 'Открыть Голубя' },
            { id: 'cancel', type: 'cancel' }
          ]
        }, buttonId => {
          if (buttonId === 'open_bot') openBotChat();
        });
        return;
      }
    } catch (_) {}

    try {
      if (webapp?.showAlert) {
        webapp.showAlert(`${message}\n\nСейчас откроется чат с Голубем.`, () => openBotChat());
        return;
      }
    } catch (_) {}

    try { window.alert(message); } catch (_) {}
    openBotChat();
  }

  async function requestContactLink(id, button) {
    if (!id || !sessionToken) {
      showMessage('Сессия приложения ещё не готова. Попробуйте ещё раз.');
      return;
    }

    const oldText = button?.textContent || 'Связаться';
    if (button) { button.disabled = true; button.textContent = 'Отправляю…'; }
    try { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.('light'); } catch (_) {}

    try {
      const response = await fetch(`${API_URL}/contact-by-id`, {
        method: 'POST',
        mode: 'cors',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`
        },
        body: JSON.stringify({ telegramId: id })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) {
        throw new Error(data?.message || data?.error || `HTTP ${response.status}`);
      }

      try { window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('success'); } catch (_) {}
      showContactReady(data?.targetName || '');
    } catch (error) {
      try { window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('error'); } catch (_) {}
      showMessage(error?.message || 'Не удалось подготовить ссылку на профиль.');
    } finally {
      if (button?.isConnected) { button.disabled = false; button.textContent = oldText; }
    }
  }

  document.addEventListener('click', event => {
    const button = event.target?.closest?.('[data-contact-telegram-id]');
    if (!button) return;
    const id = cleanId(button.dataset.contactTelegramId);
    if (!id) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    requestContactLink(id, button);
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

  window.RoyalContactByTelegramId = { version: VERSION, decorate: decorateVisible, request: requestContactLink };
  window.__ROYAL_CONTACT_BY_ID_VERSION__ = VERSION;
})();