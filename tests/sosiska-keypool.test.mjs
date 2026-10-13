import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analysisKeys,requestSosiskaAnalysis} from '../worker/src/sosiska-analysis.js';
import {wrapSosiskaKeyTransfer} from '../worker/src/sosiska-key-transfer.js';
test('all configured keys used with deduplication and no model fallback',async()=>{
 const env={SOSISKA_GROQ_KEY:'one',SOSISKA_GROQ_KEYS:'["one","two","three"]'};
 assert.deepEqual(analysisKeys(env),['one','two','three']);const tried=[];
 const out=await requestSosiskaAnalysis({env,input:{},task:'test',fetchAI:async(url,init)=>{
  tried.push(init.headers.Authorization);assert.equal(JSON.parse(init.body).model,'openai/gpt-oss-120b');
  return tried.length<3?Response.json({}, {status:429}):Response.json({choices:[{finish_reason:'stop',message:{content:'ok'}}]});
 }});
 assert.equal(new Set(tried).size,3);assert.equal(out.text,'ok');assert.ok(!JSON.stringify(out).includes('Bearer'));
});
test('temporary exhausted pool remains retryable, invalid pool fails safely',async()=>{
 await assert.rejects(()=>requestSosiskaAnalysis({env:{SOSISKA_GROQ_KEYS:'["a","b"]'},input:{},task:'',fetchAI:async()=>Response.json({},{status:429})}),e=>!e.permanent&&e.message==='ANALYSIS_PROVIDER_UNAVAILABLE');
 assert.throws(()=>analysisKeys({SOSISKA_GROQ_KEYS:'{"key":"private"}'}),/KEYS_INVALID/);
});
const secret='a'.repeat(64),env={SOSISKA_KEY_TRANSFER:secret,SOSISKA_KEY_TRANSFER_UNTIL:String(Date.now()+600000),GROQ_API_KEY:'private',GROQ_INTERNAL_API_KEY_1:'private',GROQ_INTERNAL_API_KEY_2:'another'};
const request=(auth='Bearer '+secret)=>new Request('https://local/__sosiska_keys_v1',{method:'POST',headers:{Authorization:auth}});
test('transfer forwards original entry, keeps scheduled handler, rejects unconfigured/expired/foreign auth',async()=>{
 const scheduled=()=>42;let calls=0;const original={fetch:async()=>{calls++;return new Response('original');},scheduled};
 const wrapped=wrapSosiskaKeyTransfer(original,{mode:'source'});assert.equal(wrapped.scheduled,scheduled);
 assert.equal(await (await wrapped.fetch(new Request('https://local/webhook'),env,{})).text(),'original');assert.equal(calls,1);
 for(const e of [{},{...env,SOSISKA_KEY_TRANSFER_UNTIL:Date.now()-1},{...env,SOSISKA_KEY_TRANSFER_UNTIL:Date.now()+7200000}])assert.equal((await wrapped.fetch(request(),e,{})).status,404);
 assert.equal((await wrapped.fetch(request('wrong'),env,{})).status,404);
});
test('keys encrypted in response, never plaintext and other secrets not exported',async()=>{
 const wrapped=wrapSosiskaKeyTransfer({}, {mode:'source'});
 const envelope=await (await wrapped.fetch(request(),{...env,BOT_TOKEN:'not-exported'},{})).json();
 assert.equal(envelope.version,1);assert.ok(!JSON.stringify(envelope).includes('private'));
 const raw=Uint8Array.from(secret.match(/../g),s=>parseInt(s,16)),aes=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['decrypt']);
 const decoded=JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:Uint8Array.from(atob(envelope.iv),c=>c.charCodeAt(0)),additionalData:new TextEncoder().encode('sosiska-groq-transfer-v1')},aes,Uint8Array.from(atob(envelope.ciphertext),c=>c.charCodeAt(0)))));
 assert.deepEqual(decoded.keys,['private','another']);assert.ok(!JSON.stringify(decoded).includes('not-exported'));
});
test('target transfer path dispatches only start/status to existing named job object',async()=>{
 let calls=0;const wrapped=wrapSosiskaKeyTransfer({}, {mode:'target'});
 const e={...env,SOSISKA_ANALYSIS:{idFromName:name=>{assert.equal(name,'full-history-v1');return 'id';},get:()=>({fetch:async()=>{calls++;return Response.json({ok:true});}})}};
 for(const operation of ['capture','watch','getSecrets']){const r=await wrapped.fetch(new Request('https://local/__sosiska_keys_v1',{method:'POST',headers:{Authorization:'Bearer '+secret},body:JSON.stringify({operation})}),e,{});assert.equal(r.status,400);}
 const r=await wrapped.fetch(new Request('https://local/__sosiska_keys_v1',{method:'POST',headers:{Authorization:'Bearer '+secret},body:'{"operation":"status"}'}),e,{});assert.equal(r.status,200);assert.equal(calls,1);
});
test('provider failures carry safe status counts and actionable classifications',async()=>{
 for(const [status,code] of [[401,'ANALYSIS_KEYS_REJECTED'],[403,'ANALYSIS_KEYS_REJECTED'],[413,'ANALYSIS_INPUT_TOO_LARGE'],[400,'ANALYSIS_REQUEST_REJECTED']]){
  await assert.rejects(()=>requestSosiskaAnalysis({env:{SOSISKA_GROQ_KEY:'private'},input:{},task:'',fetchAI:async()=>Response.json({error:{message:'private provider details'}},{status})}),e=>{assert.equal(e.message,code);assert.equal(e.permanent,true);assert.equal(e.diagnostics.statuses[status],1);assert.ok(!JSON.stringify(e).includes('private'));return true;});
 }
});
