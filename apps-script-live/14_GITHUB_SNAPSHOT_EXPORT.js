/**
 * ROYAL CRM — Private GitHub Snapshot Export
 * Файл: 14_GITHUB_SNAPSHOT_EXPORT.gs
 * Версия 1.1.0
 *
 * Google Sheets остаётся источником истины.
 * Модуль собирает JSON-снимок CRM и коммитит его в приватный GitHub.
 * Дополнительно передаёт:
 *   - Telegram avatar file_id из скрытого листа «Аватары»;
 *   - фото команд из колонки «Фото» листа «Команды», если это CellImage/IMAGE().
 *
 * Не объявляет doGet/doPost и не вмешивается в webhook/CRM.
 */

const MINIAPP_SNAPSHOT_VERSION = '1.2.1';
const MINIAPP_SNAPSHOT_PROP_REPO = 'DATA_GITHUB_REPO';
const MINIAPP_SNAPSHOT_PROP_TOKEN = 'DATA_GITHUB_TOKEN';
const MINIAPP_SNAPSHOT_PROP_BRANCH = 'DATA_GITHUB_BRANCH';
const MINIAPP_SNAPSHOT_PROP_PATH = 'DATA_GITHUB_PATH';
const MINIAPP_SNAPSHOT_PROP_LAST_HASH = 'DATA_GITHUB_LAST_HASH';
const MINIAPP_SNAPSHOT_AVATARS_SHEET = 'Аватары';
const MINIAPP_SNAPSHOT_TEAMS_SHEET = 'Команды';

function MINIAPP_exportSnapshotToGitHub() {
  const props = PropertiesService.getScriptProperties();
  const repo = MINIAPP_snapshotValue_(props.getProperty(MINIAPP_SNAPSHOT_PROP_REPO));
  const token = MINIAPP_snapshotValue_(props.getProperty(MINIAPP_SNAPSHOT_PROP_TOKEN));
  const branch = MINIAPP_snapshotValue_(props.getProperty(MINIAPP_SNAPSHOT_PROP_BRANCH)) || 'main';
  const path = MINIAPP_snapshotValue_(props.getProperty(MINIAPP_SNAPSHOT_PROP_PATH)) || 'snapshot.json';

  if (!repo || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new Error('Script Property DATA_GITHUB_REPO не задана или имеет неверный формат owner/repo');
  }
  if (!token) throw new Error('Script Property DATA_GITHUB_TOKEN не задана');

  const stable = MINIAPP_buildStableSnapshot_();
  const stableJson = JSON.stringify(stable);
  const dataHash = MINIAPP_snapshotSha256_(stableJson);
  const lastHash = MINIAPP_snapshotValue_(props.getProperty(MINIAPP_SNAPSHOT_PROP_LAST_HASH));

  if (lastHash && lastHash === dataHash) {
    return {
      ok: true,
      changed: false,
      version: MINIAPP_SNAPSHOT_VERSION,
      hash: dataHash,
      participants: stable.participants.length,
      teams: stable.teams.length
    };
  }

  const payload = {
    schemaVersion: MINIAPP_SNAPSHOT_VERSION,
    generatedAt: new Date().toISOString(),
    source: 'Royal CRM / Таблица ЧП',
    dataHash: dataHash,
    participants: stable.participants,
    teams: stable.teams,
    stats: stable.stats
  };

  const json = JSON.stringify(payload);
  const result = MINIAPP_putPrivateGitHubFile_(repo, branch, path, json, token, dataHash);

  props.setProperty(MINIAPP_SNAPSHOT_PROP_LAST_HASH, dataHash);

  return {
    ok: true,
    changed: true,
    version: MINIAPP_SNAPSHOT_VERSION,
    hash: dataHash,
    participants: stable.participants.length,
    teams: stable.teams.length,
    github: result
  };
}

function MINIAPP_buildStableSnapshot_() {
  if (typeof SPREADSHEET_ID === 'undefined' || typeof SHEET_BASE === 'undefined') {
    throw new Error('Не найдены глобальные настройки CRM SPREADSHEET_ID / SHEET_BASE');
  }
  if (typeof SLOT_DEFS === 'undefined' || !Array.isArray(SLOT_DEFS)) {
    throw new Error('Не найдена структура CRM SLOT_DEFS');
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_BASE);
  if (!sheet) throw new Error('Лист «' + SHEET_BASE + '» не найден');

  const avatarFileMap = MINIAPP_snapshotLoadAvatarFileMap_(ss);
  const teamPhotoMap = MINIAPP_snapshotLoadTeamPhotoMap_(ss);

  const firstRow = typeof BASE_FIRST_ROW !== 'undefined' ? Number(BASE_FIRST_ROW) : 2;
  const configuredLast = typeof BASE_LAST_ROW !== 'undefined' ? Number(BASE_LAST_ROW) : sheet.getMaxRows();
  const lastRow = Math.min(sheet.getLastRow(), configuredLast);

  if (lastRow < firstRow) {
    return { participants: [], teams: [], stats: { participants: 0, inChat: 0, teams: 0 } };
  }

  const requiredCols = [COL_NAME, COL_TG_NAME, COL_TG_USERNAME, COL_TG_ID, COL_CHAT_STATE];
  SLOT_DEFS.forEach(function(slot) {
    requiredCols.push(slot.teamCol, slot.nickCol, slot.roleCol, slot.gameCol);
  });
  const maxCol = Math.max.apply(null, requiredCols.map(Number));

  const rows = sheet.getRange(firstRow, 1, lastRow - firstRow + 1, maxCol).getDisplayValues();
  const participants = [];
  const teamMap = {};
  let inChatCount = 0;

  rows.forEach(function(row, index) {
    const name = MINIAPP_snapshotValue_(row[COL_NAME - 1]);
    const telegramName = MINIAPP_snapshotValue_(row[COL_TG_NAME - 1]);
    const username = MINIAPP_snapshotValue_(row[COL_TG_USERNAME - 1]);
    const telegramId = MINIAPP_snapshotNormalizeTelegramId_(row[COL_TG_ID - 1]);
    const chatState = MINIAPP_snapshotValue_(row[COL_CHAT_STATE - 1]);

    const memberships = [];
    SLOT_DEFS.forEach(function(slot) {
      const teamRaw = MINIAPP_snapshotValue_(row[slot.teamCol - 1]);
      const nickname = MINIAPP_snapshotValue_(row[slot.nickCol - 1]);
      const role = MINIAPP_snapshotValue_(row[slot.roleCol - 1]);
      const game = MINIAPP_snapshotValue_(row[slot.gameCol - 1]);
      if (!teamRaw && !nickname && !role && !game) return;

      const team = MINIAPP_snapshotStripGameSuffix_(teamRaw);
      const teamGame = MINIAPP_snapshotCanonicalGame_(game, teamRaw);
      const teamKey = team ? MINIAPP_snapshotTeamKey_(team, teamGame) : '';
      const membership = {
        slot: Number(slot.number || memberships.length + 1),
        team: team,
        teamRaw: teamRaw,
        teamKey: teamKey,
        nickname: nickname,
        role: role,
        game: teamGame
      };
      memberships.push(membership);

      if (team) {
        const key = teamKey;
        if (!teamMap[key]) {
          teamMap[key] = {
            key: key,
            name: team,
            game: teamGame,
            games: {},
            members: [],
            leaderCount: 0,
            assistantCount: 0,
            playerCount: 0,
            photoUrl: MINIAPP_snapshotValue_(teamPhotoMap[key])
          };
        }
        const teamObj = teamMap[key];
        if (!teamObj.photoUrl && teamPhotoMap[key]) teamObj.photoUrl = MINIAPP_snapshotValue_(teamPhotoMap[key]);
        if (teamGame) teamObj.games[teamGame] = true;
        if (telegramId) teamObj.members.push(telegramId);
        if (role === 'Лидер') teamObj.leaderCount++;
        else if (role === 'Помощник') teamObj.assistantCount++;
        else if (role === 'Игрок') teamObj.playerCount++;
      }
    });

    if (!name && !telegramName && !username && !telegramId && memberships.length === 0) return;
    if (chatState === 'В чате') inChatCount++;

    participants.push({
      row: firstRow + index,
      telegramId: telegramId,
      name: name,
      telegramName: telegramName,
      username: username,
      avatarFileId: telegramId ? MINIAPP_snapshotValue_(avatarFileMap[telegramId]) : '',
      chatState: chatState,
      memberships: memberships
    });
  });

  participants.sort(function(a, b) {
    return (a.name || a.telegramName || a.username || '').localeCompare(
      b.name || b.telegramName || b.username || '', 'ru', { sensitivity: 'base' }
    );
  });

  const teams = Object.keys(teamMap).map(function(key) {
    const team = teamMap[key];
    const uniqueMembers = MINIAPP_snapshotUnique_(team.members);
    return {
      key: team.key || key,
      name: team.name,
      game: team.game || '',
      games: team.game ? [team.game] : Object.keys(team.games).sort(),
      photoUrl: MINIAPP_snapshotValue_(team.photoUrl),
      memberTelegramIds: uniqueMembers,
      memberCount: uniqueMembers.length,
      leaderCount: team.leaderCount,
      assistantCount: team.assistantCount,
      playerCount: team.playerCount
    };
  }).sort(function(a, b) {
    const byName = a.name.localeCompare(b.name, 'ru', { sensitivity: 'base' });
    if (byName) return byName;
    return String(a.game || '').localeCompare(String(b.game || ''), 'ru', { sensitivity: 'base' });
  });

  return {
    participants: participants,
    teams: teams,
    stats: { participants: participants.length, inChat: inChatCount, teams: teams.length }
  };
}

function MINIAPP_snapshotLoadAvatarFileMap_(ss) {
  const out = {};
  try {
    const sheet = ss.getSheetByName(MINIAPP_SNAPSHOT_AVATARS_SHEET);
    if (!sheet || sheet.getLastRow() < 2) return out;
    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getDisplayValues();
    rows.forEach(function(row) {
      const telegramId = MINIAPP_snapshotNormalizeTelegramId_(row[0]);
      const fileId = MINIAPP_snapshotValue_(row[2]);
      const status = MINIAPP_snapshotValue_(row[5]);
      if (!telegramId || !fileId) return;
      // ERROR is non-destructive in 04_TELEGRAM_AVATARS: the previous known file_id is retained.
      // Export that last-known file_id so Mini App can keep showing the cached/known avatar.
      // NO_PHOTO and unknown statuses remain excluded.
      if (status && status !== 'OK' && status !== 'ERROR') return;
      out[telegramId] = fileId;
    });
  } catch (error) {
    console.log('MINIAPP avatar map warning: ' + error);
  }
  return out;
}

function MINIAPP_snapshotLoadTeamPhotoMap_(ss) {
  const out = {};
  try {
    const sheet = ss.getSheetByName(MINIAPP_SNAPSHOT_TEAMS_SHEET);
    if (!sheet || sheet.getLastRow() < 2) return out;

    const count = sheet.getLastRow() - 1;
    const games = sheet.getRange(2, 1, count, 1).getDisplayValues();
    const names = sheet.getRange(2, 2, count, 1).getDisplayValues();
    const photoRange = sheet.getRange(2, 3, count, 1);
    const values = photoRange.getValues();
    const formulas = photoRange.getFormulas();

    for (let i = 0; i < count; i++) {
      const team = MINIAPP_snapshotStripGameSuffix_(MINIAPP_snapshotValue_(names[i][0]));
      const game = MINIAPP_snapshotCanonicalGame_(MINIAPP_snapshotValue_(games[i][0]), MINIAPP_snapshotValue_(names[i][0]));
      if (!team) continue;
      const key = MINIAPP_snapshotTeamKey_(team, game);
      if (out[key]) continue;

      let url = '';
      const value = values[i][0];
      try {
        if (value && typeof value === 'object' && value.valueType === SpreadsheetApp.ValueType.IMAGE && typeof value.getContentUrl === 'function') {
          url = MINIAPP_snapshotValue_(value.getContentUrl());
        }
      } catch (_) {}

      if (!url) {
        const formula = MINIAPP_snapshotValue_(formulas[i][0]);
        const match = formula.match(/^=IMAGE\(\s*"([^"]+)"/i);
        if (match) url = MINIAPP_snapshotValue_(match[1]);
      }
      if (url) out[key] = url;
    }
  } catch (error) {
    console.log('MINIAPP team photo map warning: ' + error);
  }
  return out;
}

function MINIAPP_putPrivateGitHubFile_(repo, branch, path, text, token, dataHash) {
  const encodedPath = String(path).split('/').map(encodeURIComponent).join('/');
  const apiUrl = 'https://api.github.com/repos/' + repo + '/contents/' + encodedPath;
  const commonHeaders = {
    Authorization: 'Bearer ' + token,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Royal-CRM-Snapshot-Exporter'
  };

  let currentSha = '';
  const getResponse = UrlFetchApp.fetch(apiUrl + '?ref=' + encodeURIComponent(branch), {
    method: 'get', headers: commonHeaders, muteHttpExceptions: true
  });
  const getCode = getResponse.getResponseCode();

  if (getCode === 200) {
    const current = JSON.parse(getResponse.getContentText() || '{}');
    currentSha = MINIAPP_snapshotValue_(current.sha);
  } else if (getCode !== 404) {
    throw new Error('GitHub GET error ' + getCode + ': ' + MINIAPP_snapshotTruncate_(getResponse.getContentText(), 500));
  }

  const body = {
    message: 'Update Royal CRM snapshot ' + dataHash.slice(0, 12),
    content: Utilities.base64Encode(Utilities.newBlob(text, 'application/json', 'snapshot.json').getBytes()),
    branch: branch
  };
  if (currentSha) body.sha = currentSha;

  const putResponse = UrlFetchApp.fetch(apiUrl, {
    method: 'put', contentType: 'application/json', headers: commonHeaders,
    payload: JSON.stringify(body), muteHttpExceptions: true
  });
  const putCode = putResponse.getResponseCode();
  if (putCode !== 200 && putCode !== 201) {
    throw new Error('GitHub PUT error ' + putCode + ': ' + MINIAPP_snapshotTruncate_(putResponse.getContentText(), 700));
  }

  const saved = JSON.parse(putResponse.getContentText() || '{}');
  return {
    status: putCode,
    path: path,
    branch: branch,
    commitSha: saved.commit && saved.commit.sha ? String(saved.commit.sha) : ''
  };
}

function MINIAPP_installSnapshotTrigger5m() {
  MINIAPP_removeSnapshotTriggers_();
  ScriptApp.newTrigger('MINIAPP_exportSnapshotToGitHub').timeBased().everyMinutes(5).create();
  return 'OK: snapshot export trigger установлен каждые 5 минут';
}

function MINIAPP_removeSnapshotTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'MINIAPP_exportSnapshotToGitHub') ScriptApp.deleteTrigger(trigger);
  });
}

function MINIAPP_snapshotNormalizeTelegramId_(value) {
  const text = MINIAPP_snapshotValue_(value).replace(/^'/, '');
  const match = text.match(/-?\d{5,20}/);
  return match ? match[0] : '';
}

function MINIAPP_snapshotStripGameSuffix_(team) {
  return MINIAPP_snapshotValue_(team).replace(/\s+—\s+(РМ|РК)$/u, '');
}

function MINIAPP_snapshotCanonicalGame_(game, teamRaw) {
  const value = MINIAPP_snapshotValue_(game);
  const lower = value.toLocaleLowerCase('ru-RU');
  if (lower === 'рм' || lower.indexOf('royal match') >= 0) return 'Royal Match';
  if (lower === 'рк' || lower.indexOf('royal kingdom') >= 0) return 'Royal Kingdom';

  const raw = MINIAPP_snapshotValue_(teamRaw);
  if (/\s+—\s+РМ$/u.test(raw)) return 'Royal Match';
  if (/\s+—\s+РК$/u.test(raw)) return 'Royal Kingdom';
  return value;
}

function MINIAPP_snapshotTeamKey_(team, game) {
  return MINIAPP_snapshotValue_(team).toLocaleLowerCase('ru-RU') + '\n' +
    MINIAPP_snapshotCanonicalGame_(game, '').toLocaleLowerCase('ru-RU');
}

function MINIAPP_snapshotUnique_(values) {
  const seen = {};
  const out = [];
  (values || []).forEach(function(value) {
    const key = String(value || '');
    if (!key || seen[key]) return;
    seen[key] = true;
    out.push(key);
  });
  return out;
}

function MINIAPP_snapshotSha256_(text) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, String(text || ''), Utilities.Charset.UTF_8
  );
  return bytes.map(function(byte) {
    const value = (byte + 256) % 256;
    return ('0' + value.toString(16)).slice(-2);
  }).join('');
}

function MINIAPP_snapshotValue_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function MINIAPP_snapshotTruncate_(value, maxLength) {
  const text = String(value || '');
  return text.length <= maxLength ? text : text.slice(0, maxLength) + '…';
}
