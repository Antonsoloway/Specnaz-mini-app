import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createTeamLive,leadership,projectTeam} from '../worker/src/team-live.js';
const env={FRONTEND_ORIGIN:'https://app.invalid',RM_AGENT_API_KEY:'test-private-key-'.repeat(4)};
const members=Array.from({length:8},(_,i)=>({UserId:String(i+1),Name:'Player '+(i+1),Level:100+i,Crown:i,HelpCount:i}));
const team={Status:0,TeamId:'12',TeamName:'<Team>',Description:'About',Leader:'4',CoLeaders:['2','4','2','8','1','5'],Members:members,MinLevel:100,MinCrown:10,Type:true};
const request=(path='/team-live',query='team=CRM&game=Royal+Match')=>new Request('https://api.invalid'+path+'?'+query,{headers:{Origin:env.FRONTEND_ORIGIN,Authorization:'Bearer fixture'}});
function setup(){let time=100000,calls=0,authCalls=0,denied=0,fail=false,linked=true;const operations=[];
 const handle=createTeamLive({now:()=>time,crm:async r=>{authCalls++;if(denied)return Response.json({ok:false},{status:denied});const teams=[{name:'CRM',game:'Royal Match',...(linked?{gameTeamId:'12'}:{})}];return Response.json({ok:true,...(new URL(r.url).pathname==='/admin-data'?{adminData:{teams}}:{snapshot:{teams}})});},fetchAgent:async(_,init)=>{calls++;operations.push(JSON.parse(init.body));if(fail)throw Error(env.RM_AGENT_API_KEY);return Response.json({ok:true,data:team});}});
 return {handle,operations,get calls(){return calls},get authCalls(){return authCalls},advance:n=>time+=n,deny:n=>denied=n,fail:()=>fail=true,unlink:()=>linked=false};
}
test('leadership is leader first, unique, current roster only and at most four',()=>{
 assert.deepEqual(leadership(team).map(m=>[m.userId,m.role]),[['4','Лидер'],['2','Помощник'],['8','Помощник'],['1','Помощник']]);
 assert.deepEqual(leadership({...team,CoLeaders:[]}).map(m=>m.userId),['4']);
 assert.deepEqual(leadership({...team,Leader:'99',CoLeaders:['98'] }),[]);
 assert.equal(projectTeam(team,'now').score,members.reduce((sum,m)=>sum+m.Level+m.Crown,0));
});
test('linked member and admin reads only invoke getTeamInfo, never monitor',async()=>{
 const s=setup();for(const path of ['/team-live','/admin-team-live'])assert.equal((await s.handle(request(path),env)).status,200);
 assert.equal(s.calls,1);assert.equal(s.authCalls,2);assert.deepEqual(s.operations,[{protocolVersion:1,operation:'getTeamInfo',payload:{teamId:'12',includeMembers:true}}]);
});
test('cache never bypasses revocation or unlink',async()=>{
 const s=setup();await s.handle(request(),env);s.deny(403);assert.equal((await s.handle(request(),env)).status,403);assert.equal(s.calls,1);
 s.deny(0);s.unlink();assert.equal((await s.handle(request(),env)).status,404);assert.equal(s.calls,1);
});
test('unbound IDs and other games cannot be queried by ordinary users',async()=>{
 const s=setup();for(const query of ['team=CRM&game=Royal+Kingdom','team=CRM&game=Royal+Match&teamId=12','team=Missing&game=Royal+Match'])assert.ok((await s.handle(request('/team-live',query),env)).status>=400);
 assert.equal(s.calls,0);
});
test('expired cache falls back to explicitly stale data, expires after 24 hours and omits keys',async()=>{
 const s=setup();await s.handle(request(),env);s.advance(61000);s.fail();const r=await s.handle(request(),env),body=await r.json();assert.equal(body.data.stale,true);assert.equal(body.data.fetchedAt,new Date(100000).toISOString());
 s.advance(86400000);const bad=await s.handle(request(),env);assert.equal(bad.status,502);assert.ok(!(await bad.text()).includes(env.RM_AGENT_API_KEY));
});
test('simultaneous opens coalesce and upstream mismatched identity never renders',async()=>{
 const s=setup();await Promise.all([s.handle(request(),env),s.handle(request(),env)]);assert.equal(s.calls,1);
 const bad=createTeamLive({authorizeMetrics:async()=>({telegramId:'1456874273'}),crm:async()=>Response.json({snapshot:{teams:[{name:'CRM',game:'Royal Match',gameTeamId:'12'}]}}),fetchAgent:async()=>Response.json({ok:true,data:{...team,TeamId:'13'}})});
 assert.equal((await bad(request(),env)).status,502);
});
test('bad origin rejected before CRM/agent; preflight and methods bounded',async()=>{
 const s=setup();assert.equal((await s.handle(new Request(request(),{headers:{Origin:'https://bad.invalid'}}),env)).status,403);assert.equal(s.authCalls,0);
 assert.equal((await s.handle(new Request(request(),{method:'OPTIONS'}),env)).status,204);
 assert.equal((await s.handle(new Request(request(),{method:'POST'}),env)).status,405);
});
const helper=await readFile(new URL('../apps-script/team-live/38_MINIAPP_TEAM_LIVE.js',import.meta.url),'utf8');
function sheetSetup(header='',occupied=false){let written=[];const sheet={getMaxRows:()=>5,getRange:(r,c,n=1)=>({getDisplayValue:()=>header,getDisplayValues:()=>Array.from({length:n},()=>[occupied?'occupied':'']),getFormulas:()=>Array.from({length:n},()=>['']),setValue:v=>{written.push([r,c,v]);if(r===1)header=v;return sheet.getRange(r,c,n)},setNumberFormat:()=>sheet.getRange(r,c,n),clearContent:()=>written.push([r,c,'clear'])})};
 const context={MINIAPP_adminWriteError_:(error,message)=>({ok:false,error,message})};vm.createContext(context);vm.runInContext(helper,context);return {sheet,context,written};}
test('Sheet ID is text int64, game scoped and occupied columns are protected',()=>{
 const s=sheetSetup();for(const id of ['0','01','-1','1e3','9223372036854775808',12])assert.equal(s.context.MINIAPP_teamLivePrepare_(s.sheet,'Royal Match',{gameTeamId:id},'').ok,false);
 assert.equal(s.context.MINIAPP_teamLivePrepare_(s.sheet,'Other Game',{gameTeamId:'12'},'').ok,false);assert.equal(s.written.length,0);
 assert.equal(s.context.MINIAPP_teamLivePrepare_(s.sheet,'Royal Match',{gameTeamId:'9223372036854775807'},'').ok,true);assert.deepEqual(s.written,[[1,13,'ID команды RM']]);
 for(const x of [sheetSetup('Existing'),sheetSetup('',true)]){assert.equal(x.context.MINIAPP_teamLivePrepare_(x.sheet,'Royal Match',{gameTeamId:'12'},'').ok,false);assert.equal(x.written.length,0);}
});
test('unrelated CRM operations never clear occupied M; blank unlinks only owned column',()=>{
 const s=sheetSetup('Other');s.context.MINIAPP_teamLiveWriteId_(s.sheet,2,'');s.context.MINIAPP_teamLiveClearId_(s.sheet,2);assert.equal(s.written.length,0);
 const owned=sheetSetup('ID команды RM');const link=owned.context.MINIAPP_teamLivePrepare_(owned.sheet,'Royal Match',{gameTeamId:''},'12');assert.equal(link.changed,true);owned.context.MINIAPP_teamLiveWriteId_(owned.sheet,2,link.id);assert.deepEqual(owned.written,[[2,13,'']]);
});
test('new card escapes server text and cannot display ordinary roster',async()=>{
 const source=await readFile(new URL('../team-live-v061.js',import.meta.url),'utf8');const context={document:{getElementById:()=>null,addEventListener(){},body:{}},window:{addEventListener(){}},MutationObserver:class{observe(){}},console};vm.createContext(context);vm.runInContext(source,context);
 for(const game of ['Royal Match','Royal Kingdom'])assert.doesNotMatch(context.window.RoyalTeamLive.card({...projectTeam(team,'now'),game,weeklyHelp:913}),/помощь/i);
 const html=context.window.RoyalTeamLive.card(projectTeam(team,'now'));assert.ok(html.includes('&lt;Team&gt;'));assert.equal((html.match(/class="team-live-player"/g)||[]).length,4);assert.ok(!html.includes('Player 3'));assert.ok(html.indexOf('Player 4')<html.indexOf('Player 2'));
});
async function writesFixture() {
 const rows=[Array(13).fill(''),['Royal Match','CRM','original photo','CRM caption',0,0,0,0,0,0,0,'Неактивен','12'],Array(13).fill('')];rows[0][12]='ID команды RM';
 const sheet={getMaxRows:()=>rows.length,getRange:(r,c,n=1,w=1)=>({getDisplayValue:()=>String(rows[r-1]?.[c-1]??''),getDisplayValues:()=>Array.from({length:n},(_,i)=>Array.from({length:w},(_,j)=>String(rows[r+i-1]?.[c+j-1]??''))),getFormulas:()=>Array.from({length:n},()=>Array(w).fill('')),setValue:v=>{rows[r-1][c-1]=v;return sheet.getRange(r,c,n,w)},setNumberFormat:()=>sheet.getRange(r,c,n,w),clearContent:()=>{for(let i=0;i<n;i++)for(let j=0;j<w;j++)rows[r+i-1][c+j-1]='';}})};
 const journals=[];const context={SpreadsheetApp:{flush(){}},SHEET_TEAMS:'Команды',console};vm.createContext(context);
 for(const name of ['29_MINIAPP_ADMIN_WRITE.js','33_MINIAPP_ADMIN_WRITE_FINAL.js','38_MINIAPP_TEAM_LIVE.js'])vm.runInContext(await readFile(new URL('../apps-script/team-live/'+name,import.meta.url),'utf8'),context);
 Object.assign(context,{MINIAPP_adminWriteCanonicalGame_:v=>String(v||''),MINIAPP_adminWriteValue_:v=>String(v??''),MINIAPP_adminWriteSha256_:v=>v,MINIAPP_adminWriteHardenedTeamName_:v=>v,MINIAPP_adminWriteHardenedSetTeamLeader_:(s,r,v)=>s.getRange(r,4).setValue(v),MINIAPP_adminWriteHardenedAppendJournal_:(...args)=>journals.push(args),MINIAPP_adminTeamPhotoPrepareUpload_:()=>({ok:true,changed:false}),MINIAPP_adminTeamPhotoMarkDirty_:()=>{},MINIAPP_adminTeamPhotoSummary_:()=>null,MINIAPP_adminWriteFindTeamRow_:(s,name,game)=>{const index=rows.findIndex((r,i)=>i>0&&r[1]===name&&r[0]===game);return index<0?0:index+1;},MINIAPP_adminWriteFindEmptyTeamRow_:()=>3,MINIAPP_adminWriteNumberOrText_:v=>v,MINIAPP_adminWriteError_:(error,message)=>({ok:false,error,message}),MINIAPP_adminWriteConflict_:(error,message)=>({ok:false,error,message})});
 const ss={getSheetByName:()=>sheet};return {context,rows,journals,ctx:(op,payload)=>({ss,op,payload,requestId:'fixture'})};
}
test('real Sheet update keeps photo, preserves ID during rename and journals the new revision',async()=>{
 const s=await writesFixture(),c=s.context;
 const before=c.MINIAPP_adminWriteTeamRecord_({getRange:()=>({getDisplayValues:()=>[s.rows[1]],getDisplayValue:()=> 'ID команды RM'})},2);
 const revision=c.MINIAPP_adminWriteTeamRevision_(before);
 c.MINIAPP_adminTeamPhotoPrepareExistingForRename_=()=>({ok:true,changed:false});
 const result=c.MINIAPP_adminWriteFinalUpdateTeam_(s.ctx('updateTeam',{name:'CRM',game:'Royal Match',expectedRevision:revision,changes:{name:'Edited name',gameTeamId:'22'}}));
 assert.equal(result.ok,true);assert.equal(result.record.gameTeamId,'22');assert.equal(s.rows[1][2],'original photo');assert.equal(result.previousEntityKey,'Royal Match :: CRM');assert.equal(s.journals.length,1);
 const stale=c.MINIAPP_adminWriteFinalUpdateTeam_(s.ctx('updateTeam',{name:'Edited name',game:'Royal Match',expectedRevision:revision,changes:{gameTeamId:'33'}}));assert.equal(stale.ok,false);assert.equal(s.rows[1][12],'22');
});
test('real Sheet create writes text ID and rejects unsupported game before changing cells',async()=>{
 const s=await writesFixture(),c=s.context;const bad=c.MINIAPP_adminWriteFinalCreateTeam_(s.ctx('createTeam',{game:'Unsupported',name:'New',gameTeamId:'22'}));assert.equal(bad.ok,false);assert.equal(s.rows[2][1],'');
 const result=c.MINIAPP_adminWriteFinalCreateTeam_(s.ctx('createTeam',{game:'Royal Match',name:'New',gameTeamId:'22'}));assert.equal(result.ok,true);assert.equal(result.record.gameTeamId,'22');assert.equal(s.rows[2][12],'22');assert.equal(typeof s.rows[2][12],'string');
});


test('standalone snapshot attaches IDs using the explicit CRM spreadsheet',()=>{
 const s=sheetSetup('ID команды RM');
 s.context.SPREADSHEET_ID='fixture-CRM';
 s.context.SHEET_TEAMS='Команды';
 s.context.SpreadsheetApp={openById:id=>{assert.equal(id,'fixture-CRM');return {getSheetByName:name=>{assert.equal(name,'Команды');return {getLastRow:()=>2,getRange:(r)=>r===1?{getDisplayValue:()=> 'ID команды RM'}:{getDisplayValues:()=>[['Royal Match','CRM','','','','','','','','','','','12']]}}}};}};
 s.context.MINIAPP_adminWriteCanonicalGame_=v=>v;
 s.context.MINIAPP_snapshotStripGameSuffix_=v=>v;
 s.context.MINIAPP_snapshotTeamKey_=(name,game)=>name+'|'+game;
 const snapshot={teams:[{name:'CRM',game:'Royal Match'},{name:'CRM',game:'Royal Kingdom'}]};
 s.context.MINIAPP_teamLiveAttach_(snapshot);assert.equal(snapshot.teams[0].gameTeamId,'12');assert.equal(snapshot.teams[1].gameTeamId,undefined);
});

test('bounded game reads release singleflight on ignored abort and stalled JSON; late result cannot replace newer cache',async()=>{
 for(const bodyStall of [false,true]){
  let time=100000,mode='hang',finish,calls=0;
  const handle=createTeamLive({now:()=>time,agentTimeoutMs:15,crm:async()=>Response.json({snapshot:{teams:[{name:'CRM',game:'Royal Match',gameTeamId:'12'}]}}),fetchAgent:async()=>{
   calls++;if(mode==='good')return Response.json({ok:true,data:{...team,TeamName:'Current'}});
   const p=new Promise(r=>finish=r);return bodyStall?{ok:true,json:()=>p}:p;
  }});
  const responses=await Promise.all([handle(request(),env),handle(request(),env)]);assert.ok(responses.every(r=>r.status===502));assert.equal(calls,1);
  mode='good';assert.equal((await (await handle(request(),env)).json()).data.name,'Current');assert.equal(calls,2);
  finish(bodyStall?{ok:true,data:{...team,TeamName:'Late'}}:Response.json({ok:true,data:{...team,TeamName:'Late'}}));await new Promise(r=>setTimeout(r,5));
  assert.equal((await (await handle(request(),env)).json()).data.name,'Current');assert.equal(calls,2);
 }
});
test('CRM authorization headers and body have a deadline and never bypass access checks with stale game data',async()=>{
 for(const bodyStall of [false,true]){
  let hang=false,calls=0,time=100000;
  const handle=createTeamLive({now:()=>time,authTimeoutMs:15,crm:()=>hang?(bodyStall?{ok:true,json:()=>new Promise(()=>{})}:new Promise(()=>{})):Response.json({snapshot:{teams:[{name:'CRM',game:'Royal Match',gameTeamId:'12'}]}}),fetchAgent:async()=>{calls++;return Response.json({ok:true,data:team});}});
  assert.equal((await handle(request(),env)).status,200);hang=true;time+=61000;
  assert.equal((await handle(request(),env)).status,502);assert.equal(calls,1,'no game read or stale response before current authorization');
 }
});

test('busy agent preserves an authorized saved response and returns a bounded busy signal when no saved data exists',async()=>{
 let busy=true,time=100000,calls=0;
 const handle=createTeamLive({now:()=>time,crm:async()=>Response.json({snapshot:{teams:[{name:'CRM',game:'Royal Match',gameTeamId:'12'}]}}),fetchAgent:async()=>{calls++;return busy?Response.json({ok:false,errorCode:'ROYAL_MATCH_AGENT_BUSY'},{status:429}):Response.json({ok:true,data:team});}});
 const response=await handle(request(),env);assert.equal(response.status,429);assert.equal((await response.json()).error,'TEAM_LIVE_BUSY');assert.equal(calls,1);
 busy=false;assert.equal((await handle(request(),env)).status,200);time+=61000;busy=true;
 const saved=await (await handle(request(),env)).json();assert.equal(saved.data.stale,true);assert.equal(saved.data.teamId,'12');
});


const kingdom={...team,TeamLogo:183,Star:5,Score:764030,MinCup:8000,IsOpen:false,
 Members:members.map(m=>({...m,Cup:m.Crown+1000}))};
test('RK linked cards route to RK with a separate credential and isolate identical RM/RK IDs and singleflight',async()=>{
 const mixedEnv={...env,RK_AGENT_API_KEY:'kingdom-private-key'.repeat(4)},calls=[];
 let denied=false;
 const handle=createTeamLive({authorizeMetrics:async()=>({telegramId:'1456874273'}),crm:async()=>denied?Response.json({}, {status:403}):Response.json({snapshot:{teams:['Royal Match','Royal Kingdom'].map(game=>({name:'CRM',game,gameTeamId:'12'}))}}),fetchAgent:async(url,init)=>{
  const rk=url.includes('kingdom');assert.equal(init.headers.Authorization,'Bearer '+mixedEnv[rk?'RK_AGENT_API_KEY':'RM_AGENT_API_KEY']);calls.push(url);
  assert.deepEqual(JSON.parse(init.body),{protocolVersion:1,operation:'getTeamInfo',payload:{teamId:'12',includeMembers:true}});
  return Response.json({ok:true,data:rk?kingdom:team});
 }});
 const rkRequest=request('/team-live','team=CRM&game=Royal+Kingdom');
 const [rm,rk]=await Promise.all([handle(request(),mixedEnv),handle(rkRequest,mixedEnv)]);
 const rmData=(await rm.json()).data,rkData=(await rk.json()).data;
 assert.equal(rmData.game,'Royal Match');assert.equal(rkData.game,'Royal Kingdom');
 assert.equal(rkData.logo,183);assert.equal(rkData.minCrowns,8000);assert.equal(rkData.type,'Закрытая');assert.equal(rkData.star,5);
 assert.equal(rkData.weeklyHelp,28);assert.equal(rkData.score,764030);
 assert.deepEqual(rkData.leadership.map(m=>m.userId),['4','2','8','1']);assert.equal(rkData.leadership[0].crowns,1003);
 await handle(rkRequest,mixedEnv);await handle(request(),mixedEnv);assert.equal(calls.length,2);
 denied=true;assert.equal((await handle(rkRequest,mixedEnv)).status,403);assert.equal(calls.length,2);
});
test('RK requires its own key, rejects wrong team and never uses RM emblem range or key as fallback',async()=>{
 assert.equal(projectTeam({...team,TeamLogo:183},'now').logo,null);
 for(const data of [{...kingdom,TeamId:'13'},{...kingdom,Status:1},{...kingdom,Members:[kingdom.Members[0],kingdom.Members[0]]}]){
  const h=createTeamLive({authorizeMetrics:async()=>({telegramId:'1456874273'}),crm:async()=>Response.json({snapshot:{teams:[{name:'CRM',game:'Royal Kingdom',gameTeamId:'12'}]}}),fetchAgent:async()=>Response.json({ok:true,data})});
  assert.equal((await h(request('/team-live','team=CRM&game=Royal+Kingdom'),{...env,RK_AGENT_API_KEY:env.RM_AGENT_API_KEY})).status,502);
 }
 let calls=0;const h=createTeamLive({authorizeMetrics:async()=>({telegramId:'1456874273'}),crm:async()=>Response.json({snapshot:{teams:[{name:'CRM',game:'Royal Kingdom',gameTeamId:'12'}]}}),fetchAgent:async()=>{calls++;throw Error('wrong agent');}});
 assert.equal((await h(request('/team-live','team=CRM&game=Royal+Kingdom'),env)).status,502);assert.equal(calls,0);
});
test('RK sheet links create, update, unlink and rename with revisions and original screenshots intact',async()=>{
 const s=await writesFixture(),c=s.context;
 const created=c.MINIAPP_adminWriteFinalCreateTeam_(s.ctx('createTeam',{game:'Royal Kingdom',name:'RK',gameTeamId:'9223372036854775807'}));
 assert.equal(created.ok,true);assert.equal(created.record.gameTeamId,'9223372036854775807');assert.equal(s.rows[2][12],'9223372036854775807');
 c.MINIAPP_adminTeamPhotoPrepareExistingForRename_=()=>({ok:true,changed:false});
 const updated=c.MINIAPP_adminWriteFinalUpdateTeam_(s.ctx('updateTeam',{name:'RK',game:'Royal Kingdom',expectedRevision:c.MINIAPP_adminWriteTeamRevision_(created.record),changes:{name:'RK new',gameTeamId:'42'}}));
 assert.equal(updated.ok,true);assert.equal(updated.record.gameTeamId,'42');assert.equal(s.rows[1][12],'12');assert.equal(s.rows[1][2],'original photo');
 const cleared=c.MINIAPP_adminWriteFinalUpdateTeam_(s.ctx('updateTeam',{name:'RK new',game:'Royal Kingdom',expectedRevision:c.MINIAPP_adminWriteTeamRevision_(updated.record),changes:{gameTeamId:''}}));
 assert.equal(cleared.ok,true);assert.equal(s.rows[2][12],'');
});
test('RK public snapshot ID attachment is scoped by game for same-named CRM teams',()=>{
 const s=sheetSetup('ID команды RM');Object.assign(s.context,{SPREADSHEET_ID:'crm',SHEET_TEAMS:'Команды',MINIAPP_adminWriteCanonicalGame_:v=>v,MINIAPP_snapshotStripGameSuffix_:v=>v,MINIAPP_snapshotTeamKey_:(n,g)=>n+'|'+g,
 SpreadsheetApp:{openById:()=>({getSheetByName:()=>({getLastRow:()=>3,getRange:r=>r===1?{getDisplayValue:()=> 'ID команды RM'}:{getDisplayValues:()=>['Royal Match','Royal Kingdom'].map((g,i)=>[g,'Same','','','','','','','','','','',String(12+i)])}})})}});
 const snapshot={teams:['Royal Match','Royal Kingdom'].map(game=>({name:'Same',game}))};s.context.MINIAPP_teamLiveAttach_(snapshot);
 assert.deepEqual(snapshot.teams.map(t=>t.gameTeamId),['12','13']);
});
