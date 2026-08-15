/* Royal CRM Mini App — rank/admin directories v0.5.27
 * Identity: Telegram ID only.
 * Admins: one protected Worker call to Telegram getChatAdministrators.
 */
(() => {
  const VERSION = '0.5.27';
  let adminsPromise = null;
  let currentDirectory = '';

  function cleanId(value) {
    const id = String(value == null ? '' : value).trim().replace(/\.0$/, '');
    return /^\d+$/.test(id) ? id : '';
  }

  function normalizeRank(value) {
    return String(value || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/\s+/g, ' ');
  }

  function isCurrentDirectory(key) {
    const node = document.querySelector('.royal-directory[data-directory-key]');
    return currentDirectory === key && String(node?.dataset?.directoryKey || '') === key;
  }

  function participants() {
    return Array.isArray(snapshotState?.participants) ? snapshotState.participants : [];
  }

  function participantById(id) {
    const wanted = cleanId(id);
    if (!wanted) return null;
    const matches = participants().filter(p => cleanId(p?.telegramId) === wanted);
    return matches.length === 1 ? matches[0] : null;
  }

  function rankCompact(p) {
    try {
      return window.RoyalRank?.compact?.(p?.specnazRank, p?.specnazTrips, { tiny: true, label: true }) || '';
    } catch (_) { return ''; }
  }

  function avatarHtml(p, clickable = true) {
    const id = cleanId(p?.telegramId);
    const name = displayName(p);
    const hasAvatar = !!String(p?.avatarFileId || '').trim();
    const attrs = clickable && id ? ` data-telegram-id="${esc(id)}"` : '';
    return hasAvatar && id
      ? `<div class="person-avatar-wrap directory-avatar"${attrs}><span>${esc(firstLetter(name))}</span><img class="person-avatar" alt=""></div>`
      : `<div class="person-avatar-wrap directory-avatar fallback"${attrs}><span>${esc(firstLetter(name))}</span></div>`;
  }

  function membershipsHtml(p) {
    const memberships = Array.isArray(p?.memberships) ? p.memberships.filter(m => m?.team || m?.role) : [];
    if (!memberships.length) return '<span class="muted directory-no-team">Команда не указана</span>';
    try { return memberships.map(m => membershipHtml(m)).join(''); }
    catch (_) {
      return memberships.map(m => `<span class="directory-team-fallback">${esc(m?.team || 'Без команды')} · ${esc(m?.role || '')}</span>`).join('');
    }
  }

  function participantCard(p, extra = '') {
    const name = displayName(p);
    const username = normalizeUsername(p?.username || '');
    const id = cleanId(p?.telegramId);
    return `<article class="directory-person-card" data-directory-telegram-id="${esc(id)}">
      ${avatarHtml(p, true)}
      <div class="directory-person-main">
        <div class="directory-person-head"><strong>${esc(name)}</strong>${rankCompact(p)}</div>
        ${username ? `<button type="button" class="username-link compact" data-user-menu="${esc(username)}" data-user-name="${esc(name)}">@${esc(username)}</button>` : ''}
        ${extra ? `<div class="directory-extra">${extra}</div>` : ''}
        <div class="directory-memberships">${membershipsHtml(p)}</div>
      </div>
    </article>`;
  }

  function fallbackAdminCard(admin) {
    const fullName = [admin?.firstName, admin?.lastName].filter(Boolean).join(' ').trim() || admin?.username || 'Администратор';
    const username = normalizeUsername(admin?.username || '');
    return `<article class="directory-person-card directory-person-card--external">
      <div class="person-avatar-wrap directory-avatar fallback"><span>${esc(firstLetter(fullName))}</span></div>
      <div class="directory-person-main">
        <div class="directory-person-head"><strong>${esc(fullName)}</strong><span class="directory-admin-badge">🛡️ ${esc(admin?.title || 'Админ')}</span></div>
        ${username ? `<div class="directory-username">@${esc(username)}</div>` : ''}
        <div class="muted directory-external-note">Профиль пока отсутствует в CRM</div>
      </div>
    </article>`;
  }

  function openShell(title, subtitle, body, key) {
    currentDirectory = key;
    const panel = document.getElementById('panel');
    if (!panel) return false;
    panel.hidden = false;
    const selfCard = document.getElementById('selfProfileCard');
    if (selfCard) selfCard.hidden = true;
    panel.innerHTML = `
      <button type="button" class="royal-back-button" data-royal-back="1">← Назад</button>
      <span class="hero-list royal-directory-nav-sentinel" hidden></span>
      <section class="royal-directory" data-directory-key="${esc(key)}">
        <div class="royal-directory-head"><div><h2>${title}</h2>${subtitle ? `<div class="muted">${subtitle}</div>` : ''}</div></div>
        <div class="royal-directory-list">${body}</div>
      </section>`;
    try { setActiveNav('players'); } catch (_) {}
    try { setupAvatarLoading(panel); } catch (_) {}
    try { window.RoyalRank?.refreshVisible?.(); } catch (_) {}
    try { panel.scrollIntoView({ block: 'start' }); } catch (_) {}
    return true;
  }

  function pushOrigin() {
    try { window.RoyalNav?.pushCurrent?.(); } catch (_) {}
  }

  function openRank(rankName) {
    const raw = String(rankName || '').trim();
    const wanted = normalizeRank(raw);
    if (!wanted) return;
    const key = `rank:${wanted}`;
    if (isCurrentDirectory(key)) return;

    const list = participants()
      .filter(p => normalizeRank(p?.specnazRank || '') === wanted)
      .sort((a, b) => Number(b?.specnazTrips || 0) - Number(a?.specnazTrips || 0) || displayName(a).localeCompare(displayName(b), 'ru', { sensitivity: 'base' }));

    pushOrigin();
    const label = list[0]?.specnazRank || raw;
    const body = list.length
      ? list.map(p => participantCard(p, `<span class="directory-score">🚨 ${Number(p?.specnazTrips || 0)} очк.</span>`)).join('')
      : '<div class="empty-state">Участников с этим рангом не найдено.</div>';
    openShell(`🏅 ${esc(label)}`, `${list.length} ${pluralParticipants(list.length)}`, body, key);
  }

  function pluralParticipants(n) {
    const value = Math.abs(Number(n || 0)) % 100;
    const last = value % 10;
    if (value > 10 && value < 20) return 'участников';
    if (last === 1) return 'участник';
    if (last >= 2 && last <= 4) return 'участника';
    return 'участников';
  }

  async function fetchAdmins() {
    if (adminsPromise) return adminsPromise;
    adminsPromise = (async () => {
      const response = await fetch(`${API_URL}/chat-admins`, {
        method: 'GET', mode: 'cors', cache: 'no-store',
        headers: { Authorization: `Bearer ${sessionToken}` }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok || !Array.isArray(data?.admins)) {
        throw new Error(data?.error || `admins ${response.status}`);
      }
      return data.admins;
    })().catch(error => {
      adminsPromise = null;
      throw error;
    });
    return adminsPromise;
  }

  async function openAdmins(retry = false) {
    const key = 'admins';
    if (!retry && isCurrentDirectory(key)) return;
    if (!retry) pushOrigin();
    openShell('🛡️ Админы чата', 'Загружаем актуальный список из Telegram…', '<div class="directory-loading">Проверяем администраторов…</div>', key);

    try {
      const admins = await fetchAdmins();
      if (currentDirectory !== key) return;
      const cards = admins.map(admin => {
        const p = participantById(admin?.telegramId);
        const label = `<span class="directory-admin-badge">${admin?.status === 'creator' ? '👑 Создатель' : '🛡️ Админ'}</span>`;
        return p ? participantCard(p, label) : fallbackAdminCard(admin);
      }).join('');
      openShell('🛡️ Админы чата', `${admins.length} ${pluralAdmins(admins.length)}`, cards || '<div class="empty-state">Администраторы не найдены.</div>', key);
    } catch (error) {
      if (currentDirectory !== key) return;
      openShell('🛡️ Админы чата', 'Не удалось получить список', `<div class="directory-error">Telegram временно не ответил.<br><button type="button" class="directory-retry" data-admin-directory-retry="1">Повторить</button></div>`, key);
    }
  }

  function pluralAdmins(n) {
    const value = Math.abs(Number(n || 0)) % 100;
    const last = value % 10;
    if (value > 10 && value < 20) return 'администраторов';
    if (last === 1) return 'администратор';
    if (last >= 2 && last <= 4) return 'администратора';
    return 'администраторов';
  }

  document.addEventListener('click', event => {
    const adminChip = event.target?.closest?.('.participant-admin-chip');
    if (adminChip) {
      event.preventDefault();
      event.stopPropagation();
      openAdmins(false);
      return;
    }

    const retry = event.target?.closest?.('[data-admin-directory-retry="1"]');
    if (retry) {
      event.preventDefault();
      event.stopPropagation();
      adminsPromise = null;
      openAdmins(true);
      return;
    }

    const premiumLabel = event.target?.closest?.('.rank-premium-name');
    if (premiumLabel) {
      event.preventDefault();
      event.stopPropagation();
      openRank(premiumLabel.textContent || '');
      return;
    }

    const rankBadge = event.target?.closest?.('.rank-badge--compact[data-rank]');
    if (rankBadge) {
      event.preventDefault();
      event.stopPropagation();
      openRank(rankBadge.dataset.rank || rankBadge.querySelector('.rank-label')?.textContent || '');
    }
  }, true);

  window.RoyalDirectories = { version: VERSION, openRank, openAdmins, fetchAdmins };
  window.__ROYAL_DIRECTORIES_VERSION__ = VERSION;
})();
