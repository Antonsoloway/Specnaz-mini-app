/* Admin-only Royal Match module. Agent credentials stay in the Worker. */
(() => {
  const endpoint='https://royal-crm-miniapp-api.tropical-spoon.workers.dev/admin-agent';
  let epoch=0,opened=false,busy=false,query='',candidates=[],offset=0,team=null,watches=[],records=[],nextBefore=null,notice='',analysis=null;
  const details=new Map(),timelines=new Map(),size=4;let pollTimer=null;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const value=v=>v==null?'—':typeof v==='object'?JSON.stringify(v):String(v);
  const when=v=>v?new Date(v).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'}):'—';
  const role=(t,id)=>t.Leader===id?'Лидер':t.CoLeaders?.includes(id)?'Помощник':'Участник';
  const admin=()=>typeof authState!=='undefined'&&!!(authState?.role?.isChatAdmin||authState?.role?.code==='admin'||authState?.permissions?.canManageAll);
  const session=()=>typeof sessionToken==='undefined'?'':sessionToken;
  function reset(){clearTimeout(pollTimer);timelines.clear();epoch++;opened=false;busy=false;candidates=[];details.clear();team=null;records=[];watches=[];nextBefore=null;notice='';analysis=null;}
  function decorate(){const grid=document.querySelector('.grid');if(!grid)return;let b=grid.querySelector('[data-sosiska-open]');if(!admin()){b?.remove();return;}if(b)return;b=document.createElement('button');b.type='button';b.className='tile';b.dataset.sosiskaOpen='1';b.innerHTML='<span>🌭</span><b>Агент «Сосиска»</b><small>Команды Royal Match и прогресс</small>';grid.appendChild(b);}
  async function api(operation,params={},e=epoch){
    const token=session();if(!token||!admin())throw new Error('Откройте приложение заново.');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),125000);
    try{const r=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({operation,...params}),signal:controller.signal});const data=await r.json();
      if(e!==epoch||session()!==token||!opened)throw Object.assign(new Error('STALE'),{stale:true});
      if(!r.ok||data.ok!==true){if(r.status===401||r.status===403){details.clear();candidates=[];team=null;records=[];watches=[];analysis=null;timelines.clear();clearTimeout(pollTimer);}throw new Error(data.message||'Не удалось получить данные агента.');}return data.data;
    }catch(error){if(e!==epoch||session()!==token||!opened)throw Object.assign(new Error('STALE'),{stale:true});throw error;}finally{clearTimeout(timer);}
  }
  const button=(action,label,attrs='')=>`<button type="button" data-sosiska-action="${action}" ${attrs} ${busy?'disabled':''}>${label}</button>`;
  const fields=data=>`<dl>${Object.entries(data??{}).map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(value(v))}</dd>`).join('')}</dl>`;
  function results(){if(!candidates.length)return '';return `<h3>Результаты: ${candidates.length}</h3>${candidates.slice(offset,offset+size).map(c=>{const t=details.get(c.teamId),leader=t?.Members?.find(m=>m.UserId===t.Leader)?.Name;return `<article><h4>${esc(c.name)}</h4><p>${esc(t?.Description??'Описание пока не загружено.')}</p><p>Лидер: ${esc(leader??'—')} · участников: ${esc(t?.Members?.length??c.memberCount??'—')}</p><p class="muted">ID ${esc(c.teamId)}</p>${button('team','Команда и состав',`data-team-id="${esc(c.teamId)}"`)}</article>`;}).join('')}${offset>0?button('prev','← Предыдущие'):''}${offset+size<candidates.length?button('next','Следующие →'):''}`;}
  function history(){
    if(!records.length)return '';
    const labels={Level:'Уровень',Crown:'Короны',HelpCount:'Помощь',Role:'Роль',Name:'Ник'};
    return `<h3>История и изменения</h3>${records.map(r=>`<article><h4>Снимок №${esc(r.sequence)} · ${esc(when(r.snapshot.capturedAt))} МСК</h4>${r.changes.baseline?'<p>Первый снимок — начало сравнения.</p>':`<p>Сравнение с ${esc(when(r.changes.from))} МСК</p><p>Вступили: ${esc(r.changes.joined.map(m=>m.Name).join(', ')||'—')}<br>Вышли: ${esc(r.changes.left.map(m=>m.Name).join(', ')||'—')}</p><div class="sosiska-table"><table><thead><tr><th>Игрок</th><th>Поле</th><th>Было</th><th>Стало</th><th>Изменение</th></tr></thead><tbody>${r.changes.members.flatMap(m=>m.changes.map(c=>`<tr><td>${esc(m.name)}</td><td>${esc(labels[c.field]??c.field)}</td><td>${esc(value(c.before))}</td><td>${esc(value(c.after))}</td><td>${esc(c.delta===undefined?'—':c.delta>0?'+'+c.delta:c.delta)}</td></tr>`)).join('')}</tbody></table></div>${!r.changes.members.length?'<p>Изменений данных оставшихся игроков нет.</p>':''}<details><summary>Изменения команды и итогов</summary>${fields({team:r.changes.team,derived:r.changes.derived})}</details>`}<details><summary>Все данные сохранённого снимка</summary>${fields(r.snapshot.raw)}</details></article>`).join('')}${nextBefore?button('older','Более ранние снимки'):''}`;
  }
  function roster(){
    const w=watches.find(w=>w.teamId===team.TeamId),members=team.Members??[],extras={...team};delete extras.Members;
    const score=members.every(m=>Number.isSafeInteger(m.Level)&&Number.isSafeInteger(m.Crown))?members.reduce((n,m)=>n+m.Level+m.Crown,0):null;
    return `${button('results','← К результатам')}<article><h3>${esc(team.TeamName)}</h3><p>${esc(team.Description)}</p><p>Участников: ${members.length} · вход: уровень ${esc(team.MinLevel)}, короны ${esc(team.MinCrown)}</p><p>${team.Type?'Открытая':'Закрытая'} команда · сумма уровней и корон: ${esc(value(score))}</p><p>Серверное поле Score: ${esc(value(team.Score))}</p><details><summary>Все поля команды и ID эмблемы</summary>${fields(extras)}</details><h4>Состав</h4><div class="sosiska-table"><table><thead><tr><th>Игрок</th><th>Роль</th><th>Уровень</th><th>Короны</th><th>Помощь</th></tr></thead><tbody>${members.map(m=>`<tr><td><details><summary>${esc(m.Name)}</summary>${fields(m)}</details></td><td>${esc(role(team,m.UserId))}</td><td>${esc(value(m.Level))}</td><td>${esc(value(m.Crown))}</td><td>${esc(value(m.HelpCount))}</td></tr>`).join('')}</tbody></table></div><h4>Снимки и отслеживание</h4>${button('capture','Сохранить снимок сейчас')}${button('history','История снимков')}${button('analysis','ИИ-анализ всей истории команды')}<label>Интервал, минуты<input data-sosiska-interval type="number" min="60" max="10080" step="1" value="${esc(w?.intervalMinutes??60)}" ${busy?'disabled':''}></label>${button('watch',w?'Изменить интервал':'Включить отслеживание')}${w?button('unwatch','Остановить отслеживание'):''}<p class="muted">Остановка отслеживания сохраняет историю снимков.</p></article>${history()}`;
  }
  function render(){if(!opened)return;const panel=document.getElementById('panel');if(!panel)return;panel.hidden=false;panel.innerHTML=`<section class="sosiska-screen" aria-busy="${busy}">${button('back','← На главную')}<h2>🌭 Агент «Сосиска»</h2><p class="muted">Royal Match · доступ администраторам</p><form data-sosiska-search><label>Название команды<input name="query" maxlength="160" value="${esc(query)}" placeholder="Например, Mamonovo" required ${busy?'disabled':''}></label><button ${busy?'disabled':''}>Найти</button></form><p role="status" aria-live="polite">${esc(busy?'Получаем данные…':notice)}</p>${team?roster():results()}<div id="sosiskaAnalysis">${analysisView()}</div><h3>Отслеживаемые команды</h3>${button('analysis-all','Анализ всей истории всех отслеживаемых команд')}${button('analysis-status','Обновить состояние анализа')}${button('list','Обновить список')}${watches.length?watches.map(w=>`<article><b>${esc(details.get(w.teamId)?.TeamName||w.teamId)}</b><p>Каждые ${esc(w.intervalMinutes)} мин. · последний снимок: ${esc(when(w.lastSuccessAt))}</p>${w.lastError?`<p>Последняя попытка не удалась: ${esc(w.lastError)}</p>`:''}${button('team','Открыть',`data-team-id="${esc(w.teamId)}"`)}</article>`).join(''):'<p>Отслеживание не включено.</p>'}</section>`;}

  function analysisView(){
    if(!analysis?.available)return '';
    const a=analysis;
    if(a.state==='running')return `<article><h3>Анализ всей истории выполняется</h3><p>Команд: ${a.teams.length} · обработано снимков: ${esc(a.processedSnapshots)}</p><p>Задача продолжится после закрытия приложения.</p>${a.error?'<p>Временная ошибка. Сервер повторит попытку.</p>':''}</article>`;
    if(a.state==='failed')return `<article><h3>Анализ не завершён</h3><p>Обработано снимков: ${esc(a.processedSnapshots)}. ${esc(a.error)}</p><p>Можно повторить запуск; история сохранена.</p></article>`;
    return `<article><h3>Общий анализ отслеживаемых команд</h3><p>Команд: ${a.teams.length} · снимков: ${esc(a.processedSnapshots)}</p><div class="sosiska-analysis">${esc(a.summary?.text)}</div></article>${a.teams.map(t=>`<article><h3>${esc(t.teamName||t.teamId)}</h3><p>Вся история: ${esc(t.count)} снимков · ${esc(when(t.from))} — ${esc(when(t.to))} МСК</p><div class="sosiska-analysis">${esc(t.text)}</div>${button('timeline','Динамика по снимкам',`data-team-id="${esc(t.teamId)}"`)}${timelineView(t.teamId)}</article>`).join('')}`;
  }
  function timelineView(id){
    const data=timelines.get(id);if(!data)return '';
    return `<div class="sosiska-table"><table><thead><tr><th>Снимок / МСК</th><th>Игроки</th><th>Уровни</th><th>Короны</th><th>Помощь</th></tr></thead><tbody>${data.points.map(p=>`<tr><td>№${esc(p.sequence)}<br>${esc(when(p.capturedAt))}</td><td>${esc(p.memberCount)}</td><td>${esc(value(p.levelTotal))}</td><td>${esc(value(p.crownTotal))}</td><td>${esc(value(p.helpTotal))}</td></tr>`).join('')}</tbody></table></div>${data.points.map(p=>`<details><summary>№${esc(p.sequence)}: игроки и изменения</summary>${playerDynamics(p)}</details>`).join('')}${data.nextBefore?button('timeline-older','Более ранняя динамика',`data-team-id="${esc(id)}"`):''}<p class="muted">Падение корон или помощи может быть сбросом счётчика. Данные разных составов нельзя считать прогрессом одних и тех же игроков.</p>`;
  }

  function playerDynamics(point){
    const delta=(id,field)=>{const c=point.changes.members?.find(m=>m.userId===id)?.changes.find(c=>c.field===field);return c?.delta===undefined?'—':c.delta>0?'+'+c.delta:String(c.delta);};
    return `<div class="sosiska-table"><table><thead><tr><th>Игрок</th><th>Уровень / Δ</th><th>Короны / Δ</th><th>Помощь / Δ</th></tr></thead><tbody>${point.members.map(m=>`<tr><td>${esc(m.name)}</td><td>${esc(value(m.level))} / ${esc(delta(m.userId,'Level'))}</td><td>${esc(value(m.crown))} / ${esc(delta(m.userId,'Crown'))}</td><td>${esc(value(m.help))} / ${esc(delta(m.userId,'HelpCount'))}</td></tr>`).join('')}</tbody></table></div><p>Вступили: ${esc(point.changes.joined?.map(m=>m.Name).join(', ')||'—')}<br>Вышли: ${esc(point.changes.left?.map(m=>m.Name).join(', ')||'—')}</p><details><summary>Остальные изменения</summary>${fields(point.changes)}</details>`;
  }
  function schedulePoll(){
    clearTimeout(pollTimer);if(!opened||analysis?.state!=='running')return;
    const e=epoch;pollTimer=setTimeout(async()=>{
      if(e!==epoch||!opened)return;if(busy){schedulePoll();return;}
      try{const current=await api('analysisStatus',{jobId:analysis.jobId},e);analysis=current;const node=document.getElementById('sosiskaAnalysis');if(node)node.innerHTML=analysisView();}catch(error){if(error.stale)return;if(!analysis){notice=error.message;render();}}
      schedulePoll();
    },5000);
  }
  async function hydrate(e){for(const c of candidates.slice(offset,offset+size)){if(e!==epoch||!opened)return;if(!details.has(c.teamId)){try{details.set(c.teamId,await api('team',{teamId:c.teamId},e));}catch(error){if(error.stale)throw error;notice='Часть описаний не загрузилась. Откройте карточку, чтобы повторить.';}}}}
  async function loadHistory(e,append=false){const d=await api('history',{teamId:team.TeamId,limit:5,...(append?{before:nextBefore}:{})},e);records=append?[...records,...d.records]:d.records;nextBefore=d.nextBefore;}
  async function run(task){if(busy||!opened||!admin())return;const e=epoch;busy=true;notice='';render();try{await task(e);}catch(error){if(!error.stale)notice=error.name==='AbortError'?'Сервер не ответил вовремя. Повторите попытку.':error.message;}finally{if(e===epoch&&opened){busy=false;render();}}}
  async function open(){reset();if(!admin())return;opened=true;try{window.RoyalNav?.pushCurrent?.();setActiveNav('sosiska');activePage='sosiska';}catch{}render();await run(async e=>{watches=(await api('list',{},e)).watches;notice='Введите название команды для поиска.';try{analysis=await api('analysisStatus',{},e);schedulePoll();}catch(error){if(error.stale)throw error;}});}
  document.addEventListener('submit',event=>{if(!event.target.matches('[data-sosiska-search]'))return;event.preventDefault();event.stopImmediatePropagation();query=String(new FormData(event.target).get('query')||'').trim();event.target.querySelector('input')?.blur();run(async e=>{team=null;records=[];candidates=[];const d=await api('search',{query},e);candidates=d.candidates;offset=0;notice=d.warnings.join(' ')||(!candidates.length?'Команды не найдены.':'');await hydrate(e);});},true);
  window.addEventListener('click',event=>{
    const entry=event.target.closest?.('[data-sosiska-open]');if(entry){event.preventDefault();event.stopImmediatePropagation();open();return;}
    const target=event.target.closest?.('[data-sosiska-action]');if(!target)return;event.preventDefault();event.stopImmediatePropagation();const action=target.dataset.sosiskaAction;
    if(action==='back'){reset();renderPage('home');return;}if(busy)return;
    const interval=Number(document.querySelector('[data-sosiska-interval]')?.value);
    run(async e=>{
      if(action==='results'){team=null;records=[];return;}
      if(action==='next'||action==='prev'){offset+=action==='next'?size:-size;await hydrate(e);return;}
      if(action==='team'){const id=target.dataset.teamId;team=await api('team',{teamId:id},e);details.set(id,team);records=[];nextBefore=null;return;}
      if(action==='list'){watches=(await api('list',{},e)).watches;return;}
      if(action==='analysis-all'||action==='analysis-status'){analysis=await api(action==='analysis-all'?'analysis':'analysisStatus',{},e);timelines.clear();if(!analysis.available)notice=analysis.reason;schedulePoll();return;}
      if(action==='timeline'||action==='timeline-older'){const id=target.dataset.teamId,old=timelines.get(id);const data=await api('analysisTimeline',{jobId:analysis.jobId,teamId:id,limit:10,...(action==='timeline-older'?{before:old.nextBefore}:{})},e);timelines.set(id,{...data,points:action==='timeline-older'?[...old.points,...data.points]:data.points});return;}if(!team)return;
      if(action==='analysis'){const data=await api('analysis',{teamId:team.TeamId},e);analysis=data;timelines.clear();if(!data.available)notice=data.reason;schedulePoll();return;}
      if(action==='capture'){await api('capture',{teamId:team.TeamId},e);await loadHistory(e);notice='Снимок сохранён.';return;}
      if(action==='history'||action==='older'){await loadHistory(e,action==='older');if(!records.length)notice='Снимков пока нет. Можно сохранить первый снимок.';return;}
      if(action==='watch'){if(!Number.isInteger(interval)||interval<60||interval>10080)throw new Error('Интервал должен быть целым числом от 60 до 10080 минут.');await api('watch',{teamId:team.TeamId,intervalMinutes:interval},e);notice='Отслеживание включено.';}
      if(action==='unwatch'){await api('unwatch',{teamId:team.TeamId},e);notice='Отслеживание остановлено. История сохранена.';}watches=(await api('list',{},e)).watches;
    });
  },true);
  if(typeof renderPage==='function'){const original=renderPage;renderPage=function(page){reset();const result=original(page);decorate();return result;};}
  window.addEventListener('royal:auth-ready',()=>{reset();decorate();});
  for(const name of ['royal:access-denied','royal:fatal'])window.addEventListener(name,()=>{reset();decorate();});
  window.RoyalAdminDataV0600?.subscribe?.(event=>{if(event.type==='clear'&&['unauthorized','forbidden','session-changed'].includes(event.reason)){const visible=opened;reset();if(visible){const panel=document.getElementById('panel');if(panel)panel.textContent='Админская сессия завершена. Откройте приложение заново.';}}});
  decorate();window.RoyalSosiska={version:'0.2.0',open};
})();
