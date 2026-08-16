/* Royal CRM Mini App — red admin badges v0.5.33
 * Admin source: protected Telegram admin directory already used by v0.5.27.
 * Participant identity remains raw Telegram ID only.
 */
(() => {
  const VERSION = '0.5.33';
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
        console.warn('v0.5.33 admin badges: admin list unavailable', error?.message || error);
        return adminIds;
      })
      .finally(() => { adminsLoading = null; });

    return adminsLoading;
  }

  function rankNodeFor(card) {
    const achievements = card?.querySelector?.('.participant-achievements-row');
    if (!achievements) return null;
    return achievements.querySelector(':scope > .participant-admin-rank-stack') ||
      achievements.querySelector(':scope > .rank-list-slot') ||
      achievements.querySelector(':scope > .hero-rank') ||
      achievements.querySelector(':scope > .rank-badge--compact');
  }

  function makeBadge() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'participant-admin-badge-v0533';
    button.dataset.openAdminDirectory = '1';
    button.textContent = '🛡️ Админ';
    button.setAttribute('aria-label', 'Администратор чата. Открыть список админов');
    button.setAttribute('title', 'Все администраторы чата');
    return button;
  }

  function ensureAdminStack(card) {
    const achievements = card?.querySelector?.('.participant-achievements-row');
    if (!achievements) return;

    let stack = achievements.querySelector(':scope > .participant-admin-rank-stack');
    if (!stack) {
      const rankNode = rankNodeFor(card);
      if (!rankNode || rankNode.classList?.contains('participant-admin-rank-stack')) return;
      stack = document.createElement('span');
      stack.className = 'participant-admin-rank-stack';
      achievements.insertBefore(stack, rankNode);
      stack.appendChild(rankNode);
    }

    if (!stack.querySelector(':scope > .participant-admin-badge-v0533')) {
      stack.insertBefore(makeBadge(), stack.firstChild);
    }
  }

  function removeAdminBadge(card) {
    const stack = card?.querySelector?.('.participant-admin-rank-stack');
    if (!stack) return;
    stack.querySelectorAll(':scope > .participant-admin-badge-v0533').forEach(node => node.remove());
    if (!stack.querySelector('.participant-admin-badge-v0533') && stack.children.length === 1) {
      const child = stack.firstElementChild;
      const parent = stack.parentElement;
      if (child && parent) {
        parent.insertBefore(child, stack);
        stack.remove();
      }
    }
  }

  function decorateAdminBadges() {
    const cards = document.querySelectorAll('.person-card,.team-member,.directory-person-card:not(.directory-person-card--external),.hero-card');
    cards.forEach(card => {
      const id = cardId(card);
      if (id && adminIds.has(id)) ensureAdminStack(card);
      else removeAdminBadge(card);
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
        requestAnimationFrame(decorateAll);
      });
    }, delay);
  }

  async function openAdminsDirectory() {
    try {
      if (typeof window.RoyalDirectories?.openAdmins !== 'function') return;
      await window.RoyalDirectories.openAdmins(false);
      schedule(0);
    } catch (error) {
      console.warn('v0.5.33 admin badges: cannot open admin directory', error?.message || error);
    }
  }

  window.addEventListener('click', event => {
    const badge = event.target?.closest?.('[data-open-admin-directory="1"]');
    if (!badge) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openAdminsDirectory();
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
  document.addEventListener('pointerup', () => schedule(0), true);

  schedule(80);
  window.RoyalAdminBadges = { version: VERSION, refresh: schedule, get adminIds() { return new Set(adminIds); } };
  window.__ROYAL_ADMIN_BADGES_VERSION__ = VERSION;
})();
