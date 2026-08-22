const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const clientSource = fs.readFileSync(path.join(ROOT, 'admin-data-client-v0600.js'), 'utf8');

function response(status, data) {
  return {
    ok:status >= 200 && status < 300,
    status,
    json:async () => data
  };
}

function payload(marker='base', journalRows=[]) {
  return {
    ok:true,
    marker,
    permissions:{ isAdmin:true, canEdit:true },
    adminData:{ participants:[], teams:[], journal:{ rows:journalRows } }
  };
}

function createClient(initialResponses=[], fetchImpl=null) {
  const responses = [...initialResponses];
  const delays = [];
  const calls = [];
  const sandbox = {
    console,
    sessionToken:'session-a',
    API_URL:'https://worker.test',
    TypeError,
    Error,
    Promise,
    setTimeout(fn, ms) {
      delays.push(ms);
      queueMicrotask(fn);
      return delays.length;
    },
    fetch:async (url, init) => {
      calls.push({ url, init });
      if (fetchImpl) return fetchImpl(url, init);
      if (!responses.length) throw new Error('TEST_RESPONSE_MISSING');
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next;
    }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(clientSource, sandbox, { filename:'admin-data-client-v0600.js' });
  return {
    sandbox,
    client:sandbox.RoyalAdminDataV0600,
    calls,
    delays,
    push(...items){ responses.push(...items); }
  };
}

test('transient failures retry 0/700/1600 then cache the successful payload', async () => {
  const ready = payload('ready');
  const fixture = createClient([
    new TypeError('Failed to fetch'),
    response(503, { ok:false, error:'UPSTREAM_UNAVAILABLE' }),
    response(200, ready)
  ]);

  const loaded = await fixture.client.load();
  assert.equal(loaded, ready);
  assert.equal(fixture.calls.length, 3);
  assert.deepEqual(fixture.delays, [700, 1600]);

  assert.equal(await fixture.client.load(), ready);
  assert.equal(fixture.calls.length, 3, 'memory cache should avoid a duplicate read');
});

test('concurrent force loads share one in-flight request', async () => {
  let resolveFetch;
  const fixture = createClient([], () => new Promise(resolve => { resolveFetch = resolve; }));
  const first = fixture.client.load({ force:true });
  const second = fixture.client.load({ force:true });
  assert.equal(fixture.calls.length, 1);

  const ready = payload('single-flight');
  resolveFetch(response(200, ready));
  assert.equal(await first, ready);
  assert.equal(await second, ready);
  assert.equal(fixture.calls.length, 1);
});

test('clearing cache invalidates an older same-session request in flight', async () => {
  let resolveFetch;
  const fixture = createClient([], () => new Promise(resolve => { resolveFetch = resolve; }));
  const pending = fixture.client.load({ force:true });
  fixture.client.clear('admin-ui');
  resolveFetch(response(200, payload('too-old')));

  await assert.rejects(pending, error => error.code === 'ADMIN_CACHE_INVALIDATED');
  assert.equal(fixture.client.current, null);
});

for (const status of [401, 403]) {
  test(`${status} is not retried, clears protected cache and never uses stale fallback`, async () => {
    const cached = payload(`cached-${status}`);
    const fixture = createClient([
      response(200, cached),
      response(status, { ok:false, error:status === 401 ? 'SESSION_EXPIRED' : 'ADMIN_REQUIRED' })
    ]);
    await fixture.client.load();

    await assert.rejects(
      fixture.client.load({ force:true, allowStale:true }),
      error => error.httpStatus === status
    );
    assert.equal(fixture.calls.length, 2);
    assert.deepEqual(fixture.delays, []);
    assert.equal(fixture.client.current, null);
  });
}

test('same-session stale data is used only after transient retry exhaustion', async () => {
  const cached = payload('cached');
  const fixture = createClient([
    response(200, cached),
    new TypeError('Failed to fetch'),
    new TypeError('Failed to fetch'),
    new TypeError('Failed to fetch')
  ]);
  await fixture.client.load();

  const recovered = await fixture.client.load({ force:true, allowStale:true });
  assert.equal(recovered, cached);
  assert.equal(fixture.calls.length, 4);
  assert.deepEqual(fixture.delays, [700, 1600]);
});

test('changing session invalidates cache before another protected read', async () => {
  const first = payload('session-a');
  const second = payload('session-b');
  const fixture = createClient([response(200, first), response(200, second)]);
  assert.equal(await fixture.client.load(), first);

  fixture.sandbox.sessionToken = 'session-b';
  assert.equal(await fixture.client.load(), second);
  assert.equal(fixture.calls.length, 2);
  assert.match(fixture.calls[1].init.headers.Authorization, /session-b$/);
});

test('pending committed writes prevent a lagging snapshot from replacing shared cache', async () => {
  const base = payload('base');
  const stale = payload('stale');
  const optimistic = payload('optimistic', [{ requestId:'request-1' }]);
  const fresh = payload('fresh', [{ requestId:'request-1' }]);
  const fixture = createClient([response(200, base), response(200, stale), response(200, fresh)]);
  await fixture.client.load();

  fixture.client.protect('request-1');
  assert.equal(fixture.client.accept(optimistic), true);
  assert.equal(await fixture.client.load({ force:true }), optimistic);
  assert.equal(fixture.client.current, optimistic);

  fixture.client.release('request-1');
  assert.equal(await fixture.client.load({ force:true }), fresh);
  assert.equal(fixture.client.current, fresh);
});

test('commit:false exposes raw snapshot for journal validation without mutating cache', async () => {
  const base = payload('base');
  const optimistic = payload('optimistic', [{ requestId:'request-2' }]);
  const stale = payload('raw-stale');
  const fixture = createClient([response(200, base), response(200, stale)]);
  await fixture.client.load();
  fixture.client.protect('request-2');
  fixture.client.accept(optimistic);

  const raw = await fixture.client.load({ force:true, commit:false });
  assert.equal(raw, stale);
  assert.equal(fixture.client.current, optimistic);
});

test('every admin-data consumer delegates to the shared client', () => {
  const files = [
    'admin-v0600.js',
    'admin-write-v0600-v3.js',
    'admin-write-gate-v0600.js',
    'admin-eligibility-v0600.js',
    'admin-participant-detail-v0600.js',
    'admin-team-detail-v0600.js'
  ];
  for (const file of files) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.match(source, /RoyalAdminDataV0600/, `${file} must use the shared client`);
    assert.doesNotMatch(source, /fetch\([\s\S]{0,160}\/admin-data/, `${file} must not fetch admin-data directly`);
  }

  const gate = fs.readFileSync(path.join(ROOT, 'admin-write-gate-v0600.js'), 'utf8');
  const write = fs.readFileSync(path.join(ROOT, 'admin-write-v0600-v3.js'), 'utf8');
  assert.match(gate, /client\.load\(\{ force:true \}\)/);
  assert.match(gate, /toggle\(result\.data\)/);
  assert.match(write, /client\.load\(\{ force, allowStale, commit:false \}\)/);
  assert.ok((write.match(/loadAdmin\(false\)/g) || []).length >= 4,
    'opening create/edit forms should reuse the protected cached snapshot');
});

test('detail pages distinguish not-found from network failures and expose retry actions', () => {
  const participant = fs.readFileSync(path.join(ROOT, 'admin-participant-detail-v0600.js'), 'utf8');
  const team = fs.readFileSync(path.join(ROOT, 'admin-team-detail-v0600.js'), 'utf8');
  assert.match(participant, /Не удалось загрузить участника/);
  assert.match(participant, /data-admin-participant-retry/);
  assert.match(participant, /PARTICIPANT_NOT_FOUND/);
  assert.match(team, /Не удалось загрузить команду/);
  assert.match(team, /data-admin-team-retry/);
  assert.match(team, /TEAM_NOT_FOUND/);
});
