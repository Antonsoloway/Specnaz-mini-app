import test from 'node:test';
import assert from 'node:assert/strict';
import {timelineRows,packAnalysisParts,requestSosiskaAnalysis} from '../worker/src/sosiska-analysis.js';
import {createAnalysisJobs} from '../worker/src/sosiska-analysis-jobs.js';
const env={SOSISKA_GROQ_KEY:'test-ai-secret',RM_AGENT_API_KEY:'private-test-agent-key'};
function record(teamId,n){return {sequence:n,snapshot:{teamId,capturedAt:new Date(Date.UTC(2026,9,1)+n*3600000).toISOString(),raw:{TeamName:'Team '+teamId,Members:[{UserId:'100',Name:'Player',Level:100+n,Crown:n===12?0:n,HelpCount:n}],Leader:'100'},derived:{memberCount:1,levelTotal:100+n,crownTotal:n===12?0:n,helpTotal:n}},changes:{baseline:n===1,from:n>1?new Date(Date.UTC(2026,9,1)+(n-1)*3600000).toISOString():null,team:[],derived:[],joined:[],left:[],members:n===1?[]:[{userId:'100',name:'Player',changes:[{field:'Level',before:99+n,after:100+n,delta:1},...(n===12?[{field:'Crown',before:11,after:0,delta:-11}]:[])]}]}};}
function setup(counts,options={}){
  const data=new Map(),calls=[],inputs=[];let alarm=null;
  const storage={async get(k){return structuredClone(data.get(k));},async put(k,v){data.set(k,structuredClone(v));},async setAlarm(v){alarm=v;},async deleteAlarm(){alarm=null;}};
  const histories=Object.fromEntries(Object.entries(counts).map(([id,n])=>[id,Array.from({length:n},(_,i)=>record(id,n-i))]));
  const fetchAgent=async(url,init)=>{const b=JSON.parse(init.body);calls.push(b);if(options.fail?.(b))throw new Error('network');const result=b.operation==='list'?{watches:Object.keys(counts).map(teamId=>({teamId,enabled:true}))}:(()=>{const rows=histories[b.teamId].filter(r=>r.sequence<(b.before??Infinity)).slice(0,b.limit);return {records:rows,nextBefore:rows.at(-1)?.sequence>1?rows.at(-1).sequence:null};})();return Response.json({ok:true,data:result});};
  const analyze=async params=>{inputs.push(structuredClone(params.input));if(options.aiFail?.(params))throw new Error('ANALYSIS_PROVIDER_UNAVAILABLE');return {text:'Summary '+JSON.stringify(params.input.sequences??params.input.snapshotCount??params.input.parts?.length??'all'),model:'openai/gpt-oss-120b'};};
  const make=()=>createAnalysisJobs({storage,env,fetchAgent,analyze,uuid:()=> '00000000-0000-4000-8000-000000000001',now:()=>1791840000000});
  return {make,storage,data,calls,inputs,histories,get alarm(){return alarm;}};
}
async function finish(s,jobId){for(let i=0;i<1000;i++){const state=await s.make().status(jobId);if(state.state!=='running')return state;await s.make().step();}throw new Error('Job did not terminate');}
test('all history of all watched teams processed beyond 20 snapshots, including earliest reset',async()=>{
  const s=setup({'1':127,'2':12,'3':0});const job=await s.make().start(undefined,['1','2','3']);const result=await finish(s,job.jobId);
  assert.equal(result.state,'done');assert.equal(result.processedSnapshots,139);assert.deepEqual(result.teams.map(t=>t.count),[127,12,0]);assert.ok(result.teams.every(t=>t.complete));
  const covered=new Set(s.inputs.filter(x=>x.teamId==='1'&&x.sequences).flatMap(x=>x.sequences));assert.equal(covered.size,127);assert.ok(covered.has(1));
  assert.ok(s.inputs.some(x=>x.text?.includes('"delta":-11')));assert.ok(s.inputs.some(x=>x.text?.includes('baselineMember')));
  const overall=s.inputs.find(x=>Array.isArray(x.teams));assert.equal(overall.teams.length,3);assert.equal(overall.teams[0].count,127);
  assert.ok(s.calls.every(b=>['list','history'].includes(b.operation)));assert.equal(s.alarm,null);
});
test('restart after every step preserves cursor and no snapshot counted twice',async()=>{const s=setup({'1':23});const job=await s.make().start('1');const result=await finish(s,job.jobId);assert.equal(result.processedSnapshots,23);assert.deepEqual(s.calls.filter(b=>b.operation==='history').map(b=>b.before??null),[null,19,14,9,4]);});
test('new snapshots during analysis excluded from pinned head; next run can include them',async()=>{const s=setup({'1':9});const job=await s.make().start('1');await s.make().step();s.histories['1'].unshift(record('1',10));const result=await finish(s,job.jobId);assert.equal(result.teams[0].headSequence,9);assert.equal(result.teams[0].count,9);});
test('missing record fails full-history analysis rather than pretending complete',async()=>{const s=setup({'1':9});s.histories['1']=s.histories['1'].filter(r=>r.sequence!==4);const job=await s.make().start('1');const result=await finish(s,job.jobId);assert.equal(result.state,'failed');assert.equal(result.error,'ANALYSIS_HISTORY_INCOMPLETE');assert.equal(result.summary,undefined);});
test('transient failure persists cursor and resumes safely',async()=>{let once=true;const s=setup({'1':6},{fail:b=>b.operation==='history'&&once?(once=false,true):false});const job=await s.make().start('1');await s.make().step();let state=await s.make().status(job.jobId);assert.equal(state.state,'running');assert.equal(state.processedSnapshots,0);assert.ok(s.alarm);state=await finish(s,job.jobId);assert.equal(state.processedSnapshots,6);assert.equal(state.state,'done');});
test('timeline can page through every recorded point and includes player dynamics',async()=>{const s=setup({'1':27});const job=await s.make().start('1');await finish(s,job.jobId);let before,points=[];for(;;){const p=await s.make().timeline(job.jobId,'1',before,10);points.push(...p.points);if(!p.nextBefore)break;before=p.nextBefore;}assert.equal(points.length,27);assert.equal(points.at(-1).sequence,1);assert.equal(points[15].changes.members[0].changes[1].delta,-11);});
test('unscoped start rejected before history calls or alarm creation',async()=>{const s=setup({'1':3});await assert.rejects(()=>s.make().start(),/ANALYSIS_INVALID/);assert.equal(s.alarm,null);assert.deepEqual(s.calls,[]);});
test('active duplicate start reused but unrelated scope cannot replace running job',async()=>{const s=setup({'1':9,'2':9});const a=await s.make().start('1');const b=await s.make().start('1');assert.equal(a.jobId,b.jobId);await assert.rejects(()=>s.make().start('2'),/ANALYSIS_BUSY/);});
test('scoped status cannot return another team or comparison result',async()=>{
 const s=setup({'1':9,'2':9});const a=await s.make().start('1');
 assert.equal((await s.make().status(undefined,'1')).jobId,a.jobId);
 assert.equal((await s.make().status(undefined,'2')).available,false);
 assert.equal((await s.make().status(undefined,undefined,['1','2'])).available,false);
 const done=await finish(s,a.jobId);assert.deepEqual(done.teams.map(t=>t.teamId),['1']);assert.equal(s.calls.some(b=>b.operation==='list'||b.teamId==='2'),false);
});
test('chunking preserves every byte even a single oversized field',()=>{const rows=[{sequence:1,data:'x'.repeat(50000)},{sequence:2,data:'late'}];const parts=packAnalysisParts(rows,1000);assert.ok(parts.every(p=>p.text.length<=1000));assert.equal(parts.map(p=>p.text).join(''),rows.map(r=>JSON.stringify(r)+'\n').join(''));});
test('all member, role, join/leave and team changes represented',()=>{const r=record('1',2);r.changes.joined=[{UserId:'200'}];r.changes.left=[{UserId:'300'}];r.changes.team=[{field:'Leader',before:'100',after:'200'}];r.changes.members[0].changes.push({field:'Role',before:'leader',after:'member'});const rows=timelineRows(r);assert.ok(rows.some(r=>r.kind==='joined'));assert.ok(rows.some(r=>r.kind==='left'));assert.ok(rows.some(r=>r.kind==='teamChange'));assert.ok(JSON.stringify(rows).includes('Role'));});
test('GPT receives full-history instructions and no secret exposed in report',async()=>{let body;const r=await requestSosiskaAnalysis({input:{sequences:[1,2,3]},task:'test',env,fetchAI:async(url,init)=>{assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');body=JSON.parse(init.body);return Response.json({choices:[{finish_reason:'stop',message:{content:'Прогресс'}}]});}});assert.equal(r.model,'openai/gpt-oss-120b');assert.match(body.messages[0].content,/ВСЮ/);assert.ok(!JSON.stringify(r).includes(env.SOSISKA_GROQ_KEY));});
test('provider failure and truncated output are not completed analysis',async()=>{for(const r of [Response.json({},{status:429}),Response.json({choices:[{finish_reason:'length',message:{content:'Incomplete'}}]})])await assert.rejects(()=>requestSosiskaAnalysis({input:{},task:'test',env,fetchAI:async()=>r}));});

test('AI final report includes deterministic full-period rates and distinguishes league rounds',async()=>{const s=setup({'1':23});const job=await s.make().start('1');const result=await finish(s,job.jobId);assert.equal(result.teams[0].period.snapshotCount,23);assert.equal(result.teams[0].period.complete,true);assert.equal(result.teams[0].period.players[0].levelGain,22);assert.equal(result.teams[0].period.leagueRoundsAvailable,false);assert.ok(s.inputs.some(i=>i.period?.snapshotCount===23));});
test('missing analysis key is visible even before first start',async()=>{const storage={get:async()=>null};const j=createAnalysisJobs({storage,env:{}});const result=await j.status();assert.equal(result.available,false);assert.match(result.reason,/отсутствует ключ/);});
test('exhausted provider retries stop after five attempts and preserve history cursor',async()=>{
 const s=setup({'1':6},{aiFail:()=>true});const j=await s.make().start('1');const done=await finish(s,j.jobId);assert.equal(done.state,'failed');assert.equal(done.retries,5);assert.equal(done.processedSnapshots,5);assert.equal(s.alarm,null);
});
test('selected teams analysis includes only chosen IDs and preserves duplicate scope',async()=>{
 const s=setup({'1':2,'2':2,'3':2});const j=await s.make().start(undefined,['1','3']);assert.equal((await s.make().start(undefined,['3','1'])).jobId,j.jobId);const done=await finish(s,j.jobId);assert.equal(done.scope,'selected');assert.deepEqual(done.teams.map(t=>t.teamId),['1','3']);assert.equal(s.calls.some(b=>b.operation==='list'),false);
});
