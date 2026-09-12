import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const source = ['36_GOLUB_OWNER_WEBHOOK_INGRESS.js','37_GOLUB_OWNER_COMMIT_OUTBOX.js']
  .map(name => readFileSync(new URL('../apps-script-live/' + name, import.meta.url), 'utf8')).join('\n');
const receipt = {messageId:'501', botUserId:'777', date:1000,
  messages:[{messageId:'501', botUserId:'777', date:1000}]};
const answer = {plain:'Точный ответ — 11 сентября.', commitAnswer:'Точный ответ — 11 сентября.',
  commit:{fixture:'signed-envelope'}};

function fixture({locks=[true], aiError=null, sendError=null, hasTimer=true, propertyFault=null}={}) {
  const values = new Map([['GOLUB_OWNER_WEBHOOK_ENABLED','1'],['GOLUB_OWNER_USER_ID','42'],
    ['GOLUB_OWNER_WEBHOOK_QUERY_SECRET','fixture-secret'],['GOLUB_OWNER_LAST_ERROR','']]);
  const calls = {locks:0, ai:0, send:0, commit:0, createTimer:0, logs:[], committed:[]};
  const write=(k,v)=>{if(propertyFault?.(k,v))throw new Error('fixture property outage');values.set(k,v);};
  const props = {getProperty:k=>values.has(k)?values.get(k):null, setProperty:write,
    setProperties:o=>Object.entries(o).forEach(([k,v])=>write(k,v)),
    getProperties:()=>Object.fromEntries(values), deleteProperty:k=>values.delete(k)};
  let uuid=0;
  const context = {PropertiesService:{getScriptProperties:()=>props},
    LockService:{getScriptLock:()=>({tryLock:()=>locks[Math.min(calls.locks++,locks.length-1)],releaseLock:()=>{}})},
    ScriptApp:{getProjectTriggers:()=>hasTimer?[{getHandlerFunction:()=>'GOLUB_OWNER_retryPendingCommits'}]:[],
      newTrigger:()=>({timeBased:()=>({everyMinutes:()=>({create:()=>{calls.createTimer++;hasTimer=true;}})})})},
    Utilities:{Charset:{UTF_8:'utf8'},DigestAlgorithm:{SHA_256:'sha256'},
      base64EncodeWebSafe:x=>Buffer.from(x).toString('base64url'),
      base64DecodeWebSafe:x=>Buffer.from(x,'base64url'),
      computeDigest:(_,x)=>createHash('sha256').update(x).digest(),
      newBlob:x=>({getDataAsString:()=>Buffer.from(x).toString('utf8')}),getUuid:()=>`fixture-${++uuid}`},
    HtmlService:{createHtmlOutput:x=>JSON.parse(x)},Logger:{log:x=>calls.logs.push(x)}};
  vm.createContext(context);vm.runInContext(source,context);
  context.GOLUB_OWNER_aiAnswer_=()=>{calls.ai++;if(aiError)throw new Error(aiError);return answer;};
  context.GOLUB_OWNER_sendAnswer_=()=>{calls.send++;if(sendError)throw new Error(sendError);return receipt;};
  context.GOLUB_OWNER_commitAnswer_=(a,r)=>{calls.commit++;calls.committed.push({a,r});return {ok:true,committed:true};};
  const event={parameter:{golub_owner_key:'fixture-secret'},postData:{contents:JSON.stringify({update_id:100,
    message:{message_id:1,date:1000,chat:{type:'private',id:42},from:{id:42},text:'question'}})}};
  return {context,values,calls,props,event,run:()=>context.GOLUB_OWNER_tryHandleTelegram_(event),
    setLocks:next=>{locks=next;calls.locks=0;},
    diagnostic:()=>JSON.parse(values.get('GOLUB_OWNER_LAST_DIAGNOSTIC_V1')||'null')};
}

test('existing timer does not acquire the sheet lock',()=>{
  const f=fixture({locks:[false]});f.context.GOLUB_OWNER_ensureCommitTimer_();
  assert.equal(f.calls.locks,0);assert.equal(f.calls.createTimer,0);
});
test('missing timer creation remains serialized and idempotent',()=>{
  const f=fixture({hasTimer:false});f.context.GOLUB_OWNER_ensureCommitTimer_();
  f.context.GOLUB_OWNER_ensureCommitTimer_();assert.equal(f.calls.createTimer,1);assert.equal(f.calls.locks,1);
});
test('primary AI failure survives secondary cursor lock failure and webhook returns OK',()=>{
  const f=fixture({locks:[false],aiError:'AI_HTTP_400_PLANNER_CONTRACT_REJECTED'});
  assert.equal(f.run().ok,true);assert.equal(f.calls.ai,1);assert.equal(f.calls.send,1);
  assert.equal(f.diagnostic().stage,'worker_request');
  assert.equal(f.diagnostic().primaryCode,'AI_HTTP_400_PLANNER_CONTRACT_REJECTED');
  assert.deepEqual(f.diagnostic().secondaryCodes,['COMMIT_OUTBOX_BUSY']);
  assert.equal(f.run().ok,true);assert.equal(f.calls.send,1);assert.equal(f.calls.ai,1);
  f.setLocks([true]);f.context.GOLUB_OWNER_retryPendingCommits();
  assert.equal(f.values.get('GOLUB_OWNER_LAST_UPDATE_ID'),'100');assert.equal(f.calls.commit,0);
});
test('missing timer plus busy lock is safely diagnosed without a secondary crash',()=>{
  const f=fixture({locks:[false],hasTimer:false});assert.equal(f.run().ok,true);
  assert.equal(f.calls.ai,0);assert.equal(f.calls.send,1);
  assert.equal(f.diagnostic().primaryCode,'COMMIT_OUTBOX_BUSY');assert.equal(f.diagnostic().stage,'ensure_timer');
});
test('real receipt recovers prepared commit after post-send lock failure, without resending',()=>{
  const f=fixture({locks:[true,false]});assert.equal(f.run().ok,true);
  assert.equal(f.calls.send,1);assert.equal(f.calls.commit,0);
  assert.equal(f.diagnostic().stage,'mark_commit_sent');assert.equal(f.diagnostic().deliveryConfirmed,true);
  assert.equal(JSON.parse(f.values.get('GOLUB_OWNER_COMMIT_V1_100_META')).state,'prepared');
  assert.equal(f.run().ok,true);assert.equal(f.calls.ai,1);assert.equal(f.calls.send,1);
  f.setLocks([true]);const result=f.context.GOLUB_OWNER_retryPendingCommits();
  assert.equal(result.committed,1);assert.equal(f.calls.commit,1);assert.equal(f.calls.send,1);
  assert.equal(f.calls.committed[0].a.commitAnswer,answer.commitAnswer);
  assert.equal(f.calls.committed[0].r.messageId,receipt.messageId);
  assert.equal(f.values.has('GOLUB_OWNER_COMMIT_V1_100_META'),false);
});
test('ambiguous send gets no fallback, no resend and no fabricated memory commit',()=>{
  const f=fixture({sendError:'timeout after Telegram request'});assert.equal(f.run().ok,true);
  assert.equal(f.calls.send,1);assert.equal(f.diagnostic().deliveryConfirmed,false);
  f.run();f.context.GOLUB_OWNER_retryPendingCommits();
  assert.equal(f.calls.send,1);assert.equal(f.calls.commit,0);
  assert.equal(JSON.parse(f.values.get('GOLUB_OWNER_COMMIT_V1_100_META')).state,'prepared');
});
test('ordinary successful answer commits the exact payload once',()=>{
  const f=fixture();assert.equal(f.run().ok,true);assert.equal(f.calls.send,1);assert.equal(f.calls.commit,1);
  f.run();assert.equal(f.calls.send,1);assert.equal(f.calls.commit,1);
  assert.equal(f.calls.committed[0].a.commitAnswer,answer.commitAnswer);
});
test('reentrant delivery during an active send cannot send twice',()=>{
  const f=fixture();f.context.GOLUB_OWNER_sendAnswer_=()=>{f.calls.send++;assert.equal(f.run().ok,true);return receipt;};
  f.run();assert.equal(f.calls.send,1);assert.equal(f.calls.ai,1);
});
test('property failures inside catch cannot escape; secrets never enter diagnostic logs',()=>{
  const f=fixture({aiError:'provider rejected https://private.invalid/token-secret?key=supersecret',
    propertyFault:k=>k.includes('DIAGNOSTIC')||k.includes('LAST_ERROR')||k.includes('DELIVERY')});
  assert.equal(f.run().ok,true);assert.equal(f.calls.send,0);
  const logs=f.calls.logs.join('\n');assert.ok(logs.includes('UNCLASSIFIED'));
  assert.ok(!/token-secret|supersecret|private.invalid/.test(logs));
});
test('other owners and groups remain outside the owner AI path',()=>{
  const f=fixture();const data=JSON.parse(f.event.postData.contents);data.message.from.id=99;
  f.event.postData.contents=JSON.stringify(data);assert.equal(f.run().ok,true);assert.equal(f.calls.ai,0);
  data.message.chat.type='supergroup';f.event.postData.contents=JSON.stringify(data);
  assert.equal(f.run(),null);assert.equal(f.calls.send,0);
});
test('unconfirmed old prepared payload is retained without commit',()=>{
  const f=fixture();f.context.GOLUB_OWNER_prepareCommit_(answer,100,f.props);
  f.context.GOLUB_OWNER_retryPendingCommits();assert.equal(f.calls.commit,0);assert.equal(f.calls.send,0);
  assert.ok(f.values.has('GOLUB_OWNER_COMMIT_V1_100_META'));
});
