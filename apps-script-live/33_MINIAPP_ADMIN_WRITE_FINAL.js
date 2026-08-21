/*
 * Royal CRM / Таблица ЧП
 * 33_MINIAPP_ADMIN_WRITE_FINAL.js
 * v0.6.0-write.5
 *
 * Final v0.6 admin-write dispatch.
 * - participant operations reuse the hardened write.3 implementation;
 * - team operations add transactional photo support from file 32;
 * - old private-media identity is cleaned after a successful rename;
 * - journal never stores base64 image payloads;
 * - destructive operations are server-gated and deliberately narrow:
 *   participant delete requires AF = «Вышел»;
 *   team delete requires L = «Неактивен», E = 0 and no live membership refs;
 * - deletion clears only source cells, preserving prepared rows/formula arrays;
 * - every delete is journalled before non-essential cleanup runs.
 */

var MINIAPP_ADMIN_WRITE_FINAL_VERSION = '0.6.0-write.5';

function MINIAPP_adminWriteFinalDispatch_(ctx) {
  if (!ctx || !ctx.op) return MINIAPP_adminWriteError_('OPERATION_MISSING', 'Не указана операция.');
  if (ctx.op === 'updateParticipant') return MINIAPP_adminWriteHardenedUpdateParticipant_(ctx);
  if (ctx.op === 'createParticipant') return MINIAPP_adminWriteHardenedCreateParticipant_(ctx);
  if (ctx.op === 'deleteParticipant') return MINIAPP_adminWriteFinalDeleteParticipant_(ctx);
  if (ctx.op === 'updateTeam') return MINIAPP_adminWriteFinalUpdateTeam_(ctx);
  if (ctx.op === 'createTeam') return MINIAPP_adminWriteFinalCreateTeam_(ctx);
  if (ctx.op === 'deleteTeam') return MINIAPP_adminWriteFinalDeleteTeam_(ctx);
  return MINIAPP_adminWriteError_('OPERATION_NOT_ALLOWED', 'Эта операция не разрешена в v0.6.');
}

function MINIAPP_adminWriteFinalUpdateTeam_(ctx) {
  var sheet = ctx.ss.getSheetByName(SHEET_TEAMS);
  if (!sheet) return MINIAPP_adminWriteError_('TEAMS_SHEET_MISSING', 'Не найден лист команд.');

  var originalName = MINIAPP_adminWriteHardenedTeamName_(ctx.payload && ctx.payload.name);
  var game = MINIAPP_adminWriteCanonicalGame_(ctx.payload && ctx.payload.game);
  if (!originalName || !game) {
    return MINIAPP_adminWriteError_('TEAM_IDENTITY_INVALID', 'Не удалось определить команду и игру.');
  }

  var row = MINIAPP_adminWriteFindTeamRow_(sheet, originalName, game);
  if (!row) return MINIAPP_adminWriteError_('TEAM_NOT_FOUND', 'Команда не найдена.');

  var before = MINIAPP_adminWriteTeamRecord_(sheet, row);
  var currentRevision = MINIAPP_adminWriteTeamRevision_(before);
  var expectedRevision = MINIAPP_adminWriteValue_(ctx.payload.expectedRevision);
  if (!expectedRevision || expectedRevision !== currentRevision) {
    return MINIAPP_adminWriteConflict_(
      'TEAM_CHANGED',
      'Карточка команды уже изменилась. Обновите данные и повторите.',
      currentRevision
    );
  }

  var changes = ctx.payload.changes && typeof ctx.payload.changes === 'object'
    ? ctx.payload.changes : {};
  var nextName = Object.prototype.hasOwnProperty.call(changes, 'name')
    ? MINIAPP_adminWriteHardenedTeamName_(changes.name)
    : originalName;
  var nextLeader = Object.prototype.hasOwnProperty.call(changes, 'leader')
    ? MINIAPP_adminWriteText_(changes.leader, 180)
    : before.leader;

  if (!nextName) return MINIAPP_adminWriteError_('TEAM_NAME_REQUIRED', 'Название команды не может быть пустым.');

  var duplicateRow = MINIAPP_adminWriteFindTeamRow_(sheet, nextName, game);
  if (duplicateRow && duplicateRow !== row) {
    return MINIAPP_adminWriteError_('TEAM_EXISTS', 'Команда с таким названием уже существует в этой игре.');
  }

  // PREPARE media BEFORE mutating the row. New image bytes are already durable
  // in the private media repo before the Sheet identity changes.
  var photoPrepared = { ok: true, changed: false };
  var photoInput = changes.photo;
  var hasNewPhoto = photoInput && typeof photoInput === 'object' && String(photoInput.data || '').trim();

  if (hasNewPhoto) {
    photoPrepared = MINIAPP_adminTeamPhotoPrepareUpload_(nextName, game, photoInput);
  } else if (nextName !== originalName) {
    photoPrepared = MINIAPP_adminTeamPhotoPrepareExistingForRename_(sheet, row, nextName, game);
  }
  if (!photoPrepared || photoPrepared.ok === false) return photoPrepared;

  // If a photo must change/migrate, write the new CellImage first. A failure here
  // leaves name/memberships untouched; media repo may contain only a harmless orphan.
  if (photoPrepared.changed) {
    var photoCellResult = MINIAPP_adminTeamPhotoApplyCell_(sheet, row, photoPrepared);
    if (!photoCellResult || photoCellResult.ok === false) return photoCellResult;
  }

  if (nextName !== originalName) {
    sheet.getRange(row, 2).setValue(nextName);
    if (typeof finalRoleCascadeTeamRename_ === 'function') {
      finalRoleCascadeTeamRename_(ctx.ss, game, originalName, nextName);
    }
  }
  if (nextLeader !== before.leader) {
    MINIAPP_adminWriteHardenedSetTeamLeader_(sheet, row, nextLeader);
  }

  if (typeof finalRoleRepairDecoratedTeamMemberships_ === 'function') {
    finalRoleRepairDecoratedTeamMemberships_(ctx.ss, {
      skipMark: true,
      source: 'miniapp_admin_write_final'
    });
  }
  if (typeof finalRoleNormalizeTeamsOrder_ === 'function') {
    finalRoleNormalizeTeamsOrder_(sheet);
  }

  SpreadsheetApp.flush();
  var finalRow = MINIAPP_adminWriteFindTeamRow_(sheet, nextName, game) || row;
  MINIAPP_adminTeamPhotoMarkDirty_(finalRow);

  var oldMediaCleanup = { ok: true, changed: false };
  if (nextName !== originalName && typeof MINIAPP_adminTeamPhotoCleanupOldIdentity_ === 'function') {
    oldMediaCleanup = MINIAPP_adminTeamPhotoCleanupOldIdentity_(
      originalName,
      game,
      photoPrepared && photoPrepared.stableHash
    ) || oldMediaCleanup;
  }

  if (typeof markPublicSyncPending_ === 'function') {
    markPublicSyncPending_('miniapp_admin_team_final:' + game + ':' + nextName);
  }

  var after = MINIAPP_adminWriteFinalTeamState_(sheet, finalRow);
  if (photoPrepared.changed && photoPrepared.sourceUrl) after.photoUrl = photoPrepared.sourceUrl;
  var key = game + ' :: ' + nextName;
  var journalChanges = {
    name: nextName,
    leader: nextLeader
  };
  var photoSummary = MINIAPP_adminTeamPhotoSummary_(photoPrepared);
  if (photoSummary) journalChanges.photo = photoSummary;
  if (oldMediaCleanup && oldMediaCleanup.warning) {
    journalChanges.mediaCleanupWarning = oldMediaCleanup.warning;
  }

  MINIAPP_adminWriteHardenedAppendJournal_(
    ctx,
    'team',
    key,
    finalRow,
    before,
    after,
    journalChanges
  );
  var revision = MINIAPP_adminWriteTeamRevision_(after);
  after.revision = revision;

  return {
    ok: true,
    requestId: ctx.requestId,
    op: ctx.op,
    entityType: 'team',
    entityKey: key,
    previousEntityKey: game + ' :: ' + originalName,
    row: finalRow,
    revision: revision,
    record: after,
    photoChanged: !!photoPrepared.changed,
    oldMediaCleanup: oldMediaCleanup && oldMediaCleanup.warning
      ? { ok: false, warning: oldMediaCleanup.warning }
      : { ok: true },
    message: photoPrepared.changed ? 'Команда и фото обновлены.' : 'Команда обновлена.'
  };
}

function MINIAPP_adminWriteFinalCreateTeam_(ctx) {
  var sheet = ctx.ss.getSheetByName(SHEET_TEAMS);
  if (!sheet) return MINIAPP_adminWriteError_('TEAMS_SHEET_MISSING', 'Не найден лист команд.');

  var game = MINIAPP_adminWriteCanonicalGame_(ctx.payload && ctx.payload.game);
  var name = MINIAPP_adminWriteHardenedTeamName_(ctx.payload && ctx.payload.name);
  var leader = MINIAPP_adminWriteText_(ctx.payload && ctx.payload.leader, 180);
  if (!game) return MINIAPP_adminWriteError_('TEAM_GAME_REQUIRED', 'Выберите Royal Match или Royal Kingdom.');
  if (!name) return MINIAPP_adminWriteError_('TEAM_NAME_REQUIRED', 'Введите название команды.');
  if (MINIAPP_adminWriteFindTeamRow_(sheet, name, game)) {
    return MINIAPP_adminWriteError_('TEAM_EXISTS', 'Такая команда уже существует в этой игре.');
  }

  var row = MINIAPP_adminWriteFindEmptyTeamRow_(sheet);
  if (!row) return MINIAPP_adminWriteError_('TEAMS_FULL', 'На листе команд нет свободной подготовленной строки.');
  var before = { row: row, empty: true };

  var photoPrepared = MINIAPP_adminTeamPhotoPrepareUpload_(
    name,
    game,
    ctx.payload && ctx.payload.photo
  );
  if (!photoPrepared || photoPrepared.ok === false) return photoPrepared;

  // A:D are source fields. If CellImage assignment fails we clean those source
  // cells again, so a half-created team is never left behind.
  try {
    sheet.getRange(row, 1).setValue(game);
    sheet.getRange(row, 2).setValue(name);
    if (leader) MINIAPP_adminWriteHardenedSetTeamLeader_(sheet, row, leader);

    if (photoPrepared.changed) {
      var photoCellResult = MINIAPP_adminTeamPhotoApplyCell_(sheet, row, photoPrepared);
      if (!photoCellResult || photoCellResult.ok === false) {
        sheet.getRange(row, 1, 1, 4).clearContent();
        SpreadsheetApp.flush();
        return photoCellResult;
      }
    }
  } catch (error) {
    try { sheet.getRange(row, 1, 1, 4).clearContent(); } catch (_) {}
    SpreadsheetApp.flush();
    console.error('Create team source row failed', error && error.stack ? error.stack : error);
    return MINIAPP_adminWriteError_('TEAM_CREATE_SHEET_FAILED', 'Не удалось записать новую команду. Строка очищена.');
  }

  if (typeof finalRoleNormalizeTeamsOrder_ === 'function') {
    finalRoleNormalizeTeamsOrder_(sheet);
  }
  SpreadsheetApp.flush();

  var finalRow = MINIAPP_adminWriteFindTeamRow_(sheet, name, game) || row;
  MINIAPP_adminTeamPhotoMarkDirty_(finalRow);
  if (typeof markPublicSyncPending_ === 'function') {
    markPublicSyncPending_('miniapp_admin_team_create_final:' + game + ':' + name);
  }

  var after = MINIAPP_adminWriteFinalTeamState_(sheet, finalRow);
  if (photoPrepared.changed && photoPrepared.sourceUrl) after.photoUrl = photoPrepared.sourceUrl;
  var key = game + ' :: ' + name;
  var journalChanges = {
    game: game,
    name: name,
    leader: leader
  };
  var photoSummary = MINIAPP_adminTeamPhotoSummary_(photoPrepared);
  if (photoSummary) journalChanges.photo = photoSummary;

  MINIAPP_adminWriteHardenedAppendJournal_(
    ctx,
    'team',
    key,
    finalRow,
    before,
    after,
    journalChanges
  );
  var revision = MINIAPP_adminWriteTeamRevision_(after);
  after.revision = revision;

  return {
    ok: true,
    requestId: ctx.requestId,
    op: ctx.op,
    entityType: 'team',
    entityKey: key,
    row: finalRow,
    revision: revision,
    record: after,
    photoChanged: !!photoPrepared.changed,
    message: photoPrepared.changed ? 'Команда с фото добавлена.' : 'Команда добавлена.'
  };
}

/**
 * Permanently removes a participant source record only after the live Sheet
 * confirms AF = «Вышел». T and W:AA are array-formula columns and are never
 * cleared directly. The stable sorter moves the resulting empty row to the
 * prepared empty area and restores formula anchors.
 */
function MINIAPP_adminWriteFinalDeleteParticipant_(ctx) {
  var sheet = ctx.ss.getSheetByName(SHEET_BASE);
  if (!sheet) return MINIAPP_adminWriteError_('BASE_SHEET_MISSING', 'Не найдена база участников.');

  var telegramId = MINIAPP_adminWriteTelegramId_(ctx.payload && ctx.payload.telegramId);
  if (!telegramId) return MINIAPP_adminWriteError_('TELEGRAM_ID_INVALID', 'Некорректный Telegram ID.');

  var row = MINIAPP_adminWriteFindParticipantRow_(sheet, telegramId);
  if (!row) return MINIAPP_adminWriteError_('PARTICIPANT_NOT_FOUND', 'Участник не найден.');

  var before = MINIAPP_adminWriteHardenedParticipantRecord_(sheet, row);
  var currentRevision = MINIAPP_adminWriteHardenedParticipantRevision_(before);
  var expectedRevision = MINIAPP_adminWriteValue_(ctx.payload && ctx.payload.expectedRevision);
  if (!expectedRevision || expectedRevision !== currentRevision) {
    return MINIAPP_adminWriteConflict_(
      'PARTICIPANT_CHANGED',
      'Карточка участника уже изменилась. Обновите данные и повторите.',
      currentRevision
    );
  }

  if (MINIAPP_adminWriteFinalLower_(before.chatState) !== 'вышел') {
    return MINIAPP_adminWriteError_(
      'PARTICIPANT_DELETE_NOT_ALLOWED',
      'Удалить можно только участника со статусом «Вышел».'
    );
  }

  try {
    sheet.getRangeList([
      'A' + row + ':S' + row,
      'U' + row + ':V' + row,
      'AB' + row + ':AF' + row
    ]).clearContent();
    SpreadsheetApp.flush();
  } catch (error) {
    console.error('Delete participant source row failed', error && error.stack ? error.stack : error);
    return MINIAPP_adminWriteError_(
      'PARTICIPANT_DELETE_SHEET_FAILED',
      'Не удалось удалить участника. Данные не изменены полностью; обновите админ-режим.'
    );
  }

  var after = { row: row, deleted: true };
  var maintenanceWarnings = [];

  // Persist idempotency immediately after the destructive Sheet commit.
  MINIAPP_adminWriteHardenedAppendJournal_(
    ctx,
    'participant',
    telegramId,
    row,
    before,
    after,
    {
      deleted: true,
      eligibility: { chatState: 'Вышел' },
      clearedSourceRanges: ['A:S', 'U:V', 'AB:AF']
    }
  );

  try {
    if (typeof sortBaseByChatState_ === 'function') sortBaseByChatState_(ctx.ss);
  } catch (sortError) {
    maintenanceWarnings.push('BASE_SORT_FAILED');
    console.warn('Participant delete base sort warning', sortError && sortError.message ? sortError.message : sortError);
    try {
      if (typeof restoreCoreFormulas_ === 'function') restoreCoreFormulas_(ctx.ss);
    } catch (_) {}
  }

  try {
    if (typeof rebuildCounterSnapshot_ === 'function') rebuildCounterSnapshot_(ctx.ss);
  } catch (snapshotError) {
    maintenanceWarnings.push('COUNTER_SNAPSHOT_REBUILD_FAILED');
    console.warn('Participant delete counter snapshot warning', snapshotError && snapshotError.message ? snapshotError.message : snapshotError);
  }

  try {
    MINIAPP_adminWriteRefreshParticipantLinks_(ctx.ss, {
      name: '', telegramName: '', username: ''
    });
  } catch (linksError) {
    maintenanceWarnings.push('PARTICIPANT_LINKS_REFRESH_FAILED');
  }

  if (typeof markPublicSyncPending_ === 'function') {
    try { markPublicSyncPending_('miniapp_admin_participant_delete:' + telegramId); }
    catch (_) { maintenanceWarnings.push('PUBLIC_SYNC_MARK_FAILED'); }
  }

  return {
    ok: true,
    requestId: ctx.requestId,
    op: ctx.op,
    entityType: 'participant',
    entityKey: telegramId,
    row: row,
    deleted: true,
    maintenanceWarnings: maintenanceWarnings,
    message: 'Участник удалён из админской таблицы.'
  };
}

/**
 * Permanently clears A:D of an empty inactive team. Formula columns E:L stay
 * untouched. In addition to E/L, the five live participant slots are scanned
 * under the same script lock so a stale formula can never permit deletion of
 * a referenced team.
 */
function MINIAPP_adminWriteFinalDeleteTeam_(ctx) {
  var sheet = ctx.ss.getSheetByName(SHEET_TEAMS);
  if (!sheet) return MINIAPP_adminWriteError_('TEAMS_SHEET_MISSING', 'Не найден лист команд.');

  var name = MINIAPP_adminWriteHardenedTeamName_(ctx.payload && ctx.payload.name);
  var game = MINIAPP_adminWriteCanonicalGame_(ctx.payload && ctx.payload.game);
  if (!name || !game) {
    return MINIAPP_adminWriteError_('TEAM_IDENTITY_INVALID', 'Не удалось определить команду и игру.');
  }

  var row = MINIAPP_adminWriteFindTeamRow_(sheet, name, game);
  if (!row) return MINIAPP_adminWriteError_('TEAM_NOT_FOUND', 'Команда не найдена.');

  SpreadsheetApp.flush();
  var before = MINIAPP_adminWriteFinalTeamState_(sheet, row);
  var currentRevision = MINIAPP_adminWriteTeamRevision_(before);
  var expectedRevision = MINIAPP_adminWriteValue_(ctx.payload && ctx.payload.expectedRevision);
  if (!expectedRevision || expectedRevision !== currentRevision) {
    return MINIAPP_adminWriteConflict_(
      'TEAM_CHANGED',
      'Карточка команды уже изменилась. Обновите данные и повторите.',
      currentRevision
    );
  }

  if (MINIAPP_adminWriteFinalLower_(before.status) !== 'неактивен') {
    return MINIAPP_adminWriteError_(
      'TEAM_DELETE_STATUS_NOT_ALLOWED',
      'Удалить можно только команду со статусом «Неактивен».'
    );
  }

  var players = MINIAPP_adminWriteFinalStrictNumber_(before.players);
  if (!isFinite(players) || players !== 0) {
    return MINIAPP_adminWriteError_(
      'TEAM_DELETE_HAS_PARTICIPANTS',
      'Удалить можно только команду, в которой 0 участников.'
    );
  }

  var membershipRefs = MINIAPP_adminWriteFinalCountTeamMemberships_(ctx.ss, name, game);
  if (membershipRefs < 0) {
    return MINIAPP_adminWriteError_(
      'TEAM_DELETE_MEMBERSHIP_CHECK_FAILED',
      'Не удалось безопасно проверить состав команды. Удаление отменено.'
    );
  }
  if (membershipRefs !== 0) {
    return MINIAPP_adminWriteError_(
      'TEAM_DELETE_HAS_MEMBERSHIPS',
      'Команда всё ещё указана у ' + membershipRefs + ' участник(а/ов). Удаление отменено.'
    );
  }

  try {
    // A:D are the only team source fields. E:L are formula arrays.
    sheet.getRange(row, 1, 1, 4).clearContent();
    SpreadsheetApp.flush();
  } catch (error) {
    console.error('Delete team source row failed', error && error.stack ? error.stack : error);
    return MINIAPP_adminWriteError_(
      'TEAM_DELETE_SHEET_FAILED',
      'Не удалось удалить команду. Обновите админ-режим и повторите.'
    );
  }

  var key = game + ' :: ' + name;
  var after = { row: row, deleted: true };
  var maintenanceWarnings = [];

  // Persist idempotency immediately after the destructive Sheet commit.
  MINIAPP_adminWriteHardenedAppendJournal_(
    ctx,
    'team',
    key,
    row,
    before,
    after,
    {
      deleted: true,
      eligibility: { status: 'Неактивен', players: 0, membershipRefs: 0 },
      clearedSourceRange: 'A:D'
    }
  );

  try {
    if (typeof finalRoleNormalizeTeamsOrder_ === 'function') finalRoleNormalizeTeamsOrder_(sheet);
  } catch (orderError) {
    maintenanceWarnings.push('TEAM_ORDER_NORMALIZE_FAILED');
    console.warn('Team delete order warning', orderError && orderError.message ? orderError.message : orderError);
  }
  SpreadsheetApp.flush();

  var mediaCleanup = { ok: true, changed: false };
  if (typeof MINIAPP_adminTeamPhotoCleanupOldIdentity_ === 'function') {
    mediaCleanup = MINIAPP_adminTeamPhotoCleanupOldIdentity_(name, game, '') || mediaCleanup;
    if (mediaCleanup.warning) maintenanceWarnings.push(mediaCleanup.warning);
  }

  if (typeof markPublicSyncPending_ === 'function') {
    try { markPublicSyncPending_('miniapp_admin_team_delete:' + game + ':' + name); }
    catch (_) { maintenanceWarnings.push('PUBLIC_SYNC_MARK_FAILED'); }
  }

  return {
    ok: true,
    requestId: ctx.requestId,
    op: ctx.op,
    entityType: 'team',
    entityKey: key,
    row: row,
    deleted: true,
    mediaCleanup: mediaCleanup,
    maintenanceWarnings: maintenanceWarnings,
    message: 'Команда удалена из админской таблицы.'
  };
}

function MINIAPP_adminWriteFinalTeamState_(sheet, row) {
  var values = sheet.getRange(row, 1, 1, 12).getDisplayValues()[0];
  return {
    row: row,
    game: MINIAPP_adminWriteCanonicalGame_(values[0]),
    name: MINIAPP_adminWriteValue_(values[1]),
    leader: MINIAPP_adminWriteValue_(values[3]),
    players: MINIAPP_adminWriteNumberOrText_(values[4]),
    specnazTrips: MINIAPP_adminWriteNumberOrText_(values[5]),
    sort: MINIAPP_adminWriteNumberOrText_(values[6]),
    screens: MINIAPP_adminWriteNumberOrText_(values[7]),
    activityBase: MINIAPP_adminWriteNumberOrText_(values[8]),
    activityOutside: MINIAPP_adminWriteNumberOrText_(values[9]),
    average: MINIAPP_adminWriteNumberOrText_(values[10]),
    status: MINIAPP_adminWriteValue_(values[11])
  };
}

function MINIAPP_adminWriteFinalCountTeamMemberships_(ss, teamName, game) {
  try {
    var base = ss.getSheetByName(SHEET_BASE);
    if (!base || typeof SLOT_DEFS === 'undefined' || !Array.isArray(SLOT_DEFS)) return -1;

    var firstRow = typeof BASE_FIRST_ROW !== 'undefined' ? Number(BASE_FIRST_ROW) : 2;
    var lastRow = typeof BASE_LAST_ROW !== 'undefined'
      ? Math.min(Number(BASE_LAST_ROW), base.getMaxRows())
      : base.getMaxRows();
    if (lastRow < firstRow) return 0;

    var chatStateColumn = typeof COL_CHAT_STATE !== 'undefined' ? Number(COL_CHAT_STATE) : 32;
    var width = Math.max(isFinite(chatStateColumn) ? chatStateColumn : 32, 32);
    var rows = base.getRange(firstRow, 1, lastRow - firstRow + 1, width).getDisplayValues();
    var wantedName = MINIAPP_adminWriteNormTeam_(teamName);
    var wantedGame = MINIAPP_adminWriteCanonicalGame_(game);
    var count = 0;

    rows.forEach(function(values) {
      SLOT_DEFS.forEach(function(slot) {
        var rawTeam = MINIAPP_adminWriteValue_(values[Number(slot.teamCol) - 1]);
        if (!rawTeam) return;

        var cleanTeam = typeof MINIAPP_snapshotStripGameSuffix_ === 'function'
          ? MINIAPP_snapshotStripGameSuffix_(rawTeam)
          : rawTeam.replace(/\s+—\s+(РМ|РК)$/u, '');
        if (MINIAPP_adminWriteNormTeam_(cleanTeam) !== wantedName) return;

        var rawGame = MINIAPP_adminWriteValue_(values[Number(slot.gameCol) - 1]);
        var cleanGame = typeof MINIAPP_snapshotCanonicalGame_ === 'function'
          ? MINIAPP_snapshotCanonicalGame_(rawGame, rawTeam)
          : MINIAPP_adminWriteCanonicalGame_(rawGame);
        if (!cleanGame) {
          if (/\s+—\s+РМ$/u.test(rawTeam)) cleanGame = 'Royal Match';
          else if (/\s+—\s+РК$/u.test(rawTeam)) cleanGame = 'Royal Kingdom';
        }
        if (MINIAPP_adminWriteCanonicalGame_(cleanGame) === wantedGame) count += 1;
      });
    });
    return count;
  } catch (error) {
    console.warn('Team delete membership scan warning', error && error.message ? error.message : error);
    return -1;
  }
}

function MINIAPP_adminWriteFinalStrictNumber_(value) {
  var text = MINIAPP_adminWriteValue_(value).replace(/\s+/g, '').replace(',', '.');
  if (!text || !/^-?\d+(?:\.\d+)?$/.test(text)) return NaN;
  var number = Number(text);
  return isFinite(number) ? number : NaN;
}

function MINIAPP_adminWriteFinalLower_(value) {
  return MINIAPP_adminWriteValue_(value).toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
}

function MINIAPP_adminWriteFinalMeta_() {
  var meta = typeof MINIAPP_adminWriteHardenedMeta_ === 'function'
    ? MINIAPP_adminWriteHardenedMeta_()
    : {};
  meta.version = MINIAPP_ADMIN_WRITE_FINAL_VERSION;
  meta.transport = 'worker-signed-hmac';
  meta.operations = [
    'updateParticipant', 'createParticipant', 'deleteParticipant',
    'updateTeam', 'createTeam', 'deleteTeam'
  ];
  meta.deleteEnabled = true;
  meta.deletePolicy = {
    participant: 'chatState=Вышел',
    team: 'status=Неактивен AND players=0 AND membershipRefs=0',
    rowMode: 'clear-source-cells-preserve-formulas'
  };
  meta.writableParticipantFields = ['name', 'memberships'];
  meta.membershipWrite = {
    atomic: true,
    mode: 'single-range-validation-safe',
    rollback: 'source-values-and-role-rules'
  };
  meta.writableTeamFields = ['name', 'leader', 'photo'];
  meta.createTeamFields = ['game', 'name', 'leader', 'photo'];
  meta.snapshotRefresh = {
    mode: typeof MINIAPP_queueAdminSnapshotRefresh_ === 'function'
      ? 'queued-private-trigger'
      : 'synchronous-compatibility-fallback',
    response: typeof MINIAPP_queueAdminSnapshotRefresh_ === 'function'
      ? 'commit-first'
      : 'snapshot-first',
    sourceLock: 'sheet-capture-only',
    fallback: 'unified-5-minute-trigger'
  };
  meta.teamPhoto = {
    enabled: typeof MINIAPP_adminTeamPhotoPrepareUpload_ === 'function',
    maxUploadBytes: typeof MINIAPP_ADMIN_TEAM_PHOTO_MAX_UPLOAD_BYTES !== 'undefined'
      ? MINIAPP_ADMIN_TEAM_PHOTO_MAX_UPLOAD_BYTES : 650000,
    storage: 'existing-private-team-media',
    sheetCell: 'CellImage',
    deleteEnabled: false,
    renameCleanup: typeof MINIAPP_adminTeamPhotoCleanupOldIdentity_ === 'function'
  };
  return meta;
}

function MINIAPP_adminWriteFinalDecorateRevisions_(participants, teams) {
  return MINIAPP_adminWriteHardenedDecorateRevisions_(participants, teams);
}

function MINIAPP_adminWriteFinalJournalData_() {
  var data = MINIAPP_adminWriteHardenedJournalData_();
  if (data && typeof data === 'object') data.version = MINIAPP_ADMIN_WRITE_FINAL_VERSION;
  return data;
}
