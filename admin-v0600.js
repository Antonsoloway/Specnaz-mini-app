/* Royal CRM Mini App — Admin Mode v0.6.0 (read phase) */
(() => {
  const VERSION = '0.6.0-read.3';
  const ADMIN_READ_RETRY_DELAYS_MS = [0, 700, 1600];
  let adminPayload = null;
  let activeTab = 'participants';
  let participantFilter = 'all';
  let teamStatusFilter = 'all';
  let teamGameFilter = 'all';

  const safeEsc = value => {
    try { return typeof esc === 'function' ? esc(value) : String(value ?? ''); }
    catch (_) { return String(value ?? ''); }
  };

  function isUiAdmin() {
    return !!(
      authState?.role?.isChatAdmin ||
      authState?.role?.code === 'admin' ||
      authState?.permissions?.canManageAll
    );
  }

  function clean(value) { return String(value == null ? '' : value).trim(); }
  function lower(value) { return clean(value).toLocaleLowerCase('ru-RU').replace(/ё/g, 'е'); }
  function gameShort(value) {
    const text = lower(value);
    if (text === 'рм' || text.includes('royal match')) return 'rm';
    if (text === 'рк' || text.includes('royal kingdom')) return 'rk';
    return '';
  }

  function statusClass(value) {
    const text = lower(value);
    if (text === 'активен') return 'royal-admin-status--active';
    if (text === 'на паузе') return 'royal-admin-status--pause';
    if (text === 'неактивен') return 'royal-admin-status--inactive';
    if (text === 'вышел') return 'royal-admin-status--exit';
    return '';
  }

  function displayValue(value) {
    if (value === 0) return '0';
    return clean(value) || '—';
  }

  function isTransientAdminReadError(error) {
    const code = clean(error?.code);
    const message = clean(error?.message).toLocaleLowerCase('ru-RU');
    return !error?.httpStatus ||
      [502, 503, 504].includes(Number(error?.httpStatus)) ||
      ['WORKER_TIMEOUT','NO_GAS_FALLBACK_FOR_ROUTE','HTTP_502','HTTP_503','HTTP_504'].includes(code) ||
      message.includes('failed to fetch') || message.includes('networkerror') || message.includes('load failed');
  }

  function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  async function fetchAdminDataOnce() {
    const response = await fetch(`${API_URL}/admin-data`, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-store',
      headers: { Authorization: `Bearer ${sessionToken}` }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok || !data?.adminData) {
      const error = new Error(data?.message || `HTTP ${response.status}`);
      error.code = data?.error || `HTTP_${response.status}`;
      error.httpStatus = response.status;
      throw error;
    }
    return data;
  }

  function decorateEntry() {
    const grid = document.querySelector('.grid');
    if (!grid) return;
    let tile = grid.querySelector('[data-admin-mode="1"]');
    if (!isUiAdmin()) {
      if (tile) tile.remove();
      return;
    }
    if (tile) return;

    tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'tile royal-admin-tile';
    tile.dataset.adminMode = '1';
    tile.innerHTML = '<span>🛡️</span><b>Админ режим</b><small>Полные данные CRM</small>';
    grid.appendChild(tile);
  }

  async function fetchAdminData(force = false) {
    if (adminPayload && !force) return adminPayload;
    if (!sessionToken) throw new Error('SESSION_MISSING');

    let lastError = null;
    for (let attempt = 0; attempt < ADMIN_READ_RETRY_DELAYS_MS.length; attempt += 1) {
      if (ADMIN_READ_RETRY_DELAYS_MS[attempt]) await wait(ADMIN_READ_RETRY_DELAYS_MS[attempt]);
      try {
        const data = await fetchAdminDataOnce();
        adminPayload = data;
        return data;
      } catch (error) {
        lastError = error;
        if (!isTransientAdminReadError(error) || attempt === ADMIN_READ_RETRY_DELAYS_MS.length - 1) break;
      }
    }

    if (isTransientAdminReadError(lastError)) {
      const error = new Error('Связь с сервером прервалась. Нажмите «Повторить».');
      error.code = 'ADMIN_NETWORK_RETRY_EXHAUSTED';
      throw error;
    }
    throw lastError || new Error('Не удалось загрузить админские данные.');
  }

  function pushOrigin() {
    try { window.RoyalNav?.pushCurrent?.(); } catch (_) {}
  }

  function setAdminNav() {
    try { setActiveNav('admin'); } catch (_) {}
  }

  function renderLoading() {
    const panel = document.getElementById('panel');
    if (!panel) return;
    panel.hidden = false;
    panel.innerHTML = `
      <button type="button" class="royal-back-button" data-royal-back="1">← Назад</button>
      <section class="royal-admin-screen">
        <div class="royal-admin-head">
          <div><div class="royal-admin-kicker">Royal CRM v0.6</div><h2>🛡 Админ режим</h2><div class="muted">Проверяем права и загружаем полные данные…</div></div>
          <span class="royal-admin-lock">🔒 ADMIN</span>
        </div>
        <div class="royal-admin-note">Данные этого раздела не берутся из публичного snapshot. Worker повторно проверяет админские права в Telegram перед каждой загрузкой.</div>
      </section>`;
    setAdminNav();
  }

  function statsHtml(data) {
    const s = data?.adminData?.stats || {};
    return `<div class="royal-admin-stats">
      <div class="royal-admin-stat"><strong>${Number(s.participants || 0)}</strong><span>участников всего</span></div>
      <div class="royal-admin-stat"><strong>${Number(s.exited || 0)}</strong><span>вышедших</span></div>
      <div class="royal-admin-stat"><strong>${Number(s.teams || 0)}</strong><span>команд всего</span></div>
      <div class="royal-admin-stat"><strong>${Number(s.inactiveTeams || 0)}</strong><span>неактивных</span></div>
    </div>`;
  }

  function shellHtml(data, body) {
    const generatedAt = clean(data?.generatedAt || data?.adminData?.generatedAt);
    return `
      <button type="button" class="royal-back-button" data-royal-back="1">← Назад</button>
      <section class="royal-admin-screen">
        <div class="royal-admin-head">
          <div>
            <div class="royal-admin-kicker">Royal CRM v0.6</div>
            <h2>🛡 Админ режим</h2>
            <div class="muted">Полные данные админской таблицы${generatedAt ? ` · ${safeEsc(generatedAt)}` : ''}</div>
          </div>
          <span class="royal-admin-lock">🔒 ADMIN</span>
        </div>
        <div class="royal-admin-actions">
          <button type="button" class="royal-admin-action is-primary" data-admin-refresh="1">↻ Обновить</button>
          <button type="button" class="royal-admin-action" data-admin-edit-mode="1">✏️ Режим редактирования</button>
        </div>
        ${statsHtml(data)}
        <div class="royal-admin-tabs">
          <button type="button" class="royal-admin-tab ${activeTab === 'participants' ? 'is-active' : ''}" data-admin-tab="participants">👥 Участники</button>
          <button type="button" class="royal-admin-tab ${activeTab === 'teams' ? 'is-active' : ''}" data-admin-tab="teams">🏰 Команды</button>
          <button type="button" class="royal-admin-tab ${activeTab === 'journal' ? 'is-active' : ''}" data-admin-tab="journal">📜 Журнал</button>
        </div>
        ${body}
      </section>`;
  }

  function participantSearchText(p) {
    const memberships = Array.isArray(p?.memberships) ? p.memberships : [];
    return lower([
      p?.name, p?.telegramName, p?.username, p?.telegramId, p?.status, p?.chatState,
      p?.specnaz, p?.screens, p?.activityBase, p?.activityOutside,
      ...memberships.flatMap(m => [m?.team, m?.teamRaw, m?.nickname, m?.role, m?.game])
    ].filter(Boolean).join(' '));
  }

  function participantStatusKey(p) {
    const state = lower(p?.chatState);
    const status = lower(p?.status);
    if (state === 'вышел' || status === 'вышел') return 'exit';
    if (state === 'в чате') return 'in';
    return 'other';
  }

  function membershipsHtml(p) {
    const list = Array.isArray(p?.memberships) ? p.memberships : [];
    const bySlot = new Map(list.map(m => [Number(m?.slot || 0), m]));
    const rows = [];
    for (let slot = 1; slot <= 5; slot += 1) {
      const m = bySlot.get(slot);
      if (!m) {
        rows.push(`<div class="royal-admin-membership royal-admin-empty-slot"><b>Слот ${slot}: пусто</b><small>Команда · Роль · Ник · Игра</small></div>`);
        continue;
      }
      rows.push(`<div class="royal-admin-membership"><b>${slot}. ${safeEsc(displayValue(m.team))}</b><small>${safeEsc(displayValue(m.role))} · ник: ${safeEsc(displayValue(m.nickname))} · ${safeEsc(displayValue(m.game))}</small></div>`);
    }
    return `<div class="royal-admin-memberships">${rows.join('')}</div>`;
  }

  function participantRecord(p) {
    const status = clean(p?.chatState || p?.status || '');
    const search = participantSearchText(p);
    const statusKey = participantStatusKey(p);
    const title = clean(p?.name || p?.telegramName || p?.username || p?.telegramId || 'Без имени');
    return `<details class="royal-admin-record" data-admin-participant="1" data-admin-search="${safeEsc(search)}" data-admin-status-key="${statusKey}">
      <summary>
        <div class="royal-admin-summary-main"><strong>${safeEsc(title)}</strong><small>${safeEsc(displayValue(p?.username))} · ID ${safeEsc(displayValue(p?.telegramId))}</small></div>
        <span class="royal-admin-status ${statusClass(status)}">${safeEsc(displayValue(status))}</span><span class="royal-admin-chevron">›</span>
      </summary>
      <div class="royal-admin-detail">
        <div class="royal-admin-field"><span>Строка базы</span><span>${safeEsc(displayValue(p?.row))}</span></div>
        <div class="royal-admin-field"><span>Имя</span><span>${safeEsc(displayValue(p?.name))}</span></div>
        <div class="royal-admin-field"><span>Имя Telegram</span><span>${safeEsc(displayValue(p?.telegramName))}</span></div>
        <div class="royal-admin-field"><span>@username</span><span>${safeEsc(displayValue(p?.username))}</span></div>
        <div class="royal-admin-field"><span>Telegram ID</span><span>${safeEsc(displayValue(p?.telegramId))}</span></div>
        <div class="royal-admin-field"><span>Статус T</span><span>${safeEsc(displayValue(p?.status))}</span></div>
        <div class="royal-admin-field"><span>Состояние чата AF</span><span>${safeEsc(displayValue(p?.chatState))}</span></div>
        ${membershipsHtml(p)}
        <div class="royal-admin-field"><span>Спецназ U</span><span>${safeEsc(displayValue(p?.specnaz))}</span></div>
        <div class="royal-admin-field"><span>Скрины AB</span><span>${safeEsc(displayValue(p?.screens))}</span></div>
        <div class="royal-admin-field"><span>Активность в базе AC</span><span>${safeEsc(displayValue(p?.activityBase))}</span></div>
        <div class="royal-admin-field"><span>Активность вне базы AD</span><span>${safeEsc(displayValue(p?.activityOutside))}</span></div>
        <div class="royal-admin-field"><span>Дата V</span><span>${safeEsc(displayValue(p?.date))}</span></div>
        <div class="royal-admin-field"><span>Дата изменения AE</span><span>${safeEsc(displayValue(p?.lastChange))}</span></div>
      </div>
    </details>`;
  }

  function renderParticipantsBody(data) {
    const list = Array.isArray(data?.adminData?.participants) ? data.adminData.participants : [];
    return `<div class="royal-admin-toolbar">
      <label class="royal-admin-search"><span>🔎</span><input type="search" data-admin-search-input="participants" placeholder="Имя, @ник, ID, команда, роль…" autocomplete="off"></label>
      <div class="royal-admin-filters">
        <button type="button" class="royal-admin-filter ${participantFilter === 'all' ? 'is-active' : ''}" data-admin-participant-filter="all">Все</button>
        <button type="button" class="royal-admin-filter ${participantFilter === 'in' ? 'is-active' : ''}" data-admin-participant-filter="in">В чате</button>
        <button type="button" class="royal-admin-filter ${participantFilter === 'exit' ? 'is-active' : ''}" data-admin-participant-filter="exit">Вышел</button>
        <button type="button" class="royal-admin-filter ${participantFilter === 'other' ? 'is-active' : ''}" data-admin-participant-filter="other">Другие</button>
      </div>
    </div><div class="royal-admin-count" data-admin-count></div><div class="royal-admin-list">${list.map(participantRecord).join('')}</div>`;
  }

  function teamSearchText(t) {
    return lower([t?.name,t?.game,t?.leader,t?.status,t?.players,t?.specnazTrips,t?.screens,t?.activityBase,t?.activityOutside,t?.average].filter(Boolean).join(' '));
  }

  function teamRecord(t) {
    const status = clean(t?.status);
    const search = teamSearchText(t);
    return `<details class="royal-admin-record" data-admin-team="1" data-admin-search="${safeEsc(search)}" data-admin-team-status="${safeEsc(lower(status))}" data-admin-team-game="${gameShort(t?.game)}">
      <summary>
        <div class="royal-admin-summary-main"><strong>${safeEsc(displayValue(t?.name))}</strong><small>${safeEsc(displayValue(t?.game))} · строка ${safeEsc(displayValue(t?.row))}</small></div>
        <span class="royal-admin-status ${statusClass(status)}">${safeEsc(displayValue(status))}</span><span class="royal-admin-chevron">›</span>
      </summary>
      <div class="royal-admin-detail">
        <div class="royal-admin-field"><span>Игра A</span><span>${safeEsc(displayValue(t?.game))}</span></div>
        <div class="royal-admin-field"><span>Команда B</span><span>${safeEsc(displayValue(t?.name))}</span></div>
        <div class="royal-admin-field"><span>Фото C</span><span>${t?.photoUrl ? '✅ Есть' : '—'}</span></div>
        <div class="royal-admin-field"><span>Лидер D</span><span>${safeEsc(displayValue(t?.leader))}</span></div>
        <div class="royal-admin-field"><span>Игроков E</span><span>${safeEsc(displayValue(t?.players))}</span></div>
        <div class="royal-admin-field"><span>Походы спецназ F</span><span>${safeEsc(displayValue(t?.specnazTrips))}</span></div>
        <div class="royal-admin-field"><span>Сортировка G</span><span>${safeEsc(displayValue(t?.sort))}</span></div>
        <div class="royal-admin-field"><span>Скрины H</span><span>${safeEsc(displayValue(t?.screens))}</span></div>
        <div class="royal-admin-field"><span>Сумма в базе I</span><span>${safeEsc(displayValue(t?.activityBase))}</span></div>
        <div class="royal-admin-field"><span>Сумма вне базы J</span><span>${safeEsc(displayValue(t?.activityOutside))}</span></div>
        <div class="royal-admin-field"><span>Среднее K</span><span>${safeEsc(displayValue(t?.average))}</span></div>
        <div class="royal-admin-field"><span>Статус L</span><span>${safeEsc(displayValue(t?.status))}</span></div>
      </div>
    </details>`;
  }

  function renderTeamsBody(data) {
    const list = Array.isArray(data?.adminData?.teams) ? data.adminData.teams : [];
    return `<div class="royal-admin-toolbar">
      <label class="royal-admin-search"><span>🔎</span><input type="search" data-admin-search-input="teams" placeholder="Команда, лидер, статус…" autocomplete="off"></label>
      <div class="royal-admin-filters">
        <button type="button" class="royal-admin-filter ${teamGameFilter === 'all' ? 'is-active' : ''}" data-admin-team-game-filter="all">Все игры</button>
        <button type="button" class="royal-admin-filter ${teamGameFilter === 'rm' ? 'is-active' : ''}" data-admin-team-game-filter="rm">РМ</button>
        <button type="button" class="royal-admin-filter ${teamGameFilter === 'rk' ? 'is-active' : ''}" data-admin-team-game-filter="rk">РК</button>
      </div>
      <div class="royal-admin-filters">
        <button type="button" class="royal-admin-filter ${teamStatusFilter === 'all' ? 'is-active' : ''}" data-admin-team-status-filter="all">Все статусы</button>
        <button type="button" class="royal-admin-filter ${teamStatusFilter === 'активен' ? 'is-active' : ''}" data-admin-team-status-filter="активен">Активен</button>
        <button type="button" class="royal-admin-filter ${teamStatusFilter === 'на паузе' ? 'is-active' : ''}" data-admin-team-status-filter="на паузе">На паузе</button>
        <button type="button" class="royal-admin-filter ${teamStatusFilter === 'неактивен' ? 'is-active' : ''}" data-admin-team-status-filter="неактивен">Неактивен</button>
      </div>
    </div><div class="royal-admin-count" data-admin-count></div><div class="royal-admin-list">${list.map(teamRecord).join('')}</div>`;
  }

  function renderJournalBody(data) {
    const rows = Array.isArray(data?.adminData?.journal?.rows) ? data.adminData.journal.rows : [];
    if (!rows.length) {
      return '<div class="royal-admin-note">📜 Журнал ручных изменений уже заложен в контракт v0.6. Он начнёт заполняться на следующем этапе, когда будет включена защищённая запись в Google Sheets.</div>';
    }
    return `<div class="royal-admin-list">${rows.map(row => `<div class="royal-admin-record"><div class="royal-admin-detail">${safeEsc(JSON.stringify(row))}</div></div>`).join('')}</div>`;
  }

  function renderCurrentTab() {
    if (!adminPayload) return;
    let body = '';
    if (activeTab === 'teams') body = renderTeamsBody(adminPayload);
    else if (activeTab === 'journal') body = renderJournalBody(adminPayload);
    else body = renderParticipantsBody(adminPayload);

    const panel = document.getElementById('panel');
    if (!panel) return;
    panel.innerHTML = shellHtml(adminPayload, body);
    setAdminNav();
    applyFilters();
    try { window.RoyalNav?.enhanceVisibleBack?.(); } catch (_) {}
  }

  function applyFilters() {
    if (activeTab === 'participants') {
      const input = document.querySelector('[data-admin-search-input="participants"]');
      const q = lower(input?.value || '');
      const records = [...document.querySelectorAll('[data-admin-participant="1"]')];
      let visible = 0;
      records.forEach(node => {
        const statusOk = participantFilter === 'all' || node.dataset.adminStatusKey === participantFilter;
        const searchOk = !q || lower(node.dataset.adminSearch).includes(q);
        node.hidden = !(statusOk && searchOk);
        if (!node.hidden) visible += 1;
      });
      const count = document.querySelector('[data-admin-count]');
      if (count) count.textContent = `Показано: ${visible} из ${records.length}`;
      return;
    }

    if (activeTab === 'teams') {
      const input = document.querySelector('[data-admin-search-input="teams"]');
      const q = lower(input?.value || '');
      const records = [...document.querySelectorAll('[data-admin-team="1"]')];
      let visible = 0;
      records.forEach(node => {
        const gameOk = teamGameFilter === 'all' || node.dataset.adminTeamGame === teamGameFilter;
        const statusOk = teamStatusFilter === 'all' || lower(node.dataset.adminTeamStatus) === teamStatusFilter;
        const searchOk = !q || lower(node.dataset.adminSearch).includes(q);
        node.hidden = !(gameOk && statusOk && searchOk);
        if (!node.hidden) visible += 1;
      });
      const count = document.querySelector('[data-admin-count]');
      if (count) count.textContent = `Показано: ${visible} из ${records.length}`;
    }
  }

  async function openAdmin(force = false) {
    if (!isUiAdmin()) return;
    if (!force) pushOrigin();
    renderLoading();
    try {
      await fetchAdminData(force);
      renderCurrentTab();
    } catch (error) {
      const panel = document.getElementById('panel');
      if (!panel) return;
      panel.innerHTML = `
        <button type="button" class="royal-back-button" data-royal-back="1">← Назад</button>
        <section class="royal-admin-screen">
          <div class="royal-admin-head"><div><div class="royal-admin-kicker">Royal CRM v0.6</div><h2>🛡 Админ режим</h2></div><span class="royal-admin-lock">🔒 ADMIN</span></div>
          <div class="royal-admin-error"><strong>Не удалось загрузить админские данные.</strong><br>${safeEsc(error?.message || error?.code || 'UNKNOWN')}<br><br><button type="button" class="royal-admin-action is-primary" data-admin-refresh="1">Повторить</button></div>
        </section>`;
      setAdminNav();
    }
  }

  function showEditPhaseInfo() {
    const text = 'Режим редактирования подготовлен как отдельный защищённый этап. Сначала проверяем полный админский просмотр. Запись в Google Sheets здесь пока намеренно не включена.';
    try {
      if (window.Telegram?.WebApp?.showAlert) {
        window.Telegram.WebApp.showAlert(text);
        return;
      }
    } catch (_) {}
    alert(text);
  }

  document.addEventListener('input', event => {
    if (event.target?.matches?.('[data-admin-search-input]')) applyFilters();
  }, true);

  document.addEventListener('click', event => {
    const tile = event.target?.closest?.('[data-admin-mode="1"]');
    if (tile) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openAdmin(false);
      return;
    }

    const refresh = event.target?.closest?.('[data-admin-refresh="1"]');
    if (refresh) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openAdmin(true);
      return;
    }

    const edit = event.target?.closest?.('[data-admin-edit-mode="1"]');
    if (edit) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showEditPhaseInfo();
      return;
    }

    const tab = event.target?.closest?.('[data-admin-tab]');
    if (tab) {
      event.preventDefault();
      event.stopImmediatePropagation();
      activeTab = String(tab.dataset.adminTab || 'participants');
      renderCurrentTab();
      return;
    }

    const pf = event.target?.closest?.('[data-admin-participant-filter]');
    if (pf) {
      event.preventDefault();
      participantFilter = String(pf.dataset.adminParticipantFilter || 'all');
      document.querySelectorAll('[data-admin-participant-filter]').forEach(btn => btn.classList.toggle('is-active', btn.dataset.adminParticipantFilter === participantFilter));
      applyFilters();
      return;
    }

    const gf = event.target?.closest?.('[data-admin-team-game-filter]');
    if (gf) {
      event.preventDefault();
      teamGameFilter = String(gf.dataset.adminTeamGameFilter || 'all');
      document.querySelectorAll('[data-admin-team-game-filter]').forEach(btn => btn.classList.toggle('is-active', btn.dataset.adminTeamGameFilter === teamGameFilter));
      applyFilters();
      return;
    }

    const sf = event.target?.closest?.('[data-admin-team-status-filter]');
    if (sf) {
      event.preventDefault();
      teamStatusFilter = String(sf.dataset.adminTeamStatusFilter || 'all');
      document.querySelectorAll('[data-admin-team-status-filter]').forEach(btn => btn.classList.toggle('is-active', btn.dataset.adminTeamStatusFilter === teamStatusFilter));
      applyFilters();
    }
  }, true);

  if (typeof renderAuth === 'function') {
    const nativeRenderAuth = renderAuth;
    renderAuth = function royalAdminRenderAuth(data) {
      const result = nativeRenderAuth(data);
      setTimeout(decorateEntry, 0);
      return result;
    };
  }

  if (typeof renderPage === 'function') {
    const nativeRenderPage = renderPage;
    renderPage = function royalAdminRenderPage(page) {
      const result = nativeRenderPage(page);
      if (page === 'home') setTimeout(decorateEntry, 0);
      return result;
    };
  }

  setTimeout(decorateEntry, 0);
  setTimeout(decorateEntry, 800);

  window.RoyalAdminV0600 = {
    version: VERSION,
    open: openAdmin,
    refresh: () => openAdmin(true),
    clearCache: () => { adminPayload = null; },
    acceptPayload: data => {
      if (!data?.ok || !data?.adminData) return false;
      adminPayload = data;
      if (document.querySelector('.royal-admin-screen')) renderCurrentTab();
      return true;
    }
  };
})();
