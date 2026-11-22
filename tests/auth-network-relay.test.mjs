import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import relay from '../worker/network-relay/public/_worker.js';
const primary='https://royal-crm-miniapp-api.tropical-spoon.workers.dev';
const alternate='https://royal-crm-api-relay.pages.dev';
const origin='https://antonsoloway.github.io';
function transport(fetch){
 const sandbox={fetch,URL,URLSearchParams,Request,Response,AbortController,console:{warn(){}},
 location:{search:''},setTimeout,clearTimeout,Telegram:{WebApp:{initData:'fixture'}}};
 sandbox.window=sandbox;vm.createContext(sandbox);
 const src=fs.readFileSync(new URL('../transport-v0514.js',import.meta.url),'utf8').replace('AUTH_RETRY_DELAY_MS = 350','AUTH_RETRY_DELAY_MS = 0');
 vm.runInContext(src,sandbox);return sandbox.fetch;
}
test('only a transport failure switches auth and subsequent protected requests to the same-backend relay',async()=>{
 const calls=[];const fetch=transport(async(input,init)=>{const url=typeof input==='string'?input:input.url;calls.push({url,init});if(url.startsWith(primary))throw new TypeError('Failed to fetch');return Response.json({ok:true,access:true,session:'fixture'});});
 await fetch(primary+'/auth',{method:'POST',body:'signed-fixture'});
 await fetch(primary+'/admin-data',{headers:{Authorization:'Bearer fixture'}});
 assert.deepEqual(calls.map(c=>new URL(c.url).origin),[primary,alternate,alternate]);
 assert.equal(calls[1].init.body,'signed-fixture');
 assert.equal(calls[2].init.headers.Authorization,'Bearer fixture');
});
for(const status of [200,401,403,503])test('an HTTP '+status+' response never triggers alternate authorization',async()=>{
 let calls=0;const fetch=transport(async()=>{calls++;return Response.json({ok:status===200},{status});});
 assert.equal((await fetch(primary+'/auth',{method:'POST'})).status,status);assert.equal(calls,1);
});
test('an uncertain write is not resent to a second endpoint',async()=>{
 let calls=0;const fetch=transport(async()=>{calls++;throw new TypeError('offline');});
 await assert.rejects(fetch(primary+'/admin-write',{method:'POST',body:'fixture-request-id'}));assert.equal(calls,1);
});
test('non-CRM origins are never routed through the relay',async()=>{
 let seen='';const fetch=transport(async input=>{seen=input;return new Response('ok');});
 await fetch('https://other.test/read');assert.equal(seen,'https://other.test/read');
});
for(const status of [200,401,403])test('relay streams response '+status+' and preserves origin, bearer and body for original authorization',async()=>{
 let seen;const request=new Request(alternate+'/auth?fixture=1',{method:'POST',headers:{Origin:origin,Authorization:'Bearer fixture','Content-Type':'application/json'},body:'{"initData":"fixture"}'});
 const response=await relay.fetch(request,{CRM_API:{async fetch(r){seen=r;return new Response('fixture-result',{status,headers:{'Access-Control-Allow-Origin':origin,'Cache-Control':'private, no-store'}});}}});
 assert.equal(seen.url,primary+'/auth?fixture=1');assert.equal(seen.headers.get('Origin'),origin);assert.equal(seen.headers.get('Authorization'),'Bearer fixture');assert.equal(await seen.text(),'{"initData":"fixture"}');assert.equal(response.status,status);assert.equal(await response.text(),'fixture-result');assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);assert.equal(response.headers.get('Cache-Control'),'private, no-store');
});
test('relay has one fixed service destination even when a query contains another URL',async()=>{
 let seen;await relay.fetch(new Request(alternate+'/health?url=https://other.test/'),{CRM_API:{fetch(r){seen=r.url;return new Response('ok');}}});assert.equal(new URL(seen).origin,primary);
});
test('missing relay binding fails closed and never fabricates an authenticated response',async()=>{
 const response=await relay.fetch(new Request(alternate+'/auth',{headers:{Origin:origin}}),{});assert.equal(response.status,503);assert.equal((await response.json()).error,'API_RELAY_UNAVAILABLE');
});
