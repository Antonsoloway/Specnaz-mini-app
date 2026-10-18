// Dedicated Royal Kingdom observation store. No RM data, tokens or raw game packets.
const RK_ORIGIN='https://specnaz-royal-kingdom-search-stage1.soloway3852.workers.dev';
const EVENT_ORIGIN='https://specnaz-royal-kingdom-events-stage2.soloway3852.workers.dev';
const ident=v=>typeof v==='string'&&/^[1-9]\d{0,18}$/.test(v)&&BigInt(v)<=9223372036854775807n;
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const safeError=e=>/^RK_[A-Z_]+$/.test(e?.message??'')?e.message:'RK_MONITOR_UNAVAILABLE';
export const normalizeKingdomTeam=t=>{
 if(t?.Status!==0||!ident(t.TeamId)||!Array.isArray(t.Members)||t.Members.length>50)throw Error('RK_TEAM_INVALID');
 const members=t.Members.map(m=>{
  if(!ident(m.UserId)||typeof m.Name!=='string'||!Number.isSafeInteger(m.Level)||m.Level<0)throw Error('RK_TEAM_INVALID');
  return {UserId:m.UserId,Name:m.Name,Level:m.Level,Crown:Number.isSafeInteger(m.Cup)&&m.Cup>=0?m.Cup:null,Cup:Number.isSafeInteger(m.Cup)&&m.Cup>=0?m.Cup:null,HelpCount:Number.isSafeInteger(m.HelpCount)&&m.HelpCount>=0?m.HelpCount:null};
 });
 if(new Set(members.map(m=>m.UserId)).size!==members.length)throw Error('RK_TEAM_INVALID');
 return {...t,TeamLogo:t.TeamLogo??t.Logo??null,Members:members,MinCrown:t.MinCup??null,Type:t.IsOpen,Game:'rk',metricAliases:{Crown:'Cup'}};
};
const ms=minutes=>minutes*60000;
export function createKingdomMonitor({storage,env,fetcher=fetch,now=Date.now,setAlarm=async()=>{},deleteAlarm=async()=>{}}){
 const watchesKey='rk:watches:v1',watchMap=async()=>await storage.get(watchesKey)||{};
 const metaKey=id=>'rk:meta:'+id,recordKey=(id,n)=>'rk:record:'+id+':'+n;
 async function upstream(origin,secret,operation,payload={}){
  if(typeof secret!=='string'||secret.length<32)throw Error('RK_NOT_CONFIGURED');
  const r=await fetcher(origin+'/v1/invoke',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+secret},
   body:JSON.stringify({protocolVersion:1,operation,payload}),redirect:'manual'});
  const data=await r.json();
  if(!r.ok||data?.ok!==true||!data.data)throw Error('RK_UPSTREAM_UNAVAILABLE');
  return data.data;
 }
 const readTeam=async teamId=>normalizeKingdomTeam(await upstream(RK_ORIGIN,env.RK_AGENT_API_KEY,'getTeamInfo',{teamId,includeMembers:true}));
 async function eventFor(teamId){
  try{
   const battle=await upstream(EVENT_ORIGIN,env.RK_EVENT_API_KEY,'getTeamClash');
   if(battle.available!==true||battle.eventType!=='teamClash')return {available:false};
   const row=battle.teams.find(t=>t.teamId===teamId);
   if(!row)return {available:false,reason:'OUTSIDE_AIA_GROUP'};
   return {available:true,kind:'battle',eventId:battle.eventId,groupId:battle.groupId,teamId,teamScore:row.score,
    groupObservedAt:battle.observedAt,players:battle.personalTeamId===teamId?battle.personalResults.map(p=>({userId:p.userId,name:p.name,score:p.score})):[],
    personalScoresAvailable:battle.personalTeamId===teamId};
  }catch{return {available:false,reason:'EVENT_NOT_AVAILABLE'};}
 }
 function diff(before,after){
  if(!before)return {baseline:true};
  const a=new Map(before.raw.Members.map(m=>[m.UserId,m])),b=new Map(after.raw.Members.map(m=>[m.UserId,m]));
  const changed=[];
  for(const [id,m]of b){const old=a.get(id);if(!old)continue;const changes=[];
   for(const field of ['Level','Crown','HelpCount'])if(Number.isSafeInteger(m[field])&&Number.isSafeInteger(old[field])&&m[field]!==old[field])
    changes.push({field,before:old[field],after:m[field],delta:m[field]-old[field]});
   if(changes.length)changed.push({userId:id,name:m.Name,changes});
  }
  const prev=before.tournament,cur=after.tournament;
  let tournament={comparable:false,reason:'NO_COMPARABLE_EVENT'};
  if(cur?.available&&prev?.available&&cur.kind===prev.kind&&cur.eventId===prev.eventId&&cur.groupId===prev.groupId&&
    Number.isSafeInteger(cur.teamScore)&&Number.isSafeInteger(prev.teamScore)&&cur.teamScore>=prev.teamScore){
   const previousPlayers=new Map((prev.players||[]).map(p=>[p.userId,p]));
   const players=(cur.players||[]).flatMap(p=>{const old=previousPlayers.get(p.userId);return old&&Number.isSafeInteger(p.score)&&Number.isSafeInteger(old.score)&&p.score>=old.score?
    [{userId:p.userId,name:p.name,delta:p.score-old.score}]:[];});
   tournament={comparable:true,teamScoreDelta:cur.teamScore-prev.teamScore,players,
    knownPlayerProgress:players.reduce((n,p)=>n+p.delta,0)};
  }else if(cur?.available&&prev?.available&&(cur.eventId!==prev.eventId||cur.groupId!==prev.groupId))tournament={comparable:false,reason:'TOURNAMENT_CHANGED'};
  return {baseline:false,from:before.capturedAt,to:after.capturedAt,
   joined:[...b.values()].filter(m=>!a.has(m.UserId)),left:[...a.values()].filter(m=>!b.has(m.UserId)),members:changed,tournament};
 }
 async function schedule(watches){
  const due=Object.values(watches).map(w=>w.nextDueAt).filter(Number.isFinite);
  if(due.length)await setAlarm(Math.max(now()+60000,Math.min(...due)));
  else await deleteAlarm();
 }
 async function capture(teamId,watches){
  watches??=await watchMap();
  const team=await readTeam(teamId);
  const oldMeta=await storage.get(metaKey(teamId))||{head:0};
  const prev=oldMeta.head?await storage.get(recordKey(teamId,oldMeta.head)):null;
  const clock=Math.max(now(),prev?Date.parse(prev.snapshot.capturedAt)+1:0);
  const snapshot={teamId,capturedAt:new Date(clock).toISOString(),raw:team,tournament:await eventFor(teamId)};
  const sequence=oldMeta.head+1,record={sequence,snapshot,changes:diff(prev?.snapshot,snapshot)};
  await storage.put(recordKey(teamId,sequence),record);
  await storage.put(metaKey(teamId),{head:sequence,teamName:team.TeamName,teamLogo:team.TeamLogo,lastSuccessAt:snapshot.capturedAt});
  if(watches[teamId]){
   watches[teamId]={...watches[teamId],teamName:team.TeamName,teamLogo:team.TeamLogo,lastSuccessAt:snapshot.capturedAt,
    nextDueAt:now()+ms(watches[teamId].intervalMinutes),lastError:null};
   await storage.put(watchesKey,watches);await schedule(watches);
  }
  return {teamId,sequence,capturedAt:snapshot.capturedAt};
 }
 async function perform(b){
  const teamId=b.teamId;
  if(['watch','unwatch','capture','history'].includes(b.operation)&&!ident(teamId))throw Error('RK_INVALID_REQUEST');
  if(b.operation==='list'){
   const watches=Object.values(await watchMap()).map(({nextDueAt,...w})=>w);
   return {watches};
  }
  if(b.operation==='watch'){
   if(!Number.isInteger(b.intervalMinutes)||b.intervalMinutes<60||b.intervalMinutes>10080)throw Error('RK_INVALID_REQUEST');
   const watches=await watchMap();
   if(!watches[teamId]&&Object.keys(watches).length>=100)throw Error('RK_WATCH_LIMIT');
   watches[teamId]={teamId,intervalMinutes:b.intervalMinutes,lastSuccessAt:watches[teamId]?.lastSuccessAt??null,lastError:null,
    nextDueAt:now()+ms(b.intervalMinutes),teamName:watches[teamId]?.teamName??null,teamLogo:watches[teamId]?.teamLogo??null};
   await storage.put(watchesKey,watches);await schedule(watches);
   if(!(await storage.get(metaKey(teamId))))await capture(teamId,watches);
   return {teamId,watching:true};
  }
  if(b.operation==='unwatch'){
   const watches=await watchMap();delete watches[teamId];await storage.put(watchesKey,watches);await schedule(watches);
   return {teamId,watching:false};
  }
  if(b.operation==='capture')return capture(teamId);
  if(b.operation==='history'){
   if(b.limit!==undefined&&(!Number.isInteger(b.limit)||b.limit<1||b.limit>20)||
     b.before!==undefined&&(!Number.isSafeInteger(b.before)||b.before<1))throw Error('RK_INVALID_REQUEST');
   const meta=await storage.get(metaKey(teamId)),head=meta?.head||0,limit=b.limit??5;
   const start=Math.min(head,b.before===undefined?head:b.before-1),records=[];
   for(let n=start;n>0&&records.length<limit;n--){
    const record=await storage.get(recordKey(teamId,n));
    if(!record)throw Error('RK_HISTORY_INCOMPLETE');records.push(record);
   }
   return {teamId,records,nextBefore:records.at(-1)?.sequence>1?records.at(-1).sequence:null};
  }
  throw Error('RK_INVALID_REQUEST');
 }
 async function alarm(){
  const watches=await watchMap(),due=Object.values(watches).filter(w=>w.nextDueAt<=now()).sort((a,b)=>a.nextDueAt-b.nextDueAt).slice(0,4);
  for(const w of due){
   try{await capture(w.teamId,watches);}
   catch(error){watches[w.teamId]={...w,nextDueAt:now()+Math.min(ms(w.intervalMinutes),15*60000),lastError:safeError(error)};await storage.put(watchesKey,watches);}
  }
  await schedule(watches);
 }
 return {perform,alarm};
}
export class SosiskaKingdomMonitor {
 constructor(ctx,env){this.ctx=ctx;this.env=env;this.tail=Promise.resolve();}
 serialize(fn){const next=this.tail.then(fn);this.tail=next.catch(()=>{});return next;}
 service(){return createKingdomMonitor({storage:this.ctx.storage,env:this.env,setAlarm:t=>this.ctx.storage.setAlarm(t),
  deleteAlarm:()=>this.ctx.storage.deleteAlarm()});}
 fetch(request){return this.serialize(async()=>{
  try{const body=await request.json();return json({ok:true,data:await this.service().perform(body)});}
  catch(error){return json({ok:false,error:safeError(error)},502);}
 });}
 alarm(){return this.serialize(()=>this.service().alarm());}
}
