import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../apps-script-live/01_CORE_MAIN.js', import.meta.url), 'utf8');
const start = source.indexOf('function findSpecnazHistoryAwardForMessage_(');
const end = source.indexOf('function applyScreens_(', start);
assert.ok(start >= 0 && end > start, 'expected source-link guard');

function runCase(storedId, storedLink, incomingId, incomingLink) {
  let score = 9;
  let historyWrites = 0;
  const sheet = {
    getRange(_row, column) {
      return {
        getDisplayValues() {
          return column === 16 ? [[storedLink]] : [[storedId]];
        }
      };
    }
  };
  const context = {
    SHEET_HISTORY: 'history',
    COL_SPECNAZ: 21,
    COL_LAST_CHANGE: 22,
    HISTORY_COL_MESSAGE_LINK: 16,
    HISTORY_COL_TG_ID: 12,
    getHistoryLastContentRow_: () => 2,
    normalizeTgId_: value => String(value || '').trim(),
    normalizeSpecnazMessageLink_: value => String(value || '').trim(),
    numberOrZero_: value => Number(value) || 0,
    recordSpecnazHistory_: () => { historyWrites += 1; }
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  const spreadsheet = { getSheetByName: () => sheet };
  const base = {
    getRange() {
      return {
        getValue: () => score,
        setValue(value) { if (typeof value === 'number') score = value; }
      };
    }
  };
  const player = {
    tgId: incomingId,
    replyMessageLink: incomingLink,
    replyMessage: 'test',
    reputation: 0,
    reputationDelta: 1
  };
  const result = context.applyReputation_(spreadsheet, base, 11, player, 'new-event-key');
  return { result, score, historyWrites };
}

const link = 'https://t.me/c/12345/777/424242';
const duplicate = runCase('11111111', link, '11111111', link);
assert.equal(duplicate.result.status, 'REPUTATION_SOURCE_ALREADY_COUNTED');
assert.equal(duplicate.score, 9);
assert.equal(duplicate.historyWrites, 0);

for (const [storedId, storedLink, newId, newLink] of [
  ['11111111', link, '22222222', link],
  ['11111111', link, '11111111', link + '-different'],
  ['11111111', link, '11111111', '']
]) {
  const r = runCase(storedId, storedLink, newId, newLink);
  assert.equal(r.result.status, 'REPUTATION_UPDATED');
  assert.equal(r.score, 10);
  assert.equal(r.historyWrites, 1);
}
console.log('PASS: specnaz source-link idempotency (4 cases)');
