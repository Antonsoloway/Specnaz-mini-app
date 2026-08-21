/* Royal CRM Mini App — protected Admin Write/Delete UI v0.6.0-write.5 */
(() => {
  const VERSION = '0.6.0-write.5-ui.2';
  const state = { editing:false, payload:null, loading:null, modal:null, observerBusy:false };

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
      link.href = 'admin-write-v0600.css?v=20260821-1435';
      link.dataset.adminWriteCss = '1';
      document.head.appendChild(link);
    }
    if (!document.querySelector('link[data-admin-write-v2-css="1"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'admin-write-v0600-v2.css?v=20260821-1435';
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

  async function loadAdmin(force=false) {
    if (state.payload && !force) return state.payload;
    if (state.loading && !force) return state.loading;
    state.loading = (async () => {
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
      state.payload = data;
      return data;
    })().finally(() => { state.loading = null; });
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
    decorateJournal();
  }

  function removeEditUi() {
    document.querySelectorAll('[data-admin-write-toolbar="1"],[data-admin-edit-hint="1"],[data-admin-edit-participant="1"],[data-admin-edit-team="1"]').forEach(node => node.remove());
    const button = document.querySelector('[data-admin-edit-mode="1"]');
    if (button) {
      button.classList.remove('is-editing');
      button.textContent = '✏️ Режим редактирования';
    }
  }

  async function toggleEditing() {
    if (state.editing) {
      state.editing = false;
      removeEditUi();
      return;
    }
    try {
      await loadAdmin(true);
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

  function slotHtml(slot) {
    const game = clean(slot?.game);
    const team = clean(slot?.team);
    return `<section class="royal-admin-slot-editor" data-write-slot="${Number(slot?.slot || 0)}">
      <div class="royal-admin-slot-title">Слот ${Number(slot?.slot || 0)}</div>
      <div class="royal-admin-slot-grid">
        <label class="royal-admin-input"><span>Игра</span><select data-write-field="game"><option value="">—</option><option value="Royal Match"${game === 'Royal Match' ? ' selected' : ''}>Royal Match</option><option value="Royal Kingdom"${game === 'Royal Kingdom' ? ' selected' : ''}>Royal Kingdom</option></select></label>
        <label class="royal-admin-input"><span>Роль</span><select data-write-field="role">${roleOptions(team,slot?.role)}</select></label>
        <label class="royal-admin-input is-wide"><span>Команда</span><select data-write-field="team">${teamOptions(game,team)}</select></label>
        <label class="royal-admin-input is-wide"><span>Игровой ник</span><input data-write-field="nickname" maxlength="160" value="${esc(slot?.nickname)}"></label>
      </div>
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
        <div data-write-status></div>
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
    try {
      return await postWriteOnce(id, op, payload);
    } catch (firstError) {
      // Retry only true transport failure. SAME requestId means server-side
      // idempotency protects against a lost response after a committed write.
      if (firstError?.httpStatus) throw firstError;
      await new Promise(resolve => setTimeout(resolve,900));
      return postWriteOnce(id, op, payload);
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

  async function refreshAfterMutation(result) {
    await new Promise(resolve => setTimeout(resolve,650));
    closeModal();
    state.payload = null;
    try { window.RoyalAdminV0600?.clearCache?.(); } catch (_) {}
    try { await window.RoyalAdminV0600?.refresh?.(); } catch (_) {}
    await loadAdmin(true).catch(() => null);
    showMessage(result?.message || 'Изменение сохранено.');
    setTimeout(() => { if (state.editing) injectEditUi(); },180);
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
    modalStatus('Проверяем права и сохраняем…');
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
  }

  function journalOperationLabel(op) {
    return ({
      updateParticipant:'Изменение участника',
      createParticipant:'Новый участник',
      deleteParticipant:'Удаление участника',
      updateTeam:'Изменение команды',
      createTeam:'Новая команда',
      deleteTeam:'Удаление команды'
    })[clean(op)] || clean(op) || 'Изменение';
  }

  function decorateJournal() {
    if (!document.querySelector('[data-admin-tab="journal"].is-active')) return;
    document.querySelectorAll('.royal-admin-list .royal-admin-record .royal-admin-detail').forEach(detail => {
      if (detail.dataset.adminJournalDecorated === '1') return;
      let row;
      try { row = JSON.parse(clean(detail.textContent)); }
      catch (_) { return; }
      const changed = row?.changed && typeof row.changed === 'object'
        ? Object.keys(row.changed)
        : [];
      const admin = clean(row?.adminUsername) || `ID ${clean(row?.adminTelegramId) || '—'}`;
      detail.dataset.adminJournalDecorated = '1';
      detail.innerHTML = `
        <div class="royal-admin-journal-summary">
          <strong>${esc(journalOperationLabel(row?.op))}</strong>
          <small>${esc(row?.at || '')} · ${esc(admin)} · строка ${esc(row?.row || '—')}</small>
          <small>${esc(row?.entityKey || '')}</small>
        </div>
        <div class="royal-admin-journal-chips">${changed.map(key => `<span class="royal-admin-journal-chip">${esc(key)}</span>`).join('')}</div>
        <details class="royal-admin-journal-json"><summary>До / после</summary><pre>${esc(JSON.stringify({before:row?.before,after:row?.after},null,2))}</pre></details>`;
    });
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
      try { await loadAdmin(true); openParticipantModal(null,true); }
      catch (error) { showMessage(error?.message || 'Не удалось обновить данные.', true); }
      return;
    }
    if (target?.closest?.('[data-admin-create-team="1"]')) {
      event.preventDefault(); event.stopImmediatePropagation();
      try { await loadAdmin(true); openTeamModal(null,true); }
      catch (error) { showMessage(error?.message || 'Не удалось обновить данные.', true); }
      return;
    }

    const editParticipant = target?.closest?.('[data-admin-edit-participant="1"]');
    if (editParticipant) {
      event.preventDefault(); event.stopImmediatePropagation();
      try {
        await loadAdmin(true);
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
        await loadAdmin(true);
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

    if (target?.closest?.('[data-admin-refresh="1"]')) state.payload = null;
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
    }
  }, true);

  const observer = new MutationObserver(() => {
    if (state.observerBusy) return;
    state.observerBusy = true;
    setTimeout(() => {
      try {
        if (state.editing && isAdminScreen()) injectEditUi();
        decorateJournal();
      } finally {
        state.observerBusy = false;
      }
    },0);
  });
  observer.observe(document.body,{childList:true,subtree:true});

  installCss();
  window.RoyalAdminWriteV0600 = {
    version:VERSION,
    toggle:toggleEditing,
    refresh:() => loadAdmin(true),
    canDeleteParticipant,
    canDeleteTeam,
    get enabled(){ return state.editing; }
  };
})();
