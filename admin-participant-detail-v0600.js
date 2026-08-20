/* Royal CRM Mini App — v0.6 admin participant detail
 * - participant list shows memberships instead of visible Telegram ID;
 * - tap opens normal-style participant page backed by private admin snapshot;
 * - U/AB/AC/AD open all-participant rankings;
 * - existing hardened participant editor is reused, no second write flow.
 */
(() => {
  const VERSION = '0.6.0-admin-participant-detail.1';
  let payload = null;
  let loading = null;
  let decorating = false;
  let scheduled = 0;

  const METRICS = Object.freeze({
    specnaz:{ field:'specnaz', label:'Спецназ', cardLabel:'Спецназ U', column:'U' },
    screens:{ field:'screens', label:'Скрины', cardLabel:'Скрины AB', column:'AB' },
    activityBase:{ field:'activityBase', label:'Активность в базе', cardLabel:'Активность в базе AC', column:'AC' },
    activityOutside:{ field:'activityOutside', label:'Активность вне базы', cardLabel:'Активность вне базы AD', column:'AD' }
  });

  const clean = value => String(value == null ? '' : value).trim();
  const html = value => {
    try { return typeof esc === 'function' ? esc(value) : clean(value); }
    catch (_) { return clean(value); }
  };
  function norm(value) { return clean(value).toLocaleLowerCase('ru-RU').replace(/ё/g,'е'); }
  function id(value) {
    const match = clean(value).replace(/\.0$/, '').match(/\d{5,20}/);
    return match ? match[0] : '';
  }
  function show(value) {
    if (value === 0 || value === '0') return '0';
    return clean(value) || '—';
  }
  function numeric(value) {
    const parsed = Number(clean(value).replace(/\s+/g,'').replace(',','.'));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  function game(value) {
    const raw = clean(value);
    const low = norm(raw);
    if (low === 'рм' || low.includes('royal match')) return 'Royal Match';
    if (low === 'рк' || low.includes('royal kingdom')) return 'Royal Kingdom';
    return raw;
  }
  function displayName(p) {
    return clean(p?.name || p?.telegramName || p?.username || p?.telegramId || 'Без имени');
  }
  function firstLetter(value) {
    const text = clean(value).replace(/^@/, '');
    return text ? Array.from(text)[0].toUpperCase() : '👤';
  }
  function statusText(p) { return clean(p?.chatState || p?.status || ''); }
  function statusClass(value) {
    const text = norm(value);
    if (text === 'вышел') return ' is-exit';
    if (text === 'в чате') return ' is-in';
    return '';
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

  function participantById(data, telegramId) {
    const wanted = id(telegramId);
    if (!wanted) return null;
    return (Array.isArray(data?.adminData?.participants) ? data.adminData.participants : [])
      .find(p => id(p?.telegramId) === wanted) || null;
  }

  function publicParticipant(telegramId) {
    const wanted = id(telegramId);
    if (!wanted) return null;
    return (Array.isArray(snapshotState?.participants) ? snapshotState.participants : [])
      .find(p => id(p?.telegramId) === wanted) || null;
  }

  function captureForBack() {
    const panel = document.getElementById('panel');
    if (!panel) return;
    const marker = document.createElement('i');
    marker.className = 'participant-detail-card';
    marker.hidden = true;
    marker.dataset.adminParticipantNavMarker = '1';
    panel.appendChild(marker);
    try { window.RoyalNav?.pushCurrent?.(); } catch (_) {}
    marker.remove();
  }

  function participantIdFromRecord(record) {
    const cached = id(record?.dataset?.adminParticipantId);
    if (cached) return cached;
    const text = clean(record?.querySelector('summary .royal-admin-summary-main small')?.textContent);
    const match = text.match(/(?:^|·\s*)ID\s+(\d{5,20})(?:\s|$)/i);
    const found = match ? match[1] : '';
    if (found && record) record.dataset.adminParticipantId = found;
    return found;
  }

  function teamNames(p) {
    const list = Array.isArray(p?.memberships) ? p.memberships : [];
    const out = [];
    const seen = new Set();
    list.forEach(m => {
      const label = clean(m?.team || m?.role || m?.game);
      const key = norm(label);
      if (!label || seen.has(key)) return;
      seen.add(key);
      out.push(label);
    });
    return out;
  }

  function decorateList(data) {
    if (decorating) return;
    decorating = true;
    try {
      const participants = Array.isArray(data?.adminData?.participants) ? data.adminData.participants : [];
      const byId = new Map(participants.map(p => [id(p?.telegramId), p]).filter(([key]) => key));
      document.querySelectorAll('[data-admin-participant="1"]').forEach(record => {
        const telegramId = participantIdFromRecord(record);
        const p = telegramId ? byId.get(telegramId) : null;
        if (!p) return;
        record.dataset.adminParticipantId = telegramId;
        record.dataset.adminSourceRow = String(Number(p?.row || 0) || '');
        record.open = false;

        const small = record.querySelector('summary .royal-admin-summary-main small');
        if (!small) return;
        const usernameRaw = clean(p?.username).replace(/^@+/, '');
        const names = teamNames(p);
        const teamsText = names.length ? names.join(' · ') : 'Команды не указаны';
        small.classList.add('royal-admin-participant-list-meta');
        small.innerHTML = `${usernameRaw ? `<span class="royal-admin-participant-list-user">@${html(usernameRaw)}</span>` : ''}<span class="royal-admin-participant-list-teams">🏰 ${html(teamsText)}</span><span class="royal-admin-participant-hidden-id"> · ID ${html(telegramId)}</span>`;
      });
    } finally {
      decorating = false;
    }
  }

  function scheduleDecorate() {
    if (scheduled) return;
    scheduled = window.setTimeout(async () => {
      scheduled = 0;
      if (!document.querySelector('[data-admin-participant="1"]')) return;
      try { decorateList(await adminData(false)); } catch (_) {}
    }, 0);
  }

  function rankCompact(rank, score, tiny=false) {
    try { return window.RoyalRank?.compact?.(rank, score, { tiny, label:true }) || ''; }
    catch (_) { return ''; }
  }
  function rankPremium(rank, score) {
    try { return window.RoyalRank?.premium?.(rank, score) || ''; }
    catch (_) { return ''; }
  }

  function membershipButton(m) {
    const team = clean(m?.team);
    const role = clean(m?.role || 'Без роли');
    const nickname = clean(m?.nickname);
    const teamGame = game(m?.game);
    if (!team) {
      return `<div class="participant-profile-membership special royal-admin-participant-membership-static"><b>${html(role || 'Без команды')}</b><small>${html([nickname,teamGame].filter(Boolean).join(' · '))}</small></div>`;
    }
    return `<button type="button" class="participant-profile-membership royal-admin-participant-team-link" data-admin-participant-team="1" data-team-name="${html(team)}" data-team-game="${html(teamGame)}"><b>${html(team)}</b><small>${html([role,nickname,teamGame].filter(Boolean).join(' · '))}</small></button>`;
  }

  function metricCard(key, value) {
    const metric = METRICS[key];
    if (!metric) return '';
    return `<button type="button" class="royal-admin-participant-counter" data-admin-participant-ranking-metric="${html(key)}"><strong>${html(show(value))}</strong><span>${html(metric.cardLabel)}</span><small>Рейтинг ›</small></button>`;
  }

  function adminFields(p) {
    return `<section class="royal-admin-participant-data">
      <div class="royal-admin-participant-data-head"><div><span>🔒 Данные админской таблицы</span><small>База участников</small></div><span class="royal-admin-participant-state${statusClass(statusText(p))}">${html(show(statusText(p)))}</span></div>
      <div class="royal-admin-participant-counters">
        ${metricCard('specnaz', p?.specnaz)}
        ${metricCard('screens', p?.screens)}
        ${metricCard('activityBase', p?.activityBase)}
        ${metricCard('activityOutside', p?.activityOutside)}
      </div>
      <div class="royal-admin-participant-meta">
        <div><span>Строка базы</span><strong>${html(show(p?.row))}</strong></div>
        <div><span>Имя CRM</span><strong>${html(show(p?.name))}</strong></div>
        <div><span>Имя Telegram</span><strong>${html(show(p?.telegramName))}</strong></div>
        <div><span>@username</span><strong>${html(show(p?.username))}</strong></div>
        <div><span>Telegram ID</span><strong>${html(show(p?.telegramId))}</strong></div>
        <div><span>Статус T</span><strong>${html(show(p?.status))}</strong></div>
        <div><span>Дата V</span><strong>${html(show(p?.date))}</strong></div>
        <div><span>Дата изменения AE</span><strong>${html(show(p?.lastChange))}</strong></div>
        <div><span>Состояние чата AF</span><strong>${html(show(p?.chatState))}</strong></div>
      </div>
    </section>`;
  }

  function rankingRow(p, index, metric, sourceId) {
    const telegramId = id(p?.telegramId);
    const current = telegramId === id(sourceId);
    const teams = teamNames(p).slice(0,2).join(' · ') || 'Без команды';
    return `<button type="button" class="royal-admin-participant-ranking-row${current ? ' is-current' : ''}" data-admin-ranking-participant="1" data-telegram-id="${html(telegramId)}">
      <span class="royal-admin-participant-ranking-place">${index + 1}</span>
      <span class="royal-admin-participant-ranking-main"><strong>${html(displayName(p))}</strong><small>${html(show(statusText(p)))} · ${html(teams)}</small></span>
      <strong class="royal-admin-participant-ranking-value">${html(show(p?.[metric.field]))}</strong>
      <span class="royal-admin-participant-ranking-arrow">›</span>
    </button>`;
  }

  async function openRanking(metricKey, sourceId='') {
    const metric = METRICS[metricKey];
    const panel = document.getElementById('panel');
    if (!metric || !panel) return;
    captureForBack();
    panel.hidden = false;
    panel.innerHTML = '<button type="button" class="royal-back-button" data-royal-back="1">← Назад</button><div class="empty-state">Строим рейтинг…</div>';
    try { setActiveNav('players'); } catch (_) {}

    try {
      const data = await adminData(false);
      const participants = [...(Array.isArray(data?.adminData?.participants) ? data.adminData.participants : [])]
        .sort((a,b) => {
          const diff = numeric(b?.[metric.field]) - numeric(a?.[metric.field]);
          if (diff) return diff;
          const byName = displayName(a).localeCompare(displayName(b), 'ru', { sensitivity:'base' });
          if (byName) return byName;
          return id(a?.telegramId).localeCompare(id(b?.telegramId));
        });
      const currentIndex = participants.findIndex(p => id(p?.telegramId) === id(sourceId));
      panel.innerHTML = `
        <button type="button" class="royal-back-button" data-royal-back="1">← Назад</button>
        <section class="royal-admin-participant-ranking-shell">
          <div class="royal-admin-participant-ranking-head"><h2>Рейтинг участников</h2><strong>${html(metric.label)} · ${html(metric.column)}</strong><small>От большего значения к меньшему</small></div>
          <div class="royal-admin-participant-ranking-summary">Всего: ${participants.length}${currentIndex >= 0 ? ` · текущий участник: № ${currentIndex + 1}` : ''}</div>
          <div class="royal-admin-participant-ranking-list">${participants.map((p,index) => rankingRow(p,index,metric,sourceId)).join('')}</div>
        </section>`;
      requestAnimationFrame(() => { try { window.scrollTo(0,0); } catch (_) {} });
    } catch (error) {
      panel.innerHTML = `<button type="button" class="royal-back-button" data-royal-back="1">← Назад</button><h2>Рейтинг недоступен</h2><p class="muted">${html(error?.code || error?.message || 'UNKNOWN')}</p>`;
    }
  }

  async function openParticipant(telegramId) {
    const wanted = id(telegramId);
    const panel = document.getElementById('panel');
    if (!wanted || !panel) return;
    captureForBack();
    panel.hidden = false;
    panel.innerHTML = '<button type="button" class="royal-back-button" data-royal-back="1">← Назад</button><div class="empty-state">Загружаем участника…</div>';
    try { setActiveNav('players'); } catch (_) {}

    try {
      const data = await adminData(false);
      const p = participantById(data, wanted);
      if (!p) throw new Error('PARTICIPANT_NOT_FOUND');
      const pub = publicParticipant(wanted);
      const name = displayName(p);
      const username = clean(p?.username).replace(/^@+/, '');
      const score = numeric(p?.specnaz);
      const rank = clean(pub?.specnazRank);
      const memberships = Array.isArray(p?.memberships) ? p.memberships : [];
      const rankInline = rank ? rankCompact(rank, score, true) : '';
      const premium = rank ? rankPremium(rank, score) : '';
      let usernameAction = '';
      try { if (typeof usernameButton === 'function') usernameAction = usernameButton(p, true); } catch (_) {}
      if (!usernameAction && username) usernameAction = `<span class="username-link">@${html(username)}</span>`;

      panel.innerHTML = `
        <button type="button" class="royal-back-button" data-royal-back="1">← Назад</button>
        <section class="participant-detail-card royal-admin-participant-detail" data-admin-participant="1" data-admin-participant-id="${html(wanted)}">
          <div class="royal-admin-summary-main" hidden><strong>${html(name)}</strong><small> · ID ${html(wanted)}</small></div>
          <div class="participant-detail-head">
            <div class="participant-detail-avatar fallback" data-telegram-id="${html(wanted)}"><span>${html(firstLetter(name))}</span><img alt="" data-admin-media-kind="avatar" data-telegram-id="${html(wanted)}"></div>
            <div class="participant-detail-identity">${rankInline ? `<div class="participant-rank-inline">${rankInline}</div>` : ''}<h2>${html(name)}</h2>${usernameAction}<div class="royal-admin-participant-state${statusClass(statusText(p))}">${html(show(statusText(p)))}</div></div>
          </div>
          ${premium}
          <div class="participant-detail-memberships royal-admin-participant-memberships">${memberships.length ? memberships.map(membershipButton).join('') : '<span class="muted">Команды не указаны</span>'}</div>
          ${adminFields(p)}
          <button type="button" class="royal-admin-participant-edit" data-admin-edit-participant="1">✏️ Редактировать участника</button>
        </section>`;

      const avatar = panel.querySelector('[data-admin-media-kind="avatar"]');
      if (avatar) {
        const wrap = avatar.closest('.participant-detail-avatar');
        avatar.addEventListener('load', () => wrap?.classList.remove('fallback'));
        avatar.addEventListener('error', () => wrap?.classList.add('fallback'));
        window.RoyalAdminPersistentMediaV0600?.observe?.(avatar);
      }
      requestAnimationFrame(() => { try { window.scrollTo(0,0); } catch (_) {} });
    } catch (error) {
      panel.innerHTML = `<button type="button" class="royal-back-button" data-royal-back="1">← Назад</button><h2>Участник не найден</h2><p class="muted">${html(error?.code || error?.message || 'UNKNOWN')}</p>`;
    }
  }

  function installCss() {
    if (document.querySelector('style[data-admin-participant-detail-v0600="1"]')) return;
    const style = document.createElement('style');
    style.dataset.adminParticipantDetailV0600 = '1';
    style.textContent = `
      .royal-admin-participant-list-meta{display:grid!important;gap:3px;min-width:0}.royal-admin-participant-list-user{color:#8fa3b1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.royal-admin-participant-list-teams{color:#9bb5c5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.royal-admin-participant-hidden-id{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
      .royal-admin-participant-detail{display:block}.royal-admin-participant-state{display:inline-flex;align-items:center;width:max-content;margin-top:7px;padding:5px 9px;border-radius:999px;background:#1e3646;color:#c7dbea;font-size:11px;font-weight:900;text-transform:uppercase}.royal-admin-participant-state.is-in{background:#1d3545;color:#d5e5ef}.royal-admin-participant-state.is-exit{background:#4b2830;color:#ffc3cc}
      .royal-admin-participant-memberships{display:flex;flex-wrap:wrap;gap:8px}.royal-admin-participant-team-link{appearance:none;-webkit-appearance:none;text-align:left;font:inherit;color:inherit;cursor:pointer}.royal-admin-participant-membership-static{display:inline-flex;flex-direction:column}
      .royal-admin-participant-data{margin:18px 0 16px;padding:16px;border:1px solid #274657;border-radius:20px;background:#0f202b}.royal-admin-participant-data-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}.royal-admin-participant-data-head>div{display:flex;flex-direction:column;gap:3px}.royal-admin-participant-data-head span{font-weight:800}.royal-admin-participant-data-head small{color:#8fa3b1}
      .royal-admin-participant-counters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.royal-admin-participant-counter{appearance:none;-webkit-appearance:none;min-width:0;padding:13px 10px;border-radius:15px;background:#0b1821;border:1px solid #203b4c;text-align:center;color:inherit;font:inherit;cursor:pointer;touch-action:manipulation}.royal-admin-participant-counter:active{transform:scale(.985);background:#102633}.royal-admin-participant-counter strong{display:block;font-size:25px;line-height:1;color:#fff}.royal-admin-participant-counter span{display:block;margin-top:6px;color:#a9bbc7;font-size:12px;line-height:1.2}.royal-admin-participant-counter small{display:block;margin-top:7px;color:#5aa8dd;font-size:11px;font-weight:800}
      .royal-admin-participant-meta{display:grid;gap:8px;margin-top:12px}.royal-admin-participant-meta>div{display:flex;justify-content:space-between;gap:12px;padding:10px 2px;border-bottom:1px solid rgba(113,147,167,.14)}.royal-admin-participant-meta>div:last-child{border-bottom:0}.royal-admin-participant-meta span{color:#8fa3b1}.royal-admin-participant-meta strong{text-align:right;color:#e9f1f6;overflow-wrap:anywhere;max-width:58%}
      .royal-admin-participant-edit{width:100%;margin:14px 0 4px;border:1px solid #a34855;border-radius:18px;padding:15px 18px;background:linear-gradient(135deg,#5a202b,#7a2c3a);color:#fff;font:800 17px/1.1 inherit}
      .royal-admin-participant-ranking-shell{display:block;padding-bottom:18px}.royal-admin-participant-ranking-head{margin:18px 0 14px}.royal-admin-participant-ranking-head h2{margin:0;color:#fff;font-size:29px;line-height:1.05}.royal-admin-participant-ranking-head strong{display:block;margin-top:8px;color:#65b8ef;font-size:18px}.royal-admin-participant-ranking-head small{display:block;margin-top:5px;color:#8fa3b1;font-size:13px}.royal-admin-participant-ranking-summary{margin:12px 0 15px;padding:10px 13px;border:1px solid #274657;border-radius:14px;background:#0f202b;color:#a9bbc7;font-size:13px}
      .royal-admin-participant-ranking-list{display:grid;gap:8px}.royal-admin-participant-ranking-row{appearance:none;-webkit-appearance:none;width:100%;display:grid;grid-template-columns:42px minmax(0,1fr) auto 18px;align-items:center;gap:10px;padding:12px 11px;border:1px solid #263f4e;border-radius:16px;background:#0d1c26;color:#fff;text-align:left;font:inherit}.royal-admin-participant-ranking-row.is-current{border-color:#5aa8dd;box-shadow:0 0 0 1px rgba(90,168,221,.25) inset;background:#122632}.royal-admin-participant-ranking-place{display:grid;place-items:center;width:38px;height:38px;border-radius:50%;background:#183144;color:#91b5cb;font-weight:900}.royal-admin-participant-ranking-row:nth-child(1) .royal-admin-participant-ranking-place{background:#5a4616;color:#ffd65a}.royal-admin-participant-ranking-row:nth-child(2) .royal-admin-participant-ranking-place{background:#37434b;color:#e1edf4}.royal-admin-participant-ranking-row:nth-child(3) .royal-admin-participant-ranking-place{background:#4d3526;color:#e7ae83}.royal-admin-participant-ranking-main{min-width:0;display:flex;flex-direction:column;gap:3px}.royal-admin-participant-ranking-main strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:15px}.royal-admin-participant-ranking-main small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#8fa3b1;font-size:12px}.royal-admin-participant-ranking-value{font-size:20px;color:#fff;text-align:right;max-width:88px}.royal-admin-participant-ranking-arrow{color:#6f8ea1;font-size:24px}
    `;
    document.head.appendChild(style);
  }

  document.addEventListener('click', event => {
    const metricButton = event.target?.closest?.('[data-admin-participant-ranking-metric]');
    if (metricButton) {
      const shell = metricButton.closest('[data-admin-participant="1"]');
      const metricKey = clean(metricButton.dataset.adminParticipantRankingMetric);
      const sourceId = id(shell?.dataset?.adminParticipantId);
      if (METRICS[metricKey]) {
        event.preventDefault(); event.stopImmediatePropagation();
        openRanking(metricKey, sourceId);
      }
      return;
    }

    const rankingParticipant = event.target?.closest?.('[data-admin-ranking-participant="1"]');
    if (rankingParticipant) {
      const telegramId = id(rankingParticipant.dataset.telegramId);
      if (telegramId) {
        event.preventDefault(); event.stopImmediatePropagation();
        openParticipant(telegramId);
      }
      return;
    }

    const teamLink = event.target?.closest?.('[data-admin-participant-team="1"]');
    if (teamLink) {
      const name = clean(teamLink.dataset.teamName);
      const teamGame = game(teamLink.dataset.teamGame);
      if (name && teamGame && window.RoyalAdminTeamDetailV0600?.open) {
        event.preventDefault(); event.stopImmediatePropagation();
        window.RoyalAdminTeamDetailV0600.open(name, teamGame);
      }
      return;
    }

    if (event.target?.closest?.('[data-admin-edit-participant="1"]')) return;
    const summary = event.target?.closest?.('[data-admin-participant="1"] > summary');
    if (!summary) return;
    if (event.target?.closest?.('button,a,input,select,textarea')) return;
    const telegramId = participantIdFromRecord(summary.closest('[data-admin-participant="1"]'));
    if (!telegramId) return;
    event.preventDefault(); event.stopImmediatePropagation();
    openParticipant(telegramId);
  }, true);

  const observer = new MutationObserver(scheduleDecorate);
  observer.observe(document.body,{childList:true,subtree:true});

  installCss();
  scheduleDecorate();
  window.RoyalAdminParticipantDetailV0600 = { version:VERSION, open:openParticipant, ranking:openRanking, clear:() => { payload = null; } };
})();
