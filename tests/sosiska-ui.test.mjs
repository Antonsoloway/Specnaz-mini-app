import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../sosiska-v061.js',import.meta.url),'utf8');
const settle=async()=>{for(let i=0;i<8;i++)await new Promise(setImmediate);};
function setup({admin=true,responder}={}){
  const listeners={},docListeners={},tiles=[],calls=[],panel={innerHTML:'',hidden:false},grid={querySelector:()=>tiles.find(x=>!x.removed)||null,appendChild:b=>tiles.push(b)};
  const document={querySelector:s=>s==='.grid'?grid:s==='[data-sosiska-interval]'?{value:'120'}:null,getElementById:()=>panel,createElement:()=>({dataset:{},remove(){this.removed=true;}}),addEventListener:(type,fn)=>{docListeners[type]=fn;}};
  const context={document,authState:{role:{isChatAdmin:admin}},sessionToken:'session-a',activePage:'home',setActiveNav(){},renderPage(page){panel.innerHTML=page;},FormData:class{constructor(form){this.form=form;}get(){return this.form.query;}},Response,AbortController,setTimeout,clearTimeout,console,fetch:async(url,init)=>{const b=JSON.parse(init.body);calls.push(b);return Response.json({ok:true,data:await (responder?responder(b):{watches:[]})});}};
  context.window={addEventListener:(type,fn)=>{listeners[type]=fn;},RoyalNav:{pushCurrent(){}},RoyalAdminDataV0600:{subscribe(fn){listeners.adminClear=fn;}}};vm.createContext(context);vm.runInContext(source,context);
  const action=(name,id)=>listeners.click({target:{closest:s=>s==='[data-sosiska-action]'?{dataset:{sosiskaAction:name,teamId:id}}:null},preventDefault(){},stopImmediatePropagation(){}});
  const search=query=>docListeners.submit({target:{query,matches:()=>true,querySelector:()=>({blur(){}})},preventDefault(){},stopImmediatePropagation(){}});
  return {context,tiles,calls,panel,action,search,listeners};
}
test('tile only appears for admins and opening lists watches without enabling any',async()=>{
  const denied=setup({admin:false});assert.equal(denied.tiles.length,0);await denied.context.window.RoyalSosiska.open();assert.equal(denied.calls.length,0);
  const s=setup();assert.equal(s.tiles.length,1);await s.context.window.RoyalSosiska.open();assert.deepEqual(s.calls,[{operation:'list'},{operation:'analysisStatus'}]);assert.match(s.panel.innerHTML,/Отслеживание не включено/);
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
  const s=setup({responder:b=>b.operation==='team'?{TeamId:'1',TeamName:'Team',Members:[]}:b.operation==='analysis'?{available:true,state:'done',processedSnapshots:30,summary:{text:'<b>Untrusted</b>'},teams:[{teamId:'1',teamName:'Team',count:30,text:'Report',from:'2026-10-11T19:00:00Z',to:'2026-10-11T20:00:00Z'}]}:{watches:[]}});await s.context.window.RoyalSosiska.open();s.action('team','1');await settle();assert.equal(s.calls.filter(x=>x.operation==='analysis').length,0);s.action('analysis');await settle();assert.match(s.panel.innerHTML,/&lt;b&gt;Untrusted/);
});
test('global analysis includes all tracked teams without requiring an open card',async()=>{
  const s=setup({responder:b=>b.operation==='list'?{watches:[{teamId:'1',intervalMinutes:60},{teamId:'2',intervalMinutes:120}]}:b.operation==='analysis'?{available:true,state:'done',processedSnapshots:130,summary:{text:'All teams'},teams:[{teamId:'1',teamName:'First',count:127,text:'Early and late',from:'2026-10-01',to:'2026-10-11'},{teamId:'2',teamName:'Second',count:3,text:'Other history',from:'2026-10-09',to:'2026-10-11'}]}:{available:false}});
  await s.context.window.RoyalSosiska.open();s.action('analysis-all');await settle();assert.deepEqual(s.calls.find(b=>b.operation==='analysis'),{operation:'analysis'});assert.match(s.panel.innerHTML,/130/);assert.match(s.panel.innerHTML,/Early and late/);assert.match(s.panel.innerHTML,/Other history/);assert.equal(s.calls.filter(b=>['watch','capture'].includes(b.operation)).length,0);
});
