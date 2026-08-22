const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const writeSource = fs.readFileSync(path.join(ROOT, 'admin-write-v0600-v3.js'), 'utf8');
const cssSource = fs.readFileSync(path.join(ROOT, 'admin-write-v0600.css'), 'utf8');
const versionSource = fs.readFileSync(path.join(ROOT, 'version-v0600.js'), 'utf8');
const appRouterSource = fs.readFileSync(path.join(ROOT, 'app.html'), 'utf8');
const appV0600Source = fs.readFileSync(path.join(ROOT, 'app-v0600.html'), 'utf8');

function field(value='') {
  return { value, innerHTML:'' };
}

function createHarness() {
  const listeners = {};
  const documentListeners = {};
  const status = { className:'', textContent:'' };
  let fetchCalls = 0;

  const game = field('Royal Match');
  const role = field('Помощник');
  const team = field('CATAHA');
  const nickname = field('Кука');
  const otherGame = field('Royal Kingdom');
  const otherRole = field('Лидер');
  const otherTeam = field('Другая команда');
  const otherNickname = field('Другой ник');

  const selectors = {
    '[data-write-field="game"]':game,
    '[data-write-field="role"]':role,
    '[data-write-field="team"]':team,
    '[data-write-field="nickname"]':nickname
  };
  const clearButton = {
    disabled:false,
    closest(selector) {
      if (selector === '[data-write-clear-slot="1"]') return this;
      if (selector === '[data-write-slot]') return section;
      return null;
    }
  };
  const section = {
    dataset:{ writeSlot:'3' },
    querySelector(selector) {
      if (selector === '[data-write-clear-slot="1"]') return clearButton;
      return selectors[selector] || null;
    }
  };
  clearButton.closest = selector => {
    if (selector === '[data-write-clear-slot="1"]') return clearButton;
    if (selector === '[data-write-slot]') return section;
    return null;
  };
  clearButton.matches = () => false;

  const document = {
    visibilityState:'visible',
    body:{ appendChild(){}, contains(){ return true; } },
    head:{ appendChild(){} },
    querySelector(selector) {
      if (selector === '[data-admin-write-modal="1"] [data-write-status]') return status;
      return null;
    },
    querySelectorAll(){ return []; },
    createElement(){ return { dataset:{}, addEventListener(){} }; },
    getElementById(){ return null; },
    addEventListener(type, handler){ documentListeners[type] = handler; }
  };
  const sandbox = {
    console,
    document,
    sessionToken:'test-session',
    API_URL:'https://worker.test',
    snapshotState:{ participants:[] },
    fetch:async () => { fetchCalls += 1; throw new Error('unexpected fetch'); },
    MutationObserver:class { observe(){} },
    setTimeout(){ return 1; },
    clearTimeout(){},
    alert(){},
    confirm(){ return false; }
  };
  sandbox.window = sandbox;
  sandbox.window.addEventListener = (type, handler) => { listeners[type] = handler; };
  sandbox.window.RoyalAdminDataV0600 = { subscribe(){ return () => {}; } };

  vm.createContext(sandbox);
  vm.runInContext(writeSource, sandbox, { filename:'admin-write-v0600-v3.js' });

  return {
    listeners,
    documentListeners,
    status,
    clearButton,
    fields:{ game, role, team, nickname },
    otherFields:{ game:otherGame, role:otherRole, team:otherTeam, nickname:otherNickname },
    fetchCalls:() => fetchCalls
  };
}

test('every rendered membership slot has an accessible non-submit clear button', () => {
  assert.match(writeSource, /normalizedSlots\(source\)\.map\(slotHtml\)\.join\(''\)/);
  assert.match(writeSource, /type="button" class="royal-admin-slot-clear" data-write-clear-slot="1"/);
  assert.match(writeSource, /aria-label="Очистить данные слота \$\{slotNumber\}"/);
  assert.match(writeSource, />Очистить данные<\/button>/);
  assert.match(cssSource, /\.royal-admin-slot-clear\{width:100%;min-height:46px/);
});

test('slot clear resets only the selected slot and never writes before Save', () => {
  const harness = createHarness();
  let prevented = false;
  let stopped = false;
  harness.listeners.click({
    target:harness.clearButton,
    preventDefault(){ prevented = true; },
    stopImmediatePropagation(){ stopped = true; }
  });

  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.deepEqual(
    Object.fromEntries(Object.entries(harness.fields).map(([name,node]) => [name,node.value])),
    { game:'', role:'', team:'', nickname:'' }
  );
  assert.match(harness.fields.team.innerHTML, /— без команды —/);
  assert.match(harness.fields.role.innerHTML, />—<\/option>/);
  assert.equal(harness.clearButton.disabled, true);
  assert.match(harness.status.textContent, /Слот 3 очищен/);
  assert.deepEqual(
    Object.fromEntries(Object.entries(harness.otherFields).map(([name,node]) => [name,node.value])),
    { game:'Royal Kingdom', role:'Лидер', team:'Другая команда', nickname:'Другой ник' }
  );
  assert.equal(harness.fetchCalls(), 0);
});

test('clear button enables after editing an empty slot field', () => {
  const harness = createHarness();
  harness.clearButton.disabled = true;
  harness.fields.nickname.value = 'Новый ник';
  const nickname = {
    ...harness.fields.nickname,
    matches(selector){ return selector.includes('[data-write-field="nickname"]'); },
    closest(selector){ return selector === '[data-write-slot]' ? harness.clearButton.closest('[data-write-slot]') : null; }
  };
  harness.documentListeners.input({ target:nickname });
  assert.equal(harness.clearButton.disabled, false);
});

test('write UI version and stylesheet cache identify the slot-clear build', () => {
  assert.match(writeSource, /const VERSION = '0\.6\.0-write\.5-ui\.11'/);
  assert.match(writeSource, /admin-write-v0600\.css\?v=20260822-1227/);
  assert.match(writeSource, /admin-write-v0600-v2\.css\?v=20260822-1227/);
  assert.match(versionSource, /const CACHE = '20260822-history-music-hotfix1'/);
  assert.match(appRouterSource, /const target = 'app-v0600\.html'/);
  assert.match(appRouterSource, /releaseBuild', '20260823-scroll-gesture-hotfix5'/);
  assert.match(appV0600Source, /version-v0600\.js\?v=20260822-history-music-hotfix1/);
  assert.equal((appV0600Source.match(/\?v=20260822-1227/g) || []).length, 3);
  assert.match(appV0600Source, /transport-v0514\.js\?v=20260823-startup-priority-hotfix3/);
});
