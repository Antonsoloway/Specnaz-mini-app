const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT_PATH = path.join(ROOT, 'scripts', 'install-v0600-journal-v2.sh');
const source = fs.readFileSync(SCRIPT_PATH, 'utf8');

test('journal-v2 rollout shell is syntactically valid and help is read-only', () => {
  const syntax = spawnSync('bash', ['-n', SCRIPT_PATH], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr);

  const help = spawnSync('bash', [SCRIPT_PATH, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /40-char-merged-sha/);
  assert.match(help.stdout, /--rollback/);
  assert.match(help.stdout, /\$BACKUP\/install-v0600-journal-v2\.sh/);
  assert.match(source, /^umask 077$/m);
});

test('rollout requires a full pinned SHA proven merged into main', () => {
  assert.match(source, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(source, /compare\/\$\{SOURCE_SHA\}\.\.\.main/);
  assert.match(source, /identical\|ahead/);
  assert.doesNotMatch(source, /SOURCE_REF:-main/);
  assert.match(source, /raw\.githubusercontent\.com\/\$\{REPO\}\/\$\{SOURCE_SHA\}/);
});

test('rollout uses the exact ten-file allow-list and inert file34 first', () => {
  const expected = [
    '01_CORE_MAIN.js',
    '02_PUBLIC_SYNC_V4.js',
    '07_FINAL_ROLE_FIX.js',
    '17_MINIAPP_PERSISTENT_MEDIA.js',
    '25_MINIAPP_UNIFIED_SNAPSHOT.js',
    '29_MINIAPP_ADMIN_WRITE.js',
    '30_MINIAPP_ADMIN_WRITE_BACKEND.js',
    '31_MINIAPP_ADMIN_WRITE_HARDENED.js',
    '33_MINIAPP_ADMIN_WRITE_FINAL.js',
    '34_MINIAPP_AUDIT_V2.js'
  ];
  for (const file of expected) assert.match(source, new RegExp(file.replaceAll('.', '\\.')));
  assert.match(source, /STAGE 1\/2 — push only an inert file34/);
  assert.match(source, /audit-v2:rollout-inert:/);
  assert.match(source, /MINIAPP_auditV2Deactivate deactivate/);
  assert.match(source, /MINIAPP_auditV2Status status-disabled/);
  assert.match(source, /STAGE 2\/2/);

  const stage1 = source.indexOf('STAGE 1/2');
  const stage1Push = source.indexOf('push_current_source || die "Stage 1', stage1);
  const migration = source.indexOf(
    'run_clasp_checked MINIAPP_migrateLegacyChatKeeperSecret secret-migration',
    stage1Push
  );
  const deactivate = source.indexOf(
    'run_clasp_checked MINIAPP_auditV2Deactivate deactivate',
    migration
  );
  const stage2 = source.indexOf('STAGE 2/2', deactivate);
  const candidateCopy = source.indexOf(
    'cp -p "$TEMP_DIR/candidate/$file_name" "$SOURCE_DIR/$file_name"',
    stage2
  );
  assert.ok(stage1 < stage1Push);
  assert.ok(stage1Push < migration, 'migration must run only after inert file34 is live');
  assert.ok(migration < deactivate);
  assert.ok(deactivate < stage2);
  assert.ok(stage2 < candidateCopy, 'file01 replacement must happen after migration');
});

test('rollout updates one exact existing deployment and never creates another', () => {
  assert.match(source, /EXPECTED_DESC="Таблица ЧП 1\.3"/);
  assert.match(source, /\$3 == expected/);
  assert.match(source, /clasp deploy -i "\$DEPLOY_ID" -d "\$EXPECTED_DESC"/);
  assert.match(source, /clasp create-deployment --deploymentId "\$DEPLOY_ID"/);
  assert.match(source, /cmp -s .*deployment-ids-before.*deployment-ids-after/);
  assert.doesNotMatch(source, /clasp deploy -d "\$EXPECTED_DESC"/);
  const createLines = source.split('\n').filter(line => line.includes('clasp create-deployment'));
  assert.equal(createLines.length, 2);
  assert.ok(createLines.every(line => line.includes('--deploymentId')));
  assert.doesNotMatch(source, /clasp undeploy|clasp delete-deployment/);
});

test('all clasp run gates use semantic assertions including service-sheet security', () => {
  assert.match(source, /semantic_assert/);
  assert.match(source, /Apps Script exception in clasp output/);
  assert.match(source, /storageSecurityReady/);
  for (const gate of [
    'journalHidden', 'journalProtected',
    'indexHidden', 'indexProtected',
    'baselineHidden', 'baselineProtected'
  ]) {
    assert.match(source, new RegExp(`'${gate}'`));
  }
  assert.match(source, /data\.get\('storageSecurityReady'\) is True/);
  assert.match(source, /nested\.get\('storageSecurityReady'\) is True/);
  assert.match(source, /issues.*== \[\]/);
  assert.match(source, /endpointSource.*deployment-constant/);
});

test('rollback restores the old deployment and exact source paths without deleting sheets', () => {
  assert.match(source, /MINIAPP_auditV2Deactivate/);
  assert.match(source, /clasp deploy -i "\$deployment_id" -V "\$version"/);
  assert.match(source, /restore_exact_journal_files/);
  assert.match(source, /rm -f -- "\$SOURCE_DIR\/34_MINIAPP_AUDIT_V2\.js"/);
  assert.match(source, /serviceSheetsDeletionAllowed': False/);
  assert.doesNotMatch(source, /deleteSheet\(|\.deleteSheet|Админ аудит.*rm/);
});

test('route and snapshot checks are non-mutating and fail closed', () => {
  assert.match(source, /INVALID_REQUEST_ID/);
  assert.match(source, /miniapp=1&action=admin-write&backend=1/);
  assert.match(source, /MINIAPP_exportAdminSnapshotToGitHub snapshot-export/);
  assert.match(source, /journal\.get\('schemaVersion'\)/);
  assert.match(source, /write\.get\('version'\) == sys\.argv\[4\]/);
  assert.match(source, /write\.get\('endpoint'\) == sys\.argv\[2\]/);
  assert.match(source, /Factual live-after export exactly matches reviewed stage2 manifest/);
  assert.match(source, /Repository live mirror\/docs: PENDING separate reviewed handoff PR/);
  assert.doesNotMatch(source, /bash <\(curl/);
  assert.doesNotMatch(source, /sync-live-apps-script-to-github\.sh/);
});

test('a nested failure reaches exactly one root-shell rollback', () => {
  const countFile = path.join(process.env.TMPDIR || '/tmp', `journal-rollbacks-${process.pid}-${Date.now()}`);
  const fault = spawnSync('bash', ['-c', `
    source "$1"
    STATE_MUTATED=1
    ROLLOUT_COMPLETE=0
    BACKUP_DIR=/tmp/test-journal-backup
    ROLLBACK_COUNT_FILE="$2"
    rollback_from_backup() { printf 'rollback\\n' >> "$ROLLBACK_COUNT_FILE"; return 0; }
    ( die 'nested fault' ) || die 'root fault'
  `, 'fault-test', SCRIPT_PATH, countFile], { encoding: 'utf8' });
  assert.notEqual(fault.status, 0);
  const calls = fs.readFileSync(countFile, 'utf8').trim().split('\n');
  fs.unlinkSync(countFile);
  assert.deepEqual(calls, ['rollback']);
});

test('metadata writer executes its embedded Python and records exact rollback scope', () => {
  const tempDir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'journal-metadata-'));
  fs.mkdirSync(path.join(tempDir, 'live-before-candidate'));
  const run = spawnSync('bash', ['-c', `
    source "$1"
    BACKUP_DIR="$2"
    DEPLOY_ID=AKfycbJournalRolloutTestDeployment123456789
    DEPLOY_VERSION_BEFORE=42
    AUDIT_VERSION=0.6.0-audit.4
    WRITE_VERSION=0.6.0-write.5
    write_metadata
  `, 'metadata-test', SCRIPT_PATH, tempDir], {
    encoding: 'utf8',
    env: { ...process.env, ROYAL_CRM_SOURCE_SHA: 'a'.repeat(40) }
  });
  assert.equal(run.status, 0, run.stderr);
  const metadata = JSON.parse(fs.readFileSync(path.join(tempDir, 'metadata.json'), 'utf8'));
  const metadataMode = fs.statSync(path.join(tempDir, 'metadata.json')).mode & 0o777;
  fs.rmSync(tempDir, { recursive: true, force: true });
  assert.equal(metadata.deploymentVersionBefore, 42);
  assert.equal(metadata.deploymentDescription, 'Таблица ЧП 1.3');
  assert.equal(metadata.rollbackFiles.length, 10);
  assert.equal(metadata.auditFileExistedBefore, false);
  assert.equal(metadata.serviceSheetsDeletionAllowed, false);
  assert.equal(
    metadata.chatKeeperSecretProperty,
    'ROYAL_CRM_CHATKEEPER_WEBHOOK_SECRET'
  );
  assert.equal(metadata.chatKeeperSecretPropertyPreservedOnRollback, true);
  assert.equal(metadata.sourceSha, 'a'.repeat(40));
  assert.equal(metadata.auditVersion, '0.6.0-audit.4');
  assert.equal(metadata.writeVersion, '0.6.0-write.5');
  assert.equal(metadataMode, 0o600);
});

test('semantic parser accepts clasp Node inspect output without evaluating code', () => {
  const outputFile = path.join(process.env.TMPDIR || '/tmp', `journal-semantic-${process.pid}-${Date.now()}`);
  fs.writeFileSync(outputFile, `{
  ok: true,
  active: true,
  version: '0.6.0-audit.4',
  schemaVersion: 2,
  baselineInitialized: true,
  baselineRecords: 128,
  journalPresent: true,
  journalSchemaReady: true,
  indexPresent: true,
  storageSecurityReady: true,
  journalHidden: true,
  journalProtected: true,
  indexHidden: true,
  indexProtected: true,
  baselineHidden: true,
  baselineProtected: true
}\n`);
  const result = spawnSync('bash', ['-c', `
    source "$1"
    AUDIT_VERSION=0.6.0-audit.4
    semantic_assert status-active '' "$2"
  `, 'semantic-test', SCRIPT_PATH, outputFile], {
    encoding: 'utf8',
    env: { ...process.env, ROYAL_CRM_SOURCE_SHA: 'b'.repeat(40) }
  });
  fs.unlinkSync(outputFile);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /semantic clasp result: status-active/);
});

test('credential migration gate accepts metadata only and rejects value fields', () => {
  const outputFile = path.join(
    process.env.TMPDIR || '/tmp',
    `journal-secret-migration-${process.pid}-${Date.now()}`
  );
  const safeResult = `{
  ok: true,
  configured: true,
  migrated: true,
  property: 'ROYAL_CRM_CHATKEEPER_WEBHOOK_SECRET',
  valueExposed: false,
  version: '0.6.0-audit.4',
  error: ''
}\n`;
  fs.writeFileSync(outputFile, safeResult);
  const safe = spawnSync('bash', ['-c', `
    source "$1"
    AUDIT_VERSION=0.6.0-audit.4
    semantic_assert secret-migration '' "$2"
  `, 'secret-migration-safe', SCRIPT_PATH, outputFile], {
    encoding: 'utf8',
    env: { ...process.env, ROYAL_CRM_SOURCE_SHA: 'e'.repeat(40) }
  });
  assert.equal(safe.status, 0, safe.stderr);

  fs.writeFileSync(outputFile, safeResult.replace(
    "  error: ''",
    "  secret: 'synthetic-test-value',\n  error: ''"
  ));
  const unsafe = spawnSync('bash', ['-c', `
    source "$1"
    AUDIT_VERSION=0.6.0-audit.4
    semantic_assert secret-migration '' "$2"
  `, 'secret-migration-unsafe', SCRIPT_PATH, outputFile], {
    encoding: 'utf8',
    env: { ...process.env, ROYAL_CRM_SOURCE_SHA: 'f'.repeat(40) }
  });
  fs.unlinkSync(outputFile);
  assert.notEqual(unsafe.status, 0);
  assert.match(unsafe.stderr, /non-metadata fields/);
});

test('source push cannot mask failed clasp status with a later successful push', () => {
  const tempDir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'journal-push-fault-'));
  const result = spawnSync('bash', ['-c', `
    source "$1"
    RUN_PROJECT="$2"
    calls=''
    clasp() {
      calls="\${calls} $1"
      if [[ "$1" == status ]]; then return 23; fi
      return 0
    }
    push_current_source
  `, 'push-fault', SCRIPT_PATH, tempDir], {
    encoding: 'utf8',
    env: { ...process.env, ROYAL_CRM_SOURCE_SHA: 'c'.repeat(40) }
  });
  fs.rmSync(tempDir, { recursive: true, force: true });
  assert.notEqual(result.status, 0);
});

test('first ambiguous remote push is considered mutated before it starts', () => {
  const stage = source.indexOf('STAGE 1/2');
  const stateIndex = source.indexOf('STATE_MUTATED=1', stage);
  const pushIndex = source.indexOf('push_current_source || die "Stage 1 inert audit push', stage);
  assert.notEqual(stateIndex, -1);
  assert.notEqual(pushIndex, -1);
  assert.ok(stateIndex < pushIndex);
});

test('live-after capture failure rolls back with the original complete project globals', () => {
  const fixture = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'journal-live-after-fault-'));
  const configuredProject = path.join(fixture, 'configured');
  const originalProject = path.join(fixture, 'original-clean-pull');
  const originalSource = path.join(originalProject, 'source');
  const tempRuntime = path.join(fixture, 'runtime');
  const backup = path.join(fixture, 'backup');
  const observed = path.join(process.env.TMPDIR || '/tmp', `journal-live-after-observed-${process.pid}-${Date.now()}`);
  fs.mkdirSync(configuredProject);
  fs.mkdirSync(originalSource, { recursive: true });
  fs.mkdirSync(tempRuntime);
  fs.mkdirSync(backup);
  fs.writeFileSync(path.join(configuredProject, '.clasp.json'), JSON.stringify({ scriptId: 'test', rootDir: 'source' }));

  const result = spawnSync('bash', ['-c', `
    source "$1"
    TEMP_DIR="$2"
    BACKUP_DIR="$3"
    RUN_PROJECT="$4"
    SOURCE_DIR="$5"
    STATE_MUTATED=1
    ROLLOUT_COMPLETE=0
    AUDIT_VERSION=0.6.0-audit.4
    WRITE_VERSION=0.6.0-write.5
    ROLLBACK_OBSERVED="$6"
    clasp() { return 31; }
    rollback_from_backup() {
      printf '%s|%s\\n' "$RUN_PROJECT" "$SOURCE_DIR" > "$ROLLBACK_OBSERVED"
      return 0
    }
    capture_factual_live_after
  `, 'capture-fault', SCRIPT_PATH, tempRuntime, backup, originalProject, originalSource, observed], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ROYAL_CRM_SOURCE_SHA: 'd'.repeat(40),
      ROYAL_CRM_PROJECT_DIR: configuredProject
    }
  });
  assert.notEqual(result.status, 0);
  assert.equal(fs.readFileSync(observed, 'utf8').trim(), `${originalProject}|${originalSource}`);
  fs.unlinkSync(observed);
  fs.rmSync(fixture, { recursive: true, force: true });
});
