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
  assert.match(workerSource, /writeMeta\?\.endpointPinned !== true/);
  assert.match(workerSource, /writeMeta\?\.endpointSource !== 'script-property'/);
});
