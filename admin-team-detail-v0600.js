/* Royal CRM Mini App — v0.6 admin team detail
 * Admin team page keeps the normal team-detail visual language, but reads the
 * protected private admin snapshot so paused/inactive teams work too.
 * It additionally shows every team counter from Команды D:L, exposes the
 * existing hardened team editor and opens full all-team rankings for E/F/H/I/J/K.
 */
(() => {
  const VERSION = '0.6.0-admin-team-detail.3';
  let payload = null;
  let loading = null;

  const TEAM_METRICS = Object.freeze({
    players:{ field:'players', label:'Игроков', cardLabel:'Игроков E', column:'E' },
    specnazTrips:{ field:'specnazTrips', label:'Общий спецназ', cardLabel:'Общий спецназ F', column:'F' },
    screens:{ field:'screens', label:'Скрины', cardLabel:'Скрины H', column:'H' },
    activityBase:{ field:'activityBase', label:'Активность в базе', cardLabel:'Активность в базе I', column:'I' },
    activityOutside:{ field:'activityOutside', label:'Активность вне базы', cardLabel:'Активность вне базы J', column:'J' },
    average:{ field:'average', label:'Среднее', cardLabel:'Среднее K', column:'K' }
  });

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
  function numeric(value) {
    const raw = clean(value).replace(/\s+/g,'').replace(',','.');
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
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

  function counter(metricKey, value) {
    const metric = TEAM_METRICS[metricKey];
    if (!metric) return '';
    return `<button type="button" class="royal-admin-team-counter" data-admin-team-ranking-metric="${html(metricKey)}" aria-label="Открыть рейтинг: ${html(metric.label)}"><strong>${html(show(value))}</strong><span>${html(metric.cardLabel)}</span><small>Рейтинг ›</small></button>`;
  }

  function adminStats(team) {
    return `
      <section class="royal-admin-team-data">
        <div class="royal-admin-team-data-head">
          <div><span>🔒 Данные админской таблицы</span><small>Лист «Команды», поля D:L</small></div>
          <span class="royal-admin-team-status">${html(show(team?.status))}</span>
        </div>
        <div class="royal-admin-team-counters">
          ${counter('players', team?.players)}
          ${counter('specnazTrips', team?.specnazTrips)}
          ${counter('screens', team?.screens)}
          ${counter('activityBase', team?.activityBase)}
          ${counter('activityOutside', team?.activityOutside)}
          ${counter('average', team?.average)}
        </div>
        <div class="royal-admin-team-meta">
          <div><span>Лидер / подпись D</span><strong>${html(show(team?.leader))}</strong></div>
          <div><span>Сортировка G</span><strong>${html(show(team?.sort))}</strong></div>
          <div><span>Статус L</span><strong>${html(show(team?.status))}</strong></div>
          <div><span>Строка таблицы</span><strong>${html(show(team?.row))}</strong></div>
        </div>
      </section>`;
  }

  function rankingRow(team, index, metric, sourceName, sourceGame) {
    const current = norm(team?.name) === norm(sourceName) && game(team?.game) === game(sourceGame);
    const status = show(team?.status);
    return `<button type="button" class="royal-admin-team-ranking-row${current ? ' is-current' : ''}" data-admin-ranking-team="1" data-team-name="${html(team?.name)}" data-team-game="${html(team?.game)}">
      <span class="royal-admin-team-ranking-place">${index + 1}</span>
      <span class="royal-admin-team-ranking-main"><strong>${html(show(team?.name))}</strong><small>${html(game(team?.game))} · ${html(status)}</small></span>
      <strong class="royal-admin-team-ranking-value">${html(show(team?.[metric.field]))}</strong>
      <span class="royal-admin-team-ranking-arrow">›</span>
    </button>`;
  }

  function installCss() {
    if (document.querySelector('style[data-admin-team-detail-v0600="3"]')) return;
    document.querySelector('style[data-admin-team-detail-v0600="2"]')?.remove();
    const style = document.createElement('style');
    style.dataset.adminTeamDetailV0600 = '3';
    style.textContent = `
      .royal-admin-team-detail-shell{display:block}
      .royal-admin-team-edit{width:100%;margin:18px 0 10px;border:1px solid #a34855;border-radius:18px;padding:15px 18px;background:linear-gradient(135deg,#5a202b,#7a2c3a);color:#fff;font:800 17px/1.1 inherit;box-shadow:0 10px 30px rgba(77,19,30,.18)}
      .royal-admin-team-data{margin:18px 0 20px;padding:16px;border:1px solid #274657;border-radius:20px;background:#0f202b}
      .royal-admin-team-data-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
      .royal-admin-team-data-head>div{display:flex;flex-direction:column;gap:3px}.royal-admin-team-data-head span{font-weight:800}.royal-admin-team-data-head small{color:#8fa3b1}
      .royal-admin-team-status{padding:7px 10px;border-radius:999px;background:#1c3546;color:#d7e7f2;font-size:12px;white-space:nowrap}
      .royal-admin-team-counters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      .royal-admin-team-counter{appearance:none;-webkit-appearance:none;min-width:0;padding:13px 10px;border-radius:15px;background:#0b1821;border:1px solid #203b4c;text-align:center;color:inherit;font:inherit;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:rgba(84,169,235,.14)}
      .royal-admin-team-counter:active{transform:scale(.985);background:#102633}.royal-admin-team-counter strong{display:block;font-size:25px;line-height:1;color:#fff}.royal-admin-team-counter span{display:block;margin-top:6px;color:#a9bbc7;font-size:12px;line-height:1.2}.royal-admin-team-counter small{display:block;margin-top:7px;color:#5aa8dd;font-size:11px;font-weight:800}
      .royal-admin-team-meta{display:grid;gap:8px;margin-top:12px}.royal-admin-team-meta>div{display:flex;justify-content:space-between;gap:12px;padding:10px 2px;border-bottom:1px solid rgba(113,147,167,.14)}
      .royal-admin-team-meta>div:last-child{border-bottom:0}.royal-admin-team-meta span{color:#8fa3b1}.royal-admin-team-meta strong{text-align:right;color:#e9f1f6;overflow-wrap:anywhere}
      .royal-admin-team-ranking-shell{display:block;padding-bottom:18px}.royal-admin-team-ranking-head{margin:18px 0 14px}.royal-admin-team-ranking-head h2{margin:0;color:#fff;font-size:29px;line-height:1.05}.royal-admin-team-ranking-head strong{display:block;margin-top:8px;color:#65b8ef;font-size:18px}.royal-admin-team-ranking-head small{display:block;margin-top:5px;color:#8fa3b1;font-size:13px}
      .royal-admin-team-ranking-summary{margin:12px 0 15px;padding:10px 13px;border:1px solid #274657;border-radius:14px;background:#0f202b;color:#a9bbc7;font-size:13px}
      .royal-admin-team-ranking-list{display:grid;gap:8px}.royal-admin-team-ranking-row{appearance:none;-webkit-appearance:none;width:100%;display:grid;grid-template-columns:42px minmax(0,1fr) auto 18px;align-items:center;gap:10px;padding:12px 11px;border:1px solid #263f4e;border-radius:16px;background:#0d1c26;color:#fff;text-align:left;font:inherit;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:rgba(84,169,235,.14)}
      .royal-admin-team-ranking-row:active{transform:scale(.992);background:#112532}.royal-admin-team-ranking-row.is-current{border-color:#d3ad43;box-shadow:0 0 0 1px rgba(211,173,67,.24) inset;background:linear-gradient(135deg,#142938,#182a2e)}
      .royal-admin-team-ranking-place{display:grid;place-items:center;width:38px;height:38px;border-radius:50%;background:#183144;color:#91b5cb;font-weight:900}.royal-admin-team-ranking-row:nth-child(1) .royal-admin-team-ranking-place{background:#5a4616;color:#ffd65a}.royal-admin-team-ranking-row:nth-child(2) .royal-admin-team-ranking-place{background:#37434b;color:#e1edf4}.royal-admin-team-ranking-row:nth-child(3) .royal-admin-team-ranking-place{background:#4d3526;color:#e7ae83}
      .royal-admin-team-ranking-main{min-width:0;display:flex;flex-direction:column;gap:3px}.royal-admin-team-ranking-main strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:15px}.royal-admin-team-ranking-main small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#8fa3b1;font-size:12px}.royal-admin-team-ranking-value{font-size:20px;color:#fff;text-align:right;max-width:88px;overflow:hidden;text-overflow:ellipsis}.royal-admin-team-ranking-arrow{color:#6f8ea1;font-size:24px}
    `;
    document.head.appendChild(style);
  }

  async function openRanking(metricKey, sourceName='', sourceGame='') {
    const metric = TEAM_METRICS[metricKey];
    const panel = document.getElementById('panel');
    if (!metric || !panel) return;
    captureAdminForBack();
    panel.hidden = false;
    panel.innerHTML = '<button type="button" class="royal-back-button" data-royal-back="1">← Назад</button><div class="empty-state">Строим рейтинг…</div>';
    try { setActiveNav('teams'); } catch (_) {}

    try {
      const data = await adminData(false);
      const teams = [...(Array.isArray(data?.adminData?.teams) ? data.adminData.teams : [])]
        .sort((a,b) => {
          const diff = numeric(b?.[metric.field]) - numeric(a?.[metric.field]);
          if (diff) return diff;
          const byName = clean(a?.name).localeCompare(clean(b?.name), 'ru', { sensitivity:'base' });
          if (byName) return byName;
          return game(a?.game).localeCompare(game(b?.game), 'ru', { sensitivity:'base' });
        });

      panel.innerHTML = `
        <button type="button" class="royal-back-button" data-royal-back="1">← Назад</button>
        <section class="royal-admin-team-ranking-shell" data-admin-team-ranking-screen="1">
          <div class="royal-admin-team-ranking-head"><h2>Рейтинг команд</h2><strong>${html(metric.label)}</strong><small>Лист «Команды» · поле ${html(metric.column)}</small></div>
          <div class="royal-admin-team-ranking-summary">${teams.length} команд · от большего значения к меньшему</div>
          <div class="royal-admin-team-ranking-list">${teams.length ? teams.map((team,index) => rankingRow(team,index,metric,sourceName,sourceGame)).join('') : '<div class="empty-state">Команды не найдены</div>'}</div>
        </section>`;
      requestAnimationFrame(() => { try { window.scrollTo(0,0); } catch (_) {} });
    } catch (error) {
      panel.innerHTML = `<button type="button" class="royal-back-button" data-royal-back="1">← Назад</button><h2>Рейтинг недоступен</h2><p class="muted">${html(error?.code || error?.message || 'UNKNOWN')}</p>`;
    }
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
      requestAnimationFrame(() => { try { window.scrollTo(0,0); } catch (_) {} });
    } catch (error) {
      panel.innerHTML = `<button type="button" class="royal-back-button" data-royal-back="1">← Назад</button><h2>Команда не найдена</h2><p class="muted">${html(error?.code || error?.message || 'UNKNOWN')}</p>`;
    }
  }

  document.addEventListener('click', event => {
    const metricButton = event.target?.closest?.('[data-admin-team-ranking-metric]');
    if (metricButton) {
      const shell = metricButton.closest('[data-admin-team="1"]');
      const metricKey = clean(metricButton.dataset.adminTeamRankingMetric);
      const sourceName = clean(shell?.dataset?.adminTeamName);
      const sourceGame = game(shell?.dataset?.adminTeamFullGame);
      if (TEAM_METRICS[metricKey]) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openRanking(metricKey, sourceName, sourceGame);
      }
      return;
    }

    const rankingTeam = event.target?.closest?.('[data-admin-ranking-team="1"]');
    if (rankingTeam) {
      const name = clean(rankingTeam.dataset.teamName);
      const teamGame = game(rankingTeam.dataset.teamGame);
      if (name && teamGame) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openTeam(name, teamGame);
      }
      return;
    }

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
  window.RoyalAdminTeamDetailV0600 = { version:VERSION, open:openTeam, ranking:openRanking, clear:() => { payload = null; } };
})();
