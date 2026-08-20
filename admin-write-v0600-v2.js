/* Royal CRM Mini App — protected Admin Write UI v0.6.0-write.2 */
(() => {
  const VERSION = '0.6.0-write.2';
  const state = { editing:false, payload:null, loading:null, modal:null, observerBusy:false };

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const clean = value => String(value == null ? '' : value).trim();
  const lower = value => clean(value).toLocaleLowerCase('ru-RU').replace(/ё/g,'е');

  function installCss() {
    if (!document.querySelector('link[data-admin-write-css="1"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'admin-write-v0600.css?v=20260820-0905';
      link.dataset.adminWriteCss = '1';
      document.head.appendChild(link);
    }
    if (!document.querySelector('link[data-admin-write-v2-css="1"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'admin-write-v0600-v2.css?v=20260820-0905';
      link.dataset.adminWriteV2Css = '1';
      document.head.appendChild(link);
    }
  }

  function isAdminScreen(){ return !!document.querySelector('.royal-admin-screen'); }
  function participants(){ return Array.isArray(state.payload?.adminData?.participants) ? state.payload.adminData.participants : []; }
  function teams(){ return Array.isArray(state.payload?.adminData?.teams) ? state.payload.adminData.teams : []; }
  function writeMeta(){ return state.payload?.adminData?.write || {}; }

  async function loadAdmin(force=false){
    if (state.payload && !force) return state.payload;
    if (state.loading && !force) return state.loading;
    state.loading = (async()=>{
      if (!sessionToken) throw new Error('SESSION_MISSING');
      const response = await fetch(`${API_URL}/admin-data`, {
        method:'GET', mode:'cors', cache:'no-store',
        headers:{Authorization:`Bearer ${sessionToken}`}
      });
      const data = await response.json().catch(()=>({}));
      if (!response.ok || !data?.ok || !data?.adminData) {
        const error = new Error(data?.message || `HTTP ${response.status}`);
        error.code = data?.error || `HTTP_${response.status}`;
        throw error;
      }
      state.payload = data;
      return data;
    })().finally(()=>{ state.loading=null; });
    return state.loading;
  }

  function writeEndpoint(){
    const endpoint = clean(writeMeta()?.endpoint);
    if (endpoint) return endpoint;
    try { return clean(new URLSearchParams(location.search).get('gas')); } catch (_) { return ''; }
  }

  function currentTab(){
    if (document.querySelector('[data-admin-team="1"]')) return 'teams';
    if (document.querySelector('[data-admin-participant="1"]')) return 'participants';
    if (document.querySelector('[data-admin-tab="journal"].is-active')) return 'journal';
    return '';
  }

  function participantIdFromNode(node){
    const record = node?.closest?.('[data-admin-participant="1"]');
    const text = clean(record?.querySelector('.royal-admin-summary-main small')?.textContent);
    const match = text.match(/(?:^|·\s*)ID\s+(\d{5,20})(?:\s|$)/i);
    return match ? match[1] : '';
  }

  function teamIdentityFromNode(node){
    const record = node?.closest?.('[data-admin-team="1"]');
    const name = clean(record?.querySelector('.royal-admin-summary-main strong')?.textContent);
    const meta = clean(record?.querySelector('.royal-admin-summary-main small')?.textContent);
    const game = /Royal\s+Kingdom/i.test(meta) ? 'Royal Kingdom' : /Royal\s+Match/i.test(meta) ? 'Royal Match' : '';
    return {name,game};
  }

  function findParticipantByNode(node){
    const id = participantIdFromNode(node);
    return id ? participants().find(p=>clean(p?.telegramId)===id) || null : null;
  }

  function findTeamByNode(node){
    const id = teamIdentityFromNode(node);
    if (!id.name || !id.game) return null;
    return teams().find(t=>clean(t?.name)===id.name && clean(t?.game)===id.game) || null;
  }

  function injectEditUi(){
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
        toolbar.insertAdjacentHTML('afterend','<div class="royal-admin-edit-hint" data-admin-edit-hint="1">Редактируются только исходные поля. Формулы, вычисляемые игры/статусы и командные E:L защищены от записи.</div>');
      }
    }

    document.querySelectorAll('[data-admin-participant="1"]').forEach(node=>{
      const detail=node.querySelector('.royal-admin-detail');
      if (!detail || detail.querySelector('[data-admin-edit-participant="1"]')) return;
      detail.insertAdjacentHTML('beforeend','<button type="button" class="royal-admin-edit-record" data-admin-edit-participant="1">✏️ Изменить участника</button>');
    });
    document.querySelectorAll('[data-admin-team="1"]').forEach(node=>{
      const detail=node.querySelector('.royal-admin-detail');
      if (!detail || detail.querySelector('[data-admin-edit-team="1"]')) return;
      detail.insertAdjacentHTML('beforeend','<button type="button" class="royal-admin-edit-record" data-admin-edit-team="1">✏️ Изменить команду</button>');
    });
    decorateJournal();
  }

  function removeEditUi(){
    document.querySelectorAll('[data-admin-write-toolbar="1"],[data-admin-edit-hint="1"],[data-admin-edit-participant="1"],[data-admin-edit-team="1"]').forEach(n=>n.remove());
    const btn=document.querySelector('[data-admin-edit-mode="1"]');
    if (btn){ btn.classList.remove('is-editing'); btn.textContent='✏️ Режим редактирования'; }
  }

  async function toggleEditing(){
    if (state.editing){ state.editing=false; removeEditUi(); return; }
    try {
      await loadAdmin(true);
      const meta=writeMeta();
      if (!meta?.enabled || !writeEndpoint() || !Array.isArray(meta?.operations)) {
        showMessage('Сервер защищённого редактирования ещё не активирован. Просмотр админских данных продолжает работать.',true);
        return;
      }
      state.editing=true;
      injectEditUi();
    } catch(error){ showMessage(error?.message || 'Не удалось включить редактирование.',true); }
  }

  function dateInputValue(value){
    const text=clean(value);
    let m=text.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    m=text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    return '';
  }

  function todayInput(){
    const d=new Date();
    const y=d.getFullYear();
    const m=String(d.getMonth()+1).padStart(2,'0');
    const day=String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }

  function normalizedSlots(p){
    const bySlot=new Map((Array.isArray(p?.memberships)?p.memberships:[]).map(m=>[Number(m?.slot||0),m]));
    return [1,2,3,4,5].map(slot=>({slot,...(bySlot.get(slot)||{})}));
  }

  function teamOptions(selectedGame,selectedTeam){
    const game=clean(selectedGame);
    const list=teams().filter(t=>clean(t?.game)===game);
    const out=['<option value="">— без команды —</option>'];
    list.forEach(t=>{
      const selected=clean(t?.name)===clean(selectedTeam)?' selected':'';
      out.push(`<option value="${esc(t?.name)}"${selected}>${esc(t?.name)}</option>`);
    });
    return out.join('');
  }

  function roleOptions(team,selected){
    const roles=team?['Игрок','Помощник','Лидер']:['','Спецназ РМ','Спецназ РК'];
    return roles.map(role=>`<option value="${esc(role)}"${clean(selected)===role?' selected':''}>${esc(role||'—')}</option>`).join('');
  }

  function slotHtml(slot){
    const game=clean(slot?.game), team=clean(slot?.team);
    return `<section class="royal-admin-slot-editor" data-write-slot="${Number(slot?.slot||0)}">
      <div class="royal-admin-slot-title">Слот ${Number(slot?.slot||0)}</div>
      <div class="royal-admin-slot-grid">
        <label class="royal-admin-input"><span>Игра</span><select data-write-field="game"><option value="">—</option><option value="Royal Match"${game==='Royal Match'?' selected':''}>Royal Match</option><option value="Royal Kingdom"${game==='Royal Kingdom'?' selected':''}>Royal Kingdom</option></select></label>
        <label class="royal-admin-input"><span>Роль</span><select data-write-field="role">${roleOptions(team,slot?.role)}</select></label>
        <label class="royal-admin-input is-wide"><span>Команда</span><select data-write-field="team">${teamOptions(game,team)}</select></label>
        <label class="royal-admin-input is-wide"><span>Игровой ник</span><input data-write-field="nickname" maxlength="160" value="${esc(slot?.nickname)}"></label>
      </div>
    </section>`;
  }

  function openParticipantModal(p,creating=false){
    const source=p || {memberships:[],chatState:'В чате',specnaz:0,screens:0,activityBase:0,activityOutside:0,date:todayInput()};
    const title=creating?'Добавить участника':`Изменить: ${clean(source?.name||source?.telegramName||source?.username||source?.telegramId||'Участник')}`;
    openModal(`
      <div class="royal-admin-modal-head"><div><div class="royal-admin-kicker">Участники</div><h3>${esc(title)}</h3></div><button type="button" class="royal-admin-modal-close" data-write-close="1">×</button></div>
      <form class="royal-admin-form" data-write-participant-form="1" data-write-mode="${creating?'create':'update'}">
        <div class="royal-admin-form-grid">
          <label class="royal-admin-input"><span>Telegram ID</span><input data-write-field="telegramId" inputmode="numeric" pattern="[0-9]*" ${creating?'':'readonly'} value="${esc(source?.telegramId)}"></label>
          <label class="royal-admin-input"><span>Состояние чата</span><select data-write-field="chatState"><option value="В чате"${clean(source?.chatState)==='В чате'?' selected':''}>В чате</option><option value="Вышел"${clean(source?.chatState)==='Вышел'?' selected':''}>Вышел</option></select></label>
          <label class="royal-admin-input"><span>Имя</span><input data-write-field="name" maxlength="160" value="${esc(source?.name)}"></label>
          <label class="royal-admin-input"><span>Имя Telegram</span><input data-write-field="telegramName" maxlength="180" value="${esc(source?.telegramName)}"></label>
          <label class="royal-admin-input"><span>@username</span><input data-write-field="username" maxlength="33" value="${esc(source?.username)}" placeholder="@username"></label>
          <label class="royal-admin-input"><span>Дата V</span><input data-write-field="date" type="date" value="${esc(dateInputValue(source?.date)||todayInput())}"></label>
          <label class="royal-admin-input"><span>Походы спецназа U</span><input data-write-field="specnaz" type="number" min="0" max="99999" step="1" value="${esc(source?.specnaz??0)}"></label>
          <label class="royal-admin-input"><span>Скрины AB</span><input data-write-field="screens" type="number" min="0" max="999999" step="1" value="${esc(source?.screens??0)}"></label>
          <label class="royal-admin-input"><span>Активность в базе AC</span><input data-write-field="activityBase" type="number" min="0" max="999999" step="1" value="${esc(source?.activityBase??0)}"></label>
          <label class="royal-admin-input"><span>Активность вне базы AD</span><input data-write-field="activityOutside" type="number" min="0" max="999999" step="1" value="${esc(source?.activityOutside??0)}"></label>
        </div>
        <div class="royal-admin-form-note">Telegram ID — неизменяемый ключ. Статус T, игры W:AA и дата изменения AE остаются под системной логикой. Увеличение U проходит через штатную «Историю спецназа».</div>
        <div class="royal-admin-write-section-title">Команды и роли</div>
        ${normalizedSlots(source).map(slotHtml).join('')}
        <div class="royal-admin-danger-note">Удаление участников в v0.6 отключено. Для покинувшего чат используется «Вышел» — запись и история сохраняются.</div>
        <div data-write-status></div>
        <div class="royal-admin-form-actions"><button type="button" class="royal-admin-form-button" data-write-close="1">Отмена</button><button type="submit" class="royal-admin-form-button is-save">💾 Сохранить</button></div>
      </form>`, {kind:'participant',creating,record:source});
  }

  function openTeamModal(team,creating=false){
    const source=team || {game:'Royal Match'};
    openModal(`
      <div class="royal-admin-modal-head"><div><div class="royal-admin-kicker">Команды</div><h3>${creating?'Добавить команду':`Изменить: ${esc(source?.name)}`}</h3></div><button type="button" class="royal-admin-modal-close" data-write-close="1">×</button></div>
      <form class="royal-admin-form" data-write-team-form="1" data-write-mode="${creating?'create':'update'}">
        <div class="royal-admin-form-grid">
          <label class="royal-admin-input"><span>Игра</span><select data-write-field="game" ${creating?'':'disabled'}><option value="Royal Match"${source?.game==='Royal Match'?' selected':''}>Royal Match</option><option value="Royal Kingdom"${source?.game==='Royal Kingdom'?' selected':''}>Royal Kingdom</option></select></label>
          <label class="royal-admin-input"><span>Название команды</span><input data-write-field="name" maxlength="180" value="${esc(source?.name)}"></label>
          <label class="royal-admin-input is-wide"><span>Лидер / подпись</span><input data-write-field="leader" maxlength="180" value="${esc(source?.leader)}"></label>
        </div>
        <div class="royal-admin-form-note">Игра существующей команды — часть identity и не меняется. Переименование названия каскадно обновляет все 5 membership-слотов этой игры.</div>
        <div class="royal-admin-danger-note">Фото C и вычисляемые E:L приложение не перезаписывает. Удаление команд в v0.6 отключено.</div>
        <div data-write-status></div>
        <div class="royal-admin-form-actions"><button type="button" class="royal-admin-form-button" data-write-close="1">Отмена</button><button type="submit" class="royal-admin-form-button is-save">💾 Сохранить</button></div>
      </form>`, {kind:'team',creating,record:source});
  }

  function openModal(html,context){
    closeModal();
    const backdrop=document.createElement('div');
    backdrop.className='royal-admin-modal-backdrop';
    backdrop.dataset.adminWriteModal='1';
    backdrop.innerHTML=`<div class="royal-admin-modal">${html}</div>`;
    document.body.appendChild(backdrop);
    state.modal={element:backdrop,...context};
  }
  function closeModal(){ document.querySelector('[data-admin-write-modal="1"]')?.remove(); state.modal=null; }
  function modalStatus(text,type=''){
    const node=document.querySelector('[data-admin-write-modal="1"] [data-write-status]');
    if(!node)return;
    node.className=`royal-admin-write-status ${type==='error'?'is-error':type==='ok'?'is-ok':''}`;
    node.textContent=text;
  }

  function collectMemberships(form){
    return [...form.querySelectorAll('[data-write-slot]')].map(section=>({
      slot:Number(section.dataset.writeSlot),
      game:clean(section.querySelector('[data-write-field="game"]')?.value),
      team:clean(section.querySelector('[data-write-field="team"]')?.value),
      nickname:clean(section.querySelector('[data-write-field="nickname"]')?.value),
      role:clean(section.querySelector('[data-write-field="role"]')?.value)
    }));
  }

  function numberField(form,name){ return Number(form.querySelector(`[data-write-field="${name}"]`)?.value || 0); }
  function collectParticipant(form){
    return {
      telegramId:clean(form.querySelector('[data-write-field="telegramId"]')?.value),
      changes:{
        name:clean(form.querySelector('[data-write-field="name"]')?.value),
        telegramName:clean(form.querySelector('[data-write-field="telegramName"]')?.value),
        username:clean(form.querySelector('[data-write-field="username"]')?.value),
        date:clean(form.querySelector('[data-write-field="date"]')?.value),
        specnaz:numberField(form,'specnaz'), screens:numberField(form,'screens'),
        activityBase:numberField(form,'activityBase'), activityOutside:numberField(form,'activityOutside'),
        chatState:clean(form.querySelector('[data-write-field="chatState"]')?.value),
        memberships:collectMemberships(form)
      }
    };
  }

  async function saveParticipant(form){
    const creating=form.dataset.writeMode==='create';
    const data=collectParticipant(form);
    if(!/^\d{5,20}$/.test(data.telegramId)) throw new Error('Telegram ID должен содержать только цифры.');
    const payload=creating?data:{...data,expectedRevision:clean(state.modal?.record?.revision)};
    return adminWrite(creating?'createParticipant':'updateParticipant',payload);
  }

  async function saveTeam(form){
    const creating=form.dataset.writeMode==='create';
    const game=clean(form.querySelector('[data-write-field="game"]')?.value || state.modal?.record?.game);
    const name=clean(form.querySelector('[data-write-field="name"]')?.value);
    const leader=clean(form.querySelector('[data-write-field="leader"]')?.value);
    if(!name) throw new Error('Введите название команды.');
    if(creating) return adminWrite('createTeam',{game,name,leader});
    const source=state.modal?.record || {};
    return adminWrite('updateTeam',{game:source.game,name:source.name,expectedRevision:source.revision,changes:{name,leader}});
  }

  function requestId(){
    const bytes=new Uint8Array(18); crypto.getRandomValues(bytes);
    return 'rw2_'+[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  function encodePayload(value){
    const bytes=new TextEncoder().encode(JSON.stringify(value||{})); let binary='';
    bytes.forEach(b=>{binary+=String.fromCharCode(b);});
    return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function jsonp(url,timeoutMs=30000){
    return new Promise((resolve,reject)=>{
      const cb=`__royalAdminWriteV2_${Date.now()}_${Math.random().toString(36).slice(2)}`.replace(/[^A-Za-z0-9_$]/g,'_');
      const script=document.createElement('script'); let finished=false;
      const cleanup=()=>{if(finished)return;finished=true;clearTimeout(timer);try{delete window[cb];}catch(_){window[cb]=undefined;}script.remove();};
      window[cb]=data=>{cleanup();resolve(data||{});};
      script.onerror=()=>{cleanup();reject(new Error('Не удалось связаться с Apps Script.'));};
      const timer=setTimeout(()=>{cleanup();reject(new Error('Сервер не ответил вовремя.'));},timeoutMs);
      script.src=`${url}${url.includes('?')?'&':'?'}callback=${encodeURIComponent(cb)}&_=${Date.now()}`;
      document.head.appendChild(script);
    });
  }

  async function adminWrite(op,payload){
    const endpoint=writeEndpoint();
    if(!endpoint) throw new Error('Не найден защищённый адрес записи Apps Script.');
    const initData=clean(window.Telegram?.WebApp?.initData);
    if(!initData) throw new Error('Откройте приложение из Telegram.');
    const params=new URLSearchParams({miniapp:'1',action:'admin-write',op,requestId:requestId(),initData,payload:encodePayload(payload)});
    const data=await jsonp(`${endpoint}?${params.toString()}`);
    if(!data?.ok){
      const error=new Error(data?.message||data?.error||'Изменение не сохранено.');
      error.code=data?.error||'WRITE_FAILED'; error.conflict=!!data?.conflict; throw error;
    }
    return data;
  }

  async function submitForm(form){
    const save=form.querySelector('.is-save'); if(save)save.disabled=true;
    modalStatus('Проверяем права и сохраняем…');
    try{
      const result=form.matches('[data-write-participant-form]')?await saveParticipant(form):await saveTeam(form);
      modalStatus(result?.message||'Сохранено.','ok');
      await new Promise(r=>setTimeout(r,650));
      closeModal();
      state.payload=null;
      try{window.RoyalAdminV0600?.clearCache?.();}catch(_){}
      try{await window.RoyalAdminV0600?.refresh?.();}catch(_){}
      await loadAdmin(true).catch(()=>null);
      showMessage(result?.message||'Изменение сохранено.');
      setTimeout(()=>{if(state.editing)injectEditUi();},150);
    }catch(error){
      modalStatus(error?.message||'Изменение не сохранено.','error');
      if(error?.conflict) state.payload=null;
    }finally{if(save)save.disabled=false;}
  }

  function updateSlotControls(select){
    const section=select?.closest?.('[data-write-slot]'); if(!section)return;
    const game=section.querySelector('[data-write-field="game"]');
    const team=section.querySelector('[data-write-field="team"]');
    const role=section.querySelector('[data-write-field="role"]');
    if(select===game && team) team.innerHTML=teamOptions(game.value,'');
    if(role){
      const old=clean(role.value), hasTeam=clean(team?.value);
      role.innerHTML=roleOptions(hasTeam,old);
      if(![...role.options].some(o=>o.value===old)) role.value=hasTeam?'Игрок':'';
    }
  }

  function journalOperationLabel(op){
    return ({updateParticipant:'Изменение участника',createParticipant:'Новый участник',updateTeam:'Изменение команды',createTeam:'Новая команда'})[clean(op)] || clean(op) || 'Изменение';
  }
  function decorateJournal(){
    if(!document.querySelector('[data-admin-tab="journal"].is-active')) return;
    document.querySelectorAll('.royal-admin-list .royal-admin-record .royal-admin-detail').forEach(detail=>{
      if(detail.dataset.adminJournalDecorated==='1')return;
      let row; try{row=JSON.parse(clean(detail.textContent));}catch(_){return;}
      const changed=row?.changed && typeof row.changed==='object'?Object.keys(row.changed):[];
      const admin=clean(row?.adminUsername)||`ID ${clean(row?.adminTelegramId)||'—'}`;
      detail.dataset.adminJournalDecorated='1';
      detail.innerHTML=`<div class="royal-admin-journal-summary"><strong>${esc(journalOperationLabel(row?.op))}</strong><small>${esc(row?.at||'')} · ${esc(admin)} · строка ${esc(row?.row||'—')}</small><small>${esc(row?.entityKey||'')}</small></div><div class="royal-admin-journal-chips">${changed.map(k=>`<span class="royal-admin-journal-chip">${esc(k)}</span>`).join('')}</div><details class="royal-admin-journal-json"><summary>До / после</summary><pre>${esc(JSON.stringify({before:row?.before,after:row?.after},null,2))}</pre></details>`;
    });
  }

  function showMessage(text,error=false){
    const msg=clean(text);
    try{if(window.Telegram?.WebApp?.showAlert){window.Telegram.WebApp.showAlert(msg);return;}}catch(_){}
    if(error)console.error(msg);else console.log(msg); alert(msg);
  }

  window.addEventListener('click',async event=>{
    const target=event.target;
    if(target?.closest?.('[data-admin-edit-mode="1"]')){event.preventDefault();event.stopImmediatePropagation();await toggleEditing();return;}
    if(target?.closest?.('[data-write-close="1"]')){event.preventDefault();event.stopImmediatePropagation();closeModal();return;}
    if(target?.matches?.('[data-admin-write-modal="1"]')){closeModal();return;}

    if(target?.closest?.('[data-admin-create-participant="1"]')){
      event.preventDefault();event.stopImmediatePropagation();
      try{await loadAdmin(true);openParticipantModal(null,true);}catch(e){showMessage(e?.message||'Не удалось обновить данные.',true);}return;
    }
    if(target?.closest?.('[data-admin-create-team="1"]')){
      event.preventDefault();event.stopImmediatePropagation();
      try{await loadAdmin(true);openTeamModal(null,true);}catch(e){showMessage(e?.message||'Не удалось обновить данные.',true);}return;
    }

    const editParticipant=target?.closest?.('[data-admin-edit-participant="1"]');
    if(editParticipant){
      event.preventDefault();event.stopImmediatePropagation();
      try{
        await loadAdmin(true);
        const p=findParticipantByNode(editParticipant);
        if(!p){showMessage('Эта карточка уже изменилась. Нажмите «Обновить» и откройте её снова.',true);return;}
        openParticipantModal(p,false);
      }catch(e){showMessage(e?.message||'Не удалось обновить карточку.',true);}return;
    }

    const editTeam=target?.closest?.('[data-admin-edit-team="1"]');
    if(editTeam){
      event.preventDefault();event.stopImmediatePropagation();
      try{
        await loadAdmin(true);
        const t=findTeamByNode(editTeam);
        if(!t){showMessage('Эта команда уже изменилась. Нажмите «Обновить» и откройте её снова.',true);return;}
        openTeamModal(t,false);
      }catch(e){showMessage(e?.message||'Не удалось обновить команду.',true);}return;
    }

    if(target?.closest?.('[data-admin-refresh="1"]')) state.payload=null;
  },true);

  document.addEventListener('submit',event=>{
    const form=event.target;
    if(!form?.matches?.('[data-write-participant-form],[data-write-team-form]'))return;
    event.preventDefault();event.stopImmediatePropagation();submitForm(form);
  },true);
  document.addEventListener('change',event=>{
    const field=event.target;
    if(field?.matches?.('[data-write-slot] [data-write-field="game"],[data-write-slot] [data-write-field="team"]')) updateSlotControls(field);
  },true);

  const observer=new MutationObserver(()=>{
    if(state.observerBusy)return;
    state.observerBusy=true;
    setTimeout(()=>{try{if(state.editing&&isAdminScreen())injectEditUi();decorateJournal();}finally{state.observerBusy=false;}},0);
  });
  observer.observe(document.body,{childList:true,subtree:true});

  installCss();
  window.RoyalAdminWriteV0600={version:VERSION,toggle:toggleEditing,refresh:()=>loadAdmin(true),get enabled(){return state.editing;}};
})();
