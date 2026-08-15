#!/usr/bin/env bash
set -euo pipefail

python3 - <<'PY'
from pathlib import Path
import re


def replace_once(text, old, new, label):
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f'ERROR: pattern not found: {label}')
    return text.replace(old, new, 1)


def replace_func(text, start_name, next_name, replacement):
    pattern = rf'function {re.escape(start_name)}\([^\n]*\) \{{.*?(?=\nfunction {re.escape(next_name)}\()'
    new_text, count = re.subn(pattern, replacement.rstrip() + '\n', text, count=1, flags=re.S)
    if count != 1:
        # Idempotency: if the replacement marker is already present, keep it.
        if replacement.split('\n', 1)[0] in text:
            return text
        raise SystemExit(f'ERROR: function block not found: {start_name}')
    return new_text

# ------------------------------------------------------------------
# 14_GITHUB_SNAPSHOT_EXPORT.js — teams are keyed by name + game.
# ------------------------------------------------------------------
p14 = Path('14_GITHUB_SNAPSHOT_EXPORT.js')
s = p14.read_text(encoding='utf-8')
s = s.replace("const MINIAPP_SNAPSHOT_VERSION = '1.1.0';", "const MINIAPP_SNAPSHOT_VERSION = '1.2.0';", 1)

old_membership = '''      const team = MINIAPP_snapshotStripGameSuffix_(teamRaw);
      const membership = {
        slot: Number(slot.number || memberships.length + 1),
        team: team,
        teamRaw: teamRaw,
        nickname: nickname,
        role: role,
        game: game
      };
      memberships.push(membership);

      if (team) {
        const key = team.toLocaleLowerCase('ru-RU');
        if (!teamMap[key]) {
          teamMap[key] = {
            name: team,
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
        if (game) teamObj.games[game] = true;
        if (telegramId) teamObj.members.push(telegramId);
        if (role === 'Лидер') teamObj.leaderCount++;
        else if (role === 'Помощник') teamObj.assistantCount++;
        else if (role === 'Игрок') teamObj.playerCount++;
      }'''

new_membership = '''      const team = MINIAPP_snapshotStripGameSuffix_(teamRaw);
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
      }'''
s = replace_once(s, old_membership, new_membership, 'snapshot team aggregation')

old_teams = '''  const teams = Object.keys(teamMap).map(function(key) {
    const team = teamMap[key];
    const uniqueMembers = MINIAPP_snapshotUnique_(team.members);
    return {
      name: team.name,
      games: Object.keys(team.games).sort(),
      photoUrl: MINIAPP_snapshotValue_(team.photoUrl),
      memberTelegramIds: uniqueMembers,
      memberCount: uniqueMembers.length,
      leaderCount: team.leaderCount,
      assistantCount: team.assistantCount,
      playerCount: team.playerCount
    };
  }).sort(function(a, b) {
    return a.name.localeCompare(b.name, 'ru', { sensitivity: 'base' });
  });'''

new_teams = '''  const teams = Object.keys(teamMap).map(function(key) {
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
  });'''
s = replace_once(s, old_teams, new_teams, 'snapshot teams output')

photo_func = r'''function MINIAPP_snapshotLoadTeamPhotoMap_(ss) {
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
'''
s = replace_func(s, 'MINIAPP_snapshotLoadTeamPhotoMap_', 'MINIAPP_putPrivateGitHubFile_', photo_func)

helpers14 = r'''function MINIAPP_snapshotCanonicalGame_(game, teamRaw) {
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

'''
if 'function MINIAPP_snapshotTeamKey_' not in s:
    marker = 'function MINIAPP_snapshotUnique_(values) {'
    if marker not in s:
        raise SystemExit('ERROR: snapshot helper insertion marker missing')
    s = s.replace(marker, helpers14 + marker, 1)

p14.write_text(s, encoding='utf-8')

# ------------------------------------------------------------------
# 17_MINIAPP_PERSISTENT_MEDIA.js — media key = name + game.
# ------------------------------------------------------------------
p17 = Path('17_MINIAPP_PERSISTENT_MEDIA.js')
s = p17.read_text(encoding='utf-8')
s = s.replace("var MINIAPP_PERSISTENT_MEDIA_VERSION = '1.0.0';", "var MINIAPP_PERSISTENT_MEDIA_VERSION = '1.1.0';", 1)

sync_one = r'''function MINIAPP_syncOneTeamPhotoRow_(sheet, row, cols, cfg, force) {
  var teamName = String(sheet.getRange(row, cols.team).getDisplayValue() || '').trim();
  if (!teamName) return 'skipped';

  var game = MINIAPP_teamMediaCanonicalGame_(sheet.getRange(row, cols.game).getDisplayValue());
  var identityKey = MINIAPP_teamMediaIdentityKey_(teamName, game);
  var stableHash = MINIAPP_mediaSha256Hex_(identityKey);
  var path = 'media/teams/' + stableHash + '.bin';
  var hashProp = MINIAPP_TEAM_MEDIA_HASH_PREFIX + stableHash;
  var props = PropertiesService.getScriptProperties();
  var value = sheet.getRange(row, cols.photo).getValue();

  var isImage = value && value.valueType === SpreadsheetApp.ValueType.IMAGE && typeof value.getContentUrl === 'function';
  if (!isImage) {
    var previous = props.getProperty(hashProp);
    if (previous) {
      MINIAPP_teamGithubDelete_(cfg, path, 'remove team photo ' + stableHash.slice(0, 12));
      props.deleteProperty(hashProp);
      return 'removed';
    }
    return 'skipped';
  }

  var contentUrl = String(value.getContentUrl() || '').trim();
  if (!contentUrl) throw new Error('CellImage content URL is empty');

  var response = UrlFetchApp.fetch(contentUrl, {
    method: 'get',
    muteHttpExceptions: true,
    followRedirects: true,
    headers: { 'User-Agent': 'Royal-CRM-Team-Media/1.1' }
  });
  if (response.getResponseCode() !== 200) throw new Error('team image HTTP ' + response.getResponseCode());

  var blob = response.getBlob();
  var bytes = blob.getBytes();
  if (!bytes.length) throw new Error('team image empty');

  var contentHash = MINIAPP_sha256BytesHex_(bytes);
  var previousHash = String(props.getProperty(hashProp) || '');
  if (!force && previousHash === contentHash) return 'skipped';

  MINIAPP_teamGithubUpsert_(cfg, path, blob, 'cache team photo ' + stableHash.slice(0, 12));
  props.setProperty(hashProp, contentHash);
  return 'updated';
}
'''
s = replace_func(s, 'MINIAPP_syncOneTeamPhotoRow_', 'MINIAPP_teamHeaderColumns_', sync_one)

header_func = r'''function MINIAPP_teamHeaderColumns_(sheet) {
  var lastColumn = Math.max(3, sheet.getLastColumn());
  var headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  var game = 0;
  var team = 0;
  var photo = 0;

  for (var i = 0; i < headers.length; i += 1) {
    var h = String(headers[i] || '').trim().toLowerCase();
    if (h === 'игра') game = i + 1;
    if (h === 'команда') team = i + 1;
    if (h === 'фото') photo = i + 1;
  }

  // Current CRM layout fallback: A=Игра, B=Команда, C=Фото.
  if (!game) game = 1;
  if (!team) team = 2;
  if (!photo) photo = 3;
  return { game: game, team: team, photo: photo };
}
'''
s = replace_func(s, 'MINIAPP_teamHeaderColumns_', 'MINIAPP_markTeamRowsDirty_', header_func)

helpers17 = r'''function MINIAPP_teamMediaCanonicalGame_(value) {
  var raw = String(value || '').trim();
  var low = raw.toLowerCase();
  if (low === 'рм' || low.indexOf('royal match') >= 0) return 'Royal Match';
  if (low === 'рк' || low.indexOf('royal kingdom') >= 0) return 'Royal Kingdom';
  return raw;
}

function MINIAPP_teamMediaIdentityKey_(teamName, game) {
  return MINIAPP_normalizeTeamMediaName_(teamName) + '\n' +
    MINIAPP_teamMediaCanonicalGame_(game).toLowerCase();
}

'''
if 'function MINIAPP_teamMediaIdentityKey_' not in s:
    marker = 'function MINIAPP_normalizeTeamMediaName_(value) {'
    if marker not in s:
        raise SystemExit('ERROR: media helper insertion marker missing')
    s = s.replace(marker, helpers17 + marker, 1)
p17.write_text(s, encoding='utf-8')

# ------------------------------------------------------------------
# 19_MINIAPP_FALLBACK_API.js — fallback media lookup by name + game.
# ------------------------------------------------------------------
p19 = Path('19_MINIAPP_FALLBACK_API.js')
s = p19.read_text(encoding='utf-8')
s = s.replace("var MINIAPP_FALLBACK_API_VERSION = '1.0.1';", "var MINIAPP_FALLBACK_API_VERSION = '1.1.0';", 1)

fallback_team = r'''function MINIAPP_fallbackTeamPhoto_(e) {
  var auth = MINIAPP_fallbackAuthorize_(e);
  if (!auth.ok) return auth.result;

  var teamName = MINIAPP_value_(e && e.parameter && e.parameter.team);
  var game = MINIAPP_fallbackCanonicalGame_(MINIAPP_value_(e && e.parameter && e.parameter.game));
  if (!teamName) return MINIAPP_fallbackError_('TEAM_MISSING', 'Команда не указана.');

  var cfg = MINIAPP_mediaConfig_(PropertiesService.getScriptProperties());
  var snapshot = MINIAPP_mediaLoadSnapshot_(cfg);
  var teams = snapshot && Array.isArray(snapshot.teams) ? snapshot.teams : [];
  var wanted = MINIAPP_fallbackNormalizeTeam_(teamName);
  var sameName = teams.filter(function(t) {
    return MINIAPP_fallbackNormalizeTeam_(t && t.name) === wanted;
  });

  var match = null;
  if (game) {
    for (var i = 0; i < sameName.length; i += 1) {
      if (MINIAPP_fallbackTeamGame_(sameName[i]) === game) {
        match = sameName[i];
        break;
      }
    }
  } else if (sameName.length === 1) {
    match = sameName[0];
  }

  if (!match) {
    return MINIAPP_fallbackError_(sameName.length > 1 ? 'TEAM_GAME_REQUIRED' : 'TEAM_NOT_FOUND',
      sameName.length > 1 ? 'Для команды нужно указать игру.' : 'Команда не найдена.');
  }

  var exactGame = MINIAPP_fallbackTeamGame_(match);
  var identityKey = MINIAPP_fallbackTeamIdentityKey_(match.name, exactGame);
  var path = 'media/teams/' + MINIAPP_mediaSha256Hex_(identityKey) + '.bin';
  return MINIAPP_fallbackMediaResult_(cfg, path, 'TEAM_PHOTO_NOT_CACHED', 'Фото команды ещё не закэшировано.');
}
'''
s = replace_func(s, 'MINIAPP_fallbackTeamPhoto_', 'MINIAPP_fallbackAuthorize_', fallback_team)

helpers19 = r'''function MINIAPP_fallbackCanonicalGame_(value) {
  var raw = String(value || '').trim();
  var low = raw.toLowerCase();
  if (low === 'рм' || low.indexOf('royal match') >= 0) return 'Royal Match';
  if (low === 'рк' || low.indexOf('royal kingdom') >= 0) return 'Royal Kingdom';
  return raw;
}

function MINIAPP_fallbackTeamGame_(team) {
  if (!team) return '';
  var direct = MINIAPP_fallbackCanonicalGame_(team.game);
  if (direct) return direct;
  var games = Array.isArray(team.games) ? team.games : [];
  return games.length ? MINIAPP_fallbackCanonicalGame_(games[0]) : '';
}

function MINIAPP_fallbackTeamIdentityKey_(teamName, game) {
  return MINIAPP_fallbackNormalizeTeam_(teamName) + '\n' +
    MINIAPP_fallbackCanonicalGame_(game).toLowerCase();
}

'''
if 'function MINIAPP_fallbackTeamIdentityKey_' not in s:
    marker = 'function MINIAPP_fallbackError_(code, message) {'
    if marker not in s:
        raise SystemExit('ERROR: fallback helper insertion marker missing')
    s = s.replace(marker, helpers19 + marker, 1)
p19.write_text(s, encoding='utf-8')

# ------------------------------------------------------------------
# 18_MINIAPP_MENU_CACHE_BUST.js — new frontend URL version.
# ------------------------------------------------------------------
p18 = Path('18_MINIAPP_MENU_CACHE_BUST.js')
p18.write_text(r'''/*
 * Royal CRM / Таблица ЧП
 * 18_MINIAPP_MENU_CACHE_BUST.js
 * v1.3.0
 */

var MINIAPP_MENU_CACHE_BUST_VERSION = '1.3.0';
var MINIAPP_FRONTEND_URL_V055 = 'https://antonsoloway.github.io/Specnaz-mini-app/';

function MINIAPP_switchMenuToV055() {
  var props = PropertiesService.getScriptProperties();
  var token = String(props.getProperty('TELEGRAM_BOT_TOKEN') || props.getProperty('BOT_TOKEN') || '').trim();
  if (!token) throw new Error('Telegram bot token property is missing');

  var gasUrl = String(ScriptApp.getService().getUrl() || '').trim();
  if (!gasUrl) throw new Error('Apps Script web app URL is unavailable');

  var menuUrl = MINIAPP_FRONTEND_URL_V055 + '?v=055&gas=' + encodeURIComponent(gasUrl);
  var api = 'https://api.telegram.org/bot' + token + '/';
  var text = 'Открыть приложение';

  try {
    var currentResp = UrlFetchApp.fetch(api + 'getChatMenuButton', {
      method: 'post', contentType: 'application/json', payload: '{}', muteHttpExceptions: true
    });
    if (currentResp.getResponseCode() === 200) {
      var current = JSON.parse(currentResp.getContentText());
      var existingText = current && current.ok && current.result ? String(current.result.text || '').trim() : '';
      if (existingText) text = existingText;
    }
  } catch (ignore) {}

  var payload = {
    menu_button: { type: 'web_app', text: text, web_app: { url: menuUrl } }
  };

  var response = UrlFetchApp.fetch(api + 'setChatMenuButton', {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  var code = response.getResponseCode();
  var body = JSON.parse(response.getContentText() || '{}');
  if (code !== 200 || !body.ok) {
    throw new Error('Telegram setChatMenuButton failed HTTP ' + code + ': ' + String(body.description || 'unknown'));
  }

  return { ok: true, version: MINIAPP_MENU_CACHE_BUST_VERSION, url: menuUrl, gasFallback: true, text: text };
}

function MINIAPP_switchMenuToV054() { return MINIAPP_switchMenuToV055(); }
function MINIAPP_switchMenuToV053() { return MINIAPP_switchMenuToV055(); }
function MINIAPP_switchMenuToV052() { return MINIAPP_switchMenuToV055(); }
''', encoding='utf-8')

print('TEAM_IDENTITY_PATCH_OK')
PY

node --check 14_GITHUB_SNAPSHOT_EXPORT.js
node --check 17_MINIAPP_PERSISTENT_MEDIA.js
node --check 18_MINIAPP_MENU_CACHE_BUST.js
node --check 19_MINIAPP_FALLBACK_API.js

echo TEAM_IDENTITY_SOURCE_OK
