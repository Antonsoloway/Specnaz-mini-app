const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const journal = require(path.join(ROOT, 'admin-journal-v0600.js'));
const adminSource = fs.readFileSync(path.join(ROOT, 'admin-v0600.js'), 'utf8');
const writeSource = fs.readFileSync(path.join(ROOT, 'admin-write-v0600-v3.js'), 'utf8');
const appSource = fs.readFileSync(path.join(ROOT, 'app-v0600.html'), 'utf8');
const cssSource = fs.readFileSync(path.join(ROOT, 'admin-journal-v0600.css'), 'utf8');

function v2Event(overrides={}) {
  return {
    at:'22.08.2026 12:45:42',
    requestId:'request-journal-test-1',
    adminTelegramId:'1456874273',
    adminUsername:'@old-name',
    op:'updateParticipant',
    entityType:'participant',
    entityKey:'883147905',
    row:3,
    version:'0.6.0-journal.2',
    schemaVersion:2,
    eventId:'evt-journal-test-1',
    occurredAtIso:'2026-08-22T09:45:42.000Z',
    timezone:'Europe/Moscow',
    source:{ type:'miniapp', channel:'worker-signed-hmac', label:'Mini App' },
    actor:{ type:'admin', telegramId:'1456874273', username:'AnSoloway', displayName:'Антон' },
    target:{ entityType:'participant', entityKey:'883147905', row:3, label:'Маша' },
    diff:[{ kind:'changed', field:'role', path:'memberships[3].role', label:'Слот 3 · Роль', before:'Игрок', after:'Помощник', slot:3 }],
    outcome:{ status:'committed', code:'OK', summary:'Изменение сохранено.', warnings:[] },
    metadata:{ endpoint:'https://secret.invalid', token:'must-not-render' },
    ...overrides
  };
}

test('v2 renderer shows actor, source, Moscow time, target, action, outcome and semantic before → after', () => {
  const event = journal.normalizeEvent(v2Event());
  assert.equal(event.title, 'Антон изменил участника «Маша»');
  assert.equal(event.source.label, 'Mini App');
  assert.equal(event.timestamp, '22.08.2026 12:45:42 МСК');
  assert.deepEqual(
    event.diffs.map(item => [item.label, item.before, item.after]),
    [['Слот 3 · Роль', 'Игрок', 'Помощник']]
  );

  const html = journal.render([v2Event()]);
  assert.match(html, /Антон изменил участника «Маша»/);
  assert.match(html, /Слот 3 · Роль/);
  assert.match(html, /Игрок/);
  assert.match(html, /Помощник/);
  assert.match(html, /Выполнено/);
  assert.match(html, /Изменение сохранено/);
  assert.match(html, /Технические сведения/);
  assert.doesNotMatch(html, /1456874273|883147905|secret\.invalid|must-not-render/);
});

test('legacy v1 adapter derives the actual slot change and never treats requested changed as the diff', () => {
  const row = {
    at:'22.08.2026 11:45:42', requestId:'request-v1', adminTelegramId:'1456874273',
    adminUsername:'@AnSoloway', op:'updateParticipant', entityType:'participant',
    entityKey:'883147905', row:3, changed:{ memberships:[{ slot:3, role:'Помощник' }] },
    before:{ name:'Маша', memberships:[{ slot:3, game:'Royal Match', team:'CATAHA', role:'Игрок', nickname:'Кука' }] },
    after:{ name:'Маша', memberships:[{ slot:3, game:'Royal Match', team:'CATAHA', role:'Помощник', nickname:'Кука' }] },
    version:'0.6.0-write.5'
  };
  const event = journal.normalizeEvent(row);
  assert.equal(event.title, '@AnSoloway изменил участника «Маша»');
  assert.deepEqual(event.diffs.map(item => item.label), ['Слот 3 · Роль']);
  assert.equal(event.diffs[0].before, 'Игрок');
  assert.equal(event.diffs[0].after, 'Помощник');

  const html = journal.render([row]);
  assert.doesNotMatch(html, /adminTelegramId|entityKey|"memberships"|883147905|1456874273/);
  assert.doesNotMatch(html, /<pre|royal-admin-journal-json/);
});

test('legacy adapter renders slot clearing and photo replacement in human language', () => {
  const participant = {
    at:'22.08.2026 12:00:00', adminUsername:'admin', op:'updateParticipant',
    entityType:'participant', entityKey:'883147905',
    before:{ name:'Маша', memberships:[{ slot:3, game:'Royal Match', team:'CATAHA', role:'Помощник', nickname:'Кука' }] },
    after:{ name:'Маша', memberships:[] }, changed:{ memberships:[] }
  };
  const team = {
    at:'22.08.2026 12:01:00', adminUsername:'admin', op:'updateTeam',
    entityType:'team', entityKey:'Royal Match :: CATAHA',
    before:{ game:'Royal Match', name:'CATAHA', leader:'Маша', photoUrl:'https://old.invalid/photo.jpg' },
    after:{ game:'Royal Match', name:'CATAHA', leader:'Маша', photoUrl:'https://new.invalid/photo.jpg' },
    changed:{ photo:{ changed:true, contentHash:'private-hash' } }
  };
  const participantEvent = journal.normalizeEvent(participant);
  assert.equal(participantEvent.diffs.length, 1);
  assert.equal(participantEvent.diffs[0].label, 'Слот 3');
  assert.match(participantEvent.diffs[0].before, /Royal Match · CATAHA · Помощник · ник: Кука/);
  assert.equal(participantEvent.diffs[0].after, 'Пусто');

  const html = journal.render([participant, team]);
  assert.match(html, /Предыдущее фото/);
  assert.match(html, /Новое фото/);
  assert.doesNotMatch(html, /old\.invalid|new\.invalid|private-hash/);
});

test('sheet, bot and system sources get honest fallbacks and Russian action wording', () => {
  const sheet = journal.normalizeEvent(v2Event({
    adminUsername:'', adminTelegramId:'',
    source:{ type:'google_sheets', channel:'installable-on-edit', label:'Google Sheets' },
    actor:{ type:'sheet_editor' },
    target:{ entityType:'participant', label:'Маша' }
  }));
  assert.equal(sheet.source.key, 'sheet');
  assert.equal(sheet.actor.label, 'Редактор Google Sheets');
  assert.equal(sheet.title, 'Редактор Google Sheets изменил участника «Маша»');

  const bot = journal.normalizeEvent(v2Event({
    source:{ type:'telegram_bot', label:'Telegram-бот' },
    actor:{ type:'bot', displayName:'Бот Голубь' },
    target:{ entityType:'participant', label:'Маша' }
  }));
  assert.equal(bot.source.key, 'bot');
  assert.equal(bot.title, 'Бот Голубь изменил участника «Маша»');

  const system = journal.normalizeEvent(v2Event({
    op:'deleteTeam', entityType:'team',
    source:{ type:'system', channel:'rename-cascade', label:'Система' },
    actor:{ type:'system', displayName:'Система' },
    target:{ entityType:'team', label:'CATAHA', game:'Royal Match' }
  }));
  assert.equal(system.source.key, 'system');
  assert.equal(system.title, 'Система удалила команду «CATAHA»');
});

test('idempotent noop outcome is neutral and never presented as an error', () => {
  const event = v2Event({
    diff:[],
    outcome:{ status:'noop', code:'IDEMPOTENT_REPLAY', warnings:[] }
  });
  const normalized = journal.normalizeEvent(event);
  assert.equal(normalized.outcome.status, 'noop');
  assert.equal(normalized.outcome.label, 'Без изменений');
  assert.equal(normalized.outcome.summary, 'Фактических изменений нет.');
  const html = journal.render([event]);
  assert.match(html, /Без изменений/);
  assert.match(html, /Фактических изменений нет/);
  assert.match(html, /data-journal-outcome="noop"/);
  assert.match(html, /royal-journal-outcome--noop/);
  assert.match(html, /option value="noop">Без изменений/);
});

test('all untrusted fields are escaped and sensitive nested payload is not exposed', () => {
  const hostile = v2Event({
    requestId:'Bearer super-secret',
    source:{ type:'sheet', channel:'https://private.invalid/hook', label:'<img src=x onerror=alert(1)>' },
    actor:{ displayName:'<script>alert(1)</script>', telegramId:'999999999' },
    target:{ entityType:'team', label:'<svg onload=alert(1)>', entityKey:'secret' },
    diff:[{ field:'leader', label:'<b>Лидер</b>', before:'<iframe src=x>', after:'https://private.invalid/person' }],
    outcome:{ status:'warning', summary:'<img src=x onerror=alert(2)>', warnings:['token=abcdef', '<script>bad()</script>'] },
    metadata:{ raw:'<script>metadata()</script>', base64:'AAAA-secret' }
  });
  const html = journal.render([hostile]);
  assert.doesNotMatch(html, /<(?:script|img|svg|iframe)(?:\s|>)/i);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;b&gt;Лидер&lt;\/b&gt;/);
  assert.match(html, /Ссылка скрыта/);
  assert.doesNotMatch(html, /private\.invalid|super-secret|AAAA-secret|metadata\(\)/);
});

test('malformed rows fail safely without echoing their input', () => {
  assert.doesNotThrow(() => journal.render([null, '<script>bad()</script>', ['raw']]));
  const html = journal.render([null, '<script>bad()</script>', ['raw']]);
  assert.equal((html.match(/Повреждённая запись журнала/g) || []).length, 3);
  assert.doesNotMatch(html, /bad\(\)|<script>|\["raw"\]/);
  assert.match(html, /Исходные данные не показаны из соображений безопасности/);
});

test('pagination markup hides records after 20 and provides search/source/entity/outcome controls', () => {
  const rows = Array.from({ length:45 }, (_, index) => v2Event({
    eventId:'evt-' + index,
    requestId:'req-' + index,
    target:{ entityType:index % 2 ? 'team' : 'participant', label:'Объект ' + index },
    entityType:index % 2 ? 'team' : 'participant',
    op:index % 2 ? 'updateTeam' : 'updateParticipant'
  }));
  const html = journal.render(rows);
  assert.equal((html.match(/data-journal-record="1"/g) || []).length, 45);
  assert.equal((html.match(/data-journal-record="1"[^>]* hidden/g) || []).length, 25);
  assert.match(html, /data-journal-search="1"/);
  assert.match(html, /data-journal-filter="source"/);
  assert.match(html, /data-journal-filter="entity"/);
  assert.match(html, /data-journal-filter="outcome"/);
  assert.match(html, /data-journal-load-more="1"/);
  assert.equal(journal.pageSize, 20);
});

test('filter engine combines search, source, entity, outcome and page limit', () => {
  function record({ source, entity, outcome, search }) {
    return { hidden:false, dataset:{ journalSource:source, journalEntity:entity, journalOutcome:outcome, journalSearchText:search } };
  }
  const records = [
    record({ source:'miniapp', entity:'participant', outcome:'committed', search:'антон маша роль' }),
    record({ source:'sheet', entity:'team', outcome:'warning', search:'редактор команда сатана' }),
    record({ source:'miniapp', entity:'team', outcome:'committed', search:'антон команда маяк' })
  ];
  const controls = {
    '[data-journal-search]':{ value:'команда' },
    '[data-journal-filter="source"]':{ value:'miniapp' },
    '[data-journal-filter="entity"]':{ value:'team' },
    '[data-journal-filter="outcome"]':{ value:'committed' }
  };
  const count = { textContent:'' };
  const empty = { hidden:true };
  const more = { hidden:false };
  const container = {
    dataset:{ journalVisibleLimit:'20' },
    querySelector(selector) {
      if (selector === '[data-journal-count]') return count;
      if (selector === '[data-journal-no-results]') return empty;
      if (selector === '[data-journal-load-more]') return more;
      return controls[selector] || null;
    },
    querySelectorAll(selector) { return selector === '[data-journal-record="1"]' ? records : []; }
  };
  assert.deepEqual(journal.apply(container), { matched:1, visible:1, total:3 });
  assert.deepEqual(records.map(item => item.hidden), [true, true, false]);
  assert.equal(count.textContent, 'Показано: 1 из 1 · всего 3');
  assert.equal(empty.hidden, true);
  assert.equal(more.hidden, true);
});

test('admin integration is synchronous and the old raw JSON MutationObserver decorator is removed', () => {
  assert.match(adminSource, /RoyalAdminJournalV0600/);
  assert.match(adminSource, /renderer\.render\(rows\)/);
  assert.match(adminSource, /RoyalAdminJournalV0600\?\.mount\?\.\(panel\)/);
  assert.doesNotMatch(adminSource, /safeEsc\(JSON\.stringify\(row\)\)/);
  assert.doesNotMatch(writeSource, /function decorateJournal|journalOperationLabel|JSON\.parse\(clean\(detail\.textContent\)\)/);
  assert.doesNotMatch(writeSource, /royal-admin-journal-json/);
  assert.match(appSource, /admin-journal-v0600\.css\?v=20260822-journal-v2/);
  assert.match(appSource, /admin-journal-v0600\.js\?v=20260822-journal-v2/);
  assert.ok(appSource.indexOf('admin-journal-v0600.js') < appSource.indexOf('admin-v0600.js'));
  assert.match(cssSource, /\.royal-admin-journal-card\[hidden\]/);
});
