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

function createTransport() {
  const scheduled = [];
  const nativeCalls = [];
  const window = {
    location: { search: '' },
    fetch: async (input, init) => {
      nativeCalls.push({ input, init });
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
  assert.equal(transport.window.__ROYAL_TRANSPORT_VERSION__, '0.5.14.2');
});

test('ordinary Worker reads keep the five second timeout', async () => {
  const transport = createTransport();
  await transport.window.fetch(
    'https://royal-crm-miniapp-api.tropical-spoon.workers.dev/snapshot'
  );
  assert.equal(transport.scheduled.at(-1), 5000);
});

test('explicit WRITE_BUSY is retried safely with the same request id', () => {
  assert.match(writeSource, /WRITE_BUSY_RETRY_DELAYS_MS = \[700, 1400, 2500\]/);
  assert.match(writeSource, /clean\(error\?\.code\) === 'WRITE_BUSY'/);
  assert.match(writeSource, /return await postWriteOnce\(id, op, payload\)/);
  assert.match(writeSource, /Ждём и повторяем автоматически/);
  assert.match(writeSource, /const VERSION = '0\.6\.0-write\.5-ui\.8'/);
});

test('transient admin-data reads retry briefly before showing a friendly error', () => {
  assert.match(adminReadSource, /ADMIN_READ_RETRY_DELAYS_MS = \[0, 700, 1600\]/);
  assert.match(writeSource, /ADMIN_READ_RETRY_DELAYS_MS = \[0, 700, 1600\]/);
  assert.match(adminReadSource, /ADMIN_NETWORK_RETRY_EXHAUSTED/);
  assert.match(writeSource, /ADMIN_NETWORK_RETRY_EXHAUSTED/);
  assert.match(adminReadSource, /Связь с сервером прервалась/);
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
