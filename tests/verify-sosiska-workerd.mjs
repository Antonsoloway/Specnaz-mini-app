// Actual SQLite Durable Object alarms and cold starts; all outbound calls mocked.
import {createRequire} from 'node:module';
import {createHmac} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(process.argv[2]||import.meta.url);
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const scriptPath=process.argv[3];
if(!scriptPath)throw new Error('Provide bundled Worker path');
const persist=await mkdtemp(join(tmpdir(),'sosiska-workerd-'));
const sessionSecret='test-session-secret';
const payload=Buffer.from(JSON.stringify({tg:'123',exp:Math.floor(Date.now()/1000)+600})).toString('base64url');
const token=payload+'.'+createHmac('sha256',sessionSecret).update(payload).digest('base64url');
const calls=[];
const record=n=>({sequence:n,snapshot:{teamId:'1',capturedAt:new Date(Date.UTC(2026,9,1)+n*3600000).toISOString(),raw:{TeamName:'Fixture',Members:[{UserId:'100',Name:'Player',Level:100+n,Crown:n,HelpCount:n}]},derived:{memberCount:1,levelTotal:100+n,crownTotal:n,helpTotal:n}},changes:{baseline:n===1,from:n>1?new Date(Date.UTC(2026,9,1)+(n-1)*3600000).toISOString():null,team:[],derived:[],joined:[],left:[],members:n===1?[]:[{userId:'100',name:'Player',changes:[{field:'Level',before:99+n,after:100+n,delta:1}]}]}});
const options={rootPath:dirname(scriptPath),name:'sosiska-fixture',modules:true,scriptPath,compatibilityDate:'2026-08-15',durableObjects:{SOSISKA_ANALYSIS:{className:'SosiskaAnalysisJobs',useSQLite:true}},durableObjectsPersist:persist,bindings:{FRONTEND_ORIGIN:'https://antonsoloway.github.io',SESSION_SECRET:sessionSecret,BOT_TOKEN:'test-bot',TELEGRAM_CHAT_ID:'-1001',RM_AGENT_API_KEY:'private-test-agent-key-'.repeat(3),SOSISKA_GROQ_KEY:'test-ai-key'},outboundService:async request=>{
  const u=new URL(request.url);calls.push(u.hostname);
  if(u.hostname==='api.telegram.org')return Response.json({ok:true,result:{status:'administrator'}});
  const b=await request.json();
  if(u.hostname==='api.groq.com')return Response.json({choices:[{finish_reason:'stop',message:{content:'Fixture whole-history analysis'}}]});
  if(u.hostname==='specnaz-royal-match-agent-stage1.specnaz-sosiska.workers.dev') {
    assert.ok(['list','history'].includes(b.operation));
    if(b.operation==='list')return Response.json({ok:true,data:{watches:[{teamId:'1',enabled:true}]}});
    const records=[record(3),record(2),record(1)].filter(r=>r.sequence<(b.before??Infinity)).slice(0,b.limit);
    return Response.json({ok:true,data:{records,nextBefore:records.at(-1)?.sequence>1?records.at(-1).sequence:null}});
  }
  throw new Error('Unexpected outbound host');
}};
let mf;
const invoke=async body=>{const r=await mf.dispatchFetch('https://miniapp.test/admin-agent',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Origin:options.bindings.FRONTEND_ORIGIN},body:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data.data;};
try {
  mf=new Miniflare(convertV4MiniflareOptions?{...convertV4MiniflareOptions(options),resourcePersistencePath:persist}:options);
  const denied=await mf.dispatchFetch('https://miniapp.test/admin-agent',{method:'POST',headers:{Authorization:'Bearer forged','Content-Type':'application/json'},body:'{"operation":"analysis"}'});assert.equal(denied.status,401);
  const job=await invoke({operation:'analysis'});assert.equal(job.state,'running');
  await mf.dispose();mf=new Miniflare(convertV4MiniflareOptions?{...convertV4MiniflareOptions(options),resourcePersistencePath:persist}:options);
  assert.equal((await invoke({operation:'analysisStatus',jobId:job.jobId})).jobId,job.jobId);
  let result;
  for(let i=0;i<30;i++){result=await invoke({operation:'analysisStatus',jobId:job.jobId});if(result.state!=='running')break;await new Promise(r=>setTimeout(r,1000));}
  assert.equal(result.state,'done');assert.equal(result.processedSnapshots,3);
  const timeline=await invoke({operation:'analysisTimeline',jobId:job.jobId,teamId:'1',limit:20});assert.equal(timeline.points.length,3);assert.equal(timeline.points.at(-1).sequence,1);
  await mf.dispose();mf=new Miniflare(convertV4MiniflareOptions?{...convertV4MiniflareOptions(options),resourcePersistencePath:persist}:options);
  assert.equal((await invoke({operation:'analysisStatus'})).state,'done');
  console.log(JSON.stringify({checks:5,sqliteAlarms:'pass',coldStart:'pass',fullHistory:'3/3',outboundHosts:[...new Set(calls)],liveNetworkCalls:0}));
}finally{await mf?.dispose();await rm(persist,{recursive:true,force:true});}
