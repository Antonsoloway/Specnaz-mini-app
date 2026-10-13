import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPeriodAccumulator,sortedMembers} from '../worker/src/sosiska-period.js';
const m=(id,level,crown=0)=>({UserId:id,Name:id,Level:level,Crown:crown,HelpCount:0});
const record=(n,members)=>({sequence:n,snapshot:{teamId:'1',capturedAt:new Date(Date.UTC(2026,9,13)+n*3600000).toISOString(),raw:{TeamName:'Team',Members:members}},changes:{baseline:n===1}});
test('whole period counts all adjacent intervals and rates, never crown-to-level conversion',()=>{
 const a=createPeriodAccumulator('1');
 a.add(record(3,[m('A',120,40)]));a.add(record(2,[m('A',110,20)]));a.add(record(1,[m('A',100,0)]));
 const r=a.result();assert.equal(r.complete,true);assert.equal(r.snapshotCount,3);assert.equal(r.players[0].levelGain,20);assert.equal(r.players[0].levelsPerHour,10);assert.equal(r.players[0].crownsPerHour,20);assert.equal(r.leagueRoundsAvailable,false);
});
test('resets, exits and re-entries do not invent progress across missing membership',()=>{
 const a=createPeriodAccumulator('1');
 a.add(record(5,[m('A',100,20)]));a.add(record(4,[m('A',100,10)]));a.add(record(3,[]));a.add(record(2,[m('A',100,100)]));a.add(record(1,[m('A',100,50)]));
 const p=a.result().players[0];assert.equal(p.crownGain,60);assert.equal(p.observedHours,2);assert.equal(p.joined,1);assert.equal(p.left,1);assert.equal(p.levelGain,0);
 const b=createPeriodAccumulator('1');b.add(record(3,[m('A',100,10)]));b.add(record(2,[m('A',100,0)]));b.add(record(1,[m('A',100,100)]));assert.equal(b.result().players[0].crownResets,1);assert.equal(b.result().players[0].crownGain,10);
});
test('current and departed players stay separate; sorting uses levels plus crowns',()=>{
 const a=createPeriodAccumulator('1');a.add(record(2,[m('A',100,10)]));a.add(record(1,[m('A',99,0),m('B',1000)]));
 const r=a.result();assert.equal(r.players[0].userId,'A');assert.equal(r.players[1].current,false);
 assert.deepEqual(sortedMembers([m('A',100,200),m('B',200),m('C',301)]).map(m=>m.UserId),['C','A','B']);
});
test('one snapshot has no speed; gaps and reversed time do not become complete period',()=>{
 const a=createPeriodAccumulator('1');a.add(record(1,[m('A',100)]));assert.equal(a.result().players[0].levelsPerHour,null);
 const b=createPeriodAccumulator('1');b.add(record(3,[m('A',100)]));assert.throws(()=>b.add(record(1,[m('A',99)])),/INCOMPLETE/);assert.equal(b.result().complete,false);
 const c=createPeriodAccumulator('1');c.add(record(2,[m('A',100)]));const old=record(1,[m('A',99)]);old.snapshot.capturedAt=record(3,[]).snapshot.capturedAt;assert.throws(()=>c.add(old),/TIME/);
});
test('activity rank, time series and hourly profile preserve observed progress',()=>{
 const a=createPeriodAccumulator('1');a.add(record(3,[m('Idle',1000),m('Active',120,20)]));a.add(record(2,[m('Idle',1000),m('Active',110,10)]));a.add(record(1,[m('Idle',1000),m('Active',100,0)]));
 const r=a.result();assert.equal(r.players[0].userId,'Active');assert.equal(r.series.reduce((n,p)=>n+p.levels,0),20);assert.equal(r.players[0].hourly.reduce((n,h)=>n+h.levels,0),20);assert.equal(r.players[0].series[0].from,record(1,[]).snapshot.capturedAt);assert.equal(r.players[0].hourly.find(h=>h.hour===4).levelsPerHour,10);
});
test('invalid/reset metrics do not create zero-tempo observations in hourly bins',()=>{
 const a=createPeriodAccumulator('1');a.add(record(2,[m('A',100,0)]));a.add(record(1,[m('A',100,20)]));const p=a.result().players[0];assert.equal(p.series[0].crowns,null);assert.equal(p.hourly.find(h=>h.hour===4).crownsPerHour,null);
});
test('comparison uses overlap and excludes boundary intervals, not lifetime totals',async()=>{
 const {comparePeriods}=await import('../worker/src/sosiska-period.js');const a=createPeriodAccumulator('1'),b=createPeriodAccumulator('2');
 for(const n of [4,3,2,1])a.add(record(n,[m('A',n*10)]));
 for(const n of [3,2,1]){const r=record(n,[m('B',n*5)]);r.snapshot.teamId='2';r.snapshot.capturedAt=new Date(Date.parse(r.snapshot.capturedAt)+3600000).toISOString();b.add(r);}
 const c=comparePeriods([a.result(),b.result()]);assert.equal(c.teams[0].hours,2);assert.equal(c.teams[0].levels,20);assert.equal(c.teams[1].levelsPerHour,5);
 assert.throws(()=>comparePeriods([{...a.result(),complete:false},b.result()]),/NEEDS_HISTORY/);
});
test('large histories remain bounded without losing all-period totals',()=>{
 const a=createPeriodAccumulator('1');for(let n=1100;n>0;n--)a.add(record(n,[m('A',n)]));const r=a.result();assert.ok(r.series.length<=512);assert.equal(r.series.reduce((n,p)=>n+p.levels,0),1099);assert.equal(r.players[0].hourly.reduce((n,h)=>n+h.levels,0),1099);
});
