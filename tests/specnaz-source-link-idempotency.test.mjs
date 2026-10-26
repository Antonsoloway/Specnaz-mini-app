import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const text = fs.readFileSync(new URL('../apps-script-live/01_CORE_MAIN.js', import.meta.url), 'utf8');
const a = text.indexOf('function findSpecnazHistoryAwardForMessage_(');
const b = text.indexOf('function applyScreens_(', a);
assert.ok(a >= 0 && b > a);
const source = text.slice(a, b);
function scenario(recordedId, recordedLink, incomingId, incomingLink) {
  let points = 9;
  let credited = 0;
  const history = {
    getRange(_row, col) {
      return { getDisplayValues() {
        return col === 16 ? [[recordedLink]] : [[recordedId]];
      } };
    }
  };
  const context = {
    SHEET_HISTORY: 'История спецназа',
    COL_SPECNAZ: 21,
    COL_LAST_CHANGE: 22,
    HISTORY_COL_MESSAGE_LINK: 16,
    HISTORY_COL_TG_ID: 12,
    normalizeTgId_: value => String(value || '').trim(),
    normalizeSpecnazMessageLink_: value => String(value || '').trim(),
    getHistoryLastContentRow_: () => 2,
    numberOrZero_: value => Number(value) || 0,
    recordSpecnazHistory_: () => { credited++; }
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  const ss = { getSheetByName: () => history };
  const base = { getRange() {
    return { getValue: () => points, setValue: value => { if (typeof value === 'number') points = value; } };
  } };
  const player = { tgId: incomingId, replyMessageLink: incomingLink, replyMessage: 'Тест', reputation: 0, reputationDelta: 1 };
  const result = context.applyReputation_(ss, base, 83, player, 'different-payload-hash');
  return { result, points, credited };
}
const link = 'https://t.me/c/123456789/777/424242';
const same = scenario('11111111', link, '11111111', link);
assert.equal(same.result.status, 'REPUTATION_SOURCE_ALREADY_COUNTED');
assert.equal(same.points, 9);
assert.equal(same.credited, 0);
const otherUser = scenario('11111111', link, '22222222', link);
assert.equal(otherUser.result.status, 'REPUTATION_UPDATED');
assert.equal(otherUser.points, 10);
assert.equal(otherUser.credited, 1);
const otherMessage = scenario('11111111', link, '11111111', link + '-other');
assert.equal(otherMessage.points, 10);
assert.equal(otherMessage.credited, 1);
const noLink = scenario('11111111', link, '11111111', '');
assert.equal(noLink.points, 10);
assert.equal(noLink.credited, 1);
console.log('PASS specnaz source-link idempotency (4 scenarios)');
