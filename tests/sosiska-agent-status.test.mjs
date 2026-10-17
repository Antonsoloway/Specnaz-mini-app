import test from 'node:test';
import assert from 'node:assert/strict';
import {readSosiskaStatus} from '../worker/src/agent-status.js';
import {createSosiskaApi,validateAgentAction} from '../worker/src/sosiska-api.js';
const at=Date.parse('2026-10-16T16:00:00Z');
const health={networkEnabled:true,sessionConfigured:true,levelSchedule:{level:14800,maxLevel:14800,lastCheckAt:at-600000}};
const diagnostic={online:true,level:14800,maxLevel:14800,checkedAt:new Date(at).toISOString()};
test('configured health alone never becomes online; current game read is required',async()=>{
 const calls=[];const result=await readSosiskaStatus(async op=>{calls.push(op);return op==='health'?health:diagnostic;},()=>at);
 assert.deepEqual(calls,['health','diagnostics']);assert.equal(result.status,'online');assert.equal(result.level,14800);assert.equal(result.levelVerified,true);
});
test('recent confirmed game success in health is online without fresh diagnostics',async()=>{
 const live={...health,lastSuccessAt:new Date(at-20000).toISOString()};
 const calls=[];
 const result=await readSosiskaStatus(async op=>{calls.push(op);if(op==='health')return live;throw Error('diagnostics unavailable');},()=>at);
 assert.equal(result.status,'online');assert.equal(result.level,14800);assert.deepEqual(calls,['health']);
 assert.equal(result.levelVerified,false);
 for(const value of [new Date(at-16*60000).toISOString(),new Date(at+6000).toISOString()])
  assert.equal((await readSosiskaStatus(async op=>op==='health'?{...live,lastSuccessAt:value}:{...diagnostic,online:false},()=>at)).status,'offline');
});
test('unavailable or busy game preserves last known level without a green status',async()=>{
 for(const [code,status]of[[502,'offline'],[429,'busy']]){
  const r=await readSosiskaStatus(async op=>{if(op==='health')return health;throw Object.assign(Error('private-key'),{status:code});},()=>at);
  assert.equal(r.status,status);assert.equal(r.level,14800);assert.equal(r.levelVerified,false);assert.doesNotMatch(JSON.stringify(r),/private-key/);
 }
});
test('disabled connection and invalid, old or future game reads cannot show online',async()=>{
 let calls=0;assert.equal((await readSosiskaStatus(async()=>{calls++;return {...health,networkEnabled:false};},()=>at)).status,'offline');assert.equal(calls,1);
 for(const value of [{...diagnostic,level:'14800'},{...diagnostic,checkedAt:new Date(at-91000).toISOString()},{...diagnostic,checkedAt:new Date(at+6000).toISOString()},{...diagnostic,online:false}])
  assert.equal((await readSosiskaStatus(async op=>op==='health'?health:value,()=>at)).status,'offline');
});
test('status action remains admin-only and exposes only the safe agent projection',async()=>{
 const request=()=>new Request('https://fixture/admin-agent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'status'})});
 const env={RM_AGENT_API_KEY:'secret-server-key'.repeat(3)};let calls=0;
 const denied=createSosiskaApi({authorizeAdmin:async()=>{throw Object.assign(Error(),{status:403});},fetchAgent:async()=>{calls++;}});
 assert.equal((await denied(request(),env)).status,403);assert.equal(calls,0);
 const allowed=createSosiskaApi({authorizeAdmin:async()=>{},fetchAgent:async(_,init)=>{
  calls++;const op=JSON.parse(init.body).operation;return Response.json({ok:true,data:op==='health'?{...health,privateToken:'should-not-leak',levelSchedule:{...health.levelSchedule,lastCheckAt:Date.now()}}:{...diagnostic,checkedAt:new Date().toISOString(),privateToken:'should-not-leak'}});
 }});
 const r=await allowed(request(),env),text=await r.text(),data=JSON.parse(text);
 assert.equal(r.status,200);assert.equal(data.data.agents[0].id,'sosiska');assert.equal(data.data.agents[0].status,'online');
 assert.doesNotMatch(text,/secret-server-key|privateToken|should-not-leak/);
 assert.throws(()=>validateAgentAction({operation:'status',agentUrl:'https://evil.invalid'}));
});
