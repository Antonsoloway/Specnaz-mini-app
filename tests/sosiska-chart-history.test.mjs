import test from 'node:test';
import assert from 'node:assert/strict';
import {createPeriodAccumulator} from '../worker/src/sosiska-period.js';
test('interactive charts retain earliest individual intervals beyond 512 without changing full-history totals',()=>{
 const exact=createPeriodAccumulator('1',{retainIntervals:true}),bounded=createPeriodAccumulator('1');
 for(let n=801;n>=1;n--){const r={sequence:n,snapshot:{teamId:'1',capturedAt:new Date(Date.UTC(2026,8,1)+n*3600000).toISOString(),raw:{TeamName:'Team',Members:[{UserId:'p',Name:'Player',Level:n*10,Crown:n,HelpCount:0}]}},changes:{baseline:n===1}};exact.add(r);bounded.add(r);}
 const full=exact.result(),small=bounded.result();assert.equal(full.complete,true);assert.equal(full.series.length,800);assert.equal(full.players[0].series.length,800);assert.equal(small.series.length,512);
 assert.equal(full.series[0].hours,1);assert.equal(full.series[0].levels,10);assert.equal(full.series.at(-1).levels,10);assert.equal(full.series.some(p=>p.aggregated),false);
 assert.equal(full.players[0].levelGain,small.players[0].levelGain);assert.equal(full.series.reduce((n,p)=>n+p.levels,0),8000);
});
