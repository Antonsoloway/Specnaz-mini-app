/* Royal CRM Mini App — v0.6 admin team detail
 * Admin team page keeps the normal team-detail visual language, but reads the
 * protected private admin snapshot so paused/inactive teams work too.
 * It additionally shows every team counter from Команды D:L and exposes the
 * existing hardened team editor (name / leader / photo; computed E:L read-only).
 */
(() => {
  const VERSION = '0.6.0-admin-team-detail.2';
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
  function show(value) {
    if (value === 0 || value === '0') return '0';
    return clean(value) || '—';
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
    const marker = document.createElement('i');
    marker.className = 'participant-detail-card';
    marker.hidden = true;
    marker.dataset.adminNavMarker = '1';
    panel.appendChild(marker);
    try { window.RoyalNav?.pushCurrent?.(); } catch (_) {}
    marker.remove();
  }

  function counter(label, value, extra='') {
    return `<div class="royal-admin-team-counter"><strong>${html(show(value))}</strong><span>${html(label)}</span>${extra ? `<small>${html(extra)}</small>` : ''}</div>`;
  }

  function adminStats(team) {
    return `
      <section class="royal-admin-team-data">
        <div class="royal-admin-team-data-head">
          <div><span>🔒 Данные админской таблицы</span><small>Лист «Команды», поля D:L</small></div>
          <span class="royal-admin-team-status">${html(show(team?.status))}</span>
        </div>
        <div class="royal-admin-team-counters">
          ${counter('Игроков E', team?.players)}
          ${counter('Общий спецназ F', team?.specnazTrips)}
          ${counter('Скрины H', team?.screens)}
          ${counter('Активность в базе I', team?.activityBase)}
          ${counter('Активность вне базы J', team?.activityOutside)}
          ${counter('Среднее K', team?.average)}
        </div>
        <div class="royal-admin-team-meta">
          <div><span>Лидер / подпись D</span><strong>${html(show(team?.leader))}</strong></div>
          <div><span>Сортировка G</span><strong>${html(show(team?.sort))}</strong></div>
          <div><span>Статус L</span><strong>${html(show(team?.status))}</strong></div>
          <div><span>Строка таблицы</span><strong>${html(show(team?.row))}</strong></div>
        </div>
      </section>`;
  }

  function installCss() {
    if (document.querySelector('style[data-admin-team-detail-v0600="2"]')) return;
    const style = document.createElement('style');
    style.dataset.adminTeamDetailV0600 = '2';
    style.textContent = `
      .royal-admin-team-detail-shell{display:block}
      .royal-admin-team-edit{width:100%;margin:18px 0 10px;border:1px solid #a34855;border-radius:18px;padding:15px 18px;background:linear-gradient(135deg,#5a202b,#7a2c3a);color:#fff;font:800 17px/1.1 inherit;box-shadow:0 10px 30px rgba(77,19,30,.18)}
      .royal-admin-team-data{margin:18px 0 20px;padding:16px;border:1px solid #274657;border-radius:20px;background:#0f202b}
      .royal-admin-team-data-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
      .royal-admin-team-data-head>div{display:flex;flex-direction:column;gap:3px}.royal-admin-team-data-head span{font-weight:800}.royal-admin-team-data-head small{color:#8fa3b1}
      .royal-admin-team-status{padding:7px 10px;border-radius:999px;background:#1c3546;color:#d7e7f2;font-size:12px;white-space:nowrap}
      .royal-admin-team-counters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      .royal-admin-team-counter{min-width:0;padding:13px 10px;border-radius:15px;background:#0b1821;border:1px solid #203b4c;text-align:center}
      .royal-admin-team-counter strong{display:block;font-size:25px;line-height:1;color:#fff}.royal-admin-team-counter span{display:block;margin-top:6px;color:#a9bbc7;font-size:12px;line-height:1.2}
      .royal-admin-team-meta{display:grid;gap:8px;margin-top:12px}.royal-admin-team-meta>div{display:flex;justify-content:space-between;gap:12px;padding:10px 2px;border-bottom:1px solid rgba(113,147,167,.14)}
      .royal-admin-team-meta>div:last-child{border-bottom:0}.royal-admin-team-meta span{color:#8fa3b1}.royal-admin-team-meta strong{text-align:right;color:#e9f1f6;overflow-wrap:anywhere}
    `;
    document.head.appendChild(style);
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
        <section class="royal-admin-team-detail-shell" data-admin-team="1" data-admin-team-name="${html(team.name)}" data-admin-team-full-game="${html(team.game)}">
          <div class="royal-admin-summary-main" hidden><strong>${html(team.name)}</strong><small>${html(team.game)}</small></div>
          <div class="team-photo-box photo-error">
            <img class="team-photo" alt="${html(team.name)}" data-admin-media-kind="team" data-team-name="${html(team.name)}" data-team-game="${html(team.game)}">
            <div class="team-photo-fallback">🏰</div>
          </div>
          <div class="team-detail-head"><h2>${html(team.name)}</h2><div class="muted">${html(team.game)}</div></div>
          <div class="team-stats"><span><b>${members.length}</b><small>участников</small></span><span><b>${leaders}</b><small>лидеров</small></span><span><b>${assistants}</b><small>помощников</small></span></div>
          ${adminStats(team)}
          <button type="button" class="royal-admin-team-edit" data-admin-edit-team="1">✏️ Редактировать команду</button>
          <h3 class="subheading">Состав команды</h3>
          <div class="team-members-list">${members.length ? members.map(p => memberCard(p, team.name, team.game)).join('') : '<div class="empty-state">Участники не найдены</div>'}</div>
        </section>`;

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

  installCss();
  window.RoyalAdminTeamDetailV0600 = { version:VERSION, open:openTeam, clear:() => { payload = null; } };
})();
