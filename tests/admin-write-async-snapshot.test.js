const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const adminDataSource = fs.readFileSync(
  path.join(ROOT, 'apps-script-live', '28_MINIAPP_ADMIN_DATA.js'),
  'utf8'
);

function createQueueSandbox() {
  const values = new Map([
    ['DATA_GITHUB_REPO', 'owner/private-data'],
    ['DATA_GITHUB_TOKEN', 'secret'],
    ['DATA_GITHUB_BRANCH', 'main']
  ]);
  const triggers = [];
  const triggerDelays = [];
  const publishes = [];
  let uuid = 0;
  let scriptHeld = false;
  let userHeld = false;

  const properties = {
    getProperty(key) { return values.has(key) ? values.get(key) : null; },
    setProperty(key, value) { values.set(key, String(value)); return this; },
    deleteProperty(key) { values.delete(key); return this; }
  };

  function lock(kind) {
    return {
      tryLock() {
        if (kind === 'script') scriptHeld = true;
        else userHeld = true;
        return true;
      },
      releaseLock() {
        if (kind === 'script') scriptHeld = false;
        else userHeld = false;
      }
    };
  }

  const sandbox = {
    console,
    Date,
    JSON,
    Math,
    PropertiesService: { getScriptProperties: () => properties },
    Utilities: { getUuid: () => `uuid-${++uuid}` },
    LockService: {
      getScriptLock: () => lock('script'),
      getUserLock: () => lock('user')
    },
    ScriptApp: {
      getProjectTriggers: () => [...triggers],
      deleteTrigger(trigger) {
        const index = triggers.indexOf(trigger);
        if (index >= 0) triggers.splice(index, 1);
      },
      newTrigger(handler) {
        const trigger = { getHandlerFunction: () => handler };
        return {
          timeBased() { return this; },
          after(delay) { triggerDelays.push(delay); return this; },
          create() { triggers.push(trigger); return trigger; }
        };
      }
    },
    MINIAPP_putPrivateGitHubFile_(repo, branch, filePath, text, token, hash) {
      assert.equal(scriptHeld, false, 'GitHub publish must happen after ScriptLock release');
      assert.equal(userHeld, true, 'private publishes must be serialized separately');
      publishes.push({ repo, branch, filePath, text, token, hash });
      return { ok: true, sha: 'new-sha' };
    },
    MINIAPP_adminSha256_: text => `hash-${text.length}`
  };

  vm.createContext(sandbox);
  vm.runInContext(adminDataSource, sandbox, { filename: '28_MINIAPP_ADMIN_DATA.js' });
  sandbox.MINIAPP_adminSha256_ = text => `hash-${text.length}`;
  sandbox.MINIAPP_buildAdminData_ = () => ({
    version: '0.6.0-write.5',
    participants: [{ telegramId: '1' }],
    teams: [{ name: 'Team' }],
    stats: { participants: 1, teams: 1 },
    journal: { rows: [{ requestId: 'request-1' }] }
  });

  return { sandbox, values, triggers, triggerDelays, publishes };
}

test('admin snapshot queue is durable, deduplicated and publishes outside ScriptLock', () => {
  const { sandbox, values, triggers, triggerDelays, publishes } = createQueueSandbox();

  const first = sandbox.MINIAPP_queueAdminSnapshotRefresh_('first mutation');
  assert.equal(first.queued, true);
  assert.equal(first.response, 'commit-first');
  assert.equal(first.scheduled, true);
  assert.equal(triggers.length, 1);
  assert.equal(triggerDelays[0], 1500);

  const second = sandbox.MINIAPP_queueAdminSnapshotRefresh_('second mutation');
  assert.equal(second.deduplicated, true);
  assert.equal(triggers.length, 1);

  const result = sandbox.MINIAPP_flushQueuedAdminSnapshot();
  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.equal(publishes.length, 1);
  assert.equal(triggers.length, 0);
  assert.equal(values.has('MINIAPP_ADMIN_SNAPSHOT_QUEUE_V1'), false);
  assert.match(values.get('MINIAPP_ADMIN_DATA_LAST_HASH'), /^hash-/);
});

test('a superseded capture is never allowed to overwrite a newer queued mutation', () => {
  const { sandbox, values, triggers, publishes } = createQueueSandbox();
  sandbox.MINIAPP_queueAdminSnapshotRefresh_('old mutation');

  sandbox.MINIAPP_prepareAdminSnapshot_ = () => {
    sandbox.MINIAPP_queueAdminSnapshotRefresh_('new mutation');
    return { ok: true, changed: true, hash: 'old-hash' };
  };

  const result = sandbox.MINIAPP_flushQueuedAdminSnapshot();
  assert.equal(result.reason, 'SUPERSEDED');
  assert.equal(publishes.length, 0);
  assert.equal(triggers.length, 1);
  const queued = JSON.parse(values.get('MINIAPP_ADMIN_SNAPSHOT_QUEUE_V1'));
  assert.equal(queued.reason, 'new mutation');
});

test('all write paths use commit-first metadata and short lock scope', () => {
  const writeSource = fs.readFileSync(
    path.join(ROOT, 'apps-script-live', '29_MINIAPP_ADMIN_WRITE.js'),
    'utf8'
  );
  const backendSource = fs.readFileSync(
    path.join(ROOT, 'apps-script-live', '30_MINIAPP_ADMIN_WRITE_BACKEND.js'),
    'utf8'
  );
  const finalSource = fs.readFileSync(
    path.join(ROOT, 'apps-script-live', '33_MINIAPP_ADMIN_WRITE_FINAL.js'),
    'utf8'
  );
  const unifiedSource = fs.readFileSync(
    path.join(ROOT, 'apps-script-live', '25_MINIAPP_UNIFIED_SNAPSHOT.js'),
    'utf8'
  );

  assert.match(writeSource, /MINIAPP_queueAdminSnapshotRefresh_\('admin-write-commit'\)/);
  assert.match(backendSource, /lock\.tryLock\(6000\)/);
  assert.match(backendSource, /ADMIN_SNAPSHOT_QUEUE_MISSING/);
  assert.match(finalSource, /mode:[\s\S]*'queued-private-trigger'/);
  assert.match(finalSource, /record: after/);
  assert.match(unifiedSource, /lock\.releaseLock\(\)[\s\S]*MINIAPP_exportAdminSnapshotToGitHub\(\)/);
  assert.match(unifiedSource, /lock\.releaseLock\(\)[\s\S]*MINIAPP_unifiedPutWithRetry_/);
});
