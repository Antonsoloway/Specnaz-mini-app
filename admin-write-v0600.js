/* Royal CRM Mini App — protected Admin Write UI v0.6.0 */
(() => {
  const VERSION = '0.6.0-write.2';
  const state = { editing:false, payload:null, loading:null, modal:null, observerBusy:false };

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const clean = value => String(value == null ? '' : value).trim();
  const participantTitle = p => clean(p?.name || p?.telegramName || p?.username || p?.telegramId || 'Участник');

  function installCss() {
    if (document.querySelector('link[data-admin-write-css="1"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'admin-write-v0600.css?v=20260819-2345';
    link.dataset.adminWriteCss = '1';
    document.head.appendChild(link);
  }

  function isAdminScreen() { return !!document.querySelector('.royal-admin-screen'); }
  function teams() { return Array.isArray(state.payload?.adminData?.teams) ? state.payload.adminData.teams : []; }
  function participants() { return Array.isArray(state.payload?.adminData?.participants) ? state.payload.adminData.participants : []; }
  function writeMeta() { return state.payload?.adminData?.write || {}; }

  async function loadAdmin(force=false) {
    if (state.payload && !force) return state.payload;
    if (state.loading && !force) return state.loading;
    state.loading = (async () => {
      if (!sessionToken) throw new Error('SESSION_MISSING');
      const response = await fetch(`${API_URL}/admin-data`, {
        method:'GET', mode:'cors', cache:'no-store',
        headers:{Authorization:`Bearer ${sessionToken}`}
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

  function syncRecordIdentity() {
    if (!state.payload) return;
    const pData = participants();
    [...document.querySelectorAll('[data-admin-participant="1"]')].forEach((node,index) => {
      const record = pData[index];
      if (!record) return;
      node.dataset.adminWriteIndex = String(index);
      node.dataset.adminWriteTelegramId = clean(record.telegramId);
    });
    const tData = teams();
    [...document.querySelectorAll('[data-admin-team="1"]')].forEach((node,index) => {
      const record = tData[index];
      if (!record) return;
      node.dataset.adminWriteIndex = String(index);
      node.dataset.adminWriteTeamKey = clean(record.key || `${record.game}\n${record.name}`);
    });
  }

  function injectEditUi() {
    if (!state.editing || !isAdminScreen() || !state.payload) return;
    syncRecordIdentity();
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
        toolbar.insertAdjacentHTML('afterend','<div class="royal-admin-edit-hint" data-admin-edit-hint="1">Редактируются только исходные поля. Формулы, автоматические счётчики и вычисляемые статусы защищены от записи.</div>');
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

  async function toggleEditing() {
    if (state.editing) {
      state.editing = false;
      removeEditUi();
      return;
    }
    try {
      await loadAdmin(true);
      const meta = writeMeta();
      if (!meta?.enabled) {
        showMessage('Сервер защищённого редактирования ещё не установлен. Просмотр админских данных продолжает работать.', true);
        return;
      }
      state.editing = true;
      injectEditUi();
    } catch (error) {
      showMessage(error?.message || 'Не удалось включить редактирование.', true);
    }
  }

  function participantByNode(node) {
    const index = Number(node?.closest?.('[data-admin-participant="1"]')?.dataset?.adminWriteIndex ?? -1);
    return index >= 0 ? participants()[index] : null;
  }

  function teamByNode(node) {
    const index = Number(node?.closest?.('[data-admin-team="1"]')?.dataset?.adminWriteIndex ?? -1);
    return index >= 0 ? teams()[index] : null;
  }

  function normalizedSlots(participant) {
    const bySlot = new Map((Array.isArray(participant?.memberships) ? participant.memberships : []).map(item => [Number(item?.slot || 0),item]));
    return [1,2,3,4,5].map(slot => ({slot,...(bySlot.get(slot)||{})}));
  }

  function teamOptions(selectedGame, selectedTeam) {
    const game = clean(selectedGame);
    const options = ['<option value="">— без команды —</option>'];
    teams().filter(team => clean(team.game) === game).forEach(team => {
      const selected = clean(team.name) === clean(selectedTeam) ? ' selected' : '';
      options.push(`<option value="${esc(team.name)}"${selected}>${esc(team.name)}</option>`);
    });
    return options.join('');
  }

  function roleOptions(team, selected) {
    const roles = team ? ['Игрок','Помощник','Лидер'] : ['','Спецназ РМ','Спецназ РК'];
    return roles.map(role => `<option value="${esc(role)}"${clean(selected)===role?' selected':''}>${esc(role || '—')}</option>`).join('');
  }

  function slotHtml(slot) {
    const game = clean(slot.game);
    const team = clean(slot.team);
    return `<section class="royal-admin-slot-editor" data-write-slot="${slot.slot}">
      <div class="royal-admin-slot-title">Слот ${slot.slot}</div>
      <div class="royal-admin-slot-grid">
        <label class="royal-admin-input"><span>Игра</span><select data-write-field="game"><option value="">—</option><option value="Royal Match"${game==='Royal Match'?' selected':''}>Royal Match</option><option value="Royal Kingdom"${game==='Royal Kingdom'?' selected':''}>Royal Kingdom</option></select></label>
        <label class="royal-admin-input"><span>Роль</span><select data-write-field="role">${roleOptions(team,slot.role)}</select></label>
        <label class="royal-admin-input is-wide"><span>Команда</span><select data-write-field="team">${teamOptions(game,team)}</select></label>
        <label class="royal-admin-input is-wide"><span>Игровой ник</span><input data-write-field="nickname" maxlength="160" value="${esc(slot.nickname)}"></label>
      </div>
    </section>`;
  }

  function openParticipantModal(participant, creating=false) {
    const source = participant || {memberships:[],chatState:'В чате',specnaz:0};
    const title = creating ? 'Добавить участника' : `Изменить: ${participantTitle(source)}`;
    openModal(`
      <div class="royal-admin-modal-head"><div><div class="royal-admin-kicker">Участники</div><h3>${esc(title)}</h3></div><button type="button" class="royal-admin-modal-close" data-write-close="1">×</button></div>
      <form class="royal-admin-form" data-write-participant-form="1" data-write-mode="${creating?'create':'update'}">
        <div class="royal-admin-form-grid">
          <label class="royal-admin-input"><span>Telegram ID</span><input data-write-field="telegramId" inputmode="numeric" pattern="[0-9]*" ${creating?'':'readonly'} value="${esc(source.telegramId)}"></label>
          <label class="royal-admin-input"><span>Состояние чата</span><select data-write-field="chatState"><option value="В чате"${clean(source.chatState)==='В чате'?' selected':''}>В чате</option><option value="Вышел"${clean(source.chatState)==='Вышел'?' selected':''}>Вышел</option></select></label>
          <label class="royal-admin-input"><span>Имя</span><input data-write-field="name" maxlength="160" value="${esc(source.name)}"></label>
          <label class="royal-admin-input"><span>Имя Telegram</span><input data-write-field="telegramName" maxlength="180" value="${esc(source.telegramName)}"></label>
          <label class="royal-admin-input"><span>@username</span><input data-write-field="username" maxlength="33" value="${esc(source.username)}" placeholder="@username"></label>
          <label class="royal-admin-input"><span>Походы спецназа</span><input data-write-field="specnaz" type="number" min="0" max="99999" step="1" value="${esc(source.specnaz ?? 0)}"></label>
        </div>
        <div class="royal-admin-form-note">Telegram ID — ключ участника. После создания он не редактируется. Статус T, игры W:AA и счётчики активности рассчитываются системой.</div>
        ${normalizedSlots(source).map(slotHtml).join('')}
        <div class="royal-admin-danger-note">Удаление участников в v0.6 отключено. Для вышедшего участника используется состояние «Вышел», история записи сохраняется.</div>
        <div data-write-status></div>
        <div class="royal-admin-form-actions"><button type="button" class="royal-admin-form-button" data-write-close="1">Отмена</button><button type="submit" class="royal-admin-form-button is-save">💾 Сохранить</button></div>
      </form>`, {kind:'participant',creating,record:source});
  }

  function openTeamModal(team, creating=false) {
    const source = team || {game:'Royal Match'};
    openModal(`
      <div class="royal-admin-modal-head"><div><div class="royal-admin-kicker">Команды</div><h3>${creating?'Добавить команду':`Изменить: ${esc(source.name)}`}</h3></div><button type="button" class="royal-admin-modal-close" data-write-close="1">×</button></div>
      <form class="royal-admin-form" data-write-team-form="1" data-write-mode="${creating?'create':'update'}">
        <div class="royal-admin-form-grid">
          <label class="royal-admin-input"><span>Игра</span><select data-write-field="game" ${creating?'':'disabled'}><option value="Royal Match"${source.game==='Royal Match'?' selected':''}>Royal Match</option><option value="Royal Kingdom"${source.game==='Royal Kingdom'?' selected':''}>Royal Kingdom</option></select></label>
          <label class="royal-admin-input"><span>Название команды</span><input data-write-field="name" maxlength="180" value="${esc(source.name)}"></label>
          <label class="royal-admin-input is-wide"><span>Лидер / подпись</span><input data-write-field="leader" maxlength="180" value="${esc(source.leader)}"></label>
        </div>
        <div class="royal-admin-form-note">Игра существующей команды не меняется: это часть её идентичности. Переименование названия каскадно обновит команду во всех пяти слотах участников этой игры.</div>
        <div class="royal-admin-danger-note">Фото C и вычисляемые E:L не перезаписываются приложением. Удаление команд в v0.6 отключено.</div>
        <div data-write-status></div>
        <div class="royal-admin-form-actions"><button type="button" class="royal-admin-form-button" data-write-close="1">Отмена</button><button type="submit" class="royal-admin-form-button is-save">💾 Сохранить</button></div>
      </form>`, {kind:'team',creating,record:source});
  }

  function openModal(html, context) {
    closeModal();
    const backdrop = document.createElement('div');
    backdrop.className = 'royal-admin-modal-backdrop';
    backdrop.dataset.adminWriteModal = '1';
    backdrop.innerHTML = `<div class="royal-admin-modal">${html}</div>`;
    document.body.appendChild(backdrop);
    state.modal = {element:backdrop,...context};
  }

  function closeModal() {
    document.querySelector('[data-admin-write-modal="1"]')?.remove();
    state.modal = null;
  }

  function modalStatus(text, type='') {
    const node = document.querySelector('[data-admin-write-modal="1"] [data-write-status]');
    if (!node) return;
    node.className = `royal-admin-write-status ${type==='error'?'is-error':type==='ok'?'is-ok':''}`;
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

  function collectParticipant(form) {
    return {
      telegramId:clean(form.querySelector('[data-write-field="telegramId"]')?.value),
      changes:{
        name:clean(form.querySelector('[data-write-field="name"]')?.value),
        telegramName:clean(form.querySelector('[data-write-field="telegramName"]')?.value),
        username:clean(form.querySelector('[data-write-field="username"]')?.value),
        specnaz:Number(form.querySelector('[data-write-field="specnaz"]')?.value || 0),
        chatState:clean(form.querySelector('[data-write-field="chatState"]')?.value),
        memberships:collectMemberships(form)
      }
    };
  }

  async function saveParticipant(form) {
    const creating = form.dataset.writeMode === 'create';
    const data = collectParticipant(form);
    if (!/^\d{5,20}$/.test(data.telegramId)) throw new Error('Telegram ID должен содержать только цифры.');
    return adminWrite(
      creating ? 'createParticipant' : 'updateParticipant',
      creating ? data : {...data,expectedRevision:clean(state.modal?.record?.revision)}
    );
  }

  async function saveTeam(form) {
    const creating = form.dataset.writeMode === 'create';
    const source = state.modal?.record || {};
    const game = clean(form.querySelector('[data-write-field="game"]')?.value || source.game);
    const name = clean(form.querySelector('[data-write-field="name"]')?.value);
    const leader = clean(form.querySelector('[data-write-field="leader"]')?.value);
    if (!name) throw new Error('Введите название команды.');
    if (creating) return adminWrite('createTeam',{game,name,leader});
    return adminWrite('updateTeam',{
      game:source.game,
      name:source.name,
      expectedRevision:source.revision,
      changes:{name,leader}
    });
  }

  function requestId() {
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    return 'rw_' + [...bytes].map(byte => byte.toString(16).padStart(2,'0')).join('');
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
      body:JSON.stringify({requestId:id,op,payload})
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

  async function adminWrite(op,payload) {
    if (!sessionToken) throw new Error('Сессия приложения не готова. Откройте приложение заново.');
    const id = requestId();
    try {
      return await postWriteOnce(id,op,payload);
    } catch (firstError) {
      // Retry only transport failures. The SAME requestId is reused, so even if
      // the first request reached Sheets but its response was lost, the server
      // journal/idempotency layer prevents a duplicate mutation.
      if (firstError?.httpStatus) throw firstError;
      await new Promise(resolve => setTimeout(resolve,900));
      return postWriteOnce(id,op,payload);
    }
  }

  async function submitForm(form) {
    const save = form.querySelector('.is-save');
    if (save) save.disabled = true;
    modalStatus('Сохраняем и проверяем данные…');
    try {
      const result = form.matches('[data-write-participant-form]') ? await saveParticipant(form) : await saveTeam(form);
      modalStatus(result?.message || 'Сохранено.', 'ok');
      await new Promise(resolve => setTimeout(resolve,650));
      closeModal();
      state.payload = null;
      try { window.RoyalAdminV0600?.clearCache?.(); } catch (_) {}
      await loadAdmin(true).catch(() => null);
      try { await window.RoyalAdminV0600?.refresh?.(); } catch (_) {}
      showMessage(result?.message || 'Изменение сохранено.');
      setTimeout(() => { if (state.editing) injectEditUi(); },250);
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
      // Game identity changed: old team is invalid by definition. Reset it.
      teamSelect.innerHTML = teamOptions(gameSelect.value,'');
      teamSelect.value = '';
    }
    const team = clean(teamSelect?.value);
    if (roleSelect) {
      const previousRole = clean(roleSelect.value);
      roleSelect.innerHTML = roleOptions(team,previousRole);
      if (![...roleSelect.options].some(option => option.value === previousRole)) {
        roleSelect.value = team ? 'Игрок' : '';
      }
    }
  }

  function showMessage(text,error=false) {
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

  // Window capture fires before admin-v0600's document capture listener, so the
  // old read-phase informational edit handler is suppressed when write v0.6 is loaded.
  window.addEventListener('click', async event => {
    const target = event.target;
    if (target?.closest?.('[data-admin-edit-mode="1"]')) {
      event.preventDefault(); event.stopImmediatePropagation(); await toggleEditing(); return;
    }
    if (target?.closest?.('[data-write-close="1"]')) {
      event.preventDefault(); event.stopImmediatePropagation(); closeModal(); return;
    }
    if (target?.closest?.('[data-admin-create-participant="1"]')) {
      event.preventDefault(); event.stopImmediatePropagation(); openParticipantModal(null,true); return;
    }
    if (target?.closest?.('[data-admin-create-team="1"]')) {
      event.preventDefault(); event.stopImmediatePropagation(); openTeamModal(null,true); return;
    }
    const editParticipant = target?.closest?.('[data-admin-edit-participant="1"]');
    if (editParticipant) {
      event.preventDefault(); event.stopImmediatePropagation();
      const participant = participantByNode(editParticipant);
      if (participant) openParticipantModal(participant,false);
      return;
    }
    const editTeam = target?.closest?.('[data-admin-edit-team="1"]');
    if (editTeam) {
      event.preventDefault(); event.stopImmediatePropagation();
      const team = teamByNode(editTeam);
      if (team) openTeamModal(team,false);
      return;
    }
    if (target?.matches?.('[data-admin-write-modal="1"]')) closeModal();
  },true);

  document.addEventListener('submit', event => {
    const form = event.target;
    if (!form?.matches?.('[data-write-participant-form],[data-write-team-form]')) return;
    event.preventDefault(); event.stopImmediatePropagation(); submitForm(form);
  },true);

  document.addEventListener('change', event => {
    const field = event.target;
    if (field?.matches?.('[data-write-slot] [data-write-field="game"],[data-write-slot] [data-write-field="team"]')) {
      updateSlotControls(field);
    }
  },true);

  const observer = new MutationObserver(() => {
    if (!state.editing || state.observerBusy) return;
    state.observerBusy = true;
    setTimeout(() => {
      try { if (isAdminScreen()) injectEditUi(); }
      finally { state.observerBusy = false; }
    },0);
  });
  observer.observe(document.body,{childList:true,subtree:true});

  installCss();
  window.RoyalAdminWriteV0600 = {
    version:VERSION,
    toggle:toggleEditing,
    refresh:() => loadAdmin(true),
    get enabled(){ return state.editing; }
  };
})();
