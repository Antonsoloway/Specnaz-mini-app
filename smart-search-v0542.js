/* Royal CRM Mini App — Indexed Search v0.5.42
 * Fast human-friendly search without re-rendering the input on every keystroke.
 *
 * Main changes vs v0.5.41:
 * - object search variants are built once and cached;
 * - query variants are small and cheap;
 * - input is debounced and the legacy immediate input handler is suppressed;
 * - existing renderers receive an already-filtered list with an empty query,
 *   so old literal-search code is bypassed completely;
 * - Cyrillic/Latin, pseudo-Cyrillic, phonetic English reading, keyboard layout,
 *   partial matching and conservative typo tolerance are preserved.
 */
(() => {
  const VERSION = '0.5.42';
  const INPUT_DELAY = 120;
  const participantIndex = new WeakMap();
  const teamIndex = new WeakMap();
  const tokenVariantCache = new Map();
  let inputTimer = 0;
  let composing = false;

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

  function compact(value) {
    return normalize(value).replace(/\s+/g, '');
  }

  const CYR_TO_LAT = {
    а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'
  };

  function cyrToLat(value) {
    return Array.from(normalize(value)).map(ch => CYR_TO_LAT[ch] ?? ch).join('');
  }

  const EN_KEYS = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
  const RU_KEYS = 'йцукенгшщзхъфывапролджэячсмитьбюё';
  const EN_TO_RU = Object.fromEntries(Array.from(EN_KEYS).map((ch, i) => [ch, Array.from(RU_KEYS)[i] || ch]));
  const RU_TO_EN = Object.fromEntries(Array.from(RU_KEYS).map((ch, i) => [ch, Array.from(EN_KEYS)[i] || ch]));

  function keyboardSwap(value, map) {
    return Array.from(normalize(value)).map(ch => map[ch] ?? ch).join('');
  }

  const MULTI = [
    ['shch','щ'],['sch','щ'],['yo','е'],['zh','ж'],['kh','х'],['ts','ц'],['ch','ч'],['sh','ш'],['yu','ю'],['ya','я'],['ye','е'],['ja','я'],['ju','ю']
  ];

  // Deliberately limited ambiguity: enough for Royal game-style names without
  // exploding to hundreds of combinations per token.
  const LAT_OPTIONS = {
    a:['а'], b:['б','в'], c:['с','ц'], d:['д'], e:['е','э'], f:['ф'], g:['г'],
    h:['х','н'], i:['и'], j:['дж','й'], k:['к'], l:['л'], m:['м'], n:['н'], o:['о'],
    p:['п','р'], q:['к'], r:['р'], s:['с'], t:['т'], u:['у','и'], v:['в'], w:['в','ш'],
    x:['х','кс'], y:['й','ы','у'], z:['з'], '0':['о'], '3':['з'], '4':['ч'], '6':['б'], '9':['я']
  };

  function splitMulti(raw) {
    const placeholders = [];
    let text = raw;
    MULTI.forEach(([latin, cyr]) => {
      const mark = String.fromCharCode(0xE300 + placeholders.length);
      placeholders.push(cyr);
      text = text.replace(new RegExp(latin, 'g'), mark);
    });
    return { text, placeholders };
  }

  function latinCandidates(value, limit = 24) {
    const raw = compact(value);
    if (!/[a-z]/.test(raw)) return raw ? [raw] : [];
    const { text, placeholders } = splitMulti(raw);
    let variants = [''];

    for (const ch of Array.from(text)) {
      const code = ch.charCodeAt(0);
      const options = code >= 0xE300 && code < 0xE300 + placeholders.length
        ? [placeholders[code - 0xE300]]
        : (LAT_OPTIONS[ch] || [ch]);
      const next = [];
      for (const prefix of variants) {
        for (const option of options) {
          next.push(prefix + option);
          if (next.length >= limit) break;
        }
        if (next.length >= limit) break;
      }
      variants = next;
    }
    return variants;
  }

  function englishReadings(token) {
    const raw = compact(token);
    const out = new Set();
    if (!raw || !/[a-z]/.test(raw)) return [];

    // Mike/like/bike/time type names.
    const silentE = raw.match(/^([a-z]*?)i([bcdfghjklmnpqrstvwxyz])e$/);
    if (silentE) {
      const prefixes = latinCandidates(silentE[1], 6);
      const consonants = latinCandidates(silentE[2], 4);
      prefixes.forEach(p => consonants.forEach(c => out.add(`${p}ай${c}`)));
    }

    // JoyBand and similar English-looking names.
    if (raw.startsWith('j')) {
      const rest = raw.slice(1).replace(/oy/g, 'ой');
      latinCandidates(rest, 12).forEach(v => out.add(`дж${v}`));
    }
    if (raw.includes('oy')) {
      const replaced = raw.replace(/oy/g, 'ой');
      latinCandidates(replaced, 12).forEach(v => out.add(v));
    }

    // Xabib/Habib style names.
    if (/^x[a-z]/.test(raw)) {
      latinCandidates(raw.slice(1), 12).forEach(v => out.add(`х${v}`));
    }

    return [...out];
  }

  function addVariant(set, value) {
    const n = normalize(value);
    if (!n) return;
    set.add(n);
    set.add(n.replace(/\s+/g, ''));
  }

  function tokenVariants(value) {
    const key = compact(value);
    if (!key) return [];
    const cached = tokenVariantCache.get(key);
    if (cached) return cached;

    const set = new Set();
    addVariant(set, key);
    addVariant(set, cyrToLat(key));
    addVariant(set, keyboardSwap(key, EN_TO_RU));
    addVariant(set, keyboardSwap(key, RU_TO_EN));
    latinCandidates(key, 24).forEach(v => addVariant(set, v));
    englishReadings(key).forEach(v => addVariant(set, v));

    // Back-transliteration makes matching symmetric.
    [...set].slice(0, 36).forEach(v => addVariant(set, cyrToLat(v)));

    const result = [...set].filter(Boolean).slice(0, 72);
    tokenVariantCache.set(key, result);
    return result;
  }

  function flatten(values, out = []) {
    if (Array.isArray(values)) {
      values.forEach(value => flatten(value, out));
      return out;
    }
    const text = String(values == null ? '' : values).trim();
    if (text) out.push(text);
    return out;
  }

  function buildIndex(values) {
    const phrases = new Set();
    const tokenGroups = [];

    flatten(values).forEach(field => {
      const n = normalize(field);
      if (!n) return;
      addVariant(phrases, n);
      addVariant(phrases, cyrToLat(n));
      addVariant(phrases, keyboardSwap(n, EN_TO_RU));
      addVariant(phrases, keyboardSwap(n, RU_TO_EN));

      const parts = n.split(' ').filter(Boolean);
      const groups = parts.map(tokenVariants);
      groups.forEach(group => {
        tokenGroups.push(group);
        group.forEach(v => addVariant(phrases, v));
      });

      // A small phrase cross-product, capped hard. Enough for "Has ne dogonyat".
      let combos = [''];
      for (const group of groups) {
        const options = group.slice(0, 8);
        const next = [];
        for (const prefix of combos) {
          for (const option of options) {
            next.push(prefix ? `${prefix} ${option}` : option);
            if (next.length >= 72) break;
          }
          if (next.length >= 72) break;
        }
        combos = next;
      }
      combos.forEach(v => addVariant(phrases, v));
    });

    return {
      phrases: [...phrases],
      compactPhrases: [...phrases].map(compact),
      tokenGroups
    };
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

  function getParticipantIndex(p) {
    let idx = participantIndex.get(p);
    if (!idx) {
      idx = buildIndex(participantFields(p));
      participantIndex.set(p, idx);
    }
    return idx;
  }

  function getTeamIndex(t) {
    let idx = teamIndex.get(t);
    if (!idx) {
      idx = buildIndex(teamFields(t));
      teamIndex.set(t, idx);
    }
    return idx;
  }

  function editDistanceAtMost(a, b, limit) {
    if (a === b) return true;
    if (Math.abs(a.length - b.length) > limit) return false;
    if (!a.length || !b.length) return Math.max(a.length, b.length) <= limit;

    let prev = Array.from({ length:b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i += 1) {
      const cur = [i];
      let rowMin = i;
      for (let j = 1; j <= b.length; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        const value = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        cur[j] = value;
        if (value < rowMin) rowMin = value;
      }
      if (rowMin > limit) return false;
      prev = cur;
    }
    return prev[b.length] <= limit;
  }

  function oneVariantMatches(q, candidate) {
    if (!q || !candidate) return false;
    if (candidate.includes(q)) return true;
    if (q.length >= 4 && q.includes(candidate) && candidate.length >= 3) return true;
    if (q.length < 5 || candidate.length < 5) return false;
    const limit = Math.min(q.length, candidate.length) >= 9 ? 2 : 1;
    return editDistanceAtMost(q, candidate, limit);
  }

  function tokenMatches(queryToken, idx) {
    const qVariants = tokenVariants(queryToken).map(compact).filter(Boolean);
    for (const group of idx.tokenGroups) {
      for (const candidateRaw of group) {
        const candidate = compact(candidateRaw);
        for (const q of qVariants) {
          if (oneVariantMatches(q, candidate)) return true;
        }
      }
    }
    return false;
  }

  function indexMatches(idx, query) {
    const q = normalize(query);
    if (!q) return true;

    const qCompact = compact(q);
    const phraseVariants = new Set([qCompact, compact(cyrToLat(q)), compact(keyboardSwap(q, EN_TO_RU)), compact(keyboardSwap(q, RU_TO_EN))]);
    q.split(' ').filter(Boolean).forEach(token => tokenVariants(token).slice(0, 18).forEach(v => phraseVariants.add(compact(v))));

    for (const qv of phraseVariants) {
      if (!qv) continue;
      for (const candidate of idx.compactPhrases) {
        if (candidate.includes(qv)) return true;
      }
    }

    const tokens = q.split(' ').filter(Boolean);
    return tokens.length > 0 && tokens.every(token => tokenMatches(token, idx));
  }

  function participantMatches(p, query) {
    return indexMatches(getParticipantIndex(p), query);
  }

  function teamMatches(t, query) {
    return indexMatches(getTeamIndex(t), query);
  }

  function afterRender() {
    try { window.RoyalParticipantCardUX?.decorate?.(); } catch (_) {}
    try { window.RoyalTeamGameColors?.refresh?.(); } catch (_) {}
    try { window.RoyalAdminBadges?.refresh?.(0); } catch (_) {}
    try { window.RoyalMayak?.refresh?.(); } catch (_) {}
    try { window.RoyalUX0539?.refreshJumpButtons?.(); } catch (_) {}
  }

  function replaceCount(page, found, total, hasQuery) {
    if (!hasQuery) return;
    const panel = document.getElementById('panel');
    const heading = [...(panel?.querySelectorAll?.('.section-title-row h2') || [])].find(h => h.textContent.trim() === page);
    const muted = heading?.parentElement?.querySelector('.muted');
    if (muted) muted.textContent = `${found} из ${total}`;
  }

  function installFastInput(id, renderer, value) {
    const input = document.getElementById(id);
    if (!input) return;
    input.value = value;
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocapitalize', 'none');
    input.setAttribute('spellcheck', 'false');

    const schedule = () => {
      if (composing) return;
      window.clearTimeout(inputTimer);
      const currentValue = input.value;
      const selection = input.selectionStart;
      inputTimer = window.setTimeout(() => {
        renderer(currentValue, { restoreFocus:true, selection });
      }, INPUT_DELAY);
    };

    input.addEventListener('compositionstart', () => { composing = true; }, { capture:true });
    input.addEventListener('compositionend', event => {
      composing = false;
      event.stopImmediatePropagation();
      schedule();
    }, { capture:true });

    // Capture-phase listener runs before the legacy listener created by app.js.
    // stopImmediatePropagation prevents the expensive immediate full re-render.
    input.addEventListener('input', event => {
      event.stopImmediatePropagation();
      schedule();
    }, { capture:true });
  }

  function restoreFocus(id, selection) {
    const input = document.getElementById(id);
    if (!input) return;
    try {
      input.focus({ preventScroll:true });
      const pos = Math.max(0, Math.min(Number(selection ?? input.value.length), input.value.length));
      input.setSelectionRange(pos, pos);
    } catch (_) {}
  }

  const nativeParticipants = typeof renderParticipantsPage === 'function' ? renderParticipantsPage : null;
  const nativeTeams = typeof renderTeamsPage === 'function' ? renderTeamsPage : null;

  if (nativeParticipants) {
    renderParticipantsPage = function renderParticipantsPageV0542(query = '', options = {}) {
      const q = normalize(query);
      const state = (typeof snapshotState !== 'undefined' && snapshotState) ? snapshotState : null;
      const all = state && Array.isArray(state.participants) ? state.participants : [];
      if (!q || !all.length) {
        const result = nativeParticipants('');
        installFastInput('participantSearch', renderParticipantsPage, query);
        if (options.restoreFocus) restoreFocus('participantSearch', options.selection);
        window.setTimeout(afterRender, 0);
        return result;
      }

      const filtered = all.filter(p => participantMatches(p, q));
      state.participants = filtered;
      let result;
      try {
        result = nativeParticipants('');
      } finally {
        state.participants = all;
      }
      replaceCount('Участники', filtered.length, all.length, true);
      installFastInput('participantSearch', renderParticipantsPage, query);
      if (options.restoreFocus) restoreFocus('participantSearch', options.selection);
      window.setTimeout(afterRender, 0);
      return result;
    };
  }

  if (nativeTeams) {
    renderTeamsPage = function renderTeamsPageV0542(query = '', options = {}) {
      const q = normalize(query);
      const state = (typeof snapshotState !== 'undefined' && snapshotState) ? snapshotState : null;
      const all = state && Array.isArray(state.teams) ? state.teams : [];
      if (!q || !all.length) {
        const result = nativeTeams('');
        installFastInput('teamSearch', renderTeamsPage, query);
        if (options.restoreFocus) restoreFocus('teamSearch', options.selection);
        window.setTimeout(afterRender, 0);
        return result;
      }

      const filtered = all.filter(t => teamMatches(t, q));
      state.teams = filtered;
      let result;
      try {
        result = nativeTeams('');
      } finally {
        state.teams = all;
      }
      replaceCount('Команды', filtered.length, all.length, true);
      installFastInput('teamSearch', renderTeamsPage, query);
      if (options.restoreFocus) restoreFocus('teamSearch', options.selection);
      window.setTimeout(afterRender, 0);
      return result;
    };
  }

  // Warm the indexes after the snapshot arrives, but yield between chunks so the
  // first screen remains responsive even on older phones.
  function warmIndexes() {
    const participants = Array.isArray(snapshotState?.participants) ? snapshotState.participants : [];
    const teams = Array.isArray(snapshotState?.teams) ? snapshotState.teams : [];
    const queue = [
      ...participants.map(item => () => getParticipantIndex(item)),
      ...teams.map(item => () => getTeamIndex(item))
    ];
    let cursor = 0;
    const step = deadline => {
      let count = 0;
      while (cursor < queue.length && count < 18 && (!deadline || deadline.timeRemaining() > 2)) {
        try { queue[cursor++](); } catch (_) { cursor += 1; }
        count += 1;
      }
      if (cursor < queue.length) {
        if ('requestIdleCallback' in window) requestIdleCallback(step, { timeout:250 });
        else setTimeout(() => step(null), 16);
      }
    };
    if ('requestIdleCallback' in window) requestIdleCallback(step, { timeout:250 });
    else setTimeout(() => step(null), 16);
  }

  [200, 700, 1500].forEach(delay => setTimeout(warmIndexes, delay));

  window.RoyalFastSearch = {
    version: VERSION,
    normalize,
    tokenVariants,
    participantMatches,
    teamMatches,
    warm: warmIndexes
  };
  window.__ROYAL_FAST_SEARCH_VERSION__ = VERSION;
})();
