'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const mayakPath = path.join(root, 'project-mayak-v061.js');
const mayakSource = fs.readFileSync(mayakPath, 'utf8');

function loadMayak(build) {
  const window = {
    __ROYAL_BUILD__: build,
    setTimeout: () => 0,
    addEventListener: () => {}
  };
  const document = {
    body: { classList: { add: () => {} } },
    querySelectorAll: () => [],
    querySelector: () => null,
    getElementById: () => null,
    addEventListener: () => {}
  };
  const context = {
    window,
    document,
    console: { warn: () => {} },
    requestAnimationFrame: () => {},
    URL,
    Map,
    Set,
    Promise
  };
  vm.runInNewContext(mayakSource, context, { filename: mayakPath });
  return window;
}

test('МАЯК activates on current and future 0.6.x application builds', () => {
  for (const build of ['0.6.1', '0.6.15', '0.6.16', '0.6.99']) {
    const window = loadMayak(build);
    assert.equal(window.RoyalMayak?.version, '0.6.1-mayak-achievements.1', build);
    assert.equal(window.__ROYAL_MAYAK_VERSION__, '0.6.1-mayak-achievements.1', build);
  }
});

test('МАЯК stays disabled outside its compatible 0.6.x release line', () => {
  for (const build of ['0.5.59', '0.6.0', '0.7.0', '1.0.0', 'invalid']) {
    const window = loadMayak(build);
    assert.equal(window.RoyalMayak, undefined, build);
    assert.equal(window.__ROYAL_MAYAK_VERSION__, undefined, build);
  }
});

test('v0.6.16 entrypoint and permanent redirects keep the Mayak module and launch hash', () => {
  const entry = fs.readFileSync(path.join(root, 'app-v0616.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

  assert.match(entry, /window\.__ROYAL_BUILD__='0\.6\.16'/);
  assert.match(entry, /project-mayak-v061\.js\?v=20261107-v0616-build-compat1/);
  assert.ok(entry.indexOf('changelog-v0615.js') < entry.indexOf('changelog-v0616.js'));
  assert.match(entry, /changelog-v0616\.js\?v=20261107-mayak-build-compat1/);
  assert.match(app, /app-v0616\.html/);
  assert.match(app, /window\.location\.hash/);
  assert.match(index, /app-v0616\.html/);
  assert.match(index, /current\.hash/);
});

test('project media assets and protected Worker route remain wired', () => {
  assert.match(mayakSource, /leaderboard-players/);
  assert.match(mayakSource, /leaderboard-team/);
  assert.match(mayakSource, /audio/);
  assert.match(mayakSource, /video/);
  const worker = fs.readFileSync(path.join(root, 'worker', 'src', 'entry-v1100.js'), 'utf8');
  assert.match(worker, /url\.pathname === '\/project-mayak-media'/);
});

test('v0.6.16 changelog becomes current and retains the v0.6.15 release', () => {
  const changelog = fs.readFileSync(path.join(root, 'changelog-v0616.js'), 'utf8');
  const window = { RoyalChangelog: { releases: [{ version: '0.6.15', title: 'База битв' }] } };
  vm.runInNewContext(changelog, { window }, { filename: 'changelog-v0616.js' });
  assert.equal(window.RoyalChangelog.version, '0.6.16');
  assert.equal(window.RoyalChangelog.releases[0].version, '0.6.16');
  assert.ok(window.RoyalChangelog.releases.some(item => item.version === '0.6.15'));
});
