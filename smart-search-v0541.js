/* Royal CRM Mini App — Human Search v0.5.41
 * Search like a person reads/pronounces a game name, not only literal spelling.
 * Supports:
 * - Cyrillic <-> Latin transliteration
 * - pseudo-Cyrillic game spelling (HET/HA/XAOC/TOPMO3OB/etc.)
 * - ambiguous Latin letters (Xabib -> Хабиб, 1BY -> 1БУ/1БЙ/etc.)
 * - English-reading helpers (Mike -> Майк, JoyBand -> Джойбанд)
 * - keyboard-layout mistakes
 * - partial matches and conservative typo tolerance
 * Identity/data rules are untouched: Telegram ID remains the participant identity.
 */
(() => {
  const VERSION = '0.5.41';
  const tokenCache = new Map();
  const objectParticipantCache = new WeakMap();
  const objectTeamCache = new WeakMap();
  const MAX_TOKEN_VARIANTS = 96;

  function normalize(value) {
    let text = String(value == null ? '' : value);
    try { text = text.normalize('NFKC'); } catch (_) {}
    return text
      .toLocaleLowerCase('ru-RU')
      .replace(/ё/g, 'е')
      .replace(/[’'`]/g, '')
      .replace(/[^a-zа-я0-9@]+/giu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const CYR_TO_LAT = {
    а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'
  };

  const EN_KEYS = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
  const RU_KEYS = 'йцукенгшщзхъфывапролджэячсмитьбюё';
  const EN_TO_RU = Object.fromEntries(Array.from(EN_KEYS).map((ch, i) => [ch, Array.from(RU_KEYS)[i] || ch]));
  const RU_TO_EN = Object.fromEntries(Array.from(RU_KEYS).map((ch, i) => [ch, Array.from(EN_KEYS)[i] || ch]));

  function keyboardSwap(value, map) {
    return Array.from(normalize(value)).map(ch => map[ch] ?? ch).join('');
  }

  function cyrToLat(value) {
    return Array.from(normalize(value)).map(ch => CYR_TO_LAT[ch] ?? ch).join('');
  }

  const LAT_MULTI = [
    ['shch','щ'],['sch','щ'],['yo','е'],['zh','ж'],['kh','х'],['ts','ц'],['ch','ч'],['sh','ш'],['yu','ю'],['ya','я'],['ye','е'],['ja','я'],['ju','ю']
  ];

  const LAT_OPTIONS = {
    a:['а'], b:['б','в'], c:['с','ц','к'], d:['д'], e:['е','э'], f:['ф'], g:['г'],
    h:['х','н'], i:['и'], j:['дж','й'], k:['к'], l:['л'], m:['м'], n:['н'], o:['о'],
    p:['п','р'], q:['к'], r:['р'], s:['с'], t:['т'], u:['у','и'], v:['в'], w:['в','ш'],
    x:['х','кс'], y:['й','ы','у'], z:['з'], '0':['о'], '3':['з'], '4':['ч'], '6':['б'], '9':['я']
  };

  function applyMultiLatin(raw) {
    const placeholders = [];
    let text = raw;
    LAT_MULTI.forEach(([latin, cyr]) => {
      const mark = String.fromCharCode(0xE200 + placeholders.length);
      placeholders.push(cyr);
      text = text.replace(new RegExp(latin, 'g'), mark);
    });
    return { text, placeholders };
  }

  function ambiguousLatinToCyr(value) {
    const raw = normalize(value);
    if (!/[a-z]/.test(raw)) return [raw];
    const { text, placeholders } = applyMultiLatin(raw);
    let variants = [''];

    for (const ch of Array.from(text)) {
      let options;
      const code = ch.charCodeAt(0);
      if (code >= 0xE200 && code < 0xE200 + placeholders.length) options = [placeholders[code - 0xE200]];
      else options = LAT_OPTIONS[ch] || [ch];

      const next = [];
      for (const prefix of variants) {
        for (const option of options) {
          next.push(prefix + option);
          if (next.length >= MAX_TOKEN_VARIANTS) break;
        }
        if (next.length >= MAX_TOKEN_VARIANTS) break;
      }
      variants = next;
    }
    return variants;
  }

  function englishReadingVariants(token) {
    const raw = normalize(token).replace(/\s/g, '');
    const out = new Set();

    const silentE = raw.match(/^([a-z]*?)i([bcdfghjklmnpqrstvwxyz])e$/);
    if (silentE) {
      const prefix = ambiguousLatinToCyr(silentE[1]).slice(0, 8);
      const consonant = ambiguousLatinToCyr(silentE[2]).slice(0, 8);
      prefix.forEach(p => consonant.forEach(c => out.add(`${p}ай${c}`)));
    }

    if (raw.includes('j')) {
      const replaced = raw.replace(/j/g, 'дж');
      ambiguousLatinToCyr(replaced).forEach(v => out.add(v));
    }

    if (/^x[a-z]/.test(raw)) {
      ambiguousLatinToCyr('х' + raw.slice(1)).forEach(v => out.add(v));
    }

    if (raw.includes('oy')) {
      ambiguousLatinToCyr(raw.replace(/oy/g, 'ой')).forEach(v => out.add(v));
    }

    return [...out];
  }

  function add(set, value) {
    const v = normalize(value);
    if (!v) return;
    set.add(v);
    set.add(v.replace(/\s+/g, ''));
  }

  function tokenVariants(value) {
    const key = normalize(value).replace(/\s/g, '');
    if (!key) return [];
    if (tokenCache.has(key)) return tokenCache.get(key);

    const set = new Set();
    add(set, key);
    add(set, cyrToLat(key));
    add(set, keyboardSwap(key, EN_TO_RU));
    add(set, keyboardSwap(key, RU_TO_EN));
    ambiguousLatinToCyr(key).forEach(v => add(set, v));
    englishReadingVariants(key).forEach(v => add(set, v));
    [...set].slice(0, 80).forEach(v => add(set, cyrToLat(v)));

    const result = [...set].filter(Boolean).slice(0, MAX_TOKEN_VARIANTS * 2);
    tokenCache.set(key, result);
    return result;
  }

  function flatten(values, out = []) {
    if (Array.isArray(values)) {
      values.forEach(v => flatten(v, out));
      return out;
    }
    const text = String(values == null ? '' : values).trim();
    if (text) out.push(text);
    return out;
  }

  function wordsAndVariants(values) {
    const variants = new Set();
    const tokens = [];
    flatten(values).forEach(field => {
      const normalized = normalize(field);
      if (!normalized) return;
      add(variants, normalized);
      add(variants, cyrToLat(normalized));
      const parts = normalized.split(' ').filter(Boolean);
      parts.forEach(part => {
        const vv = tokenVariants(part);
        tokens.push(vv);
        vv.forEach(v => add(variants, v));
      });

      let combos = [''];
      parts.forEach(part => {
        const options = tokenVariants(part).slice(0, 18);
        const next = [];
        for (const prefix of combos) {
          for (const option of options) {
            next.push(prefix ? `${prefix} ${option}` : option);
            if (next.length >= 240) break;
          }
          if (next.length >= 240) break;
        }
        combos = next;
      });
      combos.forEach(v => add(variants, v));
    });
    return { variants:[...variants], tokens };
  }

  function editDistanceAtMost(a, b, limit) {
    if (a === b) return true;
    if (Math.abs(a.length - b.length) > limit) return false;
    if (!a.length || !b.length) return Math.max(a.length, b.length) <= limit;

    let prev = Array.from({ length:b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i += 1) {
      const cur = [i];
      let rowMin = cur[0];
      for (let j = 1; j <= b.length; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        rowMin = Math.min(rowMin, cur[j]);
      }
      if (rowMin > limit) return false;
      prev = cur;
    }
    return prev[b.length] <= limit;
  }

  function variantMatch(queryVariant, candidateVariant) {
    const q = normalize(queryVariant).replace(/\s+/g, '');
    const c = normalize(candidateVariant).replace(/\s+/g, '');
    if (!q || !c) return false;
    if (c.includes(q)) return true;
    if (q.length < 4 || c.length < 4) return false;
    const limit = Math.min(q.length, c.length) >= 8 ? 2 : 1;
    return editDistanceAtMost(q, c, limit);
  }

  function tokenGroupMatches(queryToken, candidateTokenGroups) {
    const qVariants = tokenVariants(queryToken);
    for (const cGroup of candidateTokenGroups) {
      for (const qv of qVariants) {
        for (const cv of cGroup) {
          if (variantMatch(qv, cv)) return true;
        }
      }
    }
    return false;
  }

  function smartMatch(values, query) {
    const q = normalize(query);
    if (!q) return true;
    const data = wordsAndVariants(values);
    const qTokens = q.split(' ').filter(Boolean);

    if (qTokens.length === 1) {
      const qVariants = tokenVariants(qTokens[0]);
      for (const qv of qVariants) {
        for (const cv of data.variants) {
          if (variantMatch(qv, cv)) return true;
        }
      }
      return false;
    }

    // For a phrase, every entered word must be represented somewhere in the
    // candidate. This prevents a query like "нас не догонят" matching a random
    // card merely because it contains "нас".
    return qTokens.every(token => tokenGroupMatches(token, data.tokens));
  }

  function participantFields(p) {
    const memberships = Array.isArray(p?.memberships) ? p.memberships : [];
    return [
      p?.name, p?.telegramName, p?.username,
      memberships.flatMap(m => [m?.team, m?.teamRaw, m?.nickname, m?.role, m?.game, m?.teamAlias])
    ];
  }

  function teamFields(t) {
    return [t?.name, t?.game, t?.games, t?.alias, t?.aliases, t?.searchName, t?.searchNames, t?.nameRu, t?.ruName, t?.russianName];
  }

  function participantMatches(p, query) {
    if (!p || typeof p !== 'object') return false;
    let fields = objectParticipantCache.get(p);
    if (!fields) { fields = participantFields(p); objectParticipantCache.set(p, fields); }
    return smartMatch(fields, query);
  }

  function teamMatches(t, query) {
    if (!t || typeof t !== 'object') return false;
    let fields = objectTeamCache.get(t);
    if (!fields) { fields = teamFields(t); objectTeamCache.set(t, fields); }
    return smartMatch(fields, query);
  }

  function afterRender() {
    try { window.RoyalParticipantCardUX?.decorate?.(); } catch (_) {}
    try { window.RoyalTeamGameColors?.refresh?.(); } catch (_) {}
    try { window.RoyalAdminBadges?.refresh?.(0); } catch (_) {}
    try { window.RoyalMayak?.refresh?.(); } catch (_) {}
    try { window.RoyalUX0539?.refreshJumpButtons?.(); } catch (_) {}
  }

  if (typeof renderParticipantsPage === 'function') {
    const nativeParticipants = renderParticipantsPage;
    renderParticipantsPage = function renderParticipantsPageV0541(query = '') {
      const q = normalize(query);
      if (!q) return nativeParticipants(query);
      const previousSearchText = participantSearchText;
      participantSearchText = p => participantMatches(p, q) ? q : '\u0000';
      try {
        return nativeParticipants(q);
      } finally {
        participantSearchText = previousSearchText;
        window.setTimeout(afterRender, 0);
      }
    };
  }

  if (typeof renderTeamsPage === 'function') {
    const nativeTeams = renderTeamsPage;
    renderTeamsPage = function renderTeamsPageV0541(query = '') {
      const q = normalize(query);
      if (!q) return nativeTeams(query);
      const previousSearchText = teamSearchText;
      teamSearchText = t => teamMatches(t, q) ? q : '\u0000';
      try {
        return nativeTeams(q);
      } finally {
        teamSearchText = previousSearchText;
        window.setTimeout(afterRender, 0);
      }
    };
  }

  window.RoyalHumanSearch = { version:VERSION, normalize, tokenVariants, smartMatch, participantMatches, teamMatches };
  window.__ROYAL_HUMAN_SEARCH_VERSION__ = VERSION;
})();
