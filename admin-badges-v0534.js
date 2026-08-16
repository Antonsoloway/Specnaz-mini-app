/* Royal CRM Mini App — admin badges v0.5.34
 * Layout fix: Admin badge is always above rank, never beside it.
 * The lower row keeps rank + future achievements horizontally.
 * Admin source stays Telegram getChatAdministrators via the protected directory.
 * Participant identity remains raw Telegram ID only.
 */
(() => {
  const VERSION = '0.5.34';
  let adminIds = new Set();
  let adminsLoaded = false;
  let adminsLoading = null;

  function cleanId(value) {
    const id = String(value == null ? '' : value).trim().replace(/\.0$/, '');
    return /^\d+$/.test(id) ? id : '';
  }

  function cardId(card) {
    if (!card) return '';
    return cleanId(
      card.dataset?.profileTelegramId ||
      card.dataset?.participantTelegramId ||
      card.dataset?.directoryTelegramId ||
      card.querySelector?.('[data-telegram-id]')?.dataset?.telegramId
    );
  }

  function hasSession() {
    try { return typeof sessionToken !== 'undefined' && !!String(sessionToken || '').trim(); }
    catch (_) { return false; }
  }

  async function ensureAdmins() {
    if (adminsLoaded) return adminIds;
    if (adminsLoading) return adminsLoading;
    if (!hasSession() || typeof window.RoyalDirectories?.fetchAdmins !== 'function') return adminIds;

    adminsLoading = window.RoyalDirectories.fetchAdmins()
      .then(admins => {
        const next = new Set();
        (Array.isArray(admins) ? admins : []).forEach(admin => {
          const id = cleanId(admin?.telegramId);
          if (id) next.add(id);
        });
        adminIds = next;
        adminsLoaded = true;
        return adminIds;
      })
      .catch(error => {
        console.warn('v0.5.34 admin badges: admin list unavailable', error?.message || error);
        return adminIds;
      })
      .finally(() => { adminsLoading = null; });

    return adminsLoading;
  }

  function achievementsFor(card) {
    return card?.querySelector?.('.participant-achievements-row') || null;
  }

  function unwrapLegacyStack(achievements) {
    if (!achievements) return;
    const stack = achievements.querySelector(':scope > .participant-admin-rank-stack');
    if (!stack) return;

    const children = Array.from(stack.children);
    children.forEach(child => {
      if (child.classList?.contains('participant-admin-badge-v0533')) child.remove();
      else achievements.insertBefore(child, stack);
    });
    stack.remove();
  }

  function makeBadge() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'participant-admin-badge-v0534';
    button.dataset.openAdminDirectory = '1';
    button.textContent = '🛡️ Админ';
    button.setAttribute('aria-label', 'Администратор чата. Открыть список админов');
    button.setAttribute('title', 'Все администраторы чата');
    return button;
  }

  function ensureAdminLayout(card) {
    const achievements = achievementsFor(card);
    if (!achievements) return;

    unwrapLegacyStack(achievements);
    achievements.querySelectorAll(':scope > .participant-admin-badge-v0533').forEach(node => node.remove());

    if (!achievements.querySelector(':scope > .participant-admin-badge-v0534')) {
      achievements.insertBefore(makeBadge(), achievements.firstChild);
    }
    achievements.classList.add('has-admin-badge-v0534');
  }

  function removeAdminLayout(card) {
    const achievements = achievementsFor(card);
    if (!achievements) return;
    unwrapLegacyStack(achievements);
    achievements.querySelectorAll(':scope > .participant-admin-badge-v0533,:scope > .participant-admin-badge-v0534').forEach(node => node.remove());
    achievements.classList.remove('has-admin-badge-v0534');
  }

  function decorateAdminBadges() {
    const cards = document.querySelectorAll('.person-card,.team-member,.directory-person-card:not(.directory-person-card--external),.hero-card');
    cards.forEach(card => {
      const id = cardId(card);
      if (id && adminIds.has(id)) ensureAdminLayout(card);
      else removeAdminLayout(card);
    });
  }

  function decorateAll() {
    try { window.RoyalParticipantCardUX?.decorate?.(); } catch (_) {}
    decorateAdminBadges();
  }

  function schedule(delay = 0) {
    window.setTimeout(() => {
      decorateAll();
      ensureAdmins().then(() => {
        decorateAll();
        requestAnimationFrame(() => {
          decorateAll();
          requestAnimationFrame(decorateAll);
        });
      });
    }, delay);
  }

  async function openAdminsDirectory() {
    try {
      if (typeof window.RoyalDirectories?.openAdmins !== 'function') return;
      await window.RoyalDirectories.openAdmins(false);
      schedule(0);
    } catch (error) {
      console.warn('v0.5.34 admin badges: cannot open admin directory', error?.message || error);
    }
  }

  window.addEventListener('click', event => {
    const badge = event.target?.closest?.('[data-open-admin-directory="1"]');
    if (badge) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openAdminsDirectory();
      return;
    }
    // Run after navigation/back handlers as a final visual normalization.
    window.setTimeout(decorateAll, 20);
  }, true);

  if (typeof renderParticipantsPage === 'function') {
    const nativeRenderParticipantsPage = renderParticipantsPage;
    renderParticipantsPage = function(query = '') {
      const result = nativeRenderParticipantsPage(query);
      schedule(0);
      return result;
    };
  }

  if (typeof renderTeamDetail === 'function') {
    const nativeRenderTeamDetail = renderTeamDetail;
    renderTeamDetail = function(teamRef) {
      const result = nativeRenderTeamDetail(teamRef);
      schedule(0);
      return result;
    };
  }

  if (typeof renderPage === 'function') {
    const nativeRenderPage = renderPage;
    renderPage = function(page) {
      const result = nativeRenderPage(page);
      schedule(0);
      return result;
    };
  }

  if (typeof loadSnapshot === 'function') {
    const nativeLoadSnapshot = loadSnapshot;
    loadSnapshot = async function() {
      const result = await nativeLoadSnapshot();
      schedule(0);
      return result;
    };
  }

  window.addEventListener('pageshow', () => schedule(0));
  document.addEventListener('input', () => schedule(0), true);
  document.addEventListener('pointerup', () => window.setTimeout(decorateAll, 20), true);

  schedule(80);
  window.RoyalAdminBadges = { version: VERSION, refresh: schedule, get adminIds() { return new Set(adminIds); } };
  window.__ROYAL_ADMIN_BADGES_VERSION__ = VERSION;
})();
