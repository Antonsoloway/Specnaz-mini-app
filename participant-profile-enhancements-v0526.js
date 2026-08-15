/* Royal CRM Mini App — participant profile enhancements v0.5.26
 * Identity remains Telegram ID only.
 * Adds: live chat-admin badge + exact team/game links on detail profiles.
 */
(() => {
  const VERSION = '0.5.26';
  const adminCache = new Map();

  function cleanId(value) {
    const id = String(value || '').trim();
    return /^\d+$/.test(id) ? id : '';
  }

  function findParticipant(telegramId) {
    const id = cleanId(telegramId);
    if (!id || !Array.isArray(snapshotState?.participants)) return null;
    const matches = snapshotState.participants.filter(p => cleanId(p?.telegramId) === id);
    return matches.length === 1 ? matches[0] : null;
  }

  function canonicalGame(value) {
    const raw = String(value || '').trim();
    const low = raw.toLocaleLowerCase('ru-RU');
    if (low === 'рм' || low.includes('royal match')) return 'Royal Match';
    if (low === 'рк' || low.includes('royal kingdom')) return 'Royal Kingdom';
    return raw;
  }

  function teamRef(team, game) {
    return JSON.stringify([String(team || '').trim(), canonicalGame(game)]);
  }

  function membershipButton(m) {
    const team = String(m?.team || '').trim();
    const role = String(m?.role || 'Без роли').trim();
    const game = canonicalGame(m?.game);
    if (!team) {
      return `<span class="participant-profile-membership special">🚨 ${esc(role)}</span>`;
    }
    const ref = teamRef(team, game);
    return `<button type="button" class="participant-profile-membership participant-profile-team-link" data-team="${enc(ref)}" aria-label="Открыть команду ${esc(team)}">
      <span class="participant-profile-team-main"><b>${esc(team)}</b><small>${esc(role)}${game ? ` · ${esc(game)}` : ''}</small></span>
      <span class="participant-profile-team-chevron" aria-hidden="true">›</span>
    </button>`;
  }

  async function getAdminInfo(telegramId) {
    const id = cleanId(telegramId);
    if (!id) return null;
    if (adminCache.has(id)) return adminCache.get(id);
    const promise = (async () => {
      try {
        const response = await fetch(`${API_URL}/participant-role?telegramId=${encodeURIComponent(id)}`, {
          method: 'GET',
          mode: 'cors',
          cache: 'no-store',
          headers: { Authorization: `Bearer ${sessionToken}` }
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.ok || cleanId(data?.telegramId) !== id) return null;
        return { isChatAdmin: !!data.isChatAdmin, status: String(data.telegramStatus || '') };
      } catch (error) {
        console.warn('participant admin check failed', error?.message || 'unknown');
        return null;
      }
    })();
    adminCache.set(id, promise);
    return promise;
  }

  function renderMemberships(participant) {
    const memberships = Array.isArray(participant?.memberships) ? participant.memberships : [];
    return memberships.length
      ? memberships.map(membershipButton).join('')
      : '<span class="muted participant-profile-no-team">Команда не указана</span>';
  }

  async function decorateProfile(telegramId) {
    const id = cleanId(telegramId);
    const participant = findParticipant(id);
    const card = document.querySelector('.participant-detail-card');
    const avatar = card?.querySelector('.participant-detail-avatar[data-telegram-id]');
    if (!participant || !card || cleanId(avatar?.dataset?.telegramId) !== id) return;

    const membershipsBox = card.querySelector('.participant-detail-memberships');
    if (membershipsBox) {
      membershipsBox.classList.add('participant-detail-memberships--enhanced');
      membershipsBox.innerHTML = `${renderMemberships(participant)}<span class="participant-admin-slot" data-admin-for="${esc(id)}"></span>`;
    }

    const info = await getAdminInfo(id);
    const currentAvatar = document.querySelector('.participant-detail-card .participant-detail-avatar[data-telegram-id]');
    if (cleanId(currentAvatar?.dataset?.telegramId) !== id) return;
    const slot = document.querySelector(`.participant-admin-slot[data-admin-for="${id}"]`);
    if (!slot) return;
    slot.innerHTML = info?.isChatAdmin
      ? '<span class="participant-admin-chip">🛡️ Админ</span>'
      : '';
  }

  function decorateCurrentSoon() {
    window.setTimeout(() => {
      const avatar = document.querySelector('.participant-detail-card .participant-detail-avatar[data-telegram-id]');
      const id = cleanId(avatar?.dataset?.telegramId);
      if (id) decorateProfile(id);
    }, 0);
  }

  const directOpen = window.RoyalOpenParticipantByTelegramId;
  if (typeof directOpen === 'function') {
    window.RoyalOpenParticipantByTelegramId = function(telegramId) {
      const result = directOpen(telegramId);
      if (result) window.setTimeout(() => decorateProfile(telegramId), 0);
      return result;
    };
  }

  document.addEventListener('pointerup', decorateCurrentSoon, true);
  document.addEventListener('click', event => {
    if (event.target?.closest?.('[data-royal-back],[data-team],[data-page],[data-specnaz17-view]')) {
      window.setTimeout(decorateCurrentSoon, 30);
    }
  }, true);

  window.RoyalParticipantProfileEnhancements = {
    version: VERSION,
    decorateProfile,
    getAdminInfo
  };
  window.__ROYAL_PARTICIPANT_PROFILE_ENHANCEMENTS_VERSION__ = VERSION;
})();
