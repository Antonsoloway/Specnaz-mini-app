/* Read-only RM/RK card. The existing CRM membership list stays below this block. */
(() => {
  const API=typeof API_URL==='undefined'?'https://royal-crm-miniapp-api.tropical-spoon.workers.dev':API_URL;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=v=>v==null?'—':Number(v).toLocaleString('ru-RU');
  const playerNum=v=>v==null?'—':String(v);
  const icon=kind=>'<svg viewBox="0 0 32 32" aria-hidden="true">'+(kind==='cup'?'<path d="M9 4h14v9c0 7-3 9-7 9s-7-2-7-9zM9 7H3v5c0 4 3 6 7 6M23 7h6v5c0 4-3 6-7 6M16 22v5M10 29h12" fill="#ffd552" stroke="#af720a" stroke-width="2"/>':kind==='shield'?'<path d="M5 4h22v13c0 6-6 10-11 13C11 27 5 23 5 17z" fill="#b92347" stroke="#ffd95b" stroke-width="3"/><path d="M11 12h10M16 7v10" stroke="#fff0a5" stroke-width="3"/>':kind==='star'?'<path d="M16 2l4 9 10 1-7 7 2 10-9-5-9 5 2-10-7-7 10-1z" fill="#ffcf42" stroke="#956724" stroke-width="1.5"/>':'<path d="M3 9l7 6 6-11 6 11 7-6-4 18H7z" fill="#ffd552" stroke="#96662a" stroke-width="2"/><path d="M7 23h18" stroke="#f69e29" stroke-width="3"/>')+'</svg>';
  const token=()=>typeof sessionToken==='undefined'?'':sessionToken;
  const states=new WeakMap(),hosts=new WeakMap(),saved=new Map();let permitted=true,lastSession=token();
  const PREFIX='royal-team-live:v1:',LIMIT=100;
  // The session is already authenticated by the app. Decode only its stable owner
  // for cache isolation; this is never used to grant access or stored as a token.
  function owner(){try{const part=token().split('.')[0].replace(/-/g,'+').replace(/_/g,'/');const id=JSON.parse(atob(part)).tg;return /^\d+$/.test(String(id))?String(id):'';}catch{return '';}}
  const bucket=state=>PREFIX+owner()+':'+(state.admin?'admin':'public');
  const identity=state=>JSON.stringify([state.game,state.name,state.id]);
  function validData(data,state){return data?.teamId===state.id&&(data.game??'Royal Match')===state.game&&Array.isArray(data.leadership)&&data.leadership.every(m=>m&&typeof m.name==='string')&&Number.isFinite(Date.parse(data.fetchedAt));}
  function readSaved(state){
    const key=bucket(state),id=identity(state);let rows=saved.get(key);
    if(!rows){try{rows=owner()?JSON.parse(localStorage.getItem(key)||'[]'):[];}catch{rows=[];}
      if(!Array.isArray(rows))rows=[];rows=rows.filter(row=>Array.isArray(row)&&typeof row[0]==='string'&&row[1]&&typeof row[1]==='object').slice(-LIMIT);saved.set(key,rows);}
    const data=rows.find(row=>row[0]===id)?.[1];return validData(data,state)?data:null;
  }
  function saveData(state,data){
    readSaved(state);const key=bucket(state),id=identity(state),rows=saved.get(key).filter(row=>row[0]!==id);
    rows.push([id,data]);if(rows.length>LIMIT)rows.shift();saved.set(key,rows);
    if(owner())try{localStorage.setItem(key,JSON.stringify(rows));}catch{/* Memory cache remains usable when storage is full/disabled. */}
  }
  function forgetSaved(){saved.clear();if(owner())for(const mode of ['public','admin'])try{localStorage.removeItem(PREFIX+owner()+':'+mode);}catch{}}
  const dated=data=>new Date(data.fetchedAt).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})+' МСК';
  function showData(host,state,data){host.dataset.game=state.game;host.querySelector('[data-team-live-content]').innerHTML=card(data);state.hasData=true;state.data=data;state.photo.classList.remove('team-live-unavailable');}

  function card(data) {
    const rk=data.game==='Royal Kingdom',currency=rk?'Кубки':'Короны';
    const emblem=rk?window.RoyalKingdomEmblems:window.RoyalTeamEmblems;
    const title=rk?esc(data.name):(emblem?.label(data.name)||esc(data.name));
    const fact=(label,value)=>'<div><span>'+label+'</span><b>'+num(value)+'</b></div>';
    const stars=rk&&data.star!=null?'<div class="team-live-stars" aria-label="Звёзд команды: '+esc(data.star)+'">'+Array.from({length:data.star},()=>icon('star')).join('')+'</div>':'';
    return '<header class="team-live-banner"><h3>О команде</h3></header><div class="team-live-summary"><div class="team-live-title"><span class="team-live-emblem" aria-hidden="true">'+(emblem?.image(data.logo)||'')+'</span><h3>'+title+stars+'</h3><div class="team-live-places"><small>Места</small><b>'+num(data.memberCount)+'/'+num(data.capacity)+'</b></div><p class="team-live-description">'+esc(data.description)+'</p></div><div class="team-live-facts">'+fact('Очки команды',data.score)+fact('Требуемый уровень',data.minLevel)+fact(rk?'Нужно кубков':'Короны входа',data.minCrowns)+'<div><span>Тип команды</span><b>'+esc(data.type||'—')+'</b></div></div></div><div class="team-live-leadership">'+data.leadership.slice(0,4).map(m=>'<article class="team-live-player"><div class="team-live-player-head"><span class="team-live-player-icon" aria-hidden="true">'+icon(m.role==='Лидер'?'crown':'star')+'</span><div class="team-live-player-name"><b title="'+esc(m.name)+'">'+esc(m.name)+'</b><small>'+esc(m.role)+'</small></div></div><div class="team-live-crowns"><small>'+icon(rk?'cup':'crown')+' '+currency+'</small><b>'+playerNum(m.crowns)+'</b></div><div><small>Уровень</small><b>'+playerNum(m.level)+'</b></div></article>').join('')+'</div>';
  }
  async function load(host,refresh=false) {
    const state=states.get(host);if(!permitted||!state||state.loading||!host.isConnected)return;
    const session=token();if(!session)return;
    if(!state.hasData){const old=readSaved(state);if(old)showData(host,state,old);}
    state.loading=true;const button=host.querySelector('[data-team-live-refresh]');if(button)button.disabled=true;
    const status=host.querySelector('[data-team-live-status]');status.textContent=(state.hasData?'Сохранённые данные: '+dated(state.data)+'. ':'')+'Обновляем данные игры…';
    const controller=new AbortController();let timer;
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('TEAM_LIVE_TIMEOUT'));},45000);});
    const slow=setTimeout(()=>{if(host.isConnected&&session===token())status.textContent=(state.hasData?'Сохранённые данные: '+dated(state.data)+'. ':'')+'Сервер игры отвечает дольше обычного. Ожидание ограничено; сохранённый скриншот можно открыть ниже.';},10000);
    try {
      const params=new URLSearchParams({team:state.name,game:state.game,...(refresh?{refresh:'1'}:{})});
      const read=async()=>{
        if(window.RoyalTeamEmblems)return {payload:await window.RoyalTeamEmblems.fetchLive({name:state.name,game:state.game,gameTeamId:state.id},state.admin,refresh),r:{ok:true,status:200}};
        const r=await fetch(API+(state.admin?'/admin-team-live?':'/team-live?')+params,{headers:{Authorization:'Bearer '+session},signal:controller.signal});return {r,payload:await r.json()};
      };
      const {payload,r}=await Promise.race([read(),timeout]);if(!host.isConnected||session!==token())return;
      if(r.status===401||r.status===403){host.querySelector('[data-team-live-content]').textContent='';throw Object.assign(Error('Откройте приложение заново.'),{denied:true});}
      if(!r.ok||!payload.ok)throw Object.assign(Error(payload.message||'Данные игры не загрузились.'),{busy:payload.error==='TEAM_LIVE_BUSY'});
      if(payload.data.teamId!==state.id||(payload.data.game??'Royal Match')!==state.game||!Array.isArray(payload.data.leadership))throw Error('Привязка команды изменилась. Обновите карточку.');
      const old=readSaved(state);const data=old&&Date.parse(old.fetchedAt)>Date.parse(payload.data.fetchedAt)?old:payload.data;
      showData(host,state,data);saveData(state,data);
      status.textContent=(data.stale?'Сервер игры недоступен. Последние данные: ':'Обновлено: ')+dated(data);
    }catch(error){if(host.isConnected&&session===token()){
      const denied=error.denied;if(denied){forgetSaved();state.hasData=false;}
      status.textContent=denied?'Откройте приложение заново.':error.busy?'Игровая сессия занята другим запросом. Повторите обновление немного позже.'+(state.hasData?' Последние сохранённые данные: '+dated(state.data):' Сохранённый скриншот доступен ниже.'):state.hasData?'Не удалось обновить сведения. Последние сохранённые данные: '+dated(state.data):'Сервер игры временно недоступен. Повторите обновление; сохранённый скриншот доступен ниже.';
      if(!state.hasData||denied){host.querySelector('[data-team-live-content]').innerHTML='<p>Сведения о команде не загрузились.</p>';state.photo.classList.add('team-live-unavailable');const toggle=host.querySelector('[data-team-live-photo]');if(toggle)toggle.textContent='Скрыть скриншот';}
    }}
    finally{clearTimeout(timer);clearTimeout(slow);state.loading=false;if(button)button.disabled=false;}
  }
  const editors=new WeakMap();
  function decorateEditors(){
    if(!permitted||!token()||!window.RoyalTeamEmblems)return;
    document.querySelectorAll('[data-write-team-form]').forEach(form=>{
      const field=form.querySelector('[data-write-field="name"]'),id=form.querySelector('[data-write-field="gameTeamId"]'),game=form.querySelector('[data-write-field="game"]');
      if(!field||!id||game?.value!=='Royal Match'||!id.value)return;
      let state=editors.get(form);if(!state){state={touched:false,key:''};editors.set(form,state);}
      if(state.touched)return;
      if(window.RoyalTeamEmblems.hasEmojiPrefix(field.value)){field.value=window.RoyalTeamEmblems.emojiName(field.value,null);return;}
      const key=id.value;if(state.key===key)return;
      const records=window.RoyalAdminDataV0600?.current?.adminData?.teams||[];
      const matches=records.filter(t=>t.game==='Royal Match'&&t.gameTeamId===key&&t.name===field.value);if(matches.length!==1)return;
      state.key=key;const session=token(),initial=field.value;
      window.RoyalTeamEmblems.fetchLive(matches[0],true,false,true).then(payload=>{
        if(!permitted||session!==token()||!form.isConnected||state.touched||game.value!=='Royal Match'||id.value!==key||field.value!==initial)return;
        field.value=window.RoyalTeamEmblems.emojiName(initial,payload.data.logo);
      }).catch(()=>{});
    });
  }
  document.addEventListener('input',event=>{
    if(!event.target.matches?.('[data-write-team-form] [data-write-field="name"]'))return;
    const form=event.target.closest('form'),state=editors.get(form)||{key:''};state.touched=true;editors.set(form,state);
  },true);
  function decorate() {
    if(lastSession!==token()){saved.clear();clear();lastSession=token();}
    if(!permitted||!token())return;
    decorateEditors();
    const panel=document.getElementById('panel'),photo=panel?.querySelector('.team-photo-box');
    if(!photo)return;
    const adminShell=panel.querySelector('[data-admin-team="1"]'),admin=!!adminShell;
    const name=adminShell?.dataset.adminTeamName||panel.querySelector('.team-detail-head h2')?.textContent;
    const game=adminShell?.dataset.adminTeamFullGame||panel.querySelector('.team-detail-head .muted')?.textContent;
    if(!['Royal Match','Royal Kingdom'].includes(game))return;
    const teams=admin?window.RoyalAdminDataV0600?.current?.adminData?.teams:(typeof snapshotState==='undefined'?[]:snapshotState?.teams);
    const record=teams?.find(t=>t.name===name&&t.game===game);if(!record?.gameTeamId){photo.parentElement.querySelectorAll('.team-live-card').forEach(n=>n.remove());photo.classList.remove('team-live-original','team-live-photo-shown','team-live-unavailable');return;}
    const parent=photo.parentElement;
    let existing=hosts.get(photo);
    if(!existing?.isConnected)existing=[...parent.children].find(n=>n.matches('.team-live-card'));
    for(const n of [...parent.children])if(n.matches('.team-live-card')&&n!==existing)n.remove();
    if(existing){
      const old=states.get(existing);
      if(old&&old.id===record.gameTeamId&&old.name===name&&old.game===game&&old.admin===admin){hosts.set(photo,existing);return;}
      if(old){existing.remove();}else{
        hosts.set(photo,existing);states.set(existing,{name,admin,game,id:record.gameTeamId,photo,loading:false,hasData:false});photo.classList.add('team-live-original');existing.querySelector('[data-team-live-content]').innerHTML='<p>Получаем сведения о команде…</p>';load(existing);return;
      }
    }
    photo.dataset.teamLiveMounted='1';photo.classList.add('team-live-original');
    const host=document.createElement('section');host.className='team-live-card';
    host.innerHTML='<div data-team-live-content><p>Получаем сведения о команде…</p></div><footer><p data-team-live-status role="status"></p><button type="button" data-team-live-refresh>Обновить</button><button type="button" data-team-live-photo>Показать сохранённый скриншот</button></footer>';
    photo.before(host);hosts.set(photo,host);states.set(host,{name,admin,game,id:record.gameTeamId,photo,loading:false,hasData:false});load(host);
  }
  window.addEventListener('click',event=>{
    const pick=event.target.closest?.('[data-team-live-pick]');
    if(pick){event.preventDefault();event.stopImmediatePropagation();const form=pick.closest('form'),selectedGame=form?.querySelector('[data-write-field="game"]')?.value,session=token();if(!['Royal Match','Royal Kingdom'].includes(selectedGame))return;
      window.RoyalSosiska?.pickTeam(data=>{if(!form.isConnected||session!==token()||form.querySelector('[data-write-field="game"]').value!==selectedGame)return;form.querySelector('[data-write-field="gameTeamId"]').value=data.TeamId;form.querySelector('[data-write-field="name"]').value=selectedGame==='Royal Kingdom'?String(data.TeamName??''):(window.RoyalTeamEmblems?.emojiName(data.TeamName,window.RoyalTeamEmblems.logoOf(data))??data.TeamName??'');editors.set(form,{touched:false,key:String(data.TeamId)});},selectedGame);return;}
    const control=event.target.closest?.('[data-team-live-refresh],[data-team-live-photo]');if(!control)return;
    event.preventDefault();event.stopImmediatePropagation();const host=control.closest('.team-live-card'),state=states.get(host);if(!state)return;
    if(control.matches('[data-team-live-refresh]'))load(host,true);
    else {const shown=state.photo.classList.contains('team-live-photo-shown')||state.photo.classList.contains('team-live-unavailable');state.photo.classList.remove('team-live-unavailable');state.photo.classList.toggle('team-live-photo-shown',!shown);control.textContent=shown?'Показать сохранённый скриншот':'Скрыть скриншот';}
  },true);
  document.addEventListener('change',event=>{
    if(!event.target.matches?.('[data-write-team-form] [data-write-field="game"]'))return;
    const form=event.target.closest('form'),supported=['Royal Match','Royal Kingdom'].includes(event.target.value);
    for(const input of form.querySelectorAll('[data-write-field="gameTeamId"],[data-team-live-pick]'))input.disabled=!supported;
    const input=form.querySelector('[data-write-field="gameTeamId"]');if(input)input.value='';
    const label=form.querySelector('[data-team-link-label]');if(label)label.textContent='ID команды '+(event.target.value==='Royal Kingdom'?'РК':'РМ');
    editors.delete(form);
  });
  function clear(){document.querySelectorAll('.team-live-card').forEach(n=>n.remove());document.querySelectorAll('[data-team-live-mounted]').forEach(n=>{delete n.dataset.teamLiveMounted;n.classList.remove('team-live-original','team-live-photo-shown','team-live-unavailable');});}
  for(const name of ['royal:access-denied','royal:fatal'])window.addEventListener(name,()=>{forgetSaved();permitted=false;clear();});
  window.addEventListener('royal:auth-ready',()=>{saved.clear();clear();lastSession=token();permitted=true;decorate();});
  window.RoyalAdminDataV0600?.subscribe?.(event=>{if(event.type==='clear'&&['unauthorized','forbidden','session-changed'].includes(event.reason)){forgetSaved();permitted=false;clear();}});
  new MutationObserver(decorate).observe(document.body,{childList:true,subtree:true});decorate();
  window.RoyalTeamLive={version:'1.2.1',card,decorate};
})();
