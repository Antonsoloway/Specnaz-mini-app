/* Read-only RM card. The existing CRM membership list stays below this block. */
(() => {
  const API=typeof API_URL==='undefined'?'https://royal-crm-miniapp-api.tropical-spoon.workers.dev':API_URL;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=v=>v==null?'—':Number(v).toLocaleString('ru-RU');
  const token=()=>typeof sessionToken==='undefined'?'':sessionToken;
  const states=new WeakMap();
  function card(data) {
    return '<header class="team-live-banner"><h3>О команде</h3></header><div class="team-live-summary"><div class="team-live-title"><span class="team-live-emblem" aria-hidden="true">🛡️</span><div><h3>'+esc(data.name)+'</h3><p>'+esc(data.description)+'</p></div><div class="team-live-places"><small>Места</small><b>'+num(data.memberCount)+'/'+num(data.capacity)+'</b></div></div><div class="team-live-facts"><div><span>Очки команды</span><b>'+num(data.score)+'</b></div><div><span>Уровень входа</span><b>'+num(data.minLevel)+'</b></div><div><span>Короны входа</span><b>'+num(data.minCrowns)+'</b></div><div><span>Тип команды</span><b>'+esc(data.type||'—')+'</b></div></div></div><div class="team-live-leadership">'+data.leadership.slice(0,4).map(m=>'<article class="team-live-player"><span class="team-live-player-icon" aria-hidden="true">'+(m.role==='Лидер'?'👑':'⭐')+'</span><div class="team-live-player-name"><b>'+esc(m.name)+'</b><small>'+esc(m.role)+'</small></div><div class="team-live-crowns"><small>👑</small><b>'+num(m.crowns)+'</b></div><div><small>Помощь</small><b>'+num(m.help)+'</b></div><div><small>Уровень</small><b>'+num(m.level)+'</b></div></article>').join('')+'</div>';
  }
  async function load(host,refresh=false) {
    const state=states.get(host);if(!state||state.loading)return;
    const session=token();if(!session)return;
    state.loading=true;const button=host.querySelector('[data-team-live-refresh]');if(button)button.disabled=true;
    const status=host.querySelector('[data-team-live-status]');status.textContent='Обновляем данные игры…';
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),35000);
    try {
      const params=new URLSearchParams({team:state.name,game:'Royal Match',...(refresh?{refresh:'1'}:{})});
      const r=await fetch(API+(state.admin?'/admin-team-live?':'/team-live?')+params,{headers:{Authorization:'Bearer '+session},signal:controller.signal});
      const payload=await r.json();if(!host.isConnected||session!==token())return;
      if(r.status===401||r.status===403){host.querySelector('[data-team-live-content]').textContent='';throw Error('Откройте приложение заново.');}
      if(!r.ok||!payload.ok)throw Error(payload.message||'Данные игры не загрузились.');
      if(payload.data.teamId!==state.id||!Array.isArray(payload.data.leadership))throw Error('Привязка команды изменилась. Обновите карточку.');
      host.querySelector('[data-team-live-content]').innerHTML=card(payload.data);
      status.textContent=(payload.data.stale?'Сервер игры недоступен. Последние данные: ':'Обновлено: ')+new Date(payload.data.fetchedAt).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})+' МСК';
    }catch(error){if(host.isConnected&&session===token())status.textContent=error.name==='AbortError'?'Сервер не ответил вовремя. Повторите обновление.':error.message;}
    finally{clearTimeout(timer);state.loading=false;if(button)button.disabled=false;}
  }
  function decorate() {
    const panel=document.getElementById('panel'),photo=panel?.querySelector('.team-photo-box');
    if(!photo||photo.dataset.teamLiveMounted)return;
    const adminShell=panel.querySelector('[data-admin-team="1"]'),admin=!!adminShell;
    const name=adminShell?.dataset.adminTeamName||panel.querySelector('.team-detail-head h2')?.textContent;
    const game=adminShell?.dataset.adminTeamFullGame||panel.querySelector('.team-detail-head .muted')?.textContent;
    if(game!=='Royal Match')return;
    const teams=admin?window.RoyalAdminDataV0600?.current?.adminData?.teams:(typeof snapshotState==='undefined'?[]:snapshotState?.teams);
    const record=teams?.find(t=>t.name===name&&t.game==='Royal Match');if(!record?.gameTeamId)return;
    photo.dataset.teamLiveMounted='1';photo.classList.add('team-live-original');
    const host=document.createElement('section');host.className='team-live-card';
    host.innerHTML='<div data-team-live-content><p>Получаем сведения о команде…</p></div><footer><p data-team-live-status role="status"></p><button type="button" data-team-live-refresh>Обновить</button><button type="button" data-team-live-photo>Показать сохранённый скриншот</button></footer>';
    photo.before(host);states.set(host,{name,admin,id:record.gameTeamId,photo,loading:false});load(host);
  }
  window.addEventListener('click',event=>{
    const pick=event.target.closest?.('[data-team-live-pick]');
    if(pick){event.preventDefault();event.stopImmediatePropagation();const form=pick.closest('form');if(form?.querySelector('[data-write-field="game"]')?.value!=='Royal Match')return;
      window.RoyalSosiska?.pickTeam(data=>{if(!form.isConnected)return;form.querySelector('[data-write-field="gameTeamId"]').value=data.TeamId;form.querySelector('[data-write-field="name"]').value=data.TeamName||'';});return;}
    const control=event.target.closest?.('[data-team-live-refresh],[data-team-live-photo]');if(!control)return;
    event.preventDefault();event.stopImmediatePropagation();const host=control.closest('.team-live-card'),state=states.get(host);if(!state)return;
    if(control.matches('[data-team-live-refresh]'))load(host,true);
    else {const shown=state.photo.classList.toggle('team-live-photo-shown');control.textContent=shown?'Скрыть скриншот':'Показать сохранённый скриншот';}
  },true);
  document.addEventListener('change',event=>{
    if(!event.target.matches?.('[data-write-team-form] [data-write-field="game"]'))return;
    const form=event.target.closest('form'),rm=event.target.value==='Royal Match';
    for(const input of form.querySelectorAll('[data-write-field="gameTeamId"],[data-team-live-pick]'))input.disabled=!rm;
    if(!rm){const input=form.querySelector('[data-write-field="gameTeamId"]');if(input)input.value='';}
  });
  for(const name of ['royal:access-denied','royal:fatal','royal:auth-ready'])window.addEventListener(name,()=>document.querySelectorAll('.team-live-card').forEach(n=>n.remove()));
  new MutationObserver(decorate).observe(document.body,{childList:true,subtree:true});decorate();
  window.RoyalTeamLive={version:'1.0.0',card,decorate};
})();
