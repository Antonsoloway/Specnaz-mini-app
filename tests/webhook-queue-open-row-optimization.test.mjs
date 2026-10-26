import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync(new URL('../apps-script-live/05_RELIABLE_WEBHOOK_QUEUE.js', import.meta.url), 'utf8');

function mockSheet(entries, size = 15100) {
  const cells = new Map(entries.map(([index, row]) => [index, {
    id: 'q' + index, timestamp: new Date().toISOString(), status: 'PENDING',
    attempts: 0, event: 'activity_base', eventKey: 'event-' + index,
    tg: '100000000', payload: 'raw-' + index,
    updated: new Date(), result: '', error: '', ...row
  }]));
  const reads = [], writes = [], findCalls = [];
  function cell(row, col) {
    if (!cells.has(row)) throw Error('Unexpected non-queue row ' + row);
    const obj = cells.get(row);
    return {
      1: obj.id, 2: obj.timestamp, 3: obj.status, 4: obj.attempts,
      5: obj.event, 6: obj.eventKey, 7: obj.tg, 8: obj.payload,
      9: obj.updated, 10: obj.result, 11: obj.error
    }[col] ?? '';
  }
  function write(row, col, value) {
    const obj = cells.get(row);
    const key = {
      1:'id',2:'timestamp',3:'status',4:'attempts',5:'event',
      6:'eventKey',7:'tg',8:'payload',9:'updated',10:'result',11:'error'
    }[col];
    assert.ok(key, 'valid column ' + col);
    obj[key] = value;
    writes.push([row, col, value]);
  }
  return {
    cells, reads, writes, findCalls,
    getLastRow() {return size;},
    getRange(start, col, height = 1, width = 1) {
      return {
        createTextFinder(status) {
          assert.equal(col, 3);
          assert.equal(width, 1);
          findCalls.push(status);
          return {
            matchEntireCell(flag) {assert.equal(flag,true);return this;},
            findAll() {return Array.from(cells).filter(([r,obj]) =>
              r >= start && r < start + height && obj.status === status)
              .map(([r]) => ({getRow:()=>r}));}
          };
        },
        getValues() {
          reads.push([start,col,height,width]);
          assert.ok(height * width <= 9, 'should never bulk-read completed rows');
          return Array.from({length:height}, (_,i)=>Array.from({length:width},(_,j)=>cell(start+i,col+j)));
        },
        getValue() {return cell(start,col);},
        setValue(v) {write(start,col,v);},
        setValues(rows) {rows.forEach((r,i)=>r.forEach((v,j)=>write(start+i,col+j,v)));},
        clearContent() {write(start,col,'');}
      };
    }
  };
}

function run(entries, overrides = {}) {
  const sheet = mockSheet(entries);
  const processed = [];
  const fakeProps = new Map();
  const lock = {tryLock(){return true;},releaseLock(){}};
  const context = {
    SpreadsheetApp: {openById(){return {};},flush(){}},
    PropertiesService: {getScriptProperties(){return {
      setProperty(k,v){fakeProps.set(k,v);},
      getProperty(k){return fakeProps.get(k) || '';}
    };}},
    LockService: {getUserLock(){return lock;}},
    SPREADSHEET_ID: 'local-test-workbook',
    RCWQ_ensureQueueSheet_() {return sheet;},
    RCWQ_recoverEmergencyRecords_() {return 0;},
    RCWQ_decodePayload_(value) {return value;},
    RCWQ_buildFakeEvent_(raw) {return {postData:{contents:raw}};},
    processWebhookImmediately_(event) {
      const raw = event.postData.contents;
      processed.push(raw);
      return {status:overrides[raw] || 'ACTIVITY_BASE_INCREMENTED'};
    },
    Date, console,
  };
  vm.createContext(context);
  const dependencies = {
    RCWQ_ensureQueueSheet_: context.RCWQ_ensureQueueSheet_,
    RCWQ_recoverEmergencyRecords_: context.RCWQ_recoverEmergencyRecords_,
    RCWQ_decodePayload_: context.RCWQ_decodePayload_,
    RCWQ_buildFakeEvent_: context.RCWQ_buildFakeEvent_
  };
  vm.runInContext(code,context);
  // Stub only actual external I/O; run the real scanning, recovery and writer.
  Object.assign(context, dependencies);
  const result = context.processReliableWebhookQueue();
  return {sheet,processed,summary:JSON.parse(JSON.stringify(result))};
}

const now = new Date();
const stale = new Date(now.getTime()-16*60*1000);
const sample = run([
  [3,{status:'DONE'}], [4,{status:'REJECTED'}],
  [5,{status:'PROCESSING',tg:'777',updated:now}],
  [6,{status:'PENDING',tg:'777',payload:'block-after-active'}],
  [7,{status:'PENDING',tg:'888',payload:'activity_base'}],
  [8,{status:'RETRY',tg:'999',payload:'activity_outside'}],
  [9,{status:'FAILED'}],
  [12,{status:'PENDING',tg:'888',payload:'screens'}]
]);
assert.equal(sample.summary.done,3);
assert.equal(sample.summary.skipped_same_user,1);
assert.deepEqual(sample.processed,['activity_base','activity_outside','screens']);
assert.equal(sample.sheet.cells.get(5).status,'PROCESSING');
assert.equal(sample.sheet.cells.get(6).status,'PENDING');
assert.equal(sample.sheet.cells.get(7).status,'DONE');
assert.equal(sample.sheet.cells.get(8).status,'DONE');
assert.equal(sample.sheet.cells.get(12).status,'DONE');
assert.equal(sample.sheet.cells.get(7).payload,''); // only DONE payload is cleared
assert.ok(sample.sheet.findCalls.includes('PROCESSING'));
assert.ok(sample.sheet.reads.every(([, , h, w])=>h*w<=9));

const recover = run([
  [2,{status:'PROCESSING',tg:'777',updated:stale,payload:'stale'}],
  [3,{status:'PENDING',tg:'777',payload:'next'}]
]);
assert.equal(recover.summary.done,2);
assert.equal(recover.sheet.cells.get(2).status,'DONE');
assert.equal(recover.sheet.cells.get(3).status,'DONE');
assert.deepEqual(recover.processed,['stale','next']);

const failure = run([
  [2,{status:'PENDING',tg:'777',payload:'locked'}],
  [3,{status:'PENDING',tg:'777',payload:'blocked'}],
  [4,{status:'PENDING',tg:'888',payload:'other'}]
], {locked:'RETRY_LOCKED'});
assert.equal(failure.summary.retry,1);
assert.equal(failure.summary.done,1);
assert.equal(failure.summary.skipped_same_user,1);
assert.equal(failure.sheet.cells.get(2).status,'RETRY');
assert.equal(failure.sheet.cells.get(3).status,'PENDING');

const exhausted = run([
  [2,{status:'RETRY',tg:'777',attempts:20,payload:'exhausted'}],
  [3,{status:'PENDING',tg:'777',payload:'skip'}],
  [4,{status:'PENDING',tg:'888',payload:'process'}]
]);
assert.equal(exhausted.summary.failed,1);
assert.equal(exhausted.summary.done,1);
assert.equal(exhausted.sheet.cells.get(2).status,'FAILED');
assert.equal(exhausted.sheet.cells.get(3).status,'PENDING');

const empty = run([]);
assert.equal(empty.summary.processed,0);
assert.equal(empty.sheet.reads.length,0);

const first = run([[2,{status:'PENDING',tg:'123',payload:'first'}],
  [3,{status:'PENDING',tg:'123',payload:'second'}],
  [4,{status:'PENDING',tg:'234',payload:'third'}]]);
assert.deepEqual(first.processed,['first','second','third']);

console.log('PASS webhook active-row queue optimization: 6 scenarios, FIFO, stale recovery, retry, exhaustion, activity and no bulk reads');
