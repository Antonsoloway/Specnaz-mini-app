/* Royal CRM Mini App — Native Search v0.5.46
 * Android-safe search:
 * - no CRM prewarm/index build;
 * - no beforeinput/composition interception;
 * - input remains a native stable DOM element;
 * - already-rendered cards are filtered by cached lightweight text keys;
 * - focused input is polled lightly so Android IME works even when input events are delayed.
 */
(() => {
  const VERSION = '0.5.46';
  const POLL_MS = 90;
  const FILTER_DELAY = 45;
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
      const mark = String.fromCharCode(0xE700 + placeholders.length);
      placeholders.push(cyr);
      raw = raw.replace(new RegExp(latin, 'g'), mark);
    });
    let out = '';
    for (const ch of Array.from(raw)) {
      if (ch === '§') { out += 'ай'; continue; }
      const code = ch.charCodeAt(0);
      if (code >= 0xE700 && code < 0xE700 + placeholders.length) out += placeholders[code - 0xE700];
      else out += LAT_SINGLE[ch] ?? ch;
    }
    return normalize(out);
  }

  const ALIASES = new Map([
    ['has ne dogonyat', 'нас не догонят'],
    ['xaoc', 'хаос'],
    ['topmo3ob het', 'тормозов нет'],
    ['ha a3apte', 'на азарте'],
    ['cbet b okhe', 'свет в окне'],
    ['opuoh', 'орион'],
    ['kpytbie', 'крутые'],
    ['tabepha xytopok', 'таверна хуторок'],
    ['cobectu het', 'совести нет'],
    ['cbou', 'свои'],
    ['pa3ym', 'разум'],
    ['pa3hbie', 'разные'],
    ['kapma b kapmahe', 'карма в кармане'],
    ['akyha matata', 'акуна матата'],
    ['xopobod', 'хоровод'],
    ['kolomha', 'коломна'],
    ['cehat', 'сенат'],
    ['sbornayarf', 'сборная рф'],
    ['1by', '1бу'],
    ['joyband', 'джойбанд'],
    ['mike', 'майк'],
    ['xabib', 'хабиб']
  ]);

  function makeHaystack(text) {
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
      if (read) parts.add(read);
    }
    for (const [key, alias] of ALIASES) {
      if (base.includes(key)) {
        parts.add(alias);
        parts.add(cyrToLat(alias));
      }
    }
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
    return [...forms].filter(Boolean);
  }

  function ensureCardKey(card) {
    if (!card) return '';
    if (!card.dataset.searchKeyV0546) {
      card.dataset.searchKeyV0546 = makeHaystack(card.textContent || '');
    }
    return card.dataset.searchKeyV0546;
  }

  function ensureEmpty(container) {
    let empty = container?.querySelector(':scope > .search-empty-v0546');
    if (!empty && container) {
      empty = document.createElement('div');
      empty.className = 'empty-state search-empty-v0546';
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
    const selector = participants ? '#panel .people-list' : '#panel .teams-list';
    const cardSelector = participants ? ':scope > .person-card' : ':scope > .team-card';
    const title = participants ? 'Участники' : 'Команды';
    const container = document.querySelector(selector);
    if (!container) return;

    const cards = [...container.querySelectorAll(cardSelector)];
    const forms = queryForms(rawQuery);
    const words = normalize(rawQuery).split(' ').filter(Boolean);
    let found = 0;

    for (const card of cards) {
      const haystack = ensureCardKey(card);
      let show = true;
      if (forms.length) {
        show = forms.some(form => haystack.includes(form));
        if (!show && words.length > 1) {
          show = words.every(word => queryForms(word).some(form => haystack.includes(form)));
        }
      }
      card.hidden = !show;
      if (show) found += 1;
    }

    const empty = ensureEmpty(container);
    if (empty) empty.hidden = found !== 0;
    updateCount(title, found, cards.length, forms.length > 0);
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
    if (old.dataset.nativeSearchV0546 === '1') return old;

    // Remove legacy direct listeners without touching keyboard/IME events afterwards.
    const input = old.cloneNode(true);
    input.value = old.value;
    input.dataset.nativeSearchV0546 = '1';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocapitalize', 'none');
    input.setAttribute('spellcheck', 'false');
    old.replaceWith(input);

    let poll = 0;
    let lastValue = input.value;

    const checkValue = () => {
      const value = input.value;
      if (value !== lastValue) {
        lastValue = value;
        schedule(kind, value);
      }
    };

    const startPoll = () => {
      if (poll) return;
      checkValue();
      poll = window.setInterval(checkValue, POLL_MS);
    };
    const stopPoll = () => {
      if (!poll) return;
      clearInterval(poll);
      poll = 0;
      checkValue();
    };

    input.addEventListener('focus', startPoll, { passive:true });
    input.addEventListener('blur', stopPoll, { passive:true });
    input.addEventListener('input', checkValue, { passive:true });
    input.addEventListener('change', checkValue, { passive:true });
    input.addEventListener('search', checkValue, { passive:true });

    return input;
  }

  function installCurrent() {
    installInput('participantSearch', 'participants');
    installInput('teamSearch', 'teams');
  }

  const nativeParticipants = typeof renderParticipantsPage === 'function' ? renderParticipantsPage : null;
  if (nativeParticipants) {
    renderParticipantsPage = function renderParticipantsPageV0546(query = '') {
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
    renderTeamsPage = function renderTeamsPageV0546(query = '') {
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

  window.RoyalNativeSearch = {
    version: VERSION,
    filter: filterRendered,
    aliases: Object.fromEntries(ALIASES)
  };
  window.__ROYAL_NATIVE_SEARCH_VERSION__ = VERSION;
})();
