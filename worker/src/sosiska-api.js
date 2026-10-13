// Browser receives game data only. Agent credentials never leave this facade.
const AGENT_ORIGIN = 'https://specnaz-royal-match-agent-stage1.specnaz-sosiska.workers.dev';
const id = value => typeof value === 'string' && /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const invalid = () => { throw Object.assign(new Error('INVALID_REQUEST'), {status:400}); };
export function validateAgentAction(body) {
  if (!object(body)) invalid();
  const keys = {health:[],search:['query'],team:['teamId'],list:[],watch:['teamId','intervalMinutes'],unwatch:['teamId'],capture:['teamId'],history:['teamId','limit','before'],analysis:['teamId','teamIds'],analysisStatus:['jobId','teamId','teamIds'],analysisTimeline:['jobId','teamId','limit','before']}[body.operation];
  if (!Array.isArray(keys) || Object.keys(body).some(k => !['operation',...keys].includes(k))) invalid();
  if (keys.includes('teamId') && !(['analysis','analysisStatus'].includes(body.operation) && body.teamId===undefined) && !id(body.teamId)) invalid();
  if(body.teamIds!==undefined&&(!Array.isArray(body.teamIds)||body.teamIds.length<2||body.teamIds.length>5||body.teamIds.some(v=>!id(v))||new Set(body.teamIds).size!==body.teamIds.length||body.teamId!==undefined))invalid();
  if(body.operation==='analysis'&&body.teamId===undefined&&body.teamIds===undefined)invalid();
  if (keys.includes('jobId') && !(body.operation==='analysisStatus'&&body.jobId===undefined) && (typeof body.jobId!=='string'||!/^[a-f0-9-]{36}$/.test(body.jobId))) invalid();
  if (body.operation === 'search' && (typeof body.query !== 'string' || !body.query.trim() || body.query.length > 160)) invalid();
  if (body.operation === 'watch' && (!Number.isInteger(body.intervalMinutes) || body.intervalMinutes < 60 || body.intervalMinutes > 10080)) invalid();
  if (body.limit !== undefined && (!Number.isInteger(body.limit) || body.limit < 1 || body.limit > 20)) invalid();
  if (body.before !== undefined && (!Number.isSafeInteger(body.before) || body.before < 1)) invalid();
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
    const json = (body,status=200) => new Response(JSON.stringify(body),{status,headers});
    if (request.headers.has('Origin') && request.headers.get('Origin') !== origin) return json({ok:false,error:'ORIGIN_DENIED'},403);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(request.method!=='POST')return json({ok:false,error:'METHOD_NOT_ALLOWED'},405);
    try {
      await authorizeAdmin(request,env);
      const body=await readBody(request);
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
        return json({ok:true,data:{query:body.query,variants,candidates:[...candidates.values()],warnings:[...new Set(warnings)]}});
      }
      if(body.operation==='health')return json({ok:true,data:await invoke('health')});
      if(body.operation==='team'){
        const data=await invoke('getTeamInfo',{teamId:body.teamId,includeMembers:true});
        if(data?.Status!==0||data.TeamId!==body.teamId||!Array.isArray(data.Members))throw new Error('AGENT_TEAM_INVALID');
        return json({ok:true,data});
      }
      if(['analysis','analysisStatus','analysisTimeline'].includes(body.operation)){
        if(!env.SOSISKA_ANALYSIS)return json({ok:false,error:'ANALYSIS_NOT_CONFIGURED',message:'ИИ-анализ ещё не подключён.'},503);
        const {operation,...params}=body;
        const stub=env.SOSISKA_ANALYSIS.get(env.SOSISKA_ANALYSIS.idFromName('full-history-v1'));
        const response=await stub.fetch('https://analysis.internal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:{analysis:'start',analysisStatus:'status',analysisTimeline:'timeline'}[operation],...params})});
        const result=await response.json();
        if(!response.ok||!result.ok)return json({ok:false,error:result.error||'ANALYSIS_UNAVAILABLE',message:result.error==='ANALYSIS_NOT_CONFIGURED'?'ИИ-анализ ещё не подключён.':result.error==='ANALYSIS_BUSY'?'Предыдущий анализ ещё выполняется в фоне. Повторите запуск после его завершения.':'Анализ временно недоступен. Повторите попытку.'},503);
        return json(result);
      }
      return json({ok:true,data:await call('/v1/monitor',body)});
    } catch(error) {
      const status=Number(error.status)||502;
      const code=status===401?'SESSION_INVALID':status===403?'ADMIN_REQUIRED':status===400?'INVALID_REQUEST':status===429?'AGENT_BUSY':'AGENT_UNAVAILABLE';
      return json({ok:false,error:code,message:error.publicMessage|| (status===401?'Откройте приложение заново.':status===403?'Раздел доступен только администраторам.':status===400?'Проверьте параметры запроса.':'Агент временно недоступен. Повторите попытку.')},status);
    }
  };
}
