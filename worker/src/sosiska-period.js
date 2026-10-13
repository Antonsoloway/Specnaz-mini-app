// Streaming full-history statistics. Crown gains are not converted to completed rounds.
export const sortedMembers=members=>[...(members??[])].sort((a,b)=>
 (Number(b.Level??0)+Number(b.Crown??0))-(Number(a.Level??0)+Number(a.Crown??0))||
 Number(b.Level??0)-Number(a.Level??0)||String(a.UserId).localeCompare(String(b.UserId)));
export function createPeriodAccumulator(teamId,{retainIntervals=false}={}){
 let newer=null,expected=null,head=null,count=0,from=null,to=null,teamName='',complete=false;
 const players=new Map(),series=[];
 const ensure=m=>{
  let p=players.get(m.UserId);
  if(!p){p={userId:m.UserId,name:m.Name,current:count===0,level:m.Level,crown:m.Crown,levelGain:0,crownGain:0,helpGain:0,observedHours:0,levelHours:0,crownHours:0,levelResets:0,crownResets:0,helpResets:0,joined:0,left:0,intervals:0,series:[],hourly:Array.from({length:24},(_,hour)=>({hour,hours:0,levelHours:0,crownHours:0,helpHours:0,levels:0,crowns:0,help:0}))};players.set(m.UserId,p);}
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
   const interval={from:s.capturedAt,to:newer.capturedAt,hours:dt,levels:0,crowns:0,help:0,active:0,observed:0};
   for(const [id,m] of old){
    const p=ensure(m),v=next.get(id);
    if(!v){p.left++;continue;}
    p.observedHours+=dt;p.intervals++;
    const point={from:s.capturedAt,to:newer.capturedAt,hours:dt,levels:null,crowns:null,help:null};
    for(const [field,gain,resets,hours] of [['Level','levelGain','levelResets','levelHours'],['Crown','crownGain','crownResets','crownHours'],['HelpCount','helpGain','helpResets',null]]){
     if(!numeric(m[field])||!numeric(v[field]))continue;
     const delta=v[field]-m[field];
     if(delta<0){p[resets]++;continue;}
     p[gain]+=delta;if(hours)p[hours]+=dt;point[{Level:'levels',Crown:'crowns',HelpCount:'help'}[field]]=delta;
    }
    interval.observed++;if(point.levels>0||point.crowns>0||point.help>0)interval.active++;
    for(const metric of ['levels','crowns','help'])interval[metric]+=point[metric]??0;
    appendPoint(p.series,point,retainIntervals);addHourly(p.hourly,point);
   }
   appendPoint(series,interval,retainIntervals);
   for(const [id,m] of next)if(!old.has(id))ensure(m).joined++;
  }
  newer=s;from=s.capturedAt;count++;expected--;
  if(n===1){if(record.changes?.baseline!==true)throw Error('PERIOD_HISTORY_INCOMPLETE');complete=true;}
 }
 function result(){
  const rows=[...players.values()].map(p=>({...p,
   levelsPerHour:p.levelHours?p.levelGain/p.levelHours:null,
   crownsPerHour:p.crownHours?p.crownGain/p.crownHours:null,
   series:[...p.series].reverse(),hourly:p.hourly.map(h=>({...h,levelsPerHour:h.levelHours?h.levels/h.levelHours:null,crownsPerHour:h.crownHours?h.crowns/h.crownHours:null}))}));
  rows.sort(activityOrder);
  return {teamId,teamName,from,to,snapshotCount:count,headSequence:head,complete,hours:count>1?(Date.parse(to)-Date.parse(from))/3600000:0,players:rows,series:[...series].reverse(),
   precision:'observed-base-level-and-crown-counters',leagueRoundsAvailable:false};
 }
 return {add,result};
}

// Rank activity by observed counter growth; crowns remain a separate unit.
export const activityOrder=(a,b)=>Number(b.levelGain>0||b.crownGain>0||b.helpGain>0)-Number(a.levelGain>0||a.crownGain>0||a.helpGain>0)||b.levelGain-a.levelGain||b.crownGain-a.crownGain||b.helpGain-a.helpGain||String(a.userId).localeCompare(String(b.userId));
// Keep long histories bounded. Merge adjacent old intervals without discarding totals.
function appendPoint(list,point,retainIntervals){
 list.push(point);
 if(!retainIntervals&&list.length>512){const b=list.pop(),a=list.pop(),merged={from:b.from,to:a.to,hours:a.hours+b.hours,aggregated:true};
  for(const k of ['levels','crowns','help','active','observed'])if(k in a)merged[k]=a[k]===null||b[k]===null?null:a[k]+b[k];
  list.push(merged);
 }
}
function addHourly(bins,p){
 let t=Date.parse(p.from),end=Date.parse(p.to);
 while(t<end){const next=Math.min(end,(Math.floor(t/3600000)+1)*3600000),hours=(next-t)/3600000,h=bins[(Math.floor(t/3600000)+3)%24];
  h.hours+=hours;for(const k of ['levels','crowns','help'])if(p[k]!==null){h[k]+=p[k]*hours/p.hours;h[{levels:'levelHours',crowns:'crownHours',help:'helpHours'}[k]]+=hours;}t=next;
 }
}
export function comparePeriods(periods){
 if(periods.length<2||periods.some(p=>!p.complete||p.snapshotCount<2))throw Error('COMPARISON_NEEDS_HISTORY');
 const from=new Date(Math.max(...periods.map(p=>Date.parse(p.from)))).toISOString(),to=new Date(Math.min(...periods.map(p=>Date.parse(p.to)))).toISOString();
 if(Date.parse(from)>=Date.parse(to))throw Error('COMPARISON_NO_OVERLAP');
 return {from,to,teams:periods.map(p=>{
  // Only wholly observed intervals: never prorate unknown play across a boundary.
  const points=p.series.filter(x=>Date.parse(x.from)>=Date.parse(from)&&Date.parse(x.to)<=Date.parse(to));
  const hours=points.reduce((n,x)=>n+x.hours,0),levels=points.reduce((n,x)=>n+x.levels,0),crowns=points.reduce((n,x)=>n+x.crowns,0),help=points.reduce((n,x)=>n+x.help,0);
  return {teamId:p.teamId,teamName:p.teamName,from:points[0]?.from,to:points.at(-1)?.to,hours,levels,crowns,help,levelsPerHour:hours?levels/hours:null,crownsPerHour:hours?crowns/hours:null,series:points};
 })};
}

