#!/usr/bin/env node
// Every test must have an explicit component owner. No quarantine/skip list.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const suites = require('./release-suites.json');
const scope = process.argv[2] || 'app';
if (!['app', 'crm', 'all'].includes(scope)) throw new Error('Expected app, crm or all');
const inventory = fs.readdirSync(path.join(root, 'tests')).filter(f => /\.test\.(?:js|mjs)$/.test(f)).sort();
const assigned = Object.values(suites).flat();
if (new Set(assigned).size !== assigned.length || JSON.stringify([...assigned].sort()) !== JSON.stringify(inventory)) {
  throw new Error('Release suite inventory changed: assign every test exactly once before publishing');
}
const selected = scope === 'all' ? assigned : suites[scope];
console.log(`Release gate: ${scope}; ${selected.length} test files; commit must also pass runtime/browser CI`);
const result = spawnSync(process.execPath, ['--test', ...selected.map(f => `tests/${f}`)], {
  cwd: root, stdio: 'inherit', env: {...process.env, ROYAL_NAV_TEST_NO_PRIVATE:'1'}
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
