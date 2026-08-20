/*
 * Royal CRM / Таблица ЧП
 * 33_MINIAPP_ADMIN_WRITE_FINAL.js
 * v0.6.0-write.4
 *
 * Final v0.6 admin-write dispatch.
 * - participant operations reuse the hardened write.3 implementation;
 * - team operations add transactional photo support from file 32;
 * - old private-media identity is cleaned after a successful rename;
 * - journal never stores base64 image payloads;
 * - delete remains disabled.
 */

var MINIAPP_ADMIN_WRITE_FINAL_VERSION = '0.6.0-write.4';

function MINIAPP_adminWriteFinalDispatch_(ctx) {
  if (!ctx || !ctx.op) return MINIAPP_adminWriteError_('OPERATION_MISSING', 'Не указана операция.');
  if (ctx.op === 'updateParticipant') return MINIAPP_adminWriteHardenedUpdateParticipant_(ctx);
  if (ctx.op === 'createParticipant') return MINIAPP_adminWriteHardenedCreateParticipant_(ctx);
  if (ctx.op === 'updateTeam') return MINIAPP_adminWriteFinalUpdateTeam_(ctx);
  if (ctx.op === 'createTeam') return MINIAPP_adminWriteFinalCreateTeam_(ctx);
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

  var after = MINIAPP_adminWriteTeamRecord_(sheet, finalRow);
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

  return {
    ok: true,
    requestId: ctx.requestId,
    op: ctx.op,
    entityType: 'team',
    entityKey: key,
    row: finalRow,
    revision: MINIAPP_adminWriteTeamRevision_(after),
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

  var after = MINIAPP_adminWriteTeamRecord_(sheet, finalRow);
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

  return {
    ok: true,
    requestId: ctx.requestId,
    op: ctx.op,
    entityType: 'team',
    entityKey: key,
    row: finalRow,
    revision: MINIAPP_adminWriteTeamRevision_(after),
    photoChanged: !!photoPrepared.changed,
    message: photoPrepared.changed ? 'Команда с фото добавлена.' : 'Команда добавлена.'
  };
}

function MINIAPP_adminWriteFinalMeta_() {
  var meta = typeof MINIAPP_adminWriteHardenedMeta_ === 'function'
    ? MINIAPP_adminWriteHardenedMeta_()
    : {};
  meta.version = MINIAPP_ADMIN_WRITE_FINAL_VERSION;
  meta.transport = 'worker-signed-hmac';
  meta.deleteEnabled = false;
  meta.writableTeamFields = ['name', 'leader', 'photo'];
  meta.createTeamFields = ['game', 'name', 'leader', 'photo'];
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
