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
  assert.match(writeSource, /WRITE_BUSY_RETRY_DELAYS_MS = \[1500, 3000\]/);
  assert.match(writeSource, /clean\(error\?\.code\) === 'WRITE_BUSY'/);
  assert.match(writeSource, /return await postWriteOnce\(id, op, payload\)/);
  assert.match(writeSource, /Ждём и повторяем автоматически/);
  assert.match(writeSource, /const VERSION = '0\.6\.0-write\.5-ui\.4'/);
});
