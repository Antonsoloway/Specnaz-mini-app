const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'navigation-scroll-top-v0558.js'), 'utf8');
const appV0600 = fs.readFileSync(path.join(ROOT, 'app-v0600.html'), 'utf8');

function createHarness() {
  const listeners = new Map();
  const timers = [];
  const frames = [];
  const scrollCalls = [];
  const listNode = { id: 'list' };
  const panel = {
    firstElementChild: listNode,
    scrollTop: 420,
    scrollTo(x, y) { this.scrollTop = y; scrollCalls.push(['panel', x, y]); }
  };
  const avatar = {
    closest(selector) {
      if (selector === '.participant-detail-card') return null;
      return null;
    }
  };
  const target = {
    closest(selector) {
      if (selector === '.person-avatar-wrap,.hero-avatar,.history-avatar,.self-avatar') return avatar;
      return null;
    }
  };
  const document = {
    scrollingElement: { scrollTop: 420 },
    documentElement: { scrollTop: 420 },
    body: { scrollTop: 420 },
    getElementById(id) { return id === 'panel' ? panel : null; }
  };
  const window = {
    RoyalChangelog: null,
    addEventListener(type, handler, options) {
      const rows = listeners.get(type) || [];
      rows.push({ handler, options });
      listeners.set(type, rows);
    },
    scrollTo(x, y) { scrollCalls.push(['window', x, y]); }
  };
  const sandbox = {
    window,
    document,
    Date,
    setTimeout(callback) { timers.push(callback); return timers.length; },
    requestAnimationFrame(callback) { frames.push(callback); return frames.length; }
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'navigation-scroll-top-v0558.js' });

  function dispatch(type, init = {}) {
    const event = {
      target,
      pointerId: 7,
      clientX: 100,
      clientY: 300,
      ...init
    };
    (listeners.get(type) || []).forEach(row => row.handler(event));
  }

  function flush() {
    while (timers.length || frames.length) {
      while (timers.length) timers.shift()();
      while (frames.length) frames.shift()();
    }
  }

  return { listeners, scrollCalls, panel, listNode, avatar, target, dispatch, flush };
}

test('vertical swipe over an avatar never resets the page to the top', () => {
  const harness = createHarness();
  harness.dispatch('pointerdown');
  harness.dispatch('pointermove', { clientY: 360 });
  harness.dispatch('pointerup', { clientY: 304 });
  harness.panel.firstElementChild = { id: 'unexpected-render' };
  harness.flush();

  assert.deepEqual(harness.scrollCalls, []);
  assert.equal(harness.panel.scrollTop, 420);
});

test('pointercancel and pointerup without a matching press are ignored', () => {
  const harness = createHarness();
  harness.dispatch('pointerdown');
  harness.dispatch('pointercancel');
  harness.dispatch('pointerup', { clientY: 302 });
  harness.panel.firstElementChild = { id: 'unexpected-render' };
  harness.flush();
  assert.deepEqual(harness.scrollCalls, []);

  const orphan = createHarness();
  orphan.dispatch('pointerup');
  orphan.panel.firstElementChild = { id: 'unexpected-render' };
  orphan.flush();
  assert.deepEqual(orphan.scrollCalls, []);
});

test('an avatar tap resets only after a real profile render', () => {
  const noNavigation = createHarness();
  noNavigation.dispatch('pointerdown');
  noNavigation.dispatch('pointerup', { clientY: 304 });
  noNavigation.flush();
  assert.deepEqual(noNavigation.scrollCalls, [], 'a non-navigating tap must preserve scroll');

  const navigation = createHarness();
  navigation.dispatch('pointerdown');
  navigation.dispatch('pointerup', { clientY: 304 });
  navigation.panel.firstElementChild = { id: 'participant-profile' };
  navigation.flush();
  assert.ok(navigation.scrollCalls.length >= 3, 'the newly rendered profile opens at the top');
  assert.equal(navigation.panel.scrollTop, 0);
});

test('gesture tracking stays passive and v0.6 cache-busts the repaired script', () => {
  const harness = createHarness();
  ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'].forEach(type => {
    const row = harness.listeners.get(type)?.[0];
    assert.ok(row, `${type} listener missing`);
    assert.equal(row.options?.capture, true);
    assert.equal(row.options?.passive, true);
  });
  assert.match(appV0600, /navigation-scroll-top-v0558\.js\?v=20260823-scroll-gesture-hotfix5/);
});
