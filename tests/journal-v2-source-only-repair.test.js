const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'install-v0600-journal-v2.sh');
const SCRIPT_SOURCE = fs.readFileSync(SCRIPT, 'utf8');
const CONFIRM = 'REMOVE_ONLY_STRANDED_34_MINIAPP_AUDIT_V2_JS';
const DEPLOYMENT_ID = 'AKfycbSourceRepairSyntheticDeployment1234567890';
const DESCRIPTION = 'Таблица ЧП 1.3';

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sourceManifest(files, { legacy = false } = {}) {
  return Object.entries(files)
    .filter(([name]) => {
      if (name === 'appsscript.json') return true;
      const extension = path.extname(name);
      return legacy
        ? extension === '.js' || extension === '.gs'
        : ['.js', '.gs', '.html'].includes(extension);
    })
    .map(([name, value]) => [name, digest(value)])
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([name, hash]) => `${hash}  ${name}\n`)
    .join('');
}

function writeTree(directory, files) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  for (const [name, value] of Object.entries(files)) {
    fs.writeFileSync(path.join(directory, name), value, { mode: 0o600 });
  }
}

function makeFixture(options = {}) {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'journal-source-repair-'));
  const backupRoot = path.join(fixture, 'backups');
  const backup = path.join(backupRoot, 'v0600-journal-v2-incident');
  const remote = path.join(fixture, 'remote');
  const secondRemote = path.join(fixture, 'second-remote');
  const fakeBin = path.join(fixture, 'bin');
  const trace = path.join(fixture, 'clasp-trace.txt');
  const pullCount = path.join(fixture, 'pull-count.txt');
  const pushMarker = path.join(fixture, 'push-applied.txt');
  const config = JSON.stringify({
    scriptId: 'synthetic-source-repair-script',
    rootDir: options.rootDir || 'source'
  });
  const claspIgnore = '# historical config\n';
  const baseline = {
    '01_CORE_MAIN.js': 'function stableCore() { return true; }\n',
    'MiniApp.html': '<main>stable html payload</main>\n',
    'appsscript.json': '{"timeZone":"Europe/Moscow"}\n'
  };
  const stranded = {
    ...baseline,
    '34_MINIAPP_AUDIT_V2.js': 'function strandedAuditV2() { return false; }\n'
  };
  const initialRemote = options.alreadyRepaired ? baseline : stranded;
  const second = options.secondDrift
    ? { ...stranded, 'MiniApp.html': '<main>concurrent drift</main>\n' }
    : initialRemote;

  fs.mkdirSync(backupRoot, { recursive: true, mode: 0o700 });
  fs.mkdirSync(backup, { mode: 0o700 });
  fs.mkdirSync(fakeBin, { mode: 0o700 });
  writeTree(remote, initialRemote);
  writeTree(secondRemote, second);
  const tamperTarget = path.join(fixture, 'tamper-target.js');
  fs.writeFileSync(tamperTarget, 'function privateSentinelSource() {}\n', { mode: 0o600 });
  if (options.auditSymlink) {
    for (const directory of [remote, secondRemote]) {
      fs.rmSync(path.join(directory, '34_MINIAPP_AUDIT_V2.js'), { force: true });
      fs.symlinkSync(tamperTarget, path.join(directory, '34_MINIAPP_AUDIT_V2.js'));
    }
  }
  fs.writeFileSync(path.join(backup, '.clasp.json.rollback'), config, {
    mode: options.configMode || 0o600
  });
  if (options.claspIgnoreMode) {
    fs.writeFileSync(path.join(backup, '.claspignore.rollback'), claspIgnore, {
      mode: options.claspIgnoreMode
    });
  }
  fs.writeFileSync(path.join(backup, 'metadata.json'), JSON.stringify({
    schema: options.schema === 1 ? 1 : 2,
    ...(options.schema === 1 ? {} : { sourceManifestSchema: 2 }),
    deploymentId: DEPLOYMENT_ID,
    deploymentVersionBefore: 42,
    deploymentDescription: DESCRIPTION,
    auditFileExistedBefore: options.auditExistedBefore === true
  }), { mode: 0o600 });
  fs.writeFileSync(
    path.join(backup, 'live-before.sha256'),
    sourceManifest(baseline, { legacy: options.schema === 1 }),
    { mode: 0o600 }
  );
  const rawInventory = [
    'Found 1 deployment.',
    `- ${DEPLOYMENT_ID} @42 - ${DESCRIPTION}`,
    ''
  ].join('\n');
  fs.writeFileSync(path.join(backup, 'deployments-before.txt'), rawInventory, { mode: 0o600 });
  fs.writeFileSync(
    path.join(backup, 'deployments-before.tsv'),
    `${DEPLOYMENT_ID}\t42\t${DESCRIPTION}\n`,
    { mode: 0o600 }
  );
  fs.writeFileSync(
    path.join(backup, 'deployment-ids-before.txt'),
    `${DEPLOYMENT_ID}\n`,
    { mode: 0o600 }
  );

  if (options.schema === 1) {
    const archiveProject = path.join(fixture, 'archive-project');
    fs.mkdirSync(archiveProject, { mode: 0o700 });
    fs.writeFileSync(path.join(archiveProject, '.clasp.json'), config, { mode: 0o600 });
    if (options.claspIgnoreMode) {
      fs.writeFileSync(path.join(archiveProject, '.claspignore'), claspIgnore, { mode: 0o600 });
    }
    writeTree(
      (options.rootDir || 'source') === '.'
        ? archiveProject
        : path.join(archiveProject, options.rootDir || 'source'),
      baseline
    );
    const packed = spawnSync('tar', [
      '-czf', path.join(backup, 'live-before-full.tgz'), '-C', archiveProject, '.'
    ], { encoding: 'utf8' });
    assert.equal(packed.status, 0, packed.stderr);
    fs.chmodSync(path.join(backup, 'live-before-full.tgz'), 0o600);
  }

  const fakeClasp = `#!/usr/bin/env bash
set -u
printf '%s\\n' "$*" >> "$REPAIR_TRACE"
case "$1" in
  pull)
    count=0
    if [[ -f "$REPAIR_PULL_COUNT" ]]; then count="$(<"$REPAIR_PULL_COUNT")"; fi
    count=$((count + 1))
    printf '%s\\n' "$count" > "$REPAIR_PULL_COUNT"
    if [[ "${'${REPAIR_POST_PULL_FAIL:-false}'}" == true && "$count" -ge 3 ]]; then
      printf 'AKfycbMustNotLeak pull secret-content\\n'
      exit 71
    fi
    selected="$REPAIR_REMOTE"
    if [[ "${'${REPAIR_SECOND_DRIFT:-false}'}" == true && "$count" == 2 ]]; then
      selected="$REPAIR_SECOND_REMOTE"
    fi
    source_dir="$PWD/$REPAIR_ROOT_DIR"
    if [[ "$REPAIR_ROOT_DIR" == . ]]; then source_dir="$PWD"; fi
    mkdir -p "$source_dir"
    cp -a "$selected"/. "$source_dir"/
    ;;
  list-deployments|deployments)
    if [[ "${'${REPAIR_BREAK_CHECKPOINT_POST:-false}'}" == true \
      && -f "$REPAIR_PUSH_MARKER" ]]; then
      for diagnostic in "$REPAIR_BACKUP"/diagnostics/source-only-repair-*; do
        if [[ -f "$diagnostic/state.json" ]]; then
          rm -f -- "$diagnostic/state.json"
          mkdir -- "$diagnostic/state.json"
          break
        fi
      done
    fi
    if [[ "${'${REPAIR_DEPLOYMENT_DRIFT:-none}'}" == always \
      || ("${'${REPAIR_DEPLOYMENT_DRIFT:-none}'}" == post && -f "$REPAIR_PUSH_MARKER") ]]; then
      printf '%s\\n' \
        'Found 1 deployment.' \
        '- ${DEPLOYMENT_ID} @43 - ${DESCRIPTION}'
    else
      printf '%s\\n' \
        'Found 1 deployment.' \
        '- ${DEPLOYMENT_ID} @42 - ${DESCRIPTION}'
    fi
    ;;
  status)
    if [[ "${'${REPAIR_STATUS_FAIL:-false}'}" == true ]]; then exit 72; fi
    source_dir="$PWD/$REPAIR_ROOT_DIR"
    if [[ "$REPAIR_ROOT_DIR" == . ]]; then source_dir="$PWD"; fi
    printf 'Tracked files:\\n'
    for tracked in "$source_dir"/*; do
      name="$(basename "$tracked")"
      case "$name" in
        appsscript.json|*.js|*.gs|*.html) ;;
        *) continue ;;
      esac
      if [[ "${'${REPAIR_STATUS_OMIT_HTML:-false}'}" == true && "$name" == MiniApp.html ]]; then
        continue
      fi
      printf '└─ %s\\n' "$name"
    done
    printf '%s\\n' 'Untracked files:' '└─ .clasp.json'
    if [[ "${'${REPAIR_STATUS_TAMPER_SYMLINK:-false}'}" == true ]]; then
      rm -f -- "$source_dir/01_CORE_MAIN.js"
      ln -s -- "$REPAIR_TAMPER_TARGET" "$source_dir/01_CORE_MAIN.js"
    fi
    ;;
  push)
    [[ "$#" == 2 && "$2" == -f ]] || exit 73
    source_dir="$PWD/$REPAIR_ROOT_DIR"
    if [[ "$REPAIR_ROOT_DIR" == . ]]; then source_dir="$PWD"; fi
    [[ ! -e "$source_dir/34_MINIAPP_AUDIT_V2.js" ]] || exit 74
    if [[ "${'${REPAIR_PUSH_APPLIES:-true}'}" == true ]]; then
      find "$REPAIR_REMOTE" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
      find "$source_dir" -maxdepth 1 -type f \
        \\( -name appsscript.json -o -name '*.js' -o -name '*.gs' -o -name '*.html' \\) \
        -exec cp -a -- {} "$REPAIR_REMOTE"/ \\;
      : > "$REPAIR_PUSH_MARKER"
    fi
    printf 'SENSITIVE_SENTINEL_MUST_NOT_LEAK AKfycbMustNotLeak source-content\\n'
    exit "${'${REPAIR_PUSH_EXIT:-0}'}"
    ;;
  *)
    exit 99
    ;;
esac
`;
  const claspPath = path.join(fakeBin, 'clasp');
  fs.writeFileSync(claspPath, fakeClasp, { mode: 0o700 });

  return {
    fixture,
    backupRoot,
    backup,
    remote,
    secondRemote,
    trace,
    pullCount,
    pushMarker,
    fakeBin,
    baseline,
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH}`,
      ROYAL_CRM_BACKUP_ROOT: backupRoot,
      ROYAL_CRM_CONFIRM_SOURCE_ONLY_REPAIR: CONFIRM,
      REPAIR_TRACE: trace,
      REPAIR_PULL_COUNT: pullCount,
      REPAIR_PUSH_MARKER: pushMarker,
      REPAIR_REMOTE: remote,
      REPAIR_ROOT_DIR: options.rootDir || 'source',
      REPAIR_BACKUP: backup,
      REPAIR_TAMPER_TARGET: tamperTarget,
      REPAIR_SECOND_REMOTE: secondRemote,
      REPAIR_SECOND_DRIFT: options.secondDrift ? 'true' : 'false',
      REPAIR_PUSH_EXIT: String(options.pushExit || 0),
      REPAIR_PUSH_APPLIES: options.pushApplies === false ? 'false' : 'true',
      REPAIR_POST_PULL_FAIL: options.postPullFail ? 'true' : 'false',
      REPAIR_DEPLOYMENT_DRIFT: options.deploymentDrift || 'none',
      REPAIR_STATUS_FAIL: options.statusFail ? 'true' : 'false',
      REPAIR_STATUS_OMIT_HTML: options.statusOmitHtml ? 'true' : 'false',
      REPAIR_STATUS_TAMPER_SYMLINK: options.statusTamperSymlink ? 'true' : 'false',
      REPAIR_BREAK_CHECKPOINT_POST: options.breakCheckpointPost ? 'true' : 'false'
    }
  };
}

function runRepair(fixture, envOverride = {}) {
  return spawnSync('bash', [SCRIPT, '--repair-source-only', fixture.backup], {
    encoding: 'utf8',
    env: { ...fixture.env, ...envOverride }
  });
}

function traceLines(fixture) {
  if (!fs.existsSync(fixture.trace)) return [];
  return fs.readFileSync(fixture.trace, 'utf8').trim().split('\n').filter(Boolean);
}

function cleanup(fixture) {
  fs.rmSync(fixture.fixture, { recursive: true, force: true });
}

function assertSafeTerminal(result) {
  const combined = result.stdout + result.stderr;
  const tokenPrefix = ['g', 'h', 'p', '_'].join('');
  assert.doesNotMatch(combined, /AKfy|SENSITIVE_SENTINEL|secret-content|source-content|[0-9a-f]{64}/);
  assert.equal(combined.includes(tokenPrefix), false);
}

test('source-only repair static mutation boundary is one push and no function or deployment command', () => {
  const repair = SCRIPT_SOURCE.slice(
    SCRIPT_SOURCE.indexOf('repair_source_only()'),
    SCRIPT_SOURCE.indexOf('diagnose_backup()')
  );
  assert.equal((repair.match(/clasp push -f/g) || []).length, 1);
  assert.doesNotMatch(
    repair,
    /clasp (?:run|deploy|create-deployment|update-deployment|delete-deployment|undeploy|version|versions)(?:\s|$)/
  );
  assert.doesNotMatch(repair, /rollback_from_backup|restore_exact_journal_files/);
  assert.match(repair, /write_source_repair_push_marker[\s\S]+clasp push -f/);
});

test('schema1 rootDir dot repair accepts historical 0664 clasp controls inside private root', () => {
  const fixture = makeFixture({
    schema: 1,
    rootDir: '.',
    configMode: 0o664,
    claspIgnoreMode: 0o664
  });
  const result = runRepair(fixture);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /RESULT=VERIFIED_APPLIED/);
  assert.match(result.stdout, /PUSH_ATTEMPTS=1/);
  assert.match(result.stdout, /PUSH_RESPONSE_OK=true/);
  assert.deepEqual(traceLines(fixture), [
    'pull', 'list-deployments',
    'pull', 'list-deployments',
    'status', 'push -f',
    'pull', 'list-deployments'
  ]);
  assert.deepEqual(
    fs.readFileSync(path.join(fixture.remote, 'MiniApp.html')),
    Buffer.from(fixture.baseline['MiniApp.html'])
  );
  assert.equal(fs.existsSync(path.join(fixture.remote, '34_MINIAPP_AUDIT_V2.js')), false);
  assertSafeTerminal(result);
  cleanup(fixture);
});

test('schema2 repair accepts a lost push response only after exact postcondition', () => {
  const fixture = makeFixture({ schema: 2, pushExit: 17 });
  const result = runRepair(fixture);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /RESULT=VERIFIED_APPLIED/);
  assert.match(result.stdout, /PUSH_RESPONSE_OK=false/);
  assert.equal(traceLines(fixture).filter(line => line === 'push -f').length, 1);
  assertSafeTerminal(result);
  cleanup(fixture);
});

test('already repaired live source is a read-only no-op', () => {
  const fixture = makeFixture({ schema: 2, alreadyRepaired: true });
  const result = runRepair(fixture);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /RESULT=ALREADY_REPAIRED/);
  assert.match(result.stdout, /PUSH_ATTEMPTS=0/);
  assert.deepEqual(traceLines(fixture), ['pull', 'list-deployments']);
  assertSafeTerminal(result);
  cleanup(fixture);
});

test('source drift between the two pulls blocks push', () => {
  const fixture = makeFixture({ schema: 2, secondDrift: true });
  const result = runRepair(fixture);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /RESULT=NOT_ATTEMPTED/);
  assert.match(result.stdout, /REASON=SOURCE_CHANGED_DURING_REVALIDATION/);
  assert.equal(traceLines(fixture).some(line => line.startsWith('push')), false);
  assertSafeTerminal(result);
  cleanup(fixture);
});

test('deployment drift and status failure both stop before push', async t => {
  for (const options of [
    { deploymentDrift: 'always', expected: 'FIRST_DEPLOYMENT_DRIFT' },
    { statusFail: true, expected: 'STATUS_FAILED' },
    { statusOmitHtml: true, expected: 'STATUS_PAYLOAD_MISMATCH' },
    { statusTamperSymlink: true, expected: 'TARGET_TREE_CHANGED_BEFORE_PUSH' },
    { auditSymlink: true, expected: 'FIRST_PULL_INVALID' }
  ]) {
    await t.test(options.expected, () => {
      const fixture = makeFixture({ schema: 2, ...options });
      const result = runRepair(fixture);
      assert.notEqual(result.status, 0);
      assert.match(result.stdout, new RegExp(`REASON=${options.expected}`));
      assert.equal(traceLines(fixture).some(line => line.startsWith('push')), false);
      assertSafeTerminal(result);
      cleanup(fixture);
    });
  }
});

test('wrong post-source or post-deployment is ambiguous with no retry or rollback', async t => {
  for (const options of [
    { pushApplies: false },
    { deploymentDrift: 'post' },
    { postPullFail: true },
    { breakCheckpointPost: true, expectedReason: 'CHECKPOINT_NOT_PERSISTED' }
  ]) {
    await t.test(JSON.stringify(options), () => {
      const fixture = makeFixture({ schema: 2, ...options });
      const result = runRepair(fixture);
      assert.notEqual(result.status, 0);
      assert.match(result.stdout, /RESULT=AMBIGUOUS/);
      assert.match(result.stdout, /PUSH_ATTEMPTS=1/);
      if (options.expectedReason) {
        assert.match(result.stdout, new RegExp(`REASON=${options.expectedReason}`));
      }
      const trace = traceLines(fixture);
      assert.equal(trace.filter(line => line === 'push -f').length, 1);
      assert.equal(trace.some(line => /^(?:run|deploy|create-deployment|update-deployment|undeploy|version|versions|rollback)(?:\s|$)/.test(line)), false);
      assertSafeTerminal(result);
      cleanup(fixture);
    });
  }
});

test('missing confirmation runs no clasp command', () => {
  const fixture = makeFixture({ schema: 2 });
  const result = runRepair(fixture, { ROYAL_CRM_CONFIRM_SOURCE_ONLY_REPAIR: '' });
  assert.notEqual(result.status, 0);
  assert.deepEqual(traceLines(fixture), []);
  assertSafeTerminal(result);
  cleanup(fixture);
});

test('persistent push marker blocks every second repair attempt before clasp', () => {
  const fixture = makeFixture({ schema: 2 });
  const first = runRepair(fixture);
  assert.equal(first.status, 0, first.stderr);
  fs.writeFileSync(fixture.trace, '');
  const second = runRepair(fixture);
  assert.notEqual(second.status, 0);
  assert.match(second.stdout, /REASON=PRIOR_PUSH_ATTEMPT_RECORDED/);
  assert.deepEqual(traceLines(fixture), []);
  assertSafeTerminal(second);
  cleanup(fixture);
});

test('atomic active lock and dangling marker both block before clasp without removing evidence', async t => {
  for (const kind of ['active-lock', 'dangling-marker']) {
    await t.test(kind, () => {
      const fixture = makeFixture({ schema: 2 });
      const diagnostics = path.join(fixture.backup, 'diagnostics');
      fs.mkdirSync(diagnostics, { mode: 0o700 });
      const protectedPath = kind === 'active-lock'
        ? path.join(diagnostics, 'source-only-repair-active')
        : path.join(diagnostics, 'source-only-repair-push-attempted.json');
      if (kind === 'active-lock') {
        fs.mkdirSync(protectedPath, { mode: 0o700 });
      } else {
        fs.symlinkSync(path.join(fixture.fixture, 'missing-marker-target'), protectedPath);
      }
      const result = runRepair(fixture);
      assert.notEqual(result.status, 0);
      assert.match(
        result.stdout,
        new RegExp(`REASON=${kind === 'active-lock' ? 'CONCURRENT_REPAIR' : 'PRIOR_PUSH_ATTEMPT_RECORDED'}`)
      );
      assert.deepEqual(traceLines(fixture), []);
      assert.equal(fs.existsSync(protectedPath) || fs.lstatSync(protectedPath).isSymbolicLink(), true);
      assertSafeTerminal(result);
      cleanup(fixture);
    });
  }
});

test('hard-linked backup config is rejected before clasp', () => {
  const fixture = makeFixture({ schema: 2 });
  const config = path.join(fixture.backup, '.clasp.json.rollback');
  const secondLink = path.join(fixture.backup, 'synthetic-config-hardlink');
  fs.linkSync(config, secondLink);
  const result = runRepair(fixture);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /REASON=EVIDENCE_INVALID/);
  assert.deepEqual(traceLines(fixture), []);
  assertSafeTerminal(result);
  cleanup(fixture);
});

test('writable non-clasp evidence and non-private backup root remain rejected', async t => {
  for (const kind of ['metadata-0664', 'backup-0755']) {
    await t.test(kind, () => {
      const fixture = makeFixture({ schema: 2 });
      if (kind === 'metadata-0664') {
        fs.chmodSync(path.join(fixture.backup, 'metadata.json'), 0o664);
      } else {
        fs.chmodSync(fixture.backup, 0o755);
      }
      const result = runRepair(fixture);
      assert.notEqual(result.status, 0);
      assert.match(result.stdout, /REASON=EVIDENCE_INVALID/);
      assert.deepEqual(traceLines(fixture), []);
      assertSafeTerminal(result);
      cleanup(fixture);
    });
  }
});

test('symlinked backup config remains rejected before clasp', () => {
  const fixture = makeFixture({ schema: 2 });
  const config = path.join(fixture.backup, '.clasp.json.rollback');
  const external = path.join(fixture.fixture, 'external-clasp-config');
  fs.writeFileSync(external, fs.readFileSync(config), { mode: 0o600 });
  fs.rmSync(config);
  fs.symlinkSync(external, config);
  const result = runRepair(fixture);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /REASON=EVIDENCE_INVALID/);
  assert.deepEqual(traceLines(fixture), []);
  assertSafeTerminal(result);
  cleanup(fixture);
});

test('source-only mode suppresses legacy automatic rollback on unexpected post-push error', () => {
  const sentinel = path.join(os.tmpdir(), `source-repair-rollback-${process.pid}-${Date.now()}`);
  const result = spawnSync('bash', ['-c', `
    source "$1"
    SOURCE_ONLY_REPAIR_MODE=1
    STATE_MUTATED=1
    ROLLOUT_COMPLETE=0
    BACKUP_DIR=/tmp/synthetic-backup
    ROLLBACK_SENTINEL="$2"
    rollback_from_backup() { printf 'unsafe rollback\\n' > "$ROLLBACK_SENTINEL"; }
    die 'synthetic post-push failure'
  `, 'source-repair-die-guard', SCRIPT, sentinel], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.equal(fs.existsSync(sentinel), false);
});

test('unsafe rootDir and prior-audit metadata fail before any clasp command', async t => {
  for (const options of [
    { rootDir: '../escape', expected: 'FIRST_PULL_INVALID' },
    { auditExistedBefore: true, expected: 'BASELINE_INVALID' }
  ]) {
    await t.test(options.expected, () => {
      const fixture = makeFixture({ schema: 2, ...options });
      const result = runRepair(fixture);
      assert.notEqual(result.status, 0);
      assert.match(result.stdout, new RegExp(`REASON=${options.expected}`));
      assert.deepEqual(traceLines(fixture), []);
      assertSafeTerminal(result);
      cleanup(fixture);
    });
  }
});
