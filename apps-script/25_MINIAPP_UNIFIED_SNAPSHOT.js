/*
 * Royal CRM / Таблица ЧП
 * 25_MINIAPP_UNIFIED_SNAPSHOT.js
 * v1.2.0
 *
 * Atomic Mini App snapshot writer.
 * One source write contains base participants/teams + specnaz score/rank + specnaz history.
 * Participant identity is Telegram ID only.
 * Search keys are prepared here, while the Mini App keeps its independent v0.5.47-style fallback search.
 */

var MINIAPP_UNIFIED_SNAPSHOT_VERSION = '1.2.0';
var MINIAPP_UNIFIED_SNAPSHOT_SCHEMA = '1.4.1';
var MINIAPP_UNIFIED_SEARCH_INDEX_VERSION = '1.1.0';
var MINIAPP_UNIFIED_SNAPSHOT_HANDLER = 'MINIAPP_exportUnifiedSnapshotToGitHub';
var MINIAPP_UNIFIED_SNAPSHOT_LAST_HASH = 'MINIAPP_UNIFIED_SNAPSHOT_LAST_HASH';

var MINIAPP_UNIFIED_SEARCH_ALIASES = {
  'has ne dogonyat': ['нас не догонят'],
  'xaoc': ['хаос'],
  'topmo3ob het': ['тормозов нет'],
  'ha a3apte': ['на азарте'],
  'cbet b okhe': ['свет в окне'],
  'da budet swet 5': ['да будет свет 5', 'да будет свет'],
  'da budet swet': ['да будет свет'],
  'molot poka': ['молот рока'],
  'aquamarine': ['аквамарин'],
  'hepbbi b hopme': ['нервы в норме'],
  'opuoh': ['орион'],
  'kpytbie': ['крутые'],
  'tabepha xytopok': ['таверна хуторок'],
  'cobectu het': ['совести нет'],
  'cbou': ['свои'],
  'pa3ym': ['разум'],
  'pa3hbie': ['разные'],
  'kapma b kapmahe': ['карма в кармане'],
  'akyha matata': ['акуна матата'],
  'xopobod': ['хоровод'],
  'kolomha': ['коломна'],
  'cehat': ['сенат'],
  'paketa': ['ракета'],
  'kotehok': ['котенок'],
  'sbornayarf': ['сборная рф'],
  '1by': ['1бу'],
  'joyband': ['джойбанд'],
  'mike': ['майк'],
  'xabib': ['хабиб']
};

function MINIAPP_bootstrapUnifiedSnapshot() {
  var trigger = MINIAPP_installUnifiedSnapshotTrigger_();
  var sync = MINIAPP_exportUnifiedSnapshotToGitHub();
  return { ok: true, version: MINIAPP_UNIFIED_SNAPSHOT_VERSION, trigger: trigger, sync: sync };
}

function MINIAPP_exportUnifiedSnapshotToGitHub() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return { ok: false, skipped: true, reason: 'LOCK_BUSY' };

  try {
    MINIAPP_unifiedRequireHelpers_();

    var props = PropertiesService.getScriptProperties();
    var repo = String(props.getProperty('DATA_GITHUB_REPO') || '').trim();
    var token = String(props.getProperty('DATA_GITHUB_TOKEN') || '').trim();
    var branch = String(props.getProperty('DATA_GITHUB_BRANCH') || 'main').trim();
    var path = String(props.getProperty('DATA_GITHUB_PATH') || 'snapshot.json').trim();
    if (!repo || !token) throw new Error('DATA_GITHUB_REPO / DATA_GITHUB_TOKEN missing');

    var stable = MINIAPP_buildStableSnapshot_();
    if (!stable || !Array.isArray(stable.participants) || !Array.isArray(stable.teams)) {
      throw new Error('MINIAPP_buildStableSnapshot_ returned invalid data');
    }

    var statsById = MINIAPP_profileStatsReadBase_();
    var statsTouched = 0;
    stable.participants.forEach(function(p) {
      var id = MINIAPP_unifiedTelegramId_(p && p.telegramId);
      if (!id || !Object.prototype.hasOwnProperty.call(statsById, id)) return;
      var score = Number(statsById[id] || 0);
      if (!isFinite(score) || score < 0) score = 0;
      score = Math.floor(score);
      p.specnazTrips = score;
      p.specnazRank = String(MINIAPP_profileStatsRank_(score) || 'Новичок');
      statsTouched += 1;
    });

    var searchStats = MINIAPP_unifiedAttachSearchKeys_(stable);

    var sections = MINIAPP_readSpecnazHistorySections_();
    var nowIso = new Date().toISOString();
    var historyVersion = typeof MINIAPP_SPECNAZ_HISTORY_VERSION !== 'undefined'
      ? String(MINIAPP_SPECNAZ_HISTORY_VERSION || '1.3.0') : '1.3.0';
    var profileVersion = typeof MINIAPP_PROFILE_STATS_VERSION !== 'undefined'
      ? String(MINIAPP_PROFILE_STATS_VERSION || '1.0.0') : '1.0.0';

    var hashBasis = {
      schemaVersion: MINIAPP_UNIFIED_SNAPSHOT_SCHEMA,
      searchIndexVersion: MINIAPP_UNIFIED_SEARCH_INDEX_VERSION,
      participants: stable.participants,
      teams: stable.teams,
      stats: stable.stats || {},
      specnazHistory: { version: historyVersion, sections: sections }
    };
    var dataHash = MINIAPP_unifiedSha256_(JSON.stringify(hashBasis));
    var lastHash = String(props.getProperty(MINIAPP_UNIFIED_SNAPSHOT_LAST_HASH) || '').trim();

    if (lastHash && lastHash === dataHash) {
      return {
        ok: true, changed: false,
        version: MINIAPP_UNIFIED_SNAPSHOT_VERSION,
        schemaVersion: MINIAPP_UNIFIED_SNAPSHOT_SCHEMA,
        searchIndexVersion: MINIAPP_UNIFIED_SEARCH_INDEX_VERSION,
        participants: stable.participants.length,
        teams: stable.teams.length,
        participantSearchKeys: searchStats.participantKeys,
        teamSearchKeys: searchStats.teamKeys,
        statsTouched: statsTouched,
        historySections: sections.length
      };
    }

    var payload = {
      schemaVersion: MINIAPP_UNIFIED_SNAPSHOT_SCHEMA,
      generatedAt: nowIso,
      source: 'Royal CRM / Таблица ЧП',
      dataHash: dataHash,
      searchIndexVersion: MINIAPP_UNIFIED_SEARCH_INDEX_VERSION,
      participants: stable.participants,
      teams: stable.teams,
      stats: stable.stats || {},
      profileStatsVersion: profileVersion,
      profileStatsUpdatedAt: nowIso,
      specnazHistory: { version: historyVersion, updatedAt: nowIso, sections: sections },
      specnazHistoryVersion: historyVersion,
      unifiedSnapshotVersion: MINIAPP_UNIFIED_SNAPSHOT_VERSION
    };

    var github = MINIAPP_unifiedPutWithRetry_(repo, branch, path, JSON.stringify(payload), token, dataHash);
    props.setProperty(MINIAPP_UNIFIED_SNAPSHOT_LAST_HASH, dataHash);

    return {
      ok: true, changed: true,
      version: MINIAPP_UNIFIED_SNAPSHOT_VERSION,
      schemaVersion: MINIAPP_UNIFIED_SNAPSHOT_SCHEMA,
      searchIndexVersion: MINIAPP_UNIFIED_SEARCH_INDEX_VERSION,
      participants: stable.participants.length,
      teams: stable.teams.length,
      participantSearchKeys: searchStats.participantKeys,
      teamSearchKeys: searchStats.teamKeys,
      statsTouched: statsTouched,
      historySections: sections.length,
      github: github
    };
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function MINIAPP_installUnifiedSnapshotTrigger_() {
  var oldHandlers = {
    MINIAPP_exportSnapshotToGitHub: true,
    MINIAPP_refreshProfileStatsInSnapshot: true,
    MINIAPP_refreshSpecnazHistorySnapshot: true,
    MINIAPP_exportUnifiedSnapshotToGitHub: true
  };
  var removed = [];
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    var handler = String(trigger.getHandlerFunction() || '');
    if (!oldHandlers[handler]) return;
    ScriptApp.deleteTrigger(trigger);
    removed.push(handler);
  });
  ScriptApp.newTrigger(MINIAPP_UNIFIED_SNAPSHOT_HANDLER).timeBased().everyMinutes(5).create();
  return { installed: MINIAPP_UNIFIED_SNAPSHOT_HANDLER, everyMinutes: 5, removed: removed };
}

function MINIAPP_unifiedRequireHelpers_() {
  var required = [
    ['MINIAPP_buildStableSnapshot_', typeof MINIAPP_buildStableSnapshot_],
    ['MINIAPP_putPrivateGitHubFile_', typeof MINIAPP_putPrivateGitHubFile_],
    ['MINIAPP_profileStatsReadBase_', typeof MINIAPP_profileStatsReadBase_],
    ['MINIAPP_profileStatsRank_', typeof MINIAPP_profileStatsRank_],
    ['MINIAPP_readSpecnazHistorySections_', typeof MINIAPP_readSpecnazHistorySections_]
  ];
  var missing = required.filter(function(item) { return item[1] !== 'function'; }).map(function(item) { return item[0]; });
  if (missing.length) throw new Error('Unified snapshot helpers missing: ' + missing.join(', '));
}

function MINIAPP_unifiedAttachSearchKeys_(stable) {
  var participantKeys = 0;
  var teamKeys = 0;

  (stable.teams || []).forEach(function(team) {
    var values = [team && team.name, team && team.games];
    team.searchKeys = MINIAPP_unifiedBuildSearchKeys_(values);
    teamKeys += team.searchKeys.length;
  });

  (stable.participants || []).forEach(function(p) {
    var values = [p && p.name, p && p.telegramName, p && p.username];
    (p && Array.isArray(p.memberships) ? p.memberships : []).forEach(function(m) {
      values.push(m && m.team, m && m.teamRaw, m && m.nickname, m && m.role, m && m.game);
    });
    p.searchKeys = MINIAPP_unifiedBuildSearchKeys_(values);
    participantKeys += p.searchKeys.length;
  });

  return { participantKeys: participantKeys, teamKeys: teamKeys };
}

function MINIAPP_unifiedBuildSearchKeys_(values) {
  var seen = {};
  var out = [];

  function add(value) {
    var n = MINIAPP_unifiedNormalizeSearch_(value);
    if (!n || seen[n]) return;
    seen[n] = true;
    out.push(n);
    var compact = n.replace(/\s+/g, '');
    if (compact && !seen[compact]) { seen[compact] = true; out.push(compact); }
  }

  function visit(value) {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    var raw = String(value == null ? '' : value).trim();
    if (!raw) return;
    var n = MINIAPP_unifiedNormalizeSearch_(raw);
    add(n);

    if (/[а-я]/u.test(n)) add(MINIAPP_unifiedCyrToLat_(n));
    if (/[a-z]/i.test(n) && !/[а-я]/u.test(n)) {
      add(MINIAPP_unifiedLatToCyr_(n));
      add(MINIAPP_unifiedHumanRead_(raw));
    }

    var aliases = MINIAPP_UNIFIED_SEARCH_ALIASES[n] || [];
    aliases.forEach(function(alias) {
      add(alias);
      add(MINIAPP_unifiedCyrToLat_(alias));
    });
  }

  (values || []).forEach(visit);
  return out.slice(0, 100);
}

function MINIAPP_unifiedNormalizeSearch_(value) {
  var text = String(value == null ? '' : value);
  try { text = text.normalize('NFKC'); } catch (_) {}
  return text
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/^@+/, '')
    .replace(/[’'`]/g, '')
    .replace(/[^a-zа-я0-9@]+/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function MINIAPP_unifiedCyrToLat_(value) {
  var map = {
    а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'
  };
  return Array.from(MINIAPP_unifiedNormalizeSearch_(value)).map(function(ch) {
    return Object.prototype.hasOwnProperty.call(map, ch) ? map[ch] : ch;
  }).join('');
}

function MINIAPP_unifiedLatToCyr_(value) {
  var text = MINIAPP_unifiedNormalizeSearch_(value);
  var multi = { shch:'щ', sch:'щ', zh:'ж', kh:'х', ts:'ц', ch:'ч', sh:'ш', yu:'ю', ya:'я', yo:'е', ye:'е' };
  var single = { a:'а',b:'б',c:'к',d:'д',e:'е',f:'ф',g:'г',h:'х',i:'и',j:'дж',k:'к',l:'л',m:'м',n:'н',o:'о',p:'п',q:'к',r:'р',s:'с',t:'т',u:'у',v:'в',w:'в',x:'кс',y:'й',z:'з' };
  var keys = ['shch','sch','zh','kh','ts','ch','sh','yu','ya','yo','ye'];
  var out = '';
  for (var i = 0; i < text.length;) {
    var matched = false;
    for (var k = 0; k < keys.length; k += 1) {
      var token = keys[k];
      if (text.slice(i, i + token.length) === token) {
        out += multi[token];
        i += token.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    var ch = text.charAt(i);
    out += Object.prototype.hasOwnProperty.call(single, ch) ? single[ch] : ch;
    i += 1;
  }
  return MINIAPP_unifiedNormalizeSearch_(out);
}

function MINIAPP_unifiedHumanRead_(value) {
  var raw = String(value == null ? '' : value).trim();
  if (!raw) return '';
  var tokens = raw.match(/[A-Za-z0-9]+/g) || [];
  if (!tokens.length) return '';
  var words = tokens.map(function(token) {
    return MINIAPP_unifiedPseudoToken_(token) || MINIAPP_unifiedLatToCyr_(token);
  });
  return MINIAPP_unifiedNormalizeSearch_(words.join(' '));
}

function MINIAPP_unifiedPseudoToken_(value) {
  var raw = String(value == null ? '' : value);
  if (!raw) return '';
  raw = raw.replace(/bI/g, 'Ы').replace(/bi/g, 'ы');

  var map = {
    A:'А',a:'а',B:'В',b:'в',C:'С',c:'с',E:'Е',e:'е',H:'Н',h:'н',K:'К',k:'к',M:'М',m:'м',O:'О',o:'о',P:'Р',p:'р',T:'Т',t:'т',X:'Х',x:'х',Y:'У',y:'у',U:'И',u:'и',I:'И',i:'и',
    '0':'О','3':'З','4':'Ч','6':'Б','9':'Я'
  };

  var out = '';
  var chars = Array.from(raw);
  for (var i = 0; i < chars.length; i += 1) {
    var ch = chars[i];
    if (/[А-Яа-яЁё]/u.test(ch)) { out += ch; continue; }
    if (!Object.prototype.hasOwnProperty.call(map, ch)) return '';
    out += map[ch];
  }
  return MINIAPP_unifiedNormalizeSearch_(out);
}

function MINIAPP_unifiedPutWithRetry_(repo, branch, path, json, token, dataHash) {
  var lastError = null;
  for (var attempt = 0; attempt < 3; attempt += 1) {
    try { return MINIAPP_putPrivateGitHubFile_(repo, branch, path, json, token, dataHash); }
    catch (error) {
      lastError = error;
      if (attempt < 2) Utilities.sleep(700 + attempt * 900);
    }
  }
  throw lastError || new Error('Unified snapshot GitHub write failed');
}

function MINIAPP_unifiedTelegramId_(value) {
  var text = String(value == null ? '' : value).trim().replace(/\.0$/, '');
  return /^\d+$/.test(text) ? text : '';
}

function MINIAPP_unifiedSha256_(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text || ''), Utilities.Charset.UTF_8);
  return bytes.map(function(b) {
    var n = b < 0 ? b + 256 : b;
    return ('0' + n.toString(16)).slice(-2);
  }).join('');
}
