const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

test('Worker exposes the exact v0.6 track only through the authenticated media route', () => {
  const media = read('worker/src/entry-v1100.js');
  assert.match(media, /'background-v0600':\s*\{\s*path:\s*'media\/app\/v0600\/project-mayak-background\.mp3'/);
  assert.match(media, /authorizeViaSnapshot\(request, env, ctx\)/);
  assert.match(media, /if \(!authPayload\?\.ok\) return auth/);
  assert.doesNotMatch(media, /background-v0600[\s\S]{0,220}Cache-Control',\s*'public/i);
});

test('Worker 1.29 is the deploy entry and preserves the 1.28 wrapper chain', () => {
  const entry = read('worker/src/entry-v1290.js');
  const wrangler = read('worker/wrangler.toml');
  assert.match(entry, /import currentWorker from '\.\/entry-v1280\.js'/);
  assert.match(entry, /WRAPPER_VERSION = '1\.29\.0'/);
  assert.match(entry, /backgroundMusic:\s*BACKGROUND_MUSIC/);
  assert.match(wrangler, /main = "src\/entry-v1290\.js"/);
});

test('the supplied MP3 is never copied into the public application tree', () => {
  const publicAudio = fs.readdirSync(ROOT, { recursive: true })
    .map(value => String(value))
    .filter(value => /\.(?:mp3|m4a|aac|ogg)$/i.test(value));
  assert.deepEqual(publicAudio, []);
});
