const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const musicSource = fs.readFileSync(path.join(ROOT, 'music-v0600.js'), 'utf8');
const startupSource = fs.readFileSync(path.join(ROOT, 'startup-v0600.js'), 'utf8');
const appSource = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const writeAccessSource = fs.readFileSync(path.join(ROOT, 'write-access-v0538.js'), 'utf8');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function tick() {
  return new Promise(resolve => setImmediate(resolve));
}

async function ticks(count = 4) {
  for (let index = 0; index < count; index += 1) await tick();
}

function stored(enabled, updatedAt) {
  return JSON.stringify({ v: 2, enabled, updatedAt });
}

function savedValue(call) {
  try { return JSON.parse(call.value); } catch (_) { return null; }
}

function fakeButton(targetSelector = '[data-royal-music-toggle]') {
  return {
    textContent: '',
    disabled: false,
    dataset: {},
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = String(value); },
    closest(selector) { return selector === targetSelector ? this : null; }
  };
}

function defaultStorage(value, calls, name) {
  return {
    getItem(key, callback) {
      calls.push({ name, method: 'getItem', key });
      callback(null, value);
    },
    setItem(key, next, callback) {
      calls.push({ name, method: 'setItem', key, value: next });
      callback(null, true);
    }
  };
}

function createMusicHarness(options = {}) {
  const storageCalls = [];
  const localCalls = [];
  const releases = [];
  const protectedLoads = [];
  const documentListeners = {};
  const windowListeners = {};
  const telegramListeners = {};
  const button = fakeButton();
  const live = { textContent: '' };
  const notice = { hidden: true };
  const noticeText = { textContent: '' };
  const retryButton = fakeButton('[data-royal-music-retry]');
  retryButton.hidden = true;
  const localValues = new Map(Object.entries(options.localValues || {}));
  const audioListeners = {};
  const audio = {
    id: '',
    tagName: 'AUDIO',
    dataset: {},
    hidden: false,
    loop: false,
    preload: '',
    volume: 1,
    src: '',
    playCalls: 0,
    pauseCalls: 0,
    setAttribute() {},
    removeAttribute(name) { if (name === 'src') this.src = ''; },
    addEventListener(type, handler) { audioListeners[type] = handler; },
    load() {},
    pause() { this.pauseCalls += 1; },
    play() {
      this.playCalls += 1;
      if (options.play) return options.play(this.playCalls);
      return Promise.resolve();
    }
  };
  const document = {
    visibilityState: 'visible',
    body: { appendChild(element) { assert.equal(element, audio); } },
    createElement(tag) { assert.equal(tag, 'audio'); return audio; },
    querySelectorAll(selector) { return selector === '[data-royal-music-toggle]' ? [button] : []; },
    querySelector(selector) {
      return ({
        '[data-royal-music-live]': live,
        '[data-royal-music-notice]': notice,
        '[data-royal-music-notice-text]': noticeText,
        '[data-royal-music-retry]': retryButton
      })[selector] || null;
    },
    addEventListener(type, handler) { documentListeners[type] = handler; },
    contains(element) { return element?.isConnected !== false; }
  };
  const webApp = { onEvent(type, handler) { telegramListeners[type] = handler; } };
  if (options.cloud !== false) {
    webApp.CloudStorage = options.cloudStorage || defaultStorage(options.cloudValue, storageCalls, 'cloud');
  }
  if (options.device !== false) {
    webApp.DeviceStorage = options.deviceStorage || defaultStorage(options.deviceValue, storageCalls, 'device');
  }

  const defaultProtectedLoader = async asset => {
    protectedLoads.push(asset);
    return 'blob:protected-background';
  };
  const fastSetTimeout = options.fastTimers
    ? fn => setImmediate(fn)
    : setTimeout;
  const fastClearTimeout = options.fastTimers
    ? id => clearImmediate(id)
    : clearTimeout;
  const sandbox = {
    console,
    Promise,
    Date,
    setTimeout: fastSetTimeout,
    clearTimeout: fastClearTimeout,
    document,
    Telegram: { WebApp: webApp },
    RoyalStartupV0600: options.startupPromise === null ? null : {
      whenRevealed: options.startupPromise || Promise.resolve()
    },
    RoyalAppV0600: {
      fetchProtectedMediaObjectUrl: options.protectedLoader || defaultProtectedLoader,
      releaseProtectedMedia(asset) { releases.push(asset); }
    },
    localStorage: {
      getItem(key) {
        localCalls.push({ method: 'getItem', key });
        if (options.localGetError) throw new Error('LOCAL_READ_FAILED');
        return localValues.get(key) ?? null;
      },
      setItem(key, value) {
        localCalls.push({ method: 'setItem', key, value });
        if (options.localSetError) throw new Error('LOCAL_WRITE_FAILED');
        localValues.set(key, value);
      }
    },
    addEventListener(type, handler) { windowListeners[type] = handler; }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(musicSource, sandbox, { filename: 'music-v0600.js' });
  return {
    controller: sandbox.RoyalMusicV0600,
    audio,
    button,
    live,
    notice,
    noticeText,
    retryButton,
    storageCalls,
    localCalls,
    localValues,
    releases,
    protectedLoads,
    document,
    documentListeners,
    windowListeners,
    telegramListeners
  };
}

test('newer DeviceStorage OFF beats stale CloudStorage ON and is reconciled', async () => {
  const key = 'opaque_participant_newest';
  const localKey = `royal_music_v1:participant:${key}`;
  const harness = createMusicHarness({
    cloudValue: stored(true, 100),
    deviceValue: stored(false, 300),
    localValues: { [localKey]: stored(true, 200) }
  });

  await harness.controller.authorize(key);
  await ticks();
  assert.equal(harness.controller.getState().preference, false);
  assert.equal(harness.controller.getState().state, 'off');
  assert.equal(harness.audio.playCalls, 0);
  assert.deepEqual(harness.protectedLoads, []);
  const reconciled = harness.storageCalls.filter(call => call.method === 'setItem').map(savedValue);
  assert.ok(reconciled.some(value => value?.enabled === false && value.updatedAt === 300));
  assert.equal(JSON.parse(harness.localValues.get(localKey)).enabled, false);
});

test('failed Cloud reconciliation of a newer OFF preference is visible and retryable', async () => {
  const cloudStorage = {
    getItem(key, callback) { callback(null, stored(true, 100)); },
    setItem(key, value, callback) { callback('WRITE_FAILED'); }
  };
  const key = 'opaque_participant_reconcile';
  const localKey = `royal_music_v1:participant:${key}`;
  const harness = createMusicHarness({
    cloudStorage,
    deviceValue: stored(false, 300),
    localValues: { [localKey]: stored(false, 300) },
    fastTimers: true
  });

  await harness.controller.authorize(key);
  await ticks(8);
  assert.equal(harness.controller.getState().preference, false);
  assert.equal(harness.controller.getState().state, 'off');
  assert.equal(harness.controller.getState().saveStatus, 'degraded');
  assert.equal(harness.notice.hidden, false);
  assert.equal(harness.retryButton.hidden, false);
  assert.match(harness.noticeText.textContent, /синхронизация/);
  assert.equal(harness.audio.playCalls, 0);
});

test('transient storage error retries and recovers the saved OFF preference', async () => {
  let cloudReads = 0;
  const calls = [];
  const cloudStorage = {
    getItem(key, callback) {
      calls.push(['get', key]);
      cloudReads += 1;
      if (cloudReads === 1) callback('TEMPORARY');
      else callback(null, stored(false, 400));
    },
    setItem(key, value, callback) { calls.push(['set', key, value]); callback(null, true); }
  };
  const harness = createMusicHarness({
    cloudStorage,
    deviceValue: stored(true, 100),
    fastTimers: true
  });

  await harness.controller.authorize('opaque_participant_retry');
  assert.equal(cloudReads, 2);
  assert.equal(harness.controller.getState().preference, false);
  assert.equal(harness.audio.playCalls, 0);
  assert.deepEqual(harness.protectedLoads, []);
});

test('persistent read timeout fails safe silent until an explicit user action', async () => {
  const neverReturns = { getItem() {}, setItem(key, value, callback) { callback(null, true); } };
  const harness = createMusicHarness({
    cloudStorage: neverReturns,
    deviceValue: stored(true, 500),
    fastTimers: true
  });

  await harness.controller.authorize('opaque_participant_timeout');
  assert.equal(harness.controller.getState().state, 'storage-error');
  assert.equal(harness.controller.getState().preference, false);
  assert.equal(harness.audio.playCalls, 0);
  assert.deepEqual(harness.protectedLoads, []);
  assert.match(harness.live.textContent, /безопасности/);

  harness.controller.toggle();
  await ticks(8);
  assert.equal(harness.controller.getState().preference, true);
  assert.equal(harness.audio.playCalls, 1, 'explicit choice may start music after a failed read');
});

test('an absurd future timestamp is rejected instead of poisoning later writes', async () => {
  const harness = createMusicHarness({
    cloudValue: stored(true, Number.MAX_SAFE_INTEGER),
    deviceValue: ''
  });
  await harness.controller.authorize('opaque_participant_timestamp');
  assert.equal(harness.controller.getState().state, 'storage-error');
  assert.equal(harness.controller.getState().preference, false);
  assert.equal(harness.audio.playCalls, 0);
  assert.deepEqual(harness.protectedLoads, []);

  harness.controller.toggle();
  await ticks(6);
  const repaired = harness.storageCalls
    .filter(call => call.method === 'setItem')
    .map(savedValue)
    .filter(Boolean);
  assert.ok(repaired.length >= 2);
  repaired.forEach(record => {
    assert.equal(record.v, 2);
    assert.equal(record.enabled, true);
    assert.ok(Number.isSafeInteger(record.updatedAt));
    assert.ok(Math.abs(record.updatedAt - Date.now()) < 10_000);
  });
});

test('default ON starts before startup reveal and requests only the exact protected asset', async () => {
  const gate = deferred();
  const harness = createMusicHarness({ cloudValue: '', deviceValue: '', startupPromise: gate.promise });
  await harness.controller.authorize('opaque_participant_default');

  assert.equal(harness.controller.getState().preference, true);
  assert.equal(harness.controller.getState().state, 'playing');
  assert.deepEqual(harness.protectedLoads, ['background-v0600']);
  assert.equal(harness.audio.src, 'blob:protected-background');
  assert.equal(harness.audio.volume, 0.15);
  assert.equal(harness.audio.playCalls, 1);
  assert.equal(harness.controller.version, '0.6.0-music.5');
  assert.doesNotMatch(musicSource, /fetchProtectedMediaObjectUrl\(['"]audio['"]\)/);
  assert.doesNotMatch(musicSource, /assets\/.*\.(?:mp3|m4a|aac)/i);
});

test('sound toggle turns an ON preference off before startup reveal', async () => {
  const gate = deferred();
  const harness = createMusicHarness({
    cloudValue: stored(true, 600),
    deviceValue: stored(true, 600),
    startupPromise: gate.promise
  });
  const authorized = harness.controller.authorize('opaque_participant_paused');
  await ticks();
  assert.equal(harness.controller.getState().state, 'playing');

  harness.controller.toggle();
  assert.equal(harness.controller.getState().state, 'off');
  assert.equal(harness.controller.getState().preference, false);
  assert.equal(harness.audio.playCalls, 1);
  assert.doesNotMatch(harness.live.textContent, /сохранена/i, 'success must wait for storage callbacks');
  await ticks();
  assert.ok(harness.storageCalls.some(call => call.method === 'setItem' && savedValue(call)?.enabled === false));

  gate.resolve({ degraded: false });
  await authorized;
  assert.equal(harness.audio.playCalls, 1);
});

test('production auth never lets protected music race the critical snapshot', async () => {
  const harness = createMusicHarness({ cloudValue: '', deviceValue: '' });
  harness.controller.handleAppEvent('auth-ready', {
    user: { participantKey: 'opaque_participant_snapshot_gate' }
  });
  await ticks(6);

  assert.equal(harness.controller.getState().snapshotGate, 'pending');
  assert.equal(harness.controller.getState().preference, true);
  assert.deepEqual(harness.protectedLoads, []);
  assert.equal(harness.audio.playCalls, 0);

  harness.controller.handleAppEvent('snapshot-ready');
  await ticks(6);
  assert.equal(harness.controller.getState().snapshotGate, 'ready');
  assert.deepEqual(harness.protectedLoads, ['background-v0600']);
  assert.equal(harness.audio.playCalls, 1);
});

test('snapshot error and retry keep music off the network until retry succeeds', async () => {
  const harness = createMusicHarness({ cloudValue: '', deviceValue: '' });
  harness.controller.handleAppEvent('auth-ready', {
    user: { participantKey: 'opaque_participant_snapshot_retry' }
  });
  await ticks(6);
  harness.controller.handleAppEvent('snapshot-error');
  await ticks();
  assert.equal(harness.controller.getState().snapshotGate, 'failed');
  assert.deepEqual(harness.protectedLoads, []);
  assert.equal(harness.audio.playCalls, 0);

  harness.controller.handleAppEvent('snapshot-start');
  await ticks();
  assert.deepEqual(harness.protectedLoads, []);
  harness.controller.handleAppEvent('snapshot-ready');
  await ticks(6);
  assert.deepEqual(harness.protectedLoads, ['background-v0600']);
  assert.equal(harness.audio.playCalls, 1);
});

test('limited-mode reveal starts media only after the user abandons snapshot retry', async () => {
  const reveal = deferred();
  const harness = createMusicHarness({
    cloudValue: '',
    deviceValue: '',
    startupPromise: reveal.promise
  });
  harness.controller.handleAppEvent('auth-ready', {
    user: { participantKey: 'opaque_participant_limited_mode' }
  });
  await ticks(6);
  harness.controller.handleAppEvent('snapshot-error');
  await ticks();
  assert.deepEqual(harness.protectedLoads, []);
  assert.equal(harness.audio.playCalls, 0);

  reveal.resolve({ degraded: true });
  await ticks(8);
  assert.equal(harness.controller.getState().snapshotGate, 'ready');
  assert.deepEqual(harness.protectedLoads, ['background-v0600']);
  assert.equal(harness.audio.playCalls, 1);
});

test('snapshot-ready racing preference reads starts protected music exactly once', async () => {
  const callbacks = [];
  const pendingStorage = {
    getItem(key, callback) { callbacks.push(callback); },
    setItem(key, value, callback) { callback(null, true); }
  };
  const harness = createMusicHarness({
    cloudStorage: pendingStorage,
    deviceStorage: pendingStorage
  });
  harness.controller.handleAppEvent('auth-ready', {
    user: { participantKey: 'opaque_participant_snapshot_race' }
  });
  await tick();
  harness.controller.handleAppEvent('snapshot-ready');
  callbacks.forEach(callback => callback(null, stored(true, 1500)));
  await ticks(8);

  assert.deepEqual(harness.protectedLoads, ['background-v0600']);
  assert.equal(harness.audio.playCalls, 1);
});

test('failed CloudStorage sync exposes a separate visible retry and never announces premature success', async () => {
  const cloudWrites = [];
  const cloudStorage = {
    getItem(key, callback) { callback(null, stored(true, 700)); },
    setItem(key, value, callback) { cloudWrites.push({ value, callback }); }
  };
  const key = 'opaque_participant_write';
  const localKey = `royal_music_v1:participant:${key}`;
  const harness = createMusicHarness({
    cloudStorage,
    deviceValue: stored(true, 700),
    localValues: { [localKey]: stored(true, 700) }
  });
  await harness.controller.authorize(key);
  harness.controller.toggle();
  await ticks();

  assert.equal(harness.controller.getState().saveStatus, 'saving');
  assert.doesNotMatch(harness.live.textContent, /сохранена/i);
  const firstWrite = cloudWrites.shift();
  const firstValue = JSON.parse(firstWrite.value);
  firstWrite.callback('WRITE_FAILED');
  await new Promise(resolve => setTimeout(resolve, 210));
  assert.equal(cloudWrites.length, 1, 'write retry is bounded to one retry');
  cloudWrites.shift().callback('WRITE_FAILED');
  await ticks();
  assert.equal(harness.controller.getState().saveStatus, 'degraded');
  assert.equal(harness.notice.hidden, false);
  assert.equal(harness.retryButton.hidden, false);
  assert.match(harness.noticeText.textContent, /синхронизация/);
  assert.match(harness.live.textContent, /синхронизация/);

  harness.controller.retry();
  await ticks();
  assert.equal(harness.controller.getState().preference, false, 'retry must not toggle sound');
  const retried = cloudWrites.shift();
  assert.ok(JSON.parse(retried.value).updatedAt > firstValue.updatedAt, 'explicit retry receives a fresh monotonic timestamp');
  retried.callback(null, true);
  await ticks();
  assert.equal(harness.controller.getState().saveStatus, 'idle');
  assert.equal(harness.notice.hidden, true);
  assert.match(harness.live.textContent, /сохранена после повторной/);
});

test('a permanent CloudStorage failure never traps the main sound toggle', async () => {
  const cloudStorage = {
    getItem(key, callback) { callback(null, stored(true, 750)); },
    setItem(key, value, callback) { callback('WRITE_FAILED'); }
  };
  const harness = createMusicHarness({
    cloudStorage,
    deviceValue: stored(true, 750),
    fastTimers: true
  });
  await harness.controller.authorize('opaque_participant_toggle');

  harness.controller.toggle();
  await ticks(8);
  assert.equal(harness.controller.getState().preference, false);
  assert.equal(harness.controller.getState().saveStatus, 'degraded');

  harness.controller.toggle();
  await ticks(8);
  assert.equal(harness.controller.getState().preference, true, 'main button remains an ON/OFF control');
  assert.equal(harness.controller.getState().saveStatus, 'degraded');
  assert.equal(harness.notice.hidden, false);
});

test('pagehide during pending preference reads can never authorize or play later', async () => {
  const callbacks = [];
  const pendingStorage = {
    getItem(key, callback) { callbacks.push(callback); },
    setItem(key, value, callback) { callback(null, true); }
  };
  const harness = createMusicHarness({ cloudStorage: pendingStorage, deviceStorage: pendingStorage });
  const authorized = harness.controller.authorize('opaque_participant_pending');
  await tick();
  assert.equal(callbacks.length, 2);
  harness.windowListeners.pagehide();
  callbacks.forEach(callback => callback(null, stored(true, 800)));
  await authorized;

  assert.equal(harness.controller.getState().authorized, false);
  assert.equal(harness.audio.playCalls, 0);
  assert.deepEqual(harness.protectedLoads, []);
  assert.ok(harness.releases.includes('background-v0600'));
});

test('turning OFF during protected warmup stays silent and retains the ready source', async () => {
  const media = deferred();
  const harness = createMusicHarness({
    cloudValue: '',
    deviceValue: '',
    startupPromise: Promise.resolve(),
    protectedLoader: asset => {
      harness.protectedLoads.push(asset);
      return media.promise;
    }
  });
  const authorized = harness.controller.authorize('opaque_participant_media');
  await ticks();
  assert.equal(harness.controller.getState().state, 'starting');
  const releasesBeforeOff = harness.releases.length;
  harness.controller.toggle();
  media.resolve('blob:late-protected-background');
  await authorized;
  await ticks();

  assert.equal(harness.audio.playCalls, 0);
  assert.equal(harness.controller.getState().preference, false);
  assert.equal(harness.controller.getState().state, 'off');
  assert.equal(harness.controller.getState().sourceAssigned, true);
  assert.equal(harness.releases.length, releasesBeforeOff, 'ordinary OFF keeps the warmed source available');
});

test('numeric Telegram ID is never used as a localStorage namespace', async () => {
  const rawId = '900000000000001';
  const harness = createMusicHarness({
    cloud: false,
    device: false,
    startupPromise: Promise.resolve(),
    localValues: { [`royal_music_v1:participant:${rawId}`]: stored(false, 900) }
  });

  await harness.controller.authorize(rawId);
  assert.equal(harness.controller.getState().preference, true);
  assert.equal(harness.localCalls.length, 0);
  assert.equal(harness.audio.playCalls, 1);
});

test('autoplay denial stays ON, and detached external media does not block resume', async () => {
  let stateAtGesturePlay = '';
  let harness;
  harness = createMusicHarness({
    cloudValue: stored(true, 1000),
    deviceValue: stored(true, 1000),
    startupPromise: Promise.resolve(),
    play(call) {
      if (call === 1) {
        const error = new Error('autoplay requires a user gesture');
        error.name = 'NotAllowedError';
        return Promise.reject(error);
      }
      if (call === 2) stateAtGesturePlay = harness.button.dataset.musicState;
      return Promise.resolve();
    }
  });
  await harness.controller.authorize('opaque_participant_lifecycle');
  assert.equal(harness.controller.getState().state, 'blocked');
  assert.equal(harness.notice.hidden, true);
  assert.equal(harness.noticeText.textContent, '');
  harness.windowListeners.pointerdown({
    isTrusted: true,
    target: { closest() { return null; } }
  });
  assert.equal(harness.audio.playCalls, 2, 'play is retried synchronously inside the first ordinary gesture');
  assert.equal(stateAtGesturePlay, 'blocked', 'audio.play runs before gesture handling renders a new state');
  await ticks();
  assert.equal(harness.controller.getState().state, 'playing');

  const external = { tagName: 'VIDEO', dataset: {}, muted: false, isConnected: true };
  harness.documentListeners.play({ target: external });
  assert.equal(harness.controller.getState().state, 'paused');
  external.isConnected = false;
  harness.documentListeners.visibilitychange();
  await ticks();
  assert.equal(harness.audio.playCalls, 3, 'visibility resume prunes disconnected external media');
});

test('saved OFF waits for snapshot, warms silently and starts synchronously in one click', async () => {
  const off = createMusicHarness({
    cloudValue: stored(false, 1100),
    deviceValue: stored(false, 1100)
  });
  off.controller.handleAppEvent('auth-ready', {
    user: { participantKey: 'opaque_participant_saved_off' }
  });
  await ticks(6);
  assert.deepEqual(off.protectedLoads, []);
  off.controller.handleAppEvent('snapshot-ready');
  await ticks(6);
  assert.deepEqual(off.protectedLoads, ['background-v0600']);
  assert.equal(off.controller.getState().sourceAssigned, true);
  off.windowListeners.pointerdown({
    isTrusted: true,
    target: { closest() { return null; } }
  });
  await ticks();
  assert.equal(off.controller.getState().preference, false);
  assert.equal(off.audio.playCalls, 0);
  off.windowListeners.click({
    isTrusted: true,
    target: off.button,
    preventDefault() {},
    stopImmediatePropagation() {}
  });
  assert.equal(off.audio.playCalls, 1, 'the prepared source plays inside the captured click');
  assert.equal(off.controller.getState().preference, true);
  await ticks();
  assert.equal(off.controller.getState().state, 'playing');
  const writes = off.storageCalls.filter(call => call.method === 'setItem').map(savedValue).filter(Boolean);
  assert.equal(writes.some(record => record.enabled === false), false);
});

test('a blocked ON preference retries from the captured sound-button click without switching OFF', async () => {
  const harness = createMusicHarness({
    cloudValue: stored(true, 1250),
    deviceValue: stored(true, 1250),
    play(call) {
      if (call === 1) {
        const error = new Error('autoplay blocked');
        error.name = 'NotAllowedError';
        return Promise.reject(error);
      }
      return Promise.resolve();
    }
  });
  await harness.controller.authorize('opaque_participant_blocked_button');
  assert.equal(harness.controller.getState().state, 'blocked');
  harness.windowListeners.click({
    isTrusted: true,
    target: harness.button,
    preventDefault() {},
    stopImmediatePropagation() {}
  });
  assert.equal(harness.audio.playCalls, 2);
  assert.equal(harness.controller.getState().preference, true);
  await ticks();
  assert.equal(harness.controller.getState().state, 'playing');
  const writes = harness.storageCalls.filter(call => call.method === 'setItem').map(savedValue).filter(Boolean);
  assert.equal(writes.some(record => record.enabled === false), false);
});

test('window capture supports every Telegram gesture phase and ignores untrusted events', async () => {
  for (const type of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click']) {
    const harness = createMusicHarness({
      cloudValue: stored(true, 1300),
      deviceValue: stored(true, 1300),
      play(call) {
        if (call === 1) {
          const error = new Error('autoplay blocked');
          error.name = 'NotAllowedError';
          return Promise.reject(error);
        }
        return Promise.resolve();
      }
    });
    await harness.controller.authorize(`opaque_participant_${type}`);
    const event = { isTrusted: false, target: { closest() { return null; } } };
    harness.windowListeners[type](event);
    assert.equal(harness.audio.playCalls, 1, `${type} ignores an untrusted event`);
    event.isTrusted = true;
    harness.windowListeners[type](event);
    assert.equal(harness.audio.playCalls, 2, `${type} retries synchronously on window capture`);
    await ticks();
    assert.equal(harness.controller.getState().state, 'playing');
  }
  assert.doesNotMatch(musicSource, /Telegram включит музыку после первого касания/);
});

test('a pending down-phase play never blocks the standards-valid up phase', async () => {
  const pending = deferred();
  const harness = createMusicHarness({
    cloudValue: stored(true, 1400),
    deviceValue: stored(true, 1400),
    play(call) {
      if (call === 1) {
        const error = new Error('autoplay blocked');
        error.name = 'NotAllowedError';
        return Promise.reject(error);
      }
      if (call === 2) return pending.promise;
      return Promise.resolve();
    }
  });
  await harness.controller.authorize('opaque_participant_pending_gesture');
  const target = { closest() { return null; } };
  harness.windowListeners.pointerdown({ isTrusted: true, target });
  assert.equal(harness.audio.playCalls, 2);
  harness.windowListeners.pointerup({ isTrusted: true, target });
  assert.equal(harness.audio.playCalls, 3, 'pointerup supersedes an unresolved pointerdown play');
  await ticks();
  assert.equal(harness.controller.getState().state, 'playing');
  pending.resolve();
  await ticks();
  assert.equal(harness.controller.getState().state, 'playing');
});

function startupElement() {
  return {
    dataset: {},
    attributes: {},
    hidden: false,
    textContent: '',
    inert: false,
    listeners: {},
    classList: {
      values: new Set(),
      add(...names) { names.forEach(name => this.values.add(name)); },
      remove(...names) { names.forEach(name => this.values.delete(name)); }
    },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    removeAttribute(name) { delete this.attributes[name]; },
    addEventListener(type, handler) { this.listeners[type] = handler; },
    click() { this.listeners.click?.({}); }
  };
}

function createStartupHarness() {
  const timers = [];
  let timerId = 0;
  const root = startupElement();
  const title = startupElement();
  const message = startupElement();
  const retry = startupElement();
  const proceed = startupElement();
  const main = startupElement();
  const nav = startupElement();
  const video = startupElement();
  video.readyState = 4;
  video.pause = () => {};
  video.play = () => Promise.resolve();
  root.querySelector = selector => ({
    '[data-startup-title]': title,
    '[data-startup-message]': message,
    '[data-startup-retry]': retry,
    '[data-startup-continue]': proceed,
    '[data-startup-video]': video
  })[selector] || null;
  const html = startupElement();
  html.classList.values.add('royal-startup-active');
  const document = {
    documentElement: html,
    visibilityState: 'visible',
    getElementById(id) { return id === 'royalStartup' ? root : null; },
    querySelector(selector) { return selector === 'main.app' ? main : selector === 'nav.bottom-nav' ? nav : null; },
    addEventListener() {}
  };
  const sandbox = {
    console,
    Promise,
    Date,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    document,
    matchMedia: () => ({ matches: false }),
    location: { reload() {} },
    addEventListener() {},
    dispatchEvent() {},
    setTimeout(fn, ms) {
      const item = { id: ++timerId, fn, ms, active: true };
      timers.push(item);
      return item.id;
    },
    clearTimeout(id) {
      const item = timers.find(timer => timer.id === id);
      if (item) item.active = false;
    }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(startupSource, sandbox, { filename: 'startup-v0600.js' });
  return {
    controller: sandbox.RoyalStartupV0600,
    root,
    title,
    message,
    proceed,
    main,
    nav,
    timers,
    runNext() {
      const next = timers.filter(item => item.active).sort((a, b) => a.ms - b.ms || a.id - b.id)[0];
      assert.ok(next, 'expected a pending timer');
      next.active = false;
      next.fn();
      return next;
    }
  };
}

test('degraded startup has retry/continue and an honest welcome message', () => {
  const harness = createStartupHarness();
  harness.controller.handleAppEvent('auth-ready', { user: { crmName: 'Тестовая участница' } });
  harness.controller.handleAppEvent('snapshot-error', { code: 'WORKER_TIMEOUT' });
  assert.equal(harness.controller.state, 'degraded');
  harness.proceed.click();
  harness.runNext();
  assert.equal(harness.controller.state, 'welcome');
  assert.equal(harness.title.textContent, 'Добро пожаловать, Тестовая участница!');
  assert.equal(harness.message.textContent, 'Открываем ограниченный режим без справочника.');
});

test('fatal is terminal even when auth and snapshot events arrive late', () => {
  const harness = createStartupHarness();
  harness.controller.handleAppEvent('fatal', { message: 'AUTH_FAILED' });
  harness.controller.handleAppEvent('auth-ready', { user: { crmName: 'Тестовая участница' } });
  harness.controller.handleAppEvent('snapshot-ready', {});
  assert.equal(harness.controller.state, 'fatal');
  assert.equal(harness.controller.terminal, true);
  assert.equal(harness.controller.ready, false);
  assert.equal(harness.main.inert, true);
  assert.equal(harness.root.hidden, false);
});

test('scheduled welcome callback cannot reveal after fatal', () => {
  const harness = createStartupHarness();
  harness.controller.handleAppEvent('auth-ready', { user: { crmName: 'Тестовая участница' } });
  harness.controller.handleAppEvent('snapshot-ready', {});
  harness.runNext();
  assert.equal(harness.controller.state, 'welcome');
  const lateReveal = harness.timers.find(item => item.active && item.ms === 820);
  assert.ok(lateReveal);
  harness.controller.handleAppEvent('fatal', { message: 'LATE_FATAL' });
  lateReveal.fn();
  harness.timers.filter(item => item.active).forEach(item => item.fn());
  assert.equal(harness.controller.state, 'fatal');
  assert.equal(harness.controller.ready, false);
  assert.equal(harness.root.hidden, false);
  assert.equal(harness.main.inert, true);
});

function elementMap() {
  const values = new Map();
  return id => {
    if (!values.has(id)) values.set(id, { textContent: '', innerHTML: '', dataset: {}, addEventListener() {} });
    return values.get(id);
  };
}

function createAppHarness() {
  const mediaResponse = deferred();
  const revoked = [];
  const windowListeners = {};
  const getElement = elementMap();
  let mediaCalls = 0;
  const sandbox = {
    console,
    Promise,
    Map,
    Set,
    URL: {
      sequence: 0,
      createObjectURL() { this.sequence += 1; return `blob:app-${this.sequence}`; },
      revokeObjectURL(value) { revoked.push(value); }
    },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    Telegram: {
      WebApp: {
        initData: 'signed-init-data',
        initDataUnsafe: { user: { first_name: 'Тест' } },
        ready() {},
        expand() {}
      }
    },
    __ROYAL_BUILD__: '0.6.0',
    addEventListener(type, handler) { windowListeners[type] = handler; },
    dispatchEvent() {},
    document: {
      body: { innerHTML: '', appendChild() {} },
      getElementById: getElement,
      querySelectorAll() { return []; },
      addEventListener() {},
      querySelector() { return null; }
    },
    fetch: async url => {
      if (String(url).endsWith('/auth')) {
        return { ok: true, status: 200, json: async () => ({
          ok: true,
          access: true,
          session: 'session-a',
          user: { crmName: 'Тест' },
          role: { title: 'Участник' },
          memberships: []
        }) };
      }
      if (String(url).endsWith('/snapshot')) {
        return { ok: true, status: 200, json: async () => ({ ok: true, snapshot: { stats: {} } }) };
      }
      if (String(url).includes('/project-mayak-media?asset=background-v0600')) {
        mediaCalls += 1;
        return mediaResponse.promise;
      }
      throw new Error(`unexpected fetch ${url}`);
    },
    setTimeout,
    clearTimeout
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(appSource, sandbox, { filename: 'app.js' });
  return { sandbox, mediaResponse, revoked, windowListeners, get mediaCalls() { return mediaCalls; } };
}

test('protected media allow-list rejects legacy audio and revokes a cancelled exact asset', async () => {
  const harness = createAppHarness();
  await ticks();
  const api = harness.sandbox.RoyalAppV0600;
  await assert.rejects(api.fetchProtectedMediaObjectUrl('audio'), /PROJECT_MEDIA_UNKNOWN/);
  assert.equal(harness.mediaCalls, 0, 'legacy key must be rejected before fetch');

  const pending = api.fetchProtectedMediaObjectUrl('background-v0600');
  await tick();
  assert.equal(harness.mediaCalls, 1);
  api.releaseProtectedMedia('background-v0600');
  harness.mediaResponse.resolve({
    ok: true,
    status: 200,
    blob: async () => ({ size: 128, type: 'audio/mpeg' })
  });
  await assert.rejects(pending, /PROJECT_MEDIA_CANCELLED/);
  assert.deepEqual(harness.revoked, ['blob:app-1']);
});

function createWriteAccessHarness(options = {}) {
  const gate = deferred();
  const windowListeners = {};
  const timers = [];
  let requests = 0;
  const sandbox = {
    console,
    Promise,
    Telegram: {
      WebApp: {
        initDataUnsafe: { user: { allows_write_to_pm: false } },
        isVersionAtLeast: () => true,
        requestWriteAccess(callback) { requests += 1; callback(true); },
        onEvent() {}
      }
    },
    RoyalStartupV0600: options.withStartup ? { whenRevealed: gate.promise, terminal: false } : null,
    __ROYAL_AUTH_READY__: options.durableAuth || null,
    localStorage: { setItem() {} },
    document: {
      body: { appendChild() {} },
      documentElement: { classList: { add() {}, remove() {} } },
      addEventListener() {}
    },
    addEventListener(type, handler) { windowListeners[type] = handler; },
    setTimeout(fn) {
      if (options.deferTimers) {
        timers.push(fn);
        return timers.length;
      }
      fn();
      return 1;
    }
  };
  if (options.withRenderAuth !== false) sandbox.renderAuth = data => data;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(writeAccessSource, sandbox, { filename: 'write-access-v0538.js' });
  return { sandbox, gate, timers, windowListeners, get requests() { return requests; } };
}

test('write access waits for reveal, including auth completed before module load', async () => {
  const preview = createWriteAccessHarness({
    withStartup: true,
    withRenderAuth: false,
    durableAuth: { access: true, build: '0.6.0' }
  });
  await tick();
  assert.equal(preview.requests, 0);
  preview.gate.resolve({ degraded: false });
  await ticks();
  assert.equal(preview.requests, 1);

  const eventRace = createWriteAccessHarness({ withStartup: true, withRenderAuth: false });
  eventRace.windowListeners['royal:auth-ready']({ detail: { access: true, build: '0.6.0' } });
  assert.equal(eventRace.requests, 0);
  eventRace.gate.resolve({ degraded: false });
  await ticks();
  assert.equal(eventRace.requests, 1);

  const stable = createWriteAccessHarness({ withStartup: false });
  stable.sandbox.renderAuth({ access: true });
  assert.equal(stable.requests, 1, 'v0.5.59 keeps its immediate post-auth behavior');
});

test('write access timer cannot fire after startup becomes terminal', async () => {
  const preview = createWriteAccessHarness({
    withStartup: true,
    withRenderAuth: false,
    deferTimers: true,
    durableAuth: { access: true, build: '0.6.0' }
  });
  preview.gate.resolve({ degraded: false });
  await ticks();
  assert.equal(preview.timers.length, 1);
  preview.sandbox.RoyalStartupV0600.terminal = true;
  preview.timers.shift()();
  assert.equal(preview.requests, 0);
});

test('v0.6 markup separates dialog controls from the live status region', () => {
  const preview = fs.readFileSync(path.join(ROOT, 'app-v0600.html'), 'utf8');
  const overlay = preview.match(/<div class="royal-startup"[\s\S]*?<\/section>\s*<\/div>/)?.[0] || '';
  const liveRegion = preview.match(/<div class="royal-startup-announcement"[\s\S]*?<\/div>/)?.[0] || '';
  assert.match(overlay, /role="dialog"/);
  assert.match(liveRegion, /role="status"/);
  assert.doesNotMatch(liveRegion, /<button/);
  const main = preview.match(/<main class="app"[\s\S]*?<\/main>/)?.[0] || '';
  assert.match(main, /data-royal-music-notice-text/);
  assert.match(main, /data-royal-music-live[^>]*aria-live="polite"/);
  assert.doesNotMatch(preview.match(/data-royal-music-notice-text[^>]*>/)?.[0] || '', /role=|aria-live=/);
  assert.match(preview, /data-royal-music-retry/);
});

test('v0.6 is the general entry and media remain protected/private', () => {
  const preview = fs.readFileSync(path.join(ROOT, 'app-v0600.html'), 'utf8');
  const stable = fs.readFileSync(path.join(ROOT, 'app-v0559.html'), 'utf8');
  const router = fs.readFileSync(path.join(ROOT, 'app.html'), 'utf8');
  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

  assert.match(preview, /window\.__ROYAL_BUILD__='0\.6\.0'/);
  assert.ok(preview.indexOf('startup-v0600.js') < preview.indexOf('src="app.js'));
  assert.ok(preview.indexOf('music-v0600.js') < preview.indexOf('src="app.js'));
  assert.match(preview, /<main class="app" inert aria-hidden="true">/);
  assert.match(preview, /assets\/startup-pigeon-v0600\.mp4/);
  assert.doesNotMatch(stable, /__ROYAL_BUILD__/);
  assert.match(appSource, /: '0\.5\.59';/);
  assert.match(appSource, /Authorization: `Bearer \$\{sessionAtStart\}`/);
  assert.match(router, /const target = 'app-v0600\.html'/);
  assert.match(router, /releaseBuild', '20260823-startup-priority-hotfix3'/);
  assert.match(preview, /music-v0600\.js\?v=20260823-startup-priority-hotfix3/);
  assert.match(preview, /app\.js\?v=20260822-history-music-hotfix1/);
  assert.doesNotMatch(router, /app-v0559\.html/);
  assert.match(index, /app-v0600\.html/);
  assert.doesNotMatch(index, /app-v0559\.html/);
  assert.equal(fs.existsSync(path.join(ROOT, 'assets', 'royal-background-v0600.m4a')), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'assets', 'project-mayak-background.mp3')), false);
});

test('startup video is compact, fast-started and has a poster fallback', () => {
  const video = fs.readFileSync(path.join(ROOT, 'assets', 'startup-pigeon-v0600.mp4'));
  const poster = fs.statSync(path.join(ROOT, 'assets', 'startup-pigeon-v0600.jpg'));
  assert.ok(video.length < 300_000);
  assert.ok(video.indexOf(Buffer.from('moov')) > 0);
  assert.ok(video.indexOf(Buffer.from('moov')) < video.indexOf(Buffer.from('mdat')));
  assert.ok(poster.size > 0 && poster.size < 50_000);
});
