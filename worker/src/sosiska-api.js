import {isSosiskaOwner,restrictSosiskaData} from './sosiska-access.js';
import {prepareHistoryExport} from './sosiska-export.js';
import {readSosiskaStatus,readKingdomStatus} from './agent-status.js';
import {normalizeKingdomTeam} from './sosiska-rk-monitor.js';
// Browser receives game data only. Agent credentials never leave this facade.
const AGENT_ORIGIN = 'https://specnaz-royal-match-agent-stage1.specnaz-sosiska.workers.dev';
const EVENT_ORIGIN = 'https://specnaz-royal-match-events-stage1.soloway3852.workers.dev';
const RK_ORIGIN='https://specnaz-royal-kingdom-search-stage1.soloway3852.workers.dev';
const RK_EVENT_ORIGIN='https://specnaz-royal-kingdom-events-stage2.soloway3852.workers.dev';
const id = value => typeof value === 'string' && /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const uint64 = value => typeof value === 'string' && /^[1-9]\d{0,19}$/.test(value) && BigInt(value) <= (1n<<64n)-1n;
const invalid = () => { throw Object.assign(new Error('INVALID_REQUEST'), {status:400}); };
export function validateAgentAction(body) {
  if (!object(body)) invalid();
  const keys = {status:[],prepareExport:['teamId','from','to'],profile:['userId'],tournamentGroup:['teamId'],tournamentPlayers:['teamId'],eventGroup:['teamId'],eventPlayers:['teamId'],health:[],search:['query'],team:['teamId'],list:[],watch:['teamId','intervalMinutes'],unwatch:['teamId'],capture:['teamId'],history:['teamId','limit','before'],analysis:['teamId','teamIds'],analysisStatus:['jobId','teamId','teamIds'],analysisTimeline:['jobId','teamId','limit','before']}[body.operation];
  if (!Array.isArray(keys) || Object.keys(body).some(k => !['operation','game',...keys].includes(k))) invalid();
  if(body.game!==undefined&&!['rm','rk'].includes(body.game))invalid();
  if(keys.includes('userId')&&!id(body.userId))invalid();
  if (keys.includes('teamId') && !(['analysis','analysisStatus'].includes(body.operation) && body.teamId===undefined) && !id(body.teamId)) invalid();
  if(body.teamIds!==undefined&&(!Array.isArray(body.teamIds)||body.teamIds.length<2||body.teamIds.length>5||body.teamIds.some(v=>!id(v))||new Set(body.teamIds).size!==body.teamIds.length||body.teamId!==undefined))invalid();
  if(body.operation==='analysis'&&body.teamId===undefined&&body.teamIds===undefined)invalid();
  if (keys.includes('jobId') && !(body.operation==='analysisStatus'&&body.jobId===undefined) && (typeof body.jobId!=='string'||!/^[a-f0-9-]{36}$/.test(body.jobId))) invalid();
  if (body.operation === 'search' && (typeof body.query !== 'string' || !body.query.trim() || body.query.length > 160)) invalid();
  if (body.operation === 'watch' && (!Number.isInteger(body.intervalMinutes) || body.intervalMinutes < 60 || body.intervalMinutes > 10080)) invalid();
  if (body.limit !== undefined && (!Number.isInteger(body.limit) || body.limit < 1 || body.limit > 20)) invalid();
  if (body.before !== undefined && (!Number.isSafeInteger(body.before) || body.before < 1)) invalid();
  if(body.operation==='prepareExport'&&(![body.from,body.to].every(x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x)&&Number.isFinite(Date.parse(x)))||body.from>=body.to))invalid();
  return body;
}
export function queryVariants(query) {
  const visual = {'а':'a','в':'b','е':'e','к':'k','м':'m','н':'h','о':'o','р':'p','с':'c','т':'t','у':'y','х':'x','и':'u'};
  const latin = {'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'shch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'};
  const q = query.trim();
  const replace = map => q.replace(/[а-яё]/gi, c => { const v = map[c.toLowerCase()]; return v === undefined ? c : c === c.toUpperCase() ? v.toUpperCase() : v; });
  return [...new Set([q,replace(visual),replace(latin)])].filter(v=>v.length<=160);
}
const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');

// Exact team names from search AND leaderboards must precede substring matches.
// Stable sorting preserves source order within each relevance tier.
export function rankTeamCandidates(candidates,query,variants=queryVariants(query)) {
  const exact = value => String(value ?? '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
  const requested=exact(query), alternatives=new Set(variants.map(exact).filter(v=>v!==requested));
  const requestedKey=normalize(query), keys=[...new Set(variants.map(normalize).filter(Boolean))];
  const rank=c=>{
    const name=exact(c.name),key=normalize(c.name);
    if(name===requested)return 0;
    if(alternatives.has(name))return 1;
    if(requestedKey&&key.startsWith(requestedKey))return 2;
    if(keys.some(q=>key.startsWith(q)))return 3;
    if(requestedKey&&key.includes(requestedKey))return 4;
    if(keys.some(q=>key.includes(q)))return 5;
    return 6;
  };
  return [...candidates].sort((a,b)=>rank(a)-rank(b));
}

async function readBody(request) {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json') || !request.body) invalid();
  const reader = request.body.getReader(); let size=0, chunks=[];
  try { for (;;) { const {value,done}=await reader.read(); if(done)break; size+=value.length; if(size>4096){await reader.cancel();invalid();} chunks.push(value); } }
  finally {reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  try {return validateAgentAction(JSON.parse(new TextDecoder().decode(bytes)));} catch {invalid();}
}
export function createSosiskaApi({authorizeAdmin,fetchAgent=fetch,fetchAI=fetch}) {
  return async function handle(request,env) {
    const origin = String(env.FRONTEND_ORIGIN || 'https://antonsoloway.github.io').replace(/\/$/,'');
    const headers = {'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'Authorization,Content-Type','Vary':'Origin','Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
    let ownerMetrics=false;
    const json = (body,status=200) => new Response(JSON.stringify({...restrictSosiskaData(body,ownerMetrics),capabilities:{ownerTeamMetrics:ownerMetrics}}),{status,headers});
    if (request.headers.has('Origin') && request.headers.get('Origin') !== origin) return json({ok:false,error:'ORIGIN_DENIED'},403);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(request.method!=='POST')return json({ok:false,error:'METHOD_NOT_ALLOWED'},405);
    try {
      const principal=await authorizeAdmin(request,env);ownerMetrics=isSosiskaOwner(principal);
      const body=await readBody(request);
      if(!ownerMetrics&&['tournamentGroup','tournamentPlayers','eventGroup','eventPlayers'].includes(body.operation))return json({ok:false,error:'OWNER_REQUIRED',message:'Эти данные доступны только владельцу.'},403);
      if(body.game==='rk'&&body.operation!=='status')return await handleKingdom(request,env,body,json,fetchAgent,ownerMetrics);
      if(body.operation==='status'){
        const rk=await readKingdomStatus(async()=>{
          if(typeof env.RK_AGENT_API_KEY!=='string'||env.RK_AGENT_API_KEY.length<32)throw Error('RK_NOT_CONFIGURED');
          const r=await fetchAgent(RK_ORIGIN+'/health',{headers:{Authorization:'Bearer '+env.RK_AGENT_API_KEY},redirect:'manual'});
          if(!r.ok)throw Error('RK_UNAVAILABLE');const data=await r.json();if(!data.ok)throw Error('RK_UNAVAILABLE');return data.data;
        });
        let rm;try{rm=typeof env.RM_AGENT_API_KEY==='string'&&env.RM_AGENT_API_KEY.length>=32?await readSosiskaStatus(async(operation,payload={})=>{
          const r=await fetchAgent(AGENT_ORIGIN+'/v1/invoke',{method:'POST',headers:{Authorization:'Bearer '+env.RM_AGENT_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({protocolVersion:1,operation,payload}),redirect:'manual'});
          const d=await r.json();if(!r.ok||!d.ok)throw Error('RM_UNAVAILABLE');return d.data;
        }):{id:'sosiska',name:'Сосиска',game:'RM',status:'offline',level:null,checkedAt:new Date().toISOString()};}
        catch{rm={id:'sosiska',name:'Сосиска',game:'RM',status:'offline',level:null,checkedAt:new Date().toISOString()};}
        return json({ok:true,data:{agents:[rm,rk]}});
      }
      if(typeof env.RM_AGENT_API_KEY!=='string'||env.RM_AGENT_API_KEY.length<32) return json({ok:false,error:'AGENT_NOT_CONFIGURED',message:'Подключение агента ещё не настроено.'},503);
      async function call(path,message) {
        const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),25000);
        try {
          const response=await fetchAgent(AGENT_ORIGIN+path,{method:'POST',headers:{Authorization:`Bearer ${env.RM_AGENT_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(message),signal:controller.signal,redirect:'manual'});
          const result=await response.json();
          if(!response.ok||result.ok!==true)throw Object.assign(new Error('AGENT_UNAVAILABLE'),{status:response.status===429?429:502});
          // The cloud agent's contract exposes decoded read-only data only.
          return result.data;
        } finally {clearTimeout(timer);}
      }
      if(['tournamentGroup','tournamentPlayers','eventGroup','eventPlayers'].includes(body.operation)){
        if(typeof env.RM_EVENT_API_KEY!=='string'||env.RM_EVENT_API_KEY.length<32)
          return json({ok:false,error:'TOURNAMENT_NOT_CONFIGURED',message:'Турнирный агент Aia ещё не подключён к приложению.'},503);
        const current=['eventGroup','eventPlayers'].includes(body.operation);
        const isGroup=['tournamentGroup','eventGroup'].includes(body.operation);
        const op=current?(isGroup?'getEventGroup':'getTeamEvent'):(isGroup?'getTournamentGroup':'getTeamTournament');
        const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
        let result;
        try {
          const response=await fetchAgent(EVENT_ORIGIN+'/v1/invoke',{method:'POST',headers:{Authorization:'Bearer '+env.RM_EVENT_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({protocolVersion:1,operation:op,payload:{teamId:body.teamId}}),signal:controller.signal,redirect:'manual'});
          if(!response.ok){
            const auth=response.status===401||response.status===403;
            throw Object.assign(new Error('TOURNAMENT_UNAVAILABLE'),{status:response.status===429?429:502,
              publicMessage:auth?'Aia не приняла подключение мини-приложения. Требуется восстановить подключение.':
                response.status===429?'Aia занята другим запросом. Повторите загрузку через несколько секунд.':
                'Aia ответила, но не смогла прочитать данные события в RM. Повторите загрузку.'});
          }
          result=await response.json();
        }catch(error){
          if(!error.publicMessage)error.publicMessage=error.name==='AbortError'?
            'Aia не ответила вовремя. Повторите загрузку.':
            'Не удалось получить ответ Aia. Проверьте подключение сервиса.';
          throw error;
        }finally{clearTimeout(timer);}
        if(result?.ok!==true||result.operation!==op||!object(result.data))
          throw Object.assign(new Error('TOURNAMENT_INVALID'),{status:502});
        const d=result.data;
        if(d.available===false)return json({ok:true,data:{available:false,reason:d.reason==='BATTLE_GROUP_SEARCH_PENDING'?'BATTLE_GROUP_SEARCH_PENDING':'NO_EVENT_DATA',teamId:body.teamId,...(['battle','tournament'].includes(d.kind)?{kind:d.kind}:{})}});
        if(d.available!==true||!(current?['tournament','battle'].includes(d.kind):d.kind==='tournament')||!uint64(d.groupId)||!Number.isSafeInteger(d.eventId)||d.eventId<=0||!Number.isSafeInteger(d.observedAt)||d.observedAt<0)
          throw Object.assign(new Error('TOURNAMENT_INVALID'),{status:502});
        if(isGroup){
          if(d.selectedTeamId!==body.teamId||!Array.isArray(d.teams)||d.teams.length>20||!d.teams.some(t=>t.teamId===body.teamId))
            throw Object.assign(new Error('TOURNAMENT_INVALID'),{status:502});
          const teams=d.teams.map((t,i)=>{
            if(!id(t.teamId)||typeof t.teamName!=='string'||t.teamName.length>180||!Number.isSafeInteger(t.score)||t.score<0||t.displayPosition!==i+1)
              throw Object.assign(new Error('TOURNAMENT_INVALID'),{status:502});
            return {teamId:t.teamId,name:t.teamName,score:t.score,position:t.displayPosition};
          });
          if(new Set(teams.map(t=>t.teamId)).size!==teams.length)
            throw Object.assign(new Error('TOURNAMENT_INVALID'),{status:502});
          return json({ok:true,data:{available:true,kind:d.kind,groupId:d.groupId,eventId:d.eventId,selectedTeamId:body.teamId,observedAt:d.observedAt,teams,serverFreshnessVerified:false}});
        }
        if(d.teamId!==body.teamId||!Array.isArray(d.players)||d.players.length>50||!Number.isSafeInteger(d.teamScore)||d.teamScore<0||
          typeof d.playersVerified!=='boolean'||typeof d.scoresComplete!=='boolean')
          throw Object.assign(new Error('TOURNAMENT_INVALID'),{status:502});
        const players=d.players.map(p=>{
          if(!id(p.userId)||typeof p.name!=='string'||p.name.length>180||
            !(p.score===null&&p.rawScore===-1&&p.scoreUnavailable===true||Number.isSafeInteger(p.score)&&p.score>=0))
            throw Object.assign(new Error('TOURNAMENT_INVALID'),{status:502});
          return {userId:p.userId,name:p.name,score:p.score};
        });
        if(new Set(players.map(p=>p.userId)).size!==players.length)
          throw Object.assign(new Error('TOURNAMENT_INVALID'),{status:502});
        return json({ok:true,data:{available:true,kind:d.kind,teamId:body.teamId,groupId:d.groupId,eventId:d.eventId,observedAt:d.observedAt,teamScore:d.teamScore,players,
          playersVerified:d.playersVerified,scoresComplete:d.scoresComplete&&players.every(p=>p.score!==null),knownScoreSum:players.reduce((s,p)=>s+(p.score??0),0),serverFreshnessVerified:false}});
      }
      if(body.operation==='prepareExport')return json({ok:true,data:await prepareHistoryExport(request,env,body,Date.now(),ownerMetrics)});
      const invoke = (operation,payload={}) => call('/v1/invoke',{protocolVersion:1,operation,payload});
      if(body.operation==='search') {
        const variants=queryVariants(body.query),candidates=new Map(),warnings=[];
        const add=(row,source)=>{
          if(!id(row.TeamId))return;
          const previous=candidates.get(row.TeamId);
          candidates.set(row.TeamId,{...previous,teamId:row.TeamId,name:row.Name??row.TeamName,logo:row.Logo??row.TeamLogo,memberCount:row.MemberCount??row.UserCount,sources:[...new Set([...(previous?.sources??[]),source])]});
        };
        let successfulSources=0;
        for(const variant of variants) {
          try {const data=await invoke('searchTeam',{searchText:variant});if(data?.Status!==0)throw new Error();successfulSources++;for(const row of data.Teams??[])add(row,'search');}
          catch {warnings.push('Поиск по одному из вариантов названия недоступен.');}
        }
        try {
          const data=await invoke('getLeaderboard');if(data?.Status!==0)throw new Error();successfulSources++;
          const queries=variants.map(normalize).filter(Boolean);
          for(const key of ['WorldTeams','LocalTeams'])for(const row of data[key]??[])if(queries.some(q=>normalize(row.TeamName).includes(q)))add(row,key);
        } catch {warnings.push('Рейтинги временно недоступны; поиск может быть неполным.');}
        if(!successfulSources)throw Object.assign(new Error('AGENT_UNAVAILABLE'),{status:502});
        return json({ok:true,data:{query:body.query,variants,candidates:rankTeamCandidates([...candidates.values()],body.query,variants),warnings:[...new Set(warnings)]}});
      }
      if(body.operation==='health')return json({ok:true,data:await invoke('health')});
      if(body.operation==='profile'){
        const data=await invoke('getProfile',{userId:body.userId});
        if(data.RequestedUserId!==body.userId||!data.Profile||!Array.isArray(data.Stats))throw new Error('AGENT_PROFILE_INVALID');
        return json({ok:true,data:normalizePlayerProfile(body.userId,data)});
      }
      if(body.operation==='team'){
        const data=await invoke('getTeamInfo',{teamId:body.teamId,includeMembers:true});
        if(data?.Status!==0||data.TeamId!==body.teamId||!Array.isArray(data.Members))throw new Error('AGENT_TEAM_INVALID');
        return json({ok:true,data});
      }
      if(['analysis','analysisStatus','analysisTimeline'].includes(body.operation)){
        if(!env.SOSISKA_ANALYSIS)return json({ok:false,error:'ANALYSIS_NOT_CONFIGURED',message:'ИИ-анализ ещё не подключён.'},503);
        const {operation,game:_rmGame,...params}=body;
        const stub=env.SOSISKA_ANALYSIS.get(env.SOSISKA_ANALYSIS.idFromName(ownerMetrics?'full-history-v1':'basic-full-history-v2'));
        const response=await stub.fetch('https://analysis.internal',{method:'POST',headers:{'Content-Type':'application/json','X-Sosiska-Metrics-Scope':ownerMetrics?'owner':'basic'},body:JSON.stringify({operation:{analysis:'start',analysisStatus:'status',analysisTimeline:'timeline'}[operation],...params})});
        const result=await response.json();
        if(!response.ok||!result.ok)return json({ok:false,error:result.error||'ANALYSIS_UNAVAILABLE',message:result.error==='ANALYSIS_NOT_CONFIGURED'?'ИИ-анализ ещё не подключён.':result.error==='ANALYSIS_BUSY'?'Предыдущий анализ ещё выполняется в фоне. Повторите запуск после его завершения.':'Анализ временно недоступен. Повторите попытку.'},503);
        return json(result);
      }
      const {game:_rmScope,...rmBody}=body;return json({ok:true,data:await call('/v1/monitor',rmBody)});
    } catch(error) {
      const status=Number(error.status)||502;
      const code=status===401?'SESSION_INVALID':status===403?'ADMIN_REQUIRED':status===400?'INVALID_REQUEST':status===429?'AGENT_BUSY':'AGENT_UNAVAILABLE';
      return json({ok:false,error:code,message:error.publicMessage|| (status===401?'Откройте приложение заново.':status===403?'Раздел доступен только администраторам.':status===400?'Проверьте параметры запроса.':'Агент временно недоступен. Повторите попытку.')},status);
    }
  };
}


// StatType from the supplied Royal Match build 38911 metadata. Values stay int64 strings.
export function normalizePlayerProfile(userId,data){
 const mapping={2:'firstTryWins',3:'helpsMade',4:'helpsReceived',5:'areasCompleted',8:'highestCrown',9:'totalCrown',10:'leagueWins',30:'setsCompleted',31:'collectionsCompleted'};
 const stats={};
 for(const row of data.Stats){const name=mapping[row.Id];if(!name)continue;if(name in stats||typeof row.Value!=='string'||!/^\d+$/.test(row.Value)||BigInt(row.Value)>9223372036854775807n)throw Error('AGENT_PROFILE_INVALID');stats[name]=row.Value;}
 const p=data.Profile;
 if(typeof p.Name!=='string'||!Number.isSafeInteger(p.Level)||p.Level<0||!Number.isSafeInteger(p.Crown)||p.Crown<0||typeof p.JoinDate!=='string'||!/^\d+$/.test(p.JoinDate)||typeof p.TeamId!=='string'||!/^\d+$/.test(p.TeamId))throw Error('AGENT_PROFILE_INVALID');
 return {userId,name:p.Name,level:p.Level,crown:p.Crown,teamId:p.TeamId,teamName:p.TeamName,teamLogo:Number.isInteger(p.TeamLogo)&&p.TeamLogo>=0&&p.TeamLogo<176?p.TeamLogo:null,joinedAt:p.JoinDate,profileSetting:p.ProfileSetting,stats,fetchedAt:new Date().toISOString()};
}

// RK backend is deliberately separate from RM: no shared team IDs, watch history or
// source credentials. Every action is authorized by the same Telegram admin facade.
// The RK 33931 profile returns keyed ClientStats and BackendStats, unlike RM's single Stats array.
export function normalizeKingdomProfileStats(data){
 const client={1:'firstTryWins',2:'levelWins',3:'helpsMade',4:'highestWeeklyWins',7:'collectionsCompleted',8:'districtsBuilt',9:'totalCup',10:'highestCup',11:'arenaWins'};
 const backend={1:'worldBestRank',2:'worldTop1000',3:'localBestRank',4:'localTop1000'};
 const out={};
 for(const [rows,mapping] of [[data?.ClientStats,client],[data?.BackendStats,backend]]){
  if(rows==null)continue;
  if(!Array.isArray(rows)||rows.length>32)throw Error('RK_PROFILE_INVALID');
  for(const row of rows){
   const name=mapping[row?.key];
   if(!name)continue;
   if(name in out||typeof row.value!=='string'||!/^\d+$/.test(row.value)||BigInt(row.value)>9223372036854775807n)throw Error('RK_PROFILE_INVALID');
   out[name]=row.value;
  }
 }
 // Rank zero is an empty leaderboard position, not a genuine #0 rank.
 for(const k of ['worldBestRank','localBestRank'])if(out[k]==='0')out[k]=null;
 return out;
}
export async function handleKingdom(request,env,body,json,fetcher=fetch,ownerMetrics=false){
 const operation=body.operation;
 const invoke=async(origin,secret,action,payload={})=>{
  if(typeof secret!=='string'||secret.length<32)
   return null;
  const response=await fetcher(origin+'/v1/invoke',{method:'POST',headers:{'Content-Type':'application/json',
   Authorization:'Bearer '+secret},body:JSON.stringify({protocolVersion:1,operation:action,payload}),redirect:'manual'});
  const result=await response.json();
  if(!response.ok||result.ok!==true||!object(result.data))throw Error('RK_UPSTREAM_UNAVAILABLE');
  return result.data;
 };
 try{
  if(['list','watch','unwatch','capture','history'].includes(operation)){
   if(!env.SOSISKA_RK_MONITOR)return json({ok:false,error:'RK_MONITOR_NOT_CONFIGURED',message:'Хранилище слежения RK не подключено.'},503);
   const stub=env.SOSISKA_RK_MONITOR.get(env.SOSISKA_RK_MONITOR.idFromName('kingdom-monitor-v1'));
   const response=await stub.fetch('https://rk-monitor.internal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   const result=await response.json();return json(result,response.ok?200:502);
  }
  if(['analysis','analysisStatus','analysisTimeline'].includes(operation)){
   if(!env.SOSISKA_RK_ANALYSIS)return json({ok:false,error:'RK_ANALYSIS_NOT_CONFIGURED',message:'ИИ-анализ RK ещё не подключён.'},503);
   const stub=env.SOSISKA_RK_ANALYSIS.get(env.SOSISKA_RK_ANALYSIS.idFromName(ownerMetrics?'kingdom-full-history-v1':'kingdom-basic-full-history-v2'));
   const {operation:op,game,...params}=body;
   const response=await stub.fetch('https://rk-analysis.internal',{method:'POST',headers:{'Content-Type':'application/json','X-Sosiska-Metrics-Scope':ownerMetrics?'owner':'basic'},
    body:JSON.stringify({operation:{analysis:'start',analysisStatus:'status',analysisTimeline:'timeline'}[op],...params})});
   const result=await response.json();return json(result,response.ok?200:503);
  }
  if(operation==='prepareExport')return json({ok:true,data:await prepareHistoryExport(request,env,body,Date.now(),ownerMetrics)});
  if(operation==='health'){
   const d=await invoke(RK_ORIGIN,env.RK_AGENT_API_KEY,'health');
   return d?json({ok:true,data:d}):json({ok:false,error:'RK_NOT_CONFIGURED'},503);
  }
  if(operation==='search'){
   const all=new Map(),warnings=new Set();let variants=[body.query],offset=0;
   for(let page=0;page<4;page++){
    const d=await invoke(RK_ORIGIN,env.RK_AGENT_API_KEY,'searchTeams',{query:body.query,offset,limit:50});
    if(!d)return json({ok:false,error:'RK_NOT_CONFIGURED',message:'Агент RK пока не подключён к Mini App.'},503);
    variants=d.variants??variants;
    for(const warning of d.warnings??[])warnings.add(warning);
    for(const c of d.candidates??[])if(id(c.teamId)){
     const old=all.get(c.teamId);all.set(c.teamId,{teamId:c.teamId,name:c.name,logo:c.logo,
      memberCount:c.memberCount,sources:[...new Set([...(old?.sources??[]),...(c.sources??[])])]});
    }
    if(d.nextOffset===null||d.nextOffset===undefined)break;
    if(!Number.isInteger(d.nextOffset)||d.nextOffset<=offset||d.nextOffset>200)throw Error('RK_SEARCH_PAGINATION');
    offset=d.nextOffset;
    if(page===3)warnings.add('Показаны первые 200 результатов — уточните название для поиска остальных.');
   }
   return json({ok:true,data:{query:body.query,variants,candidates:[...all.values()],warnings:[...warnings]}});
  }
  if(operation==='team'){
   const d=await invoke(RK_ORIGIN,env.RK_AGENT_API_KEY,'getTeamInfo',{teamId:body.teamId,includeMembers:true});
   if(!d)return json({ok:false,error:'RK_NOT_CONFIGURED'},503);
   return json({ok:true,data:normalizeKingdomTeam(d)});
  }
  if(operation==='profile'){
   const d=await invoke(RK_ORIGIN,env.RK_AGENT_API_KEY,'getProfile',{userId:body.userId});
   if(!d)return json({ok:false,error:'RK_NOT_CONFIGURED'},503);
   const p=d.Profile;if(d.RequestedUserId!==body.userId||p?.UserId!==body.userId)throw Error('RK_PROFILE_INVALID');
   return json({ok:true,data:{userId:body.userId,name:p.Name,level:p.Level,crown:Number.isSafeInteger(p.Cup)&&p.Cup>=0?p.Cup:null,teamId:p.TeamId,
    teamName:p.TeamName??'',joinedAt:null,profileSetting:p.ProfileSetting,stats:normalizeKingdomProfileStats(d),statsAvailable:d.statsAvailable===true,game:'rk',fetchedAt:typeof d.observedAt==='string'&&!Number.isNaN(Date.parse(d.observedAt))?d.observedAt:new Date().toISOString(),cacheStatus:['live','hit','stale'].includes(d.cacheStatus)?d.cacheStatus:'live'}});
  }
  if(['tournamentGroup','tournamentPlayers'].includes(operation)){
   const battle=await invoke(RK_EVENT_ORIGIN,env.RK_EVENT_API_KEY,'getTeamClash');
   if(!battle)return json({ok:false,error:'RK_EVENTS_NOT_CONFIGURED',message:'Аккаунт Aia ещё не подключён к Mini App.'},503);
   const selected=battle.teams?.find(t=>t.teamId===body.teamId);
   if(battle.available!==true||!selected)return json({ok:true,data:{available:false,reason:'OUTSIDE_AIA_GROUP',teamId:body.teamId}});
   const base={available:true,kind:'battle',groupId:battle.groupId,eventId:battle.eventId,observedAt:Date.parse(battle.observedAt),serverFreshnessVerified:false};
   if(operation==='tournamentGroup')return json({ok:true,data:{...base,selectedTeamId:body.teamId,
    teams:battle.teams.map((t,i)=>({teamId:t.teamId,name:t.name,score:t.score,position:i+1}))}});
   if(battle.personalTeamId!==body.teamId)return json({ok:true,data:{available:false,reason:'OPPONENT_PERSONAL_UNAVAILABLE',teamId:body.teamId}});
   const players=battle.personalResults.map(p=>({userId:p.userId,name:p.name,score:p.score}));
   return json({ok:true,data:{...base,teamId:body.teamId,teamScore:selected.score,players,
    playersVerified:true,scoresComplete:true,knownScoreSum:players.reduce((v,p)=>v+p.score,0)}});
  }
  return json({ok:false,error:'RK_UNSUPPORTED_OPERATION'},400);
 }catch{return json({ok:false,error:'RK_UNAVAILABLE',message:'Данные RK временно недоступны. Повторите попытку.'},502);}
}
