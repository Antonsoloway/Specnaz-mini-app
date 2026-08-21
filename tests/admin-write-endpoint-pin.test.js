const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'apps-script-live', '31_MINIAPP_ADMIN_WRITE_HARDENED.js'),
  'utf8'
);

const STABLE = 'https://script.google.com/macros/s/AKfycbStableDeployment0123456789_-abc/exec';
const STALE = 'https://script.google.com/macros/s/AKfycbStaleDeployment9876543210_-xyz/exec';

function createSandbox(initialProperty = '', serviceUrl = STALE) {
  let property = initialProperty;
  const sandbox = {
    console,
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty() { return property; },
          setProperty(key, value) {
            assert.equal(key, 'MINIAPP_ADMIN_WRITE_ENDPOINT');
            property = value;
          }
        };
      }
    },
    ScriptApp: {
      getService() { return { getUrl() { return serviceUrl; } }; }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: '31_MINIAPP_ADMIN_WRITE_HARDENED.js' });
  return { sandbox, getProperty: () => property };
}

test('private metadata prefers the pinned named deployment over ScriptApp fallback', () => {
  const { sandbox } = createSandbox(STABLE, STALE);
  const meta = sandbox.MINIAPP_adminWriteHardenedMeta_();
  assert.equal(meta.endpoint, STABLE);
  assert.equal(meta.endpointPinned, true);
  assert.equal(meta.endpointSource, 'script-property');
});

test('installer-pinned deployment constant works without Script Properties storage', () => {
  const { sandbox } = createSandbox('', STALE);
  sandbox.MINIAPP_ADMIN_WRITE_PINNED_ENDPOINT = STABLE;
  const meta = sandbox.MINIAPP_adminWriteHardenedMeta_();
  assert.equal(meta.endpoint, STABLE);
  assert.equal(meta.endpointPinned, true);
  assert.equal(meta.endpointSource, 'deployment-constant');
});

test('an unpinned ScriptApp service URL is explicitly marked unsafe', () => {
  const { sandbox } = createSandbox('', STALE);
  const meta = sandbox.MINIAPP_adminWriteHardenedMeta_();
  assert.equal(meta.endpoint, STALE);
  assert.equal(meta.endpointPinned, false);
  assert.equal(meta.endpointSource, 'script-service-fallback');
});

test('authenticated rollout setter validates and stores only an exact /exec URL', () => {
  const { sandbox, getProperty } = createSandbox('', STALE);
  assert.throws(
    () => sandbox.MINIAPP_setAdminWriteEndpoint('https://example.com/not-apps-script'),
    /ADMIN_WRITE_ENDPOINT_INVALID/
  );
  const result = sandbox.MINIAPP_setAdminWriteEndpoint(STABLE);
  assert.equal(result.ok, true);
  assert.equal(result.endpointPinned, true);
  assert.equal(getProperty(), STABLE);
});

test('Worker refuses admin writes when snapshot endpoint is not pinned', () => {
  const workerSource = fs.readFileSync(
    path.join(__dirname, '..', 'worker', 'src', 'entry-v1210.js'),
    'utf8'
  );
  assert.match(workerSource, /ADMIN_WRITE_ENDPOINT_NOT_PINNED/);
  assert.match(workerSource, /endpointSource === 'script-property'/);
  assert.match(workerSource, /endpointSource === 'deployment-constant'/);
});

test('repair installer injects the selected deployment and does not rely on storage setter', () => {
  const installer = fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'repair-v0600-admin-write-endpoint.sh'),
    'utf8'
  );
  assert.match(installer, /MINIAPP_ADMIN_WRITE_PINNED_ENDPOINT/);
  assert.match(installer, /endpointSource"\)=="deployment-constant"/);
  assert.doesNotMatch(installer, /clasp run MINIAPP_setAdminWriteEndpoint/);
});

test('Worker 1.26 transition and 1.27 production wrapper preserve constant eligibility', () => {
  const transition = fs.readFileSync(
    path.join(__dirname, '..', 'worker', 'src', 'entry-v1260.js'),
    'utf8'
  );
  const production = fs.readFileSync(
    path.join(__dirname, '..', 'worker', 'src', 'entry-v1270.js'),
    'utf8'
  );
  assert.match(transition, /endpointSource === 'deployment-constant'/);
  assert.match(production, /WRAPPER_VERSION = '1\.27\.0'/);
  assert.match(production, /source === 'deployment-constant'/);
});
