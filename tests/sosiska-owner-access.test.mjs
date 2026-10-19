import test from 'node:test';
import assert from 'node:assert/strict';
import {createTeamLive} from '../worker/src/team-live.js';
import {createSosiskaApi} from '../worker/src/sosiska-api.js';
import {restrictSosiskaData,isSosiskaOwner} from '../worker/src/sosiska-access.js';
import {createPeriodAccumulator} from '../worker/src/sosiska-period.js';
import {prepareHistoryExport,downloadHistoryExport} from '../worker/src/sosiska-export.js';
const owner={telegramId:'1456874273'},other={telegramId:'777',username:'AnSoloway',role:'owner'};
const env={RM_AGENT_API_KEY:'test-key'.repeat(8),RK_AGENT_API_KEY:'rk-test-key'.repeat(8),SESSION_SECRET:'fixture-export-key'};
const req=body=>new Request('https://api.test/admin-agent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const privateData={HelpCount:999,weeklyHelp:888,stats:{helpsMade:777},tournament:{secret:'event-canary'},changes:[{field:'HelpCount',delta:99},{field:'Level',delta:2}],level:100};
test('only the immutable verified Telegram ID grants advanced metrics',()=>{assert.equal(isSosiskaOwner(owner),true);for(const p of [other,{},undefined,{telegramId:'1456874273x'}])assert.equal(isSosiskaOwner(p),false);});
test('deep redaction preserves identity and level changes, never mutates shared cached data',()=>{const out=restrictSosiskaData(privateData);assert.deepEqual(out,{stats:{},changes:[{field:'Level',delta:2}],level:100});assert.equal(privateData.HelpCount,999);assert.equal(restrictSosiskaData(privateData,true),privateData);});
for(const game of ['rm','rk']){
 test(game+' other admin cannot request events or forge owner scope',async()=>{
  let calls=0;const handle=createSosiskaApi({authorizeAdmin:async()=>other,fetchAgent:async()=>{calls++;throw Error();}});
  for(const operation of ['tournamentGroup','tournamentPlayers']){const r=await handle(req({game,operation,teamId:'1'}),env);assert.equal(r.status,403);assert.equal((await r.json()).error,'OWNER_REQUIRED');}
  assert.equal((await handle(req({operation:'team',game,teamId:'1',ownerMetrics:true}),env)).status,400);assert.equal(calls,0);
 });
 test(game+' history and old job IDs use restricted namespace and strip all structured private data',async()=>{
  const names=[],scopes=[];const binding={idFromName:n=>(names.push(n),n),get:()=>({fetch:async(_,init)=>{scopes.push(init.headers['X-Sosiska-Metrics-Scope']);return Response.json({ok:true,data:privateData});}})};
  const handle=createSosiskaApi({authorizeAdmin:async()=>other,fetchAgent:async()=>Response.json({ok:true,data:privateData})});
  const e={...env,SOSISKA_RK_MONITOR:binding,SOSISKA_RK_ANALYSIS:binding,SOSISKA_ANALYSIS:binding};
  for(const body of [{operation:'history',teamId:'1'},{operation:'analysisStatus',jobId:'00000000-0000-4000-8000-000000000001'}]){
   const r=await handle(req({game,...body}),e),d=await r.json();assert.equal(r.status,200);assert.equal(d.capabilities.ownerTeamMetrics,false);assert.doesNotMatch(JSON.stringify(d),/HelpCount|weeklyHelp|helpsMade|event-canary|999|888|777/);
  }
  assert.ok(names.includes(game==='rk'?'kingdom-basic-full-history-v2':'basic-full-history-v2'));assert.ok(scopes.includes('basic'));
 });
 test(game+' owner receives full data and original analysis namespace',async()=>{
  const names=[];const binding={idFromName:n=>(names.push(n),n),get:()=>({fetch:async()=>Response.json({ok:true,data:privateData})})};
  const handle=createSosiskaApi({authorizeAdmin:async()=>owner});
  const d=await (await handle(req({game,operation:'analysisStatus'}),{...env,SOSISKA_ANALYSIS:binding,SOSISKA_RK_ANALYSIS:binding})).json();
  assert.equal(d.capabilities.ownerTeamMetrics,true);assert.equal(d.data.HelpCount,999);assert.ok(names.includes(game==='rk'?'kingdom-full-history-v1':'full-history-v1'));
 });
}
test('help-only growth never increases restricted activity or ranking',()=>{
 const acc=createPeriodAccumulator('1',{includeHelp:false});
 for(const [n,help] of [[2,9999],[1,0]])acc.add({sequence:n,snapshot:{teamId:'1',capturedAt:`2026-10-19T0${n}:00:00.000Z`,raw:{Members:[{UserId:'1',Name:'Player',Level:100,Crown:0,HelpCount:help}]}},changes:{baseline:n===1}});
 const p=acc.result();assert.equal(p.series[0].active,0);assert.equal(p.players[0].helpGain,0);
});
test('basic export projects every record; full download requires verified owner, including HEAD',async()=>{
 const body={teamId:'1',from:'2026-10-18T00:00:00.000Z',to:'2026-10-20T00:00:00.000Z'},now=Date.now();
 const upstream=async()=>Response.json({ok:true,data:{records:[{snapshot:{capturedAt:'2026-10-19T00:00:00.000Z',...privateData}}],nextBefore:null}});
 const basic=await prepareHistoryExport(new Request('https://api.test/admin-agent'),env,body,now,false);
 const out=await (await downloadHistoryExport(new Request(basic.url),env,upstream,now)).json();assert.doesNotMatch(JSON.stringify(out),/HelpCount|event-canary|999/);
 const full=await prepareHistoryExport(new Request('https://api.test/admin-agent'),env,body,now,true);
 for(const method of ['GET','HEAD'])assert.equal((await downloadHistoryExport(new Request(full.url,{method}),env,upstream,now,async()=>other)).status,403);
 const allowed=await downloadHistoryExport(new Request(full.url),env,upstream,now,async()=>owner);assert.equal((await allowed.json()).records[0].snapshot.HelpCount,999);
});

test('shared linked-card cache retains owner data but cannot leak it across accounts',async()=>{
 let principal=owner,calls=0;
 const handle=createTeamLive({authorizeMetrics:async()=>principal,crm:async()=>Response.json({snapshot:{teams:[{name:'Team',game:'Royal Match',gameTeamId:'1'}]}}),fetchAgent:async()=>{calls++;return Response.json({ok:true,data:{Status:0,TeamId:'1',TeamName:'Team',Leader:'2',Members:[{UserId:'2',Name:'Leader',Level:100,Crown:1,HelpCount:333}]}});}});
 const request=()=>new Request('https://api.test/team-live?team=Team&game=Royal+Match');
 assert.equal((await (await handle(request(),env)).json()).data.leadership[0].help,333);
 principal=other;assert.doesNotMatch(await (await handle(request(),env)).text(),/weeklyHelp|"help"|333/);
 principal=owner;assert.equal((await (await handle(request(),env)).json()).data.leadership[0].help,333);assert.equal(calls,1);
});
