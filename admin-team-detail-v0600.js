/* Royal CRM Mini App — v0.6 admin team detail
 * Tap an admin team -> the SAME visual team page as normal mode:
 * photo, title/game, participant/leader/helper counters and member cards.
 * Data comes from protected private admin snapshot so inactive teams work too.
 */
(() => {
  const VERSION = '0.6.0-admin-team-detail.1';
  let payload = null;
  let loading = null;

  const clean = value => String(value == null ? '' : value).trim();
  const html = value => {
    try { return typeof esc === 'function' ? esc(value) : clean(value); }
    catch (_) { return clean(value); }
  };
  function norm(value) { return clean(value).toLocaleLowerCase('ru-RU').replace(/ё/g, 'е'); }
  function game(value) {
    const raw = clean(value);
    const low = norm(raw);
    if (low === 'рм' || low.includes('royal match')) return 'Royal Match';
    if (low === 'рк' || low.includes('royal kingdom')) return 'Royal Kingdom';
    return raw;
  }
  function id(value) {
    const match = clean(value).replace(/\.0$/, '').match(/\d{5,20}/);
    return match ? match[0] : '';
  }
  function firstLetter(value) {
    const text = clean(value).replace(/^@/, '');
    return text ? Array.from(text)[0].toUpperCase() : '👤';
  }
  function displayName(p) {
    return clean(p?.name || p?.telegramName || p?.username || p?.telegramId || 'Без имени');
  }
  function roleRank(role) {
    const value = clean(role);
    if (value === 'Лидер') return 0;
    if (value === 'Помощник') return 1;
    if (value === 'Игрок') return 2;
    return 3;
  }

  async function adminData(force=false) {
    if (payload && !force) return payload;
    if (loading && !force) return loading;
    loading = (async () => {
      if (!sessionToken) throw new Error('SESSION_MISSING');
      const response = await fetch(`${API_URL}/admin-data`, {
        method:'GET', mode:'cors', cache:'no-store',
        headers:{ Authorization:`Bearer ${sessionToken}` }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok || !data?.adminData) {
        const error = new Error(data?.message || `HTTP ${response.status}`);
        error.code = data?.error || `HTTP_${response.status}`;
        throw error;
      }
      payload = data;
      return data;
    })().finally(() => { loading = null; });
    return loading;
  }

  function membershipsFor(p, teamName, teamGame) {
    const wantedName = norm(teamName);
    const wantedGame = game(teamGame);
    return (Array.isArray(p?.memberships) ? p.memberships : [])
      .filter(m => norm(m?.team) === wantedName && (!clean(m?.game) || game(m?.game) === wantedGame))
      .sort((a,b) => roleRank(a?.role) - roleRank(b?.role));
  }

  function memberCard(p, teamName, teamGame) {
    const name = displayName(p);
    const pid = id(p?.telegramId);
    const memberships = membershipsFor(p, teamName, teamGame);
    const info = memberships.map(m => {
      const role = clean(m?.role || 'Без роли');
      const extra = [m?.nickname, m?.game].filter(Boolean).join(' · ');
      return `<div class="team-member-role">${html(role)}${extra ? ` · ${html(extra)}` : ''}</div>`;
    }).join('');

    const avatar = pid
      ? `<div class="person-avatar-wrap small fallback" data-telegram-id="${html(pid)}"><span>${html(firstLetter(name))}</span><img class="person-avatar" alt="" data-admin-media-kind="avatar" data-telegram-id="${html(pid)}"></div>`
      : `<div class="person-avatar-wrap small fallback"><span>${html(firstLetter(name))}</span></div>`;

    let username = '';
    try {
      if (typeof usernameButton === 'function') username = usernameButton(p, true);
    } catch (_) {}

    return `<article class="team-member"${pid ? ` data-telegram-id="${html(pid)}"` : ''}>${avatar}<div class="team-member-main"><strong>${html(name)}</strong>${username}${info}</div></article>`;
  }

  function identityFromRecord(record) {
    const name = clean(record?.dataset?.adminTeamName || record?.querySelector('summary .royal-admin-summary-main strong')?.textContent);
    const meta = clean(record?.dataset?.adminTeamFullGame || record?.querySelector('summary .royal-admin-summary-main small')?.textContent);
    return { name, game:game(meta) };
  }

  function findTeam(data, name, teamGame) {
    const teams = Array.isArray(data?.adminData?.teams) ? data.adminData.teams : [];
    return teams.find(t => norm(t?.name) === norm(name) && game(t?.game) === game(teamGame)) || null;
  }

  function captureAdminForBack() {
    const panel = document.getElementById('panel');
    if (!panel) return;
    // RoyalNav classifies rich internal pages by descendants. Add a temporary
    // hidden marker so the complete admin DOM/search/filter state is captured.
    const marker = document.createElement('i');
    marker.className = 'participant-detail-card';
    marker.hidden = true;
    marker.dataset.adminNavMarker = '1';
    panel.appendChild(marker);
    try { window.RoyalNav?.pushCurrent?.(); } catch (_) {}
    marker.remove();
  }

  async function openTeam(name, teamGame) {
    const panel = document.getElementById('panel');
    if (!panel || !name || !teamGame) return;
    captureAdminForBack();

    panel.hidden = false;
    panel.innerHTML = '<button type="button" class="royal-back-button" data-royal-back="1">← Назад</button><div class="empty-state">Загружаем команду…</div>';
    try { setActiveNav('teams'); } catch (_) {}

    try {
      const data = await adminData(false);
      const team = findTeam(data, name, teamGame);
      if (!team) throw new Error('TEAM_NOT_FOUND');
      const participants = Array.isArray(data?.adminData?.participants) ? data.adminData.participants : [];
      const members = participants.filter(p => membershipsFor(p, team.name, team.game).length)
        .sort((a,b) => {
          const ar = roleRank(membershipsFor(a, team.name, team.game)[0]?.role);
          const br = roleRank(membershipsFor(b, team.name, team.game)[0]?.role);
          return ar - br || displayName(a).localeCompare(displayName(b), 'ru', { sensitivity:'base' });
        });
      const leaders = members.filter(p => membershipsFor(p, team.name, team.game).some(m => clean(m?.role) === 'Лидер')).length;
      const assistants = members.filter(p => membershipsFor(p, team.name, team.game).some(m => clean(m?.role) === 'Помощник')).length;

      panel.innerHTML = `
        <button type="button" class="royal-back-button" data-royal-back="1">← Назад</button>
        <div class="team-photo-box photo-error">
          <img class="team-photo" alt="${html(team.name)}" data-admin-media-kind="team" data-team-name="${html(team.name)}" data-team-game="${html(team.game)}">
          <div class="team-photo-fallback">🏰</div>
        </div>
        <div class="team-detail-head"><h2>${html(team.name)}</h2><div class="muted">${html(team.game)}</div></div>
        <div class="team-stats"><span><b>${members.length}</b><small>участников</small></span><span><b>${leaders}</b><small>лидеров</small></span><span><b>${assistants}</b><small>помощников</small></span></div>
        <h3 class="subheading">Состав команды</h3>
        <div class="team-members-list">${members.length ? members.map(p => memberCard(p, team.name, team.game)).join('') : '<div class="empty-state">Участники не найдены</div>'}</div>`;

      const photo = panel.querySelector('.team-photo');
      const box = photo?.closest?.('.team-photo-box');
      if (photo) {
        photo.addEventListener('load', () => box?.classList.remove('photo-error'));
        photo.addEventListener('error', () => box?.classList.add('photo-error'));
        window.RoyalAdminPersistentMediaV0600?.loadTeam?.(photo).catch?.(() => {});
      }
      panel.querySelectorAll('[data-admin-media-kind="avatar"]').forEach(img => {
        const wrap = img.closest('.person-avatar-wrap');
        img.addEventListener('load', () => wrap?.classList.remove('fallback'));
        img.addEventListener('error', () => wrap?.classList.add('fallback'));
        window.RoyalAdminPersistentMediaV0600?.observe?.(img);
      });
    } catch (error) {
      panel.innerHTML = `<button type="button" class="royal-back-button" data-royal-back="1">← Назад</button><h2>Команда не найдена</h2><p class="muted">${html(error?.code || error?.message || 'UNKNOWN')}</p>`;
    }
  }

  document.addEventListener('click', event => {
    const summary = event.target?.closest?.('[data-admin-team="1"] > summary');
    if (!summary) return;
    if (event.target?.closest?.('button,a,input,select,textarea')) return;
    const record = summary.closest('[data-admin-team="1"]');
    const identity = identityFromRecord(record);
    if (!identity.name || !identity.game) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openTeam(identity.name, identity.game);
  }, true);

  window.RoyalAdminTeamDetailV0600 = { version:VERSION, open:openTeam, clear:() => { payload = null; } };
})();
