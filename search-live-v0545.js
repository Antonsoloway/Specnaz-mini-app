/* Royal CRM Mini App — Live Search v0.5.45
 * - never blocks keyboard/IME events;
 * - never redraws the search field or result cards while typing;
 * - filters already-rendered cards by show/hide;
 * - reacts during Android IME composition via compositionupdate/beforeinput;
 * - deterministic pseudo-Russian recognition (visual alphabet) + small aliases;
 */
(() => {
  const VERSION = '0.5.45';
  const DELAY = 55;
  const IN_CHAT = 'В чате';
  const participantIndex = new WeakMap();
  const teamIndex = new WeakMap();
  let participantTimer = 0;
  let teamTimer = 0;

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

  function compact(value) { return normalize(value).replace(/\s+/g, ''); }

  const CYR_TO_LAT = {
    а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'
  };
  function cyrToLat(value) {
    return Array.from(normalize(value)).map(ch => CYR_TO_LAT[ch] ?? ch).join('');
  }

  const LAT_MULTI = [
    ['shch','щ'],['sch','щ'],['zh','ж'],['kh','х'],['ts','ц'],['ch','ч'],['sh','ш'],['yu','ю'],['ya','я'],['yo','е'],['ye','е']
  ];
  const LAT_SINGLE = {
    a:'а',b:'б',c:'к',d:'д',e:'е',f:'ф',g:'г',h:'х',i:'и',j:'дж',k:'к',l:'л',m:'м',n:'н',o:'о',p:'п',q:'к',r:'р',s:'с',t:'т',u:'у',v:'в',w:'в',x:'кс',y:'й',z:'з'
  };

  function englishRead(value) {
    let raw = normalize(value);
    if (!raw || !/[a-z]/.test(raw) || /[а-я]/u.test(raw)) return '';
    raw = raw.replace(/^([a-z]*?)i([bcdfghjklmnpqrstvwxyz])e$/g, '$1§$2');
    raw = raw.replace(/^x(?=[a-z])/g, 'х');
    raw = raw.replace(/joy/g, 'джой').replace(/oy/g, 'ой');
    const placeholders = [];
    LAT_MULTI.forEach(([latin, cyr]) => {
      const mark = String.fromCharCode(0xE600 + placeholders.length);
      placeholders.push(cyr);
      raw = raw.replace(new RegExp(latin, 'g'), mark);
    });
    let out = '';
    for (const ch of Array.from(raw)) {
      if (ch === '§') { out += 'ай'; continue; }
      if (/[а-я]/u.test(ch)) { out += ch; continue; }
      const code = ch.charCodeAt(0);
      if (code >= 0xE600 && code < 0xE600 + placeholders.length) out += placeholders[code - 0xE600];
      else out += LAT_SINGLE[ch] ?? ch;
    }
    return normalize(out);
  }

  const VISUAL_CHARS = new Set(Array.from('ABCEHKMOPTXYabcehkmoptxyUIuibI03469'));
  const VISUAL_MAP = {
    A:'А',a:'а',B:'В',b:'в',C:'С',c:'с',E:'Е',e:'е',H:'Н',h:'н',K:'К',k:'к',M:'М',m:'м',O:'О',o:'о',P:'Р',p:'р',T:'Т',t:'т',X:'Х',x:'х',Y:'У',y:'у',
    U:'И',u:'и',I:'И',i:'и','0':'О','3':'З','4':'Ч','6':'Б','9':'Я'
  };

  function looksPseudoRussian(value) {
    const raw = String(value == null ? '' : value).replace(/[^A-Za-z0-9]/g, '');
    if (!raw || /[а-я]/iu.test(raw)) return false;
    let visual = 0;
    let upper = 0;
    let letters = 0;
    let digitHint = false;
    for (const ch of Array.from(raw)) {
      if (/[A-Za-z]/.test(ch)) {
        letters += 1;
        if (ch === ch.toUpperCase()) upper += 1;
      }
      if (VISUAL_CHARS.has(ch)) visual += 1;
      if (/[03469]/.test(ch)) digitHint = true;
    }
    const visualRatio = visual / Math.max(1, raw.length);
    const upperRatio = upper / Math.max(1, letters);
    return digitHint || (visualRatio >= 0.72 && upperRatio >= 0.55);
  }

  function pseudoVisual(value) {
    if (!looksPseudoRussian(value)) return '';
    let raw = String(value == null ? '' : value);
    raw = raw.replace(/bI/g, 'Ы').replace(/bi/g, 'ы');
    let out = '';
    for (const ch of Array.from(raw)) out += VISUAL_MAP[ch] ?? ch;
    return normalize(out);
  }

  const EXACT_ALIASES = new Map([
    ['has ne dogonyat', ['нас не догонят']],
    ['1by', ['1бу']],
    ['joyband', ['джойбанд']],
    ['sbornayarf', ['сборная рф']],
    ['akyha matata', ['акуна матата']]
  ]);

  function aliasesFor(value) {
    const n = normalize(value);
    const c = compact(value);
    const out = [];
    for (const [key, aliases] of EXACT_ALIASES) {
      const nk = normalize(key);
      const ck = compact(key);
      if (n === nk || c === ck || n.includes(nk)) out.push(...aliases);
    }
    return out;
  }

  function addVariant(set, value) {
    const n = normalize(value);
    if (!n) return;
    set.add(n);
    set.add(n.replace(/\s+/g, ''));
  }

  function fieldVariants(value) {
    const set = new Set();
    const raw = String(value == null ? '' : value).trim();
    if (!raw) return set;
    const n = normalize(raw);
    addVariant(set, n);
    if (/[а-я]/u.test(n)) {
      addVariant(set, cyrToLat(n));
    } else if (/[a-z]/.test(n)) {
      const pseudo = pseudoVisual(raw);
      if (pseudo) addVariant(set, pseudo);
      else addVariant(set, englishRead(n));
    }
    aliasesFor(n).forEach(alias => {
      addVariant(set, alias);
      addVariant(set, cyrToLat(alias));
    });
    return set;
  }

  function flatten(values, out = []) {
    if (Array.isArray(values)) { values.forEach(v => flatten(v, out)); return out; }
    const text = String(values == null ? '' : values).trim();
    if (text) out.push(text);
    return out;
  }

  function buildIndex(values) {
    const set = new Set();
    flatten(values).forEach(field => fieldVariants(field).forEach(v => set.add(v)));
    return [...set];
  }

  function participantFields(p) {
    const memberships = Array.isArray(p?.memberships) ? p.memberships : [];
    return [p?.name, p?.telegramName, p?.username,
      memberships.flatMap(m => [m?.team, m?.teamRaw, m?.teamAlias, m?.nickname, m?.role, m?.game])];
  }

  function teamFields(t) {
    return [t?.name, t?.game, t?.games, t?.alias, t?.aliases, t?.searchName, t?.searchNames, t?.nameRu, t?.ruName, t?.russianName];
  }

  function getParticipantIndex(p) {
    let idx = participantIndex.get(p);
    if (!idx) { idx = buildIndex(participantFields(p)); participantIndex.set(p, idx); }
    return idx;
  }
  function getTeamIndex(t) {
    let idx = teamIndex.get(t);
    if (!idx) { idx = buildIndex(teamFields(t)); teamIndex.set(t, idx); }
    return idx;
  }

  function queryVariants(query) {
    const set = new Set();
    const raw = String(query == null ? '' : query).trim();
    if (!raw) return [];
    fieldVariants(raw).forEach(v => set.add(v));
    const n = normalize(raw);
    if (/[а-я]/u.test(n)) addVariant(set, cyrToLat(n));
    return [...set];
  }

  function indexMatches(index, query) {
    const q = normalize(query);
    if (!q) return true;
    const forms = queryVariants(query);
    if (forms.some(form => index.some(candidate => candidate.includes(form)))) return true;
    const words = q.split(' ').filter(Boolean);
    if (words.length <= 1) return false;
    return words.every(word => {
      const wordForms = queryVariants(word);
      return wordForms.some(form => index.some(candidate => candidate.includes(form)));
    });
  }

  function visibleParticipants() {
    const list = Array.isArray(snapshotState?.participants) ? snapshotState.participants : [];
    return list
      .filter(p => {
        const state = String(p?.chatState || '').trim();
        return !state || state === IN_CHAT;
      })
      .map((p, i) => ({ p, i, incomplete: ![p?.name,p?.telegramName,p?.username].some(v => String(v || '').trim()) }))
      .sort((a,b) => Number(a.incomplete) - Number(b.incomplete) || a.i - b.i)
      .map(x => x.p);
  }

  function updateCount(title, found, total, hasQuery) {
    const panel = document.getElementById('panel');
    const heading = [...(panel?.querySelectorAll?.('.section-title-row h2') || [])].find(h => h.textContent.trim() === title);
    const muted = heading?.parentElement?.querySelector('.muted');
    if (muted) muted.textContent = hasQuery ? `${found} из ${total}` : String(total);
  }

  function ensureEmpty(container) {
    if (!container) return null;
    let empty = container.querySelector(':scope > .search-empty-v0545');
    if (!empty) {
      empty = document.createElement('div');
      empty.className = 'empty-state search-empty-v0545';
      empty.textContent = 'Ничего не найдено';
      empty.hidden = true;
      container.appendChild(empty);
    }
    return empty;
  }

  function participantRows() {
    const container = document.querySelector('#panel .people-list');
    if (!container) return { container:null, rows:[] };
    const data = visibleParticipants();
    const byId = new Map(data.map(p => [String(p?.telegramId || '').replace(/\.0$/, ''), p]));
    const cards = [...container.querySelectorAll(':scope > .person-card')];
    const rows = cards.map((el, index) => {
      const id = String(el.dataset.participantTelegramId || '').replace(/\.0$/, '');
      return { el, item: (id && byId.get(id)) || data[index] || null };
    });
    return { container, rows, total:data.length };
  }

  function teamRows() {
    const container = document.querySelector('#panel .teams-list');
    if (!container) return { container:null, rows:[] };
    const data = Array.isArray(snapshotState?.teams) ? snapshotState.teams : [];
    const cards = [...container.querySelectorAll(':scope > .team-card')];
    const rows = cards.map((el, index) => ({ el, item:data[index] || null }));
    return { container, rows, total:data.length };
  }

  function filterRows(kind, query) {
    const source = kind === 'participants' ? participantRows() : teamRows();
    if (!source.container) return;
    const q = normalize(query);
    let found = 0;
    for (const row of source.rows) {
      let show = true;
      if (q && row.item) {
        const index = kind === 'participants' ? getParticipantIndex(row.item) : getTeamIndex(row.item);
        show = indexMatches(index, query);
      } else if (q && !row.item) show = false;
      row.el.hidden = !show;
      if (show) found += 1;
    }
    const empty = ensureEmpty(source.container);
    if (empty) empty.hidden = found !== 0;
    updateCount(kind === 'participants' ? 'Участники' : 'Команды', found, source.total || source.rows.length, !!q);
    try { window.RoyalUX0539?.refreshJumpButtons?.(); } catch (_) {}
  }

  function installInput(id, kind) {
    const old = document.getElementById(id);
    if (!old) return null;
    if (old.dataset.liveSearchV0545 === '1') return old;

    const input = old.cloneNode(true);
    input.value = old.value;
    input.dataset.liveSearchV0545 = '1';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocapitalize', 'none');
    input.setAttribute('spellcheck', 'false');
    old.replaceWith(input);

    let composing = false;
    let compositionBase = '';
    let compositionStart = 0;
    let compositionEnd = 0;

    const run = value => {
      const timerName = kind === 'participants' ? 'participant' : 'team';
      if (timerName === 'participant') {
        clearTimeout(participantTimer);
        participantTimer = setTimeout(() => filterRows(kind, value), DELAY);
      } else {
        clearTimeout(teamTimer);
        teamTimer = setTimeout(() => filterRows(kind, value), DELAY);
      }
    };

    const readDomSoon = () => {
      setTimeout(() => run(input.value), 0);
    };

    input.addEventListener('compositionstart', () => {
      composing = true;
      compositionBase = input.value;
      compositionStart = Number(input.selectionStart ?? compositionBase.length);
      compositionEnd = Number(input.selectionEnd ?? compositionStart);
    });

    input.addEventListener('compositionupdate', event => {
      const dom = input.value;
      const data = String(event.data ?? '');
      let effective = dom;
      if (!dom || dom === compositionBase) {
        effective = compositionBase.slice(0, compositionStart) + data + compositionBase.slice(compositionEnd);
      }
      run(effective);
      readDomSoon();
    });

    input.addEventListener('compositionend', () => {
      composing = false;
      readDomSoon();
    });

    input.addEventListener('beforeinput', () => {
      readDomSoon();
    });
    input.addEventListener('input', () => {
      if (!composing) run(input.value);
      else readDomSoon();
    });
    input.addEventListener('keyup', () => {
      if (!composing) run(input.value);
    });
    input.addEventListener('search', () => {
      run(input.value);
    });

    return input;
  }

  function installCurrent() {
    installInput('participantSearch', 'participants');
    installInput('teamSearch', 'teams');
  }

  const nativeParticipants = typeof renderParticipantsPage === 'function' ? renderParticipantsPage : null;
  if (nativeParticipants) {
    renderParticipantsPage = function renderParticipantsPageV0545(query = '') {
      const result = nativeParticipants('');
      const input = installInput('participantSearch', 'participants');
      if (input) input.value = String(query || '');
      if (query) filterRows('participants', query);
      return result;
    };
  }

  const nativeTeams = typeof renderTeamsPage === 'function' ? renderTeamsPage : null;
  if (nativeTeams) {
    renderTeamsPage = function renderTeamsPageV0545(query = '') {
      const result = nativeTeams('');
      const input = installInput('teamSearch', 'teams');
      if (input) input.value = String(query || '');
      if (query) filterRows('teams', query);
      return result;
    };
  }

  function prewarm() {
    if (!snapshotState) { setTimeout(prewarm, 400); return; }
    const work = () => {
      visibleParticipants().forEach(getParticipantIndex);
      (Array.isArray(snapshotState?.teams) ? snapshotState.teams : []).forEach(getTeamIndex);
    };
    if ('requestIdleCallback' in window) requestIdleCallback(work, { timeout:1200 });
    else setTimeout(work, 200);
  }

  setTimeout(prewarm, 250);
  setTimeout(installCurrent, 0);

  window.RoyalLiveSearch = {
    version: VERSION,
    filterRows,
    pseudoVisual,
    looksPseudoRussian,
    participantMatches: (p,q) => indexMatches(getParticipantIndex(p), q),
    teamMatches: (t,q) => indexMatches(getTeamIndex(t), q)
  };
  window.__ROYAL_LIVE_SEARCH_VERSION__ = VERSION;
})();
