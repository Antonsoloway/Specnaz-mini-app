const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'transport-v0514.js'),
  'utf8'
);
const writeSource = fs.readFileSync(
  path.join(__dirname, '..', 'admin-write-v0600-v3.js'),
  'utf8'
);
const adminReadSource = fs.readFileSync(
  path.join(__dirname, '..', 'admin-v0600.js'),
  'utf8'
);
const adminDataClientSource = fs.readFileSync(
  path.join(__dirname, '..', 'admin-data-client-v0600.js'),
  'utf8'
);

function createTransport(options={}) {
  const scheduled = [];
  const nativeCalls = [];
  const window = {
    location: { search: options.search || '' },
    fetch: async (input, init) => {
      nativeCalls.push({ input, init });
      if (options.fetch) return options.fetch(input, init);
      return new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  };
  const sandbox = {
    window,
    console,
    URL,
    URLSearchParams,
    Response,
    Uint8Array,
    Error,
    Promise,
    setTimeout(fn, ms) {
      scheduled.push(ms);
      return scheduled.length;
    },
    clearTimeout() {},
    document: {
      createElement() { return {}; },
      head: { appendChild() {} }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'transport-v0514.js' });
  return { window, scheduled, nativeCalls };
}

test('admin writes receive a 60 second transport window', async () => {
  const transport = createTransport();
  await transport.window.fetch(
    'https://royal-crm-miniapp-api.tropical-spoon.workers.dev/admin-write',
    { method: 'POST', body: '{}' }
  );
  assert.equal(transport.scheduled.at(-1), 60000);
  assert.equal(transport.nativeCalls.length, 1);
  assert.equal(transport.window.__ROYAL_TRANSPORT_VERSION__, '0.5.14.3');
});

test('admin-data receives one 20 second transport attempt', async () => {
  const transport = createTransport();
  await transport.window.fetch(
    'https://royal-crm-miniapp-api.tropical-spoon.workers.dev/admin-data'
  );
  assert.equal(transport.scheduled.at(-1), 20000);
  assert.equal(transport.nativeCalls.length, 1);
});

test('ordinary Worker reads keep the five second timeout', async () => {
  const transport = createTransport();
  await transport.window.fetch(
    'https://royal-crm-miniapp-api.tropical-spoon.workers.dev/snapshot'
  );
  assert.equal(transport.scheduled.at(-1), 5000);
});

test('protected admin-data never falls through to unsupported GAS JSONP', async () => {
  const transport = createTransport({
    search:'?gas=https%3A%2F%2Fscript.google.com%2Fmacros%2Fs%2Ftest%2Fexec',
    fetch:async () => { throw new TypeError('Failed to fetch'); }
  });
  await assert.rejects(
    transport.window.fetch('https://royal-crm-miniapp-api.tropical-spoon.workers.dev/admin-data'),
    /Failed to fetch/
  );
  assert.equal(transport.nativeCalls.length, 1);
});

test('explicit WRITE_BUSY is retried safely with the same request id', () => {
  assert.match(writeSource, /WRITE_BUSY_RETRY_DELAYS_MS = \[700, 1400, 2500\]/);
  assert.match(writeSource, /clean\(error\?\.code\) === 'WRITE_BUSY'/);
  assert.match(writeSource, /return await postWriteOnce\(id, op, payload\)/);
  assert.match(writeSource, /Ждём и повторяем автоматически/);
  assert.match(writeSource, /const VERSION = '0\.6\.0-write\.5-ui\.10'/);
});

test('all admin-data retry and cache behavior lives in the shared client', () => {
  assert.match(adminDataClientSource, /RETRY_DELAYS_MS = Object\.freeze\(\[0, 700, 1600\]\)/);
  assert.match(adminDataClientSource, /ADMIN_NETWORK_RETRY_EXHAUSTED/);
  assert.match(adminDataClientSource, /Связь с сервером прервалась/);
  assert.match(adminReadSource, /RoyalAdminDataV0600/);
  assert.match(writeSource, /RoyalAdminDataV0600/);
  assert.doesNotMatch(adminReadSource, /fetch\(`\$\{API_URL\}\/admin-data/);
  assert.doesNotMatch(writeSource, /fetch\(`\$\{API_URL\}\/admin-data/);
});

test('queued commit closes immediately and refreshes the private snapshot in background', () => {
  assert.match(writeSource, /result\?\.adminSnapshot\?\.queued === true/);
  assert.match(writeSource, /applyCommittedResult\(result\)/);
  assert.match(writeSource, /refreshSnapshotInBackground\(\)\.catch/);
  assert.match(writeSource, /SNAPSHOT_POLL_DELAYS_MS/);
  assert.doesNotMatch(writeSource, /Сохраняем команду и фото… Это может занять до минуты/);
});

test('a lagging private snapshot cannot replace an optimistic committed record', () => {
  assert.match(writeSource, /PENDING_WRITE_MONOTONIC_SNAPSHOT_V0600/);
  assert.match(writeSource, /state\.payload && \(!force \|\| state\.pendingRequestIds\.size\)/);
  assert.match(writeSource, /allPendingConfirmed = \[\.\.\.state\.pendingRequestIds\]/);
  assert.match(writeSource, /journalContains\(data,requestId\)/);
  assert.match(writeSource, /return state\.payload \|\| payloadBeforeFetch/);
});

test('v0.6 refreshes public and visible admin snapshots after the one-off trigger', () => {
  assert.match(writeSource, /ADMIN_PUBLIC_SNAPSHOT_LIVE_REFRESH_V0600/);
  assert.match(writeSource, /PUBLIC_SNAPSHOT_WATCH_MS = 20000/);
  assert.match(writeSource, /refreshPublicSnapshotAfterMutation\(\)\.catch/);
  assert.match(writeSource, /loadSnapshot\(\)/);
  assert.match(writeSource, /RoyalAdminV0600\?\.acceptPayload/);
  assert.match(writeSource, /document\.addEventListener\('visibilitychange'/);
});
