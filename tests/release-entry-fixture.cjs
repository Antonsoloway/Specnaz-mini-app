const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
exports.workerChain = () => {
  const config = fs.readFileSync(path.join(root, 'worker/wrangler.toml'), 'utf8');
  let file = config.match(/^main\s*=\s*"(src\/[^"]+\.js)"/m)?.[1];
  assert.ok(file, 'the deployed worker entry must be explicit');
  const chain = [];
  while (file) {
    assert.ok(!chain.includes(file), 'worker wrappers must not cycle');
    chain.push(file);
    const source = fs.readFileSync(path.join(root, 'worker', file), 'utf8');
    const next = source.match(/import currentWorker from '([^']+)'/);
    file = next ? path.posix.join(path.posix.dirname(file), next[1]) : null;
  }
  return chain;
};
exports.activeHtml = () => {
  const entry = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const target = entry.match(/const target = '(app-v\d+\.html)'/)?.[1];
  assert.ok(target, 'the public application target must be explicit');
  assert.ok(index.includes(target), 'both public entry points must select the same release');
  return {target, source:fs.readFileSync(path.join(root,target),'utf8')};
};
