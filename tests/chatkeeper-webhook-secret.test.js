const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const coreSource = fs.readFileSync(
  path.join(ROOT, 'apps-script-live', '01_CORE_MAIN.js'),
  'utf8'
);
const auditSource = fs.readFileSync(
  path.join(ROOT, 'apps-script-live', '34_MINIAPP_AUDIT_V2.js'),
  'utf8'
);

function functionSource(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${name} must exist`);
  const next = source.indexOf('\nfunction ', start + marker.length);
  return source.slice(start, next === -1 ? source.length : next);
}

function createRuntimeValidator() {
  const properties = new Map();
  const declaration = coreSource.match(
    /^const CHATKEEPER_WEBHOOK_SECRET_PROPERTY = '[^']+';$/m
  );
  assert.ok(declaration, 'Script Property declaration must exist');
  const sandbox = {
    clean_: value => String(value == null ? '' : value).trim(),
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty(key) { return properties.get(String(key)) || null; }
        };
      }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext([
    declaration[0],
    functionSource(coreSource, 'chatKeeperWebhookSecret_'),
    functionSource(coreSource, 'isValidChatKeeperWebhookSecret_')
  ].join('\n'), sandbox, { filename: 'chatkeeper-runtime-validator.js' });
  return { sandbox, properties };
}

function createMigrationSandbox({ existing, legacy } = {}) {
  const properties = new Map();
  const operations = [];
  if (existing) properties.set('ROYAL_CRM_CHATKEEPER_WEBHOOK_SECRET', existing);
  let lockGets = 0;
  let releases = 0;
  const sandbox = {
    console,
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty(key) { return properties.get(String(key)) || null; },
          setProperty(key, value) {
            properties.set(String(key), String(value));
            operations.push({ type: 'set', key: String(key) });
            return this;
          },
          deleteProperty(key) {
            properties.delete(String(key));
            operations.push({ type: 'delete', key: String(key) });
            return this;
          }
        };
      }
    },
    LockService: {
      getScriptLock() {
        lockGets += 1;
        return {
          tryLock() { return true; },
          releaseLock() { releases += 1; }
        };
      }
    }
  };
  if (legacy !== undefined) sandbox.SECRET = legacy;
  vm.createContext(sandbox);
  vm.runInContext(auditSource, sandbox, { filename: '34_MINIAPP_AUDIT_V2.js' });
  return {
    sandbox,
    properties,
    operations,
    lockCounts: () => ({ lockGets, releases })
  };
}

test('missing or unreadable Script Property rejects ChatKeeper authentication', () => {
  const { sandbox, properties } = createRuntimeValidator();
  const syntheticCredential = 'synthetic-test-credential';

  assert.equal(sandbox.isValidChatKeeperWebhookSecret_(syntheticCredential), false);
  properties.set('ROYAL_CRM_CHATKEEPER_WEBHOOK_SECRET', syntheticCredential);
  assert.equal(sandbox.isValidChatKeeperWebhookSecret_('wrong-test-value'), false);
  assert.equal(sandbox.isValidChatKeeperWebhookSecret_(syntheticCredential), true);

  sandbox.PropertiesService.getScriptProperties = () => {
    throw new Error('storage unavailable');
  };
  assert.equal(sandbox.isValidChatKeeperWebhookSecret_(syntheticCredential), false);
});

test('Stage 1 migration stores the legacy value but returns metadata only', () => {
  const syntheticCredential = 'synthetic-migration-credential';
  const { sandbox, properties, operations, lockCounts } = createMigrationSandbox({
    legacy: syntheticCredential
  });

  const rawResult = sandbox.MINIAPP_migrateLegacyChatKeeperSecret();
  const result = JSON.parse(JSON.stringify(rawResult));
  assert.deepEqual(Object.keys(result).sort(), [
    'configured', 'error', 'migrated', 'ok',
    'property', 'valueExposed', 'version'
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.configured, true);
  assert.equal(result.migrated, true);
  assert.equal(result.valueExposed, false);
  assert.equal(result.error, '');
  assert.equal(JSON.stringify(result).includes(syntheticCredential), false);
  assert.equal(
    properties.get('ROYAL_CRM_CHATKEEPER_WEBHOOK_SECRET'),
    syntheticCredential
  );
  assert.deepEqual(operations, [{
    type: 'set', key: 'ROYAL_CRM_CHATKEEPER_WEBHOOK_SECRET'
  }]);
  assert.deepEqual(lockCounts(), { lockGets: 1, releases: 1 });
});

test('migration is idempotent and fails closed after the legacy global is gone', () => {
  const existingCredential = 'synthetic-existing-credential';
  const existing = createMigrationSandbox({ existing: existingCredential });
  const existingResult = JSON.parse(JSON.stringify(
    existing.sandbox.MINIAPP_migrateLegacyChatKeeperSecret()
  ));
  assert.equal(existingResult.ok, true);
  assert.equal(existingResult.migrated, false);
  assert.equal(JSON.stringify(existingResult).includes(existingCredential), false);
  assert.deepEqual(existing.operations, []);
  assert.deepEqual(existing.lockCounts(), { lockGets: 0, releases: 0 });

  const missing = createMigrationSandbox();
  const missingResult = JSON.parse(JSON.stringify(
    missing.sandbox.MINIAPP_migrateLegacyChatKeeperSecret()
  ));
  assert.equal(missingResult.ok, false);
  assert.equal(missingResult.configured, false);
  assert.equal(missingResult.error, 'LEGACY_SECRET_UNAVAILABLE');
  assert.deepEqual(missing.operations, []);

  const mismatch = createMigrationSandbox({
    existing: 'synthetic-existing-credential',
    legacy: 'synthetic-current-webhook-credential'
  });
  const mismatchResult = JSON.parse(JSON.stringify(
    mismatch.sandbox.MINIAPP_migrateLegacyChatKeeperSecret()
  ));
  assert.equal(mismatchResult.ok, false);
  assert.equal(mismatchResult.configured, false);
  assert.equal(mismatchResult.error, 'SECRET_PROPERTY_MISMATCH');
  assert.deepEqual(mismatch.operations, []);
});

test('public tree and added diff lines have no hardcoded ChatKeeper credential', () => {
  const tracked = spawnSync('git', ['ls-files', '-z'], {
    cwd: ROOT,
    encoding: 'utf8'
  });
  assert.equal(tracked.status, 0, tracked.stderr);
  const textExtensions = new Set([
    '.css', '.gs', '.html', '.js', '.json', '.md', '.mjs', '.sh', '.toml', '.txt'
  ]);
  const hardcodedDeclaration = /\b(?:const|let|var)\s+(?:SECRET|WEBHOOK_SECRET|CHATKEEPER_SECRET)\s*=\s*['\"][^'\"\r\n]+['\"]/;
  const directLiteralComparison = /\b(?:data\.)?secret\s*!==\s*['\"][^'\"\r\n]+['\"]/;

  for (const relative of tracked.stdout.split('\0').filter(Boolean)) {
    if (!textExtensions.has(path.extname(relative))) continue;
    const content = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    assert.doesNotMatch(content, hardcodedDeclaration, relative);
    assert.doesNotMatch(content, directLiteralComparison, relative);
  }

  const diffs = [
    spawnSync('git', ['diff', '--unified=0', 'origin/main...HEAD'], {
      cwd: ROOT, encoding: 'utf8'
    }),
    spawnSync('git', ['diff', '--unified=0'], { cwd: ROOT, encoding: 'utf8' }),
    spawnSync('git', ['diff', '--cached', '--unified=0'], {
      cwd: ROOT, encoding: 'utf8'
    })
  ];
  for (const diff of diffs) assert.equal(diff.status, 0, diff.stderr);
  const additions = diffs
    .flatMap(diff => diff.stdout.split('\n'))
    .filter(line => line.startsWith('+') && !line.startsWith('+++'))
    .map(line => line.slice(1))
    .join('\n');
  assert.doesNotMatch(additions, hardcodedDeclaration);
  assert.doesNotMatch(additions, directLiteralComparison);
});
