/* Royal CRM Mini App — Smart Search v0.5.40
 * Advanced participant/team search for game-style names:
 * - Cyrillic <-> Latin transliteration
 * - visual pseudo-Cyrillic: HET -> НЕТ, XAOC -> ХАОС, TOPMO3OB -> ТОРМОЗОВ
 * - mixed phrases: Has ne dogonyat -> НАС НЕ ДОГОНЯТ
 * - common RU/EN keyboard-layout mistakes
 * - punctuation/emoji/space-insensitive matching
 * Search stays UI-only; participant identity remains raw Telegram ID.
 */
(() => {
  const VERSION = '0.5.40';
  const phraseCache = new Map();
  const tokenCache = new Map();
  const MAX_PHRASE_VARIANTS = 320;

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
    а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'
  };

  function cyrToLat(value) {
    return Array.from(normalize(value)).map(ch => CYR_TO_LAT[ch] ?? ch).join('');
  }

  const PHONETIC_MULTI = [
    ['shch','щ'],['sch','щ'],['yo','е'],['zh','ж'],['kh','х'],['ts','ц'],['ch','ч'],['sh','ш'],['yu','ю'],['ya','я'],['ye','е']
  ];
  const PHONETIC_SINGLE = {
    a:'а',b:'б',c:'с',d:'д',e:'е',f:'ф',g:'г',h:'х',i:'и',j:'й',k:'к',l:'л',m:'м',n:'н',o:'о',p:'п',q:'к',r:'р',s:'с',t:'т',u:'у',v:'в',w:'в',x:'кс',y:'й',z:'з',3:'з',4:'ч'
  };

  function latinToCyrPhonetic(value) {
    let text = normalize(value);
    const placeholders = [];
    PHONETIC_MULTI.forEach(([latin, cyr]) => {
      const marker = String.fromCharCode(0xE000 + placeholders.length);
      placeholders.push(cyr);
      text = text.replace(new RegExp(latin, 'g'), marker);
    });
    text = Array.from(text).map(ch => PHONETIC_SINGLE[ch] ?? ch).join('');
    placeholders.forEach((cyr, index) => {
      text = text.replaceAll(String.fromCharCode(0xE000 + index), cyr);
    });
    return text;
  }

  /* Visual/game alphabet used by many Royal teams.
     Examples from the live CRM:
       HET       -> НЕТ
       XAOC      -> ХАОС
       TOPMO3OB  -> ТОРМОЗОВ
       HA A3APTE -> НА АЗАРТЕ
       CBET B OKHE -> СВЕТ В ОКНЕ
       OPuOH     -> ОРИОН
       KPYTbIE   -> КРУТЫЕ
  */
  const VISUAL_SINGLE = {
    a:'а',b:'в',c:'с',d:'д',e:'е',f:'ф',g:'г',h:'н',i:'и',j:'й',k:'к',l:'л',m:'м',n:'н',o:'о',p:'р',q:'к',r:'р',s:'с',t:'т',u:'и',v:'в',w:'ш',x:'х',y:'у',z:'з',0:'о',3:'з',4:'ч',6:'б',9:'я'
  };

  function latinToCyrVisual(value) {
    let text = normalize(value);
    // Stylized Russian "Ы" is frequently written as bI / BI.
    text = text.replace(/bi/g, '\uE100');
    text = Array.from(text).map(ch => ch === '\uE100' ? 'ы' : (VISUAL_SINGLE[ch] ?? ch)).join('');
    return text;
  }

  // The placeholder above is two UTF-16 code units after Array.from only if
  // represented literally; normalize it once more with a direct fallback.
  function latinToCyrVisualSafe(value) {
    let text = normalize(value).replace(/bi/g, '§');
    return Array.from(text).map(ch => ch === '§' ? 'ы' : (VISUAL_SINGLE[ch] ?? ch)).join('');
  }

  const EN_KEYS = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
  const RU_KEYS = 'йцукенгшщзхъфывапролджэячсмитьбюё';
  const EN_TO_RU_KEY = Object.fromEntries(Array.from(EN_KEYS).map((ch, i) => [ch, Array.from(RU_KEYS)[i] || ch]));
  const RU_TO_EN_KEY = Object.fromEntries(Array.from(RU_KEYS).map((ch, i) => [ch, Array.from(EN_KEYS)[i] || ch]));

  function swapKeyboard(value, direction) {
    const map = direction === 'ru-en' ? RU_TO_EN_KEY : EN_TO_RU_KEY;
    return Array.from(normalize(value)).map(ch => map[ch] ?? ch).join('');
  }

  function addVariant(set, value) {
    const normalized = normalize(value);
    if (!normalized) return;
    set.add(normalized);
    set.add(normalized.replace(/\s+/g, ''));
  }

  function tokenVariants(token) {
    const key = normalize(token);
    if (!key) return [];
    if (tokenCache.has(key)) return tokenCache.get(key);

    const variants = new Set();
    addVariant(variants, key);

    // Two rounds are deliberate. Example: XAOC -> ХАОС -> KHAOS,
    // so both Russian and standard Latin searches hit the same token.
    for (let round = 0; round < 2; round += 1) {
      const current = [...variants];
      current.forEach(value => {
        addVariant(variants, cyrToLat(value));
        addVariant(variants, latinToCyrPhonetic(value));
        addVariant(variants, latinToCyrVisualSafe(value));
        addVariant(variants, swapKeyboard(value, 'en-ru'));
        addVariant(variants, swapKeyboard(value, 'ru-en'));
      });
    }

    const out = [...variants].filter(Boolean).slice(0, 28);
    tokenCache.set(key, out);
    return out;
  }

  function phraseVariants(value) {
    const key = normalize(value);
    if (!key) return [];
    if (phraseCache.has(key)) return phraseCache.get(key);

    const result = new Set();
    addVariant(result, key);
    addVariant(result, cyrToLat(key));
    addVariant(result, latinToCyrPhonetic(key));
    addVariant(result, latinToCyrVisualSafe(key));
    addVariant(result, swapKeyboard(key, 'en-ru'));
    addVariant(result, swapKeyboard(key, 'ru-en'));

    const tokens = key.split(' ').filter(Boolean);
    const tokenSets = tokens.map(tokenVariants);

    // Cross-product is what fixes mixed names such as:
    // Has (visual H->Н) + ne (phonetic) + dogonyat (phonetic).
    let combinations = [''];
    tokenSets.forEach(variants => {
      const next = [];
      combinations.forEach(prefix => {
        variants.forEach(variant => {
          if (next.length >= MAX_PHRASE_VARIANTS) return;
          next.push(prefix ? `${prefix} ${variant}` : variant);
        });
      });
      combinations = next.slice(0, MAX_PHRASE_VARIANTS);
    });
    combinations.forEach(add => addVariant(result, add));

    const out = [...result].slice(0, MAX_PHRASE_VARIANTS * 2);
    phraseCache.set(key, out);
    return out;
  }

  function expandedFields(values) {
    const list = [];
    const visit = value => {
      if (Array.isArray(value)) { value.forEach(visit); return; }
      const text = String(value == null ? '' : value).trim();
      if (!text) return;
      phraseVariants(text).forEach(v => list.push(v));
    };
    visit(values);
    return [...new Set(list)].join(' ');
  }

  function participantFields(participant) {
    const memberships = Array.isArray(participant?.memberships) ? participant.memberships : [];
    return [
      participant?.name,
      participant?.telegramName,
      participant?.username,
      memberships.flatMap(m => [m?.team, m?.teamRaw, m?.nickname, m?.role, m?.game, m?.teamAlias])
    ];
  }

  function teamFields(team) {
    return [
      team?.name,
      team?.game,
      team?.games,
      team?.alias,
      team?.aliases,
      team?.searchName,
      team?.searchNames,
      team?.nameRu,
      team?.ruName,
      team?.russianName
    ];
  }

  participantSearchText = function participantSearchTextV0540(participant) {
    return expandedFields(participantFields(participant));
  };

  teamSearchText = function teamSearchTextV0540(team) {
    return expandedFields(teamFields(team));
  };

  // Existing renderers use String.includes(query). Make the raw query itself
  // searchable regardless of punctuation/extra spaces by feeding a cleaned value
  // into the current page renderer on every input event.
  function normalizeSearchInput(input) {
    if (!input) return;
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocapitalize', 'none');
    input.setAttribute('spellcheck', 'false');
  }

  function refreshInputHints() {
    const participant = document.getElementById('participantSearch');
    const team = document.getElementById('teamSearch');
    if (participant) {
      normalizeSearchInput(participant);
      participant.placeholder = 'Имя, @ник, команда — кириллица или латиница…';
    }
    if (team) {
      normalizeSearchInput(team);
      team.placeholder = 'Название: ХАОС / XAOC / NAS NE DOGONYAT…';
    }
  }

  function afterRender() {
    refreshInputHints();
    try { window.RoyalParticipantCardUX?.decorate?.(); } catch (_) {}
    try { window.RoyalTeamGameColors?.refresh?.(); } catch (_) {}
    try { window.RoyalAdminBadges?.refresh?.(0); } catch (_) {}
    try { window.RoyalMayak?.refresh?.(); } catch (_) {}
    try { window.RoyalUX0539?.refreshJumpButtons?.(); } catch (_) {}
  }

  if (typeof renderParticipantsPage === 'function') {
    const nativeParticipants = renderParticipantsPage;
    renderParticipantsPage = function renderParticipantsPageV0540(query = '') {
      // Existing includes() comparison expects a normalized lowercase query.
      const result = nativeParticipants(normalize(query));
      window.setTimeout(afterRender, 0);
      return result;
    };
  }

  if (typeof renderTeamsPage === 'function') {
    const nativeTeams = renderTeamsPage;
    renderTeamsPage = function renderTeamsPageV0540(query = '') {
      const result = nativeTeams(normalize(query));
      window.setTimeout(afterRender, 0);
      return result;
    };
  }

  document.addEventListener('input', event => {
    if (event.target?.id !== 'participantSearch' && event.target?.id !== 'teamSearch') return;
    window.setTimeout(afterRender, 0);
  }, true);

  window.addEventListener('pageshow', () => window.setTimeout(afterRender, 0));
  window.setTimeout(afterRender, 0);

  window.RoyalSmartSearch = {
    version: VERSION,
    normalize,
    tokenVariants,
    phraseVariants,
    expandedFields
  };
  window.__ROYAL_SMART_SEARCH_VERSION__ = VERSION;
})();
