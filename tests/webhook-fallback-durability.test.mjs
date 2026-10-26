import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../apps-script-live/05_RELIABLE_WEBHOOK_QUEUE.js', import.meta.url), 'utf8');
const start = source.indexOf('function doPost(e) {');
const end = source.indexOf('function processReliableWebhookQueue()', start);
assert.ok(start > -1 && end > start, 'expected real queue entrypoint');

function simulate({event='reputation',emergency=false,sheet=false,result='RETRY_LOCKED'}) {
  const raw = 'event=' + event + '\ntg_id=12345678';
  let queueCalls = 0;
  const context = {
    MINIAPP_handleStartWelcome_: () => null,
    RCWQ_getRawPostBody_: () => raw,
    RCWQ_extractHints_: () => ({event, eventKey:'test-key',tgId:'12345678'}),
    RCWQ_saveEmergencyRecord_: () => { if (!emergency) throw Error('property outage'); },
    RCWQ_appendRecordToQueue_: () => {queueCalls++; if (!sheet) throw Error('sheet outage');},
    RCWQ_deleteEmergencyRecord_: () => {},
    RCWQ_readHandlerResult_: x => x,
    RCWQ_errorText_: e => String(e.message || e),
    RCWQ_json_: x => x,
    PropertiesService: {getScriptProperties: () => ({setProperty(){}})},
    Utilities: {getUuid:()=> 'test-id'},
    processWebhookImmediately_: () => ({status:result}),
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end),context);
  const response=()=>context.doPost({postData:{contents:raw},parameter:{}});
  return {response, getCalls:()=>queueCalls};
}

for (const event of ['reputation','activity_base','activity_outside','screens']) {
  const q=simulate({event,emergency:true,sheet:true});
  assert.equal(q.response().status,'QUEUED');
  assert.equal(q.getCalls(),1);
  const e=simulate({event,emergency:true,sheet:false});
  assert.equal(e.response().status,'QUEUED_EMERGENCY');
}
for (const bad of ['ERROR','RETRY_LOCKED','SETUP_REQUIRED','UNKNOWN','']) {
  const q=simulate({emergency:false,sheet:false,result:bad});
  assert.throws(q.response,/Не удалось сохранить webhook/);
}
const done=simulate({emergency:false,sheet:false,result:'REPUTATION_UPDATED'});
assert.equal(done.response().status,'REPUTATION_UPDATED');

console.log('PASS webhook false-ack regression: 14 cases; activity counters unchanged');
