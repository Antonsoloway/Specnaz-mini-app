import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeKingdomTeam,createKingdomMonitor} from '../worker/src/sosiska-rk-monitor.js';
import {createSosiskaApi,validateAgentAction} from '../worker/src/sosiska-api.js';
import {readKingdomStatus} from '../worker/src/agent-status.js';

const rkTeam=(level=10)=>({Status:0,TeamId:'100',TeamName:'RK team',TeamLogo:3,
 Leader:'201',CoLeaders:[],Description:'We play',MinLevel:5,MinCup:0,
 IsOpen:true,Score:60000,Members:[{UserId:'201',Name:'A',Level:level,Cup:123,HelpCount:8}]});
const rkClash={game:'rk',available:true,eventType:'teamClash',eventId:109,
 groupId:'30680773535207044',observedAt:'2026-10-18T12:00:00.000Z',personalTeamId:'100',
 personalResults:[{userId:'201',name:'A',score:54}],
 teams:[{teamId:'100',name:'RK team',score:560},{teamId:'101',name:'Rival',score:550}]};
const env={FRONTEND_ORIGIN:'https://antonsoloway.github.io',RM_AGENT_API_KEY:'M'.repeat(64),
 RK_AGENT_API_KEY:'K'.repeat(64),RK_EVENT_API_KEY:'E'.repeat(64)};
const req=body=>new Request('https://invalid/admin-agent',{method:'POST',headers:{'Content-Type':'application/json',Origin:env.FRONTEND_ORIGIN,Authorization:'Bearer sample'},body:JSON.stringify(body)});
function fakeStorage(){const map=new Map();let when=null;
 return {map,async get(k){return structuredClone(map.get(k));},async put(k,v){map.set(k,structuredClone(v));},
 async deleteAlarm(){when=null;},async setAlarm(v){when=v;},alarm(){return when;}};}
test('RK conversion preserves native team score, cups, no fabricated crowns or loss of identity',()=>{
 const t=normalizeKingdomTeam(rkTeam());
 assert.equal(t.TeamId,'100');assert.equal(t.Score,60000);
 assert.equal(t.Members[0].Cup,123);assert.equal(t.Members[0].Crown,123);
 assert.equal(t.Members[0].HelpCount,8);assert.equal(t.MinCrown,0);assert.equal(t.Type,true);
 assert.throws(()=>normalizeKingdomTeam({...rkTeam(),Members:[rkTeam().Members[0],rkTeam().Members[0]]}),/RK_TEAM_INVALID/);
});
test('RK personal unknown outside aia team remains unavailable, cannot invent opponents score',async()=>{
 const calls=[];
 const fetchAgent=async(url,init)=>{
  calls.push({url,body:JSON.parse(init.body)});
  return Response.json({ok:true,data:rkClash});
 };
 const handle=createSosiskaApi({authorizeAdmin:async()=>{},fetchAgent});
 const response=await handle(req({operation:'tournamentGroup',game:'rk',teamId:'101'}),env);
 assert.equal(response.status,200);
 const d=(await response.json()).data;assert.equal(d.available,true);assert.equal(d.teams.length,2);assert.equal(d.teams[1].score,550);
 const foreign=await handle(req({operation:'tournamentPlayers',game:'rk',teamId:'101'}),env);
 assert.deepEqual((await foreign.json()).data,{available:false,reason:'OPPONENT_PERSONAL_UNAVAILABLE',teamId:'101'});
 const own=await handle(req({operation:'tournamentPlayers',game:'rk',teamId:'100'}),env);
 const ownPlayers=(await own.json()).data;assert.equal(ownPlayers.knownScoreSum,54);assert.equal(ownPlayers.players[0].score,54);
 assert.ok(calls.every(x=>x.url.includes('royal-kingdom-events-stage2')));
 assert.ok(calls.every(x=>x.body.operation==='getTeamClash'));
});
test('RK hybrid search is isolated and uses real RK API, never RM',async()=>{
 const seen=[];const handle=createSosiskaApi({authorizeAdmin:async()=>{},fetchAgent:async(url,options)=>{
  seen.push({url,body:JSON.parse(options.body)});
  return Response.json({ok:true,data:{variants:['ХАОС','XAOC','KHAOS'],candidates:[{teamId:'100',name:'XAOC',score:60000,sources:['search','WorldTeams']}],warnings:[],nextOffset:null}});
 }});
 const r=await handle(req({operation:'search',game:'rk',query:'ХАОС'}),env);const d=(await r.json()).data;
 assert.equal(r.status,200);assert.deepEqual(d.candidates.map(x=>x.teamId),['100']);
 assert.ok(seen.every(x=>x.url.includes('royal-kingdom-search')));
 assert.equal(seen[0].body.operation,'searchTeams');
});
test('RK isolated monitor records ordered changes, no historical contamination; capture is not automatic browsing',async()=>{
 const storage=fakeStorage(),calls=[];let level=10,at=0;
 const fetcher=async(url,options)=>{
  const b=JSON.parse(options.body);calls.push({url,operation:b.operation});
  return Response.json({ok:true,data:url.includes('search-stage1')?rkTeam(level):rkClash});
 };
 const monitor=createKingdomMonitor({storage,env,fetcher,now:()=>Date.parse('2026-10-18T12:00:00.000Z')+at,
  setAlarm:v=>storage.setAlarm(v),deleteAlarm:()=>storage.deleteAlarm()});
 const empty=await monitor.perform({operation:'history',teamId:'100'});assert.deepEqual(empty.records,[]);assert.equal(calls.length,0);
 const watched=await monitor.perform({operation:'watch',teamId:'100',intervalMinutes:60});
 assert.equal(watched.watching,true);assert.equal(calls.filter(c=>c.operation==='getTeamInfo').length,1);
 const rows=await monitor.perform({operation:'history',teamId:'100'});assert.equal(rows.records.length,1);assert.equal(rows.records[0].changes.baseline,true);
 level=13;at=60*60000;await monitor.alarm();
 const next=await monitor.perform({operation:'history',teamId:'100'});assert.equal(next.records.length,2);
 assert.equal(next.records[0].sequence,2);assert.equal(next.records[0].changes.members[0].changes[0].delta,3);
 assert.equal(next.records[0].snapshot.tournament.teamScore,560);
 assert.equal((await monitor.perform({operation:'list'})).watches.length,1);
 await monitor.perform({operation:'unwatch',teamId:'100'});
 assert.equal((await monitor.perform({operation:'list'})).watches.length,0);
 assert.equal((await monitor.perform({operation:'history',teamId:'100'})).records.length,2);
 assert.equal(storage.map.has('rk:meta:100'),true);
 assert.equal(storage.map.has('rm:meta:100'),false);
});
test('RK status is only live on fresh verified game proof',async()=>{
 const t=Date.parse('2026-10-18T12:00:00Z'),healthy={game:'rk',online:true,level:5400,maxLevel:5400,checkedAt:new Date(t).toISOString()};
 assert.equal((await readKingdomStatus(async()=>healthy,()=>t)).status,'online');
 assert.equal((await readKingdomStatus(async()=>({...healthy,checkedAt:new Date(t-200000).toISOString()}),()=>t)).status,'offline');
 assert.equal((await readKingdomStatus(async()=>{throw Error('no net')},()=>t)).status,'offline');
});
test('RK auth, body and admin boundary prevent upstream requests',async()=>{
 for(const game of ['something','Royal Kingdom','RM',''])assert.throws(()=>validateAgentAction({operation:'search',game,query:'x'}));
 let calls=0;const handle=createSosiskaApi({authorizeAdmin:async()=>{throw Object.assign(Error('denied'),{status:403});},
 fetchAgent:async()=>{calls++;throw Error('should not');}});
 const res=await handle(req({operation:'search',game:'rk',query:'RK'}),env);
 assert.equal(res.status,403);assert.equal(calls,0);
});
