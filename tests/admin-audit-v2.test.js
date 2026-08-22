const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const auditSource = fs.readFileSync(
  path.join(ROOT, 'apps-script-live', '34_MINIAPP_AUDIT_V2.js'),
  'utf8'
);

function digestBytes(text) {
  return [...crypto.createHash('sha256').update(String(text)).digest()]
    .map(value => (value > 127 ? value - 256 : value));
}

class FakeRange {
  constructor(sheet, row, column, rows = 1, columns = 1) {
    this.sheet = sheet;
    this.row = row;
    this.column = column;
    this.rows = rows;
    this.columns = columns;
  }

  getDisplayValues() {
    return Array.from({ length: this.rows }, (_, rowOffset) =>
      Array.from({ length: this.columns }, (_, columnOffset) => {
        const value = this.sheet.cell(this.row + rowOffset, this.column + columnOffset);
        return value == null ? '' : String(value);
      })
    );
  }

  getValues() {
    return Array.from({ length: this.rows }, (_, rowOffset) =>
      Array.from({ length: this.columns }, (_, columnOffset) =>
        this.sheet.cell(this.row + rowOffset, this.column + columnOffset)
      )
    );
  }

  getSheet() { return this.sheet; }
  getA1Notation() { return `R${this.row}C${this.column}`; }
  getNumRows() { return this.rows; }
  getNumColumns() { return this.columns; }

  setValues(values) {
    for (let r = 0; r < this.rows; r += 1) {
      for (let c = 0; c < this.columns; c += 1) {
        this.sheet.setCell(this.row + r, this.column + c, values[r][c]);
      }
    }
    this.sheet.setValuesCalls.push({
      row: this.row, column: this.column, rows: this.rows,
      columns: this.columns, values
    });
    return this;
  }

  clearContent() {
    for (let r = 0; r < this.rows; r += 1) {
      for (let c = 0; c < this.columns; c += 1) {
        this.sheet.setCell(this.row + r, this.column + c, '');
      }
    }
    return this;
  }

  setFontWeight() { return this; }
  setNumberFormat() { return this; }

  createTextFinder(text) {
    const range = this;
    return {
      matchEntireCell() { return this; },
      findNext() {
        for (let offset = range.rows - 1; offset >= 0; offset -= 1) {
          if (String(range.sheet.cell(range.row + offset, range.column) || '') === String(text)) {
            const foundRow = range.row + offset;
            return { getRow: () => foundRow };
          }
        }
        return null;
      }
    };
  }
}

class FakeSheet {
  constructor(name, parent) {
    this.name = name;
    this.parent = parent;
    this.cells = new Map();
    this.maxRows = 1000;
    this.maxColumns = 26;
    this.setValuesCalls = [];
    this.appendRowCalls = 0;
    this.hidden = false;
    this.protections = [];
  }

  key(row, column) { return `${row}:${column}`; }
  cell(row, column) { return this.cells.get(this.key(row, column)); }
  setCell(row, column, value) { this.cells.set(this.key(row, column), value); }
  getName() { return this.name; }
  getParent() { return this.parent; }
  getRange(row, column, rows = 1, columns = 1) {
    return new FakeRange(this, row, column, rows, columns);
  }
  getLastRow() {
    let last = 0;
    for (const [key, value] of this.cells) {
      if (value === '' || value == null) continue;
      last = Math.max(last, Number(key.split(':')[0]));
    }
    return last;
  }
  getLastColumn() { return this.maxColumns; }
  getMaxRows() { return this.maxRows; }
  getMaxColumns() { return this.maxColumns; }
  insertRowsAfter(_row, count) { this.maxRows += count; }
  insertColumnsAfter(_column, count) { this.maxColumns += count; }
  appendRow() {
    this.appendRowCalls += 1;
    throw new Error('appendRow must not be used by audit v2');
  }
  setFrozenRows() {}
  hideSheet() { this.hidden = true; }
  isSheetHidden() { return this.hidden; }
  getProtections() { return this.protections; }
  protect() {
    let description = '';
    let warningOnly = true;
    let domainEdit = false;
    let editors = [];
    const protection = {
      setDescription(value) { description = String(value || ''); return this; },
      getDescription() { return description; },
      setWarningOnly(value) { warningOnly = value === true; return this; },
      isWarningOnly() { return warningOnly; },
      addEditor(editor) { if (editor) editors.push(editor); return this; },
      getEditors() { return editors.slice(); },
      removeEditors(remove) {
        editors = editors.filter(editor => !remove.includes(editor));
        return this;
      },
      canDomainEdit() { return domainEdit; },
      setDomainEdit(value) { domainEdit = value === true; return this; }
    };
    this.protections.push(protection);
    return protection;
  }
}

class FakeSpreadsheet {
  constructor() { this.sheets = new Map(); }
  getSheetByName(name) { return this.sheets.get(name) || null; }
  insertSheet(name) {
    const sheet = new FakeSheet(name, this);
    this.sheets.set(name, sheet);
    return sheet;
  }
  getId() { return 'spreadsheet-test'; }
}

function createSandbox() {
  const ss = new FakeSpreadsheet();
  const properties = new Map([[
    'MINIAPP_AUDIT_V2_ACTIVE',
    'audit-v2:0.6.0-audit.4:schema-2:epoch-1'
  ]]);
  const propertyOperations = [];
  let lockGets = 0;
  let tryLocks = 0;
  let releases = 0;
  let uuid = 0;
  const sandbox = {
    console,
    Date,
    JSON,
    Math,
    Object,
    Array,
    String,
    Number,
    RegExp,
    isFinite,
    SPREADSHEET_ID: 'spreadsheet-test',
    MINIAPP_ADMIN_WRITE_JOURNAL_SHEET: 'Админ журнал',
    MINIAPP_ADMIN_WRITE_JOURNAL_LIMIT: 100,
    MINIAPP_adminWriteSha256_: value => crypto.createHash('sha256').update(String(value)).digest('hex'),
    LockService: {
      getScriptLock() {
        lockGets += 1;
        return {
          tryLock() { tryLocks += 1; return true; },
          releaseLock() { releases += 1; }
        };
      }
    },
    SpreadsheetApp: {
      ProtectionType: { SHEET: 'SHEET' },
      openById: () => ss,
      flush() {}
    },
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty(key) { return properties.get(String(key)) || null; },
          setProperty(key, value) {
            properties.set(String(key), String(value));
            propertyOperations.push({ type: 'set', key: String(key), value: String(value) });
            return this;
          },
          deleteProperty(key) {
            properties.delete(String(key));
            propertyOperations.push({ type: 'delete', key: String(key) });
            return this;
          }
        };
      }
    },
    Session: {
      getScriptTimeZone: () => 'Europe/Moscow',
      getActiveUser: () => ({ getEmail: () => 'trigger-owner@example.test' }),
      getEffectiveUser: () => ({ getEmail: () => 'owner@example.test' })
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (_algorithm, value) => digestBytes(value),
      getUuid: () => `uuid-${++uuid}`
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(auditSource, sandbox, { filename: '34_MINIAPP_AUDIT_V2.js' });
  return {
    sandbox,
    ss,
    properties,
    propertyOperations,
    lockCounts: () => ({ lockGets, tryLocks, releases })
  };
}

function participantBeforeAfter() {
  return {
    before: {
      row: 3,
      telegramId: '123456789',
      name: 'Тестовый участник',
      memberships: [{
        slot: 3, game: 'Royal Match', team: 'Команда',
        role: 'Игрок', nickname: 'Ник'
      }],
      chatState: 'В чате'
    },
    after: {
      row: 3,
      telegramId: '123456789',
      name: 'Тестовый участник',
      memberships: [{
        slot: 3, game: 'Royal Match', team: 'Команда',
        role: 'Помощник', nickname: 'Ник'
      }],
      chatState: 'В чате'
    }
  };
}

function functionSource(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${name} must exist`);
  const next = source.indexOf('\nfunction ', start + marker.length);
  return source.slice(start, next === -1 ? source.length : next);
}

function seedBaseline(sandbox, ss, entry) {
  const sheet = sandbox.MINIAPP_auditV2EnsureBaseline_(ss);
  sheet.getRange(2, 1, 1, 7).setValues([[
    entry.entityType,
    entry.entityKey,
    entry.row,
    entry.fingerprint,
    sandbox.MINIAPP_auditV2SafeJson_(entry.record),
    new Date().toISOString(),
    2
  ]]);
  return sheet;
}

test('semantic diff reports exact participant slot field changes and clears', () => {
  const { sandbox } = createSandbox();
  const { before, after } = participantBeforeAfter();
  const role = sandbox.MINIAPP_auditV2SemanticDiff_('participant', before, after, {});
  assert.equal(role.length, 1);
  assert.equal(role[0].kind, 'field_changed');
  assert.equal(role[0].field, 'memberships.role');
  assert.equal(role[0].slot, 3);
  assert.equal(role[0].label, 'Слот 3 · Роль');
  assert.equal(role[0].before, 'Игрок');
  assert.equal(role[0].after, 'Помощник');

  const cleared = sandbox.MINIAPP_auditV2SemanticDiff_(
    'participant', before, { ...after, memberships: [] }, {}
  );
  assert.equal(cleared.length, 1);
  assert.equal(cleared[0].kind, 'membership_cleared');
  assert.equal(cleared[0].slot, 3);
});

test('manual team photo presence change is a readable semantic event', () => {
  const { sandbox } = createSandbox();
  const diff = sandbox.MINIAPP_auditV2SemanticDiff_(
    'team',
    { game: 'Royal Match', name: 'Команда', leader: '', photoState: 'present' },
    { game: 'Royal Match', name: 'Команда', leader: '', photoState: 'absent' },
    {}
  );
  assert.equal(diff.length, 1);
  assert.equal(diff[0].kind, 'photo_removed');
  assert.equal(diff[0].label, 'Фото команды');
  assert.equal(diff[0].before, 'Есть фото');
  assert.equal(diff[0].after, 'Нет фото');
});

test('Mini App facade writes one A:Y row without nested ScriptLock or appendRow', () => {
  const { sandbox, ss, lockCounts } = createSandbox();
  const { before, after } = participantBeforeAfter();
  const result = sandbox.MINIAPP_auditV2RecordMiniAppMutation_({
    ss,
    adminId: '999999999',
    adminUsername: '@admin_test',
    adminDisplayName: 'Администратор теста',
    lockAlreadyHeld: true,
    requestId: 'request_12345678901234567890',
    op: 'updateParticipant',
    auditVersion: '0.6.0-write.5'
  }, 'participant', '123456789', 3, before, {
    ...after,
    photoUrl: 'https://signed.example.test/private'
  }, { memberships: after.memberships });

  assert.equal(result.ok, true);
  assert.equal(result.duplicate, false);
  assert.deepEqual(lockCounts(), { lockGets: 0, tryLocks: 0, releases: 0 });

  const journal = ss.getSheetByName('Админ журнал');
  assert.equal(journal.appendRowCalls, 0);
  const row = journal.getRange(2, 1, 1, 25).getValues()[0];
  assert.equal(row[1], 'request_12345678901234567890');
  assert.equal(row[4], 'updateParticipant');
  assert.equal(row[12], result.eventId);
  assert.equal(row[13], 2);
  assert.equal(JSON.parse(row[16]).type, 'miniapp');
  assert.equal(JSON.parse(row[17]).displayName, 'Администратор теста');
  assert.equal(JSON.parse(row[18]).entityKey, '123456789');
  assert.equal(JSON.parse(row[19])[0].label, 'Слот 3 · Роль');
  assert.equal(JSON.parse(row[20]).status, 'committed');
  assert.equal(row[22], 'request_12345678901234567890');
  assert.equal(row[23], 'request:request_12345678901234567890');
  assert.equal(JSON.parse(row[10]).photoUrl, '[скрыто]');

  const index = ss.getSheetByName('Админ аудит индекс');
  assert.equal(index.appendRowCalls, 0);
  assert.equal(index.getRange(2, 1).getValues()[0][0], 'request:request_12345678901234567890');
});

test('persistent index makes a repeated request idempotent', () => {
  const { sandbox, ss } = createSandbox();
  const { before, after } = participantBeforeAfter();
  let baselineSyncs = 0;
  sandbox.MINIAPP_auditV2RepairBaselineIfCurrent_ = () => {
    baselineSyncs += 1;
    return { repaired: true, matched: true };
  };
  const ctx = {
    ss,
    adminId: '999999999',
    adminUsername: '@admin_test',
    lockAlreadyHeld: true,
    requestId: 'request_12345678901234567890',
    op: 'updateParticipant'
  };
  const first = sandbox.MINIAPP_auditV2RecordMiniAppMutation_(
    ctx, 'participant', '123456789', 3, before, after, {}
  );
  const second = sandbox.MINIAPP_auditV2RecordMiniAppMutation_(
    ctx, 'participant', '123456789', 3, before, after, {}
  );
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.duplicate, true);
  assert.equal(second.eventId, first.eventId);
  assert.equal(ss.getSheetByName('Админ журнал').getLastRow(), 2);
  assert.equal(ss.getSheetByName('Админ аудит индекс').getLastRow(), 2);
  assert.equal(baselineSyncs, 2, 'duplicate retry must also repair/sync baseline');
});

test('outer request-id lookup repairs a partial journal/index commit conditionally', () => {
  const { sandbox, ss } = createSandbox();
  sandbox.console = { ...console, error() {} };
  const base = ss.insertSheet('База участников');
  base.setCell(2, 1, 'Тестовый участник');
  base.setCell(2, 4, '123456789');
  base.setCell(2, 11, 'Команда — РМ');
  base.setCell(2, 12, 'Ник');
  base.setCell(2, 13, 'Помощник');
  base.setCell(2, 25, 'Royal Match');
  base.setCell(2, 32, 'В чате');

  const before = {
    ...participantBeforeAfter().before,
    row: 2,
    memberships: [{
      slot: 3, game: 'Royal Match', team: 'Команда',
      role: 'Игрок', nickname: 'Ник'
    }]
  };
  const after = {
    ...participantBeforeAfter().after,
    row: 2,
    memberships: [{
      slot: 3, game: 'Royal Match', team: 'Команда',
      role: 'Помощник', nickname: 'Ник'
    }]
  };
  seedBaseline(
    sandbox,
    ss,
    sandbox.MINIAPP_auditV2BaselineEntry_('participant', '123456789', 2, before)
  );

  const realRepair = sandbox.MINIAPP_auditV2RepairBaselineIfCurrent_;
  let repairAttempts = 0;
  sandbox.MINIAPP_auditV2RepairBaselineIfCurrent_ = (spreadsheet, event) => {
    repairAttempts += 1;
    if (repairAttempts === 1) throw new Error('simulated baseline write failure');
    return realRepair(spreadsheet, event);
  };
  const ctx = {
    ss,
    lockAlreadyHeld: true,
    adminId: '999999999',
    adminUsername: '@admin_test',
    requestId: 'partial-request-1234567890',
    op: 'updateParticipant'
  };
  const first = sandbox.MINIAPP_auditV2RecordMiniAppMutation_(
    ctx, 'participant', '123456789', 2, before, after, {}
  );
  assert.equal(first.ok, false);
  assert.equal(ss.getSheetByName('Админ журнал').getLastRow(), 2);
  assert.equal(ss.getSheetByName('Админ аудит индекс').getLastRow(), 2);

  const found = sandbox.MINIAPP_auditV2FindRequest_(
    'partial-request-1234567890',
    { lockAlreadyHeld: true }
  );
  assert.ok(found);
  assert.equal(found.baselineRepair.repaired, true);
  assert.equal(repairAttempts, 2);
  const baseline = sandbox.MINIAPP_auditV2LoadBaseline_(ss);
  assert.equal(
    baseline.records['participant\n123456789'].record.memberships[0].role,
    'Помощник'
  );
});

test('outer request lookup rebuilds a missing index after journal-only commit', () => {
  const { sandbox, ss } = createSandbox();
  sandbox.console = { ...console, error() {} };
  const base = ss.insertSheet('База участников');
  base.setCell(2, 1, 'Новое имя');
  base.setCell(2, 4, '123456789');
  base.setCell(2, 32, 'В чате');
  const before = {
    row: 2, telegramId: '123456789', name: 'Старое имя',
    memberships: [], chatState: 'В чате'
  };
  const after = {
    row: 2, telegramId: '123456789', name: 'Новое имя',
    memberships: [], chatState: 'В чате'
  };
  seedBaseline(
    sandbox,
    ss,
    sandbox.MINIAPP_auditV2BaselineEntry_('participant', '123456789', 2, before)
  );

  const realEnsureIndex = sandbox.MINIAPP_auditV2EnsureIndexEntry_;
  let indexAttempts = 0;
  sandbox.MINIAPP_auditV2EnsureIndexEntry_ = (spreadsheet, event, row) => {
    indexAttempts += 1;
    if (indexAttempts === 1) throw new Error('simulated index failure');
    return realEnsureIndex(spreadsheet, event, row);
  };
  const first = sandbox.MINIAPP_auditV2RecordMiniAppMutation_({
    ss,
    lockAlreadyHeld: true,
    adminId: '999999999',
    requestId: 'journal-only-request-1234567890',
    op: 'updateParticipant'
  }, 'participant', '123456789', 2, before, after, {});
  assert.equal(first.ok, false);
  assert.equal(ss.getSheetByName('Админ журнал').getLastRow(), 2);
  assert.equal(ss.getSheetByName('Админ аудит индекс'), null);

  const found = sandbox.MINIAPP_auditV2FindRequest_(
    'journal-only-request-1234567890',
    { lockAlreadyHeld: true }
  );
  assert.ok(found);
  assert.equal(found.baselineRepair.repaired, true);
  assert.equal(indexAttempts, 2);
  assert.equal(ss.getSheetByName('Админ аудит индекс').getLastRow(), 2);
  assert.equal(
    sandbox.MINIAPP_auditV2LoadBaseline_(ss)
      .records['participant\n123456789'].record.name,
    'Новое имя'
  );
});

test('an older duplicate never regresses baseline after a newer live mutation', () => {
  const { sandbox, ss } = createSandbox();
  const base = ss.insertSheet('База участников');
  base.setCell(2, 1, 'Старое имя');
  base.setCell(2, 4, '123456789');
  base.setCell(2, 32, 'В чате');
  sandbox.MINIAPP_auditV2BootstrapBaseline();

  const before = {
    row: 2, telegramId: '123456789', name: 'Имя до операции',
    memberships: [], chatState: 'В чате'
  };
  const committedAfter = {
    row: 2, telegramId: '123456789', name: 'Старое имя',
    memberships: [], chatState: 'В чате'
  };
  const ctx = {
    ss,
    lockAlreadyHeld: true,
    adminId: '999999999',
    adminUsername: '@admin_test',
    requestId: 'older-request-1234567890',
    op: 'updateParticipant'
  };
  const first = sandbox.MINIAPP_auditV2RecordMiniAppMutation_(
    ctx, 'participant', '123456789', 2, before, committedAfter, {}
  );
  assert.equal(first.ok, true);

  base.setCell(2, 1, 'Более новое имя');
  const newerSnapshot = sandbox.MINIAPP_auditV2BuildSnapshot_(ss);
  sandbox.MINIAPP_auditV2ReplaceBaseline_(ss, newerSnapshot);

  const duplicate = sandbox.MINIAPP_auditV2RecordMiniAppMutation_(
    ctx, 'participant', '123456789', 2, before, committedAfter, {}
  );
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.baselineRepair.repaired, false);
  assert.equal(duplicate.baselineRepair.reason, 'LIVE_TARGET_NEWER');
  const baseline = sandbox.MINIAPP_auditV2LoadBaseline_(ss);
  assert.equal(
    baseline.records['participant\n123456789'].record.name,
    'Более новое имя'
  );
});

test('legacy A:L row is adapted to nested v2-readable semantics', () => {
  const { sandbox } = createSandbox();
  const { before, after } = participantBeforeAfter();
  const row = sandbox.MINIAPP_auditV2ParseJournalRow_([
    '22.08.2026 12:00:00', 'legacy-request', '999999999', '@legacy_admin',
    'updateParticipant', 'participant', '123456789', '3', '{}',
    JSON.stringify(before), JSON.stringify(after), '0.6.0-write.3'
  ]);
  assert.equal(row.schemaVersion, 1);
  assert.equal(row.source.type, 'miniapp');
  assert.equal(row.actor.label, '@legacy_admin');
  assert.equal(row.target.label, 'Тестовый участник');
  assert.equal(row.diff[0].label, 'Слот 3 · Роль');
  assert.equal(row.outcome.status, 'committed');
});

test('successful no-op remains an idempotency row with neutral outcome', () => {
  const { sandbox } = createSandbox();
  const event = sandbox.MINIAPP_auditV2NormalizeEvent_({
    requestId: 'noop-request',
    op: 'updateTeam',
    entityType: 'team',
    entityKey: 'Royal Match :: Команда',
    before: { game: 'Royal Match', name: 'Команда', leader: 'Лидер' },
    after: { game: 'Royal Match', name: 'Команда', leader: 'Лидер' }
  });
  assert.equal(event.diff.length, 0);
  assert.equal(event.outcome.status, 'noop');
  assert.match(event.outcome.summary, /фактических изменений нет/);
});

test('installable Sheet actor never substitutes the trigger owner for an unknown editor', () => {
  const { sandbox } = createSandbox();
  const unknown = sandbox.MINIAPP_auditV2SheetActor_({});
  assert.equal(unknown.displayName, '');
  assert.equal(unknown.label, 'Редактор Google Sheets — имя недоступно');

  const known = sandbox.MINIAPP_auditV2SheetActor_({
    user: { getEmail: () => 'editor@example.test' }
  });
  assert.equal(known.displayName, 'editor@example.test');
  assert.equal(known.label, 'editor@example.test');
});

test('structural onChange attributes e.user and never labels an unknown editor as System', () => {
  const { sandbox } = createSandbox();
  const coreSource = fs.readFileSync(
    path.join(ROOT, 'apps-script-live', '01_CORE_MAIN.js'), 'utf8'
  );
  const captured = [];
  sandbox.beginPublicDataMutation_ = () => {};
  sandbox.finishPublicDataMutation_ = () => {};
  sandbox.markPublicSyncPending_ = () => {};
  sandbox.ensureMinimumGridSizes_ = () => {};
  sandbox.restoreCoreFormulas_ = () => {};
  sandbox.sortBaseByChatState_ = () => {};
  sandbox.applyAllRoleValidations_ = () => {};
  sandbox.rebuildCounterSnapshot_ = () => {};
  sandbox.hideTechnicalColumnsAndSheets_ = () => {};
  sandbox.MINIAPP_auditV2Reconcile_ = (_ss, options) => {
    captured.push(options);
    return { ok: true, events: 0 };
  };
  vm.runInContext(functionSource(coreSource, 'handleSpreadsheetChange'), sandbox, {
    filename: '01_CORE_MAIN.handleSpreadsheetChange.js'
  });

  sandbox.handleSpreadsheetChange({
    changeType: 'INSERT_ROW',
    user: { getEmail: () => 'structural-editor@example.test' }
  });
  sandbox.handleSpreadsheetChange({ changeType: 'REMOVE_ROW' });

  assert.equal(captured.length, 2);
  assert.equal(captured[0].source.type, 'manual_sheet');
  assert.equal(captured[0].source.channel, 'spreadsheet-structural-change');
  assert.equal(captured[0].actor.label, 'structural-editor@example.test');
  assert.equal(captured[1].actor.type, 'google_user');
  assert.equal(captured[1].actor.displayName, '');
  assert.equal(captured[1].actor.label, 'Редактор Google Sheets — имя недоступно');
});

test('controlled bootstrap prepares journal schema, index and protected baseline together', () => {
  const { sandbox, ss, lockCounts } = createSandbox();
  const base = ss.insertSheet('База участников');
  base.setCell(2, 1, 'Тестовый участник');
  base.setCell(2, 4, '123456789');
  base.setCell(2, 32, 'В чате');

  const bootstrap = sandbox.MINIAPP_auditV2BootstrapBaseline();
  assert.equal(bootstrap.ok, true);
  assert.equal(bootstrap.participants, 1);
  assert.ok(ss.getSheetByName('Админ журнал'));
  assert.ok(ss.getSheetByName('Админ аудит индекс'));
  assert.ok(ss.getSheetByName('Админ аудит baseline'));
  const preflight = sandbox.MINIAPP_auditV2Preflight_();
  assert.equal(preflight.ok, true);
  assert.equal(preflight.journalSchemaReady, true);
  assert.equal(preflight.indexPresent, true);
  assert.equal(preflight.baselineInitialized, true);
  assert.equal(preflight.storageSecurityReady, true);
  assert.equal(preflight.journalHidden, true);
  assert.equal(preflight.journalProtected, true);
  assert.equal(preflight.indexHidden, true);
  assert.equal(preflight.indexProtected, true);
  assert.equal(preflight.baselineHidden, true);
  assert.equal(preflight.baselineProtected, true);
  assert.deepEqual(lockCounts(), { lockGets: 1, tryLocks: 1, releases: 1 });
});

test('disabled manual hook skips before lock and never initializes baseline', () => {
  const { sandbox, ss, properties, lockCounts } = createSandbox();
  properties.delete('MINIAPP_AUDIT_V2_ACTIVE');
  const base = ss.insertSheet('База участников');
  let baselineWrites = 0;
  sandbox.MINIAPP_auditV2ReplaceBaseline_ = () => { baselineWrites += 1; };

  const result = sandbox.MINIAPP_auditV2HandleManualEdit_({
    range: base.getRange(2, 1),
    value: 'Новое имя'
  });
  assert.equal(result.ok, true);
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'AUDIT_V2_DISABLED');
  assert.equal(baselineWrites, 0);
  assert.equal(ss.getSheetByName('Админ аудит baseline'), null);
  assert.deepEqual(lockCounts(), { lockGets: 0, tryLocks: 0, releases: 0 });
});

test('disabled indexed duplicate lookup is read-only and never repairs baseline', () => {
  const { sandbox, ss, properties } = createSandbox();
  const { before, after } = participantBeforeAfter();
  const requestId = 'disabled-indexed-request-1234567890';
  const appended = sandbox.MINIAPP_auditV2RecordMiniAppMutation_({
    ss,
    lockAlreadyHeld: true,
    adminId: '999999999',
    requestId,
    op: 'updateParticipant'
  }, 'participant', '123456789', 3, before, after, {});
  assert.equal(appended.ok, true);
  assert.ok(ss.getSheetByName('Админ аудит индекс'));
  ss.sheets.delete('Админ аудит baseline');
  properties.delete('MINIAPP_AUDIT_V2_ACTIVE');

  let repairCalls = 0;
  let ensureCalls = 0;
  sandbox.MINIAPP_auditV2RepairBaselineIfCurrent_ = () => { repairCalls += 1; };
  sandbox.MINIAPP_auditV2EnsureIndexEntry_ = () => { ensureCalls += 1; };
  const index = ss.getSheetByName('Админ аудит индекс');
  const indexWrites = index.setValuesCalls.length;

  const found = sandbox.MINIAPP_auditV2FindRequest_(
    requestId, { lockAlreadyHeld: true }
  );
  assert.ok(found);
  assert.equal(found.eventId, appended.eventId);
  assert.equal(repairCalls, 0);
  assert.equal(ensureCalls, 0);
  assert.equal(index.setValuesCalls.length, indexWrites);
  assert.equal(ss.getSheetByName('Админ аудит baseline'), null);
});

test('disabled journal-only v2 duplicate lookup does not rebuild missing service sheets', () => {
  const { sandbox, ss, properties } = createSandbox();
  const { before, after } = participantBeforeAfter();
  const requestId = 'disabled-journal-only-request-1234567890';
  const appended = sandbox.MINIAPP_auditV2RecordMiniAppMutation_({
    ss,
    lockAlreadyHeld: true,
    adminId: '999999999',
    requestId,
    op: 'updateParticipant'
  }, 'participant', '123456789', 3, before, after, {});
  assert.equal(appended.ok, true);
  const journal = ss.getSheetByName('Админ журнал');
  ss.sheets.delete('Админ аудит индекс');
  ss.sheets.delete('Админ аудит baseline');
  properties.delete('MINIAPP_AUDIT_V2_ACTIVE');

  let repairCalls = 0;
  let ensureCalls = 0;
  sandbox.MINIAPP_auditV2RepairBaselineIfCurrent_ = () => { repairCalls += 1; };
  sandbox.MINIAPP_auditV2EnsureIndexEntry_ = () => { ensureCalls += 1; };
  const journalWrites = journal.setValuesCalls.length;

  const found = sandbox.MINIAPP_auditV2FindRequest_(
    requestId, { lockAlreadyHeld: true }
  );
  assert.ok(found);
  assert.equal(found.requestId, requestId);
  assert.equal(repairCalls, 0);
  assert.equal(ensureCalls, 0);
  assert.equal(journal.setValuesCalls.length, journalWrites);
  assert.equal(ss.getSheetByName('Админ аудит индекс'), null);
  assert.equal(ss.getSheetByName('Админ аудит baseline'), null);
});

test('stale boolean or older activation token never enables the current audit code', () => {
  const { sandbox, properties } = createSandbox();
  properties.set('MINIAPP_AUDIT_V2_ACTIVE', '1');
  assert.equal(sandbox.MINIAPP_auditV2IsActive_(), false);
  properties.set(
    'MINIAPP_AUDIT_V2_ACTIVE',
    'audit-v2:0.6.0-audit.1:schema-2:epoch-1'
  );
  assert.equal(sandbox.MINIAPP_auditV2IsActive_(), false);
  properties.set(
    'MINIAPP_AUDIT_V2_ACTIVE',
    'audit-v2:0.6.0-audit.2:schema-2:epoch-1'
  );
  assert.equal(sandbox.MINIAPP_auditV2IsActive_(), false);
  properties.set(
    'MINIAPP_AUDIT_V2_ACTIVE',
    'audit-v2:0.6.0-audit.3:schema-2:epoch-1'
  );
  assert.equal(sandbox.MINIAPP_auditV2IsActive_(), false);
  properties.set(
    'MINIAPP_AUDIT_V2_ACTIVE',
    'audit-v2:0.6.0-audit.4:schema-2:epoch-1'
  );
  assert.equal(sandbox.MINIAPP_auditV2IsActive_(), true);
});

test('activation commits schema, index and baseline before setting the active property', () => {
  const { sandbox, properties, lockCounts } = createSandbox();
  properties.delete('MINIAPP_AUDIT_V2_ACTIVE');
  const order = [];
  sandbox.MINIAPP_auditV2EnsureJournal_ = () => { order.push('journal'); };
  sandbox.MINIAPP_auditV2EnsureIndex_ = () => { order.push('index'); };
  sandbox.MINIAPP_auditV2BuildSnapshot_ = () => {
    order.push('snapshot');
    return { records: {}, counts: { participants: 1, teams: 0 } };
  };
  sandbox.MINIAPP_auditV2ReplaceBaseline_ = () => { order.push('baseline'); };
  sandbox.SpreadsheetApp.flush = () => { order.push('flush'); };
  sandbox.MINIAPP_auditV2StorageSecurity_ = () => {
    order.push('security');
    return {
      ok: true,
      journalHidden: true, journalProtected: true,
      indexHidden: true, indexProtected: true,
      baselineHidden: true, baselineProtected: true
    };
  };
  sandbox.PropertiesService.getScriptProperties = () => ({
    getProperty: key => properties.get(String(key)) || null,
    setProperty(key, value) {
      order.push('enable');
      properties.set(String(key), String(value));
      return this;
    },
    deleteProperty(key) {
      order.push('disable');
      properties.delete(String(key));
      return this;
    }
  });

  const result = sandbox.MINIAPP_auditV2Activate();
  assert.equal(result.ok, true);
  assert.equal(result.active, true);
  assert.deepEqual(order, [
    'disable', 'journal', 'index', 'snapshot', 'baseline',
    'flush', 'security', 'enable'
  ]);
  assert.equal(
    properties.get('MINIAPP_AUDIT_V2_ACTIVE'),
    'audit-v2:0.6.0-audit.4:schema-2:epoch-1'
  );
  assert.deepEqual(lockCounts(), { lockGets: 1, tryLocks: 1, releases: 1 });
});

test('activation fails closed when an audit sheet is visible or unprotected', async t => {
  async function verifyFailure(mode, sheetName, expectedField) {
    const { sandbox, ss, properties } = createSandbox();
    const base = ss.insertSheet('База участников');
    base.setCell(2, 1, 'Тестовый участник');
    base.setCell(2, 4, '123456789');
    base.setCell(2, 32, 'В чате');
    const realInsertSheet = ss.insertSheet.bind(ss);
    ss.insertSheet = name => {
      const sheet = realInsertSheet(name);
      if (name === sheetName && mode === 'visible') {
        sheet.hideSheet = () => { throw new Error('simulated hide failure'); };
      }
      if (name === sheetName && mode === 'unprotected') {
        sheet.protect = () => { throw new Error('simulated protection failure'); };
      }
      return sheet;
    };

    const result = sandbox.MINIAPP_auditV2Activate();
    assert.equal(result.ok, false);
    assert.equal(result.active, false);
    assert.equal(result.error, 'AUDIT_STORAGE_SECURITY_NOT_READY');
    assert.equal(result[expectedField], false);
    assert.equal(properties.has('MINIAPP_AUDIT_V2_ACTIVE'), false);
    assert.equal(sandbox.MINIAPP_auditV2IsActive_(), false);
    const status = sandbox.MINIAPP_auditV2Status();
    assert.equal(status.ok, false);
    assert.equal(status.storageSecurityReady, false);
    assert.equal(status[expectedField], false);
  }

  await t.test('visible journal', () =>
    verifyFailure('visible', 'Админ журнал', 'journalHidden'));
  await t.test('unprotected baseline', () =>
    verifyFailure('unprotected', 'Админ аудит baseline', 'baselineProtected'));
});

test('failed empty activation clears a previously matching token and stays disabled', () => {
  const { sandbox, properties } = createSandbox();
  sandbox.MINIAPP_auditV2PrepareStorage_ = () => ({
    records: {}, counts: { participants: 0, teams: 0 }
  });
  const result = sandbox.MINIAPP_auditV2Activate();
  assert.equal(result.ok, false);
  assert.equal(result.error, 'AUDIT_BASELINE_EMPTY');
  assert.equal(properties.has('MINIAPP_AUDIT_V2_ACTIVE'), false);
  assert.equal(sandbox.MINIAPP_auditV2IsActive_(), false);
});

test('disabled Mini App v2 facade falls through to the legacy A:L append', () => {
  const { sandbox, ss, properties } = createSandbox();
  properties.delete('MINIAPP_AUDIT_V2_ACTIVE');
  const hardenedSource = fs.readFileSync(
    path.join(ROOT, 'apps-script-live', '31_MINIAPP_ADMIN_WRITE_HARDENED.js'),
    'utf8'
  );
  vm.runInContext(hardenedSource, sandbox, {
    filename: '31_MINIAPP_ADMIN_WRITE_HARDENED.js'
  });
  let legacyRow = null;
  const legacySheet = {
    appendRow(row) { legacyRow = row; },
    getLastRow() { return 2; },
    getRange() { return { setNumberFormat() { return this; } }; }
  };
  sandbox.MINIAPP_adminWriteEnsureJournal_ = () => legacySheet;
  const { before, after } = participantBeforeAfter();
  sandbox.MINIAPP_adminWriteHardenedAppendJournal_({
    ss,
    lockAlreadyHeld: true,
    requestId: 'legacy-during-rollout',
    adminId: '999999999',
    adminUsername: '@admin_test',
    op: 'updateParticipant'
  }, 'participant', '123456789', 3, before, after, {});

  assert.ok(legacyRow);
  assert.equal(legacyRow.length, 12);
  assert.equal(legacyRow[1], 'legacy-during-rollout');
  assert.equal(legacyRow[4], 'updateParticipant');
  assert.equal(ss.getSheetByName('Админ аудит индекс'), null);
});

test('reconcile owns one lock and child appends do not tryLock again', () => {
  const { sandbox, ss, lockCounts } = createSandbox();
  sandbox.MINIAPP_auditV2LoadBaseline_ = () => ({
    initialized: true,
    records: {
      'participant\n123456789': {
        entityType: 'participant', entityKey: '123456789', row: 3,
        fingerprint: 'before-fingerprint', record: participantBeforeAfter().before
      }
    }
  });
  sandbox.MINIAPP_auditV2BuildSnapshot_ = () => ({
    counts: { participants: 1, teams: 0 },
    records: {
      'participant\n123456789': {
        entityType: 'participant', entityKey: '123456789', row: 3,
        fingerprint: 'after-fingerprint', record: participantBeforeAfter().after
      }
    }
  });
  sandbox.MINIAPP_auditV2ReplaceBaseline_ = () => {};

  const result = sandbox.MINIAPP_auditV2Reconcile_(ss, {
    source: { type: 'bot', channel: 'test-webhook', label: 'Бот' },
    actor: { type: 'service', label: 'Бот' },
    transactionId: 'bot-event-1'
  });
  assert.equal(result.ok, true);
  assert.equal(result.events, 1);
  assert.deepEqual(lockCounts(), { lockGets: 1, tryLocks: 1, releases: 1 });
  const journal = ss.getSheetByName('Админ журнал');
  assert.equal(JSON.parse(journal.getRange(2, 17).getValues()[0][0]).type, 'bot');
});

test('no-diff reconcile does not rewrite the protected baseline', () => {
  const { sandbox, ss, lockCounts } = createSandbox();
  const record = participantBeforeAfter().after;
  const entry = {
    entityType: 'participant', entityKey: '123456789', row: 3,
    fingerprint: 'same-fingerprint', record
  };
  sandbox.MINIAPP_auditV2LoadBaseline_ = () => ({
    initialized: true,
    records: { 'participant\n123456789': entry }
  });
  sandbox.MINIAPP_auditV2BuildSnapshot_ = () => ({
    counts: { participants: 1, teams: 0 },
    records: { 'participant\n123456789': { ...entry } }
  });
  let baselineWrites = 0;
  sandbox.MINIAPP_auditV2ReplaceBaseline_ = () => { baselineWrites += 1; };

  const result = sandbox.MINIAPP_auditV2Reconcile_(ss, {
    source: { type: 'manual_sheet', channel: 'test-edit', label: 'Google Sheets' },
    transactionId: 'manual-no-diff'
  });
  assert.equal(result.ok, true);
  assert.equal(result.events, 0);
  assert.equal(result.baselineUpdated, false);
  assert.equal(baselineWrites, 0);
  assert.deepEqual(lockCounts(), { lockGets: 1, tryLocks: 1, releases: 1 });
  assert.equal(ss.getSheetByName('Админ журнал'), null);
});

test('successful reconcile uses target repair and never invokes destructive full baseline replace', () => {
  const { sandbox, ss } = createSandbox();
  const base = ss.insertSheet('База участников');
  base.setCell(2, 1, 'Тестовый участник');
  base.setCell(2, 4, '123456789');
  base.setCell(2, 11, 'Команда — РМ');
  base.setCell(2, 12, 'Ник');
  base.setCell(2, 13, 'Помощник');
  base.setCell(2, 25, 'Royal Match');
  base.setCell(2, 32, 'В чате');

  const current = sandbox.MINIAPP_auditV2BuildSnapshot_(ss)
    .records['participant\n123456789'];
  const before = JSON.parse(JSON.stringify(current.record));
  before.memberships[0].role = 'Игрок';
  seedBaseline(
    sandbox,
    ss,
    sandbox.MINIAPP_auditV2BaselineEntry_(
      'participant', '123456789', 2, before
    )
  );
  sandbox.MINIAPP_auditV2ReplaceBaseline_ = () => {
    throw new Error('full baseline replace must not run after child commits');
  };

  const result = sandbox.MINIAPP_auditV2Reconcile_(ss, {
    source: { type: 'manual_sheet', channel: 'test-edit', label: 'Google Sheets' },
    actor: { type: 'google_user', label: 'editor@example.test' },
    transactionId: 'target-repair-only'
  });
  assert.equal(result.ok, true);
  assert.equal(result.events, 1);
  assert.equal(result.baselineUpdated, true);
  assert.equal(result.results[0].baselineRepair.repaired, true);
  const baseline = sandbox.MINIAPP_auditV2LoadBaseline_(ss);
  assert.equal(
    baseline.records['participant\n123456789'].record.memberships[0].role,
    'Помощник'
  );
});

test('manual team rename on one source row is one semantic update, not delete plus create', () => {
  const { sandbox, ss } = createSandbox();
  const before = {
    row: 9, game: 'Royal Match', name: 'Старая команда',
    leader: 'Лидер', photoState: 'present'
  };
  const after = {
    row: 9, game: 'Royal Match', name: 'Новая команда',
    leader: 'Лидер', photoState: 'present'
  };
  sandbox.MINIAPP_auditV2LoadBaseline_ = () => ({
    initialized: true,
    records: {
      'team\nRoyal Match :: Старая команда': {
        entityType: 'team', entityKey: 'Royal Match :: Старая команда', row: 9,
        fingerprint: 'old-fingerprint', record: before
      }
    }
  });
  sandbox.MINIAPP_auditV2BuildSnapshot_ = () => ({
    counts: { participants: 0, teams: 1 },
    records: {
      'team\nRoyal Match :: Новая команда': {
        entityType: 'team', entityKey: 'Royal Match :: Новая команда', row: 9,
        fingerprint: 'new-fingerprint', record: after
      }
    }
  });
  let baselineWrites = 0;
  sandbox.MINIAPP_auditV2ReplaceBaseline_ = () => { baselineWrites += 1; };

  const result = sandbox.MINIAPP_auditV2Reconcile_(ss, {
    source: { type: 'manual_sheet', channel: 'test-edit', label: 'Google Sheets' },
    transactionId: 'manual-team-rename'
  });
  assert.equal(result.ok, true);
  assert.equal(result.events, 1);
  assert.equal(result.baselineUpdated, true);
  assert.equal(baselineWrites, 0);

  const journal = ss.getSheetByName('Админ журнал');
  const row = journal.getRange(2, 1, 1, 25).getValues()[0];
  assert.equal(row[4], 'updateTeam');
  assert.equal(row[6], 'Royal Match :: Новая команда');
  const diff = JSON.parse(row[19]);
  assert.equal(diff.length, 1);
  assert.equal(diff[0].field, 'name');
  assert.equal(diff[0].before, 'Старая команда');
  assert.equal(diff[0].after, 'Новая команда');
  const metadata = JSON.parse(row[24]);
  assert.equal(metadata.identityChange.kind, 'team_rename');
  assert.equal(metadata.identityChange.previousEntityKey, 'Royal Match :: Старая команда');
});

test('manual team rename remains one update after stable game ordering moves its row', () => {
  const { sandbox, ss } = createSandbox();
  const before = {
    row: 19, game: 'Royal Kingdom', name: 'Старая команда',
    leader: 'Лидер', photoState: 'present'
  };
  const after = {
    row: 27, game: 'Royal Kingdom', name: 'Новая команда',
    leader: 'Лидер', photoState: 'present'
  };
  sandbox.MINIAPP_auditV2LoadBaseline_ = () => ({
    initialized: true,
    records: {
      'team\nRoyal Kingdom :: Старая команда': {
        entityType: 'team', entityKey: 'Royal Kingdom :: Старая команда', row: 19,
        fingerprint: 'old-fingerprint', record: before
      }
    }
  });
  sandbox.MINIAPP_auditV2BuildSnapshot_ = () => ({
    counts: { participants: 0, teams: 1 },
    records: {
      'team\nRoyal Kingdom :: Новая команда': {
        entityType: 'team', entityKey: 'Royal Kingdom :: Новая команда', row: 27,
        fingerprint: 'new-fingerprint', record: after
      }
    }
  });
  sandbox.MINIAPP_auditV2ReplaceBaseline_ = () => {};

  const result = sandbox.MINIAPP_auditV2Reconcile_(ss, {
    source: { type: 'manual_sheet', channel: 'test-edit', label: 'Google Sheets' },
    transactionId: 'manual-team-rename-after-sort'
  });
  assert.equal(result.ok, true);
  assert.equal(result.events, 1);

  const row = ss.getSheetByName('Админ журнал').getRange(2, 1, 1, 25).getValues()[0];
  assert.equal(row[4], 'updateTeam');
  assert.equal(row[6], 'Royal Kingdom :: Новая команда');
  const metadata = JSON.parse(row[24]);
  assert.equal(metadata.identityChange.kind, 'team_rename_after_sort');
  assert.equal(metadata.identityChange.sourceRowBefore, 19);
  assert.equal(metadata.identityChange.sourceRowAfter, 27);
  assert.equal(metadata.identityChange.pairing, 'unique_game_non_identity_signature');
});

test('rename-after-sort fallback refuses ambiguous same-game signatures', () => {
  const { sandbox } = createSandbox();
  function entry(key, row) {
    return {
      entityType: 'team', entityKey: key, row, fingerprint: `${key}-fp`,
      record: {
        row, game: 'Royal Match', name: key.split(' :: ')[1],
        leader: '', photoState: 'absent'
      }
    };
  }
  const baseline = {
    'team\nRoyal Match :: Старая A': entry('Royal Match :: Старая A', 10),
    'team\nRoyal Match :: Старая B': entry('Royal Match :: Старая B', 11)
  };
  const current = {
    'team\nRoyal Match :: Новая A': entry('Royal Match :: Новая A', 20),
    'team\nRoyal Match :: Новая B': entry('Royal Match :: Новая B', 21)
  };
  const items = sandbox.MINIAPP_auditV2ReconcileItems_(
    baseline,
    current,
    [...Object.keys(baseline), ...Object.keys(current)]
  );
  assert.equal(items.length, 4);
  assert.equal(items.filter(item => item.identityChange).length, 0);
});

test('failed reconcile append never advances the full baseline', () => {
  const { sandbox, ss } = createSandbox();
  sandbox.MINIAPP_auditV2LoadBaseline_ = () => ({
    initialized: true,
    records: {
      'participant\n123456789': {
        entityType: 'participant', entityKey: '123456789', row: 3,
        fingerprint: 'before-fingerprint', record: participantBeforeAfter().before
      }
    }
  });
  sandbox.MINIAPP_auditV2BuildSnapshot_ = () => ({
    counts: { participants: 1, teams: 0 },
    records: {
      'participant\n123456789': {
        entityType: 'participant', entityKey: '123456789', row: 3,
        fingerprint: 'after-fingerprint', record: participantBeforeAfter().after
      }
    }
  });
  sandbox.MINIAPP_auditV2Append_ = () => ({ ok: false, error: 'FORCED_FAILURE' });
  let baselineWrites = 0;
  sandbox.MINIAPP_auditV2ReplaceBaseline_ = () => { baselineWrites += 1; };

  const result = sandbox.MINIAPP_auditV2Reconcile_(ss, {
    source: { type: 'system', channel: 'test-failure', label: 'Система' },
    transactionId: 'failed-reconcile'
  });
  assert.equal(result.ok, false);
  assert.equal(result.events, 1);
  assert.equal(result.baselineUpdated, false);
  assert.equal(baselineWrites, 0);
});

test('source integration is explicit for six Mini App ops, manual edits and system media', () => {
  const write29 = fs.readFileSync(path.join(ROOT, 'apps-script-live', '29_MINIAPP_ADMIN_WRITE.js'), 'utf8');
  const write30 = fs.readFileSync(path.join(ROOT, 'apps-script-live', '30_MINIAPP_ADMIN_WRITE_BACKEND.js'), 'utf8');
  const write31 = fs.readFileSync(path.join(ROOT, 'apps-script-live', '31_MINIAPP_ADMIN_WRITE_HARDENED.js'), 'utf8');
  const write33 = fs.readFileSync(path.join(ROOT, 'apps-script-live', '33_MINIAPP_ADMIN_WRITE_FINAL.js'), 'utf8');
  const sync02 = fs.readFileSync(path.join(ROOT, 'apps-script-live', '02_PUBLIC_SYNC_V4.js'), 'utf8');
  const roles07 = fs.readFileSync(path.join(ROOT, 'apps-script-live', '07_FINAL_ROLE_FIX.js'), 'utf8');
  const media17 = fs.readFileSync(path.join(ROOT, 'apps-script-live', '17_MINIAPP_PERSISTENT_MEDIA.js'), 'utf8');
  const unified25 = fs.readFileSync(path.join(ROOT, 'apps-script-live', '25_MINIAPP_UNIFIED_SNAPSHOT.js'), 'utf8');
  const core01 = fs.readFileSync(path.join(ROOT, 'apps-script-live', '01_CORE_MAIN.js'), 'utf8');

  assert.match(write29, /MINIAPP_adminWriteAppendJournal_[\s\S]*MINIAPP_auditV2RecordMiniAppMutation_/);
  assert.match(write31, /MINIAPP_adminWriteHardenedAppendJournal_[\s\S]*MINIAPP_auditV2RecordMiniAppMutation_/);
  const dispatch = functionSource(write33, 'MINIAPP_adminWriteFinalDispatch_');
  assert.match(dispatch, /updateParticipant'\) return MINIAPP_adminWriteHardenedUpdateParticipant_/);
  assert.match(dispatch, /createParticipant'\) return MINIAPP_adminWriteHardenedCreateParticipant_/);
  assert.match(dispatch, /deleteParticipant'\) return MINIAPP_adminWriteFinalDeleteParticipant_/);
  assert.match(dispatch, /updateTeam'\) return MINIAPP_adminWriteFinalUpdateTeam_/);
  assert.match(dispatch, /createTeam'\) return MINIAPP_adminWriteFinalCreateTeam_/);
  assert.match(dispatch, /deleteTeam'\) return MINIAPP_adminWriteFinalDeleteTeam_/);
  [
    [write31, 'MINIAPP_adminWriteHardenedUpdateParticipant_'],
    [write31, 'MINIAPP_adminWriteHardenedCreateParticipant_'],
    [write33, 'MINIAPP_adminWriteFinalDeleteParticipant_'],
    [write33, 'MINIAPP_adminWriteFinalUpdateTeam_'],
    [write33, 'MINIAPP_adminWriteFinalCreateTeam_'],
    [write33, 'MINIAPP_adminWriteFinalDeleteTeam_']
  ].forEach(([source, name]) => {
    assert.match(
      functionSource(source, name),
      /MINIAPP_adminWriteHardenedAppendJournal_/,
      `${name} must invoke the v2-delegating journal wrapper`
    );
  });
  assert.match(sync02, /handlePublicSyncEdit[\s\S]*MINIAPP_auditV2HandleManualEdit_/);
  assert.match(roles07, /finalRoleInstalledOnEdit_[\s\S]*MINIAPP_auditV2Reconcile_/);
  assert.match(media17, /MINIAPP_auditV2RecordTeamMediaOutcome_[\s\S]*MINIAPP_auditV2RecordSystemMutation_/);
  assert.match(unified25, /MINIAPP_auditV2Reconcile_[\s\S]*unified-snapshot-repair/);
  assert.match(core01, /processWebhookImmediately_[\s\S]*MINIAPP_auditV2Reconcile_[\s\S]*type: 'bot', channel: 'chatkeeper-webhook'/);
  assert.match(core01, /weeklyRoyalCrmMaintenance[\s\S]*channel: 'weekly-maintenance'/);
  const structuralHook = functionSource(core01, 'handleSpreadsheetChange');
  assert.match(structuralHook, /type: 'manual_sheet', channel: 'spreadsheet-structural-change'/);
  assert.match(structuralHook, /actor: MINIAPP_auditV2SheetActor_\(e\)/);
  assert.match(auditSource, /function MINIAPP_auditV2RecordBotMutation_/);
  assert.match(auditSource, /function MINIAPP_auditV2BootstrapBaseline/);
  assert.match(auditSource, /function MINIAPP_auditV2Activate/);
  assert.match(auditSource, /function MINIAPP_auditV2Deactivate/);
  assert.match(auditSource, /function MINIAPP_auditV2Status/);
  assert.match(write30, /AUDIT_V2_ACTIVATE_MISSING/);
  assert.match(write30, /AUDIT_V2_DEACTIVATE_MISSING/);
  assert.match(write30, /AUDIT_V2_STATUS_MISSING/);
  assert.match(write30, /AUDIT_V2_JOURNAL_NOT_HIDDEN/);
  assert.match(write30, /AUDIT_V2_JOURNAL_NOT_PROTECTED/);
  assert.match(write30, /AUDIT_V2_INDEX_NOT_HIDDEN/);
  assert.match(write30, /AUDIT_V2_INDEX_NOT_PROTECTED/);
  assert.match(write30, /AUDIT_V2_BASELINE_NOT_HIDDEN/);
  assert.match(write30, /AUDIT_V2_BASELINE_NOT_PROTECTED/);
});
