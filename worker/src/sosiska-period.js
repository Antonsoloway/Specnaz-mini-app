// Streaming full-history statistics. Crown gains are not converted to completed rounds.
export const sortedMembers=members=>[...(members??[])].sort((a,b)=>
 (Number(b.Level??0)+Number(b.Crown??0))-(Number(a.Level??0)+Number(a.Crown??0))||
 Number(b.Level??0)-Number(a.Level??0)||String(a.UserId).localeCompare(String(b.UserId)));
export function createPeriodAccumulator(teamId){
 let newer=null,expected=null,head=null,count=0,from=null,to=null,teamName='',complete=false;
 const players=new Map();
 const ensure=m=>{
  let p=players.get(m.UserId);
  if(!p){p={userId:m.UserId,name:m.Name,current:count===0,level:m.Level,crown:m.Crown,levelGain:0,crownGain:0,helpGain:0,observedHours:0,levelHours:0,crownHours:0,levelResets:0,crownResets:0,helpResets:0,joined:0,left:0,intervals:0};players.set(m.UserId,p);}
  return p;
 };
 const numeric=v=>Number.isSafeInteger(v)&&v>=0;
 function add(record){
  if(complete)throw Error('PERIOD_ALREADY_COMPLETE');
  const s=record?.snapshot,n=record?.sequence;
  if(s?.teamId!==teamId||!Number.isSafeInteger(n)||n<1||!Array.isArray(s.raw?.Members)||!Number.isFinite(Date.parse(s.capturedAt)))throw Error('PERIOD_INVALID');
  if(expected===null){head=n;expected=n;to=s.capturedAt;teamName=s.raw.TeamName;}
  if(n!==expected)throw Error('PERIOD_HISTORY_INCOMPLETE');
  const old=new Map(s.raw.Members.map(m=>[m.UserId,m]));
  if(old.size!==s.raw.Members.length)throw Error('PERIOD_INVALID');
  for(const m of old.values())ensure(m);
  if(newer){
   const dt=(Date.parse(newer.capturedAt)-Date.parse(s.capturedAt))/3600000;
   if(!(dt>0))throw Error('PERIOD_INVALID_TIME');
   const next=new Map(newer.raw.Members.map(m=>[m.UserId,m]));
   for(const [id,m] of old){
    const p=ensure(m),v=next.get(id);
    if(!v){p.left++;continue;}
    p.observedHours+=dt;p.intervals++;
    for(const [field,gain,resets,hours] of [['Level','levelGain','levelResets','levelHours'],['Crown','crownGain','crownResets','crownHours'],['HelpCount','helpGain','helpResets',null]]){
     if(!numeric(m[field])||!numeric(v[field]))continue;
     const delta=v[field]-m[field];
     if(delta<0){p[resets]++;continue;}
     p[gain]+=delta;if(hours)p[hours]+=dt;
    }
   }
   for(const [id,m] of next)if(!old.has(id))ensure(m).joined++;
  }
  newer=s;from=s.capturedAt;count++;expected--;
  if(n===1){if(record.changes?.baseline!==true)throw Error('PERIOD_HISTORY_INCOMPLETE');complete=true;}
 }
 function result(){
  const rows=[...players.values()].map(p=>({...p,
   levelsPerHour:p.levelHours?p.levelGain/p.levelHours:null,
   crownsPerHour:p.crownHours?p.crownGain/p.crownHours:null}));
  rows.sort((a,b)=>Number(b.current)-Number(a.current)||(b.level+b.crown)-(a.level+a.crown)||a.userId.localeCompare(b.userId));
  return {teamId,teamName,from,to,snapshotCount:count,headSequence:head,complete,hours:count>1?(Date.parse(to)-Date.parse(from))/3600000:0,players:rows,
   precision:'observed-base-level-and-crown-counters',leagueRoundsAvailable:false};
 }
 return {add,result};
}
