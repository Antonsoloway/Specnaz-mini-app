import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../sosiska-v061.js',import.meta.url),'utf8');
const periodSource=await readFile(new URL('../sosiska-period-v061.js',import.meta.url),'utf8');
const settle=async()=>{for(let i=0;i<8;i++)await new Promise(setImmediate);};
function setup({admin=true,responder}={}){
  const listeners={},docListeners={},tiles=[],calls=[],panel={innerHTML:'',hidden:false},grid={querySelector:()=>tiles.find(x=>!x.removed)||null,appendChild:b=>tiles.push(b)};
  const hosts=[];const document={body:{appendChild:n=>hosts.push(n)},activeElement:{focus(){}},querySelector:s=>s==='.grid'?grid:s==='[data-sosiska-interval]'?{value:'120'}:null,getElementById:()=>panel,createElement:()=>({dataset:{},querySelector:()=>null,remove(){this.removed=true;}}),addEventListener:(type,fn)=>{docListeners[type]=fn;}};
  const context={document,authState:{role:{isChatAdmin:admin}},sessionToken:'session-a',activePage:'home',setActiveNav(){},renderPage(page){panel.innerHTML=page;},FormData:class{constructor(form){this.form=form;}get(name){return this.form.filters?this.form.filters[name]??'':this.form.query;}},Response,AbortController,setTimeout,clearTimeout,console,fetch:async(url,init)=>{const b=JSON.parse(init.body);calls.push(b);return Response.json({ok:true,data:await (responder?responder(b):{watches:[]})});}};
  context.window={addEventListener:(type,fn)=>{listeners[type]=fn;},RoyalNav:{pushCurrent(){}},RoyalAdminDataV0600:{subscribe(fn){listeners.adminClear=fn;}}};vm.createContext(context);vm.runInContext(periodSource,context);vm.runInContext(source,context);
  const action=(name,id,extra={})=>listeners.click({target:{closest:s=>s==='[data-sosiska-action]'?{dataset:{sosiskaAction:name,teamId:id,...extra}}:null},preventDefault(){},stopImmediatePropagation(){}});
  const search=query=>docListeners.submit({target:{query,matches:selector=>selector==='[data-sosiska-search]',querySelector:()=>({blur(){}})},preventDefault(){},stopImmediatePropagation(){}});
  const filter=values=>docListeners.submit({target:{filters:values,matches:selector=>selector==='[data-sosiska-filters]'},preventDefault(){},stopImmediatePropagation(){}});
  return {context,tiles,calls,panel,action,search,filter,listeners,hosts};
}
test('tile only appears for admins and opening lists watches without enabling any',async()=>{
  const denied=setup({admin:false});assert.equal(denied.tiles.length,0);await denied.context.window.RoyalSosiska.open();assert.equal(denied.calls.length,0);
  const s=setup();assert.equal(s.tiles.length,1);await s.context.window.RoyalSosiska.open();assert.deepEqual(s.calls,[{operation:'list'}]);assert.match(s.panel.innerHTML,/Отслеживание не включено/);
});
test('same-name results show description and leader, with HTML escaped',async()=>{
  const s=setup({responder:b=>b.operation==='list'?{watches:[]}:b.operation==='search'?{candidates:[{teamId:'1',name:'<img src=x onerror=evil()>',memberCount:1,sources:['search']}],warnings:[]}:{TeamId:'1',TeamName:'Team',Description:'<script>evil()</script>',Leader:'2',CoLeaders:[],Members:[{UserId:'2',Name:'Leader & Co',Level:1,Crown:0,HelpCount:0}]}});
  await s.context.window.RoyalSosiska.open();s.search('Team');await settle();assert.match(s.panel.innerHTML,/&lt;script&gt;/);assert.match(s.panel.innerHTML,/Leader &amp; Co/);assert.ok(!s.panel.innerHTML.includes('<script>evil'));assert.equal(s.calls.filter(x=>x.operation==='watch').length,0);
});
test('late response after navigation cannot overwrite another screen',async()=>{
  let release;const pending=new Promise(resolve=>{release=resolve;});const s=setup({responder:b=>b.operation==='search'?pending:{watches:[]}});
  await s.context.window.RoyalSosiska.open();s.search('Team');await settle();s.context.renderPage('players');release({candidates:[],warnings:[]});await settle();assert.equal(s.panel.innerHTML,'players');
});
test('explicit watch uses user interval; history renders changes and joins',async()=>{
  const raw={TeamId:'1',TeamName:'Team',Members:[{UserId:'2',Name:'Player',Level:100,Crown:2,HelpCount:7}],Leader:'2',CoLeaders:[],MinLevel:1,MinCrown:0};
  const s=setup({responder:b=>b.operation==='team'?raw:b.operation==='history'?{records:[{sequence:2,snapshot:{raw,capturedAt:'2026-10-11T20:00:00Z'},changes:{baseline:false,from:'2026-10-11T19:00:00Z',joined:[{Name:'New'}],left:[],members:[{name:'Player',changes:[{field:'Level',before:90,after:100,delta:10}]}],team:[],derived:[]}}],nextBefore:null}:{watches:[]}});
  await s.context.window.RoyalSosiska.open();s.action('team','1');await settle();assert.match(s.panel.innerHTML,/Лидер/);s.action('watch');await settle();assert.deepEqual(s.calls.find(b=>b.operation==='watch'),{operation:'watch',teamId:'1',intervalMinutes:120});s.action('history');await settle();assert.match(s.panel.innerHTML,/\+10/);assert.match(s.panel.innerHTML,/Вступили: New/);
});
test('analysis is escaped and tied to server dates, never generated automatically',async()=>{
  const s=setup({responder:b=>b.operation==='team'?{TeamId:'1',TeamName:'Team',Members:[]}:b.operation==='analysis'?{available:true,scope:'team',state:'done',processedSnapshots:30,summary:{text:'<b>Untrusted</b>'},teams:[{teamId:'1',teamName:'Team',count:30,text:'Report',from:'2026-10-11T19:00:00Z',to:'2026-10-11T20:00:00Z'}]}:{watches:[]}});await s.context.window.RoyalSosiska.open();s.action('team','1');await settle();assert.equal(s.calls.filter(x=>x.operation==='analysis').length,0);s.action('analysis');await settle();assert.match(s.panel.innerHTML,/&lt;b&gt;Untrusted/);
});
test('no global analysis control or unscoped request is available',async()=>{
 const s=setup();await s.context.window.RoyalSosiska.open();s.action('analysis-all');await settle();
 assert.equal(s.calls.some(b=>b.operation==='analysis'||b.operation==='analysisStatus'),false);
 assert.ok(!s.panel.innerHTML.includes('data-sosiska-action="analysis-all"'));
});

const filterTeam=(id,level=10000,crown=0,leader='Лидер')=>({TeamId:String(id),TeamName:'Team '+id,Description:'Details '+id,Leader:'99',CoLeaders:[],MinLevel:100,MinCrown:0,Type:true,Members:[{UserId:'99',Name:leader,Level:level,Crown:crown,HelpCount:0},{UserId:'98',Name:'Member',Level:10000,Crown:0,HelpCount:0}]});
test('filters combine inclusive score, leader substring, member and entry ranges and team type',()=>{
 const api=setup().context.window.RoyalSosiska.filters;
 const f=api.parse(new Map(Object.entries({scoreMin:'30000',leader:'АЛ',membersMin:'2',membersMax:'2',entryLevelMin:'100',entryLevelMax:'100',entryCrownMax:'0',type:'open'})));
 const t=filterTeam('1',19000,1000,'Наталья');
 assert.equal(api.fields(t).score,30000);assert.equal(api.matches(t,f),true);
 assert.equal(api.matches({...t,Members:t.Members.map(m=>({...m,Crown:0}))},f),false);
 assert.equal(api.matches({...t,Type:false},f),false);
 assert.equal(api.matches(undefined,f),false);
 assert.equal(api.matches({...t,Members:[{UserId:'99',Name:'Наталья',Level:30000}]},{scoreMin:1}),false);
 assert.equal(api.matches({...t,Score:999999,Members:t.Members.map(m=>({...m,Level:0,Crown:0}))},{scoreMin:30000}),false);
});
test('invalid numeric ranges do not silently coerce negative, fractional or malformed filters',()=>{
 const api=setup().context.window.RoyalSosiska.filters;
 for(const values of [{scoreMin:'-1'},{scoreMin:'30.5'},{scoreMin:'30000x'},{membersMax:'51'},{membersMin:'30',membersMax:'20'},{type:'unknown'}]){
   assert.throws(()=>api.parse(new Map(Object.entries(values))));
 }
 assert.equal(api.parse(new Map([['scoreMin','0']])).scoreMin,0);
});
test('filtering checks candidates after first page and clearing keeps all original results',async()=>{
 const candidates=Array.from({length:6},(_,i)=>({teamId:String(i+1),name:'Team '+(i+1)}));
 const s=setup({responder:b=>b.operation==='search'?{candidates,warnings:[]}:b.operation==='team'?filterTeam(b.teamId,b.teamId==='6'?20000:10000,0,b.teamId==='6'?'Needle':'Other'):{watches:[]}});
 await s.context.window.RoyalSosiska.open();s.search('Team');await settle();
 assert.equal(s.calls.filter(b=>b.operation==='team').length,4);
 s.filter({scoreMin:'30000',leader:'needle'});await settle();
 assert.match(s.panel.innerHTML,/Показано: 1 из 6/);assert.match(s.panel.innerHTML,/Team 6/);assert.match(s.panel.innerHTML,/Командные очки: 30000/);
 assert.equal(s.calls.filter(b=>b.operation==='team').length,6);
 s.action('clear-filters');await settle();assert.match(s.panel.innerHTML,/Показано: 6 из 6/);
 assert.equal(s.calls.filter(b=>['watch','capture'].includes(b.operation)).length,0);
});
test('failed detail remains explicitly unchecked and is retried without repeating cached reads',async()=>{
 let fail=true;
 const candidates=Array.from({length:5},(_,i)=>({teamId:String(i+1),name:'Team '+(i+1)}));
 const s=setup({responder:b=>{
  if(b.operation==='search')return {candidates,warnings:['Рейтинги временно недоступны.']};
  if(b.operation==='team'){if(b.teamId==='5'&&fail)throw new Error('network');return filterTeam(b.teamId,20000);}
  return {watches:[]};
 }});
 await s.context.window.RoyalSosiska.open();s.search('Team');await settle();
 s.filter({scoreMin:'30000'});await settle();assert.match(s.panel.innerHTML,/Не проверено команд: 1/);assert.match(s.panel.innerHTML,/Рейтинги временно недоступны/);
 fail=false;s.filter({scoreMin:'30000'});await settle();assert.match(s.panel.innerHTML,/Показано: 5 из 5/);
 assert.equal(s.calls.filter(b=>b.operation==='team'&&b.teamId==='1').length,1);
 assert.equal(s.calls.filter(b=>b.operation==='team'&&b.teamId==='5').length,2);
});
test('navigation during full filtering stops further reads and ignores late detail',async()=>{
 let release;
 const candidates=Array.from({length:6},(_,i)=>({teamId:String(i+1),name:'Team '+(i+1)}));
 const s=setup({responder:b=>b.operation==='search'?{candidates,warnings:[]}:b.operation==='team'?(b.teamId==='5'?new Promise(r=>{release=r;}):filterTeam(b.teamId,20000)):{watches:[]}});
 await s.context.window.RoyalSosiska.open();s.search('Team');await settle();
 s.filter({scoreMin:'30000'});await settle();s.context.renderPage('players');release(filterTeam('5',20000));await settle();
 assert.equal(s.panel.innerHTML,'players');assert.equal(s.calls.some(b=>b.operation==='team'&&b.teamId==='6'),false);
});
test('stop full filtering leaves unverified count and does not read next candidate',async()=>{
 let release;
 const candidates=Array.from({length:6},(_,i)=>({teamId:String(i+1),name:'Team '+(i+1)}));
 const s=setup({responder:b=>b.operation==='search'?{candidates,warnings:[]}:b.operation==='team'?(b.teamId==='5'?new Promise(r=>{release=r;}):filterTeam(b.teamId,20000)):{watches:[]}});
 await s.context.window.RoyalSosiska.open();s.search('Team');await settle();
 s.filter({scoreMin:'30000'});await settle();s.action('stop-filters');release(filterTeam('5',20000));await settle();
 assert.equal(s.calls.some(b=>b.operation==='team'&&b.teamId==='6'),false);assert.match(s.panel.innerHTML,/Не проверено команд: 1/);
});

test('full candidate hydration stops on revoked admin session or rate limiting',async()=>{
 for(const status of [401,403,429]){
  const candidates=Array.from({length:6},(_,i)=>({teamId:String(i+1),name:'Team '+(i+1)}));
  const s=setup({responder:b=>b.operation==='search'?{candidates,warnings:[]}:b.operation==='team'?filterTeam(b.teamId,20000):{watches:[]}});
  const original=s.context.fetch;s.context.fetch=async(url,init)=>{const b=JSON.parse(init.body);if(b.operation==='team'&&b.teamId==='5'){s.calls.push(b);return Response.json({ok:false,message:'Access or rate limit'}, {status});}return original(url,init);};
  await s.context.window.RoyalSosiska.open();s.search('Team');await settle();s.filter({scoreMin:'30000'});await settle();
  assert.equal(s.calls.some(b=>b.operation==='team'&&b.teamId==='6'),false);
  if(status===401||status===403)assert.ok(!s.panel.innerHTML.includes('Team 1'));
 }
});

test('roster is sorted and full period automatically covers more than one history page without AI',async()=>{
 const members=[{UserId:'2',Name:'Low',Level:100,Crown:0,HelpCount:0},{UserId:'3',Name:'High',Level:200,Crown:50,HelpCount:0}];
 const histories=Array.from({length:27},(_,i)=>({sequence:27-i,snapshot:{teamId:'1',capturedAt:new Date(Date.UTC(2026,9,13)+(27-i)*3600000).toISOString(),raw:{TeamName:'Team',Members:members.map(m=>({...m,Level:m.Level+27-i}))}},changes:{baseline:27-i===1}}));
 const s=setup({responder:b=>b.operation==='team'?{TeamId:'1',TeamName:'Team',Leader:'3',Members:members}:b.operation==='history'?(()=>{const records=histories.filter(r=>r.sequence<(b.before??Infinity)).slice(0,b.limit);return {records,nextBefore:records.at(-1)?.sequence>1?records.at(-1).sequence:null};})():b.operation==='analysisStatus'?{available:false,reason:'Key missing'}:{watches:[]}});
 await s.context.window.RoyalSosiska.open();s.action('team','1');await settle();
 s.action('roster-view');await settle();assert.ok(s.panel.innerHTML.indexOf('data-player-id="3"')<s.panel.innerHTML.indexOf('data-player-id="2"'));
 s.action('period');await settle();assert.match(s.panel.innerHTML,/Весь период наблюдения/);assert.match(s.panel.innerHTML,/снимков: 27/);assert.match(s.panel.innerHTML,/Уровни: \+26/);
 assert.equal(s.calls.filter(b=>b.operation==='history').length,2);assert.ok(!s.panel.innerHTML.includes('&quot;Members&quot;'));assert.ok(!s.panel.innerHTML.includes('UserId'));
 assert.equal(s.calls.some(b=>['analysis','watch','capture'].includes(b.operation)),false);
});
test('activity charts open on player click and comparison only reads selected teams',async()=>{
 const history=id=>[2,1].map(n=>({sequence:n,snapshot:{teamId:id,capturedAt:new Date(Date.UTC(2026,9,13,n)).toISOString(),raw:{TeamName:'Team '+id,Members:[{UserId:'1',Name:'Idle',Level:1000,Crown:0,HelpCount:0},{UserId:'2',Name:'<Active>',Level:n*10,Crown:n*5,HelpCount:0}]}},changes:{baseline:n===1,joined:[],left:[],members:[]}}));
 const s=setup({responder:b=>b.operation==='list'?{watches:['1','2','3'].map(teamId=>({teamId,intervalMinutes:60}))}:b.operation==='history'?{records:history(b.teamId).slice(0,b.limit),nextBefore:null}:b.operation==='team'?{TeamId:b.teamId,TeamName:'Team '+b.teamId,Members:history(b.teamId)[0].snapshot.raw.Members}:b.operation==='analysis'?{available:false}:{available:false}});
 await s.context.window.RoyalSosiska.open();s.action('team','1');await settle();assert.match(s.panel.innerHTML,/Темп активности команды/);assert.ok(s.panel.innerHTML.indexOf('&lt;Active&gt;')<s.panel.innerHTML.indexOf('<h4>Idle'));
 s.action('player',undefined,{playerId:'2'});await settle();assert.match(s.panel.innerHTML,/В какое время активнее/);assert.match(s.panel.innerHTML,/Точное время игры неизвестно/);assert.ok(!s.panel.innerHTML.includes('<Active>'));
 for(const id of ['1','2']){s.action('select-team',id);await settle();}const before=s.calls.length;s.action('compare');await settle();assert.match(s.panel.innerHTML,/Общий период/);assert.match(s.panel.innerHTML,/Темп команд/);assert.deepEqual([...new Set(s.calls.slice(before).map(x=>x.teamId))],['1','2']);
 s.action('analysis-selected');await settle();assert.deepEqual(s.calls.find(b=>b.operation==='analysis').teamIds,['1','2']);assert.equal(s.calls.some(b=>['capture','watch'].includes(b.operation)),false);
 s.context.renderPage('home');await s.context.window.RoyalSosiska.open();assert.ok(!s.panel.innerHTML.includes('Сравнение выбранных'));
});
test('AI failure renders actionable text rather than raw internal error code',async()=>{
 const s=setup({responder:b=>b.operation==='team'?{TeamId:'1',TeamName:'Team',Members:[]}:b.operation==='analysisStatus'?{available:true,scope:'team',state:'failed',teams:[{teamId:'1'}],processedSnapshots:5,error:'ANALYSIS_KEYS_REJECTED'}:{watches:[]}});await s.context.window.RoyalSosiska.open();s.action('team','1');await settle();assert.match(s.panel.innerHTML,/отклонил подключённые ключи/);assert.ok(!s.panel.innerHTML.includes('ANALYSIS_KEYS_REJECTED'));
});
test('snapshot view omits unchanged and zero-growth members, retains growth and membership events',async()=>{
 const raw={TeamId:'1',TeamName:'Team',Members:[{UserId:'1',Name:'Idle',Level:100,Crown:0,HelpCount:0}]};
 const record={sequence:2,snapshot:{teamId:'1',capturedAt:'2026-10-13T10:00:00Z',raw},changes:{baseline:false,joined:[{Name:'New member'}],left:[{Name:'Left member'}],members:[{userId:'1',name:'Renamed but idle',changes:[{field:'Name',before:'Old',after:'New'}]},{userId:'2',name:'Active member',changes:[{field:'Level',before:10,after:20,delta:10}]},{userId:'3',name:'Reset member',changes:[{field:'Crown',before:10,after:0,delta:-10}]}]}};
 const s=setup({responder:b=>b.operation==='team'?raw:b.operation==='history'?{records:[record],nextBefore:null}:{watches:[]}});await s.context.window.RoyalSosiska.open();s.action('team','1');await settle();s.action('history');await settle();
 assert.match(s.panel.innerHTML,/Active member/);assert.match(s.panel.innerHTML,/New member/);assert.match(s.panel.innerHTML,/Left member/);for(const name of ['Renamed but idle','Reset member','Без наблюдаемого прироста'])assert.ok(!s.panel.innerHTML.includes(name));
});
test('opening another player replaces the single inline chart and keeps labels readable',async()=>{
 const raw={TeamId:'1',TeamName:'Team',Members:[{UserId:'1',Name:'First',Level:10,Crown:0,HelpCount:0},{UserId:'2',Name:'Second',Level:20,Crown:0,HelpCount:0}]};
 const records=[2,1].map(n=>({sequence:n,snapshot:{teamId:'1',capturedAt:new Date(Date.UTC(2026,9,13,n)).toISOString(),raw:{...raw,Members:raw.Members.map(m=>({...m,Level:m.Level+n}))}},changes:{baseline:n===1}}));
 const s=setup({responder:b=>b.operation==='team'?raw:b.operation==='history'?{records,nextBefore:null}:{watches:[]}});await s.context.window.RoyalSosiska.open();s.action('team','1');await settle();s.action('player',undefined,{playerId:'1'});await settle();assert.match(s.panel.innerHTML,/First · активность/);
 s.action('player',undefined,{playerId:'2'});await settle();assert.equal((s.panel.innerHTML.match(/class="sosiska-player-detail"/g)||[]).length,1);assert.ok(!s.panel.innerHTML.includes('First · активность'));assert.match(s.panel.innerHTML,/Second · активность/);assert.match(s.panel.innerHTML,/В среднем/);assert.match(s.panel.innerHTML,/Значения по интервалам/);assert.equal((s.panel.innerHTML.match(/class="sosiska-hour-cell"/g)||[]).length,24);assert.match(s.panel.innerHTML,/viewBox="0 0 360 295"/);
});

test('team and comparison reports belong to their exact screen and restore by scoped status',async()=>{
 const report=(ids,scope)=>({available:true,scope,state:'done',processedSnapshots:ids.length,summary:{text:'Report '+ids.join(',')},teams:ids.map(teamId=>({teamId,text:'Only '+teamId}))});
 const s=setup({responder:b=>b.operation==='team'?{TeamId:b.teamId,TeamName:'Team '+b.teamId,Members:[]}:b.operation==='list'?{watches:['1','2','3'].map(teamId=>({teamId}))}:b.operation==='analysis'||b.operation==='analysisStatus'?report(b.teamId?[b.teamId]:b.teamIds,b.teamId?'team':'selected'):{records:[],nextBefore:null}});
 await s.context.window.RoyalSosiska.open();assert.ok(!s.panel.innerHTML.includes('Report'));
 s.action('team','1');await settle();assert.match(s.panel.innerHTML,/Report 1/);s.action('analysis');await settle();assert.deepEqual(s.calls.find(b=>b.operation==='analysis'),{operation:'analysis',teamId:'1'});
 s.action('team','2');await settle();assert.match(s.panel.innerHTML,/Report 2/);assert.ok(!s.panel.innerHTML.includes('Only 1'));
 s.action('select-team','1');await settle();assert.ok(!s.panel.innerHTML.includes('Report 2'));
 s.action('select-team','3');await settle();assert.match(s.panel.innerHTML,/Report 1,3/);assert.ok(!s.panel.innerHTML.includes('Only 2'));assert.ok(!s.panel.innerHTML.includes('data-sosiska-action="analysis"'));
 s.action('analysis-selected');await settle();assert.deepEqual(s.calls.filter(b=>b.operation==='analysis').at(-1),{operation:'analysis',teamIds:['1','3']});
 s.action('team','2');await settle();assert.match(s.panel.innerHTML,/Report 2/);assert.ok(!s.panel.innerHTML.includes('Report 1,3'));assert.ok(!s.panel.innerHTML.includes('data-sosiska-action="analysis-selected"'));
 s.action('results');await settle();assert.ok(!s.panel.innerHTML.includes('Report'));
 assert.equal(s.calls.some(b=>['analysis','analysisStatus'].includes(b.operation)&&!b.teamId&&!b.teamIds),false);
});

test('late polling response from previous team cannot overwrite the newly opened report',async()=>{
 let poll,release;
 const report=(id,state='done')=>({available:true,jobId:'00000000-0000-4000-8000-000000000001',scope:'team',state,processedSnapshots:1,summary:{text:'Summary '+id},teams:[{teamId:id,text:'Only '+id}]});
 const s=setup({responder:b=>b.operation==='team'?{TeamId:b.teamId,TeamName:'Team '+b.teamId,Members:[]}:b.operation==='analysisStatus'?(b.jobId?new Promise(r=>{release=r;}):report(b.teamId,b.teamId==='1'?'running':'done')):b.operation==='history'?{records:[],nextBefore:null}:{watches:[]}});
 s.context.setTimeout=(fn,ms)=>{if(ms===5000)poll=fn;return 1;};s.context.clearTimeout=()=>{};
 await s.context.window.RoyalSosiska.open();s.action('team','1');await settle();const pending=poll();await settle();
 s.action('team','2');await settle();assert.match(s.panel.innerHTML,/Summary 2/);
 release(report('1'));await pending;assert.match(s.panel.innerHTML,/Summary 2/);assert.ok(!s.panel.innerHTML.includes('Only 1'));
});


test('clicking a roster member opens detailed native profile and close returns to roster',async()=>{
 const members=[{UserId:'777',Name:'First',Level:100,Crown:5,HelpCount:3},{UserId:'778',Name:'Second',Level:80,Crown:2,HelpCount:0}];
 const s=setup({responder:b=>b.operation==='team'?{TeamId:'1',TeamName:'Team',Members:members}:b.operation==='profile'?{userId:b.userId,name:b.userId==='777'?'First':'Second',level:100,crown:5,joinedAt:'1685577600',teamName:'Team',stats:{totalCrown:'32155',highestCrown:'14244',leagueWins:'10',firstTryWins:'15257',helpsMade:'1046',helpsReceived:'0',areasCompleted:'160',collectionsCompleted:'12',setsCompleted:'199'},fetchedAt:'2026-10-13T20:00:00Z'}:b.operation==='history'?{records:[],nextBefore:null}:{watches:[]}});
 await s.context.window.RoyalSosiska.open();s.action('team','1');await settle();s.action('roster-view');await settle();assert.match(s.panel.innerHTML,/Открыть профиль First/);
 s.action('profile',undefined,{profileId:'777'});await settle();assert.deepEqual(s.calls.find(b=>b.operation==='profile'),{operation:'profile',userId:'777'});
 for(const label of ['Статистика лиги','Всего корон','Больше всего корон','Победы в лигах','Побед с первой попытки','Оказанная помощь','Полученная помощь','Пройдено территорий','Собрано коллекций','Завершено наборов','06.2023'])assert.ok(s.panel.innerHTML.includes(label));assert.match(s.panel.innerHTML,/32\s155/);
 s.action('profile-close');await settle();assert.ok(!s.panel.innerHTML.includes('data-player-profile'));assert.match(s.panel.innerHTML,/Открыть профиль Second/);
 s.action('profile',undefined,{profileId:'778'});await settle();assert.match(s.panel.innerHTML,/<h4>Second<\/h4>/);
 assert.equal(s.calls.some(b=>['watch','capture','analysis'].includes(b.operation)),false);
});
test('failed or mismatched profile never supplies fabricated lifetime statistics',async()=>{
 const s=setup({responder:b=>b.operation==='team'?{TeamId:'1',TeamName:'Team',Members:[{UserId:'777',Name:'Player',Level:100,Crown:4}]}:b.operation==='profile'?{userId:'778',name:'Wrong person',stats:{totalCrown:'999'}}:b.operation==='history'?{records:[],nextBefore:null}:{watches:[]}});
 await s.context.window.RoyalSosiska.open();s.action('team','1');await settle();s.action('profile',undefined,{profileId:'777'});await settle();assert.match(s.panel.innerHTML,/Профиль не соответствует/);assert.ok(!s.panel.innerHTML.includes('Wrong person'));assert.ok(!s.panel.innerHTML.includes('>999<'));assert.match(s.panel.innerHTML,/Повторить загрузку/);
});


test('CRM picker reuses filters, binds decoded ID without list/history/monitor calls and preserves editor',async()=>{
 const t={TeamId:'12',TeamName:'Picked',Leader:'2',CoLeaders:[],Members:[{UserId:'2',Name:'Leader',Level:20,Crown:2}],Type:true,MinLevel:10,MinCrown:0};
 const s=setup({responder:b=>b.operation==='search'?{candidates:[{teamId:'12',name:'Picked'}],warnings:[]}:t});
 s.panel.innerHTML='existing editor';let chosen;
 s.context.window.RoyalSosiska.pickTeam(data=>chosen=data);s.search('Picked');await settle();
 assert.match(s.hosts[0].innerHTML,/Привязать эту команду/);assert.match(s.hosts[0].innerHTML,/Ник лидера содержит/);assert.ok(!s.hosts[0].innerHTML.includes('Выбрать для сравнения'));
 s.filter({scoreMin:'10',leader:'Leader',type:'open'});await settle();s.action('bind','12');await settle();
 assert.equal(chosen.TeamId,'12');assert.equal(s.panel.innerHTML,'existing editor');assert.equal(s.hosts[0].removed,true);
 assert.ok(s.calls.every(c=>['search','team'].includes(c.operation)));
});
test('picker cancellation discards late search results and does not navigate editor',async()=>{
 let release;const pending=new Promise(resolve=>release=resolve),s=setup({responder:()=>pending});s.panel.innerHTML='editor';let selected=false;
 s.context.window.RoyalSosiska.pickTeam(()=>selected=true);s.search('Delayed');await settle();s.action('back');release({candidates:[],warnings:[]});await settle();
 assert.equal(selected,false);assert.equal(s.panel.innerHTML,'editor');assert.equal(s.hosts[0].removed,true);
});

test('Aia tournament group and selected opponents render without automatically capturing or watching',async()=>{
 const roster={TeamId:'10',TeamName:'BOLTAMnet',Description:'Test',Leader:'111',CoLeaders:[],Type:false,Members:[{UserId:'111',Name:'Alice',Level:10,Crown:0,HelpCount:0}]};
 const group={available:true,selectedTeamId:'10',eventId:88,groupId:'20',observedAt:1792245600000,teams:[{teamId:'10',name:'BOLTAMnet',position:1,score:158400},{teamId:'11',name:'<script>opponent</script>',position:2,score:35000}]};
 const players={available:true,teamId:'11',groupId:'20',eventId:88,teamScore:35000,observedAt:1792245600000,playersVerified:true,scoresComplete:false,knownScoreSum:20000,players:[{userId:'555',name:'<b>Bob</b>',score:20000},{userId:'556',name:'Unknown',score:null}]};
 const s=setup({responder:b=>b.operation==='team'?roster:b.operation==='tournamentGroup'?group:b.operation==='tournamentPlayers'?players:b.operation==='history'?{records:[],nextBefore:null}:{watches:[]}});
 await s.context.window.RoyalSosiska.open();s.action('team','10');await settle();assert.equal(s.calls.filter(x=>x.operation==='tournamentGroup').length,0);
 s.action('tournament');await settle();assert.match(s.panel.innerHTML,/группа из 2 команд/);
 assert.ok(!s.panel.innerHTML.includes('<script>opponent</script>'));
 s.action('tournament-players','11');await settle();assert.match(s.panel.innerHTML,/Личные турнирные очки/);
 assert.match(s.panel.innerHTML,/Часть личных очков недоступна/);assert.ok(!s.panel.innerHTML.includes('<b>Bob</b>'));
 assert.equal(s.calls.filter(x=>x.operation==='tournamentPlayers').length,1);
 assert.equal(s.calls.filter(x=>['watch','capture'].includes(x.operation)).length,0);
});
