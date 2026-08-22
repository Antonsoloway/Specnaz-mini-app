/* Royal CRM Mini App — protected Admin Write/Delete UI v0.6.0-write.5 */
(() => {
  const VERSION = '0.6.0-write.5-ui.10';
  const WRITE_BUSY_RETRY_DELAYS_MS = [700, 1400, 2500];
  const TRANSPORT_RETRY_DELAY_MS = 700;
  const SNAPSHOT_POLL_DELAYS_MS = [2500, 4000, 7000, 12000, 20000, 35000, 60000, 90000, 120000];
  const PUBLIC_SNAPSHOT_POLL_DELAYS_MS = [2500, 3500, 5000, 8000, 12000, 18000, 30000, 45000];
  const PUBLIC_SNAPSHOT_WATCH_MS = 20000;
  const state = {
    editing:false,
    payload:null,
    loading:null,
    publicLoading:null,
    publicPollGeneration:0,
    liveRefreshTimer:0,
    modal:null,
    observerBusy:false,
    pendingRequestIds:new Set()
  };

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const clean = value => String(value == null ? '' : value).trim();
  const lower = value => clean(value).toLocaleLowerCase('ru-RU').replace(/ё/g,'е');
  const numeric = value => {
    const text = clean(value).replace(/\s+/g,'').replace(',','.');
    const number = Number(text);
    return text && Number.isFinite(number) ? number : NaN;
  };

  function installCss() {
    if (!document.querySelector('link[data-admin-write-css="1"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'admin-write-v0600.css?v=20260822-1227';
      link.dataset.adminWriteCss = '1';
      document.head.appendChild(link);
    }
    if (!document.querySelector('link[data-admin-write-v2-css="1"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'admin-write-v0600-v2.css?v=20260822-1227';
      link.dataset.adminWriteV2Css = '1';
      document.head.appendChild(link);
    }
  }

  function isAdminScreen() { return !!document.querySelector('.royal-admin-screen'); }
  function participants() { return Array.isArray(state.payload?.adminData?.participants) ? state.payload.adminData.participants : []; }
  function teams() { return Array.isArray(state.payload?.adminData?.teams) ? state.payload.adminData.teams : []; }
  function writeMeta(source=state.payload) { return source?.adminData?.write || {}; }

  function operationEnabled(name, source=state.payload) {
    const meta = writeMeta(source);
    const operations = Array.isArray(meta?.operations) ? meta.operations : [];
    return source?.permissions?.canDelete === true &&
      meta?.enabled === true &&
      meta?.deleteEnabled === true &&
      operations.includes(name);
  }

  function canDeleteParticipant(record, source=state.payload) {
    return operationEnabled('deleteParticipant', source) && lower(record?.chatState) === 'вышел';
  }

  function canDeleteTeam(record, source=state.payload) {
    return operationEnabled('deleteTeam', source) &&
      lower(record?.status) === 'неактивен' &&
      numeric(record?.players) === 0;
  }

  async function fetchAdminSnapshot(force=true, allowStale=false) {
    const client = window.RoyalAdminDataV0600;
    if (!client?.load) throw new Error('Модуль админских данных не загрузился. Откройте приложение заново.');
    return client.load({ force, allowStale, commit:false });
  }

  // ADMIN_PUBLIC_SNAPSHOT_LIVE_REFRESH_V0600
  // The one-off Apps Script trigger publishes both snapshots in background.
  // A visible v0.6 client checks their hashes and applies the new data without
  // requiring the user to close Telegram or wait for the five-minute fallback.
  function currentPublicSnapshot() {
    try { return typeof snapshotState !== 'undefined' ? snapshotState : null; }
    catch (_) { return null; }
  }

  function publicSnapshotHash() {
    const snapshot = currentPublicSnapshot();
    return clean(snapshot?.dataHash || snapshot?.generatedAt);
  }

  function syncAuthenticatedMembershipsFromPublicSnapshot() {
    const snapshot = currentPublicSnapshot();
    const id = clean(authState?.user?.telegramId || window.Telegram?.WebApp?.initDataUnsafe?.user?.id);
    if (!id || !authState || !Array.isArray(snapshot?.participants)) return;
    const participant = snapshot.participants.find(item => clean(item?.telegramId) === id);
    if (!participant) return;
    authState.memberships = Array.isArray(participant.memberships)
      ? participant.memberships.map(item => ({ ...item }))
      : [];
  }

  function renderVisiblePublicSnapshot() {
    if (isAdminScreen() || state.modal) return;
    const panel = document.getElementById('panel');
    if (!panel) return;
    if (panel.querySelector(
      '.team-detail-head,.participant-detail-card,.specnaz-menu-head,.hero-list,.history-list,.guide-head'
    )) return;

    const participantSearch = document.getElementById('participantSearch');
    if (participantSearch && typeof renderParticipantsPage === 'function') {
      renderParticipantsPage(participantSearch.value || '');
      return;
    }
    const teamSearch = document.getElementById('teamSearch');
    if (teamSearch && typeof renderTeamsPage === 'function') {
      renderTeamsPage(teamSearch.value || '');
      return;
    }
    try {
      if (typeof renderPage === 'function' && typeof activePage !== 'undefined' && activePage !== 'admin') {
        renderPage(activePage || 'home');
      }
    } catch (_) {}
  }

  async function refreshPublicSnapshotOnce() {
    if (!sessionToken || typeof loadSnapshot !== 'function') return false;
    if (state.publicLoading) return state.publicLoading;
    const before = publicSnapshotHash();
    state.publicLoading = (async () => {
      await loadSnapshot();
      const after = publicSnapshotHash();
      syncAuthenticatedMembershipsFromPublicSnapshot();
      const changed = !!after && after !== before;
      if (changed) renderVisiblePublicSnapshot();
      return changed;
    })().finally(() => { state.publicLoading = null; });
    return state.publicLoading;
  }

  async function refreshVisibleAdminSnapshot() {
    if (!isAdminScreen() || state.modal || state.pendingRequestIds.size || state.loading) return false;
    const before = clean(state.payload?.dataHash || state.payload?.generatedAt);
    const data = await fetchAdminSnapshot();
    const after = clean(data?.dataHash || data?.generatedAt);
    if (!after || after === before) return false;
    state.payload = data;
    try { window.RoyalAdminV0600?.acceptPayload?.(data); } catch (_) {}
    setTimeout(() => { if (state.editing && isAdminScreen()) injectEditUi(); }, 100);
    return true;
  }

  async function refreshPublicSnapshotAfterMutation() {
    const generation = ++state.publicPollGeneration;
    const baseline = publicSnapshotHash();
    for (const delay of PUBLIC_SNAPSHOT_POLL_DELAYS_MS) {
      await new Promise(resolve => setTimeout(resolve, delay));
      if (generation !== state.publicPollGeneration) return false;
      await refreshPublicSnapshotOnce().catch(() => false);
      const current = publicSnapshotHash();
      if (current && current !== baseline) return true;
    }
    return false;
  }

  function scheduleLiveSnapshotRefresh(delay=PUBLIC_SNAPSHOT_WATCH_MS) {
    if (state.liveRefreshTimer) clearTimeout(state.liveRefreshTimer);
    state.liveRefreshTimer = setTimeout(async () => {
      state.liveRefreshTimer = 0;
      if (document.visibilityState !== 'hidden') {
        await Promise.allSettled([
          refreshPublicSnapshotOnce(),
          refreshVisibleAdminSnapshot()
        ]);
      }
      scheduleLiveSnapshotRefresh();
    }, Math.max(1000, Number(delay) || PUBLIC_SNAPSHOT_WATCH_MS));
  }

  async function loadAdmin(force=false, allowStale=false) {
    // PENDING_WRITE_MONOTONIC_SNAPSHOT_V0600
    // A private snapshot may lag behind a committed response for a few seconds.
    // While our own requestIds are still pending, the optimistic payload is the
    // newest authoritative client state and must not be replaced by that lagging
    // snapshot. This also lets an admin safely open the next edit immediately.
    if (state.payload && (!force || state.pendingRequestIds.size)) return state.payload;
    if (state.loading) return state.loading;
    const payloadBeforeFetch = state.payload;
    state.loading = fetchAdminSnapshot(force, allowStale).then(data => {
      if (state.pendingRequestIds.size) {
        const allPendingConfirmed = [...state.pendingRequestIds]
          .every(requestId => journalContains(data,requestId));
        if (!allPendingConfirmed && (state.payload || payloadBeforeFetch)) {
          return state.payload || payloadBeforeFetch;
        }
        if (allPendingConfirmed) {
          state.pendingRequestIds.forEach(requestId => window.RoyalAdminDataV0600?.release?.(requestId));
          state.pendingRequestIds.clear();
        }
      }
      state.payload = data;
      window.RoyalAdminDataV0600?.accept?.(data);
      return data;
    }).finally(() => { state.loading = null; });
    return state.loading;
  }

  function currentTab() {
    if (document.querySelector('[data-admin-team="1"]')) return 'teams';
    if (document.querySelector('[data-admin-participant="1"]')) return 'participants';
    if (document.querySelector('[data-admin-tab="journal"].is-active')) return 'journal';
    return '';
  }

  function participantIdFromNode(node) {
    const record = node?.closest?.('[data-admin-participant="1"]');
    const text = clean(record?.querySelector('.royal-admin-summary-main small')?.textContent);
    const match = text.match(/(?:^|·\s*)ID\s+(\d{5,20})(?:\s|$)/i);
    return match ? match[1] : '';
  }

  function teamIdentityFromNode(node) {
    const record = node?.closest?.('[data-admin-team="1"]');
    const name = clean(record?.querySelector('.royal-admin-summary-main strong')?.textContent);
    const meta = clean(record?.querySelector('.royal-admin-summary-main small')?.textContent);
    const game = /Royal\s+Kingdom/i.test(meta)
      ? 'Royal Kingdom'
      : /Royal\s+Match/i.test(meta)
        ? 'Royal Match'
        : '';
    return { name, game };
  }

  function findParticipantByNode(node) {
    const id = participantIdFromNode(node);
    return id ? participants().find(p => clean(p?.telegramId) === id) || null : null;
  }

  function findTeamByNode(node) {
    const identity = teamIdentityFromNode(node);
    if (!identity.name || !identity.game) return null;
    return teams().find(t => clean(t?.name) === identity.name && clean(t?.game) === identity.game) || null;
  }

  function injectEditUi() {
    if (!state.editing || !isAdminScreen()) return;
    const screen = document.querySelector('.royal-admin-screen');
    const editButton = screen?.querySelector('[data-admin-edit-mode="1"]');
    if (editButton) {
      editButton.classList.add('is-editing');
      editButton.textContent = '✓ Завершить редактирование';
    }

    const actions = screen?.querySelector('.royal-admin-actions');
    if (actions && !screen.querySelector('[data-admin-write-toolbar="1"]')) {
      const tab = currentTab();
      if (tab === 'participants' || tab === 'teams') {
        const toolbar = document.createElement('div');
        toolbar.className = 'royal-admin-write-toolbar';
        toolbar.dataset.adminWriteToolbar = '1';
        toolbar.innerHTML = tab === 'participants'
          ? '<button type="button" class="royal-admin-write-add" data-admin-create-participant="1">＋ Добавить участника</button>'
          : '<button type="button" class="royal-admin-write-add" data-admin-create-team="1">＋ Добавить команду</button>';
        actions.insertAdjacentElement('afterend', toolbar);
        toolbar.insertAdjacentHTML(
          'afterend',
        '<div class="royal-admin-edit-hint" data-admin-edit-hint="1">Редактируются только исходные поля. Удаление доступно только для «Вышел» и для неактивных команд без участников; сервер повторно проверяет условия перед записью.</div>'
        );
      }
    }

    document.querySelectorAll('[data-admin-participant="1"]').forEach(node => {
      const detail = node.querySelector('.royal-admin-detail');
      if (!detail || detail.querySelector('[data-admin-edit-participant="1"]')) return;
      detail.insertAdjacentHTML('beforeend','<button type="button" class="royal-admin-edit-record" data-admin-edit-participant="1">✏️ Изменить участника</button>');
    });
    document.querySelectorAll('[data-admin-team="1"]').forEach(node => {
      const detail = node.querySelector('.royal-admin-detail');
      if (!detail || detail.querySelector('[data-admin-edit-team="1"]')) return;
      detail.insertAdjacentHTML('beforeend','<button type="button" class="royal-admin-edit-record" data-admin-edit-team="1">✏️ Изменить команду</button>');
    });
  }

  function removeEditUi() {
    document.querySelectorAll('[data-admin-write-toolbar="1"],[data-admin-edit-hint="1"],[data-admin-edit-participant="1"],[data-admin-edit-team="1"]').forEach(node => node.remove());
    const button = document.querySelector('[data-admin-edit-mode="1"]');
    if (button) {
      button.classList.remove('is-editing');
      button.textContent = '✏️ Режим редактирования';
    }
  }

  async function toggleEditing(verifiedPayload=null) {
    if (state.editing) {
      state.editing = false;
      removeEditUi();
      return;
    }
    try {
      if (verifiedPayload?.ok && verifiedPayload?.adminData) {
        state.payload = verifiedPayload;
        window.RoyalAdminDataV0600?.accept?.(verifiedPayload);
        try { window.RoyalAdminV0600?.acceptPayload?.(verifiedPayload); } catch (_) {}
      } else {
        await loadAdmin(true);
      }
      const meta = writeMeta();
      const allowed = Array.isArray(meta?.operations) ? meta.operations : [];
      if (!meta?.enabled || meta?.transport !== 'worker-signed-hmac' || allowed.length < 4) {
        showMessage('Защищённый сервер редактирования ещё не активирован. Просмотр админских данных продолжает работать.', true);
        return;
      }
      state.editing = true;
      injectEditUi();
    } catch (error) {
      showMessage(error?.message || 'Не удалось включить редактирование.', true);
    }
  }

  function dateInputValue(value) {
    const text = clean(value);
    let match = text.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (match) return `${match[3]}-${match[2]}-${match[1]}`;
    match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
  }

  function todayInput() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    return `${year}-${month}-${day}`;
  }

  function normalizedSlots(participant) {
    const bySlot = new Map(
      (Array.isArray(participant?.memberships) ? participant.memberships : [])
        .map(item => [Number(item?.slot || 0), item])
    );
    return [1,2,3,4,5].map(slot => ({ slot, ...(bySlot.get(slot) || {}) }));
  }

  function teamOptions(selectedGame, selectedTeam) {
    const game = clean(selectedGame);
    const options = ['<option value="">— без команды —</option>'];
    teams().filter(team => clean(team?.game) === game).forEach(team => {
      const selected = clean(team?.name) === clean(selectedTeam) ? ' selected' : '';
      options.push(`<option value="${esc(team?.name)}"${selected}>${esc(team?.name)}</option>`);
    });
    return options.join('');
  }

  function roleOptions(team, selected) {
    const roles = team ? ['Игрок','Помощник','Лидер'] : ['','Спецназ РМ','Спецназ РК'];
    return roles.map(role => `<option value="${esc(role)}"${clean(selected) === role ? ' selected' : ''}>${esc(role || '—')}</option>`).join('');
  }

  function slotHasData(source) {
    const value = name => source?.querySelector
      ? source.querySelector(`[data-write-field="${name}"]`)?.value
      : source?.[name];
    return ['game','role','team','nickname'].some(name => !!clean(value(name)));
  }

  function slotHtml(slot) {
    const game = clean(slot?.game);
    const team = clean(slot?.team);
    const slotNumber = Number(slot?.slot || 0);
    return `<section class="royal-admin-slot-editor" data-write-slot="${slotNumber}">
      <div class="royal-admin-slot-title">Слот ${slotNumber}</div>
      <div class="royal-admin-slot-grid">
        <label class="royal-admin-input"><span>Игра</span><select data-write-field="game"><option value="">—</option><option value="Royal Match"${game === 'Royal Match' ? ' selected' : ''}>Royal Match</option><option value="Royal Kingdom"${game === 'Royal Kingdom' ? ' selected' : ''}>Royal Kingdom</option></select></label>
        <label class="royal-admin-input"><span>Роль</span><select data-write-field="role">${roleOptions(team,slot?.role)}</select></label>
        <label class="royal-admin-input is-wide"><span>Команда</span><select data-write-field="team">${teamOptions(game,team)}</select></label>
        <label class="royal-admin-input is-wide"><span>Игровой ник</span><input data-write-field="nickname" maxlength="160" value="${esc(slot?.nickname)}"></label>
      </div>
      <button type="button" class="royal-admin-slot-clear" data-write-clear-slot="1" aria-label="Очистить данные слота ${slotNumber}"${slotHasData(slot) ? '' : ' disabled'}>Очистить данные</button>
    </section>`;
  }

  function openParticipantModal(participant, creating=false) {
    const source = participant || {
      memberships:[], chatState:'В чате', specnaz:0, screens:0,
      activityBase:0, activityOutside:0, date:todayInput()
    };
    const title = creating
      ? 'Добавить участника'
      : `Изменить: ${clean(source?.name || source?.telegramName || source?.username || source?.telegramId || 'Участник')}`;
    const dateValue = creating ? todayInput() : dateInputValue(source?.date);
    const participantEligible = lower(source?.chatState) === 'вышел';
    const participantDeleteEnabled = operationEnabled('deleteParticipant');

    const deleteButton = !creating && participantEligible && participantDeleteEnabled
      ? '<button type="button" class="royal-admin-form-button is-delete" data-admin-delete-participant="1">🗑 Удалить участника</button>'
      : '';
    const deleteNote = creating
      ? ''
      : participantEligible && participantDeleteEnabled
        ? '<div class="royal-admin-danger-note is-delete-ready">Удаление полностью очистит запись участника в админской таблице. История админских действий сохранится в журнале.</div>'
        : participantEligible
          ? '<div class="royal-admin-danger-note">Сервер удаления ещё обновляется. Редактирование остаётся доступным, удаление пока заблокировано.</div>'
          : '<div class="royal-admin-danger-note">Удалить можно только участника со статусом «Вышел».</div>';

    openModal(`
      <div class="royal-admin-modal-head"><div><div class="royal-admin-kicker">Участники</div><h3>${esc(title)}</h3></div><button type="button" class="royal-admin-modal-close" data-write-close="1">×</button></div>
      <form class="royal-admin-form" data-write-participant-form="1" data-write-mode="${creating ? 'create' : 'update'}">
        <div class="royal-admin-form-grid">
          <label class="royal-admin-input"><span>Telegram ID</span><input data-write-field="telegramId" inputmode="numeric" pattern="[0-9]*" ${creating ? '' : 'readonly'} value="${esc(source?.telegramId)}"></label>
          <label class="royal-admin-input"><span>Состояние чата</span><select data-write-field="chatState"><option value="В чате"${clean(source?.chatState) === 'В чате' ? ' selected' : ''}>В чате</option><option value="Вышел"${clean(source?.chatState) === 'Вышел' ? ' selected' : ''}>Вышел</option></select></label>
          <label class="royal-admin-input"><span>Имя</span><input data-write-field="name" maxlength="160" value="${esc(source?.name)}"></label>
          <label class="royal-admin-input"><span>Имя Telegram</span><input data-write-field="telegramName" maxlength="180" value="${esc(source?.telegramName)}"></label>
          <label class="royal-admin-input"><span>@username</span><input data-write-field="username" maxlength="33" value="${esc(source?.username)}" placeholder="@username"></label>
          <label class="royal-admin-input"><span>Дата V</span><input data-write-field="date" type="date" value="${esc(dateValue)}"></label>
          <label class="royal-admin-input"><span>Походы спецназа U</span><input data-write-field="specnaz" type="number" min="0" max="99999" step="1" value="${esc(source?.specnaz ?? 0)}"></label>
          <label class="royal-admin-input"><span>Скрины AB</span><input data-write-field="screens" type="number" min="0" max="999999" step="1" value="${esc(source?.screens ?? 0)}"></label>
          <label class="royal-admin-input"><span>Активность в базе AC</span><input data-write-field="activityBase" type="number" min="0" max="999999" step="1" value="${esc(source?.activityBase ?? 0)}"></label>
          <label class="royal-admin-input"><span>Активность вне базы AD</span><input data-write-field="activityOutside" type="number" min="0" max="999999" step="1" value="${esc(source?.activityOutside ?? 0)}"></label>
        </div>
        <div class="royal-admin-form-note">Telegram ID — неизменяемый ключ. Статус T, игры W:AA и дата изменения AE остаются под системной логикой. Увеличение U проходит через штатную «Историю спецназа».</div>
        <div class="royal-admin-write-section-title">Команды и роли</div>
        ${normalizedSlots(source).map(slotHtml).join('')}
        ${deleteNote}
        <div data-write-status aria-live="polite"></div>
        <div class="royal-admin-form-actions">${deleteButton}<button type="button" class="royal-admin-form-button" data-write-close="1">Отмена</button><button type="submit" class="royal-admin-form-button is-save">💾 Сохранить</button></div>
      </form>`,
      { kind:'participant', creating, record:source }
    );
  }

  function openTeamModal(team, creating=false) {
    const source = team || { game:'Royal Match' };
    const teamEligible = lower(source?.status) === 'неактивен' && numeric(source?.players) === 0;
    const teamDeleteEnabled = operationEnabled('deleteTeam');
    const deleteButton = !creating && teamEligible && teamDeleteEnabled
      ? '<button type="button" class="royal-admin-form-button is-delete" data-admin-delete-team="1">🗑 Удалить команду</button>'
      : '';
    const deleteNote = creating
      ? '<div class="royal-admin-danger-note">Фото C и вычисляемые E:L приложение не перезаписывает.</div>'
      : teamEligible && teamDeleteEnabled
        ? '<div class="royal-admin-danger-note is-delete-ready">Удаление очистит исходную строку A:D. Формулы таблицы сохранятся; фото старой команды будет очищено из приватного медиахранилища.</div>'
        : teamEligible
          ? '<div class="royal-admin-danger-note">Сервер удаления ещё обновляется. Редактирование остаётся доступным, удаление пока заблокировано.</div>'
          : '<div class="royal-admin-danger-note">Удалить можно только команду со статусом «Неактивен», в которой 0 участников.</div>';
    openModal(`
      <div class="royal-admin-modal-head"><div><div class="royal-admin-kicker">Команды</div><h3>${creating ? 'Добавить команду' : `Изменить: ${esc(source?.name)}`}</h3></div><button type="button" class="royal-admin-modal-close" data-write-close="1">×</button></div>
      <form class="royal-admin-form" data-write-team-form="1" data-write-mode="${creating ? 'create' : 'update'}">
        <div class="royal-admin-form-grid">
          <label class="royal-admin-input"><span>Игра</span><select data-write-field="game" ${creating ? '' : 'disabled'}><option value="Royal Match"${source?.game === 'Royal Match' ? ' selected' : ''}>Royal Match</option><option value="Royal Kingdom"${source?.game === 'Royal Kingdom' ? ' selected' : ''}>Royal Kingdom</option></select></label>
          <label class="royal-admin-input"><span>Название команды</span><input data-write-field="name" maxlength="180" value="${esc(source?.name)}"></label>
          <label class="royal-admin-input is-wide"><span>Лидер / подпись</span><input data-write-field="leader" maxlength="180" value="${esc(source?.leader)}"></label>
        </div>
        <div class="royal-admin-form-note">Игра существующей команды — часть identity и не меняется. Переименование названия каскадно обновляет все 5 membership-слотов этой игры.</div>
        ${deleteNote}
        <div data-write-status></div>
        <div class="royal-admin-form-actions">${deleteButton}<button type="button" class="royal-admin-form-button" data-write-close="1">Отмена</button><button type="submit" class="royal-admin-form-button is-save">💾 Сохранить</button></div>
      </form>`,
      { kind:'team', creating, record:source }
    );
  }

  function openModal(html, context) {
    closeModal();
    const backdrop = document.createElement('div');
    backdrop.className = 'royal-admin-modal-backdrop';
    backdrop.dataset.adminWriteModal = '1';
    backdrop.innerHTML = `<div class="royal-admin-modal">${html}</div>`;
    document.body.appendChild(backdrop);
    state.modal = { element:backdrop, ...context };
  }

  function closeModal() {
    document.querySelector('[data-admin-write-modal="1"]')?.remove();
    state.modal = null;
  }

  function modalStatus(text, type='') {
    const node = document.querySelector('[data-admin-write-modal="1"] [data-write-status]');
    if (!node) return;
    node.className = `royal-admin-write-status ${type === 'error' ? 'is-error' : type === 'ok' ? 'is-ok' : ''}`;
    node.textContent = text;
  }

  function collectMemberships(form) {
    return [...form.querySelectorAll('[data-write-slot]')].map(section => ({
      slot:Number(section.dataset.writeSlot),
      game:clean(section.querySelector('[data-write-field="game"]')?.value),
      team:clean(section.querySelector('[data-write-field="team"]')?.value),
      nickname:clean(section.querySelector('[data-write-field="nickname"]')?.value),
      role:clean(section.querySelector('[data-write-field="role"]')?.value)
    }));
  }

  function numberField(form, name) {
    return Number(form.querySelector(`[data-write-field="${name}"]`)?.value || 0);
  }

  function collectParticipant(form) {
    const creating = form.dataset.writeMode === 'create';
    const changes = {
      name:clean(form.querySelector('[data-write-field="name"]')?.value),
      memberships:collectMemberships(form)
    };
    if (creating) Object.assign(changes, {
      telegramName:clean(form.querySelector('[data-write-field="telegramName"]')?.value),
      username:clean(form.querySelector('[data-write-field="username"]')?.value),
      date:clean(form.querySelector('[data-write-field="date"]')?.value),
      specnaz:numberField(form,'specnaz'),
      screens:numberField(form,'screens'),
      activityBase:numberField(form,'activityBase'),
      activityOutside:numberField(form,'activityOutside'),
      chatState:clean(form.querySelector('[data-write-field="chatState"]')?.value)
    });
    return {
      telegramId:clean(form.querySelector('[data-write-field="telegramId"]')?.value),
      changes
    };
  }

  async function saveParticipant(form) {
    const creating = form.dataset.writeMode === 'create';
    const data = collectParticipant(form);
    if (!/^\d{5,20}$/.test(data.telegramId)) throw new Error('Telegram ID должен содержать только цифры.');
    const payload = creating
      ? data
      : { ...data, expectedRevision:clean(state.modal?.record?.revision) };
    if (!creating && !payload.expectedRevision) {
      throw new Error('Карточка устарела: нет revision. Нажмите «Обновить» и откройте её снова.');
    }
    return adminWrite(creating ? 'createParticipant' : 'updateParticipant', payload);
  }

  async function saveTeam(form) {
    const creating = form.dataset.writeMode === 'create';
    const source = state.modal?.record || {};
    const game = clean(form.querySelector('[data-write-field="game"]')?.value || source.game);
    const name = clean(form.querySelector('[data-write-field="name"]')?.value);
    const leader = clean(form.querySelector('[data-write-field="leader"]')?.value);
    if (!name) throw new Error('Введите название команды.');
    if (creating) return adminWrite('createTeam',{ game, name, leader });
    if (!source.revision) throw new Error('Карточка устарела: нет revision. Нажмите «Обновить» и откройте её снова.');
    return adminWrite('updateTeam',{
      game:source.game,
      name:source.name,
      expectedRevision:source.revision,
      changes:{ name, leader }
    });
  }

  function requestId() {
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    return 'rw3_' + [...bytes].map(byte => byte.toString(16).padStart(2,'0')).join('');
  }

  async function postWriteOnce(id, op, payload) {
    const response = await fetch(`${API_URL}/admin-write`, {
      method:'POST',
      mode:'cors',
      cache:'no-store',
      headers:{
        Authorization:`Bearer ${sessionToken}`,
        'Content-Type':'application/json;charset=UTF-8'
      },
      body:JSON.stringify({ requestId:id, op, payload })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok) {
      const error = new Error(data?.message || data?.error || `HTTP ${response.status}`);
      error.code = data?.error || `HTTP_${response.status}`;
      error.conflict = !!data?.conflict || response.status === 409;
      error.httpStatus = response.status;
      throw error;
    }
    return data;
  }

  async function adminWrite(op, payload) {
    if (!sessionToken) throw new Error('Сессия приложения не готова. Откройте приложение заново.');
    const id = requestId();
    let busyRetries = 0;
    let transportRetries = 0;

    while (true) {
      try {
        return await postWriteOnce(id, op, payload);
      } catch (error) {
        // Snapshot/export triggers share the Apps Script lock with mutations.
        // WRITE_BUSY is an explicit proof that no mutation started, so retrying
        // with the SAME requestId is safe and keeps server idempotency intact.
        if (clean(error?.code) === 'WRITE_BUSY' && busyRetries < WRITE_BUSY_RETRY_DELAYS_MS.length) {
          const delay = WRITE_BUSY_RETRY_DELAYS_MS[busyRetries];
          busyRetries += 1;
          modalStatus(`Таблица обновляется в фоне. Ждём и повторяем автоматически (${busyRetries}/${WRITE_BUSY_RETRY_DELAYS_MS.length})…`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // Retry only one true transport failure. SAME requestId means a lost
        // response after a committed write cannot repeat the mutation.
        if (!error?.httpStatus && transportRetries < 1) {
          transportRetries += 1;
          modalStatus('Проверяем результат и безопасно повторяем запрос…');
          await new Promise(resolve => setTimeout(resolve, TRANSPORT_RETRY_DELAY_MS));
          continue;
        }
        throw error;
      }
    }
  }

  function confirmDelete(message) {
    return new Promise(resolve => {
      try {
        if (window.Telegram?.WebApp?.showConfirm) {
          window.Telegram.WebApp.showConfirm(clean(message), answer => resolve(answer === true));
          return;
        }
      } catch (_) {}
      resolve(window.confirm(clean(message)));
    });
  }

  function teamIdentity(record) {
    return `${lower(record?.game)} :: ${lower(record?.name)}`;
  }

  function recomputeAdminStats(data) {
    const admin = data?.adminData;
    if (!admin) return;
    const participantList = Array.isArray(admin.participants) ? admin.participants : [];
    const teamList = Array.isArray(admin.teams) ? admin.teams : [];
    admin.stats = {
      ...(admin.stats || {}),
      participants:participantList.length,
      inChat:participantList.filter(item => lower(item?.chatState) === 'в чате').length,
      exited:participantList.filter(item => lower(item?.chatState) === 'вышел' || lower(item?.status) === 'вышел').length,
      teams:teamList.length,
      activeTeams:teamList.filter(item => lower(item?.status) === 'активен').length,
      pausedTeams:teamList.filter(item => lower(item?.status) === 'на паузе').length,
      inactiveTeams:teamList.filter(item => lower(item?.status) === 'неактивен').length
    };
  }

  function addOptimisticJournal(data, result) {
    const admin = data?.adminData;
    if (!admin || !result?.requestId) return;
    if (!admin.journal || typeof admin.journal !== 'object') {
      admin.journal = { version:'0.6.0-write.5', rows:[] };
    }
    if (!Array.isArray(admin.journal.rows)) admin.journal.rows = [];
    if (admin.journal.rows.some(row => clean(row?.requestId) === clean(result.requestId))) return;
    admin.journal.rows.unshift({
      requestId:clean(result.requestId),
      at:new Date().toISOString(),
      op:clean(result.op),
      entityType:clean(result.entityType),
      entityKey:clean(result.entityKey),
      row:Number(result.row || 0),
      adminUsername:'сохранено — snapshot обновляется',
      changed:{ snapshotRefresh:'queued' },
      after:result.record || (result.deleted ? { deleted:true } : {})
    });
  }

  function applyCommittedResult(result) {
    const data = state.payload;
    const admin = data?.adminData;
    if (!data?.ok || !admin) return false;

    if (result?.entityType === 'participant') {
      const list = Array.isArray(admin.participants) ? admin.participants : [];
      const id = clean(result.entityKey || result.record?.telegramId);
      const index = list.findIndex(item => clean(item?.telegramId) === id);
      if (result.deleted) {
        if (index >= 0) list.splice(index, 1);
      } else if (result.record) {
        const next = {
          ...(index >= 0 ? list[index] : {}),
          ...result.record,
          telegramId:id,
          revision:clean(result.revision || result.record?.revision)
        };
        if (index >= 0) list[index] = next;
        else list.push(next);
        list.sort((a,b) => clean(a?.name || a?.telegramName || a?.telegramId)
          .localeCompare(clean(b?.name || b?.telegramName || b?.telegramId),'ru',{sensitivity:'base'}));
      }
      admin.participants = list;
    }

    if (result?.entityType === 'team') {
      const list = Array.isArray(admin.teams) ? admin.teams : [];
      const previous = clean(result.previousEntityKey).toLocaleLowerCase('ru-RU');
      const current = clean(result.entityKey).toLocaleLowerCase('ru-RU');
      const index = list.findIndex(item => {
        const key = `${clean(item?.game)} :: ${clean(item?.name)}`.toLocaleLowerCase('ru-RU');
        return key === previous || key === current || teamIdentity(item) === teamIdentity(result.record);
      });
      if (result.deleted) {
        if (index >= 0) list.splice(index, 1);
      } else if (result.record) {
        const next = {
          ...(index >= 0 ? list[index] : {}),
          ...result.record,
          revision:clean(result.revision || result.record?.revision)
        };
        if (index >= 0) list[index] = next;
        else list.push(next);
        list.sort((a,b) => clean(a?.name).localeCompare(clean(b?.name),'ru',{sensitivity:'base'}));
      }
      admin.teams = list;
    }

    addOptimisticJournal(data, result);
    recomputeAdminStats(data);
    admin.snapshotRefresh = {
      pending:true,
      requestId:clean(result?.requestId),
      queuedAt:clean(result?.adminSnapshot?.queuedAt) || new Date().toISOString()
    };
    try { window.RoyalAdminV0600?.acceptPayload?.(data); } catch (_) {}
    return true;
  }

  function journalContains(data, requestId) {
    const rows = Array.isArray(data?.adminData?.journal?.rows)
      ? data.adminData.journal.rows : [];
    return rows.some(row => clean(row?.requestId) === clean(requestId));
  }

  async function refreshSnapshotInBackground() {
    for (const delay of SNAPSHOT_POLL_DELAYS_MS) {
      if (!state.pendingRequestIds.size) return;
      await new Promise(resolve => setTimeout(resolve,delay));
      const data = await fetchAdminSnapshot().catch(() => null);
      if (!data) continue;

      const confirmed = [...state.pendingRequestIds]
        .filter(requestId => journalContains(data,requestId));
      confirmed.forEach(requestId => {
        state.pendingRequestIds.delete(requestId);
        window.RoyalAdminDataV0600?.release?.(requestId);
      });
      if (state.pendingRequestIds.size) continue;

      state.payload = data;
      try { window.RoyalAdminV0600?.acceptPayload?.(data); } catch (_) {}
      setTimeout(() => { if (state.editing && isAdminScreen()) injectEditUi(); },180);
      return;
    }
  }

  async function refreshAfterMutation(result) {
    if (result?.adminSnapshot?.queued === true) {
      if (result?.requestId) {
        state.pendingRequestIds.add(clean(result.requestId));
        window.RoyalAdminDataV0600?.protect?.(result.requestId);
      }
      applyCommittedResult(result);
      closeModal();
      showMessage(result?.message || 'Изменение сохранено. Данные обновляются в фоне.');
      setTimeout(() => { if (state.editing && isAdminScreen()) injectEditUi(); },100);
      refreshSnapshotInBackground().catch(() => null);
      refreshPublicSnapshotAfterMutation().catch(() => null);
      return;
    }

    await new Promise(resolve => setTimeout(resolve,650));
    closeModal();
    state.payload = null;
    try { window.RoyalAdminV0600?.clearCache?.(); } catch (_) {}
    try { await window.RoyalAdminV0600?.refresh?.(); } catch (_) {}
    await loadAdmin(true).catch(() => null);
    showMessage(result?.message || 'Изменение сохранено.');
    setTimeout(() => { if (state.editing) injectEditUi(); },180);
    refreshPublicSnapshotAfterMutation().catch(() => null);
  }

  async function deleteParticipant(button, directRecord=null) {
    const participant = directRecord || state.modal?.record || null;
    if (!participant || !canDeleteParticipant(participant)) {
      showMessage('Удалить можно только участника со статусом «Вышел».', true);
      return;
    }
    if (!participant.revision) {
      showMessage('Карточка устарела: нет revision. Обновите админ-режим.', true);
      return;
    }
    const title = clean(participant.name || participant.telegramName || participant.username || participant.telegramId || 'участника');
    const confirmed = await confirmDelete(`Точно хотите удалить участника «${title}»? Запись будет полностью очищена в админской таблице.`);
    if (!confirmed) return;

    const direct = !button.closest?.('[data-admin-write-modal="1"]');
    const oldText = button.textContent;
    button.disabled = true;
    if (direct) button.textContent = 'Удаляем…';
    modalStatus('Повторно проверяем статус «Вышел» и удаляем…');
    try {
      const result = await adminWrite('deleteParticipant', {
        telegramId:clean(participant.telegramId),
        expectedRevision:clean(participant.revision)
      });
      modalStatus(result?.message || 'Участник удалён.', 'ok');
      await refreshAfterMutation(result);
    } catch (error) {
      modalStatus(error?.message || 'Участник не удалён.', 'error');
      if (direct) showMessage(error?.message || 'Участник не удалён.', true);
      if (error?.conflict) state.payload = null;
    } finally {
      if (document.body.contains(button)) {
        button.disabled = false;
        if (direct) button.textContent = oldText;
      }
    }
  }

  async function deleteTeam(button, directRecord=null) {
    const team = directRecord || state.modal?.record || null;
    if (!team || !canDeleteTeam(team)) {
      showMessage('Удалить можно только неактивную команду, в которой 0 участников.', true);
      return;
    }
    if (!team.revision) {
      showMessage('Карточка устарела: нет revision. Обновите админ-режим.', true);
      return;
    }
    const title = clean(team.name || 'команду');
    const confirmed = await confirmDelete(`Точно хотите удалить команду «${title}»? Строка команды будет очищена в админской таблице.`);
    if (!confirmed) return;

    const direct = !button.closest?.('[data-admin-write-modal="1"]');
    const oldText = button.textContent;
    button.disabled = true;
    if (direct) button.textContent = 'Удаляем…';
    modalStatus('Повторно проверяем статус, состав и удаляем…');
    try {
      const result = await adminWrite('deleteTeam', {
        name:clean(team.name),
        game:clean(team.game),
        expectedRevision:clean(team.revision)
      });
      modalStatus(result?.message || 'Команда удалена.', 'ok');
      await refreshAfterMutation(result);
    } catch (error) {
      modalStatus(error?.message || 'Команда не удалена.', 'error');
      if (direct) showMessage(error?.message || 'Команда не удалена.', true);
      if (error?.conflict) state.payload = null;
    } finally {
      if (document.body.contains(button)) {
        button.disabled = false;
        if (direct) button.textContent = oldText;
      }
    }
  }

  async function submitForm(form) {
    const save = form.querySelector('.is-save');
    if (save) save.disabled = true;
    modalStatus(form.matches('[data-write-team-form]')
      ? 'Фиксируем команду и фото…'
      : 'Фиксируем изменение в таблице…');
    try {
      const result = form.matches('[data-write-participant-form]')
        ? await saveParticipant(form)
        : await saveTeam(form);
      modalStatus(result?.message || 'Сохранено.', 'ok');
      await refreshAfterMutation(result);
    } catch (error) {
      modalStatus(error?.message || 'Изменение не сохранено.', 'error');
      if (error?.conflict) state.payload = null;
    } finally {
      if (save) save.disabled = false;
    }
  }

  function updateSlotControls(select) {
    const section = select?.closest?.('[data-write-slot]');
    if (!section) return;
    const gameSelect = section.querySelector('[data-write-field="game"]');
    const teamSelect = section.querySelector('[data-write-field="team"]');
    const roleSelect = section.querySelector('[data-write-field="role"]');

    if (select === gameSelect && teamSelect) {
      teamSelect.innerHTML = teamOptions(gameSelect.value,'');
      teamSelect.value = '';
    }
    const team = clean(teamSelect?.value);
    if (roleSelect) {
      const oldRole = clean(roleSelect.value);
      roleSelect.innerHTML = roleOptions(team,oldRole);
      if (![...roleSelect.options].some(option => option.value === oldRole)) {
        roleSelect.value = team ? 'Игрок' : '';
      }
    }
    syncSlotClearButton(section);
  }

  function syncSlotClearButton(section) {
    const button = section?.querySelector?.('[data-write-clear-slot="1"]');
    if (button) button.disabled = !slotHasData(section);
  }

  function clearMembershipSlot(button) {
    const section = button?.closest?.('[data-write-slot]');
    if (!section) return false;
    const gameSelect = section.querySelector('[data-write-field="game"]');
    const teamSelect = section.querySelector('[data-write-field="team"]');
    const roleSelect = section.querySelector('[data-write-field="role"]');
    const nicknameInput = section.querySelector('[data-write-field="nickname"]');

    if (gameSelect) gameSelect.value = '';
    if (teamSelect) {
      teamSelect.innerHTML = teamOptions('','');
      teamSelect.value = '';
    }
    if (roleSelect) {
      roleSelect.innerHTML = roleOptions('','');
      roleSelect.value = '';
    }
    if (nicknameInput) nicknameInput.value = '';
    syncSlotClearButton(section);
    modalStatus(`Слот ${Number(section.dataset?.writeSlot || 0)} очищен. Нажмите «Сохранить», чтобы применить.`);
    return true;
  }

  function showMessage(text, error=false) {
    const message = clean(text);
    try {
      if (window.Telegram?.WebApp?.showAlert) {
        window.Telegram.WebApp.showAlert(message);
        return;
      }
    } catch (_) {}
    if (error) console.error(message); else console.log(message);
    alert(message);
  }

  // Window capture fires before admin-v0600's read-phase document listener.
  window.addEventListener('click', async event => {
    const target = event.target;
    if (target?.closest?.('[data-admin-edit-mode="1"]')) {
      event.preventDefault(); event.stopImmediatePropagation();
      await toggleEditing(); return;
    }
    if (target?.closest?.('[data-write-close="1"]')) {
      event.preventDefault(); event.stopImmediatePropagation(); closeModal(); return;
    }
    if (target?.matches?.('[data-admin-write-modal="1"]')) {
      closeModal(); return;
    }

    const clearSlotButton = target?.closest?.('[data-write-clear-slot="1"]');
    if (clearSlotButton) {
      event.preventDefault(); event.stopImmediatePropagation();
      clearMembershipSlot(clearSlotButton);
      return;
    }

    const deleteParticipantButton = target?.closest?.('[data-admin-delete-participant="1"]');
    if (deleteParticipantButton) {
      event.preventDefault(); event.stopImmediatePropagation();
      try {
        let participant = state.modal?.record || null;
        if (!participant) {
          await loadAdmin(true);
          participant = findParticipantByNode(deleteParticipantButton);
        }
        await deleteParticipant(deleteParticipantButton, participant);
      } catch (error) {
        showMessage(error?.message || 'Не удалось обновить карточку.', true);
      }
      return;
    }

    const deleteTeamButton = target?.closest?.('[data-admin-delete-team="1"]');
    if (deleteTeamButton) {
      event.preventDefault(); event.stopImmediatePropagation();
      try {
        let team = state.modal?.record || null;
        if (!team) {
          await loadAdmin(true);
          team = findTeamByNode(deleteTeamButton);
        }
        await deleteTeam(deleteTeamButton, team);
      } catch (error) {
        showMessage(error?.message || 'Не удалось обновить карточку команды.', true);
      }
      return;
    }

    if (target?.closest?.('[data-admin-create-participant="1"]')) {
      event.preventDefault(); event.stopImmediatePropagation();
      try { await loadAdmin(false); openParticipantModal(null,true); }
      catch (error) { showMessage(error?.message || 'Не удалось обновить данные.', true); }
      return;
    }
    if (target?.closest?.('[data-admin-create-team="1"]')) {
      event.preventDefault(); event.stopImmediatePropagation();
      try { await loadAdmin(false); openTeamModal(null,true); }
      catch (error) { showMessage(error?.message || 'Не удалось обновить данные.', true); }
      return;
    }

    const editParticipant = target?.closest?.('[data-admin-edit-participant="1"]');
    if (editParticipant) {
      event.preventDefault(); event.stopImmediatePropagation();
      try {
        await loadAdmin(false);
        const participant = findParticipantByNode(editParticipant);
        if (!participant) {
          showMessage('Эта карточка уже изменилась. Нажмите «Обновить» и откройте её снова.', true);
          return;
        }
        openParticipantModal(participant,false);
      } catch (error) {
        showMessage(error?.message || 'Не удалось обновить карточку.', true);
      }
      return;
    }

    const editTeam = target?.closest?.('[data-admin-edit-team="1"]');
    if (editTeam) {
      event.preventDefault(); event.stopImmediatePropagation();
      try {
        await loadAdmin(false);
        const team = findTeamByNode(editTeam);
        if (!team) {
          showMessage('Эта команда уже изменилась. Нажмите «Обновить» и откройте её снова.', true);
          return;
        }
        openTeamModal(team,false);
      } catch (error) {
        showMessage(error?.message || 'Не удалось обновить команду.', true);
      }
      return;
    }

    if (target?.closest?.('[data-admin-refresh="1"]') && !state.pendingRequestIds.size) state.payload = null;
  }, true);

  document.addEventListener('submit', event => {
    const form = event.target;
    if (!form?.matches?.('[data-write-participant-form],[data-write-team-form]')) return;
    event.preventDefault(); event.stopImmediatePropagation();
    submitForm(form);
  }, true);

  document.addEventListener('change', event => {
    const field = event.target;
    if (field?.matches?.('[data-write-slot] [data-write-field="game"],[data-write-slot] [data-write-field="team"]')) {
      updateSlotControls(field);
      return;
    }
    syncSlotClearButton(field?.closest?.('[data-write-slot]'));
  }, true);

  document.addEventListener('input', event => {
    const field = event.target;
    if (field?.matches?.('[data-write-slot] [data-write-field="nickname"]')) {
      syncSlotClearButton(field.closest('[data-write-slot]'));
    }
  }, true);

  const observer = new MutationObserver(() => {
    if (state.observerBusy) return;
    state.observerBusy = true;
    setTimeout(() => {
      try {
        if (state.editing && isAdminScreen()) injectEditUi();
      } finally {
        state.observerBusy = false;
      }
    },0);
  });
  observer.observe(document.body,{childList:true,subtree:true});

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') scheduleLiveSnapshotRefresh(1000);
  });

  installCss();
  scheduleLiveSnapshotRefresh(5000);
  window.RoyalAdminWriteV0600 = {
    version:VERSION,
    toggle:toggleEditing,
    refresh:() => loadAdmin(true),
    refreshSnapshots:() => Promise.allSettled([
      refreshPublicSnapshotOnce(),
      refreshVisibleAdminSnapshot()
    ]),
    canDeleteParticipant,
    canDeleteTeam,
    get enabled(){ return state.editing; }
  };

  window.RoyalAdminDataV0600?.subscribe?.(event => {
    if (event?.type !== 'clear' || !['unauthorized','forbidden','session-changed'].includes(clean(event?.reason))) return;
    state.payload = null;
    state.editing = false;
    state.pendingRequestIds.clear();
    closeModal();
    removeEditUi();
  });
})();
