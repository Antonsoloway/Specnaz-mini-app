/* Royal CRM Mini App — participant profiles v0.5.17
 * Participant identity is raw Telegram ID only.
 */
(() => {
  const AVATAR_SELECTOR = '.person-avatar-wrap,.hero-avatar,.history-avatar,.self-avatar';
  let origin = null;

  function participants() {
    return Array.isArray(snapshotState?.participants) ? snapshotState.participants : [];
  }

  function cleanId(value) {
    const id = String(value || '').trim();
    return /^\d+$/.test(id) ? id : '';
  }

  function findByTelegramId(value) {
    const id = cleanId(value);
    if (!id) return null;
    const matches = participants().filter(p => cleanId(p?.telegramId) === id);
    return matches.length === 1 ? matches[0] : null;
  }

  function resolveParticipant(avatar) {
    if (!avatar) return null;
    const directId = cleanId(avatar.dataset?.telegramId);
    if (directId) return findByTelegramId(directId);
    if (avatar.classList.contains('self-avatar')) {
      return findByTelegramId(authState?.user?.telegramId);
    }
    return null;
  }

  function safeUrl(value) {
    const url = String(value || '').trim();
    return /^(https?:\/\/|tg:\/\/)/i.test(url) ? url : '';
  }

  function richMessageHtml(row) {
    const rich = Array.isArray(row?.messageRich) ? row.messageRich : [];
    if (!rich.length) return esc(row?.message || '');
    return rich.map(segment => {
      const text = String(segment?.text || '');
      const url = safeUrl(segment?.url);
      return url
        ? `<a class="participant-history-link" href="${esc(url)}" data-participant-history-link="${esc(url)}">${esc(text)}</a>`
        : esc(text);
    }).join('');
  }

  function dateValue(value) {
    const raw = String(value || '').trim();
    const m = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return 0;
    return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0)).getTime();
  }

  function participantHistory(p) {
    const id = cleanId(p?.telegramId);
    if (!id) return [];
    const sections = Array.isArray(snapshotState?.specnazHistory?.sections) ? snapshotState.specnazHistory.sections : [];
    const result = [];
    sections.forEach(section => {
      (Array.isArray(section?.rows) ? section.rows : []).forEach(row => {
        if (cleanId(row?.telegramId) === id) {
          result.push({ ...row, sectionTitle: String(section?.title || '') });
        }
      });
    });
    return result.sort((a, b) => dateValue(b.date) - dateValue(a.date));
  }

  function membershipHtmlProfile(m) {
    const team = String(m?.team || '').trim();
    const role = String(m?.role || 'Без роли').trim();
    const game = String(m?.game || '').trim();
    if (!team) return `<span class="participant-profile-membership special">🚨 ${esc(role)}</span>`;
    return `<span class="participant-profile-membership"><b>${esc(team)}</b><small>${esc(role)}${game ? ` · ${esc(game)}` : ''}</small></span>`;
  }

  function historyCardHtml(row) {
    const added = String(row?.added || '').trim();
    return `<article class="participant-trip-card"><div class="participant-trip-top"><div><b>${esc(row?.date || '')}</b>${row?.sectionTitle ? `<small>${esc(row.sectionTitle)}</small>` : ''}</div>${added ? `<span class="participant-trip-added">+${esc(added)}</span>` : ''}</div>${row?.team ? `<div class="participant-trip-team">${esc(row.team)}</div>` : ''}<div class="participant-trip-score"><span>Было <b>${esc(row?.before || '')}</b></span><span>→</span><span>Стало <b>${esc(row?.after || '')}</b></span>${row?.rank ? `<span class="participant-trip-rank">${esc(row.rank)}</span>` : ''}</div>${row?.message ? `<div class="participant-trip-message">${richMessageHtml(row)}</div>` : ''}</article>`;
  }

  function captureOrigin() {
    const panel = document.getElementById('panel');
    const page = activePage || 'home';
    const data = { page, scrollY: window.scrollY || 0 };
    if (page === 'players') data.query = document.getElementById('participantSearch')?.value || '';
    if (page === 'teams') {
      const title = panel?.querySelector('.team-detail-head h2')?.textContent || '';
      const game = panel?.querySelector('.team-detail-head .muted')?.textContent || '';
      if (title) data.teamName = title.trim();
      if (game) data.teamGame = game.trim();
      if (!title) data.query = document.getElementById('teamSearch')?.value || '';
    }
    if (page === 'help') data.html = panel?.innerHTML || '';
    return data;
  }

  function restoreOrigin() {
    const saved = origin;
    origin = null;
    if (!saved) return renderPage('players');
    if (saved.page === 'players') renderParticipantsPage(saved.query || '');
    else if (saved.page === 'teams' && saved.teamName) {
      const ref = saved.teamGame ? JSON.stringify([saved.teamName, saved.teamGame]) : saved.teamName;
      try { renderTeamDetail(ref); } catch (_) { renderTeamsPage(''); }
    } else if (saved.page === 'teams') renderTeamsPage(saved.query || '');
    else if (saved.page === 'help' && saved.html) {
      setActiveNav('help');
      const panel = document.getElementById('panel');
      if (panel) {
        panel.hidden = false;
        panel.innerHTML = saved.html;
        try { setupAvatarLoading(panel); } catch (_) {}
      }
    } else renderPage(saved.page || 'home');
    try { window.scrollTo(0, saved.scrollY || 0); } catch (_) {}
  }

  function renderParticipantProfile(p) {
    if (!p) return;
    origin = captureOrigin();
    const panel = document.getElementById('panel');
    document.getElementById('selfProfileCard')?.setAttribute('hidden', '');
    if (!panel) return;
    panel.hidden = false;

    const id = cleanId(p?.telegramId);
    if (!id) return;
    const name = displayName(p);
    const username = normalizeUsername(p?.username || '');
    const trips = Number(p?.specnazTrips || 0);
    const rank = String(p?.specnazRank || 'Новичок');
    const memberships = Array.isArray(p?.memberships) ? p.memberships : [];
    const history = participantHistory(p);
    const avatar = p?.avatarFileId
      ? `<div class="participant-detail-avatar" data-telegram-id="${esc(id)}"><span>${esc(firstLetter(name))}</span><img alt=""></div>`
      : `<div class="participant-detail-avatar fallback" data-telegram-id="${esc(id)}"><span>${esc(firstLetter(name))}</span></div>`;

    panel.innerHTML = `<button type="button" class="participant-profile-back" data-participant-profile-back>‹ Назад</button><section class="participant-detail-card"><div class="participant-detail-head">${avatar}<div class="participant-detail-identity"><span class="participant-detail-rank-chip">${esc(rank)}</span><h2>${esc(name)}</h2>${username ? `<button type="button" class="username-link" data-user-menu="${esc(username)}" data-user-name="${esc(name)}">@${esc(username)}</button>` : ''}</div></div><div class="participant-detail-stats"><div><b>${trips}</b><small>Очки спецназа</small></div><div><b>${history.length}</b><small>Походов в истории</small></div></div><div class="participant-detail-memberships">${memberships.length ? memberships.map(membershipHtmlProfile).join('') : '<span class="muted">Команда не указана</span>'}</div></section><div class="participant-history-title"><h3>🚨 Походы в спецназ</h3><span>${history.length}</span></div><div class="participant-trip-list">${history.length ? history.map(historyCardHtml).join('') : '<div class="participant-history-empty">Для этого Telegram ID походов в истории не найдено.</div>'}</div>`;
    try { setupAvatarLoading(panel); } catch (_) {}
    try { panel.scrollIntoView({ block: 'start' }); } catch (_) {}
  }

  document.addEventListener('click', event => {
    const back = event.target.closest('[data-participant-profile-back]');
    if (back) {
      event.preventDefault();
      event.stopPropagation();
      restoreOrigin();
      return;
    }

    const historyLink = event.target.closest('[data-participant-history-link]');
    if (historyLink) {
      event.preventDefault();
      event.stopPropagation();
      const url = safeUrl(historyLink.dataset.participantHistoryLink);
      if (!url) return;
      const webapp = window.Telegram?.WebApp;
      try {
        if (/^https:\/\/t\.me\//i.test(url) && webapp?.openTelegramLink) webapp.openTelegramLink(url);
        else if (webapp?.openLink) webapp.openLink(url);
        else window.location.href = url;
      } catch (_) { window.location.href = url; }
      return;
    }

    const avatar = event.target.closest(AVATAR_SELECTOR);
    if (!avatar || avatar.closest('.participant-detail-card')) return;
    const participant = resolveParticipant(avatar);
    if (!participant) return;
    event.preventDefault();
    event.stopPropagation();
    renderParticipantProfile(participant);
  }, true);

  window.__ROYAL_PARTICIPANT_PROFILE_VERSION__ = '0.5.17';
})();
