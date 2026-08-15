/*
 * Royal CRM / Таблица ЧП
 * 24_MINIAPP_SPECNAZ_HISTORY.js
 * v1.1.0
 *
 * Syncs the "История спецназа" sheet into the private Mini App snapshot.
 * Real separator rows like "Спецназ с 14 по 17 августа 2026" become sections.
 * Rich-text hyperlinks from the visible "Сообщение" column are preserved.
 * Technical source and Telegram IDs are not exported in history rows.
 */

var MINIAPP_SPECNAZ_HISTORY_VERSION = '1.1.0';
var MINIAPP_SPECNAZ_HISTORY_SPREADSHEET_ID = '1kkADcKysWdoGy95O36z9jCaoGUUHN0g4XH4LwVtAK_o';
var MINIAPP_SPECNAZ_HISTORY_SHEET = 'История спецназа';
var MINIAPP_SPECNAZ_HISTORY_HANDLER = 'MINIAPP_refreshSpecnazHistorySnapshot';

function MINIAPP_bootstrapSpecnazHistory() {
  var sync = MINIAPP_refreshSpecnazHistorySnapshot();
  MINIAPP_installSpecnazHistoryTrigger_();

  var menu = null;
  try {
    if (typeof MINIAPP_setupBotAppMenu === 'function') menu = MINIAPP_setupBotAppMenu();
  } catch (err) {
    console.warn('MINIAPP specnaz history menu refresh:', err && err.message ? err.message : err);
  }

  return {
    ok: true,
    version: MINIAPP_SPECNAZ_HISTORY_VERSION,
    sync: sync,
    triggerInstalled: true,
    menu: menu
  };
}

function MINIAPP_refreshSpecnazHistorySnapshot() {
  var sections = MINIAPP_readSpecnazHistorySections_();
  var cfg = MINIAPP_specnazHistoryConfig_();

  for (var attempt = 0; attempt < 3; attempt += 1) {
    var current = MINIAPP_specnazHistoryReadSnapshot_(cfg);
    var snapshot = current.snapshot;
    var oldSections = snapshot && snapshot.specnazHistory && Array.isArray(snapshot.specnazHistory.sections)
      ? snapshot.specnazHistory.sections
      : [];

    if (JSON.stringify(oldSections) === JSON.stringify(sections)) {
      return {
        ok: true,
        changed: false,
        sections: sections.length,
        entries: MINIAPP_specnazHistoryEntryCount_(sections)
      };
    }

    snapshot.specnazHistory = {
      version: MINIAPP_SPECNAZ_HISTORY_VERSION,
      updatedAt: new Date().toISOString(),
      sections: sections
    };
    snapshot.specnazHistoryVersion = MINIAPP_SPECNAZ_HISTORY_VERSION;
    snapshot.dataHash = MINIAPP_specnazHistoryHash_(snapshot);

    var result = MINIAPP_specnazHistoryWriteSnapshot_(cfg, snapshot, current.sha);
    if (result.ok) {
      return {
        ok: true,
        changed: true,
        sections: sections.length,
        entries: MINIAPP_specnazHistoryEntryCount_(sections),
        updatedAt: snapshot.specnazHistory.updatedAt
      };
    }

    if (result.code !== 409 && result.code !== 422) {
      throw new Error('Specnaz history snapshot write HTTP ' + result.code + ': ' + result.body);
    }
    Utilities.sleep(500 + attempt * 500);
  }

  throw new Error('Specnaz history snapshot changed concurrently; retry later.');
}

function MINIAPP_readSpecnazHistorySections_() {
  var ss = SpreadsheetApp.openById(MINIAPP_SPECNAZ_HISTORY_SPREADSHEET_ID);
  var sheet = ss.getSheetByName(MINIAPP_SPECNAZ_HISTORY_SHEET);
  if (!sheet) throw new Error('Sheet not found: ' + MINIAPP_SPECNAZ_HISTORY_SHEET);

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  // A:J = Дата, Аватар, Имя, Команда, Было, Стало, Добавлено, Звание, Сообщение, Источник.
  var values = sheet.getRange(1, 1, lastRow, 10).getDisplayValues();
  // Preserve cell-level and partial rich-text links from the visible message column I.
  var messageRich = sheet.getRange(1, 9, lastRow, 1).getRichTextValues();
  var sections = [];
  var current = null;

  for (var r = 1; r < values.length; r += 1) {
    var row = values[r];
    var first = MINIAPP_specnazHistoryValue_(row[0]);

    if (MINIAPP_isSpecnazHistorySeparator_(first)) {
      current = { title: first, rows: [] };
      sections.push(current);
      continue;
    }

    // Do not invent an "Архив спецназа" section. Only rows under a real sheet divider are exported.
    if (!current) continue;

    var date = first;
    var name = MINIAPP_specnazHistoryValue_(row[2]);
    var team = MINIAPP_specnazHistoryValue_(row[3]);
    var before = MINIAPP_specnazHistoryValue_(row[4]);
    var after = MINIAPP_specnazHistoryValue_(row[5]);
    var added = MINIAPP_specnazHistoryValue_(row[6]);
    var rank = MINIAPP_specnazHistoryValue_(row[7]);
    var message = MINIAPP_specnazHistoryValue_(row[8]);

    if (!date && !name && !team && !before && !after && !added && !rank && !message) continue;
    if (!name && !date) continue;

    var entry = {
      date: date,
      name: name,
      team: team,
      before: before,
      after: after,
      added: added,
      rank: rank,
      message: message
    };

    var rich = MINIAPP_specnazHistoryRichSegments_(messageRich[r] && messageRich[r][0], message);
    if (rich.length) entry.messageRich = rich;

    current.rows.push(entry);
  }

  return sections.filter(function(section) {
    return section && section.title && Array.isArray(section.rows);
  });
}

function MINIAPP_isSpecnazHistorySeparator_(value) {
  var text = MINIAPP_specnazHistoryValue_(value).toLocaleLowerCase('ru-RU');
  return text === 'спецназ' || text.indexOf('спецназ ') === 0;
}

function MINIAPP_specnazHistoryRichSegments_(richText, fallbackText) {
  var fallback = String(fallbackText == null ? '' : fallbackText);
  if (!fallback || !richText) return [];

  try {
    var runs = richText.getRuns();
    if (!runs || !runs.length) {
      var wholeUrl = richText.getLinkUrl();
      return wholeUrl ? [{ text: fallback, url: String(wholeUrl) }] : [];
    }

    var segments = [];
    var hasLink = false;
    runs.forEach(function(run) {
      var text = String(run.getText() || '');
      if (!text) return;
      var url = run.getLinkUrl();
      if (url) hasLink = true;
      var segment = { text: text };
      if (url) segment.url = String(url);
      segments.push(segment);
    });

    if (!hasLink) {
      var cellUrl = richText.getLinkUrl();
      return cellUrl ? [{ text: fallback, url: String(cellUrl) }] : [];
    }
    return segments;
  } catch (_) {
    return [];
  }
}

function MINIAPP_installSpecnazHistoryTrigger_() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === MINIAPP_SPECNAZ_HISTORY_HANDLER) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger(MINIAPP_SPECNAZ_HISTORY_HANDLER)
    .timeBased()
    .everyMinutes(5)
    .create();
}

function MINIAPP_specnazHistoryEntryCount_(sections) {
  return (sections || []).reduce(function(sum, section) {
    return sum + (section && Array.isArray(section.rows) ? section.rows.length : 0);
  }, 0);
}

function MINIAPP_specnazHistoryValue_(value) {
  return String(value == null ? '' : value).trim();
}

function MINIAPP_specnazHistoryConfig_() {
  var props = PropertiesService.getScriptProperties();
  var repo = String(props.getProperty('DATA_GITHUB_REPO') || '').trim();
  var token = String(props.getProperty('DATA_GITHUB_TOKEN') || '').trim();
  var branch = String(props.getProperty('DATA_GITHUB_BRANCH') || 'main').trim();
  var path = String(props.getProperty('DATA_GITHUB_PATH') || 'snapshot.json').trim();
  if (!repo || !token) throw new Error('DATA_GITHUB_REPO / DATA_GITHUB_TOKEN missing');
  return { repo: repo, token: token, branch: branch, path: path };
}

function MINIAPP_specnazHistoryHeaders_(cfg) {
  return {
    Authorization: 'Bearer ' + cfg.token,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Royal-CRM-Specnaz-History/1.1'
  };
}

function MINIAPP_specnazHistoryPath_(path) {
  return String(path || '').split('/').map(encodeURIComponent).join('/');
}

function MINIAPP_specnazHistoryReadSnapshot_(cfg) {
  var url = 'https://api.github.com/repos/' + cfg.repo + '/contents/' +
    MINIAPP_specnazHistoryPath_(cfg.path) + '?ref=' + encodeURIComponent(cfg.branch);
  var response = UrlFetchApp.fetch(url, {
    method: 'get', muteHttpExceptions: true, headers: MINIAPP_specnazHistoryHeaders_(cfg)
  });
  if (response.getResponseCode() !== 200) {
    throw new Error('Specnaz history snapshot read HTTP ' + response.getResponseCode());
  }

  var body = JSON.parse(response.getContentText() || '{}');
  var encoded = String(body.content || '').replace(/\s+/g, '');
  if (!encoded) throw new Error('Specnaz history snapshot is empty');
  var text = Utilities.newBlob(Utilities.base64Decode(encoded)).getDataAsString('UTF-8');
  return { snapshot: JSON.parse(text), sha: String(body.sha || '') };
}

function MINIAPP_specnazHistoryWriteSnapshot_(cfg, snapshot, sha) {
  var url = 'https://api.github.com/repos/' + cfg.repo + '/contents/' + MINIAPP_specnazHistoryPath_(cfg.path);
  var json = JSON.stringify(snapshot);
  var payload = {
    message: 'sync Mini App specnaz history',
    content: Utilities.base64Encode(Utilities.newBlob(json, 'application/json').getBytes()),
    branch: cfg.branch,
    sha: sha
  };
  var headers = MINIAPP_specnazHistoryHeaders_(cfg);
  headers['Content-Type'] = 'application/json';
  var response = UrlFetchApp.fetch(url, {
    method: 'put', muteHttpExceptions: true, headers: headers, payload: JSON.stringify(payload)
  });
  return {
    ok: response.getResponseCode() === 200 || response.getResponseCode() === 201,
    code: response.getResponseCode(),
    body: response.getContentText()
  };
}

function MINIAPP_specnazHistoryHash_(snapshot) {
  if (typeof MINIAPP_profileStatsHash_ === 'function') {
    try { return MINIAPP_profileStatsHash_(snapshot); } catch (_) {}
  }

  var copy = JSON.parse(JSON.stringify(snapshot || {}));
  delete copy.dataHash;
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    JSON.stringify(copy),
    Utilities.Charset.UTF_8
  );
  return bytes.map(function(b) {
    var n = b < 0 ? b + 256 : b;
    return ('0' + n.toString(16)).slice(-2);
  }).join('');
}
