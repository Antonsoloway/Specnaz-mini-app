/* Admin-only Royal Match module. Agent credentials stay in the Worker. */
(() => {
  const endpoint='https://royal-crm-miniapp-api.tropical-spoon.workers.dev/admin-agent';
  let epoch=0,opened=false,busy=false,query='',candidates=[],offset=0,team=null,watches=[],records=[],nextBefore=null,notice='',analysis=null;
  let analysisMode=null,analysisEpoch=0,profileId=null,profileLoading=false,profileError='';
  const profiles=new Map();
  const details=new Map(),timelines=new Map(),size=4;let pollTimer=null,filters={},filterLoading=false,stopFilterLoading=false,searchWarnings=[],period=null,periodLoading=false,stopPeriod=false,teamView='period',selected=new Map(),comparison=null,playerId=null,metric='levels';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const value=v=>v==null?'—':typeof v==='object'?'—':String(v);
  const when=v=>v?new Date(v).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'}):'—';
  const role=(t,id)=>t.Leader===id?'Лидер':t.CoLeaders?.includes(id)?'Помощник':'Участник';
  const admin=()=>typeof authState!=='undefined'&&!!(authState?.role?.isChatAdmin||authState?.role?.code==='admin'||authState?.permissions?.canManageAll);
  const session=()=>typeof sessionToken==='undefined'?'':sessionToken;
  function reset(){profiles.clear();profileId=null;profileLoading=false;profileError='';chartModels.clear();chartRanges.clear();analysisMode=null;analysisEpoch++;selected.clear();comparison=null;playerId=null;clearTimeout(pollTimer);timelines.clear();epoch++;opened=false;busy=false;candidates=[];details.clear();team=null;records=[];watches=[];nextBefore=null;notice='';analysis=null;filters={};filterLoading=false;stopFilterLoading=true;searchWarnings=[];period=null;periodLoading=false;stopPeriod=true;}
  function decorate(){const grid=document.querySelector('.grid');if(!grid)return;let b=grid.querySelector('[data-sosiska-open]');if(!admin()){b?.remove();return;}if(b)return;b=document.createElement('button');b.type='button';b.className='tile';b.dataset.sosiskaOpen='1';b.innerHTML='<span>🌭</span><b>Агент «Сосиска»</b><small>Команды Royal Match и прогресс</small>';grid.appendChild(b);}
  async function api(operation,params={},e=epoch){
    const token=session();if(!token||!admin())throw new Error('Откройте приложение заново.');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),125000);
    try{const r=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({operation,...params}),signal:controller.signal});const data=await r.json();
      if(e!==epoch||session()!==token||!opened)throw Object.assign(new Error('STALE'),{stale:true});
      if(!r.ok||data.ok!==true){if(r.status===401||r.status===403){details.clear();candidates=[];team=null;records=[];watches=[];analysis=null;timelines.clear();selected.clear();comparison=null;period=null;playerId=null;clearTimeout(pollTimer);}throw Object.assign(new Error(data.message||'Не удалось получить данные агента.'),{denied:r.status===401||r.status===403,limited:r.status===429});}return data.data;
    }catch(error){if(e!==epoch||session()!==token||!opened)throw Object.assign(new Error('STALE'),{stale:true});throw error;}finally{clearTimeout(timer);}
  }
  const button=(action,label,attrs='')=>`<button type="button" data-sosiska-action="${action}" ${attrs} ${busy?'disabled':''}>${label}</button>`;
  const labels={Level:'Уровень',Crown:'Короны',HelpCount:'Помощь',Name:'Ник',MinLevel:'Уровень входа',MinCrown:'Короны входа',Description:'Описание',TeamName:'Команда',Role:'Роль'};
  const fields=data=>'<dl>'+Object.entries(data??{}).filter(([k,v])=>labels[k]&&v!==null&&typeof v!=='object').map(([k,v])=>'<dt>'+esc(labels[k])+'</dt><dd>'+esc(value(v))+'</dd>').join('')+'</dl>';
  const sorted=members=>[...(members??[])].sort((a,b)=>(Number(b.Level??0)+Number(b.Crown??0))-(Number(a.Level??0)+Number(a.Crown??0))||Number(b.Level??0)-Number(a.Level??0)||String(a.UserId).localeCompare(String(b.UserId)));
  const rate=v=>v==null?'—':Number(v).toLocaleString('ru-RU',{maximumFractionDigits:2});
  const changeActivity=(m,field)=>Math.max(0,m.changes.find(c=>c.field===field)?.delta??0);
  const analysisError=code=>({ANALYSIS_BUSY:'Сейчас завершается предыдущий анализ. Его задача продолжится в фоне; повторите запуск после завершения.',ANALYSIS_KEYS_REJECTED:'Провайдер отклонил подключённые ключи. Требуется проверка ключей на сервере.',ANALYSIS_INPUT_TOO_LARGE:'Провайдер отклонил слишком большой запрос. Повторите запуск после обновления.',ANALYSIS_REQUEST_REJECTED:'Провайдер отклонил параметры запроса. Требуется проверка ответа на сервере.',ANALYSIS_PROVIDER_UNAVAILABLE:'Провайдер ИИ временно недоступен или исчерпан лимит запросов.',ANALYSIS_INCOMPLETE:'ИИ не закончил ответ. Запуск можно повторить.',ANALYSIS_HISTORY_INCOMPLETE:'В истории обнаружен пропуск. Анализ остановлен.',ANALYSIS_NOT_CONFIGURED:'Ключи ИИ не подключены.'}[code]||'Не удалось завершить анализ. История сохранена.');
  const colors=['#38bdf8','#fb923c','#a78bfa','#4ade80','#f472b6'];
  const unit=()=>({levels:'уровней/ч',crowns:'корон/ч',help:'помощи/ч'}[metric]);
  function metricButtons(){return ['levels','crowns','help'].map(k=>button('metric',(metric===k?'✓ ':'')+({levels:'Уровни',crowns:'Короны',help:'Помощь'}[k]),'data-metric="'+k+'"')).join('');}
  const metricColor=()=>({levels:'#38bdf8',crowns:'#fbbf24',help:'#34d399'}[metric]);
  const clock=v=>new Date(v).toLocaleTimeString('ru-RU',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit'});
  const day=v=>new Date(v).toLocaleDateString('ru-RU',{timeZone:'Europe/Moscow',day:'2-digit',month:'2-digit'});
  let chartNumber=0;
  const chartModels=new Map(),chartRanges=new Map();
  function chart(lines,title){
    const valid=p=>p.hours>0&&Number.isFinite(p[metric]);
    const all=lines.flatMap(l=>l.points).filter(valid);if(!all.length)return '<p>Нет наблюдаемых интервалов для графика.</p>';
    const min=all.reduce((n,p)=>Math.min(n,Date.parse(p.from)),Infinity),maxTime=all.reduce((n,p)=>Math.max(n,Date.parse(p.to)),-Infinity),peak=all.reduce((n,p)=>Math.max(n,p[metric]/p.hours),0),number=++chartNumber;
    const key=JSON.stringify([analysisMode,team?.TeamId,playerId,[...selected.keys()].sort(),title,metric,min,maxTime]);
    const view=chartRanges.get(key)||{min,max:maxTime,start:min,end:maxTime,minSpan:Math.max(1,all.reduce((n,p)=>Math.min(n,Date.parse(p.to)-Date.parse(p.from)),Infinity))};
    chartRanges.set(key,view);if(chartRanges.size>100)chartRanges.delete(chartRanges.keys().next().value);
    const chartMetric=metric,chartUnit=unit(),singleColor=metricColor();
    function svg(){
    const start=view.start,end=view.end;
    const visible=all.filter(p=>Date.parse(p.to)>start&&Date.parse(p.from)<end),visiblePeak=visible.reduce((v,p)=>Math.max(v,p[chartMetric]/p.hours),0);
    const scale=visiblePeak>0?10**Math.floor(Math.log10(visiblePeak)):1,max=Math.max(1,Math.ceil(visiblePeak/scale)*scale);
    const x=t=>48+296*((typeof t==='number'?t:Date.parse(t))-start)/Math.max(1,end-start),y=v=>230-194*v/max;
    const grid=Array.from({length:5},(_,i)=>{const v=max*i/4;return '<path d="M48 '+y(v)+'H344" stroke="#365064" stroke-dasharray="3 5"/><text x="40" y="'+(y(v)+5)+'" text-anchor="end" fill="#cbd5e1" font-size="15">'+esc(rate(v))+'</text>';}).join('');
    const axes=[0,.5,1].map(f=>{const t=new Date(start+(end-start)*f).toISOString(),px=48+296*f;return '<text x="'+px+'" y="257" text-anchor="'+(f===0?'start':f===1?'end':'middle')+'" fill="#f1f5f9" font-size="16">'+esc(clock(t))+'</text><text x="'+px+'" y="278" text-anchor="'+(f===0?'start':f===1?'end':'middle')+'" fill="#94a3b8" font-size="13">'+esc(day(t))+'</text>';}).join('');
    const paths=lines.map((l,i)=>{
      const color=lines.length===1?singleColor:colors[i%colors.length],points=l.points.filter(valid).filter(p=>Date.parse(p.to)>start&&Date.parse(p.from)<end),groups=[];let group=[];
      for(const p of points){if(group.length&&group.at(-1).to!==p.from){groups.push(group);group=[];}group.push(p);}if(group.length)groups.push(group);
      if(!points.length)return '';
      const gradient='sosiska-fill-'+number+'-'+i;
      return '<defs><linearGradient id="'+gradient+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="'+color+'" stop-opacity=".35"/><stop offset="100%" stop-color="'+color+'" stop-opacity=".02"/></linearGradient></defs>'+groups.map(g=>{
       let path='M'+x(Math.max(start,Date.parse(g[0].from))).toFixed(2)+' '+y(g[0][chartMetric]/g[0].hours).toFixed(2);
       for(let j=0;j<g.length;j++){const p=g[j];if(j)path+='V'+y(p[chartMetric]/p.hours).toFixed(2);path+='H'+x(Math.min(end,Date.parse(p.to))).toFixed(2);}
       const area=path+'V230H'+x(Math.max(start,Date.parse(g[0].from))).toFixed(2)+'Z';
       return '<path d="'+area+'" fill="url(#'+gradient+')"/><path d="'+path+'" stroke="'+color+'" stroke-width="3.5" stroke-linejoin="round" fill="none"><title>'+esc(l.name)+'</title></path>';
      }).join('')+'<circle cx="'+x(Math.min(end,Date.parse(points.at(-1).to))).toFixed(2)+'" cy="'+y(points.at(-1)[chartMetric]/points.at(-1).hours).toFixed(2)+'" r="4" fill="'+color+'"/>';
    }).join('');
    return '<svg viewBox="0 0 360 295" role="img" aria-label="'+esc(title+' '+chartUnit)+'">'+grid+paths+axes+'</svg>';
    }
    chartModels.set(String(number),{view,svg});
    const one=lines.length===1,latest=all.at(-1),hours=all.reduce((n,p)=>n+p.hours,0),average=all.reduce((n,p)=>n+p[metric],0)/hours;
    return '<figure class="sosiska-chart" data-chart-id="'+number+'"><figcaption>'+esc(title)+'<small>'+esc(unit())+' · время МСК</small></figcaption>'+(one?'<div class="sosiska-chart-stats"><div><small>Последний интервал</small><b>'+rate(latest[metric]/latest.hours)+'</b></div><div><small>В среднем</small><b>'+rate(average)+'</b></div><div><small>Пик</small><b>'+rate(peak)+'</b></div></div>':'')+'<div class="sosiska-chart-controls">'+[['in','+','Увеличить'],['out','−','Уменьшить'],['left','←','Ранее'],['right','→','Позже'],['reset','Вся история','Показать всю историю']].map(([action,label,hint])=>'<button type="button" data-chart-action="'+action+'" aria-label="'+hint+'" title="'+hint+'">'+label+'</button>').join('')+'</div><div class="sosiska-chart-viewport" data-chart-viewport tabindex="0" role="group" aria-label="Масштаб и перемещение графика: плюс, минус, стрелки, Home">'+svg()+'</div><p class="sosiska-chart-range" data-chart-range>'+chartRangeLabel(view)+'</p><label class="sosiska-chart-scroll">Положение во всей истории<input type="range" data-chart-scroll min="0" max="1000" value="'+(view.max-view.min>view.end-view.start?Math.round(1000*(view.start-view.min)/(view.max-view.min-view.end+view.start)):0)+'" '+(view.end-view.start>=view.max-view.min?'disabled':'')+'></label><p class="sosiska-chart-hint">Два пальца — масштаб · один — перемещение. Кнопки + / − и стрелки делают то же.</p><div class="sosiska-chart-key">'+lines.map((l,i)=>'<span class="sosiska-legend" style="color:'+(one?metricColor():colors[i%colors.length])+'">● '+esc(l.name)+'</span>').join('')+'</div><details class="sosiska-chart-values"><summary>Значения по интервалам</summary>'+lines.map(l=>'<h4>'+esc(l.name)+'</h4><div class="sosiska-interval-values">'+l.points.filter(valid).map(p=>'<div><span>'+esc(day(p.from)+' '+clock(p.from)+' — '+day(p.to)+' '+clock(p.to))+'</span><b>'+rate(p[chartMetric]/p.hours)+' '+esc(unit())+'</b></div>').join('')+'</div>').join('')+'</details></figure>';
  }
  function chartRangeLabel(v){return esc(when(new Date(v.start).toISOString())+' — '+when(new Date(v.end).toISOString()))+' МСК · ×'+rate((v.max-v.min)/(v.end-v.start));}
  function setChartWindow(v,start,span){
    span=Math.max(Math.min(v.minSpan,v.max-v.min),Math.min(v.max-v.min,span));
    v.start=Math.max(v.min,Math.min(v.max-span,start));v.end=v.start+span;
  }
  function zoomChart(v,factor,anchor=.5){
    anchor=Math.max(0,Math.min(1,anchor));const span=v.end-v.start,next=Math.max(Math.min(v.minSpan,v.max-v.min),Math.min(v.max-v.min,span/factor));
    setChartWindow(v,v.start+span*anchor-next*anchor,next);
  }
  function paintChart(figure,model){
    const {view}=model;figure.querySelector('[data-chart-viewport]').innerHTML=model.svg();
    figure.querySelector('[data-chart-range]').innerHTML=chartRangeLabel(view);
    const slider=figure.querySelector('[data-chart-scroll]'),room=view.max-view.min-(view.end-view.start);
    slider.disabled=room<=0;slider.value=room>0?Math.round(1000*(view.start-view.min)/room):0;
  }
  function chartTarget(target){const figure=target.closest?.('[data-chart-id]'),model=chartModels.get(figure?.dataset.chartId);return model?{figure,model}:null;}
  function chartAction(figure,model,action){
    const v=model.view,span=v.end-v.start;
    if(action==='in'||action==='out')zoomChart(v,action==='in'?2:.5);
    if(action==='left'||action==='right')setChartWindow(v,v.start+span*(action==='left'?-.4:.4),span);
    if(action==='reset')setChartWindow(v,v.min,v.max-v.min);
    paintChart(figure,model);
  }
  window.addEventListener('click',event=>{
    const control=event.target.closest?.('[data-chart-action]'),target=control&&chartTarget(control);if(!target)return;
    event.preventDefault();event.stopImmediatePropagation();chartAction(target.figure,target.model,control.dataset.chartAction);
  },true);
  document.addEventListener('input',event=>{
    if(!event.target.matches?.('[data-chart-scroll]'))return;const target=chartTarget(event.target);if(!target)return;
    const v=target.model.view,span=v.end-v.start;setChartWindow(v,v.min+Number(event.target.value)/1000*(v.max-v.min-span),span);paintChart(target.figure,target.model);
  });
  document.addEventListener('keydown',event=>{
    if(!event.target.matches?.('[data-chart-viewport]'))return;
    const action={'+':'in','=':'in','-':'out',ArrowLeft:'left',ArrowRight:'right',Home:'reset'}[event.key],target=chartTarget(event.target);if(!action||!target)return;
    event.preventDefault();chartAction(target.figure,target.model,action);
  });
  let chartGesture=null;
  const gesturePoints=g=>[...g.pointers.values()];
  const gestureDistance=g=>{const p=gesturePoints(g);return Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y);};
  document.addEventListener('pointerdown',event=>{
    const viewport=event.target.closest?.('[data-chart-viewport]'),target=viewport&&chartTarget(viewport);if(!target||event.button>0)return;
    if(!chartGesture||chartGesture.viewport!==viewport)chartGesture={...target,viewport,pointers:new Map()};
    const g=chartGesture;g.pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});g.viewport.setPointerCapture?.(event.pointerId);event.preventDefault();
  });
  document.addEventListener('pointermove',event=>{
    const g=chartGesture;if(!g||!g.pointers.has(event.pointerId)||!g.viewport.isConnected)return;
    const prev=g.pointers.get(event.pointerId),before=g.pointers.size===2?gestureDistance(g):0,p=gesturePoints(g),oldMid=p.reduce((n,p)=>n+p.x,0)/p.length;
    g.pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});const rect=g.viewport.getBoundingClientRect(),width=rect.width*296/360,v=g.model.view;
    if(g.pointers.size===2&&before>0){const now=gesturePoints(g),mid=now.reduce((n,p)=>n+p.x,0)/now.length;zoomChart(v,gestureDistance(g)/before,(oldMid-rect.left-rect.width*48/360)/width);setChartWindow(v,v.start-(mid-oldMid)/width*(v.end-v.start),v.end-v.start);}
    else if(g.pointers.size===1)setChartWindow(v,v.start-(event.clientX-prev.x)/width*(v.end-v.start),v.end-v.start);
    event.preventDefault();paintChart(g.figure,g.model);
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture'])document.addEventListener(type,event=>{if(!chartGesture)return;chartGesture.pointers.delete(event.pointerId);if(!chartGesture.pointers.size)chartGesture=null;});
  document.addEventListener('wheel',event=>{
    const viewport=event.target.closest?.('[data-chart-viewport]'),target=viewport&&chartTarget(viewport);if(!target)return;
    // Ctrl+wheel or trackpad pinch zooms; ordinary wheel retains page scrolling.
    if(!event.ctrlKey)return;event.preventDefault();const rect=viewport.getBoundingClientRect();zoomChart(target.model.view,Math.exp(-event.deltaY*.01),(event.clientX-rect.left-rect.width*48/360)/(rect.width*296/360));paintChart(target.figure,target.model);
  },{passive:false});
  function hourlyChart(bins){
   const max=Math.max(1,...bins.map(h=>h.rate??0));
   return '<div class="sosiska-hour-grid">'+bins.map(h=>{
    const strength=h.rate===null?0:Math.min(1,h.rate/max),background=h.rate===null?'#23313e':strength>.75?'#168d78':strength>.4?'#2168a3':strength>0?'#284d70':'#24374b';
    return '<div class="sosiska-hour-cell" style="background:'+background+'"><b>'+String(h.hour).padStart(2,'0')+':00</b><span>'+(h.rate===null?'—':rate(h.rate))+'</span><small>'+(h.rate===null?'нет данных':esc(unit()))+'</small></div>';
   }).join('')+'</div><p class="sosiska-hour-key">Зелёный — самый высокий темп · синий — ниже · — нет наблюдений</p>';
  }
  function charts(points,name){return '<h3>Темп активности команды</h3>'+metricButtons()+chart([{name,points}], 'Активность во времени')+'<p class="muted">Прирост за интервал между снимками / длительность интервала. Сбросы счётчиков и вступление игроков не считаются прогрессом. График охватывает всю загруженную историю. Масштабируйте, чтобы рассмотреть отдельные интервалы.</p>';}
  function playerView(){
   const p=period?.players.find(p=>p.userId===playerId);if(!p)return '';
   const hoursKey={levels:'levelHours',crowns:'crownHours',help:'helpHours'}[metric];
   const bins=p.hourly.map(h=>({hour:h.hour,value:h[hoursKey]??h.hours,rate:(h[hoursKey]??h.hours)>0?h[metric]/(h[hoursKey]??h.hours):null})),peak=bins.filter(h=>h.rate!==null).sort((a,b)=>b.rate-a.rate)[0];
   return '<article class="sosiska-player-detail"><h3>'+esc(p.name)+' · активность</h3>'+button('player-close','Закрыть графики игрока')+metricButtons()+chart([{name:p.name,points:p.series}], 'Темп игрока')+'<h4>В какое время активнее · МСК</h4>'+hourlyChart(bins)+'<p>'+(!peak||peak.rate===0?'Положительный прирост не наблюдался.':'Наибольший наблюдаемый темп: '+peak.hour+':00–'+((peak.hour+1)%24)+':00 · '+rate(peak.rate)+' '+unit())+'</p><p class="muted">Это оценка по снимкам: прирост равномерно распределён по охваченному интервалу. Точное время игры неизвестно. При редких снимках профиль менее точный. Короны не переводятся в пройденные уровни.</p></article>';
  }
  function comparisonView(){
   if(analysisMode!=='selected'||!selected.size)return '';
   return '<article><h3>Сравнение выбранных команд · '+selected.size+'/5</h3><p>'+[...selected.values()].map(esc).join(', ')+'</p>'+button('compare','Построить сравнение')+button('analysis-selected','ИИ-анализ выбранных команд')+button('clear-selection','Сбросить выбор')+(comparison?'<p>Общий период: '+esc(when(comparison.from))+' — '+esc(when(comparison.to))+' МСК</p>'+metricButtons()+chart(comparison.teams.map(t=>({name:t.teamName,points:t.series})), 'Темп команд')+comparison.teams.map(t=>'<div class="sosiska-player"><b>'+esc(t.teamName)+'</b><p>Уровни: '+(t.hours?'+'+t.levels:'—')+' · '+rate(t.levelsPerHour)+'/ч<br>Короны: '+(t.hours?'+'+t.crowns:'—')+' · '+rate(t.crownsPerHour)+'/ч<br>Помощь: '+(t.hours?'+'+t.help:'—')+'</p><p>Охват: '+rate(t.hours)+' ч · '+esc(when(t.from))+' — '+esc(when(t.to))+'</p></div>').join('')+'<p class="muted">Сравниваются только целые интервалы внутри общего периода; суммы и темп показаны раздельно. Границы снимков могут различаться. Нет интервалов — нет оценки. Интервалы, пересекающие границу общего периода, исключены; фактический охват указан у каждой команды.</p>':'')+'</article>';
  }
  function periodView(){
    if(!period)return '';
    return '<article><h3>Весь период наблюдения</h3><p>'+esc(when(period.from))+' — '+esc(when(period.to))+' МСК · снимков: '+period.snapshotCount+'</p>'+
      (!period.complete?'<p>История загружена не полностью. Это промежуточные показатели; повторите загрузку.</p>':'')+
      (period.snapshotCount<2?'<p>Для расчёта скорости нужен хотя бы второй снимок.</p>':'')+
      '<p class="muted">Уровни/час — прирост обычного уровня за наблюдаемые интервалы. Короны/час — отдельный счётчик, не число пройденных раундов лиги. Отсутствие роста уровня в лиге не означает, что игрок не играет.</p>'+
      '<h3>Игроки · сначала активные</h3><p class="muted">Порядок по выбранному показателю графика: уровни, короны или помощь. Показатели не складываются.</p>'+charts(period.series,period.teamName)+[...period.players].sort((a,b)=>(b[{levels:'levelGain',crowns:'crownGain',help:'helpGain'}[metric]]??0)-(a[{levels:'levelGain',crowns:'crownGain',help:'helpGain'}[metric]]??0)||SosiskaPeriod.activityOrder(a,b)).map(m=>'<div class="sosiska-player"><h4>'+esc(m.name)+(m.current?'':' · вышел / исключён')+'</h4>'+
       button('player','Графики активности', 'data-player-id="'+esc(m.userId)+'"')+'<p>Уровни: +'+esc(m.levelGain)+' · '+rate(m.levelsPerHour)+' / час<br>Короны: +'+esc(m.crownGain)+' · '+rate(m.crownsPerHour)+' / час<br>Помощь: +'+esc(m.helpGain)+'</p>'+
       '<p class="muted">Наблюдался в составе: '+rate(m.observedHours)+' ч · вступлений: '+m.joined+' · выходов: '+m.left+(m.crownResets?' · сбросов корон: '+m.crownResets:'')+(m.levelResets?' · уменьшений уровня: '+m.levelResets:'')+'</p>'+(m.userId===playerId?playerView():'')+'</div>').join('')+'</article>';
  }


  const numericFilters=['scoreMin','membersMin','membersMax','entryLevelMin','entryLevelMax','entryCrownMin','entryCrownMax'];
  function parseFilters(data){
    const f={leader:String(data.get('leader')??'').trim(),type:String(data.get('type')??'')};
    if(f.leader.length>160||!['','open','closed'].includes(f.type))throw new Error('Проверьте ник лидера и тип команды.');
    for(const key of numericFilters){
      const text=String(data.get(key)??'').trim();if(!text)continue;
      if(!/^\d+$/.test(text)||!Number.isSafeInteger(Number(text)))throw new Error('Фильтры должны содержать целые неотрицательные числа.');
      f[key]=Number(text);
    }
    for(const [min,max] of [['membersMin','membersMax'],['entryLevelMin','entryLevelMax'],['entryCrownMin','entryCrownMax']]){
      if(f[min]!==undefined&&f[max]!==undefined&&f[min]>f[max])throw new Error('Значение «от» не должно превышать «до».');
    }
    if((f.membersMin??0)>50||(f.membersMax??0)>50)throw new Error('В команде может быть от 0 до 50 участников.');
    return f;
  }
  const hasFilters=f=>Boolean(f.leader||f.type||numericFilters.some(k=>f[k]!==undefined));
  function teamFilterFields(t){
    if(!t)return {};
    const members=Array.isArray(t.Members)?t.Members:null;let score=null;
    if(members?.every(m=>Number.isSafeInteger(m.Level)&&m.Level>=0&&Number.isSafeInteger(m.Crown)&&m.Crown>=0)){
      const sum=members.reduce((n,m)=>n+m.Level+m.Crown,0);if(Number.isSafeInteger(sum))score=sum;
    }
    return {score,leader:members?.find(m=>m.UserId===t.Leader)?.Name??null,members:members?.length??null,
      entryLevel:Number.isSafeInteger(t.MinLevel)&&t.MinLevel>=0?t.MinLevel:null,
      entryCrown:Number.isSafeInteger(t.MinCrown)&&t.MinCrown>=0?t.MinCrown:null,type:typeof t.Type==='boolean'?(t.Type?'open':'closed'):null};
  }
  function matchesFilters(t,f){
    const v=teamFilterFields(t);
    if(f.scoreMin!==undefined&&(v.score==null||v.score<f.scoreMin))return false;
    if(f.leader&&(!v.leader||!String(v.leader).normalize('NFKC').toLowerCase().includes(f.leader.normalize('NFKC').toLowerCase())))return false;
    if(f.type&&v.type!==f.type)return false;
    for(const key of ['members','entryLevel','entryCrown']){
      if(f[key+'Min']!==undefined&&(v[key]==null||v[key]<f[key+'Min']))return false;
      if(f[key+'Max']!==undefined&&(v[key]==null||v[key]>f[key+'Max']))return false;
    }
    return true;
  }
  const visibleCandidates=()=>hasFilters(filters)?candidates.filter(c=>matchesFilters(details.get(c.teamId),filters)):candidates;
  function filterForm(){
    const input=(name,label,max='')=>'<label>'+label+'<input name="'+name+'" type="number" min="0" '+max+' step="1" value="'+esc(filters[name]??'')+'" '+(busy?'disabled':'')+'></label>';
    return '<details class="sosiska-search-filters" open><summary>Уточнить найденные команды</summary><form data-sosiska-filters>'+
      input('scoreMin','Командные очки от')+
      '<label>Ник лидера содержит<input name="leader" maxlength="160" value="'+esc(filters.leader??'')+'" placeholder="Полный ник или его часть" '+(busy?'disabled':'')+'></label>'+
      '<label>Тип команды<select name="type" '+(busy?'disabled':'')+'><option value="">Любая</option><option value="open" '+(filters.type==='open'?'selected':'')+'>Открытая</option><option value="closed" '+(filters.type==='closed'?'selected':'')+'>Закрытая</option></select></label>'+
      '<fieldset><legend>Участников</legend>'+input('membersMin','От','max="50"')+input('membersMax','До','max="50"')+'</fieldset>'+
      '<fieldset><legend>Уровень для входа</legend>'+input('entryLevelMin','От')+input('entryLevelMax','До')+'</fieldset>'+
      '<fieldset><legend>Короны для входа</legend>'+input('entryCrownMin','От')+input('entryCrownMax','До')+'</fieldset>'+
      '<div class="sosiska-filter-actions"><button '+(busy?'disabled':'')+'>Применить фильтры</button>'+button('clear-filters','Сбросить')+'</div>'+
      '</form><p class="muted">Очки — сумма уровней и корон всех участников. Фильтры уточняют найденные команды; игровые ограничения поиска сохраняются.</p></details>';
  }
  function results(){
    if(!candidates.length)return '';
    const visible=visibleCandidates(),unknown=candidates.filter(c=>!details.has(c.teamId)).length;offset=Math.max(0,Math.min(offset,Math.max(0,Math.floor((visible.length-1)/size)*size)));
    return (searchWarnings.length?'<p class="muted">'+esc(searchWarnings.join(' '))+'</p>':'')+filterForm()+'<h3>Показано: '+visible.length+' из '+candidates.length+'</h3>'+
      (hasFilters(filters)&&unknown?'<p role="status">У '+unknown+' команд подробности не получены; они пока не проверены по фильтрам. Примените фильтры ещё раз для повторной загрузки.</p>':'')+
      (!visible.length?'<p>Нет команд, соответствующих выбранным фильтрам. Измените условия или сбросьте фильтры.</p>':'')+
      visible.slice(offset,offset+size).map(c=>{
        const t=details.get(c.teamId),v=teamFilterFields(t);
        return '<article><h4>'+esc(t?.TeamName??c.name)+'</h4><p>'+esc(t?.Description??'Описание пока не загружено.')+'</p>'+
        '<p>Командные очки: '+esc(value(v.score))+'</p><p>Лидер: '+esc(v.leader??'—')+' · участников: '+esc(v.members??c.memberCount??'—')+'</p>'+
        '<p>Вход: уровень '+esc(value(v.entryLevel))+', короны '+esc(value(v.entryCrown))+' · '+(v.type==='open'?'Открытая':v.type==='closed'?'Закрытая':'Тип пока не загружен')+'</p>'+
        '<p class="muted">ID '+esc(c.teamId)+' · эмблема №'+esc(t?.TeamLogo??c.logo??'—')+'</p>'+button('select-team',selected.has(c.teamId)?'✓ Выбрана для сравнения':'Выбрать для сравнения','data-team-id="'+esc(c.teamId)+'"')+button('team','Команда и состав','data-team-id="'+esc(c.teamId)+'"')+'</article>';
      }).join('')+
      (offset>0?button('prev','← Предыдущие'):'')+(offset+size<visible.length?button('next','Следующие →'):'');
  }
  function history(){
    if(!records.length)return '';
    return '<h3>Журнал снимков · сначала активные</h3>'+records.map(r=>'<article><h4>№'+r.sequence+' · '+esc(when(r.snapshot.capturedAt))+' МСК</h4>'+
      (r.changes.baseline?'<p>Начало наблюдения.</p>':'<p>Изменения с предыдущей проверки:</p><p>Вступили: '+esc(r.changes.joined.map(m=>m.Name).join(', ')||'—')+'<br>Вышли: '+esc(r.changes.left.map(m=>m.Name).join(', ')||'—')+'</p>'+
       [...r.changes.members].filter(m=>['Level','Crown','HelpCount'].some(f=>changeActivity(m,f)>0)).sort((a,b)=>changeActivity(b,'Level')-changeActivity(a,'Level')||changeActivity(b,'Crown')-changeActivity(a,'Crown')||changeActivity(b,'HelpCount')-changeActivity(a,'HelpCount')).map(m=>'<div class="sosiska-player"><b>'+esc(m.name)+'</b>'+m.changes.filter(c=>labels[c.field]).map(c=>'<p>'+esc(labels[c.field])+': '+esc(value(c.before))+' → '+esc(value(c.after))+(c.delta!==undefined?' ('+(c.delta>0?'+':'')+esc(c.delta)+')':'')+'</p>').join('')+'</div>').join('')+
       (!r.changes.members.some(m=>['Level','Crown','HelpCount'].some(f=>changeActivity(m,f)>0))?'<p>Прирост активности не наблюдался.</p>':''))+'</article>').join('')+
       (nextBefore?button('older','Более ранние снимки'):'');
  }
  function profileIcon(kind){
    const crown='<path d="M10 22l7 7 7-15 8 15 8-7-4 23H14z" fill="#ffc934" stroke="#a8750a" stroke-width="2"/><path d="M14 39h22v7H14z" fill="#ffd765" stroke="#a8750a" stroke-width="2"/><circle cx="24" cy="31" r="4" fill="#6e40d4" stroke="#fff0ac" stroke-width="1.5"/>';
    const heart='<path d="M24 42C-7 24 8 4 24 15 40 4 55 24 24 42z" fill="#f34454" stroke="#b41136" stroke-width="2"/><path d="M11 18q3-4 7-2" fill="none" stroke="#ffb9bb" stroke-width="3" stroke-linecap="round"/>';
    const card='<rect x="10" y="6" width="28" height="37" rx="4" fill="#246ad4" stroke="#edba41" stroke-width="3"/><path d="M24 15l3 7 7 1-6 5 2 7-6-4-6 4 2-7-6-5 7-1z" fill="#fff1b8"/>';
    const art={crowns:'<g transform="translate(-7 5) scale(.82)">'+crown+'</g><g transform="translate(8 -4)">'+crown+'</g>',highest:'<path d="M10 13Q-4 33 16 45M38 13Q52 33 32 45" fill="none" stroke="#e0a932" stroke-width="5"/>'+crown,league:'<circle cx="24" cy="26" r="21" fill="#2870c8" stroke="#f5c445" stroke-width="4"/><g transform="translate(8 6) scale(.65)">'+crown+'</g>',first:'<circle cx="24" cy="25" r="21" fill="#e44142" stroke="#ffc43c" stroke-width="2"/><circle cx="24" cy="25" r="14" fill="white"/><circle cx="24" cy="25" r="8" fill="#e44142"/><path d="M24 25L42 7m-2 1l-1-6 8 4-5 4 6 1-7 5" stroke="#1968d0" stroke-width="3" stroke-linejoin="round"/>',made:heart,received:'<rect x="4" y="9" width="40" height="30" rx="4" fill="#ffe08c" stroke="#d39120" stroke-width="3"/><path d="M5 11l19 17 19-17" fill="#fff1bd" stroke="#dcab33" stroke-width="2"/><g transform="translate(10 9) scale(.6)">'+heart+'</g>',areas:'<rect x="10" y="5" width="29" height="37" rx="3" fill="#8946bd" stroke="#dfad27" stroke-width="3"/><path d="M10 40h28M15 5v36" stroke="#b57ce4" stroke-width="2"/><path d="M26 12l3 7 7 1-6 5 2 7-6-4-6 4 2-7-6-5 7-1z" fill="#ffdc4c"/>',collections:'<g transform="rotate(-18 24 25) translate(-6 0)">'+card+'</g><g transform="translate(5 3)">'+card+'</g>',sets:card,avatar:'<circle cx="24" cy="15" r="9" fill="#e4edf6"/><path d="M6 45v-7c0-16 36-16 36 0v7" fill="#e4edf6"/>'};
    return '<svg viewBox="0 0 50 50" aria-hidden="true" focusable="false">'+(art[kind]||'')+'</svg>';
  }
  const profileNumber=v=>v==null?'—':(/^\d+$/.test(String(v))?BigInt(v).toLocaleString('ru-RU'):'—');
  function profileMonth(value){
    if(!/^\d+$/.test(String(value??''))||value==='0')return '—';const n=Number(value),date=new Date(n<1e12?n*1000:n);
    return Number.isFinite(date.getTime())&&date.getUTCFullYear()>=2000&&date.getUTCFullYear()<=2100?date.toLocaleDateString('ru-RU',{timeZone:'Europe/Moscow',month:'2-digit',year:'numeric'}):'—';
  }
  function profileView(){
    const member=team?.Members.find(m=>m.UserId===profileId);if(!member)return '';
    const p=profiles.get(profileId),stats=p?.stats||{};
    const cell=(icon,label,v)=>'<div class="sosiska-profile-stat"><span aria-hidden="true">'+profileIcon(icon)+'</span><small>'+label+'</small><b>'+esc(profileNumber(v))+'</b></div>';
    return '<article class="sosiska-game-profile" data-player-profile><header><h3>Профиль игрока</h3>'+button('profile-close','✕ Закрыть')+'</header><div class="sosiska-profile-identity"><div class="sosiska-profile-avatar" aria-hidden="true">'+profileIcon('avatar')+'</div><div><h4>'+esc(p?.name??member.Name)+'</h4><p>Команда: '+esc(p?p.teamName||'Нет команды':team.TeamName)+'</p><p>'+esc(role(team,member.UserId))+'</p><p>Дата начала игры: '+esc(profileMonth(p?.joinedAt))+'</p></div><div class="sosiska-profile-level"><small>Уровень</small><b>'+esc(profileNumber(p?.level??member.Level))+'</b></div></div>'+
      (profileLoading?'<p role="status">Загружаем подробную статистику…</p>':'')+(profileError?'<p role="alert">'+esc(profileError)+'</p>'+button('profile','Повторить загрузку','data-profile-id="'+esc(profileId)+'"'):'')+
      '<h4 class="sosiska-profile-banner">Статистика лиги</h4><div class="sosiska-profile-stats">'+cell('crowns','Всего корон',stats.totalCrown)+cell('highest','Больше всего корон',stats.highestCrown)+cell('league','Победы в лигах',stats.leagueWins)+'</div>'+
      '<h4 class="sosiska-profile-banner">Общая статистика</h4><div class="sosiska-profile-stats">'+cell('first','Побед с первой попытки',stats.firstTryWins)+cell('made','Оказанная помощь',stats.helpsMade)+cell('received','Полученная помощь',stats.helpsReceived)+cell('areas','Пройдено территорий',stats.areasCompleted)+cell('collections','Собрано коллекций',stats.collectionsCompleted)+cell('sets','Завершено наборов',stats.setsCompleted)+'</div>'+
      '<div class="sosiska-profile-current"><span>Текущие короны: <b>'+esc(profileNumber(p?.crown??member.Crown))+'</b></span><span>Помощь в составе: <b>'+esc(profileNumber(member.HelpCount))+'</b></span></div>'+(p?'<p class="muted">Обновлено: '+esc(when(p.fetchedAt))+' МСК. — означает, что сервер не прислал показатель.</p>':'')+'</article>';
  }
  function memberCard(m){return '<li class="sosiska-member" data-player-id="'+esc(m.UserId)+'"><button type="button" class="sosiska-member-open" data-sosiska-action="profile" data-profile-id="'+esc(m.UserId)+'" aria-label="Открыть профиль '+esc(m.Name)+'"><div><strong>'+esc(m.Name)+'</strong><small>'+esc(role(team,m.UserId))+'</small><span aria-hidden="true"> ›</span></div><div class="sosiska-metrics"><span>Уровень<b>'+esc(profileNumber(m.Level))+'</b></span><span>Короны<b>'+esc(profileNumber(m.Crown))+'</b></span><span>Помощь<b>'+esc(profileNumber(m.HelpCount))+'</b></span></div></button></li>';}
  function roster(){
    const w=watches.find(w=>w.teamId===team.TeamId),members=sorted(team.Members),v=teamFilterFields(team);
    return button('results','← К результатам')+'<article><h3>'+esc(team.TeamName)+'</h3><p>'+esc(team.Description)+'</p><p>Командные очки: '+esc(value(v.score))+' · участников: '+members.length+'</p><p>Лидер: '+esc(v.leader??'—')+'</p><p>Вход: уровень '+esc(team.MinLevel)+', короны '+esc(team.MinCrown)+' · '+(team.Type?'Открытая':'Закрытая')+'</p>'+button('roster-view','Состав')+button('period','Весь период')+button('history','Журнал снимков')+button('analysis','ИИ-анализ всей истории команды')+'<details><summary>Управление отслеживанием</summary>'+button('capture','Сохранить снимок сейчас')+'<label>Интервал, минуты<input data-sosiska-interval type="number" min="60" max="10080" step="1" value="'+esc(w?.intervalMinutes??60)+'" '+(busy?'disabled':'')+'></label>'+button('watch',w?'Изменить интервал':'Включить отслеживание')+(w?button('unwatch','Остановить отслеживание'):'')+'<p class="muted">Остановка сохраняет историю снимков.</p></details></article>'+
      (teamView==='profile'?profileView():teamView==='roster'?'<article><h3>Состав · по уровням и коронам</h3><ol class="sosiska-roster">'+members.map(memberCard).join('')+'</ol></article>':teamView==='history'?history():button('period-refresh','Обновить весь период')+periodView());
  }
  function render(){if(!opened)return;chartModels.clear();chartGesture=null;const panel=document.getElementById('panel');if(!panel)return;panel.hidden=false;panel.innerHTML=`<section class="sosiska-screen" aria-busy="${busy}">${button('back','← На главную')}<h2>🌭 Агент «Сосиска»</h2><p class="muted">Royal Match · доступ администраторам</p><form data-sosiska-search><label>Название команды<input name="query" maxlength="160" value="${esc(query)}" placeholder="Например, Mamonovo" required ${busy?'disabled':''}></label><button ${busy?'disabled':''}>Найти</button></form><p role="status" aria-live="polite">${esc(busy?((filterLoading||periodLoading)?notice:'Получаем данные…'):notice)}</p>${filterLoading?'<button type="button" data-sosiska-action="stop-filters">Остановить загрузку</button>':''}${periodLoading?'<button type="button" data-sosiska-action="stop-period">Остановить загрузку истории</button>':''}${team&&analysisMode!=='selected'?roster():results()}${comparisonView()}<div id="sosiskaAnalysis">${analysisView()}</div><h3>Отслеживаемые команды</h3>${button('list','Обновить список')}${watches.length?watches.map(w=>`<article><b>${esc(w.teamName||details.get(w.teamId)?.TeamName||'Команда без названия')}</b><p>Каждые ${esc(w.intervalMinutes)} мин. · последний снимок: ${esc(when(w.lastSuccessAt))}</p>${w.lastError?`<p>Последняя попытка не удалась: ${esc(w.lastError)}</p>`:''}${button('select-team',selected.has(w.teamId)?'✓ Выбрана для сравнения':'Выбрать для сравнения',`data-team-id="${esc(w.teamId)}"`)}${button('team','Открыть',`data-team-id="${esc(w.teamId)}"`)}</article>`).join(''):'<p>Отслеживание не включено.</p>'}</section>`;}

  function analysisView(){
    if(!analysisParams())return '';
    if(!analysis?.available)return '<p class="muted">'+esc(analysis?.reason||'ИИ-анализ ещё не запускался. Динамика за весь период доступна без ИИ.')+'</p>';
    const a=analysis;
    if(a.state==='running')return `<article><h3>Анализ всей истории выполняется</h3><p>Команд: ${a.teams.length} · загружено снимков: ${esc(a.processedSnapshots)}</p><p>${esc(({fetch:'Читаем сохранённую историю',chunk:'ИИ анализирует изменения',reduce:'ИИ объединяет части анализа',overall:'ИИ сравнивает команды'}[a.phase]||'Анализируем историю'))}</p><p>Задача продолжится после закрытия приложения.</p>${a.error?'<p>'+esc(analysisError(a.error))+'</p><p>Повтор: '+esc(when(a.nextAttemptAt))+' · попыток: '+esc(a.retries)+'</p>':''}</article>`;
    if(a.state==='failed')return `<article><h3>Анализ не завершён</h3><p>Обработано снимков: ${esc(a.processedSnapshots)}. ${esc(analysisError(a.error))}</p><p>Можно повторить запуск; история сохранена.</p></article>`;
    return `<article><h3>${a.scope==='team'?'Анализ команды за весь период':'Сравнение выбранных команд за весь период'}</h3><p>Команд: ${a.teams.length} · снимков: ${esc(a.processedSnapshots)}</p><div class="sosiska-analysis">${esc(a.summary?.text)}</div></article>${a.teams.map(t=>`<article><h3>${esc(t.teamName||t.teamId)}</h3><p>Вся история: ${esc(t.count)} снимков · ${esc(when(t.from))} — ${esc(when(t.to))} МСК</p><div class="sosiska-analysis">${esc(t.text)}</div>${button('timeline','Динамика по снимкам',`data-team-id="${esc(t.teamId)}"`)}${timelineView(t.teamId)}</article>`).join('')}`;
  }
  function timelineView(id){
    const data=timelines.get(id);if(!data)return '';
    return `<div class="sosiska-table"><table><thead><tr><th>Снимок / МСК</th><th>Игроки</th><th>Уровни</th><th>Короны</th><th>Помощь</th></tr></thead><tbody>${data.points.map(p=>`<tr><td>№${esc(p.sequence)}<br>${esc(when(p.capturedAt))}</td><td>${esc(p.memberCount)}</td><td>${esc(value(p.levelTotal))}</td><td>${esc(value(p.crownTotal))}</td><td>${esc(value(p.helpTotal))}</td></tr>`).join('')}</tbody></table></div>${data.points.map(p=>`<details><summary>№${esc(p.sequence)}: игроки и изменения</summary>${playerDynamics(p)}</details>`).join('')}${data.nextBefore?button('timeline-older','Более ранняя динамика',`data-team-id="${esc(id)}"`):''}<p class="muted">Падение корон или помощи может быть сбросом счётчика. Данные разных составов нельзя считать прогрессом одних и тех же игроков.</p>`;
  }

  function playerDynamics(point){
    const delta=(id,field)=>{const c=point.changes.members?.find(m=>m.userId===id)?.changes.find(c=>c.field===field);return c?.delta===undefined?'—':c.delta>0?'+'+c.delta:String(c.delta);};
    return `<div class="sosiska-table"><table><thead><tr><th>Игрок</th><th>Уровень / Δ</th><th>Короны / Δ</th><th>Помощь / Δ</th></tr></thead><tbody>${sorted(point.members.map(m=>({...m,UserId:m.userId,Level:m.level,Crown:m.crown}))).map(m=>`<tr><td>${esc(m.name)}</td><td>${esc(value(m.level))} / ${esc(delta(m.userId,'Level'))}</td><td>${esc(value(m.crown))} / ${esc(delta(m.userId,'Crown'))}</td><td>${esc(value(m.help))} / ${esc(delta(m.userId,'HelpCount'))}</td></tr>`).join('')}</tbody></table></div><p>Вступили: ${esc(point.changes.joined?.map(m=>m.Name).join(', ')||'—')}<br>Вышли: ${esc(point.changes.left?.map(m=>m.Name).join(', ')||'—')}</p>`;
  }
  function analysisParams(){return analysisMode==='team'&&team?{teamId:team.TeamId}:analysisMode==='selected'&&selected.size>=2?{teamIds:[...selected.keys()]}:null;}
  function matchesAnalysis(a,params){return !a?.available||(a.scope===(params.teamId?'team':'selected')&&JSON.stringify((a.teams??[]).map(t=>t.teamId).sort())===JSON.stringify((params.teamId?[params.teamId]:params.teamIds).slice().sort()));}
  async function switchAnalysis(mode,e){
    analysisMode=mode;analysis=null;analysisEpoch++;clearTimeout(pollTimer);timelines.clear();
    const params=analysisParams(),version=analysisEpoch;if(!params)return;
    const current=await api('analysisStatus',params,e);
    if(version===analysisEpoch&&matchesAnalysis(current,params)){analysis=current;schedulePoll();}
  }
  function schedulePoll(){
    clearTimeout(pollTimer);if(!opened||analysis?.state!=='running')return;
    const e=epoch,version=analysisEpoch,jobId=analysis.jobId,params=analysisParams();pollTimer=setTimeout(async()=>{
      if(e!==epoch||version!==analysisEpoch||!opened)return;if(busy){schedulePoll();return;}
      try{const current=await api('analysisStatus',{jobId},e);if(version!==analysisEpoch||!matchesAnalysis(current,params))return;analysis=current;const node=document.getElementById('sosiskaAnalysis');if(node)node.innerHTML=analysisView();}catch(error){if(error.stale||version!==analysisEpoch)return;notice='Не удалось обновить состояние анализа: '+error.message;render();}
      schedulePoll();
    },5000);
  }
  async function hydrate(e,all=false){
    const list=all?candidates:visibleCandidates().slice(offset,offset+size);let done=0;
    for(const c of list){
      if(e!==epoch||!opened)return;if(all&&stopFilterLoading)break;
      if(!details.has(c.teamId)){
        try{const data=await api('team',{teamId:c.teamId},e);if(data.TeamId!==c.teamId||!Array.isArray(data.Members))throw new Error('Некорректные данные команды.');details.set(c.teamId,data);}
        catch(error){if(error.stale||error.denied)throw error;if(error.limited)break;notice='Часть подробностей не загрузилась. Примените фильтры ещё раз, чтобы повторить.';}
      }
      done++;if(all){notice='Проверяем команды: '+done+' из '+list.length+'…';render();}
    }
  }
  async function loadPeriod(e){
    if(typeof SosiskaPeriod==='undefined')throw new Error('Обновите приложение для загрузки динамики.');
    const acc=SosiskaPeriod.createPeriodAccumulator(team.TeamId,{retainIntervals:true});let before;
    periodLoading=true;stopPeriod=false;notice='Загружаем весь период…';render();
    try{
      for(;;){
        if(e!==epoch||!opened||stopPeriod)break;
        const page=await api('history',{teamId:team.TeamId,limit:20,...(before?{before}:{})},e);
        if(!Array.isArray(page.records))throw new Error('Не удалось загрузить историю.');
        if(!page.records.length){if(before)throw new Error('История неполная. Повторите загрузку.');break;}
        for(const record of page.records)acc.add(record);
        period=acc.result();notice='Загружено снимков: '+period.snapshotCount;render();
        if(!page.nextBefore){if(!period.complete)throw new Error('История неполная. Повторите загрузку.');break;}
        if(page.nextBefore!==page.records.at(-1).sequence||before&&page.nextBefore>=before)throw new Error('Ошибка порядка истории.');
        before=page.nextBefore;
      }
      if(e===epoch&&opened){period=acc.result();notice=period.complete?'Весь период загружен.':period.snapshotCount?'Загрузка остановлена; показана часть периода.':'Снимков пока нет.';}
    }catch(error){if(/^PERIOD_/.test(error.message))throw new Error('История содержит пропуск или некорректное время. Показана только проверенная часть периода.');throw error;}finally{if(e===epoch)periodLoading=false;}
  }
  async function loadHistory(e,append=false){const d=await api('history',{teamId:team.TeamId,limit:5,...(append?{before:nextBefore}:{})},e);records=append?[...records,...d.records]:d.records;nextBefore=d.nextBefore;}
  async function run(task){if(busy||!opened||!admin())return;const e=epoch;busy=true;notice='';render();try{await task(e);}catch(error){if(!error.stale)notice=error.name==='AbortError'?'Сервер не ответил вовремя. Повторите попытку.':error.message;}finally{if(e===epoch&&opened){busy=false;render();}}}
  async function loadWatches(e){
    watches=(await api('list',{},e)).watches;
    for(const w of watches){if(e!==epoch||!opened)return;try{const d=await api('history',{teamId:w.teamId,limit:1},e);w.teamName=d.records?.[0]?.snapshot?.raw?.TeamName;}catch(error){if(error.stale||error.denied)throw error;if(error.limited)break;}}
  }
  async function open(){reset();if(!admin())return;opened=true;try{window.RoyalNav?.pushCurrent?.();setActiveNav('sosiska');activePage='sosiska';}catch{}render();await run(async e=>{await loadWatches(e);notice='Введите название команды для поиска.';});}
  document.addEventListener('submit',event=>{
    if(event.target.matches('[data-sosiska-search]')){
      event.preventDefault();event.stopImmediatePropagation();if(busy)return;
      query=String(new FormData(event.target).get('query')||'').trim();event.target.querySelector('input')?.blur();
      run(async e=>{team=null;await switchAnalysis(null,e);records=[];candidates=[];details.clear();filters={};const d=await api('search',{query},e);candidates=d.candidates;searchWarnings=d.warnings;offset=0;notice=d.warnings.join(' ')||(!candidates.length?'Команды не найдены.':'');await hydrate(e);});return;
    }
    if(!event.target.matches('[data-sosiska-filters]'))return;
    event.preventDefault();event.stopImmediatePropagation();if(busy)return;
    let selected;try{selected=parseFilters(new FormData(event.target));}catch(error){notice=error.message;const status=document.querySelector('.sosiska-screen > [role="status"]');if(status)status.textContent=notice;return;}
    run(async e=>{
      filters=selected;offset=0;
      if(hasFilters(filters)){
        filterLoading=true;stopFilterLoading=false;notice='Проверяем подробности найденных команд…';render();
        try{await hydrate(e,true);}finally{if(e===epoch)filterLoading=false;}
      }
      if(e!==epoch||!opened)return;
      const unknown=candidates.filter(c=>!details.has(c.teamId)).length;
      notice=unknown&&hasFilters(filters)?'Не проверено команд: '+unknown+'. Примените фильтры ещё раз для повторной загрузки.':'По фильтрам найдено: '+visibleCandidates().length+'.';
    });
  },true);
  window.addEventListener('click',event=>{
    const entry=event.target.closest?.('[data-sosiska-open]');if(entry){event.preventDefault();event.stopImmediatePropagation();open();return;}
    const target=event.target.closest?.('[data-sosiska-action]');if(!target)return;event.preventDefault();event.stopImmediatePropagation();const action=target.dataset.sosiskaAction;
    if(action==='back'){reset();renderPage('home');return;}if(action==='stop-filters'){stopFilterLoading=true;return;}if(action==='stop-period'){stopPeriod=true;return;}if(busy)return;
    const interval=Number(document.querySelector('[data-sosiska-interval]')?.value);
    run(async e=>{
      if(action==='metric'){metric=target.dataset.metric;return;}
      if(action==='profile-close'){profileId=null;teamView='roster';return;}
      if(action==='profile'){const id=target.dataset.profileId;if(!team?.Members.some(m=>m.UserId===id))throw Error('Игрок не найден в составе.');profileId=id;teamView='profile';profileLoading=true;profileError='';render();
       try{const data=await api('profile',{userId:id},e);if(data.userId!==id)throw Error('Профиль не соответствует выбранному игроку.');profiles.set(id,data);}catch(error){if(error.stale)throw error;profileError='Подробная статистика не загрузилась. '+error.message;}finally{if(e===epoch)profileLoading=false;}
       setTimeout(()=>{if(e===epoch)document.querySelector('[data-player-profile]')?.scrollIntoView?.({behavior:'smooth',block:'start'});},0);return;}
      if(action==='player-close'){playerId=null;return;}
      if(action==='player'){playerId=target.dataset.playerId;teamView='period';if(!period?.complete)await loadPeriod(e);render();setTimeout(()=>{if(e===epoch)document.querySelector('.sosiska-player-detail')?.scrollIntoView?.({behavior:'smooth',block:'start'});},0);return;}
      if(action==='select-team'){const id=target.dataset.teamId;if(selected.has(id))selected.delete(id);else{if(selected.size>=5)throw Error('Выберите не более пяти команд.');selected.set(id,details.get(id)?.TeamName||watches.find(w=>w.teamId===id)?.teamName||candidates.find(c=>c.teamId===id)?.name||id);}comparison=null;await switchAnalysis('selected',e);return;}
      if(action==='clear-selection'){selected.clear();comparison=null;await switchAnalysis(team?'team':null,e);return;}
      if(action==='analysis-selected'){if(analysisMode!=='selected')return;if(selected.size<2)throw Error('Выберите от двух до пяти команд.');const params=analysisParams(),data=await api('analysis',params,e);if(!matchesAnalysis(data,params))throw Error('Ответ ИИ не соответствует выбранным командам.');analysis=data;schedulePoll();return;}
      if(action==='compare'){if(selected.size<2)throw Error('Выберите от двух до пяти команд.');const periods=[];comparison=null;
       for(const id of selected.keys()){notice='Загружаем историю: '+selected.get(id);render();const acc=SosiskaPeriod.createPeriodAccumulator(id,{retainIntervals:true});let before;
        for(;;){const page=await api('history',{teamId:id,limit:20,...(before?{before}:{})},e);if(!page.records.length)break;for(const r of page.records)acc.add(r);if(!page.nextBefore)break;if(before&&page.nextBefore>=before)throw Error('Ошибка порядка истории.');before=page.nextBefore;}
        periods.push(acc.result());}
       try{comparison=SosiskaPeriod.comparePeriods(periods);}catch(error){throw Error(error.message==='COMPARISON_NO_OVERLAP'?'У команд нет общего периода наблюдения.':'Для сравнения каждой команде нужны хотя бы два снимка и полная история.');}return;}
      if(action==='results'){team=null;records=[];await switchAnalysis(null,e);return;}
      if(action==='clear-filters'){filters={};offset=0;notice='Фильтры сброшены.';await hydrate(e);return;}
      if(action==='next'||action==='prev'){offset+=action==='next'?size:-size;await hydrate(e);return;}
      if(action==='team'){const id=target.dataset.teamId;team=await api('team',{teamId:id},e);details.set(id,team);profileId=null;profileError='';await switchAnalysis('team',e);records=[];period=null;playerId=null;teamView='period';nextBefore=null;await loadPeriod(e);return;}
      if(action==='list'){await loadWatches(e);return;}
      if(action==='timeline'||action==='timeline-older'){const id=target.dataset.teamId,old=timelines.get(id);const data=await api('analysisTimeline',{jobId:analysis.jobId,teamId:id,limit:10,...(action==='timeline-older'?{before:old.nextBefore}:{})},e);timelines.set(id,{...data,points:action==='timeline-older'?[...old.points,...data.points]:data.points});return;}if(!team)return;
      if(action==='analysis'){if(analysisMode!=='team')return;const data=await api('analysis',{teamId:team.TeamId},e);if(!matchesAnalysis(data,analysisParams()))throw Error('Ответ ИИ не соответствует выбранной команде.');analysis=data;timelines.clear();if(!data.available)notice=data.reason;schedulePoll();return;}
      if(action==='roster-view'){teamView='roster';return;}
      if(action==='period'||action==='period-refresh'){teamView='period';if(action==='period-refresh'||!period?.complete)await loadPeriod(e);return;}
      if(action==='capture'){await api('capture',{teamId:team.TeamId},e);if(teamView==='period')await loadPeriod(e);else await loadHistory(e);notice='Снимок сохранён.';return;}
      if(action==='history'||action==='older'){teamView='history';await loadHistory(e,action==='older');if(!records.length)notice='Снимков пока нет. Можно сохранить первый снимок.';return;}
      if(action==='watch'){if(!Number.isInteger(interval)||interval<60||interval>10080)throw new Error('Интервал должен быть целым числом от 60 до 10080 минут.');await api('watch',{teamId:team.TeamId,intervalMinutes:interval},e);notice='Отслеживание включено.';}
      if(action==='unwatch'){await api('unwatch',{teamId:team.TeamId},e);notice='Отслеживание остановлено. История сохранена.';}watches=(await api('list',{},e)).watches;
    });
  },true);
  if(typeof renderPage==='function'){const original=renderPage;renderPage=function(page){reset();const result=original(page);decorate();return result;};}
  window.addEventListener('royal:auth-ready',()=>{reset();decorate();});
  for(const name of ['royal:access-denied','royal:fatal'])window.addEventListener(name,()=>{reset();decorate();});
  window.RoyalAdminDataV0600?.subscribe?.(event=>{if(event.type==='clear'&&['unauthorized','forbidden','session-changed'].includes(event.reason)){const visible=opened;reset();if(visible){const panel=document.getElementById('panel');if(panel)panel.textContent='Админская сессия завершена. Откройте приложение заново.';}}});
  decorate();window.RoyalSosiska={version:'0.5.4',open,filters:{parse:parseFilters,matches:matchesFilters,fields:teamFilterFields}};
})();

