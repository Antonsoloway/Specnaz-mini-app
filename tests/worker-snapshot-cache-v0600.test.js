const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const cacheSource = read('worker/src/private-snapshot-cache.js');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function loadCache(fetch) {
  const sandbox = { fetch, Promise, Date, Error, encodeURIComponent };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const executable = cacheSource
    .replace('export async function loadPrivateSnapshotCached', 'async function loadPrivateSnapshotCached')
    .concat('\nglobalThis.__loadPrivateSnapshotCached = loadPrivateSnapshotCached;');
  vm.runInContext(executable, sandbox, { filename: 'private-snapshot-cache.js' });
  return sandbox.__loadPrivateSnapshotCached;
}

test('shared private snapshot cache deduplicates concurrent and sequential reads', async () => {
  const body = deferred();
  const calls = [];
  const load = loadCache(async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, text: () => body.promise };
  });
  const env = {
    DATA_REPO: 'owner/private-data',
    DATA_BRANCH: 'main',
    DATA_PATH: 'snapshot.json',
    GITHUB_TOKEN: 'configured-secret'
  };

  const first = load(env);
  const second = load(env);
  assert.equal(calls.length, 1);
  body.resolve(JSON.stringify({ participants: [{ name: 'A' }], teams: [] }));
  const [one, two] = await Promise.all([first, second]);
  assert.equal(one, two);
  assert.equal((await load(env)), one);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.headers.Accept, 'application/vnd.github.raw+json');
  assert.doesNotMatch(calls[0].url, /configured-secret/);
});

test('auth and every public snapshot enricher use the same cache module', () => {
  const files = [
    'worker/src/index.js',
    'worker/src/entry-v140.js',
    'worker/src/entry-v150.js',
    'worker/src/entry-v170.js',
    'worker/src/entry-v1110.js'
  ];
  files.forEach(file => {
    const source = read(file);
    assert.match(source, /from '\.\/private-snapshot-cache\.js'/, file);
    assert.match(source, /loadPrivateSnapshotCached\(env\)/, file);
  });
  assert.match(cacheSource, /CACHE_TTL_MS = 60_000/);
  assert.match(cacheSource, /if \(inFlight\) return inFlight/);
});
