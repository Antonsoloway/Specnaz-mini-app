import {restrictSosiskaData,isSosiskaOwner} from './sosiska-access.js';
import {normalizeKingdomTeam} from './sosiska-rk-monitor.js';
const GAMES={
 'Royal Match':{key:'RM_AGENT_API_KEY',origin:'https://specnaz-royal-match-agent-stage1.specnaz-sosiska.workers.dev',logos:176},
 'Royal Kingdom':{key:'RK_AGENT_API_KEY',origin:'https://specnaz-royal-kingdom-search-stage1.soloway3852.workers.dev',logos:184}
};
// A read-only game projection for an existing linked CRM team. Every cache hit
// still passes the existing CRM authorization and membership revocation checks.
export function leadership(team) {
  const byId = new Map((team.Members || []).map(m => [String(m.UserId), m]));
  const ids = [...new Set([team.Leader, ...(team.CoLeaders || [])].filter(Boolean).map(String))];
  return ids.filter(id => byId.has(id)).slice(0, 4).map(id => {
    const m = byId.get(id);
    return {userId:id, name:String(m.Name || ''), role:id===String(team.Leader)?'Лидер':'Помощник',
      level:Number.isSafeInteger(m.Level)?m.Level:null, crowns:Number.isSafeInteger(m.Crown)?m.Crown:null,
      help:Number.isSafeInteger(m.HelpCount)?m.HelpCount:null};
  });
}
export function projectTeam(team, fetchedAt, game='Royal Match') {
  if(!GAMES[game])throw Error('INVALID_GAME');
  if(game==='Royal Kingdom')team=normalizeKingdomTeam(team);
  if(team.Status!==0 || !Array.isArray(team.Members)) throw Error('INVALID_TEAM');
  const valid=team.Members.every(m=>Number.isSafeInteger(m.Level)&&m.Level>=0&&Number.isSafeInteger(m.Crown)&&m.Crown>=0);
  const score=game==='Royal Kingdom'?(Number.isSafeInteger(team.Score)&&team.Score>=0?team.Score:null):(valid?team.Members.reduce((n,m)=>n+m.Level+m.Crown,0):null);
  const logo=team.TeamLogo??team.Logo;
  return {teamId:team.TeamId, name:String(team.TeamName||''), logo:Number.isInteger(logo)&&logo>=0&&logo<GAMES[game].logos?logo:null, description:String(team.Description||''),
    game, star:Number.isSafeInteger(team.Star)&&team.Star>=0&&team.Star<=5?team.Star:null,
    weeklyHelp:team.Members.every(m=>Number.isSafeInteger(m.HelpCount)&&m.HelpCount>=0)?team.Members.reduce((n,m)=>n+m.HelpCount,0):null,
    memberCount:team.Members.length, capacity:50, score:Number.isSafeInteger(score)?score:null,
    minLevel:Number.isSafeInteger(team.MinLevel)?team.MinLevel:null, minCrowns:Number.isSafeInteger(team.MinCrown)?team.MinCrown:null,
    type:typeof team.Type==='boolean'?(team.Type?'Открытая':'Закрытая'):null,
    leadership:leadership(team), fetchedAt};
}
// Settle even if an upstream client ignores AbortSignal or stalls after headers.
async function boundedRead(read,ms,controller){
  let timer;try{return await Promise.race([Promise.resolve().then(read),new Promise((_,reject)=>{timer=setTimeout(()=>{controller?.abort();reject(Error('TEAM_LIVE_TIMEOUT'));},ms);})]);}
  finally{clearTimeout(timer);}
}
export function createTeamLive({crm,authorizeMetrics,fetchAgent=fetch,now=()=>Date.now(),authTimeoutMs=15000,agentTimeoutMs=25000}) {
  const cache=new Map(), pending=new Map();
  return async function handle(request,env,ctx) {
    const url=new URL(request.url),admin=url.pathname==='/admin-team-live';
    const origin=String(env.FRONTEND_ORIGIN||'https://antonsoloway.github.io').replace(/\/$/,'');
    const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET,OPTIONS','Access-Control-Allow-Headers':'Authorization,Content-Type','Vary':'Origin','Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff'};
    let ownerMetrics=false;
    const json=(body,status=200)=>Response.json(restrictSosiskaData(body,ownerMetrics),{status,headers});
    if(request.headers.has('Origin')&&request.headers.get('Origin')!==origin)return json({ok:false,error:'ORIGIN_DENIED'},403);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(request.method!=='GET')return json({ok:false,error:'METHOD_NOT_ALLOWED'},405);
    const name=url.searchParams.get('team'),game=url.searchParams.get('game');
    if(!name||name.length>180||!Object.hasOwn(GAMES,game)||[...url.searchParams.keys()].some(k=>!['team','game','refresh'].includes(k)))return json({ok:false,error:'INVALID_REQUEST'},400);
    try {
      const authUrl=new URL(request.url);authUrl.pathname=admin?'/admin-data':'/snapshot';authUrl.search='';
      const {auth,body,denied}=await boundedRead(async()=>{
        const auth=await crm(new Request(authUrl,{headers:request.headers}),env,ctx);
        return auth.ok?{auth,body:await auth.json()}:{auth,denied:await auth.text()};
      },authTimeoutMs);
      if(!auth.ok)return new Response(denied,{status:auth.status,headers});
      try{ownerMetrics=isSosiskaOwner(await authorizeMetrics?.(request,env));}catch{}
      const teams=admin?body.adminData?.teams:body.snapshot?.teams;
      const record=teams?.find(t=>t.name===name&&t.game===game);
      const id=record?.gameTeamId;
      if(typeof id!=='string'||!/^[1-9]\d{0,18}$/.test(id)||BigInt(id)>9223372036854775807n)return json({ok:false,error:'TEAM_NOT_LINKED',message:'У команды нет привязки к выбранной игре.'},404);
      const agent=GAMES[game],secret=env[agent.key],cacheKey=JSON.stringify([game,id]);
      if(typeof secret!=='string'||secret.length<32)throw Error('NOT_CONFIGURED');
      const old=cache.get(cacheKey);
      if(old&&now()-old.at<60000)return json({ok:true,data:{...old.data,stale:false}});
      if(!pending.has(cacheKey))pending.set(cacheKey,(async()=>{
        const controller=new AbortController();
        const data=await boundedRead(async()=>{
          const response=await fetchAgent(agent.origin+'/v1/invoke',{
            method:'POST',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/json'},
            body:JSON.stringify({protocolVersion:1,operation:'getTeamInfo',payload:{teamId:id,includeMembers:true}}),signal:controller.signal,redirect:'manual'});
          const result=await response.json();
          if(response.status===429||result.errorCode==='ROYAL_MATCH_AGENT_BUSY')throw Object.assign(Error('TEAM_LIVE_BUSY'),{busy:true});
          if(!response.ok||result.ok!==true||result.data?.TeamId!==id)throw Error('INVALID_TEAM');
          return projectTeam(result.data,new Date(now()).toISOString(),game);
        },agentTimeoutMs,controller);
        if(cache.size>=250&&!cache.has(cacheKey))cache.delete(cache.keys().next().value);
        cache.set(cacheKey,{data,at:Date.parse(data.fetchedAt)});return data;
      })().finally(()=>pending.delete(cacheKey)));
      try{return json({ok:true,data:{...await pending.get(cacheKey),stale:false}});}
      catch(error){if(old&&now()-old.at<86400000)return json({ok:true,data:{...old.data,stale:true}});if(error.busy)return json({ok:false,error:'TEAM_LIVE_BUSY',message:'Игровая сессия занята другим запросом. Повторите обновление немного позже.'},429);throw Error('UNAVAILABLE');}
    }catch{return json({ok:false,error:'TEAM_LIVE_UNAVAILABLE',message:'Данные игры временно недоступны. Повторите обновление.'},502);}
  };
}
