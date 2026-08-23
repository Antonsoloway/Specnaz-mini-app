/*
 * Royal CRM / Таблица ЧП
 * 34_MINIAPP_AUDIT_V2.js
 * v0.6.0-audit.4
 *
 * Additive, backwards-compatible audit journal v2.
 *
 * A:L keep the exact write.1/write.3 legacy layout so an older admin snapshot
 * can continue to read the journal during a staged rollout. M:Y add immutable
 * event identity, source/actor/target, semantic diffs and transaction outcome.
 *
 * This file deliberately exposes narrow hooks for every mutation origin:
 *   MINIAPP_auditV2RecordMiniAppMutation_
 *   MINIAPP_auditV2RecordManualMutation_
 *   MINIAPP_auditV2RecordBotMutation_
 *   MINIAPP_auditV2RecordSystemMutation_
 *
 * Manual/bulk Sheet edits reconcile against a protected baseline. Existing
 * installable triggers remain inert until MINIAPP_auditV2Activate() prepares
 * fresh storage and writes the exact versioned activation token last.
 */

var MINIAPP_AUDIT_V2_VERSION = '0.6.0-audit.4';
var MINIAPP_AUDIT_V2_SCHEMA_VERSION = 2;
var MINIAPP_AUDIT_V2_JOURNAL_COLUMNS = 25;
var MINIAPP_AUDIT_V2_INDEX_SHEET = 'Админ аудит индекс';
var MINIAPP_AUDIT_V2_BASELINE_SHEET = 'Админ аудит baseline';
var MINIAPP_AUDIT_V2_ACTIVE_PROPERTY = 'MINIAPP_AUDIT_V2_ACTIVE';
var MINIAPP_AUDIT_V2_ACTIVATION_TOKEN = 'audit-v2:rollout-inert:20260822-145110';
var MINIAPP_CHATKEEPER_WEBHOOK_SECRET_PROPERTY = 'ROYAL_CRM_CHATKEEPER_WEBHOOK_SECRET';
var MINIAPP_AUDIT_V2_CELL_JSON_LIMIT = 45000;
var MINIAPP_AUDIT_V2_RECONCILE_LIMIT = 500;
var MINIAPP_AUDIT_V2_JOURNAL_PROTECTION = 'Royal CRM audit journal v2';
var MINIAPP_AUDIT_V2_INDEX_PROTECTION = 'Royal CRM audit idempotency index v2';
var MINIAPP_AUDIT_V2_BASELINE_PROTECTION = 'Royal CRM audit protected baseline v2';

var MINIAPP_AUDIT_V2_HEADERS = [
  'Дата/время', 'Request ID', 'Telegram ID админа', '@username админа',
  'Операция', 'Сущность', 'Ключ', 'Строка', 'Изменённые поля',
  'До', 'После', 'Версия',
  'Event ID', 'Schema', 'Occurred ISO', 'Timezone', 'Source JSON',
  'Actor JSON', 'Target JSON', 'Diff JSON', 'Outcome JSON',
  'Parent Event ID', 'Transaction ID', 'Dedupe Key', 'Metadata JSON'
];

var MINIAPP_AUDIT_V2_INDEX_HEADERS = [
  'Dedupe Key', 'Event ID', 'Строка журнала', 'Occurred ISO',
  'Request ID', 'Операция', 'Сущность', 'Ключ'
];

var MINIAPP_AUDIT_V2_BASELINE_HEADERS = [
  'Сущность', 'Ключ', 'Строка', 'Fingerprint', 'Record JSON',
  'Updated ISO', 'Schema'
];

var MINIAPP_AUDIT_V2_FIELD_LABELS = {
  name: 'Имя',
  telegramName: 'Имя Telegram',
  username: '@username',
  specnaz: 'Походы спецназа',
  date: 'Дата V',
  screens: 'Скрины',
  activityBase: 'Активность в базе',
  activityOutside: 'Активность вне базы',
  chatState: 'Состояние чата',
  game: 'Игра',
  leader: 'Лидер',
  photo: 'Фото команды',
  photoState: 'Фото команды',
  team: 'Команда',
  role: 'Роль',
  nickname: 'Игровой ник'
};

/**
 * One-time bridge for the controlled two-stage rollout.
 *
 * Stage 1 still has the legacy file01 global in memory. This function copies
 * it into Script Properties without logging or returning the credential. Once
 * Stage 2 replaces file01, a missing property cannot be recovered here and the
 * runtime remains fail-closed.
 */
function MINIAPP_migrateLegacyChatKeeperSecret() {
  var props = PropertiesService.getScriptProperties();
  var configured = String(
    props.getProperty(MINIAPP_CHATKEEPER_WEBHOOK_SECRET_PROPERTY) || ''
  ).trim();
  var legacySecret = '';
  try {
    if (typeof SECRET !== 'undefined') {
      legacySecret = String(SECRET || '').trim();
    }
  } catch (err) {
    legacySecret = '';
  }
  if (configured) {
    if (legacySecret && configured !== legacySecret) {
      return MINIAPP_chatKeeperSecretMigrationMetadata_(
        false, false, 'SECRET_PROPERTY_MISMATCH'
      );
    }
    return MINIAPP_chatKeeperSecretMigrationMetadata_(true, false, '');
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return MINIAPP_chatKeeperSecretMigrationMetadata_(
      false, false, 'SECRET_MIGRATION_LOCKED'
    );
  }

  try {
    configured = String(
      props.getProperty(MINIAPP_CHATKEEPER_WEBHOOK_SECRET_PROPERTY) || ''
    ).trim();
    if (configured) {
      if (legacySecret && configured !== legacySecret) {
        return MINIAPP_chatKeeperSecretMigrationMetadata_(
          false, false, 'SECRET_PROPERTY_MISMATCH'
        );
      }
      return MINIAPP_chatKeeperSecretMigrationMetadata_(true, false, '');
    }

    if (!legacySecret) {
      return MINIAPP_chatKeeperSecretMigrationMetadata_(
        false, false, 'LEGACY_SECRET_UNAVAILABLE'
      );
    }

    props.setProperty(MINIAPP_CHATKEEPER_WEBHOOK_SECRET_PROPERTY, legacySecret);
    configured = String(
      props.getProperty(MINIAPP_CHATKEEPER_WEBHOOK_SECRET_PROPERTY) || ''
    ).trim();
    if (!configured || configured !== legacySecret) {
      return MINIAPP_chatKeeperSecretMigrationMetadata_(
        false, false, 'SECRET_PROPERTY_VERIFY_FAILED'
      );
    }
    return MINIAPP_chatKeeperSecretMigrationMetadata_(true, true, '');
  } finally {
    lock.releaseLock();
  }
}

function MINIAPP_chatKeeperSecretMigrationMetadata_(configured, migrated, error) {
  return {
    ok: configured === true && !error,
    configured: configured === true,
    migrated: migrated === true,
    property: MINIAPP_CHATKEEPER_WEBHOOK_SECRET_PROPERTY,
    valueExposed: false,
    version: MINIAPP_AUDIT_V2_VERSION,
    error: error || ''
  };
}

/** Existing Mini App append signature -> one v2 event. */
function MINIAPP_auditV2RecordMiniAppMutation_(ctx, entityType, entityKey, row, before, after, changed) {
  ctx = ctx || {};
  return MINIAPP_auditV2Append_(ctx.ss, {
    // Every current Mini App mutation invokes the facade from the existing
    // write.1/write.5 transaction while ScriptLock is already held. Apps Script
    // locks are not re-entrant; never tryLock a second Lock object here.
    lockAlreadyHeld: ctx.lockAlreadyHeld === true,
    requestId: ctx.requestId || '',
    transactionId: ctx.transactionId || ctx.requestId || '',
    parentEventId: ctx.parentEventId || '',
    dedupeKey: ctx.dedupeKey || (ctx.requestId ? 'request:' + ctx.requestId : ''),
    op: ctx.op || 'mutation',
    entityType: entityType,
    entityKey: entityKey,
    row: row,
    changed: changed,
    before: before,
    after: after,
    version: ctx.auditVersion || MINIAPP_AUDIT_V2_VERSION,
    source: ctx.auditSource || {
      type: 'miniapp',
      channel: ctx.auditChannel || 'worker-signed-hmac',
      label: 'Mini App'
    },
    actor: ctx.auditActor || {
      type: 'telegram_admin',
      telegramId: ctx.adminId || '',
      username: ctx.adminUsername || '',
      displayName: ctx.adminDisplayName || '',
      label: ctx.adminDisplayName || ctx.adminUsername || 'Администратор'
    },
    outcome: ctx.auditOutcome || null,
    metadata: ctx.auditMetadata || {}
  });
}

/** Explicit hook for a caller that already captured manual before/after. */
function MINIAPP_auditV2RecordManualMutation_(ss, spec) {
  spec = MINIAPP_auditV2Clone_(spec || {});
  spec.source = spec.source || {
    type: 'manual_sheet', channel: 'google-sheets', label: 'Google Sheets'
  };
  spec.actor = spec.actor || MINIAPP_auditV2SheetActor_();
  return MINIAPP_auditV2Append_(ss, spec);
}

/** Explicit hook for ChatKeeper/Telegram/bot-owned mutations. */
function MINIAPP_auditV2RecordBotMutation_(ss, spec) {
  spec = MINIAPP_auditV2Clone_(spec || {});
  spec.source = spec.source || {
    type: 'bot', channel: 'chatkeeper-webhook', label: 'Бот'
  };
  spec.actor = spec.actor || {
    type: 'service', telegramId: '', username: '', displayName: '', label: 'Бот'
  };
  return MINIAPP_auditV2Append_(ss, spec);
}

/** Explicit hook for cascades, repairs and maintenance mutations. */
function MINIAPP_auditV2RecordSystemMutation_(ss, spec) {
  spec = MINIAPP_auditV2Clone_(spec || {});
  spec.source = spec.source || {
    type: 'system', channel: 'apps-script', label: 'Система'
  };
  spec.actor = spec.actor || {
    type: 'system', telegramId: '', username: '', displayName: '', label: 'Система'
  };
  return MINIAPP_auditV2Append_(ss, spec);
}

/**
 * Single append facade. It is safe both inside the admin-write ScriptLock and
 * from standalone bot/manual/system hooks. A deterministic eventId plus the
 * protected index make retries idempotent even if index append failed after
 * the journal row had committed.
 */
function MINIAPP_auditV2Append_(ss, input) {
  if (!ss) return { ok: false, error: 'AUDIT_SPREADSHEET_MISSING' };
  input = input && typeof input === 'object' ? input : {};
  if (input.bypassActivation !== true && !MINIAPP_auditV2IsActive_()) {
    return { ok: true, skipped: true, reason: 'AUDIT_V2_DISABLED' };
  }

  var lock = null;
  var acquired = false;
  try {
    var lockAlreadyHeld = input.lockAlreadyHeld === true;
    if (!lockAlreadyHeld) {
      lock = LockService.getScriptLock();
      if (!lock.tryLock(5000)) return { ok: false, error: 'AUDIT_BUSY' };
      acquired = true;
    }
    if (input.bypassActivation !== true && !MINIAPP_auditV2IsActive_()) {
      return { ok: true, skipped: true, reason: 'AUDIT_V2_DISABLED' };
    }

    var event = MINIAPP_auditV2NormalizeEvent_(input);
    var duplicate = MINIAPP_auditV2FindIndexed_(ss, event.dedupeKey, event.eventId);
    if (duplicate) {
      var committedDuplicate = MINIAPP_auditV2ReadJournalEventAt_(
        ss, Number(duplicate.journalRow || 0)
      ) || event;
      var duplicateRepair = MINIAPP_auditV2RepairBaselineIfCurrent_(
        ss, committedDuplicate
      );
      return {
        ok: true,
        duplicate: true,
        eventId: duplicate.eventId || event.eventId,
        journalRow: Number(duplicate.journalRow || 0),
        event: committedDuplicate,
        baselineRepair: duplicateRepair
      };
    }

    var journal = MINIAPP_auditV2EnsureJournal_(ss);
    var journalDuplicate = MINIAPP_auditV2FindJournalEvent_(journal, event.eventId, event.dedupeKey);
    if (journalDuplicate) {
      var committedJournalEvent = MINIAPP_auditV2ReadJournalEventAt_(
        ss, journalDuplicate.journalRow
      ) || event;
      MINIAPP_auditV2EnsureIndexEntry_(ss, committedJournalEvent, journalDuplicate.journalRow);
      var journalRepair = MINIAPP_auditV2RepairBaselineIfCurrent_(
        ss, committedJournalEvent
      );
      return {
        ok: true,
        duplicate: true,
        eventId: committedJournalEvent.eventId || event.eventId,
        journalRow: journalDuplicate.journalRow,
        event: committedJournalEvent,
        baselineRepair: journalRepair
      };
    }

    MINIAPP_auditV2AttachCommittedTargetFingerprint_(ss, event);

    var legacyChanged = MINIAPP_auditV2Sanitize_(event.changed || {});
    var legacyBefore = MINIAPP_auditV2Sanitize_(event.before || {});
    var legacyAfter = MINIAPP_auditV2Sanitize_(event.after || {});
    var appendRow = [
      event.occurredAt,
      event.requestId,
      event.actor.telegramId || '',
      event.actor.username || '',
      event.op,
      event.target.entityType,
      event.target.entityKey,
      Number(event.target.row || 0),
      MINIAPP_auditV2SafeJson_(legacyChanged),
      MINIAPP_auditV2SafeJson_(legacyBefore),
      MINIAPP_auditV2SafeJson_(legacyAfter),
      event.version,
      event.eventId,
      MINIAPP_AUDIT_V2_SCHEMA_VERSION,
      event.occurredAtIso,
      event.timezone,
      MINIAPP_auditV2SafeJson_(event.source),
      MINIAPP_auditV2SafeJson_(event.actor),
      MINIAPP_auditV2SafeJson_(event.target),
      MINIAPP_auditV2SafeJson_(event.diff),
      MINIAPP_auditV2SafeJson_(event.outcome),
      event.parentEventId,
      event.transactionId,
      event.dedupeKey,
      MINIAPP_auditV2SafeJson_(event.metadata)
    ];

    // appendRow() performs its own implicit row allocation and is unsafe as an
    // audit commit primitive. The facade owns ScriptLock, resolves the explicit
    // next row and writes the full immutable event with one setValues call.
    var journalRow = Math.max(2, journal.getLastRow() + 1);
    MINIAPP_auditV2EnsureRows_(journal, journalRow);
    journal.getRange(journalRow, 1, 1, MINIAPP_AUDIT_V2_JOURNAL_COLUMNS)
      .setValues([appendRow]);
    journal.getRange(journalRow, 1).setNumberFormat('dd.MM.yyyy HH:mm:ss');
    MINIAPP_auditV2EnsureIndexEntry_(ss, event, journalRow);
    var baselineRepair = MINIAPP_auditV2RepairBaselineIfCurrent_(ss, event);

    return {
      ok: true,
      duplicate: false,
      eventId: event.eventId,
      journalRow: journalRow,
      event: event,
      baselineRepair: baselineRepair
    };
  } catch (error) {
    console.error('Audit v2 append failed', error && error.stack ? error.stack : error);
    return {
      ok: false,
      error: 'AUDIT_APPEND_FAILED',
      message: String(error && error.message ? error.message : error || 'UNKNOWN')
    };
  } finally {
    if (acquired && lock) {
      try { lock.releaseLock(); } catch (_) {}
    }
  }
}

function MINIAPP_auditV2NormalizeEvent_(input) {
  var now = input.occurredAt instanceof Date && !isNaN(input.occurredAt.getTime())
    ? input.occurredAt : new Date();
  var occurredAtIso = String(input.occurredAtIso || now.toISOString());
  var timezone = String(input.timezone || MINIAPP_auditV2Timezone_());
  var source = MINIAPP_auditV2NormalizeSource_(input.source);
  var actor = MINIAPP_auditV2NormalizeActor_(input.actor, source);
  var before = MINIAPP_auditV2Sanitize_(input.before || {});
  var after = MINIAPP_auditV2Sanitize_(input.after || {});
  var changed = MINIAPP_auditV2Sanitize_(input.changed || {});
  var target = MINIAPP_auditV2NormalizeTarget_(input, before, after);
  var diff = Array.isArray(input.diff)
    ? MINIAPP_auditV2Sanitize_(input.diff)
    : MINIAPP_auditV2SemanticDiff_(target.entityType, before, after, changed);
  var requestId = MINIAPP_auditV2Text_(input.requestId, 160);
  var transactionId = MINIAPP_auditV2Text_(
    input.transactionId || requestId || input.parentEventId || '', 180
  );
  var parentEventId = MINIAPP_auditV2Text_(input.parentEventId, 180);
  var dedupeKey = MINIAPP_auditV2Text_(input.dedupeKey, 500);
  if (!dedupeKey && requestId) dedupeKey = 'request:' + requestId;

  var entropy = dedupeKey || [
    occurredAtIso,
    source.type,
    actor.telegramId || actor.username || actor.label,
    input.op || 'mutation',
    target.entityType,
    target.entityKey,
    MINIAPP_auditV2StableJson_(diff)
  ].join('|');
  var eventId = MINIAPP_auditV2Text_(input.eventId, 180);
  if (!eventId) {
    eventId = 'audit_' + MINIAPP_auditV2Sha256_(entropy).slice(0, 32);
  }
  if (!dedupeKey) dedupeKey = 'event:' + eventId;

  var outcome = MINIAPP_auditV2NormalizeOutcome_(
    input.outcome, input.op, target, diff, changed
  );

  return {
    schemaVersion: MINIAPP_AUDIT_V2_SCHEMA_VERSION,
    version: MINIAPP_auditV2Text_(input.version || MINIAPP_AUDIT_V2_VERSION, 120),
    eventId: eventId,
    occurredAt: now,
    occurredAtIso: occurredAtIso,
    timezone: timezone,
    requestId: requestId,
    transactionId: transactionId,
    parentEventId: parentEventId,
    dedupeKey: dedupeKey,
    op: MINIAPP_auditV2Text_(input.op || 'mutation', 120),
    source: source,
    actor: actor,
    target: target,
    changed: changed,
    before: before,
    after: after,
    diff: diff,
    outcome: outcome,
    metadata: MINIAPP_auditV2Sanitize_(input.metadata || {}),
    baselineSync: input.syncBaseline !== false
  };
}

function MINIAPP_auditV2NormalizeSource_(value) {
  value = value && typeof value === 'object' ? value : {};
  var type = MINIAPP_auditV2Text_(value.type || 'system', 80);
  return {
    type: type,
    channel: MINIAPP_auditV2Text_(value.channel || 'apps-script', 120),
    label: MINIAPP_auditV2Text_(value.label || MINIAPP_auditV2SourceLabel_(type), 160)
  };
}

function MINIAPP_auditV2NormalizeActor_(value, source) {
  value = value && typeof value === 'object' ? value : {};
  var username = MINIAPP_auditV2Text_(value.username, 80);
  if (username && username.charAt(0) !== '@') username = '@' + username;
  var displayName = MINIAPP_auditV2Text_(value.displayName, 180);
  var fallback = source.type === 'manual_sheet'
    ? 'Редактор Google Sheets — имя недоступно'
    : (source.type === 'bot' ? 'Бот' : (source.type === 'system' ? 'Система' : 'Администратор'));
  return {
    type: MINIAPP_auditV2Text_(value.type || (source.type === 'miniapp' ? 'telegram_admin' : source.type), 80),
    telegramId: MINIAPP_auditV2Text_(value.telegramId, 40),
    username: username,
    displayName: displayName,
    label: MINIAPP_auditV2Text_(value.label || displayName || username || fallback, 200)
  };
}

function MINIAPP_auditV2NormalizeTarget_(input, before, after) {
  var targetInput = input.target && typeof input.target === 'object' ? input.target : {};
  var type = MINIAPP_auditV2Text_(input.entityType || targetInput.entityType, 80);
  var key = MINIAPP_auditV2Text_(input.entityKey || targetInput.entityKey, 300);
  var state = after && !after.deleted ? after : before;
  var label = MINIAPP_auditV2Text_(
    targetInput.label || state && (state.name || state.telegramName || state.username),
    240
  );
  var game = MINIAPP_auditV2Text_(
    targetInput.game || state && state.game,
    80
  );
  if (!label) label = type === 'team' ? 'Команда' : (type === 'participant' ? 'Участник' : key || 'Запись');
  return {
    entityType: type || 'record',
    entityKey: key,
    row: Number(input.row || targetInput.row || state && state.row || 0),
    label: label,
    game: game
  };
}

function MINIAPP_auditV2NormalizeOutcome_(value, op, target, diff, changed) {
  value = value && typeof value === 'object' ? value : {};
  var warnings = Array.isArray(value.warnings) ? value.warnings.slice() : [];
  if (changed && changed.mediaCleanupWarning) warnings.push(String(changed.mediaCleanupWarning));
  if (changed && Array.isArray(changed.maintenanceWarnings)) {
    warnings = warnings.concat(changed.maintenanceWarnings);
  }
  warnings = MINIAPP_auditV2UniqueStrings_(warnings);
  var status = MINIAPP_auditV2Text_(value.status, 80);
  if (!status) status = diff.length ? 'committed' : 'noop';
  return {
    status: status,
    code: MINIAPP_auditV2Text_(value.code || (warnings.length ? 'COMMITTED_WITH_WARNINGS' : 'OK'), 120),
    summary: MINIAPP_auditV2Text_(
      value.summary || MINIAPP_auditV2OutcomeSummary_(op, target, diff), 500
    ),
    warnings: warnings
  };
}

/** Actual before/after semantic diff; requested fields are not treated as truth. */
function MINIAPP_auditV2SemanticDiff_(entityType, before, after, changed) {
  before = before && typeof before === 'object' ? before : {};
  after = after && typeof after === 'object' ? after : {};
  changed = changed && typeof changed === 'object' ? changed : {};
  var diff = [];
  var created = before.empty === true || (!MINIAPP_auditV2HasIdentity_(before) && MINIAPP_auditV2HasIdentity_(after));
  var deleted = after.deleted === true;

  if (created) {
    diff.push({
      kind: 'entity_created', field: 'entity', path: 'entity',
      label: entityType === 'team' ? 'Команда добавлена' : 'Участник добавлен',
      before: null, after: MINIAPP_auditV2SummaryState_(entityType, after)
    });
  }
  if (deleted) {
    diff.push({
      kind: 'entity_deleted', field: 'entity', path: 'entity',
      label: entityType === 'team' ? 'Команда удалена' : 'Участник удалён',
      before: MINIAPP_auditV2SummaryState_(entityType, before), after: null
    });
    return diff;
  }

  var fields = entityType === 'team'
    ? ['game', 'name', 'leader', 'photoState']
    : ['name', 'telegramName', 'username', 'specnaz', 'date', 'screens', 'activityBase', 'activityOutside', 'chatState'];
  fields.forEach(function(field) {
    var left = MINIAPP_auditV2Comparable_(before[field]);
    var right = MINIAPP_auditV2Comparable_(after[field]);
    if (left === right) return;
    if (field === 'photoState') {
      diff.push({
        kind: right === 'present' ? 'photo_added' : 'photo_removed',
        field: field,
        path: field,
        label: MINIAPP_AUDIT_V2_FIELD_LABELS[field],
        before: left === 'present' ? 'Есть фото' : 'Нет фото',
        after: right === 'present' ? 'Есть фото' : 'Нет фото'
      });
      return;
    }
    diff.push({
      kind: left === '' ? 'field_added' : (right === '' ? 'field_cleared' : 'field_changed'),
      field: field,
      path: field,
      label: MINIAPP_AUDIT_V2_FIELD_LABELS[field] || field,
      before: MINIAPP_auditV2Scalar_(before[field]),
      after: MINIAPP_auditV2Scalar_(after[field])
    });
  });

  if (entityType === 'participant') {
    diff = diff.concat(MINIAPP_auditV2MembershipDiff_(before.memberships, after.memberships));
  }

  var photoPresenceAlreadyLogged = diff.some(function(item) {
    return item && item.field === 'photoState';
  });
  if (changed.photo && changed.photo.changed && !photoPresenceAlreadyLogged) {
    diff.push({
      kind: changed.photo.action === 'auto_migrated' ? 'photo_migrated' : 'photo_changed',
      field: 'photo',
      path: 'photo',
      label: MINIAPP_AUDIT_V2_FIELD_LABELS.photo,
      before: changed.photo.action === 'uploaded' ? null : 'Предыдущее фото',
      after: changed.photo.action === 'auto_migrated' ? 'Перенесено при переименовании' : 'Добавлено или заменено'
    });
  }

  if (changed.cascade && Number(changed.cascade.membershipRenames || 0) > 0) {
    diff.push({
      kind: 'cascade',
      field: 'memberships',
      path: 'cascade.memberships',
      label: 'Связанные игровые слоты',
      before: null,
      after: Number(changed.cascade.membershipRenames),
      count: Number(changed.cascade.membershipRenames)
    });
  }
  return diff;
}

function MINIAPP_auditV2MembershipDiff_(beforeList, afterList) {
  var before = MINIAPP_auditV2MembershipMap_(beforeList);
  var after = MINIAPP_auditV2MembershipMap_(afterList);
  var out = [];
  for (var slot = 1; slot <= 5; slot += 1) {
    var left = before[slot] || null;
    var right = after[slot] || null;
    if (MINIAPP_auditV2StableJson_(left) === MINIAPP_auditV2StableJson_(right)) continue;
    if (!left && right) {
      out.push({
        kind: 'membership_added', field: 'memberships', path: 'memberships[' + slot + ']',
        label: 'Слот ' + slot, before: null, after: right, slot: slot
      });
      continue;
    }
    if (left && !right) {
      out.push({
        kind: 'membership_cleared', field: 'memberships', path: 'memberships[' + slot + ']',
        label: 'Слот ' + slot, before: left, after: null, slot: slot
      });
      continue;
    }
    ['game', 'team', 'role', 'nickname'].forEach(function(field) {
      var leftValue = MINIAPP_auditV2Comparable_(left && left[field]);
      var rightValue = MINIAPP_auditV2Comparable_(right && right[field]);
      if (leftValue === rightValue) return;
      out.push({
        kind: leftValue === '' ? 'field_added' : (rightValue === '' ? 'field_cleared' : 'field_changed'),
        field: 'memberships.' + field,
        path: 'memberships[' + slot + '].' + field,
        label: 'Слот ' + slot + ' · ' + (MINIAPP_AUDIT_V2_FIELD_LABELS[field] || field),
        before: MINIAPP_auditV2Scalar_(left && left[field]),
        after: MINIAPP_auditV2Scalar_(right && right[field]),
        slot: slot
      });
    });
  }
  return out;
}

function MINIAPP_auditV2MembershipMap_(list) {
  var out = {};
  (Array.isArray(list) ? list : []).forEach(function(item) {
    var slot = Number(item && item.slot || 0);
    if (slot < 1 || slot > 5) return;
    var value = {
      slot: slot,
      game: MINIAPP_auditV2Text_(item.game, 80),
      team: MINIAPP_auditV2Text_(item.team, 240),
      role: MINIAPP_auditV2Text_(item.role, 120),
      nickname: MINIAPP_auditV2Text_(item.nickname, 180)
    };
    if (value.game || value.team || value.role || value.nickname) out[slot] = value;
  });
  return out;
}

function MINIAPP_auditV2EnsureJournal_(ss) {
  var sheetName = typeof MINIAPP_ADMIN_WRITE_JOURNAL_SHEET !== 'undefined'
    ? MINIAPP_ADMIN_WRITE_JOURNAL_SHEET : 'Админ журнал';
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  MINIAPP_auditV2EnsureColumns_(sheet, MINIAPP_AUDIT_V2_JOURNAL_COLUMNS);
  var current = sheet.getRange(1, 1, 1, MINIAPP_AUDIT_V2_JOURNAL_COLUMNS).getDisplayValues()[0];
  var headers = current.slice();
  var changed = false;
  MINIAPP_AUDIT_V2_HEADERS.forEach(function(header, index) {
    // Never rename populated legacy A:L headers during an additive rollout.
    // M:Y belong to schema v2 and are enforced exactly so a partially edited
    // service sheet cannot silently advertise the wrong column contract.
    if (!headers[index] || (index >= 12 && headers[index] !== header)) {
      headers[index] = header;
      changed = true;
    }
  });
  if (changed) {
    sheet.getRange(1, 1, 1, MINIAPP_AUDIT_V2_JOURNAL_COLUMNS)
      .setValues([headers]).setFontWeight('bold');
  }
  sheet.setFrozenRows(1);
  MINIAPP_auditV2ProtectAndHide_(sheet, MINIAPP_AUDIT_V2_JOURNAL_PROTECTION);
  return sheet;
}

function MINIAPP_auditV2EnsureIndex_(ss) {
  var sheet = ss.getSheetByName(MINIAPP_AUDIT_V2_INDEX_SHEET);
  if (!sheet) sheet = ss.insertSheet(MINIAPP_AUDIT_V2_INDEX_SHEET);
  MINIAPP_auditV2EnsureColumns_(sheet, MINIAPP_AUDIT_V2_INDEX_HEADERS.length);
  var headers = sheet.getRange(1, 1, 1, MINIAPP_AUDIT_V2_INDEX_HEADERS.length).getDisplayValues()[0];
  if (headers.join('|') !== MINIAPP_AUDIT_V2_INDEX_HEADERS.join('|')) {
    sheet.getRange(1, 1, 1, MINIAPP_AUDIT_V2_INDEX_HEADERS.length)
      .setValues([MINIAPP_AUDIT_V2_INDEX_HEADERS]).setFontWeight('bold');
  }
  sheet.setFrozenRows(1);
  MINIAPP_auditV2ProtectAndHide_(sheet, MINIAPP_AUDIT_V2_INDEX_PROTECTION);
  return sheet;
}

function MINIAPP_auditV2FindIndexed_(ss, dedupeKey, eventId) {
  var sheet = ss.getSheetByName(MINIAPP_AUDIT_V2_INDEX_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return null;
  var found = null;
  if (dedupeKey) found = MINIAPP_auditV2FindExact_(sheet, 1, dedupeKey);
  if (!found && eventId) found = MINIAPP_auditV2FindExact_(sheet, 2, eventId);
  if (!found) return null;
  var values = sheet.getRange(found.getRow(), 1, 1, 8).getDisplayValues()[0];
  return {
    dedupeKey: values[0], eventId: values[1], journalRow: Number(values[2] || 0),
    requestId: values[4], op: values[5], entityType: values[6], entityKey: values[7]
  };
}

function MINIAPP_auditV2EnsureIndexEntry_(ss, event, journalRow) {
  if (MINIAPP_auditV2FindIndexed_(ss, event.dedupeKey, event.eventId)) return;
  var sheet = MINIAPP_auditV2EnsureIndex_(ss);
  var nextRow = Math.max(2, sheet.getLastRow() + 1);
  MINIAPP_auditV2EnsureRows_(sheet, nextRow);
  sheet.getRange(nextRow, 1, 1, 8).setValues([[
    event.dedupeKey, event.eventId, Number(journalRow || 0), event.occurredAtIso,
    event.requestId, event.op, event.target.entityType, event.target.entityKey
  ]]);
}

function MINIAPP_auditV2FindJournalEvent_(sheet, eventId, dedupeKey) {
  if (!sheet || sheet.getLastRow() < 2) return null;
  var found = eventId ? MINIAPP_auditV2FindExact_(sheet, 13, eventId) : null;
  if (!found && dedupeKey) found = MINIAPP_auditV2FindExact_(sheet, 24, dedupeKey);
  return found ? { journalRow: found.getRow() } : null;
}

function MINIAPP_auditV2ReadJournalEventAt_(ss, journalRow) {
  journalRow = Number(journalRow || 0);
  if (!ss || journalRow < 2) return null;
  var sheetName = typeof MINIAPP_ADMIN_WRITE_JOURNAL_SHEET !== 'undefined'
    ? MINIAPP_ADMIN_WRITE_JOURNAL_SHEET : 'Админ журнал';
  var journal = ss.getSheetByName(sheetName);
  if (!journal || journalRow > journal.getLastRow()) return null;
  var width = Math.min(
    MINIAPP_AUDIT_V2_JOURNAL_COLUMNS,
    Math.max(12, journal.getLastColumn())
  );
  var event = MINIAPP_auditV2ParseJournalRow_(
    journal.getRange(journalRow, 1, 1, width).getDisplayValues()[0]
  );
  return event.schemaVersion === 2 && event.eventId ? event : null;
}

function MINIAPP_auditV2FindRequest_(requestId, options) {
  var clean = MINIAPP_auditV2Text_(requestId, 160);
  if (!clean) return null;
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  // During the two-stage rollout an older v2 journal row may already exist
  // while the exact activation token is absent. Lookup must still preserve
  // legacy request-id idempotency, but disabled code is strictly read-only:
  // it must not create/rebuild the index or advance the protected baseline.
  var mayRepair = MINIAPP_auditV2IsActive_() &&
    options && options.lockAlreadyHeld === true;
  var indexed = MINIAPP_auditV2FindIndexed_(ss, 'request:' + clean, '');
  if (indexed) {
    if (mayRepair) {
      var committed = MINIAPP_auditV2ReadJournalEventAt_(ss, indexed.journalRow);
      if (committed) {
        indexed.baselineRepair = MINIAPP_auditV2RepairBaselineIfCurrent_(ss, committed);
      }
    }
    return indexed;
  }

  var sheetName = typeof MINIAPP_ADMIN_WRITE_JOURNAL_SHEET !== 'undefined'
    ? MINIAPP_ADMIN_WRITE_JOURNAL_SHEET : 'Админ журнал';
  var journal = ss.getSheetByName(sheetName);
  if (!journal || journal.getLastRow() < 2) return null;
  var found = MINIAPP_auditV2FindExact_(journal, 2, clean);
  if (!found) return null;
  var journalRow = found.getRow();
  var committedFallback = MINIAPP_auditV2ReadJournalEventAt_(ss, journalRow);
  if (committedFallback && mayRepair) {
    MINIAPP_auditV2EnsureIndexEntry_(ss, committedFallback, journalRow);
    var fallbackRepair = MINIAPP_auditV2RepairBaselineIfCurrent_(
      ss, committedFallback
    );
    return {
      requestId: committedFallback.requestId,
      op: committedFallback.op,
      entityType: committedFallback.target.entityType,
      entityKey: committedFallback.target.entityKey,
      row: Number(committedFallback.target.row || 0),
      journalRow: journalRow,
      eventId: committedFallback.eventId,
      baselineRepair: fallbackRepair
    };
  }
  var values = journal.getRange(found.getRow(), 2, 1, 7).getDisplayValues()[0];
  return {
    requestId: values[0], op: values[3], entityType: values[4],
    entityKey: values[5], row: Number(values[6] || 0), journalRow: journalRow
  };
}

/** v1 + v2 reader for protected admin snapshot. */
function MINIAPP_auditV2JournalData_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheetName = typeof MINIAPP_ADMIN_WRITE_JOURNAL_SHEET !== 'undefined'
    ? MINIAPP_ADMIN_WRITE_JOURNAL_SHEET : 'Админ журнал';
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) {
    return { version: MINIAPP_AUDIT_V2_VERSION, schemaVersion: 2, rows: [] };
  }
  var limit = typeof MINIAPP_ADMIN_WRITE_JOURNAL_LIMIT !== 'undefined'
    ? Number(MINIAPP_ADMIN_WRITE_JOURNAL_LIMIT) : 100;
  var last = sheet.getLastRow();
  var count = Math.min(Math.max(1, limit), last - 1);
  var start = Math.max(2, last - count + 1);
  var width = Math.min(MINIAPP_AUDIT_V2_JOURNAL_COLUMNS, Math.max(12, sheet.getLastColumn()));
  var values = sheet.getRange(start, 1, count, width).getDisplayValues();
  return {
    version: MINIAPP_AUDIT_V2_VERSION,
    schemaVersion: 2,
    rows: values.map(MINIAPP_auditV2ParseJournalRow_).reverse()
  };
}

function MINIAPP_auditV2ParseJournalRow_(r) {
  while (r.length < MINIAPP_AUDIT_V2_JOURNAL_COLUMNS) r.push('');
  var before = MINIAPP_auditV2ParseJson_(r[9], {});
  var after = MINIAPP_auditV2ParseJson_(r[10], {});
  var changed = MINIAPP_auditV2ParseJson_(r[8], {});
  var isV2 = Number(r[13] || 0) >= 2 && !!r[12];
  var source = isV2
    ? MINIAPP_auditV2ParseJson_(r[16], {})
    : { type: 'miniapp', channel: 'legacy-admin-write', label: 'Mini App' };
  var actor = isV2
    ? MINIAPP_auditV2ParseJson_(r[17], {})
    : {
        type: 'telegram_admin', telegramId: r[2] || '', username: r[3] || '',
        displayName: '', label: r[3] || 'Администратор'
      };
  var target = isV2
    ? MINIAPP_auditV2ParseJson_(r[18], {})
    : MINIAPP_auditV2NormalizeTarget_({
        entityType: r[5], entityKey: r[6], row: Number(r[7] || 0)
      }, before, after);
  var diff = isV2
    ? MINIAPP_auditV2ParseJson_(r[19], [])
    : MINIAPP_auditV2SemanticDiff_(r[5], before, after, changed);
  var outcome = isV2
    ? MINIAPP_auditV2ParseJson_(r[20], {})
    : MINIAPP_auditV2NormalizeOutcome_(null, r[4], target, diff, changed);
  return {
    at: r[0], requestId: r[1], adminTelegramId: r[2], adminUsername: r[3],
    op: r[4], entityType: r[5], entityKey: r[6], row: Number(r[7] || 0),
    changed: changed, before: before, after: after, version: r[11],
    schemaVersion: isV2 ? 2 : 1,
    eventId: r[12] || '',
    occurredAtIso: r[14] || '',
    timezone: r[15] || '',
    source: source,
    actor: actor,
    target: target,
    diff: diff,
    outcome: outcome,
    parentEventId: r[21] || '',
    transactionId: r[22] || r[1] || '',
    dedupeKey: r[23] || (r[1] ? 'request:' + r[1] : ''),
    metadata: MINIAPP_auditV2ParseJson_(r[24], {})
  };
}

/* ======================================================================= */
/* Protected baseline + reconciliation hooks                               */
/* ======================================================================= */

/** One controlled bootstrap before manual/bot/system hooks are activated. */
function MINIAPP_auditV2BootstrapBaseline() {
  var lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(20000)) return { ok: false, error: 'AUDIT_BUSY' };
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var snapshot = MINIAPP_auditV2PrepareStorage_(ss);
    SpreadsheetApp.flush();
    var security = MINIAPP_auditV2StorageSecurity_(ss);
    if (!security.ok) {
      security.error = 'AUDIT_STORAGE_SECURITY_NOT_READY';
      security.version = MINIAPP_AUDIT_V2_VERSION;
      return security;
    }
    return {
      ok: true,
      version: MINIAPP_AUDIT_V2_VERSION,
      participants: snapshot.counts.participants,
      teams: snapshot.counts.teams,
      note: 'Baseline initialized; no business-data mutation was performed.'
    };
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

/**
 * Controlled rollout gate. Existing installable triggers see new source as
 * soon as it is pushed, so the activation property is written only after the
 * journal schema, index and complete baseline have committed under one lock.
 */
function MINIAPP_auditV2Activate() {
  var lock = LockService.getScriptLock();
  var acquired = false;
  try {
    if (!lock.tryLock(20000)) return { ok: false, error: 'AUDIT_BUSY' };
    acquired = true;
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var props = PropertiesService.getScriptProperties();
    // A failed/repeated activation must fail closed. Clear any matching stale
    // token before touching storage and write the fresh token only at the end.
    props.deleteProperty(MINIAPP_AUDIT_V2_ACTIVE_PROPERTY);
    var snapshot = MINIAPP_auditV2PrepareStorage_(ss);
    if (Number(snapshot.counts.participants || 0) + Number(snapshot.counts.teams || 0) <= 0) {
      return { ok: false, active: false, error: 'AUDIT_BASELINE_EMPTY' };
    }
    SpreadsheetApp.flush();
    var security = MINIAPP_auditV2StorageSecurity_(ss);
    if (!security.ok) {
      security.active = false;
      security.error = 'AUDIT_STORAGE_SECURITY_NOT_READY';
      security.version = MINIAPP_AUDIT_V2_VERSION;
      return security;
    }
    props.setProperty(
      MINIAPP_AUDIT_V2_ACTIVE_PROPERTY,
      MINIAPP_AUDIT_V2_ACTIVATION_TOKEN
    );
    return {
      ok: true,
      active: true,
      version: MINIAPP_AUDIT_V2_VERSION,
      participants: snapshot.counts.participants,
      teams: snapshot.counts.teams,
      storageSecurityReady: true,
      journalHidden: security.journalHidden,
      journalProtected: security.journalProtected,
      indexHidden: security.indexHidden,
      indexProtected: security.indexProtected,
      baselineHidden: security.baselineHidden,
      baselineProtected: security.baselineProtected
    };
  } finally {
    if (acquired) {
      try { lock.releaseLock(); } catch (_) {}
    }
  }
}

function MINIAPP_auditV2Deactivate() {
  var lock = LockService.getScriptLock();
  var acquired = false;
  try {
    if (!lock.tryLock(10000)) return { ok: false, error: 'AUDIT_BUSY' };
    acquired = true;
    PropertiesService.getScriptProperties().deleteProperty(
      MINIAPP_AUDIT_V2_ACTIVE_PROPERTY
    );
    return { ok: true, active: false, version: MINIAPP_AUDIT_V2_VERSION };
  } finally {
    if (acquired) {
      try { lock.releaseLock(); } catch (_) {}
    }
  }
}

function MINIAPP_auditV2Status() {
  var status = MINIAPP_auditV2Preflight_();
  status.active = MINIAPP_auditV2IsActive_();
  return status;
}

function MINIAPP_auditV2PrepareStorage_(ss) {
  // Service sheets only; source business data remains read-only here.
  MINIAPP_auditV2EnsureJournal_(ss);
  MINIAPP_auditV2EnsureIndex_(ss);
  var snapshot = MINIAPP_auditV2BuildSnapshot_(ss);
  MINIAPP_auditV2ReplaceBaseline_(ss, snapshot);
  return snapshot;
}

/** Read-only deployment gate; does not create or mutate audit sheets. */
function MINIAPP_auditV2Preflight_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var active = MINIAPP_auditV2IsActive_();
  var baseline = MINIAPP_auditV2LoadBaseline_(ss);
  var journalName = typeof MINIAPP_ADMIN_WRITE_JOURNAL_SHEET !== 'undefined'
    ? MINIAPP_ADMIN_WRITE_JOURNAL_SHEET : 'Админ журнал';
  var journal = ss.getSheetByName(journalName);
  var headers = [];
  if (journal && journal.getLastColumn() >= MINIAPP_AUDIT_V2_JOURNAL_COLUMNS) {
    headers = journal.getRange(1, 1, 1, MINIAPP_AUDIT_V2_JOURNAL_COLUMNS)
      .getDisplayValues()[0];
  }
  var schemaReady = headers.length === MINIAPP_AUDIT_V2_JOURNAL_COLUMNS &&
    headers.slice(12).join('|') === MINIAPP_AUDIT_V2_HEADERS.slice(12).join('|');
  var indexPresent = !!ss.getSheetByName(MINIAPP_AUDIT_V2_INDEX_SHEET);
  var security = MINIAPP_auditV2StorageSecurity_(ss);
  return {
    ok: active && baseline.initialized && schemaReady && indexPresent && security.ok,
    active: active,
    version: MINIAPP_AUDIT_V2_VERSION,
    schemaVersion: MINIAPP_AUDIT_V2_SCHEMA_VERSION,
    baselineInitialized: baseline.initialized,
    baselineRecords: Object.keys(baseline.records || {}).length,
    journalPresent: !!journal,
    journalSchemaReady: schemaReady,
    indexPresent: indexPresent,
    storageSecurityReady: security.ok,
    journalHidden: security.journalHidden,
    journalProtected: security.journalProtected,
    indexHidden: security.indexHidden,
    indexProtected: security.indexProtected,
    baselineHidden: security.baselineHidden,
    baselineProtected: security.baselineProtected,
    manualHook: typeof MINIAPP_auditV2HandleManualEdit_ === 'function',
    botHook: typeof MINIAPP_auditV2RecordBotMutation_ === 'function',
    systemHook: typeof MINIAPP_auditV2RecordSystemMutation_ === 'function'
  };
}

/**
 * Installable onEdit hook candidate. It is NOT installed by this source-only
 * PR. The protected baseline supplies exact before for multi-cell pastes; when
 * no baseline exists the hook initializes it and returns fail-open/no event.
 */
function MINIAPP_auditV2HandleManualEdit_(e) {
  if (!MINIAPP_auditV2IsActive_()) {
    return { ok: true, skipped: true, reason: 'AUDIT_V2_DISABLED' };
  }
  if (!e || !e.range) return { ok: true, skipped: true, reason: 'EVENT_MISSING' };
  var sheet = e.range.getSheet();
  var name = sheet.getName();
  var baseName = typeof SHEET_BASE !== 'undefined' ? SHEET_BASE : 'База участников';
  var teamsName = typeof SHEET_TEAMS !== 'undefined' ? SHEET_TEAMS : 'Команды';
  if (name !== baseName && name !== teamsName) {
    return { ok: true, skipped: true, reason: 'SHEET_NOT_AUDITED' };
  }
  return MINIAPP_auditV2Reconcile_(sheet.getParent(), {
    source: { type: 'manual_sheet', channel: 'google-sheets-onedit', label: 'Google Sheets' },
    actor: MINIAPP_auditV2SheetActor_(e),
    transactionId: MINIAPP_auditV2ManualTransactionId_(e),
    metadata: {
      sheet: name,
      range: e.range.getA1Notation(),
      rows: e.range.getNumRows(),
      columns: e.range.getNumColumns(),
      exactBefore: 'protected-baseline'
    }
  });
}

/** Reconciles all auditable source fields; formula-only changes are excluded. */
function MINIAPP_auditV2Reconcile_(ss, options) {
  options = options || {};
  if (options.bypassActivation !== true && !MINIAPP_auditV2IsActive_()) {
    return { ok: true, skipped: true, reason: 'AUDIT_V2_DISABLED', events: 0 };
  }
  var lock = null;
  var acquired = false;
  if (options.lockAlreadyHeld !== true) {
    lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) return { ok: false, error: 'AUDIT_BUSY' };
    acquired = true;
  }
  try {
  if (options.bypassActivation !== true && !MINIAPP_auditV2IsActive_()) {
    return { ok: true, skipped: true, reason: 'AUDIT_V2_DISABLED', events: 0 };
  }
  var baseline = MINIAPP_auditV2LoadBaseline_(ss);
  var current = MINIAPP_auditV2BuildSnapshot_(ss);
  if (!baseline.initialized) {
    MINIAPP_auditV2ReplaceBaseline_(ss, current);
    return {
      ok: true, initialized: true, events: 0,
      warning: 'BASELINE_WAS_MISSING_NO_BEFORE_AVAILABLE'
    };
  }

  var keys = {};
  Object.keys(baseline.records).forEach(function(key) { keys[key] = true; });
  Object.keys(current.records).forEach(function(key) { keys[key] = true; });
  var changedKeys = Object.keys(keys).filter(function(key) {
    var left = baseline.records[key];
    var right = current.records[key];
    return !left || !right || left.fingerprint !== right.fingerprint;
  });

  // Multiple installable handlers can observe the same edit. The first one
  // advances the protected baseline; later no-diff handlers must remain
  // strictly read-only instead of clearing and rewriting the whole baseline.
  if (!changedKeys.length) {
    return {
      ok: true,
      initialized: false,
      events: 0,
      results: [],
      baselineUpdated: false
    };
  }

  var items = MINIAPP_auditV2ReconcileItems_(
    baseline.records, current.records, changedKeys
  );
  if (items.length > MINIAPP_AUDIT_V2_RECONCILE_LIMIT) {
    return {
      ok: false,
      error: 'AUDIT_RECONCILE_LIMIT',
      changed: items.length,
      limit: MINIAPP_AUDIT_V2_RECONCILE_LIMIT
    };
  }

  var transactionId = options.transactionId || 'reconcile_' + Utilities.getUuid();
  var results = [];
  items.forEach(function(item, index) {
    var compoundKey = item.compoundKey;
    var left = item.left;
    var right = item.right;
    var ref = right || left;
    var before = left ? left.record : { empty: true, row: ref.row };
    var after = right ? right.record : { deleted: true, row: ref.row };
    var op = item.op || (right && !left
      ? (ref.entityType === 'team' ? 'createTeam' : 'createParticipant')
      : (!right && left
        ? (ref.entityType === 'team' ? 'deleteTeam' : 'deleteParticipant')
        : (ref.entityType === 'team' ? 'updateTeam' : 'updateParticipant')));
    var spec = {
      eventId: '',
      lockAlreadyHeld: true,
      dedupeKey: transactionId + ':' + index + ':' + compoundKey + ':' + (right ? right.fingerprint : 'deleted'),
      transactionId: transactionId,
      parentEventId: options.parentEventId || '',
      requestId: '',
      op: op,
      entityType: ref.entityType,
      entityKey: ref.entityKey,
      row: Number((right || left).row || 0),
      before: before,
      after: after,
      changed: {},
      source: options.source,
      actor: options.actor,
      outcome: { status: 'committed', code: 'RECONCILED' },
      metadata: MINIAPP_auditV2Merge_(options.metadata || {}, {
        reconciliation: true,
        identityChange: item.identityChange || null,
        baselineFingerprint: left && left.fingerprint || '',
        currentFingerprint: right && right.fingerprint || ''
      })
    };
    results.push(MINIAPP_auditV2Append_(ss, spec));
  });

  var allOk = results.every(function(result) { return result && result.ok; });
  // Every successful child append conditionally repairs only its own target
  // after the immutable journal/index commit. Do not clear and rewrite the
  // complete baseline here: a failure between clearContent() and setValues()
  // would leave an active installation with a header-only baseline.
  return {
    ok: allOk,
    initialized: false,
    events: results.length,
    baselineUpdated: allOk,
    results: results
  };
  } finally {
    if (acquired) {
      try { lock.releaseLock(); } catch (_) {}
    }
  }
}

/**
 * Converts baseline/current key changes into semantic events. A manual team
 * rename changes the compound identity (`game :: name`), so naïve key diffing
 * looks like delete + create. Pair exactly one missing and one new team record
 * on the same physical source row and emit a single updateTeam event instead.
 * Participant identity replacements deliberately remain separate events.
 */
function MINIAPP_auditV2ReconcileItems_(baselineRecords, currentRecords, changedKeys) {
  var paired = {};
  var missingTeamsByRow = {};
  var addedTeamsByRow = {};
  var items = [];

  changedKeys.forEach(function(compoundKey) {
    var left = baselineRecords[compoundKey];
    var right = currentRecords[compoundKey];
    var entry = left || right;
    if (!entry || entry.entityType !== 'team' || (left && right)) return;
    var row = Number(entry.row || 0);
    if (!row) return;
    var bucket = left ? missingTeamsByRow : addedTeamsByRow;
    if (!bucket[row]) bucket[row] = [];
    bucket[row].push({ compoundKey: compoundKey, entry: entry });
  });

  Object.keys(missingTeamsByRow).sort(function(a, b) {
    return Number(a) - Number(b);
  }).forEach(function(row) {
    var missing = missingTeamsByRow[row] || [];
    var added = addedTeamsByRow[row] || [];
    if (missing.length !== 1 || added.length !== 1) return;
    var oldItem = missing[0];
    var newItem = added[0];
    paired[oldItem.compoundKey] = true;
    paired[newItem.compoundKey] = true;
    items.push({
      compoundKey: newItem.compoundKey,
      left: oldItem.entry,
      right: newItem.entry,
      op: 'updateTeam',
      identityChange: {
        kind: 'team_rename',
        previousEntityKey: oldItem.entry.entityKey,
        currentEntityKey: newItem.entry.entityKey,
        sourceRow: Number(row)
      }
    });
  });

  // Team ordering is normalized before some manual triggers reconcile. In
  // that case a rename can move to another row and the exact-row rule above
  // cannot match it. Use a deliberately narrow fallback: same game and the
  // same non-identity source signature (leader + photo presence), with a
  // unique match in both directions. Ambiguity stays as delete + create.
  var remainingMissing = [];
  var remainingAdded = [];
  changedKeys.forEach(function(compoundKey) {
    if (paired[compoundKey]) return;
    var left = baselineRecords[compoundKey];
    var right = currentRecords[compoundKey];
    var entry = left || right;
    if (!entry || entry.entityType !== 'team' || (left && right)) return;
    (left ? remainingMissing : remainingAdded).push({
      compoundKey: compoundKey,
      entry: entry
    });
  });
  remainingMissing.sort(function(a, b) {
    return a.compoundKey < b.compoundKey ? -1 : (a.compoundKey > b.compoundKey ? 1 : 0);
  });
  remainingAdded.sort(function(a, b) {
    return a.compoundKey < b.compoundKey ? -1 : (a.compoundKey > b.compoundKey ? 1 : 0);
  });

  function isStableRenameCandidate(oldItem, newItem) {
    var oldRecord = oldItem.entry.record || {};
    var newRecord = newItem.entry.record || {};
    if (MINIAPP_auditV2Comparable_(oldRecord.game) !== MINIAPP_auditV2Comparable_(newRecord.game)) {
      return false;
    }
    return MINIAPP_auditV2TeamNonIdentitySignature_(oldRecord) ===
      MINIAPP_auditV2TeamNonIdentitySignature_(newRecord);
  }

  remainingMissing.forEach(function(oldItem) {
    if (paired[oldItem.compoundKey]) return;
    var candidates = remainingAdded.filter(function(newItem) {
      return !paired[newItem.compoundKey] && isStableRenameCandidate(oldItem, newItem);
    });
    if (candidates.length !== 1) return;
    var newItem = candidates[0];
    var reverse = remainingMissing.filter(function(otherOld) {
      return !paired[otherOld.compoundKey] && isStableRenameCandidate(otherOld, newItem);
    });
    if (reverse.length !== 1) return;
    paired[oldItem.compoundKey] = true;
    paired[newItem.compoundKey] = true;
    items.push({
      compoundKey: newItem.compoundKey,
      left: oldItem.entry,
      right: newItem.entry,
      op: 'updateTeam',
      identityChange: {
        kind: 'team_rename_after_sort',
        previousEntityKey: oldItem.entry.entityKey,
        currentEntityKey: newItem.entry.entityKey,
        sourceRowBefore: Number(oldItem.entry.row || 0),
        sourceRowAfter: Number(newItem.entry.row || 0),
        pairing: 'unique_game_non_identity_signature'
      }
    });
  });

  changedKeys.sort().forEach(function(compoundKey) {
    if (paired[compoundKey]) return;
    items.push({
      compoundKey: compoundKey,
      left: baselineRecords[compoundKey],
      right: currentRecords[compoundKey],
      op: '',
      identityChange: null
    });
  });

  return items;
}

function MINIAPP_auditV2TeamNonIdentitySignature_(record) {
  record = record && typeof record === 'object' ? record : {};
  return MINIAPP_auditV2StableJson_({
    leader: MINIAPP_auditV2Text_(record.leader, 240),
    photoState: MINIAPP_auditV2Text_(record.photoState, 40)
  });
}

function MINIAPP_auditV2BuildSnapshot_(ss) {
  var records = {};
  var participantCount = 0;
  var teamCount = 0;
  var baseName = typeof SHEET_BASE !== 'undefined' ? SHEET_BASE : 'База участников';
  var teamsName = typeof SHEET_TEAMS !== 'undefined' ? SHEET_TEAMS : 'Команды';
  var base = ss.getSheetByName(baseName);
  var teams = ss.getSheetByName(teamsName);

  if (base) {
    var first = typeof BASE_FIRST_ROW !== 'undefined' ? Number(BASE_FIRST_ROW) : 2;
    var lastBound = typeof BASE_LAST_ROW !== 'undefined' ? Number(BASE_LAST_ROW) : base.getLastRow();
    var last = Math.min(Math.max(first - 1, base.getLastRow()), lastBound, base.getMaxRows());
    if (last >= first) {
      var participantRows = base.getRange(first, 1, last - first + 1, 32).getDisplayValues();
      participantRows.forEach(function(values, offset) {
        var row = first + offset;
        var record = MINIAPP_auditV2ParticipantFromValues_(values, row);
        if (!record) return;
        var entityKey = record.telegramId || 'row:' + row;
        var compound = 'participant\n' + entityKey;
        records[compound] = MINIAPP_auditV2BaselineEntry_('participant', entityKey, row, record);
        participantCount += 1;
      });
    }
  }

  if (teams) {
    var teamLast = Math.min(Math.max(1, teams.getLastRow()), teams.getMaxRows());
    if (teamLast >= 2) {
      var display = teams.getRange(2, 1, teamLast - 1, 4).getDisplayValues();
      var raw = teams.getRange(2, 1, teamLast - 1, 4).getValues();
      display.forEach(function(values, offset) {
        var row = offset + 2;
        var record = MINIAPP_auditV2TeamFromValues_(values, raw[offset], row);
        if (!record) return;
        var entityKey = record.game + ' :: ' + record.name;
        var compound = 'team\n' + entityKey;
        records[compound] = MINIAPP_auditV2BaselineEntry_('team', entityKey, row, record);
        teamCount += 1;
      });
    }
  }

  return { records: records, counts: { participants: participantCount, teams: teamCount } };
}

function MINIAPP_auditV2ParticipantFromValues_(values, row) {
  function value(column) { return MINIAPP_auditV2Text_(values[column - 1], 500); }
  var telegramId = value(4).replace(/^'/, '').replace(/\.0$/, '');
  var memberships = [];
  var slots = [
    { slot: 1, team: 5, nickname: 6, role: 7, game: 23 },
    { slot: 2, team: 8, nickname: 9, role: 10, game: 24 },
    { slot: 3, team: 11, nickname: 12, role: 13, game: 25 },
    { slot: 4, team: 14, nickname: 15, role: 16, game: 26 },
    { slot: 5, team: 17, nickname: 18, role: 19, game: 27 }
  ];
  slots.forEach(function(slot) {
    var rawTeam = value(slot.team);
    var team = rawTeam.replace(/\s+—\s+(РМ|РК)$/u, '').trim();
    var game = MINIAPP_auditV2CanonicalGame_(value(slot.game), rawTeam);
    var item = {
      slot: slot.slot,
      team: team,
      game: game,
      nickname: value(slot.nickname),
      role: value(slot.role)
    };
    if (item.team || item.game || item.nickname || item.role) memberships.push(item);
  });
  var record = {
    row: row,
    telegramId: telegramId,
    name: value(1),
    telegramName: value(2),
    username: value(3),
    memberships: memberships,
    specnaz: value(21),
    date: value(22),
    screens: value(28),
    activityBase: value(29),
    activityOutside: value(30),
    chatState: value(32)
  };
  if (!record.telegramId && !record.name && !record.telegramName && !record.username &&
      !record.memberships.length && !record.chatState) return null;
  return record;
}

function MINIAPP_auditV2TeamFromValues_(display, raw, row) {
  var game = MINIAPP_auditV2CanonicalGame_(display[0], display[1]);
  var name = MINIAPP_auditV2Text_(display[1], 240);
  if (!game && !name) return null;
  var photoRaw = raw && raw[2];
  var photoPresent = !!(photoRaw || MINIAPP_auditV2Text_(display[2], 100));
  return {
    row: row,
    game: game,
    name: name,
    leader: MINIAPP_auditV2Text_(display[3], 240),
    photoState: photoPresent ? 'present' : 'absent'
  };
}

function MINIAPP_auditV2BaselineEntry_(entityType, entityKey, row, record) {
  var clean = MINIAPP_auditV2Sanitize_(record);
  var fingerprintRecord = MINIAPP_auditV2Clone_(clean);
  // Physical row is diagnostic metadata, not business state. Stable sorting or
  // prepared-row maintenance must not create hundreds of false audit events.
  delete fingerprintRecord.row;
  return {
    entityType: entityType,
    entityKey: entityKey,
    row: Number(row || 0),
    fingerprint: MINIAPP_auditV2Sha256_(MINIAPP_auditV2StableJson_(fingerprintRecord)),
    record: clean
  };
}

function MINIAPP_auditV2LoadBaseline_(ss) {
  var sheet = ss.getSheetByName(MINIAPP_AUDIT_V2_BASELINE_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return { initialized: false, records: {} };
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getDisplayValues();
  var records = {};
  values.forEach(function(row) {
    var entityType = row[0];
    var entityKey = row[1];
    if (!entityType || !entityKey) return;
    records[entityType + '\n' + entityKey] = {
      entityType: entityType,
      entityKey: entityKey,
      row: Number(row[2] || 0),
      fingerprint: row[3],
      record: MINIAPP_auditV2ParseJson_(row[4], {})
    };
  });
  return { initialized: true, records: records };
}

function MINIAPP_auditV2ReplaceBaseline_(ss, snapshot) {
  var sheet = MINIAPP_auditV2EnsureBaseline_(ss);
  var previousLastRow = sheet.getLastRow();
  if (previousLastRow > 1) {
    sheet.getRange(2, 1, previousLastRow - 1, 7).clearContent();
  }
  var now = new Date().toISOString();
  var rows = Object.keys(snapshot.records).sort().map(function(key) {
    var entry = snapshot.records[key];
    return [
      entry.entityType, entry.entityKey, entry.row, entry.fingerprint,
      MINIAPP_auditV2SafeJson_(entry.record), now, MINIAPP_AUDIT_V2_SCHEMA_VERSION
    ];
  });
  if (rows.length) {
    MINIAPP_auditV2EnsureRows_(sheet, rows.length + 1);
    sheet.getRange(2, 1, rows.length, 7).setValues(rows);
  }
}

function MINIAPP_auditV2AttachCommittedTargetFingerprint_(ss, event) {
  event.metadata = event.metadata && typeof event.metadata === 'object'
    ? event.metadata : {};
  event.metadata.baselineSync = event.baselineSync !== false;
  if (event.baselineSync === false) return;
  if (!event.target || !event.target.entityKey) return;
  if (event.after && event.after.deleted === true) {
    event.metadata.committedTargetFingerprint = 'deleted';
    return;
  }
  var current = MINIAPP_auditV2CurrentTargetEntry_(ss, event, true);
  event.metadata.committedTargetFingerprint = current
    ? current.fingerprint : 'missing';
}

/**
 * Repairs only the target baseline state recorded by the committed event.
 * The current live source must still have the exact fingerprint captured in
 * journal metadata. Thus an outer request-id retry can finish a partial
 * journal/index commit, while replaying an older duplicate can never advance
 * baseline past a newer, not-yet-audited mutation.
 */
function MINIAPP_auditV2RepairBaselineIfCurrent_(ss, event) {
  var metadata = event && event.metadata && typeof event.metadata === 'object'
    ? event.metadata : {};
  if (metadata.baselineSync === false || event && event.baselineSync === false) {
    return { repaired: false, skipped: true, reason: 'BASELINE_SYNC_DISABLED' };
  }
  var expected = MINIAPP_auditV2Text_(metadata.committedTargetFingerprint, 128);
  if (!expected) {
    return { repaired: false, skipped: true, reason: 'EXPECTED_FINGERPRINT_MISSING' };
  }
  var target = event && event.target || {};
  var entityType = target.entityType;
  var entityKey = target.entityKey;
  if ((entityType !== 'participant' && entityType !== 'team') || !entityKey) {
    return { repaired: false, skipped: true, reason: 'TARGET_NOT_BASELINED' };
  }
  var sheet = ss.getSheetByName(MINIAPP_AUDIT_V2_BASELINE_SHEET);
  if (!sheet || sheet.getLastRow() < 2) {
    return { repaired: false, skipped: true, reason: 'BASELINE_NOT_INITIALIZED' };
  }

  var current = null;
  if (expected === 'deleted') {
    var snapshot = MINIAPP_auditV2BuildSnapshot_(ss);
    current = snapshot.records[entityType + '\n' + entityKey] || null;
    if (current) {
      return {
        repaired: false,
        matched: false,
        reason: 'LIVE_TARGET_NEWER',
        expectedFingerprint: expected,
        currentFingerprint: current.fingerprint
      };
    }
  } else {
    current = MINIAPP_auditV2CurrentTargetEntry_(ss, event, true);
    if (!current || current.fingerprint !== expected) {
      return {
        repaired: false,
        matched: false,
        reason: 'LIVE_TARGET_NEWER',
        expectedFingerprint: expected,
        currentFingerprint: current && current.fingerprint || 'missing'
      };
    }
  }

  if (entityType === 'team' && event.before && event.before.name) {
    var beforeGame = MINIAPP_auditV2Text_(event.before.game, 80);
    var beforeName = MINIAPP_auditV2Text_(event.before.name, 240);
    var previousKey = beforeGame && beforeName ? beforeGame + ' :: ' + beforeName : '';
    if (previousKey && previousKey !== entityKey) {
      MINIAPP_auditV2ClearBaselineEntry_(sheet, entityType, previousKey);
    }
  }

  if (expected === 'deleted') {
    MINIAPP_auditV2ClearBaselineEntry_(sheet, entityType, entityKey);
  } else {
    MINIAPP_auditV2WriteBaselineEntry_(sheet, current, event.occurredAtIso);
  }
  return { repaired: true, matched: true, fingerprint: expected };
}

function MINIAPP_auditV2CurrentTargetEntry_(ss, event, allowFullScan) {
  var entityType = event && event.target && event.target.entityType;
  var entityKey = event && event.target && event.target.entityKey;
  if (!entityType || !entityKey) return null;
  var canonicalRecord = MINIAPP_auditV2CanonicalEventRecord_(ss, event);
  if (canonicalRecord &&
      MINIAPP_auditV2RecordEntityKey_(entityType, canonicalRecord) === entityKey) {
    return MINIAPP_auditV2BaselineEntry_(
      entityType, entityKey, canonicalRecord.row, canonicalRecord
    );
  }
  if (!allowFullScan) return null;
  var snapshot = MINIAPP_auditV2BuildSnapshot_(ss);
  return snapshot.records[entityType + '\n' + entityKey] || null;
}

function MINIAPP_auditV2RecordEntityKey_(entityType, record) {
  if (entityType === 'participant') {
    return MINIAPP_auditV2Text_(record && record.telegramId, 80) ||
      'row:' + Number(record && record.row || 0);
  }
  if (entityType === 'team') {
    var game = MINIAPP_auditV2Text_(record && record.game, 80);
    var name = MINIAPP_auditV2Text_(record && record.name, 240);
    return game && name ? game + ' :: ' + name : '';
  }
  return '';
}

function MINIAPP_auditV2WriteBaselineEntry_(sheet, entry, occurredAtIso) {
  var found = MINIAPP_auditV2FindBaselineRow_(
    sheet, entry.entityType, entry.entityKey
  );
  var targetRow = found || Math.max(2, sheet.getLastRow() + 1);
  MINIAPP_auditV2EnsureRows_(sheet, targetRow);
  sheet.getRange(targetRow, 1, 1, 7).setValues([[
    entry.entityType, entry.entityKey, entry.row, entry.fingerprint,
    MINIAPP_auditV2SafeJson_(entry.record),
    occurredAtIso || new Date().toISOString(),
    MINIAPP_AUDIT_V2_SCHEMA_VERSION
  ]]);
}

function MINIAPP_auditV2ClearBaselineEntry_(sheet, entityType, entityKey) {
  var found = MINIAPP_auditV2FindBaselineRow_(sheet, entityType, entityKey);
  if (found) sheet.getRange(found, 1, 1, 7).clearContent();
}

// Compatibility alias for any older internal caller. It is intentionally
// conditional and never restores event.after blindly.
function MINIAPP_auditV2SyncBaselineForEvent_(ss, event) {
  return MINIAPP_auditV2RepairBaselineIfCurrent_(ss, event);
}

function MINIAPP_auditV2CanonicalEventRecord_(ss, event) {
  var row = Number(event && event.target && event.target.row || 0);
  if (!row || !ss) return null;
  try {
    if (event.target.entityType === 'participant') {
      var baseName = typeof SHEET_BASE !== 'undefined' ? SHEET_BASE : 'База участников';
      var base = ss.getSheetByName(baseName);
      if (!base) return null;
      return MINIAPP_auditV2ParticipantFromValues_(
        base.getRange(row, 1, 1, 32).getDisplayValues()[0], row
      );
    }
    if (event.target.entityType === 'team') {
      var teamsName = typeof SHEET_TEAMS !== 'undefined' ? SHEET_TEAMS : 'Команды';
      var teams = ss.getSheetByName(teamsName);
      if (!teams) return null;
      return MINIAPP_auditV2TeamFromValues_(
        teams.getRange(row, 1, 1, 4).getDisplayValues()[0],
        teams.getRange(row, 1, 1, 4).getValues()[0],
        row
      );
    }
  } catch (error) {
    console.warn('Audit canonical target warning', error && error.message ? error.message : error);
  }
  return null;
}

function MINIAPP_auditV2EnsureBaseline_(ss) {
  var sheet = ss.getSheetByName(MINIAPP_AUDIT_V2_BASELINE_SHEET);
  if (!sheet) sheet = ss.insertSheet(MINIAPP_AUDIT_V2_BASELINE_SHEET);
  MINIAPP_auditV2EnsureColumns_(sheet, 7);
  sheet.getRange(1, 1, 1, 7).setValues([MINIAPP_AUDIT_V2_BASELINE_HEADERS]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  MINIAPP_auditV2ProtectAndHide_(sheet, MINIAPP_AUDIT_V2_BASELINE_PROTECTION);
  return sheet;
}

function MINIAPP_auditV2FindBaselineRow_(sheet, entityType, entityKey) {
  if (!sheet || sheet.getLastRow() < 2) return 0;
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getDisplayValues();
  for (var i = 0; i < values.length; i += 1) {
    if (values[i][0] === entityType && values[i][1] === entityKey) return i + 2;
  }
  return 0;
}

/* ======================================================================= */
/* Small helpers                                                            */
/* ======================================================================= */

function MINIAPP_auditV2IsActive_() {
  try {
    return String(
      PropertiesService.getScriptProperties().getProperty(
        MINIAPP_AUDIT_V2_ACTIVE_PROPERTY
      ) || ''
    ) === MINIAPP_AUDIT_V2_ACTIVATION_TOKEN;
  } catch (_) {
    return false;
  }
}

function MINIAPP_auditV2SheetActor_(e) {
  var email = '';
  try {
    if (e && e.user && typeof e.user.getEmail === 'function') {
      email = String(e.user.getEmail() || '').trim();
    }
  } catch (_) {}
  return {
    type: 'google_user', telegramId: '', username: '', displayName: email,
    label: email || 'Редактор Google Sheets — имя недоступно'
  };
}

function MINIAPP_auditV2ManualTransactionId_(e) {
  var range = e && e.range;
  var sourceId = '';
  try { sourceId = range.getSheet().getParent().getId(); } catch (_) {}
  var seed = [
    'manual', sourceId,
    range ? range.getSheet().getName() : '',
    range ? range.getA1Notation() : '',
    e && e.oldValue !== undefined ? String(e.oldValue) : '',
    e && e.value !== undefined ? String(e.value) : '',
    new Date().toISOString(),
    Utilities.getUuid()
  ].join('|');
  return 'sheet_' + MINIAPP_auditV2Sha256_(seed).slice(0, 28);
}

/** Read-only privacy gate for all three audit service sheets. */
function MINIAPP_auditV2StorageSecurity_(ss) {
  var journalName = typeof MINIAPP_ADMIN_WRITE_JOURNAL_SHEET !== 'undefined'
    ? MINIAPP_ADMIN_WRITE_JOURNAL_SHEET : 'Админ журнал';
  var journal = MINIAPP_auditV2SheetSecurity_(
    ss && ss.getSheetByName(journalName), MINIAPP_AUDIT_V2_JOURNAL_PROTECTION
  );
  var index = MINIAPP_auditV2SheetSecurity_(
    ss && ss.getSheetByName(MINIAPP_AUDIT_V2_INDEX_SHEET),
    MINIAPP_AUDIT_V2_INDEX_PROTECTION
  );
  var baseline = MINIAPP_auditV2SheetSecurity_(
    ss && ss.getSheetByName(MINIAPP_AUDIT_V2_BASELINE_SHEET),
    MINIAPP_AUDIT_V2_BASELINE_PROTECTION
  );
  return {
    ok: journal.hidden && journal.protected &&
      index.hidden && index.protected &&
      baseline.hidden && baseline.protected,
    journalHidden: journal.hidden,
    journalProtected: journal.protected,
    indexHidden: index.hidden,
    indexProtected: index.protected,
    baselineHidden: baseline.hidden,
    baselineProtected: baseline.protected
  };
}

function MINIAPP_auditV2SheetSecurity_(sheet, description) {
  var hidden = false;
  var protectedSheet = false;
  if (!sheet) return { hidden: false, protected: false };
  try {
    hidden = typeof sheet.isSheetHidden === 'function' &&
      sheet.isSheetHidden() === true;
  } catch (_) {
    hidden = false;
  }
  try {
    var type = SpreadsheetApp.ProtectionType && SpreadsheetApp.ProtectionType.SHEET;
    var protections = type && sheet.getProtections
      ? sheet.getProtections(type) : [];
    for (var i = 0; i < protections.length; i += 1) {
      var protection = protections[i];
      if (!protection || typeof protection.getDescription !== 'function' ||
          String(protection.getDescription() || '') !== description) {
        continue;
      }
      var warningOnly = typeof protection.isWarningOnly === 'function'
        ? protection.isWarningOnly() : true;
      var domainEdit = typeof protection.canDomainEdit === 'function'
        ? protection.canDomainEdit() : true;
      if (!warningOnly && !domainEdit) {
        protectedSheet = true;
        break;
      }
    }
  } catch (_) {
    protectedSheet = false;
  }
  return { hidden: hidden, protected: protectedSheet };
}

function MINIAPP_auditV2ProtectAndHide_(sheet, description) {
  try { sheet.hideSheet(); } catch (_) {}
  try {
    var type = SpreadsheetApp.ProtectionType && SpreadsheetApp.ProtectionType.SHEET;
    var protections = type && sheet.getProtections ? sheet.getProtections(type) : [];
    var protection = null;
    for (var i = 0; i < protections.length; i += 1) {
      if (String(protections[i].getDescription() || '') === description) {
        protection = protections[i];
        break;
      }
    }
    if (!protection && sheet.protect) protection = sheet.protect().setDescription(description);
    if (!protection) return;
    protection.setWarningOnly(false);
    var effective = Session.getEffectiveUser();
    if (effective) protection.addEditor(effective);
    var effectiveEmail = effective && effective.getEmail ? effective.getEmail() : '';
    var editors = protection.getEditors ? protection.getEditors() : [];
    var remove = editors.filter(function(editor) {
      return !effectiveEmail || !editor.getEmail || editor.getEmail() !== effectiveEmail;
    });
    if (remove.length && protection.removeEditors) protection.removeEditors(remove);
    if (protection.canDomainEdit && protection.canDomainEdit()) protection.setDomainEdit(false);
  } catch (error) {
    console.warn('Audit sheet protection warning', error && error.message ? error.message : error);
  }
}

function MINIAPP_auditV2EnsureColumns_(sheet, columns) {
  if (sheet.getMaxColumns && sheet.getMaxColumns() < columns && sheet.insertColumnsAfter) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), columns - sheet.getMaxColumns());
  }
}

function MINIAPP_auditV2EnsureRows_(sheet, rows) {
  if (sheet.getMaxRows && sheet.getMaxRows() < rows && sheet.insertRowsAfter) {
    sheet.insertRowsAfter(sheet.getMaxRows(), rows - sheet.getMaxRows());
  }
}

function MINIAPP_auditV2FindExact_(sheet, column, text) {
  var last = sheet.getLastRow();
  if (last < 2) return null;
  var range = sheet.getRange(2, column, last - 1, 1);
  if (range.createTextFinder) {
    return range.createTextFinder(String(text)).matchEntireCell(true).findNext();
  }
  var values = range.getDisplayValues();
  for (var i = values.length - 1; i >= 0; i -= 1) {
    if (String(values[i][0] || '') === String(text)) {
      var foundRow = i + 2;
      return { getRow: function() { return foundRow; } };
    }
  }
  return null;
}

function MINIAPP_auditV2OutcomeSummary_(op, target, diff) {
  var actorless = {
    createParticipant: 'Участник добавлен',
    updateParticipant: 'Участник изменён',
    deleteParticipant: 'Участник удалён',
    createTeam: 'Команда добавлена',
    updateTeam: 'Команда изменена',
    deleteTeam: 'Команда удалена'
  };
  var base = actorless[String(op || '')] || 'Изменение сохранено';
  var label = target && target.label ? ' · ' + target.label : '';
  return base + label + (diff && !diff.length ? ' · фактических изменений нет' : '');
}

function MINIAPP_auditV2SourceLabel_(type) {
  if (type === 'miniapp') return 'Mini App';
  if (type === 'manual_sheet') return 'Google Sheets';
  if (type === 'bot') return 'Бот';
  if (type === 'reconcile') return 'Сверка';
  return 'Система';
}

function MINIAPP_auditV2SummaryState_(entityType, record) {
  if (entityType === 'team') {
    return {
      game: MINIAPP_auditV2Text_(record && record.game, 80),
      name: MINIAPP_auditV2Text_(record && record.name, 240),
      leader: MINIAPP_auditV2Text_(record && record.leader, 240)
    };
  }
  return {
    name: MINIAPP_auditV2Text_(record && (record.name || record.telegramName || record.username), 240),
    memberships: MINIAPP_auditV2MembershipMap_(record && record.memberships)
  };
}

function MINIAPP_auditV2HasIdentity_(record) {
  return !!(record && (
    record.telegramId || record.name || record.telegramName || record.username || record.game
  ));
}

function MINIAPP_auditV2CanonicalGame_(value, teamRaw) {
  var text = MINIAPP_auditV2Text_(value, 120).toLocaleLowerCase('ru-RU');
  if (text === 'рм' || text.indexOf('royal match') >= 0) return 'Royal Match';
  if (text === 'рк' || text.indexOf('royal kingdom') >= 0) return 'Royal Kingdom';
  var suffix = MINIAPP_auditV2Text_(teamRaw, 300).match(/\s+—\s+(РМ|РК)$/u);
  return suffix ? (suffix[1] === 'РМ' ? 'Royal Match' : 'Royal Kingdom') : '';
}

function MINIAPP_auditV2Sanitize_(value, key, seen) {
  if (value === null || value === undefined) return value === undefined ? null : value;
  var type = typeof value;
  if (type === 'string') {
    var text = value;
    if (/^(?:https?:\/\/|data:)/i.test(text)) return '[скрытый адрес]';
    return text.length > 4000 ? text.slice(0, 4000) + '…' : text;
  }
  if (type === 'number' || type === 'boolean') return value;
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return isNaN(value.getTime()) ? '' : value.toISOString();
  }
  if (type !== 'object') return String(value);
  seen = seen || [];
  if (seen.indexOf(value) !== -1) return '[циклическое значение]';
  seen.push(value);
  if (Array.isArray(value)) {
    var list = value.slice(0, 200).map(function(item) {
      return MINIAPP_auditV2Sanitize_(item, '', seen);
    });
    seen.pop();
    return list;
  }
  var out = {};
  Object.keys(value).slice(0, 200).forEach(function(name) {
    var low = String(name).toLowerCase();
    if (/^(data|base64|token|secret|signature|sourceurl|photourl|endpoint|url)$/.test(low)) {
      out[name] = '[скрыто]';
      return;
    }
    out[name] = MINIAPP_auditV2Sanitize_(value[name], name, seen);
  });
  seen.pop();
  return out;
}

function MINIAPP_auditV2SafeJson_(value) {
  var text = JSON.stringify(MINIAPP_auditV2Sanitize_(value));
  if (text.length <= MINIAPP_AUDIT_V2_CELL_JSON_LIMIT) return text;
  return JSON.stringify({
    truncated: true,
    originalLength: text.length,
    preview: text.slice(0, MINIAPP_AUDIT_V2_CELL_JSON_LIMIT - 200)
  });
}

function MINIAPP_auditV2ParseJson_(value, fallback) {
  try { return JSON.parse(String(value || '')); } catch (_) { return fallback; }
}

function MINIAPP_auditV2Sha256_(value) {
  if (typeof MINIAPP_adminWriteSha256_ === 'function') {
    return MINIAPP_adminWriteSha256_(String(value || ''));
  }
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value || ''),
    Utilities.Charset.UTF_8
  );
  return bytes.map(function(byte) {
    var number = byte < 0 ? byte + 256 : byte;
    return ('0' + number.toString(16)).slice(-2);
  }).join('');
}

function MINIAPP_auditV2StableJson_(value) {
  function stable(input) {
    if (!input || typeof input !== 'object') return input;
    if (Array.isArray(input)) return input.map(stable);
    var out = {};
    Object.keys(input).sort().forEach(function(key) { out[key] = stable(input[key]); });
    return out;
  }
  return JSON.stringify(stable(value));
}

function MINIAPP_auditV2Comparable_(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return MINIAPP_auditV2StableJson_(value);
  return String(value).trim();
}

function MINIAPP_auditV2Scalar_(value) {
  if (value === null || value === undefined || value === '') return null;
  return MINIAPP_auditV2Sanitize_(value);
}

function MINIAPP_auditV2Text_(value, limit) {
  var text = value === null || value === undefined ? '' : String(value).trim();
  return limit && text.length > limit ? text.slice(0, limit) : text;
}

function MINIAPP_auditV2UniqueStrings_(list) {
  var seen = {};
  var out = [];
  (list || []).forEach(function(value) {
    var text = MINIAPP_auditV2Text_(value, 200);
    if (!text || seen[text]) return;
    seen[text] = true;
    out.push(text);
  });
  return out;
}

function MINIAPP_auditV2Clone_(value) {
  try { return JSON.parse(JSON.stringify(value || {})); } catch (_) { return {}; }
}

function MINIAPP_auditV2Merge_(left, right) {
  var out = {};
  Object.keys(left || {}).forEach(function(key) { out[key] = left[key]; });
  Object.keys(right || {}).forEach(function(key) { out[key] = right[key]; });
  return out;
}

function MINIAPP_auditV2Timezone_() {
  try { return String(Session.getScriptTimeZone() || 'Europe/Moscow'); }
  catch (_) { return 'Europe/Moscow'; }
}
