/* Royal CRM Mini App — Hybrid Search v0.5.49
 * IMPORTANT: v0.5.47 search remains intact as the local fallback.
 * Snapshot searchKeys are only ADDED to the old local search text; they never replace it.
 * Android-safe input behavior from v0.5.46/v0.5.47 is preserved.
 */
(() => {
  const VERSION = '0.5.49';
  const POLL_MS = 90;
  const FILTER_DELAY = 45;
  let participantTimer = 0;
  let teamTimer = 0;
  const cardCache = new WeakMap();
  let participantSource = null;
  let participantById = new Map();
  let teamSource = null;
  let teamByName = new Map();

  function normalize(value) {
    let text = String(value == null ? '' : value);
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
      const mark = String.fromCharCode(0xE800 + placeholders.length);
      placeholders.push(cyr);
      raw = raw.replace(new RegExp(latin, 'g'), mark);
    });
    let out = '';
    for (const ch of Array.from(raw)) {
      if (ch === '§') { out += 'ай'; continue; }
      const code = ch.charCodeAt(0);
      if (code >= 0xE800 && code < 0xE800 + placeholders.length) out += placeholders[code - 0xE800];
      else out += LAT_SINGLE[ch] ?? ch;
    }
    return normalize(out);
  }

  // Same compact explicit-alias approach as v0.5.47, expanded with confirmed cases.
  const ALIASES = new Map([
    ['has ne dogonyat', ['нас не догонят']],
    ['xaoc', ['хаос']],
    ['topmo3ob het', ['тормозов нет']],
    ['ha a3apte', ['на азарте']],
    ['cbet b okhe', ['свет в окне']],
    ['da budet swet 5', ['да будет свет 5','да будет свет']],
    ['da budet swet', ['да будет свет']],
    ['molot poka', ['молот рока']],
    ['aquamarine', ['аквамарин']],
    ['hepbbi b hopme', ['нервы в норме']],
    ['opuoh', ['орион']],
    ['kpytbie', ['крутые']],
    ['tabepha xytopok', ['таверна хуторок']],
    ['cobectu het', ['совести нет']],
    ['cbou', ['свои']],
    ['pa3ym', ['разум']],
    ['pa3hbie', ['разные']],
    ['kapma b kapmahe', ['карма в кармане']],
    ['akyha matata', ['акуна матата']],
    ['xopobod', ['хоровод']],
    ['kolomha', ['коломна']],
    ['cehat', ['сенат']],
    ['paketa', ['ракета']],
    ['kotehok', ['котенок']],
    ['sbornayarf', ['сборная рф']],
    ['1by', ['1бу']],
    ['joyband', ['джойбанд']],
    ['mike', ['майк']],
    ['xabib', ['хабиб']]
  ]);

  function aliasesFor(value) {
    const n = normalize(value);
    const c = compact(value);
    const out = [];
    for (const [key, aliases] of ALIASES) {
      const nk = normalize(key);
      const ck = compact(key);
      if (n === nk || c === ck || n.includes(nk)) out.push(...aliases);
    }
    return out;
  }

  // This is the v0.5.47 local-search idea: build cheap deterministic forms from
  // already rendered text. This layer works even if snapshot searchKeys are absent/bad.
  function makeLocalHaystack(text) {
    const base = normalize(text);
    if (!base) return '';
    const parts = new Set([base, base.replace(/\s+/g, '')]);
    if (/[а-я]/u.test(base)) {
      const lat = cyrToLat(base);
      parts.add(lat);
      parts.add(lat.replace(/\s+/g, ''));
    }
    if (/[a-z]/.test(base)) {
      const read = englishRead(base);
      if (read) {
        parts.add(read);
        parts.add(read.replace(/\s+/g, ''));
      }
    }
    aliasesFor(base).forEach(alias => {
      const a = normalize(alias);
      if (!a) return;
      parts.add(a);
      parts.add(a.replace(/\s+/g, ''));
      const lat = cyrToLat(a);
      if (lat) parts.add(lat);
    });
    return [...parts].join(' ');
  }

  function queryForms(value) {
    const q = normalize(value);
    if (!q) return [];
    const forms = new Set([q, q.replace(/\s+/g, '')]);
    if (/[а-я]/u.test(q)) {
      const lat = cyrToLat(q);
      forms.add(lat);
      forms.add(lat.replace(/\s+/g, ''));
    } else if (/[a-z]/.test(q)) {
      const read = englishRead(q);
      if (read) forms.add(read);
    }
    aliasesFor(q).forEach(alias => forms.add(normalize(alias)));
    return [...forms].filter(Boolean);
  }

  function refreshMaps() {
    const participants = Array.isArray(snapshotState?.participants) ? snapshotState.participants : [];
    if (participantSource !== participants) {
      participantSource = participants;
      participantById = new Map();
      participants.forEach(p => {
        const id = String(p?.telegramId || '').trim().replace(/\.0$/, '');
        if (id) participantById.set(id, p);
      });
    }

    const teams = Array.isArray(snapshotState?.teams) ? snapshotState.teams : [];
    if (teamSource !== teams) {
      teamSource = teams;
      teamByName = new Map();
      teams.forEach(t => {
        const key = normalize(t?.name || '');
        if (key) teamByName.set(key, t);
      });
    }
  }

  function snapshotItemForCard(card, kind) {
    refreshMaps();
    if (kind === 'participants') {
      const id = String(card?.dataset?.participantTelegramId || '').trim().replace(/\.0$/, '');
      return id ? participantById.get(id) || null : null;
    }
    let name = String(card?.dataset?.team || '');
    try { name = decodeURIComponent(name); } catch (_) {}
    return teamByName.get(normalize(name)) || null;
  }

  function combinedHaystack(card, kind) {
    const cached = cardCache.get(card);
    if (cached) return cached;

    // Layer 1: old v0.5.47-style local search. Never removed.
    const parts = [makeLocalHaystack(card?.textContent || '')];

    // Layer 2: server-prepared searchKeys. They only ADD searchable strings.
    const item = snapshotItemForCard(card, kind);
    const keys = Array.isArray(item?.searchKeys) ? item.searchKeys : [];
    keys.forEach(key => {
      const n = normalize(key);
      if (n) {
        parts.push(n);
        parts.push(n.replace(/\s+/g, ''));
      }
    });

    const haystack = parts.filter(Boolean).join(' ');
    cardCache.set(card, haystack);
    return haystack;
  }

  function matchesHaystack(haystack, rawQuery) {
    const q = normalize(rawQuery);
    if (!q) return true;
    const forms = queryForms(rawQuery);
    if (forms.some(form => haystack.includes(form))) return true;
    const words = q.split(' ').filter(Boolean);
    return words.length > 1 && words.every(word =>
      queryForms(word).some(form => haystack.includes(form))
    );
  }

  function ensureEmpty(container) {
    if (!container) return null;
    let empty = container.querySelector(':scope > .search-empty-v0549');
    if (!empty) {
      empty = document.createElement('div');
      empty.className = 'empty-state search-empty-v0549';
      empty.textContent = 'Ничего не найдено';
      empty.hidden = true;
      container.appendChild(empty);
    }
    return empty;
  }

  function updateCount(title, found, total, hasQuery) {
    const panel = document.getElementById('panel');
    const heading = [...(panel?.querySelectorAll?.('.section-title-row h2') || [])]
      .find(h => h.textContent.trim() === title);
    const muted = heading?.parentElement?.querySelector('.muted');
    if (muted) muted.textContent = hasQuery ? `${found} из ${total}` : String(total);
  }

  function filterRendered(kind, rawQuery) {
    const participants = kind === 'participants';
    const container = document.querySelector(participants ? '#panel .people-list' : '#panel .teams-list');
    if (!container) return;
    const selector = participants ? ':scope > .person-card' : ':scope > .team-card';
    const cards = [...container.querySelectorAll(selector)];
    const hasQuery = !!normalize(rawQuery);
    let found = 0;

    for (const card of cards) {
      const show = !hasQuery || matchesHaystack(combinedHaystack(card, kind), rawQuery);
      card.hidden = !show;
      card.classList.toggle('royal-search-hidden', !show);
      if (show) found += 1;
    }

    const empty = ensureEmpty(container);
    if (empty) empty.hidden = found !== 0;
    updateCount(participants ? 'Участники' : 'Команды', found, cards.length, hasQuery);
    try { window.RoyalUX0539?.refreshJumpButtons?.(); } catch (_) {}
  }

  function schedule(kind, value) {
    if (kind === 'participants') {
      clearTimeout(participantTimer);
      participantTimer = setTimeout(() => filterRendered(kind, value), FILTER_DELAY);
    } else {
      clearTimeout(teamTimer);
      teamTimer = setTimeout(() => filterRendered(kind, value), FILTER_DELAY);
    }
  }

  function installInput(id, kind) {
    const old = document.getElementById(id);
    if (!old) return null;
    if (old.dataset.hybridSearchV0549 === '1') return old;

    // Same Android-safe method as v0.5.47: clone once to remove old rerender listener,
    // then never block beforeinput/composition events and never rerender the input.
    const input = old.cloneNode(true);
    input.value = old.value;
    input.dataset.hybridSearchV0549 = '1';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocapitalize', 'none');
    input.setAttribute('spellcheck', 'false');
    old.replaceWith(input);

    let poll = 0;
    let lastValue = input.value;
    const check = () => {
      const value = input.value;
      if (value === lastValue) return;
      lastValue = value;
      schedule(kind, value);
    };
    const startPoll = () => {
      if (poll) return;
      check();
      poll = window.setInterval(check, POLL_MS);
    };
    const stopPoll = () => {
      if (poll) clearInterval(poll);
      poll = 0;
      check();
    };

    input.addEventListener('focus', startPoll, { passive:true });
    input.addEventListener('blur', stopPoll, { passive:true });
    input.addEventListener('input', check, { passive:true });
    input.addEventListener('change', check, { passive:true });
    input.addEventListener('search', check, { passive:true });
    return input;
  }

  function installCurrent() {
    installInput('participantSearch', 'participants');
    installInput('teamSearch', 'teams');
  }

  const nativeParticipants = typeof renderParticipantsPage === 'function' ? renderParticipantsPage : null;
  if (nativeParticipants) {
    renderParticipantsPage = function renderParticipantsPageV0549(query = '') {
      const result = nativeParticipants('');
      const input = installInput('participantSearch', 'participants');
      if (input && query) {
        input.value = String(query);
        schedule('participants', input.value);
      }
      return result;
    };
  }

  const nativeTeams = typeof renderTeamsPage === 'function' ? renderTeamsPage : null;
  if (nativeTeams) {
    renderTeamsPage = function renderTeamsPageV0549(query = '') {
      const result = nativeTeams('');
      const input = installInput('teamSearch', 'teams');
      if (input && query) {
        input.value = String(query);
        schedule('teams', input.value);
      }
      return result;
    };
  }

  setTimeout(installCurrent, 0);

  window.RoyalHybridSearch = {
    version: VERSION,
    filter: filterRendered,
    localFallback: true,
    snapshotKeys: true,
    searchIndexVersion: () => String(snapshotState?.searchIndexVersion || '')
  };
  window.__ROYAL_HYBRID_SEARCH_VERSION__ = VERSION;
})();
