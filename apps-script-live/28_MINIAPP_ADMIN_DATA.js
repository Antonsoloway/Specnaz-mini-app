/*
 * Royal CRM / Таблица ЧП
 * 28_MINIAPP_ADMIN_DATA.js
 * v0.6.0-write.5
 *
 * PRIVATE admin snapshot for Mini App v0.6.
 * - Does NOT change the stable user snapshot.json contract.
 * - Writes a separate private admin-snapshot.json.
 * - Normal users never receive this file.
 * - Worker /admin-data must perform a fresh Telegram administrator/creator check.
 * - Admin mutations only queue this export and return after the Sheet commit.
 * - Sheet reads happen under ScriptLock; GitHub I/O happens after that lock is
 *   released, so snapshot publishing never extends the write transaction.
 * - A deduplicated one-off trigger publishes the private snapshot in background;
 *   the existing five-minute unified trigger remains the durable fallback.
 */

var MINIAPP_ADMIN_DATA_VERSION = '0.6.0-write.5';
var MINIAPP_ADMIN_DATA_DEFAULT_PATH = 'admin-snapshot.json';
var MINIAPP_ADMIN_DATA_LAST_HASH = 'MINIAPP_ADMIN_DATA_LAST_HASH';
var MINIAPP_ADMIN_SNAPSHOT_QUEUE_HANDLER = 'MINIAPP_flushQueuedAdminSnapshot';
var MINIAPP_ADMIN_SNAPSHOT_QUEUE_PROPERTY = 'MINIAPP_ADMIN_SNAPSHOT_QUEUE_V1';
var MINIAPP_ADMIN_SNAPSHOT_QUEUE_MAX_ATTEMPTS = 4;
var MINIAPP_ADMIN_SNAPSHOT_QUEUE_DELAY_MS = 1500;

function MINIAPP_exportAdminSnapshotToGitHub() {
  var queued = MINIAPP_adminSnapshotQueueRead_();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return { ok: false, skipped: true, reason: 'LOCK_BUSY' };
  var prepared;
  try {
    var props = PropertiesService.getScriptProperties();
    var repo = String(props.getProperty('DATA_GITHUB_REPO') || '').trim();
    var token = String(props.getProperty('DATA_GITHUB_TOKEN') || '').trim();
    var branch = String(props.getProperty('DATA_GITHUB_BRANCH') || 'main').trim();
    prepared = MINIAPP_prepareAdminSnapshot_(props, repo, token, branch);
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }

  var publishLock = LockService.getUserLock();
  if (!publishLock.tryLock(20000)) {
    return { ok: false, queued: !!queued, skipped: true, reason: 'PUBLISH_BUSY' };
  }
  try {
    if (queued && queued.token) {
      var current = MINIAPP_adminSnapshotQueueRead_();
      if (!current || current.token !== queued.token) {
        MINIAPP_adminSnapshotQueueEnsureTrigger_(MINIAPP_ADMIN_SNAPSHOT_QUEUE_DELAY_MS);
        return { ok: true, skipped: true, reason: 'SUPERSEDED' };
      }
    }
    var published = MINIAPP_publishPreparedAdminSnapshot_(prepared);
    if (queued && queued.token) MINIAPP_adminSnapshotQueueClearIfToken_(queued.token);
    return published;
  } finally {
    try { publishLock.releaseLock(); } catch (_) {}
  }
}

/**
 * Compatibility wrapper for older callers that already own ScriptLock.
 * New code should use MINIAPP_prepareAdminSnapshot_ under the lock and publish
 * only after releasing it.
 */
function MINIAPP_exportAdminSnapshotUnlocked_(props, repo, token, branch) {
  return MINIAPP_publishPreparedAdminSnapshot_(
    MINIAPP_prepareAdminSnapshot_(props, repo, token, branch)
  );
}

function MINIAPP_prepareAdminSnapshot_(props, repo, token, branch) {
  if (typeof MINIAPP_putPrivateGitHubFile_ !== 'function') {
    throw new Error('Admin snapshot: MINIAPP_putPrivateGitHubFile_ missing');
  }
  props = props || PropertiesService.getScriptProperties();
  repo = String(repo || props.getProperty('DATA_GITHUB_REPO') || '').trim();
  token = String(token || props.getProperty('DATA_GITHUB_TOKEN') || '').trim();
  branch = String(branch || props.getProperty('DATA_GITHUB_BRANCH') || 'main').trim();
  var path = String(props.getProperty('DATA_GITHUB_ADMIN_PATH') || MINIAPP_ADMIN_DATA_DEFAULT_PATH).trim();
  if (!repo || !token) throw new Error('Admin snapshot: DATA_GITHUB_REPO / DATA_GITHUB_TOKEN missing');

  var adminData = MINIAPP_buildAdminData_();
  var hashBasis = {
    version: adminData.version,
    participants: adminData.participants,
    teams: adminData.teams,
    stats: adminData.stats,
    journal: adminData.journal
  };
  var hash = MINIAPP_adminSha256_(JSON.stringify(hashBasis));
  var lastHash = String(props.getProperty(MINIAPP_ADMIN_DATA_LAST_HASH) || '').trim();

  if (lastHash && lastHash === hash) {
    return {
      ok: true,
      changed: false,
      version: MINIAPP_ADMIN_DATA_VERSION,
      participants: adminData.participants.length,
      teams: adminData.teams.length,
      hash: hash,
      prepared: true
    };
  }

  var nowIso = new Date().toISOString();
  adminData.generatedAt = nowIso;
  var payload = {
    schemaVersion: '0.6.0-admin.1',
    generatedAt: nowIso,
    source: 'Royal CRM / Таблица ЧП / ADMIN PRIVATE',
    dataHash: hash,
    adminData: adminData
  };

  return {
    ok: true,
    changed: true,
    version: MINIAPP_ADMIN_DATA_VERSION,
    participants: adminData.participants.length,
    teams: adminData.teams.length,
    hash: hash,
    prepared: true,
    _props: props,
    _repo: repo,
    _token: token,
    _branch: branch,
    _path: path,
    _payload: JSON.stringify(payload)
  };
}

function MINIAPP_publishPreparedAdminSnapshot_(prepared) {
  if (!prepared || prepared.ok === false) return prepared;
  if (!prepared.changed) return MINIAPP_adminSnapshotPublicResult_(prepared);

  var github = MINIAPP_putPrivateGitHubFile_(
    prepared._repo,
    prepared._branch,
    prepared._path,
    prepared._payload,
    prepared._token,
    prepared.hash
  );
  prepared._props.setProperty(MINIAPP_ADMIN_DATA_LAST_HASH, prepared.hash);

  var result = MINIAPP_adminSnapshotPublicResult_(prepared);
  result.github = github;
  return result;
}

function MINIAPP_adminSnapshotPublicResult_(prepared) {
  return {
    ok: prepared && prepared.ok !== false,
    changed: !!(prepared && prepared.changed),
    version: prepared && prepared.version || MINIAPP_ADMIN_DATA_VERSION,
    participants: Number(prepared && prepared.participants || 0),
    teams: Number(prepared && prepared.teams || 0),
    hash: String(prepared && prepared.hash || '')
  };
}

/**
 * Commit-first queue entrypoint called by admin-write while it still owns the
 * short mutation lock. No Sheet read or external request is performed here.
 */
function MINIAPP_queueAdminSnapshotRefresh_(reason) {
  var props = PropertiesService.getScriptProperties();
  var queuedAt = new Date().toISOString();
  var token = Utilities.getUuid().replace(/-/g, '');
  var item = {
    token: token,
    queuedAt: queuedAt,
    reason: String(reason || 'admin-write').slice(0, 300),
    attempts: 0
  };
  props.setProperty(MINIAPP_ADMIN_SNAPSHOT_QUEUE_PROPERTY, JSON.stringify(item));

  var schedule = MINIAPP_adminSnapshotQueueEnsureTrigger_(MINIAPP_ADMIN_SNAPSHOT_QUEUE_DELAY_MS);
  return {
    ok: true,
    queued: true,
    mode: 'queued-private-trigger',
    response: 'commit-first',
    token: token,
    queuedAt: queuedAt,
    scheduled: schedule.created === true || schedule.existing === true,
    deduplicated: schedule.existing === true,
    fallback: 'unified-5-minute-trigger',
    warning: schedule.warning || ''
  };
}

/** Time-driven handler. Never mutates participant or team source cells. */
function MINIAPP_flushQueuedAdminSnapshot() {
  MINIAPP_adminSnapshotQueueClearOwnTriggers_();
  var item = MINIAPP_adminSnapshotQueueRead_();
  if (!item || !item.token) return { ok: true, skipped: true, reason: 'QUEUE_EMPTY' };

  var lock = LockService.getScriptLock();
  var prepared;
  if (!lock.tryLock(4000)) {
    return MINIAPP_adminSnapshotQueueRetry_(item, 'SOURCE_LOCK_BUSY');
  }
  try {
    var props = PropertiesService.getScriptProperties();
    prepared = MINIAPP_prepareAdminSnapshot_(
      props,
      String(props.getProperty('DATA_GITHUB_REPO') || '').trim(),
      String(props.getProperty('DATA_GITHUB_TOKEN') || '').trim(),
      String(props.getProperty('DATA_GITHUB_BRANCH') || 'main').trim()
    );
  } catch (prepareError) {
    return MINIAPP_adminSnapshotQueueRetry_(
      item,
      'PREPARE_FAILED: ' + String(prepareError && prepareError.message ? prepareError.message : prepareError)
    );
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }

  // Do not publish an older capture if another mutation was queued while the
  // Sheet was being read. The next trigger will capture the newest state.
  var current = MINIAPP_adminSnapshotQueueRead_();
  if (!current || current.token !== item.token) {
    MINIAPP_adminSnapshotQueueEnsureTrigger_(MINIAPP_ADMIN_SNAPSHOT_QUEUE_DELAY_MS);
    return { ok: true, skipped: true, reason: 'SUPERSEDED' };
  }

  // UserLock is used only for private-snapshot network publication. Admin writes
  // never acquire it, while overlapping queue handlers cannot publish out of order.
  var publishLock = LockService.getUserLock();
  if (!publishLock.tryLock(20000)) {
    return MINIAPP_adminSnapshotQueueRetry_(item, 'PUBLISH_BUSY');
  }
  try {
    current = MINIAPP_adminSnapshotQueueRead_();
    if (!current || current.token !== item.token) {
      MINIAPP_adminSnapshotQueueEnsureTrigger_(MINIAPP_ADMIN_SNAPSHOT_QUEUE_DELAY_MS);
      return { ok: true, skipped: true, reason: 'SUPERSEDED_BEFORE_PUBLISH' };
    }

    var published = MINIAPP_publishPreparedAdminSnapshot_(prepared);
    MINIAPP_adminSnapshotQueueClearIfToken_(item.token);
    return published;
  } catch (publishError) {
    return MINIAPP_adminSnapshotQueueRetry_(
      item,
      'PUBLISH_FAILED: ' + String(publishError && publishError.message ? publishError.message : publishError)
    );
  } finally {
    try { publishLock.releaseLock(); } catch (_) {}
  }
}

function MINIAPP_adminSnapshotQueueRead_() {
  var raw = String(PropertiesService.getScriptProperties()
    .getProperty(MINIAPP_ADMIN_SNAPSHOT_QUEUE_PROPERTY) || '').trim();
  if (!raw) return null;
  try {
    var item = JSON.parse(raw);
    return item && typeof item === 'object' ? item : null;
  } catch (_) {
    return null;
  }
}

function MINIAPP_adminSnapshotQueueRetry_(item, reason) {
  var props = PropertiesService.getScriptProperties();
  var current = MINIAPP_adminSnapshotQueueRead_();
  if (!current || !item || current.token !== item.token) {
    MINIAPP_adminSnapshotQueueEnsureTrigger_(MINIAPP_ADMIN_SNAPSHOT_QUEUE_DELAY_MS);
    return { ok: false, skipped: true, reason: 'SUPERSEDED_RETRY' };
  }

  current.attempts = Number(current.attempts || 0) + 1;
  current.lastError = String(reason || 'UNKNOWN').slice(0, 500);
  current.lastAttemptAt = new Date().toISOString();
  props.setProperty(MINIAPP_ADMIN_SNAPSHOT_QUEUE_PROPERTY, JSON.stringify(current));

  var scheduled = false;
  if (current.attempts < MINIAPP_ADMIN_SNAPSHOT_QUEUE_MAX_ATTEMPTS) {
    var delay = MINIAPP_ADMIN_SNAPSHOT_QUEUE_DELAY_MS * Math.pow(2, current.attempts);
    var schedule = MINIAPP_adminSnapshotQueueEnsureTrigger_(delay);
    scheduled = schedule.created === true || schedule.existing === true;
  }
  return {
    ok: false,
    queued: true,
    retry: scheduled,
    attempts: current.attempts,
    reason: current.lastError,
    fallback: 'unified-5-minute-trigger'
  };
}

function MINIAPP_adminSnapshotQueueEnsureTrigger_(delayMs) {
  try {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i += 1) {
      if (String(triggers[i].getHandlerFunction() || '') === MINIAPP_ADMIN_SNAPSHOT_QUEUE_HANDLER) {
        return { ok: true, existing: true, created: false };
      }
    }
    ScriptApp.newTrigger(MINIAPP_ADMIN_SNAPSHOT_QUEUE_HANDLER)
      .timeBased()
      .after(Math.max(1000, Number(delayMs) || MINIAPP_ADMIN_SNAPSHOT_QUEUE_DELAY_MS))
      .create();
    return { ok: true, existing: false, created: true };
  } catch (error) {
    return {
      ok: false,
      existing: false,
      created: false,
      warning: String(error && error.message ? error.message : error || 'TRIGGER_CREATE_FAILED')
    };
  }
}

function MINIAPP_adminSnapshotQueueClearOwnTriggers_() {
  try {
    ScriptApp.getProjectTriggers().forEach(function(trigger) {
      if (String(trigger.getHandlerFunction() || '') === MINIAPP_ADMIN_SNAPSHOT_QUEUE_HANDLER) {
        ScriptApp.deleteTrigger(trigger);
      }
    });
  } catch (_) {}
}

function MINIAPP_adminSnapshotQueueClearIfToken_(token) {
  var props = PropertiesService.getScriptProperties();
  var current = MINIAPP_adminSnapshotQueueRead_();
  if (!current || current.token !== String(token || '')) return false;
  props.deleteProperty(MINIAPP_ADMIN_SNAPSHOT_QUEUE_PROPERTY);
  return true;
}

function MINIAPP_buildAdminData_() {
  if (typeof SPREADSHEET_ID === 'undefined' || typeof SHEET_BASE === 'undefined' || typeof SHEET_TEAMS === 'undefined') {
    throw new Error('Admin data: CRM globals missing');
  }
  if (typeof SLOT_DEFS === 'undefined' || !Array.isArray(SLOT_DEFS)) {
    throw new Error('Admin data: SLOT_DEFS missing');
  }

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var base = ss.getSheetByName(SHEET_BASE);
  var teamsSheet = ss.getSheetByName(SHEET_TEAMS);
  if (!base) throw new Error('Admin data: лист «' + SHEET_BASE + '» не найден');
  if (!teamsSheet) throw new Error('Admin data: лист «' + SHEET_TEAMS + '» не найден');

  var participants = MINIAPP_adminReadParticipants_(base);
  var teams = MINIAPP_adminReadTeams_(ss, teamsSheet);

  // v0.6 final write: revisions include every field an admin can edit.
  if (typeof MINIAPP_adminWriteFinalDecorateRevisions_ === 'function') {
    MINIAPP_adminWriteFinalDecorateRevisions_(participants, teams);
  }

  var inChat = 0;
  var exited = 0;
  participants.forEach(function(p) {
    var state = String(p.chatState || '').trim();
    if (state === 'В чате') inChat += 1;
    if (state === 'Вышел' || String(p.status || '').trim() === 'Вышел') exited += 1;
  });

  var activeTeams = 0;
  var pausedTeams = 0;
  var inactiveTeams = 0;
  teams.forEach(function(t) {
    var status = String(t.status || '').trim();
    if (status === 'Активен') activeTeams += 1;
    else if (status === 'На паузе') pausedTeams += 1;
    else if (status === 'Неактивен') inactiveTeams += 1;
  });

  return {
    version: MINIAPP_ADMIN_DATA_VERSION,
    participants: participants,
    teams: teams,
    write: typeof MINIAPP_adminWriteFinalMeta_ === 'function'
      ? MINIAPP_adminWriteFinalMeta_()
      : { enabled: false, deleteEnabled: false, transport: 'disabled' },
    stats: {
      participants: participants.length,
      inChat: inChat,
      exited: exited,
      teams: teams.length,
      activeTeams: activeTeams,
      pausedTeams: pausedTeams,
      inactiveTeams: inactiveTeams
    },
    journal: typeof MINIAPP_adminWriteFinalJournalData_ === 'function'
      ? MINIAPP_adminWriteFinalJournalData_()
      : { version: '0.6.0-read', rows: [] }
  };
}

function MINIAPP_adminReadParticipants_(sheet) {
  var firstRow = typeof BASE_FIRST_ROW !== 'undefined' ? Number(BASE_FIRST_ROW) : 2;
  var configuredLast = typeof BASE_LAST_ROW !== 'undefined' ? Number(BASE_LAST_ROW) : sheet.getMaxRows();
  var lastRow = Math.min(sheet.getLastRow(), configuredLast);
  if (lastRow < firstRow) return [];

  var width = Math.max(32, typeof COL_CHAT_STATE !== 'undefined' ? Number(COL_CHAT_STATE) : 32);
  var rows = sheet.getRange(firstRow, 1, lastRow - firstRow + 1, width).getDisplayValues();
  var out = [];

  rows.forEach(function(row, index) {
    var telegramId = MINIAPP_adminTelegramId_(row[3]);
    var name = MINIAPP_adminValue_(row[0]);
    var telegramName = MINIAPP_adminValue_(row[1]);
    var username = MINIAPP_adminValue_(row[2]);
    var status = MINIAPP_adminValue_(row[19]);
    var chatState = MINIAPP_adminValue_(row[31]);

    var memberships = [];
    SLOT_DEFS.forEach(function(slot) {
      var teamRaw = MINIAPP_adminValue_(row[Number(slot.teamCol) - 1]);
      var nickname = MINIAPP_adminValue_(row[Number(slot.nickCol) - 1]);
      var role = MINIAPP_adminValue_(row[Number(slot.roleCol) - 1]);
      var gameRaw = MINIAPP_adminValue_(row[Number(slot.gameCol) - 1]);
      if (!teamRaw && !nickname && !role && !gameRaw) return;

      var team = typeof MINIAPP_snapshotStripGameSuffix_ === 'function'
        ? MINIAPP_snapshotStripGameSuffix_(teamRaw)
        : teamRaw.replace(/\s+—\s+(РМ|РК)$/u, '');
      var game = typeof MINIAPP_snapshotCanonicalGame_ === 'function'
        ? MINIAPP_snapshotCanonicalGame_(gameRaw, teamRaw)
        : gameRaw;
      var teamKey = team && typeof MINIAPP_snapshotTeamKey_ === 'function'
        ? MINIAPP_snapshotTeamKey_(team, game)
        : '';

      memberships.push({
        slot: Number(slot.number || memberships.length + 1),
        team: team,
        teamRaw: teamRaw,
        teamKey: teamKey,
        nickname: nickname,
        role: role,
        game: game
      });
    });

    // Do not include padded technical rows where formulas leave only zero counters.
    // A real CRM participant must have identity/status/chat-state/membership data.
    var hasAdminData = !!(name || telegramName || username || telegramId || memberships.length || status || chatState);
    if (!hasAdminData) return;

    out.push({
      row: firstRow + index,
      telegramId: telegramId,
      name: name,
      telegramName: telegramName,
      username: username,
      memberships: memberships,
      status: status,
      specnaz: MINIAPP_adminNumberOrText_(row[20]),
      date: MINIAPP_adminValue_(row[21]),
      screens: MINIAPP_adminNumberOrText_(row[27]),
      activityBase: MINIAPP_adminNumberOrText_(row[28]),
      activityOutside: MINIAPP_adminNumberOrText_(row[29]),
      lastChange: MINIAPP_adminValue_(row[30]),
      chatState: chatState
    });
  });

  out.sort(function(a, b) {
    var an = String(a.name || a.telegramName || a.username || a.telegramId || '');
    var bn = String(b.name || b.telegramName || b.username || b.telegramId || '');
    return an.localeCompare(bn, 'ru', { sensitivity: 'base' });
  });
  return out;
}

function MINIAPP_adminReadTeams_(ss, sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var count = lastRow - 1;
  var display = sheet.getRange(2, 1, count, 12).getDisplayValues();
  var photoMap = typeof MINIAPP_snapshotLoadTeamPhotoMap_ === 'function'
    ? MINIAPP_snapshotLoadTeamPhotoMap_(ss)
    : {};
  var out = [];

  display.forEach(function(row, index) {
    var gameRaw = MINIAPP_adminValue_(row[0]);
    var nameRaw = MINIAPP_adminValue_(row[1]);
    var name = typeof MINIAPP_snapshotStripGameSuffix_ === 'function'
      ? MINIAPP_snapshotStripGameSuffix_(nameRaw)
      : nameRaw.replace(/\s+—\s+(РМ|РК)$/u, '');
    var game = typeof MINIAPP_snapshotCanonicalGame_ === 'function'
      ? MINIAPP_snapshotCanonicalGame_(gameRaw, nameRaw)
      : gameRaw;
    var status = MINIAPP_adminValue_(row[11]);

    // A real team row always has at least game/name/status. This also preserves
    // intentionally empty/inactive teams while excluding padded blank rows.
    var hasData = !!(name || game || status);
    if (!hasData) return;

    var key = name && typeof MINIAPP_snapshotTeamKey_ === 'function'
      ? MINIAPP_snapshotTeamKey_(name, game)
      : '';

    out.push({
      row: index + 2,
      key: key,
      game: game,
      name: name,
      photoUrl: key ? MINIAPP_adminValue_(photoMap[key]) : '',
      leader: MINIAPP_adminValue_(row[3]),
      players: MINIAPP_adminNumberOrText_(row[4]),
      specnazTrips: MINIAPP_adminNumberOrText_(row[5]),
      sort: MINIAPP_adminNumberOrText_(row[6]),
      screens: MINIAPP_adminNumberOrText_(row[7]),
      activityBase: MINIAPP_adminNumberOrText_(row[8]),
      activityOutside: MINIAPP_adminNumberOrText_(row[9]),
      average: MINIAPP_adminNumberOrText_(row[10]),
      status: status
    });
  });

  out.sort(function(a, b) {
    var byGame = String(a.game || '').localeCompare(String(b.game || ''), 'ru', { sensitivity: 'base' });
    if (byGame) return byGame;
    return String(a.name || '').localeCompare(String(b.name || ''), 'ru', { sensitivity: 'base' });
  });
  return out;
}

function MINIAPP_adminNumberOrText_(value) {
  var text = MINIAPP_adminValue_(value);
  if (!text) return '';
  var normalized = text.replace(/\s+/g, '').replace(',', '.');
  if (/^-?\d+(?:\.\d+)?$/.test(normalized)) {
    var number = Number(normalized);
    if (isFinite(number)) return number;
  }
  return text;
}

function MINIAPP_adminTelegramId_(value) {
  var text = MINIAPP_adminValue_(value).replace(/^'/, '').replace(/\.0$/, '');
  var match = text.match(/\d{5,20}/);
  return match ? match[0] : '';
}

function MINIAPP_adminSha256_(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text || ''), Utilities.Charset.UTF_8);
  return bytes.map(function(b) {
    var n = b < 0 ? b + 256 : b;
    return ('0' + n.toString(16)).slice(-2);
  }).join('');
}

function MINIAPP_adminValue_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}
