// Public-safe diagnostics for the admin agent cards. Add future agents here
// with their own probe; browser input cannot select an arbitrary upstream.
export const AGENT_CATALOG=Object.freeze([{id:'sosiska',name:'Сосиска',game:'RM'}]);
const level=n=>Number.isInteger(n)&&n>0&&n<=2147483647?n:null;
const validTime=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?v:null;
export async function readSosiskaStatus(invoke,now=Date.now){
 const result={...AGENT_CATALOG[0],status:'offline',level:null,maxLevel:null,levelVerified:false,
  checkedAt:new Date(now()).toISOString(),lastOnlineAt:null};
 try{
  const health=await invoke('health');
  const candidates=[{level:health?.levelSchedule?.level,maxLevel:health?.levelSchedule?.maxLevel,
   at:Number.isFinite(health?.levelSchedule?.lastCheckAt)?new Date(health.levelSchedule.lastCheckAt).toISOString():null},
   {level:health?.diagnostics?.level,maxLevel:health?.diagnostics?.maxLevel,at:validTime(health?.diagnostics?.checkedAt)}]
   .filter(x=>level(x.level)&&x.at).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
  if(candidates[0])Object.assign(result,{level:candidates[0].level,maxLevel:level(candidates[0].maxLevel),lastOnlineAt:candidates[0].at});
  if(health?.networkEnabled!==true||health?.sessionConfigured!==true)return result;
  // A recent successful game read proves the account online even when a separate
  // scheduled diagnostics read has expired. Configuration alone never proves it.
  const verified=Date.parse(health?.lastSuccessAt??health?.sessionLifecycle?.lastSuccessAt??'');
  if(Number.isFinite(verified)&&verified<=now()+5000&&now()-verified<=120*60000)
   return {...result,status:'online',checkedAt:new Date(now()).toISOString(),
     lastOnlineAt:new Date(verified).toISOString(),levelVerified:false};
  try{
   const live=await invoke('diagnostics'),checked=Date.parse(live?.checkedAt??''),at=now();
   if(live?.online!==true||!level(live.level)||!level(live.maxLevel)||live.level>live.maxLevel||
      !Number.isFinite(checked)||checked>at+5000||at-checked>90000)throw Error('INVALID_DIAGNOSTIC');
   return {...result,status:'online',level:live.level,maxLevel:live.maxLevel,levelVerified:true,
    checkedAt:live.checkedAt,lastOnlineAt:live.checkedAt};
  }catch(error){return {...result,status:error?.status===429?'busy':'offline',checkedAt:new Date(now()).toISOString()};}
 }catch(error){return {...result,status:error?.status===429?'busy':'offline'};}
}
