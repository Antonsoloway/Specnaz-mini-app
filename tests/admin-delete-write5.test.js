const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'apps-script-live', '33_MINIAPP_ADMIN_WRITE_FINAL.js'),
  'utf8'
);

function createSandbox(options = {}) {
  const journal = [];
  const clears = [];
  const participant = options.participant || {
    telegramId: '123456789',
    name: 'Test',
    chatState: 'Вышел'
  };
  const teamRow = options.teamRow || [
    'Royal Match', 'Test Team', '', '', '0', '0', '0', '0', '0', '0', '0', 'Неактивен'
  ];

  const baseSheet = {
    getRangeList(ranges) {
      return { clearContent() { clears.push({ type: 'participant', ranges: [...ranges] }); } };
    },
    getRange() {
      return { getDisplayValues() { return []; } };
    },
    getMaxRows() { return 999; }
  };
  const teamSheet = {
    getRange(row, column, rows, columns) {
      if (column === 1 && columns === 12) {
        return { getDisplayValues() { return [[...teamRow]]; } };
      }
      if (column === 1 && columns === 4) {
        return { clearContent() { clears.push({ type: 'team', row, column, rows, columns }); } };
      }
      throw new Error(`unexpected team range ${row},${column},${rows},${columns}`);
    }
  };
  const ss = {
    getSheetByName(name) {
      if (name === 'База участников') return baseSheet;
      if (name === 'Команды') return teamSheet;
      return null;
    }
  };

  const sandbox = {
    console,
    SHEET_BASE: 'База участников',
    SHEET_TEAMS: 'Команды',
    BASE_FIRST_ROW: 2,
    BASE_LAST_ROW: 999,
    COL_CHAT_STATE: 32,
    SLOT_DEFS: [],
    SpreadsheetApp: { flush() {} },
    MINIAPP_adminWriteTelegramId_: value => /^\d+$/.test(String(value || '')) ? String(value) : '',
    MINIAPP_adminWriteFindParticipantRow_: () => 17,
    MINIAPP_adminWriteHardenedParticipantRecord_: () => ({ ...participant }),
    MINIAPP_adminWriteHardenedParticipantRevision_: () => 'participant-rev',
    MINIAPP_adminWriteHardenedTeamName_: value => String(value || '').trim(),
    MINIAPP_adminWriteCanonicalGame_: value => String(value || '').includes('Kingdom') ? 'Royal Kingdom' : String(value || '').includes('Match') ? 'Royal Match' : '',
    MINIAPP_adminWriteFindTeamRow_: () => 23,
    MINIAPP_adminWriteTeamRevision_: () => 'team-rev',
    MINIAPP_adminWriteValue_: value => value == null ? '' : String(value).trim(),
    MINIAPP_adminWriteNormTeam_: value => String(value || '').trim().toLowerCase(),
    MINIAPP_adminWriteNumberOrText_: value => {
      const number = Number(value);
      return Number.isFinite(number) ? number : String(value || '');
    },
    MINIAPP_adminWriteError_: (error, message) => ({ ok: false, error, message }),
    MINIAPP_adminWriteConflict_: (error, message, currentRevision) => ({ ok: false, error, message, conflict: true, currentRevision }),
    MINIAPP_adminWriteHardenedAppendJournal_: (...args) => journal.push(args),
    MINIAPP_adminWriteRefreshParticipantLinks_: () => {},
    sortBaseByChatState_: () => {},
    rebuildCounterSnapshot_: () => {},
    finalRoleNormalizeTeamsOrder_: () => {},
    MINIAPP_adminTeamPhotoCleanupOldIdentity_: () => ({ ok: true, changed: true }),
    markPublicSyncPending_: () => {}
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: '33_MINIAPP_ADMIN_WRITE_FINAL.js' });
  sandbox.MINIAPP_adminWriteFinalCountTeamMemberships_ = () => Number(options.membershipRefs || 0);
  return { sandbox, ss, journal, clears };
}

test('participant delete is rejected unless AF is Вышел', () => {
  const { sandbox, ss, clears } = createSandbox({
    participant: { telegramId: '123456789', name: 'Test', chatState: 'В чате' }
  });
  const result = sandbox.MINIAPP_adminWriteFinalDeleteParticipant_({
    ss,
    op: 'deleteParticipant',
    requestId: 'request_12345678901234567890',
    payload: { telegramId: '123456789', expectedRevision: 'participant-rev' }
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'PARTICIPANT_DELETE_NOT_ALLOWED');
  assert.equal(clears.length, 0);
});

test('participant delete clears source ranges but preserves T and W:AA formulas', () => {
  const { sandbox, ss, clears, journal } = createSandbox();
  const result = sandbox.MINIAPP_adminWriteFinalDeleteParticipant_({
    ss,
    adminId: '999999999',
    op: 'deleteParticipant',
    requestId: 'request_12345678901234567890',
    payload: { telegramId: '123456789', expectedRevision: 'participant-rev' }
  });
  assert.equal(result.ok, true);
  assert.equal(result.deleted, true);
  assert.deepEqual(clears[0].ranges, ['A17:S17', 'U17:V17', 'AB17:AF17']);
  assert.equal(journal.length, 1);
});

test('team delete is rejected unless status is Неактивен and E is zero', () => {
  const active = createSandbox({
    teamRow: ['Royal Match', 'Test Team', '', '', '0', '0', '0', '0', '0', '0', '0', 'Активен']
  });
  const activeResult = active.sandbox.MINIAPP_adminWriteFinalDeleteTeam_({
    ss: active.ss,
    op: 'deleteTeam',
    requestId: 'request_12345678901234567890',
    payload: { name: 'Test Team', game: 'Royal Match', expectedRevision: 'team-rev' }
  });
  assert.equal(activeResult.error, 'TEAM_DELETE_STATUS_NOT_ALLOWED');
  assert.equal(active.clears.length, 0);

  const occupied = createSandbox({
    teamRow: ['Royal Match', 'Test Team', '', '', '1', '0', '0', '0', '0', '0', '0', 'Неактивен']
  });
  const occupiedResult = occupied.sandbox.MINIAPP_adminWriteFinalDeleteTeam_({
    ss: occupied.ss,
    op: 'deleteTeam',
    requestId: 'request_12345678901234567890',
    payload: { name: 'Test Team', game: 'Royal Match', expectedRevision: 'team-rev' }
  });
  assert.equal(occupiedResult.error, 'TEAM_DELETE_HAS_PARTICIPANTS');
  assert.equal(occupied.clears.length, 0);
});

test('team delete also rejects hidden live membership references', () => {
  const { sandbox, ss, clears } = createSandbox({ membershipRefs: 1 });
  const result = sandbox.MINIAPP_adminWriteFinalDeleteTeam_({
    ss,
    op: 'deleteTeam',
    requestId: 'request_12345678901234567890',
    payload: { name: 'Test Team', game: 'Royal Match', expectedRevision: 'team-rev' }
  });
  assert.equal(result.error, 'TEAM_DELETE_HAS_MEMBERSHIPS');
  assert.equal(clears.length, 0);
});

test('eligible team delete clears only A:D and journals the action', () => {
  const { sandbox, ss, clears, journal } = createSandbox();
  const result = sandbox.MINIAPP_adminWriteFinalDeleteTeam_({
    ss,
    adminId: '999999999',
    op: 'deleteTeam',
    requestId: 'request_12345678901234567890',
    payload: { name: 'Test Team', game: 'Royal Match', expectedRevision: 'team-rev' }
  });
  assert.equal(result.ok, true);
  assert.equal(result.deleted, true);
  assert.deepEqual(clears[0], { type: 'team', row: 23, column: 1, rows: 1, columns: 4 });
  assert.equal(journal.length, 1);
});

test('write.5 metadata advertises only the two guarded delete operations', () => {
  const { sandbox } = createSandbox();
  sandbox.MINIAPP_adminWriteHardenedMeta_ = () => ({
    enabled: true,
    operations: ['updateParticipant','createParticipant','updateTeam','createTeam']
  });
  const meta = sandbox.MINIAPP_adminWriteFinalMeta_();
  assert.equal(meta.version, '0.6.0-write.5');
  assert.equal(meta.deleteEnabled, true);
  assert(meta.operations.includes('deleteParticipant'));
  assert(meta.operations.includes('deleteTeam'));
  assert.deepEqual([...meta.writableParticipantFields], ['name','memberships']);
});
