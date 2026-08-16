/* Royal CRM Mini App — admin/profile achievements v0.5.34
 * Keeps participant identity Telegram-ID-only.
 * Fixes admin-over-rank stacking in lists and enhances detailed profiles.
 */
(() => {
  const VERSION = '0.5.34';

  function cleanId(value) {
    const id = String(value == null ? '' : value).trim().replace(/\.0$/, '');
    return /^\d+$/.test(id) ? id : '';
  }

  function directChild(parent, selector) {
    if (!parent) return null;
    return [...parent.children].find(node => node.matches?.(selector)) || null;
  }

  function fixCardStack(card) {
    const achievements = card?.querySelector?.('.participant-achievements-row');
    if (!achievements) return;

    let stack = directChild(achievements, '.participant-admin-rank-stack');
    let badge = stack?.querySelector?.(':scope > .participant-admin-badge-v0533') || directChild(achievements, '.participant-admin-badge-v0533');
    if (!badge) return;

    let rank = null;
    if (stack) {
      rank = directChild(stack, '.rank-list-slot,.hero-rank,.rank-badge--compact');
    }
    rank ||= directChild(achievements, '.rank-list-slot,.hero-rank,.rank-badge--compact');

    if (!stack) {
      stack = document.createElement('span');
      stack.className = 'participant-admin-rank-stack';
      achievements.insertBefore(stack, badge);
    }

    if (badge.parentElement !== stack) stack.insertBefore(badge, stack.firstChild);
    if (rank && rank.parentElement !== stack) stack.appendChild(rank);
  }

  function fixAllListStacks() {
    document.querySelectorAll('.person-card,.team-member,.directory-person-card:not(.directory-person-card--external),.hero-card')
      .forEach(fixCardStack);
  }

  function ensureAchievementsTitle() {
    const card = document.querySelector('.participant-detail-card');
    if (!card) return;
    const stage = directChild(card, '.rank-premium-stage') || card.querySelector('.rank-premium-stage');
    if (!stage) return;
    let title = card.querySelector('.participant-detail-achievements-title');
    if (!title) {
      title = document.createElement('div');
      title.className = 'participant-detail-achievements-title';
      title.textContent = 'Достижения';
      stage.parentElement?.insertBefore(title, stage);
    } else if (title.nextElementSibling !== stage) {
      stage.parentElement?.insertBefore(title, stage);
    }
  }

  function enhanceDetailAdminChip() {
    const card = document.querySelector('.participant-detail-card');
    if (!card) return;
    const chip = card.querySelector('.participant-admin-chip');
    if (!chip) return;
    chip.setAttribute('role', 'button');
    chip.setAttribute('tabindex', '0');
    chip.setAttribute('title', 'Все администраторы чата');
    chip.setAttribute('aria-label', 'Администратор чата. Открыть список админов');
    chip.dataset.openAdminDirectoryV0534 = '1';
  }

  function decorateNow() {
    fixAllListStacks();
    ensureAchievementsTitle();
    enhanceDetailAdminChip();
  }

  function schedule() {
    window.setTimeout(decorateNow, 0);
    window.setTimeout(decorateNow, 80);
    window.setTimeout(decorateNow, 300);
  }

  async function openAdmins() {
    try {
      if (typeof window.RoyalDirectories?.openAdmins === 'function') {
        await window.RoyalDirectories.openAdmins(false);
        schedule();
      }
    } catch (error) {
      console.warn('v0.5.34: cannot open admin directory', error?.message || error);
    }
  }

  // v0.5.31 may move the rank back out of the admin stack on re-decoration.
  // Wrap its public decorator so our vertical admin-over-rank layout is always restored last.
  if (typeof window.RoyalParticipantCardUX?.decorate === 'function') {
    const nativeDecorate = window.RoyalParticipantCardUX.decorate;
    window.RoyalParticipantCardUX.decorate = function() {
      const result = nativeDecorate.apply(this, arguments);
      window.setTimeout(fixAllListStacks, 0);
      return result;
    };
  }

  const nativeOpenParticipant = window.RoyalOpenParticipantByTelegramId;
  if (typeof nativeOpenParticipant === 'function') {
    window.RoyalOpenParticipantByTelegramId = function(telegramId) {
      const result = nativeOpenParticipant(telegramId);
      if (result) schedule();
      return result;
    };
  }

  document.addEventListener('click', event => {
    const detailAdmin = event.target?.closest?.('.participant-detail-card .participant-admin-chip,[data-open-admin-directory-v0534="1"]');
    if (detailAdmin) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openAdmins();
      return;
    }
    schedule();
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const detailAdmin = event.target?.closest?.('.participant-detail-card .participant-admin-chip,[data-open-admin-directory-v0534="1"]');
    if (!detailAdmin) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openAdmins();
  }, true);

  document.addEventListener('pointerup', schedule, true);
  document.addEventListener('input', schedule, true);
  window.addEventListener('pageshow', schedule);

  // Small, profile-scoped observer only: the old admin-role check is asynchronous and
  // can insert its chip after the initial profile render. No global observer is used.
  let observedCard = null;
  let observer = null;
  function attachDetailObserver() {
    const card = document.querySelector('.participant-detail-card');
    if (card === observedCard) return;
    observer?.disconnect();
    observer = null;
    observedCard = card || null;
    if (!card) return;
    observer = new MutationObserver(() => {
      ensureAchievementsTitle();
      enhanceDetailAdminChip();
    });
    observer.observe(card, { childList:true, subtree:true });
  }

  function scheduleWithObserver() {
    schedule();
    window.setTimeout(attachDetailObserver, 0);
    window.setTimeout(attachDetailObserver, 120);
  }

  document.addEventListener('click', scheduleWithObserver, false);
  scheduleWithObserver();

  window.RoyalAdminAchievements = {
    version: VERSION,
    refresh: scheduleWithObserver,
    cleanId
  };
  window.__ROYAL_ADMIN_ACHIEVEMENTS_VERSION__ = VERSION;
})();
