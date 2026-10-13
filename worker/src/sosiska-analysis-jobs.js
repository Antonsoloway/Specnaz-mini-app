import {createPeriodAccumulator} from './sosiska-period.js';
import {timelineRows,packAnalysisParts,requestSosiskaAnalysis,analysisKeys} from './sosiska-analysis.js';
const ORIGIN='https://specnaz-royal-match-agent-stage1.specnaz-sosiska.workers.dev';
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
const safeError=e=>/^ANALYSIS_[A-Z_]+$/.test(e?.message??'')?e.message:'ANALYSIS_UNAVAILABLE';
export function createAnalysisJobs({storage,env,fetchAgent=fetch,analyze=requestSosiskaAnalysis,now=()=>Date.now(),uuid=()=>crypto.randomUUID()}) {
  let tail=Promise.resolve();
  const serial=fn=>{const p=tail.then(fn);tail=p.catch(()=>{});return p;};
  const key=(j,s)=>`analysis:${j.jobId}:${s}`;
  async function agent(message) {
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
    try {
      const r=await fetchAgent(ORIGIN+'/v1/monitor',{method:'POST',headers:{Authorization:`Bearer ${env.RM_AGENT_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(message),signal:controller.signal,redirect:'manual'});
      const d=await r.json();if(!r.ok||d.ok!==true)throw new Error('ANALYSIS_HISTORY_UNAVAILABLE');return d.data;
    }finally{clearTimeout(timer);}
  }
  async function save(j){j.updatedAt=new Date(now()).toISOString();await storage.put(key(j,'state'),j);}
  async function start(teamId) {
    if(!analysisKeys(env).length)throw Object.assign(new Error('ANALYSIS_NOT_CONFIGURED'),{permanent:true});
    const active=await storage.get('analysis:active');
    if(active){const j=await storage.get(`analysis:${active}:state`);if(j&&!['done','failed'].includes(j.state)){if((!teamId&&j.scope==='all-watched')||(teamId&&j.scope==='team'&&j.teams[0].teamId===teamId))return status(active);throw new Error('ANALYSIS_BUSY');}}
    const watches=teamId?[{teamId}]:(await agent({operation:'list'})).watches.filter(w=>w.enabled);
    const teamIds=[...new Set(watches.map(w=>w.teamId))];
    if(!teamIds.length)return {available:false,reason:'Нет отслеживаемых команд.'};
    const j={jobId:uuid(),state:'running',phase:'fetch',scope:teamId?'team':'all-watched',createdAt:new Date(now()).toISOString(),teams:teamIds.map(id=>({teamId:id,count:0,headSequence:null,expected:null,before:null,summaries:0,chunkIndex:0,chunkCount:0,level:0,reduceIndex:0})),teamIndex:0,processedSnapshots:0,retries:0};
    await save(j);await storage.put('analysis:active',j.jobId);await storage.setAlarm(now()+1000);return status(j.jobId);
  }
  async function status(jobId) {
    jobId=jobId??await storage.get('analysis:active');
    if(!jobId)return {available:false,reason:analysisKeys(env).length?'Анализ ещё не запускался.':'ИИ-анализ не подключён: отсутствует ключ провайдера. Динамика за весь период доступна без ИИ.'};
    const j=await storage.get(`analysis:${jobId}:state`);if(!j)throw new Error('ANALYSIS_JOB_NOT_FOUND');
    const result={available:true,jobId:j.jobId,state:j.state,scope:j.scope,processedSnapshots:j.processedSnapshots,createdAt:j.createdAt,updatedAt:j.updatedAt,error:j.error??null,teams:j.teams.map(t=>({teamId:t.teamId,teamName:t.name,count:t.count,headSequence:t.headSequence,from:t.from,to:t.to,complete:!!t.complete}))};
    if(j.state==='done') {
      result.teams=await Promise.all(result.teams.map(async t=>({...t,...await storage.get(key(j,`report:${t.teamId}`))})));
      result.summary=await storage.get(key(j,'overall'));
    }
    return result;
  }
  async function timeline(jobId,teamId,before,limit=10) {
    const j=await storage.get(`analysis:${jobId}:state`),t=j?.teams.find(t=>t.teamId===teamId);
    if(!t)throw new Error('ANALYSIS_JOB_NOT_FOUND');
    const start=Math.min(t.headSequence??0,(before??Infinity)-1),points=[];
    for(let n=start;n>0&&points.length<limit;n--){const p=await storage.get(key(j,`point:${teamId}:${n}`));if(!p)break;points.push(p);}
    return {teamId,points,nextBefore:points.at(-1)?.sequence>1?points.at(-1).sequence:null,complete:!!t.complete,totalSnapshots:t.count};
  }
  async function fetchPage(j,t) {
    const page=await agent({operation:'history',teamId:t.teamId,limit:5,...(t.before?{before:t.before}:{})});
    if(!Array.isArray(page.records))throw new Error('ANALYSIS_HISTORY_INVALID');
    if(!page.records.length) {
      if(t.expected!==null&&t.expected!==0)throw Object.assign(new Error('ANALYSIS_HISTORY_INCOMPLETE'),{permanent:true});
      t.complete=true;j.phase='reduce';return;
    }
    if(t.headSequence===null){t.headSequence=page.records[0].sequence;t.expected=t.headSequence;}
    const rows=[];
    for(const r of page.records) {
      if(r.sequence!==t.expected||r.snapshot?.teamId!==t.teamId||!r.changes||!Number.isFinite(Date.parse(r.snapshot.capturedAt))||(r.sequence===1&&!r.changes.baseline))throw Object.assign(new Error('ANALYSIS_HISTORY_INCOMPLETE'),{permanent:true});
      t.expected--;t.count++;j.processedSnapshots++;
      t.name=t.name??r.snapshot.raw.TeamName;t.to=t.to??r.snapshot.capturedAt;t.from=r.snapshot.capturedAt;
      rows.push(...timelineRows(r));
      await storage.put(key(j,`point:${t.teamId}:${r.sequence}`),{sequence:r.sequence,capturedAt:r.snapshot.capturedAt,...r.snapshot.derived,members:r.snapshot.raw.Members.map(m=>({userId:m.UserId,name:m.Name,level:m.Level,crown:m.Crown,help:m.HelpCount})),changes:r.changes});
    }
    if(t.expected===0&&page.nextBefore!==null||t.expected>0&&page.nextBefore!==page.records.at(-1).sequence)throw Object.assign(new Error('ANALYSIS_HISTORY_INCOMPLETE'),{permanent:true});
    t.before=page.nextBefore;t.complete=t.expected===0;
    const parts=packAnalysisParts(rows);t.chunkIndex=0;t.chunkCount=parts.length;
    for(let i=0;i<parts.length;i++)await storage.put(key(j,`input:${t.teamId}:${i}`),parts[i]);
    j.phase='chunk';
  }
  async function analyzeChunk(j,t) {
    const part=await storage.get(key(j,`input:${t.teamId}:${t.chunkIndex}`));
    const result=await analyze({input:{teamId:t.teamId,teamName:t.name,...part},task:'Это часть полного временного ряда в формате JSON lines, возможно фрагмент длинной записи. Проанализируй все содержащиеся интервалы, сохрани даты, UserId, имена, числа и существенные изменения для последующего объединения. Не называй часть всей историей.',env});
    await storage.put(key(j,`summary:${t.teamId}:0:${t.summaries}`),result);t.summaries++;t.chunkIndex++;
    if(t.chunkIndex>=t.chunkCount)j.phase=t.complete?'reduce':'fetch';
  }
  async function periodStats(j,t){
    const acc=createPeriodAccumulator(t.teamId);
    for(let n=t.headSequence;n>0;n--){
      const p=await storage.get(key(j,`point:${t.teamId}:${n}`));
      if(!p)throw Object.assign(new Error('ANALYSIS_HISTORY_INCOMPLETE'),{permanent:true});
      acc.add({sequence:n,snapshot:{teamId:t.teamId,capturedAt:p.capturedAt,raw:{TeamName:t.name,Members:p.members.map(m=>({UserId:m.userId,Name:m.name,Level:m.level,Crown:m.crown,HelpCount:m.help}))}},changes:{baseline:n===1}});
    }
    return acc.result();
  }
  async function reduceTeam(j,t) {
    if(t.summaries===0){await storage.put(key(j,`report:${t.teamId}`),{text:'Сохранённых снимков пока нет.',model:null});await nextTeam(j);return;}
    if(t.summaries===1) {
      const report=await storage.get(key(j,`summary:${t.teamId}:${t.level}:0`));
      const period=await periodStats(j,t);
      const final=await analyze({input:{period,teamId:t.teamId,teamName:t.name,from:t.from,to:t.to,snapshotCount:t.count,complete:t.complete,analysis:report},task:'Составь итоговый анализ ВСЕЙ истории этой команды. Охват задан явно. Опиши динамику по времени, игроков, изменения состава и неопределённости. Один снимок не даёт динамики; прямо сообщи это.',env});
      await storage.put(key(j,`report:${t.teamId}`),{...final,period});await nextTeam(j);return;
    }
    const batch=[];let chars=0;
    while(t.reduceIndex<t.summaries){const r=await storage.get(key(j,`summary:${t.teamId}:${t.level}:${t.reduceIndex}`));if(batch.length>=2&&chars+JSON.stringify(r).length>24000)break;batch.push(r);chars+=JSON.stringify(r).length;t.reduceIndex++;}
    const result=await analyze({input:{teamId:t.teamId,parts:batch},task:'Объедини ВСЕ эти промежуточные анализы: сохрани хронологию, игроков/UserId и числа, ранние и поздние периоды. Это промежуточное сжатие, не весь итог.',env});
    const n=t.nextSummaries??0;await storage.put(key(j,`summary:${t.teamId}:${t.level+1}:${n}`),result);t.nextSummaries=n+1;
    if(t.reduceIndex===t.summaries){t.level++;t.summaries=t.nextSummaries;t.nextSummaries=0;t.reduceIndex=0;}
  }
  async function nextTeam(j){j.teamIndex++;j.phase=j.teamIndex<j.teams.length?'fetch':'overall';}
  async function overall(j) {
    const teams=[];for(const t of j.teams)teams.push({teamId:t.teamId,teamName:t.name,count:t.count,from:t.from,to:t.to,report:await storage.get(key(j,`report:${t.teamId}`))});
    const report=await analyze({input:{scope:j.scope,teams},task:'Сделай сравнительный итог по ВСЕМ командам и их полной истории: динамика, темп, вклад игроков, состав, отличия периодов и ограничения сравнения. Не сравнивай разную длительность как равную. Не пропускай команды без снимков, отметь нехватку данных.',env});
    await storage.put(key(j,'overall'),report);j.state='done';j.completedAt=new Date(now()).toISOString();
  }
  async function step() {
    const active=await storage.get('analysis:active');if(!active)return;
    const j=await storage.get(`analysis:${active}:state`);if(!j||j.state!=='running'){await storage.deleteAlarm();return;}
    await storage.setAlarm(now()+120000);
    try {
      const t=j.teams[j.teamIndex];
      if(j.phase==='fetch')await fetchPage(j,t);
      else if(j.phase==='chunk')await analyzeChunk(j,t);
      else if(j.phase==='reduce')await reduceTeam(j,t);
      else if(j.phase==='overall')await overall(j);
      else throw Object.assign(new Error('ANALYSIS_STATE_INVALID'),{permanent:true});
      j.retries=0;j.error=null;await save(j);
      if(j.state==='done')await storage.deleteAlarm();else await storage.setAlarm(now()+1000);
    }catch(error) {
      const saved=await storage.get(key(j,'state'));saved.retries++;saved.error=safeError(error);
      if(error.permanent||saved.retries>=5&&saved.error!=='ANALYSIS_PROVIDER_UNAVAILABLE')saved.state='failed';
      await save(saved);if(saved.state==='failed')await storage.deleteAlarm();else await storage.setAlarm(now()+Math.min(600000,60000*saved.retries));
    }
  }
  return {start:teamId=>serial(()=>start(teamId)),status,timeline,step:()=>serial(step)};
}
export class SosiskaAnalysisJobs {
  constructor(ctx,env){this.jobs=createAnalysisJobs({storage:ctx.storage,env});}
  async fetch(request){try{const b=await request.json();const data=b.operation==='start'?await this.jobs.start(b.teamId):b.operation==='status'?await this.jobs.status(b.jobId):b.operation==='timeline'?await this.jobs.timeline(b.jobId,b.teamId,b.before,b.limit):null;if(!data)return json({ok:false,error:'ANALYSIS_INVALID'},400);return json({ok:true,data});}catch(e){return json({ok:false,error:safeError(e)},503);}}
  async alarm(){await this.jobs.step();}
}
