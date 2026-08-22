const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function tick() {
  return new Promise(resolve => setImmediate(resolve));
}

async function ticks(count = 8) {
  for (let index = 0; index < count; index += 1) await tick();
}

function createElement(id = '') {
  return {
    id,
    textContent: '',
    innerHTML: '',
    dataset: {},
    disabled: false,
    hidden: false,
    addEventListener() {},
    classList: { add() {}, remove() {}, toggle() {} }
  };
}

function createHarness(snapshotBodies) {
  const bodies = [...snapshotBodies];
  const elements = new Map();
  const lifecycle = [];
  const snapshotRequests = [];
  const timers = new Map();
  let timerSequence = 0;

  const element = id => {
    if (!elements.has(id)) elements.set(id, createElement(id));
    return elements.get(id);
  };

  const document = {
    body: { innerHTML: '', appendChild() {} },
    getElementById: element,
    querySelectorAll() { return []; },
    querySelector() { return null; },
    addEventListener() {}
  };

  const sandbox = {
    Promise,
    Map,
    Set,
    console: { log() {}, warn() {}, error() {} },
    __ROYAL_BUILD__: '0.6.0',
    Telegram: {
      WebApp: {
        initData: 'signed-init-data',
        initDataUnsafe: { user: { first_name: 'Тест' } },
        ready() {},
        expand() {}
      }
    },
    CustomEvent: class {
      constructor(type, init) {
        this.type = type;
        this.detail = init?.detail;
      }
    },
    URL: {
      createObjectURL() { return 'blob:test'; },
      revokeObjectURL() {}
    },
    document,
    addEventListener() {},
    dispatchEvent() {},
    setTimeout(callback, ms) {
      const id = ++timerSequence;
      timers.set(id, { callback, ms, active: true });
      return id;
    },
    clearTimeout(id) {
      const timer = timers.get(id);
      if (timer) timer.active = false;
    },
    async fetch(url) {
      const pathname = new URL(String(url)).pathname;
      if (pathname === '/auth') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            access: true,
            session: 'session-a',
            user: { crmName: 'Тест', participantKey: 'opaque-test-user' },
            role: { title: 'Участник' },
            memberships: []
          })
        };
      }
      if (pathname === '/snapshot') {
        const body = bodies.shift();
        if (!body) throw new Error('UNEXPECTED_SNAPSHOT_REQUEST');
        snapshotRequests.push({ body });
        return {
          ok: true,
          status: 200,
          json: () => body.promise
        };
      }
      throw new Error(`UNEXPECTED_FETCH_${pathname}`);
    }
  };

  sandbox.window = sandbox;
  sandbox.RoyalStartupV0600 = {
    handleAppEvent(type, detail) { lifecycle.push({ type, detail }); }
  };
  vm.createContext(sandbox);
  vm.runInContext(appSource, sandbox, { filename: 'app.js' });

  return {
    sandbox,
    lifecycle,
    snapshotRequests,
    element,
    runTimers(ms) {
      const due = [...timers.values()].filter(timer => timer.active && timer.ms === ms);
      due.forEach(timer => {
        timer.active = false;
        timer.callback();
      });
      return due.length;
    },
    readSnapshotState() {
      return vm.runInContext('snapshotState', sandbox);
    },
    loadSnapshot() {
      return vm.runInContext('loadSnapshot()', sandbox);
    }
  };
}

test('a hanging snapshot response body emits SNAPSHOT_BODY_TIMEOUT after 5000ms', async () => {
  const body = deferred();
  const harness = createHarness([body]);
  await ticks();

  assert.equal(harness.snapshotRequests.length, 1);
  assert.equal(harness.lifecycle.filter(event => event.type === 'snapshot-ready').length, 0);
  assert.equal(harness.runTimers(5000), 1, 'only the live snapshot-body deadline remains');
  await ticks();

  const errors = harness.lifecycle.filter(event => event.type === 'snapshot-error');
  assert.equal(errors.length, 1);
  assert.equal(errors[0].detail.code, 'SNAPSHOT_BODY_TIMEOUT');
  assert.equal(harness.lifecycle.filter(event => event.type === 'snapshot-ready').length, 0);
  assert.equal(harness.readSnapshotState(), null);
});

test('forced reload supersedes a pending body and stale completion cannot publish or overwrite', async () => {
  const staleBody = deferred();
  const freshBody = deferred();
  const harness = createHarness([staleBody, freshBody]);
  await ticks();
  assert.equal(harness.snapshotRequests.length, 1);

  const forced = harness.sandbox.RoyalAppV0600.reloadSnapshot();
  await ticks();
  assert.equal(harness.snapshotRequests.length, 2);

  staleBody.resolve({
    ok: true,
    snapshot: { marker: 'stale', stats: { participants: 1, teams: 1 } }
  });
  await ticks();
  assert.equal(harness.lifecycle.filter(event => event.type === 'snapshot-ready').length, 0);
  assert.equal(harness.readSnapshotState(), null);

  freshBody.resolve({
    ok: true,
    snapshot: { marker: 'fresh', stats: { participants: 22, teams: 7 } }
  });
  const result = await forced;
  await ticks();

  const ready = harness.lifecycle.filter(event => event.type === 'snapshot-ready');
  assert.equal(ready.length, 1);
  assert.equal(result.marker, 'fresh');
  assert.equal(harness.readSnapshotState().marker, 'fresh');
  assert.match(harness.element('dataStatus').textContent, /22 участников, 7 команд/);
});

test('same-session non-force loads share one pending snapshot request', async () => {
  const body = deferred();
  const harness = createHarness([body]);
  await ticks();
  assert.equal(harness.snapshotRequests.length, 1);

  const joinedFirst = harness.loadSnapshot();
  const joinedSecond = harness.loadSnapshot();
  await ticks();
  assert.equal(harness.snapshotRequests.length, 1, 'deduped callers must not fetch again');

  body.resolve({
    ok: true,
    snapshot: { marker: 'shared', stats: { participants: 5, teams: 2 } }
  });
  const [first, second] = await Promise.all([joinedFirst, joinedSecond]);
  await ticks();

  assert.equal(first.marker, 'shared');
  assert.equal(second.marker, 'shared');
  assert.equal(harness.lifecycle.filter(event => event.type === 'snapshot-ready').length, 1);
  assert.equal(harness.readSnapshotState().marker, 'shared');
});
