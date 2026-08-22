const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'changelog-v0600.js'),
  'utf8'
);

function createHarness(previous = []) {
  const panel = { hidden:true, innerHTML:'' };
  const sandbox = {
    console,
    document:{
      body:{ classList:{ add(){} } },
      querySelectorAll(){ return []; },
      getElementById(id){ return id === 'panel' ? panel : null; }
    },
    requestAnimationFrame(callback){ callback(); },
    scrollTo(){},
    RoyalNav:{ pushCurrent(){}, enhanceVisibleBack(){} },
    RoyalChangelog:{ releases:previous }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename:'changelog-v0600.js' });
  return { sandbox, panel };
}

test('v0.6 changelog groups every verified area and keeps a flat compatibility list', () => {
  const { sandbox } = createHarness([{ version:'0.5.59', title:'Предыдущая', changes:['Старое изменение'] }]);
  const releases = sandbox.RoyalChangelog.releases;
  const current = releases[0];

  assert.equal(current.version, '0.6.0');
  assert.deepEqual(
    Array.from(current.sections, section => section.title),
    ['Админ-режим', 'Участники', 'Команды и фотографии', 'Синхронизация и надёжность', 'Безопасность']
  );
  assert.equal(
    current.changes.length,
    current.sections.reduce((total, section) => total + section.changes.length, 0)
  );
  assert.equal(releases.filter(release => release.version === '0.6.0').length, 1);
  assert.equal(releases[1].version, '0.5.59');
});

test('rendered v0.6 history is grouped, escaped and has no raw technical payload', () => {
  const previous = [{
    version:'0.5.59',
    title:'<img src=x onerror=alert(1)>',
    changes:['<script>alert(1)</script>']
  }];
  const { sandbox, panel } = createHarness(previous);
  sandbox.RoyalChangelog.open();

  assert.equal(panel.hidden, false);
  assert.match(panel.innerHTML, /<h3>Админ-режим<\/h3>/);
  assert.match(panel.innerHTML, /<h3>Синхронизация и надёжность<\/h3>/);
  assert.match(panel.innerHTML, /Игровые слоты сохраняются одной атомарной операцией/);
  assert.match(panel.innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(panel.innerHTML, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(panel.innerHTML, /<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(panel.innerHTML, /requestId|endpointPinned|dataHash|membership-слот/);
});

test('only implemented preview features are described before startup and music land', () => {
  assert.match(source, /Очистить данные/);
  assert.match(source, /временный сетевой сбой кнопки «Обновить»/);
  assert.match(source, /создавать команды/);
  assert.doesNotMatch(source, /стартов\w* заставк|фонов\w* музык|Добро пожаловать/iu);
});
