import {restrictSosiskaData} from './sosiska-access.js';
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
  const scopeKey=(teamId,ids)=>teamId?'team:'+teamId:'selected:'+JSON.stringify([...ids].sort());
  async function start(teamId,selectedIds,ownerMetrics=true) {
    if((!teamId&&!selectedIds)||(teamId&&selectedIds))throw new Error('ANALYSIS_INVALID');
    if(!analysisKeys(env).length)throw Object.assign(new Error('ANALYSIS_NOT_CONFIGURED'),{permanent:true});
    const active=await storage.get('analysis:active');
    if(active){const j=await storage.get(`analysis:${active}:state`);if(j&&!['done','failed'].includes(j.state)){if((teamId&&j.scope==='team'&&j.teams[0].teamId===teamId)||(selectedIds&&j.scope==='selected'&&JSON.stringify([...selectedIds].sort())===JSON.stringify(j.teams.map(t=>t.teamId).sort())))return status(active);throw new Error('ANALYSIS_BUSY');}}
    const watches=selectedIds?selectedIds.map(teamId=>({teamId})):[{teamId}];
    const teamIds=[...new Set(watches.map(w=>w.teamId))];
    if(!teamIds.length)return {available:false,reason:'Нет отслеживаемых команд.'};
    const j={ownerMetrics,jobId:uuid(),state:'running',phase:'fetch',scope:selectedIds?'selected':'team',createdAt:new Date(now()).toISOString(),teams:teamIds.map(id=>({teamId:id,count:0,headSequence:null,expected:null,before:null,summaries:0,chunkIndex:0,chunkCount:0,level:0,reduceIndex:0})),teamIndex:0,processedSnapshots:0,retries:0};
    await save(j);await storage.put('analysis:active',j.jobId);await storage.put('analysis:scope:'+scopeKey(teamId,selectedIds),j.jobId);await storage.setAlarm(now()+1000);return status(j.jobId);
  }
  async function status(jobId,teamId,selectedIds) {
    if(!jobId&&(teamId||selectedIds)){jobId=await storage.get('analysis:scope:'+scopeKey(teamId,selectedIds));if(!jobId)return {available:false,reason:'ИИ-анализ для выбранных команд ещё не запускался.'};}
    jobId=jobId??await storage.get('analysis:active');
    if(!jobId)return {available:false,reason:analysisKeys(env).length?'Анализ ещё не запускался.':'ИИ-анализ не подключён: отсутствует ключ провайдера. Динамика за весь период доступна без ИИ.'};
    const j=await storage.get(`analysis:${jobId}:state`);if(!j)throw new Error('ANALYSIS_JOB_NOT_FOUND');
    const result={available:true,jobId:j.jobId,state:j.state,scope:j.scope,processedSnapshots:j.processedSnapshots,createdAt:j.createdAt,updatedAt:j.updatedAt,error:j.error??null,diagnostics:j.diagnostics??null,retries:j.retries??0,nextAttemptAt:j.nextAttemptAt??null,phase:j.phase,teams:j.teams.map(t=>({teamId:t.teamId,teamName:t.name,count:t.count,headSequence:t.headSequence,from:t.from,to:t.to,complete:!!t.complete}))};
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
    for(const original of page.records) {
      const r=restrictSosiskaData(original,j.ownerMetrics!==false);
      if(r.sequence!==t.expected||r.snapshot?.teamId!==t.teamId||!r.changes||!Number.isFinite(Date.parse(r.snapshot.capturedAt))||(r.sequence===1&&!r.changes.baseline))throw Object.assign(new Error('ANALYSIS_HISTORY_INCOMPLETE'),{permanent:true});
      t.expected--;t.count++;j.processedSnapshots++;
      t.name=t.name??r.snapshot.raw.TeamName;t.to=t.to??r.snapshot.capturedAt;t.from=r.snapshot.capturedAt;
      rows.push(...restrictSosiskaData(timelineRows(r),j.ownerMetrics!==false));
      await storage.put(key(j,`point:${t.teamId}:${r.sequence}`),{sequence:r.sequence,capturedAt:r.snapshot.capturedAt,...r.snapshot.derived,members:r.snapshot.raw.Members.map(m=>({userId:m.UserId,name:m.Name,level:m.Level,crown:m.Crown,help:m.HelpCount})),changes:r.changes,
        tournament:r.snapshot.tournament?.available===true?{kind:r.snapshot.tournament.kind,eventId:r.snapshot.tournament.eventId,
          groupId:r.snapshot.tournament.groupId,teamScore:r.snapshot.tournament.teamScore}:null});
    }
    if(t.expected===0&&page.nextBefore!==null||t.expected>0&&page.nextBefore!==page.records.at(-1).sequence)throw Object.assign(new Error('ANALYSIS_HISTORY_INCOMPLETE'),{permanent:true});
    t.before=page.nextBefore;t.complete=t.expected===0;
    const parts=packAnalysisParts(rows,6000);t.chunkIndex=0;t.chunkCount=parts.length;
    for(let i=0;i<parts.length;i++)await storage.put(key(j,`input:${t.teamId}:${i}`),parts[i]);
    j.phase='chunk';
  }
  async function analyzeChunk(j,t) {
    const part=await storage.get(key(j,`input:${t.teamId}:${t.chunkIndex}`));
    const result=await analyze({ownerMetrics:j.ownerMetrics!==false,input:{teamId:t.teamId,teamName:t.name,...part},task:'Ответ до 250 слов: выбери существенные изменения, а не переписывай весь вход. Это часть полного временного ряда в формате JSON lines, возможно фрагмент длинной записи. Проанализируй все содержащиеся интервалы, сохрани даты, UserId, имена, числа и существенные изменения для последующего объединения. Не называй часть всей историей.',env});
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
    const period=acc.result();delete period.series;period.players=period.players.map(({series,hourly,...p})=>p);return restrictSosiskaData(period,j.ownerMetrics!==false);
  }
  async function observedEventStats(j,t){
    if(j.ownerMetrics===false)return [];
    const scopes=new Map();
    for(let n=t.headSequence;n>0;n--){
      const point=await storage.get(key(j,`point:${t.teamId}:${n}`));
      const event=point?.tournament,change=point?.changes?.tournament;
      if(!event||!['tournament','battle'].includes(event.kind))continue;
      const scope=[event.kind,event.eventId,event.groupId].join(':');
      let s=scopes.get(scope);
      if(!s){s={kind:event.kind,eventId:event.eventId,groupId:event.groupId,
        latestScore:event.teamScore,lastObservedAt:point.capturedAt,
        observedGain:0,comparableIntervals:0,knownPlayerProgress:0,players:new Map()};scopes.set(scope,s);}
      if(change?.comparable!==true)continue;
      if(Number.isSafeInteger(change.teamScoreDelta)&&change.teamScoreDelta>=0){s.observedGain+=change.teamScoreDelta;s.comparableIntervals++;}
      if(Number.isSafeInteger(change.knownPlayerProgress)&&change.knownPlayerProgress>=0)s.knownPlayerProgress+=change.knownPlayerProgress;
      for(const p of change.players??[]){
        if(!Number.isSafeInteger(p.delta)||p.delta<0)continue;
        const item=s.players.get(p.userId)||{userId:p.userId,name:p.name,gain:0};
        item.gain+=p.delta;s.players.set(p.userId,item);
      }
    }
    return [...scopes.values()].map(({players,...s})=>({...s,players:[...players.values()].sort((a,b)=>b.gain-a.gain).slice(0,15)}));
  }
  async function reduceTeam(j,t) {
    if(t.summaries===0){await storage.put(key(j,`report:${t.teamId}`),{text:'Сохранённых снимков пока нет.',model:null});await nextTeam(j);return;}
    if(t.summaries===1) {
      const report=await storage.get(key(j,`summary:${t.teamId}:${t.level}:0`));
      const period=await periodStats(j,t);
      const final=await analyze({ownerMetrics:j.ownerMetrics!==false,format:'report',input:{period,...(j.ownerMetrics!==false?{eventStats:await observedEventStats(j,t)}:{}),teamId:t.teamId,teamName:t.name,from:t.from,to:t.to,snapshotCount:t.count,complete:t.complete,analysis:report},task:'Ответ до 450 слов, с выводами и ведущими игроками; не повторяй полный список счётчиков. Составь итоговый анализ ВСЕЙ истории этой команды. Охват задан явно. Опиши динамику по времени, игроков, изменения состава и неопределённости. Один снимок не даёт динамики; прямо сообщи это.',env});
      await storage.put(key(j,`report:${t.teamId}`),{...final,period});await nextTeam(j);return;
    }
    const batch=[];let chars=0;
    while(t.reduceIndex<t.summaries){const r=await storage.get(key(j,`summary:${t.teamId}:${t.level}:${t.reduceIndex}`));if(batch.length>=2&&chars+JSON.stringify(r).length>6000)break;batch.push(r);chars+=JSON.stringify(r).length;t.reduceIndex++;}
    const result=await analyze({ownerMetrics:j.ownerMetrics!==false,input:{teamId:t.teamId,parts:batch},task:'Ответ до 300 слов. Объедини ВСЕ эти промежуточные анализы: сохрани хронологию, игроков/UserId и числа, ранние и поздние периоды. Это промежуточное сжатие, не весь итог.',env});
    const n=t.nextSummaries??0;await storage.put(key(j,`summary:${t.teamId}:${t.level+1}:${n}`),result);t.nextSummaries=n+1;
    if(t.reduceIndex===t.summaries){t.level++;t.summaries=t.nextSummaries;t.nextSummaries=0;t.reduceIndex=0;}
  }
  async function nextTeam(j){j.teamIndex++;j.phase=j.teamIndex<j.teams.length?'fetch':'overall';}
  async function overall(j) {
    if(j.scope==='team'&&j.teams.length===1){
      // Reuse the final report already grounded in full-period statistics.
      const {period:verifiedStats,...report}=await storage.get(key(j,`report:${j.teams[0].teamId}`));
      await storage.put(key(j,'overall'),report);
      j.state='done';j.completedAt=new Date(now()).toISOString();return;
    }
    const teams=[];for(const t of j.teams)teams.push({teamId:t.teamId,teamName:t.name,count:t.count,from:t.from,to:t.to,report:(await storage.get(key(j,`report:${t.teamId}`)))?.text});
    const report=await analyze({ownerMetrics:j.ownerMetrics!==false,format:'report',input:{scope:j.scope,teams},task:j.scope==='team'?'Ответ до 400 слов. Подведи итог полной истории только этой команды: динамика, темп, вклад игроков, состав и ограничения наблюдений.': 'Ответ до 400 слов. Сделай сравнительный итог по ВСЕМ командам и их полной истории: динамика, темп, вклад игроков, состав, отличия периодов и ограничения сравнения. Не сравнивай разную длительность как равную. Не пропускай команды без снимков, отметь нехватку данных.',env});
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
      j.retries=0;j.error=null;j.diagnostics=null;j.nextAttemptAt=null;await save(j);
      if(j.state==='done')await storage.deleteAlarm();else await storage.setAlarm(now()+1000);
    }catch(error) {
      const saved=await storage.get(key(j,'state'));saved.retries++;saved.error=safeError(error);
      saved.diagnostics=error.diagnostics??null;if(error.permanent||saved.retries>=5)saved.state='failed';saved.nextAttemptAt=saved.state==='failed'?null:new Date(now()+Math.min(600000,60000*saved.retries)).toISOString();
      await save(saved);if(saved.state==='failed')await storage.deleteAlarm();else await storage.setAlarm(now()+Math.min(600000,60000*saved.retries));
    }
  }
  return {start:(teamId,teamIds,ownerMetrics)=>serial(()=>start(teamId,teamIds,ownerMetrics)),status,timeline,step:()=>serial(step)};
}
export class SosiskaAnalysisJobs {
  constructor(ctx,env,fetchAgent=fetch,analyze=requestSosiskaAnalysis){this.jobs=createAnalysisJobs({storage:ctx.storage,env,fetchAgent,analyze});}
  async fetch(request){try{const b=await request.json();const data=b.operation==='start'?await this.jobs.start(b.teamId,b.teamIds,request.headers.get('X-Sosiska-Metrics-Scope')==='owner'):b.operation==='status'?await this.jobs.status(b.jobId,b.teamId,b.teamIds):b.operation==='timeline'?await this.jobs.timeline(b.jobId,b.teamId,b.before,b.limit):null;if(!data)return json({ok:false,error:'ANALYSIS_INVALID'},400);return json({ok:true,data});}catch(e){return json({ok:false,error:safeError(e)},503);}}
  async alarm(){await this.jobs.step();}
}


export class SosiskaKingdomAnalysisJobs extends SosiskaAnalysisJobs{
 constructor(ctx,env){
  super(ctx,env,async(_url,opts)=>{
   if(!env.SOSISKA_RK_MONITOR)return Response.json({ok:false,error:'RK_MONITOR_NOT_CONFIGURED'},{status:503});
   const stub=env.SOSISKA_RK_MONITOR.get(env.SOSISKA_RK_MONITOR.idFromName('kingdom-monitor-v1'));
   return stub.fetch('https://rk-monitor.internal',{method:'POST',headers:{'Content-Type':'application/json'},body:opts.body});
  },args=>requestSosiskaAnalysis({...args,task:'Это игра Royal Kingdom (RK), не Royal Match. В истории поле Crown означает игровые кубки Cup, а не короны. Не приписывай событию RK расписание RM. Чужие личные очки в битвах могут быть недоступны. '+args.task}));
 }
}
