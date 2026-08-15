/* Royal CRM Mini App — self profile card v0.5.17, Telegram ID only */
(() => {
  const UI_VERSION = '0.5.17';

  function currentTelegramId() {
    return String(authState?.user?.telegramId || '').trim();
  }

  function currentSnapshotProfile() {
    const id = currentTelegramId();
    if (!/^\d+$/.test(id) || !Array.isArray(snapshotState?.participants)) return null;
    const matches = snapshotState.participants.filter(p => String(p?.telegramId || '').trim() === id);
    return matches.length === 1 ? matches[0] : null;
  }

  function membershipLine(m) {
    const team = String(m?.team || '').trim();
    const role = String(m?.role || 'Без роли').trim();
    const game = String(m?.game || '').trim();
    if (!team) return `<span class="self-membership special">🚨 ${esc(role)}</span>`;
    return `<span class="self-membership">${esc(team)}<small>${esc(role)}${game ? ` · ${esc(game)}` : ''}</small></span>`;
  }

  function profileInnerHtml() {
    const p = currentSnapshotProfile();
    const user = authState?.user || {};
    const role = authState?.role?.title || 'Участник';
    const id = currentTelegramId();
    const name = String(p?.name || user.crmName || user.telegramFirstName || 'Участник').trim();
    const username = normalizeUsername(p?.username || user.crmUsername || user.telegramUsername || '');
    const trips = Number(p?.specnazTrips || 0);
    const rank = String(p?.specnazRank || 'Новичок');
    const memberships = Array.isArray(p?.memberships) ? p.memberships : (Array.isArray(authState?.memberships) ? authState.memberships : []);
    const idAttr = /^\d+$/.test(id) ? ` data-telegram-id="${esc(id)}"` : '';
    const avatar = p?.avatarFileId
      ? `<div class="self-avatar"${idAttr}><span>${esc(firstLetter(name))}</span><img alt=""></div>`
      : `<div class="self-avatar fallback"${idAttr}><span>${esc(firstLetter(name))}</span></div>`;
    const crmStatus = snapshotState
      ? `CRM: ${Number(snapshotState.stats?.inChat || snapshotState.stats?.participants || 0)} участников · ${Number(snapshotState.stats?.teams || 0)} команд`
      : 'Загружаем данные профиля…';

    return `<div class="self-profile-head">${avatar}<div class="self-profile-identity"><span class="self-role-chip">${esc(role)}</span><h2>${esc(name)}</h2>${username ? `<div class="self-username">@${esc(username)}</div>` : ''}</div></div><div class="self-profile-stats"><div class="self-stat"><b>${trips}</b><small>Походы в спецназ</small></div><div class="self-stat rank"><b>${esc(rank)}</b><small>Звание</small></div></div><div class="self-memberships">${memberships.length ? memberships.map(membershipLine).join('') : '<span class="muted">Командные роли не указаны</span>'}</div><div class="self-crm-status muted">${esc(crmStatus)}</div>`;
  }

  function ensureCard() {
    let card = document.getElementById('selfProfileCard');
    if (!card) {
      card = document.createElement('section');
      card.id = 'selfProfileCard';
      card.className = 'self-profile-card';
      document.querySelector('.status-card')?.insertAdjacentElement('afterend', card);
    }
    return card;
  }

  function renderSelfProfileCard() {
    if (!authState?.access) return;
    const card = ensureCard();
    card.innerHTML = profileInnerHtml();
    try { setupAvatarLoading(card); } catch (_) {}
  }

  function renderProfilePageCard() {
    const panel = document.getElementById('panel');
    if (!panel || !authState?.access) return;
    panel.classList.add('profile-panel');
    panel.innerHTML = `<section class="self-profile-card profile-page-card">${profileInnerHtml()}</section>`;
    try { setupAvatarLoading(panel); } catch (_) {}
  }

  function syncHomeLayout(page) {
    const current = page || activePage || 'home';
    const home = current === 'home';
    const card = document.getElementById('selfProfileCard');
    const panel = document.getElementById('panel');
    if (card) card.hidden = !home;
    if (panel) {
      panel.hidden = home;
      if (current !== 'profile') panel.classList.remove('profile-panel');
    }
  }

  const originalRenderAuth = renderAuth;
  renderAuth = function(data) {
    originalRenderAuth(data);
    renderSelfProfileCard();
    syncHomeLayout('home');
  };

  const originalLoadSnapshot = loadSnapshot;
  loadSnapshot = async function() {
    const result = await originalLoadSnapshot();
    renderSelfProfileCard();
    if (activePage === 'profile') renderProfilePageCard();
    syncHomeLayout(activePage);
    return result;
  };

  const originalRenderPage = renderPage;
  renderPage = function(page) {
    originalRenderPage(page);
    if (page === 'home') renderSelfProfileCard();
    if (page === 'profile') renderProfilePageCard();
    syncHomeLayout(page);
  };

  window.__ROYAL_SELF_PROFILE_VERSION__ = UI_VERSION;
})();
