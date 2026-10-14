import test from 'node:test';
import assert from 'node:assert/strict';
import {hourlyDays,mskDateRange} from '../worker/src/sosiska-period.js';
import {prepareHistoryExport,downloadHistoryExport} from '../worker/src/sosiska-export.js';
const point=(from,to,levels)=>({from,to,levels});
test('MSK midnight, partial hours, gaps and resets preserve weighted totals',()=>{
 const series=[point('2026-10-12T20:30:00Z','2026-10-12T21:30:00Z',12),point('2026-10-13T21:00:00Z','2026-10-13T21:05:00Z',2),point('2026-10-14T21:00:00Z','2026-10-14T22:00:00Z',null)];
 const rows=hourlyDays(series,0,'levels','2026-10-12T20:30:00Z','2026-10-15T22:00:00Z');
 assert.equal(rows.find(r=>r.date==='2026-10-13').gain,6);
 assert.equal(rows.find(r=>r.date==='2026-10-13').hours,.5);
 assert.equal(rows.find(r=>r.date==='2026-10-14').rate,24);
 assert.equal(rows.find(r=>r.date==='2026-10-15').rate,null);
 assert.equal(rows.reduce((n,r)=>n+r.gain,0),8);
 const zero=hourlyDays([point('2026-10-12T21:00:00Z','2026-10-12T22:00:00Z',0)],0,'levels','2026-10-12T21:00:00Z','2026-10-12T22:00:00Z');assert.equal(zero[0].rate,0);
});
test('date picker includes the entire final MSK day and rejects invalid dates',()=>{
 assert.deepEqual(mskDateRange('2026-10-13','2026-10-13'),{from:'2026-10-12T21:00:00.000Z',to:'2026-10-13T21:00:00.000Z'});
 for(const args of [['2026-02-30','2026-03-01'],['2026-10-14','2026-10-13'],['','']])assert.throws(()=>mskDateRange(...args));
});
const env={SESSION_SECRET:'test-export-secret',RM_AGENT_API_KEY:'private-test-key'.repeat(4)};
const body={teamId:'9223372036854775807',...mskDateRange('2026-10-13','2026-10-14')};
test('download is signed, short-lived, exact team/range, streaming, and key stays private',async()=>{
 const now=Date.now(),ready=await prepareHistoryExport(new Request('https://api.test/admin-agent'),env,body,now);
 let calls=0;const upstream=async(url,init)=>{calls++;assert.deepEqual(JSON.parse(init.body),{operation:'export',...body});assert.equal(init.headers.Authorization,'Bearer '+env.RM_AGENT_API_KEY);return new Response('{"complete":true}',{headers:{'Content-Type':'application/json'}});};
 const response=await downloadHistoryExport(new Request(ready.url),env,upstream,now+1);assert.equal(response.status,200);assert.equal(await response.text(),'{"complete":true}');assert.equal(calls,1);assert.ok(response.headers.get('Content-Disposition').includes('.json'));assert.ok(!ready.url.includes(env.RM_AGENT_API_KEY));
 assert.equal((await downloadHistoryExport(new Request(ready.url),env,upstream,now+600001)).status,403);
 const url=new URL(ready.url);url.searchParams.set('token',url.searchParams.get('token').replace(/^./,'X'));assert.equal((await downloadHistoryExport(new Request(url),env,upstream,now)).status,403);
 assert.equal((await downloadHistoryExport(new Request('https://api.test/admin-agent-export'),env,upstream,now)).status,403);
 assert.equal(calls,1);
 assert.equal((await downloadHistoryExport(new Request(ready.url,{method:'HEAD'}),env,upstream,now)).status,200);assert.equal(calls,1);
});
