import test from 'node:test';
import assert from 'node:assert/strict';
import {createSosiskaApi,validateAgentAction} from '../worker/src/sosiska-api.js';

const baseEnv={FRONTEND_ORIGIN:'https://antonsoloway.github.io',RM_AGENT_API_KEY:'primary-key-'.repeat(5),RM_EVENT_API_KEY:'event-key-'.repeat(6)};
const request=body=>new Request('https://miniapp.invalid/admin-agent',{method:'POST',headers:{Origin:baseEnv.FRONTEND_ORIGIN,'Content-Type':'application/json',Authorization:'Bearer stub'},body:JSON.stringify(body)});
const group={available:true,kind:'tournament',selectedTeamId:'10',eventId:88,groupId:'20',observedAt:1792245600000,
  teams:[{teamId:'10',teamName:'BOLTAMnet',score:158400,displayPosition:1},{teamId:'11',teamName:'Competitor',score:155000,displayPosition:2}]};
const personal={available:true,kind:'tournament',teamId:'10',eventId:88,groupId:'20',observedAt:1792245600000,
  playersVerified:true,scoresComplete:false,teamScore:158400,
  players:[{userId:'111',name:'Player',score:50000},{userId:'112',name:'Unknown',score:null,rawScore:-1,scoreUnavailable:true}]};
const mock=(data,record)=>async(url,options)=>{
  record.push({url,...options,body:JSON.parse(options.body)});
  return Response.json({ok:true,operation:JSON.parse(options.body).operation,data});
};
test('only bounded read-only tournament inputs allowed',()=>{
  assert.doesNotThrow(()=>validateAgentAction({operation:'tournamentGroup',teamId:'10'}));
  assert.doesNotThrow(()=>validateAgentAction({operation:'tournamentPlayers',teamId:'10'}));
  for(const input of [
    {operation:'tournamentGroup',teamId:10},{operation:'tournamentGroup',teamId:'10',includePlayers:true},
    {operation:'tournamentPlayers',teamId:'10',apiKey:'bad'},{operation:'tournamentPlayers',teamId:'0'}
  ])assert.throws(()=>validateAgentAction(input));
});
test('tournament group uses isolated Aia secret and endpoint, never the primary session',async()=>{
  const calls=[];
  const handle=createSosiskaApi({authorizeAdmin:async()=>({telegramId:'1456874273'}),fetchAgent:mock(group,calls)});
  const response=await handle(request({operation:'tournamentGroup',teamId:'10'}),baseEnv);
  const {data}=await response.json();
  assert.equal(response.status,200);
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,'https://specnaz-royal-match-events-stage1.soloway3852.workers.dev/v1/invoke');
  assert.equal(calls[0].headers.Authorization,'Bearer '+baseEnv.RM_EVENT_API_KEY);
  assert.equal(calls[0].body.operation,'getTournamentGroup');
  assert.deepEqual(calls[0].body.payload,{teamId:'10'});
  assert.equal(calls[0].redirect,'manual');
  assert.equal(data.teams.length,2);
  assert.equal(data.serverFreshnessVerified,false);
  assert.ok(!JSON.stringify(data).includes(baseEnv.RM_EVENT_API_KEY));
});
test('personal unknown -1 remains null rather than fabricated zero',async()=>{
  const calls=[];const handle=createSosiskaApi({authorizeAdmin:async()=>({telegramId:'1456874273'}),fetchAgent:mock(personal,calls)});
  const response=await handle(request({operation:'tournamentPlayers',teamId:'10'}),baseEnv);
  const {data}=await response.json();
  assert.equal(response.status,200);
  assert.deepEqual(data.players.map(p=>p.score),[50000,null]);
  assert.equal(data.knownScoreSum,50000);
  assert.equal(data.scoresComplete,false);
  assert.equal(data.playersVerified,true);
  assert.equal(calls[0].body.operation,'getTeamTournament');
});
test('foreign group, identity mismatch, hidden malformed scores never reach browser',async()=>{
 for(const data of [{...group,selectedTeamId:'11'},{...group,teams:[{...group.teams[0],score:-1},group.teams[1]]},
   {...group,teams:[group.teams[0],group.teams[0]]},{...personal,teamId:'11'},{...personal,players:[{userId:'111',name:'x',score:-1}]}]){
  const calls=[];const body=data.teams?{operation:'tournamentGroup',teamId:'10'}:{operation:'tournamentPlayers',teamId:'10'};
  const handle=createSosiskaApi({authorizeAdmin:async()=>({telegramId:'1456874273'}),fetchAgent:mock(data,calls)});
  const r=await handle(request(body),baseEnv);
  assert.equal(r.status,502);assert.equal((await r.json()).error,'AGENT_UNAVAILABLE');
 }
});
test('nonadmin and missing Aia key do not call event service',async()=>{
 let calls=0;
 const handle=createSosiskaApi({authorizeAdmin:async()=>{throw Object.assign(Error('admin'),{status:403});},fetchAgent:async()=>{calls++;}});
 assert.equal((await handle(request({operation:'tournamentGroup',teamId:'10'}),baseEnv)).status,403);
 const noKey=createSosiskaApi({authorizeAdmin:async()=>({telegramId:'1456874273'}),fetchAgent:async()=>{calls++;}});
 const r=await noKey(request({operation:'tournamentGroup',teamId:'10'}),{...baseEnv,RM_EVENT_API_KEY:undefined});
 assert.equal(r.status,503);assert.equal((await r.json()).error,'TOURNAMENT_NOT_CONFIGURED');assert.equal(calls,0);
});

for(const kind of ['battle','tournament'])test(`current RM ${kind} uses Aia and retains native kind`,async()=>{
 for(const [operation,native,data] of [['eventGroup','getEventGroup',group],['eventPlayers','getTeamEvent',personal]]){
  const calls=[];
  const handle=createSosiskaApi({authorizeAdmin:async()=>({telegramId:'1456874273'}),fetchAgent:mock({...data,kind},calls)});
  const r=await handle(request({operation,teamId:'10'}),baseEnv);
  assert.equal(r.status,200);assert.equal((await r.json()).data.kind,kind);
  assert.equal(calls[0].body.operation,native);
  assert.equal(calls[0].headers.Authorization,'Bearer '+baseEnv.RM_EVENT_API_KEY);
 }
});
test('empty native battle remains unavailable without fabricated rows or scores',async()=>{
 const calls=[];const handle=createSosiskaApi({authorizeAdmin:async()=>({telegramId:'1456874273'}),fetchAgent:mock({available:false,kind:'battle'},calls)});
 const r=await handle(request({operation:'eventGroup',teamId:'10'}),baseEnv);
 assert.deepEqual((await r.json()).data,{available:false,reason:'NO_EVENT_DATA',teamId:'10',kind:'battle'});
});

test('Aia authorization errors are distinguished from owner session authorization',async()=>{
 for(const status of [401,403]){
  const handle=createSosiskaApi({authorizeAdmin:async()=>({telegramId:'1456874273'}),fetchAgent:async()=>new Response('upstream private response',{status})});
  const r=await handle(request({operation:'eventGroup',teamId:'10'}),baseEnv),body=await r.json();
  assert.equal(r.status,502);assert.equal(body.error,'AGENT_UNAVAILABLE');
  assert.match(body.message,/Aia не приняла подключение/);
  assert.equal(body.capabilities.ownerTeamMetrics,true);
  assert.ok(!JSON.stringify(body).includes('upstream private response'));
 }
});
test('Aia transport, timeout, busy and native failures have distinct safe messages',async()=>{
 for(const [fetchAgent,status,pattern] of [
  [async()=>{throw Error('private transport detail');},502,/Не удалось получить ответ Aia/],
  [async()=>{throw Object.assign(Error('private timeout detail'),{name:'AbortError'});},502,/Aia не ответила вовремя/],
  [async()=>new Response('private busy detail',{status:429}),429,/Aia занята/],
  [async()=>new Response('private native detail',{status:502}),502,/Aia ответила, но не смогла прочитать/]
 ]){
  const handle=createSosiskaApi({authorizeAdmin:async()=>({telegramId:'1456874273'}),fetchAgent});
  const r=await handle(request({operation:'eventGroup',teamId:'10'}),baseEnv),body=await r.json();
  assert.equal(r.status,status);assert.match(body.message,pattern);
  assert.ok(!JSON.stringify(body).includes('private'));
 }
});

test('current battle discovery status reaches only the owner without being mislabeled absent',async()=>{
 const calls=[],pending={available:false,kind:'battle',selectedTeamId:'10',reason:'BATTLE_GROUP_SEARCH_PENDING'};
 const owner=createSosiskaApi({authorizeAdmin:async()=>({telegramId:'1456874273'}),fetchAgent:mock(pending,calls)});
 const response=await owner(request({operation:'eventGroup',teamId:'10'}),baseEnv);const out=await response.json();
 assert.equal(response.status,200);assert.equal(out.data.reason,'BATTLE_GROUP_SEARCH_PENDING');assert.equal(out.data.kind,'battle');
 const before=calls.length,other=createSosiskaApi({authorizeAdmin:async()=>({telegramId:'222'}),fetchAgent:mock(pending,calls)});
 assert.equal((await other(request({operation:'eventGroup',teamId:'10'}),baseEnv)).status,403);assert.equal(calls.length,before);
});
