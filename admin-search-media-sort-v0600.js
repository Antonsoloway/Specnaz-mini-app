/* Royal CRM Mini App — Admin search/media/sort enhancements v0.6.0
 * - Admin search uses the same deterministic hybrid rules as the normal app.
 * - Participant rows reuse the normal avatarFileId + avatar loader.
 * - "Вышел" is ordered like the physical admin sheet: newest exits first.
 *
 * IMPORTANT: no writes. This module only decorates/filter/sorts rendered admin DOM.
 */
(() => {
  const VERSION = '0.6.0-admin-search-media-sort.1';
  const GAME_RM = 'rm';
  const GAME_RK = 'rk';
  let scheduled = 0;
  let decorating = false;
  let publicParticipantSource = null;
  let publicParticipantById = new Map();
  let publicTeamSource = null;
  let publicTeamByKey = new Map();

  function clean(value) { return String(value == null ? '' : value).trim(); }
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

  const LAT_MULTI = [['shch','щ'],['sch','щ'],['zh','ж'],['kh','х'],['ts','ц'],['ch','ч'],['sh','ш'],['yu','ю'],['ya','я'],['yo','е'],['ye','е']];
  const LAT_SINGLE = {a:'а',b:'б',c:'к',d:'д',e:'е',f:'ф',g:'г',h:'х',i:'и',j:'дж',k:'к',l:'л',m:'м',n:'н',o:'о',p:'п',q:'к',r:'р',s:'с',t:'т',u:'у',v:'в',w:'в',x:'кс',y:'й',z:'з'};

  function englishRead(value) {
    let raw = normalize(value);
    if (!raw || !/[a-z]/.test(raw) || /[а-я]/u.test(raw)) return '';
    raw = raw
      .replace(/^([a-z]*?)i([bcdfghjklmnpqrstvwxyz])e$/g, '$1§$2')
      .replace(/^x(?=[a-z])/g, 'х')
      .replace(/joy/g, 'джой')
      .replace(/oy/g, 'ой');
    const placeholders = [];
    LAT_MULTI.forEach(([latin,cyr]) => {
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

  const PSEUDO_VISUAL = {a:'а',b:'в',c:'с',e:'е',h:'н',k:'к',m:'м',o:'о',p:'р',t:'т',x:'х',y:'у',u:'и',i:'и','0':'о','3':'з','4':'ч','6':'б','9':'я'};
  function pseudoToken(value) {
    let raw = normalize(value).replace(/\s+/g, '');
    if (!raw || !/[a-z0-9]/.test(raw) || /[а-я]/u.test(raw)) return '';
    raw = raw.replace(/bi/g, 'ы').replace(/bl/g, 'ы');
    let out = '';
    for (const ch of Array.from(raw)) {
      if (/[а-я]/u.test(ch)) { out += ch; continue; }
      if (Object.prototype.hasOwnProperty.call(PSEUDO_VISUAL, ch)) { out += PSEUDO_VISUAL[ch]; continue; }
      out += LAT_SINGLE[ch] ?? ch;
    }
    return normalize(out);
  }
  function pseudoRead(value) {
    const base = normalize(value);
    if (!base || !/[a-z]/.test(base)) return '';
    return normalize(base.split(' ').map(token => /[a-z]/.test(token) ? (pseudoToken(token) || token) : token).join(' '));
  }

  // Same confirmed deterministic aliases used by the normal app/search snapshot.
  const ALIASES = new Map([
    ['has ne dogonyat',['нас не догонят']],['xaoc',['хаос']],['topmo3ob het',['тормозов нет']],['ha a3apte',['на азарте']],['cbet b okhe',['свет в окне']],
    ['da budet swet 5',['да будет свет 5','да будет свет']],['da budet swet',['да будет свет']],['molot poka',['молот рока']],['aquamarine',['аквамарин']],
    ['hepbbi b hopme',['нервы в норме']],['hepbbl b hopme',['нервы в норме']],['mbl pycckue',['мы русские']],['ckazka',['сказка']],['behom',['веном']],
    ['opuoh',['орион']],['kpytbie',['крутые']],['tabepha xytopok',['таверна хуторок']],['cobectu het',['совести нет']],['cbou',['свои']],['pa3ym',['разум']],['pa3hbie',['разные']],
    ['kapma b kapmahe',['карма в кармане']],['akyha matata',['акуна матата']],['xopobod',['хоровод']],['kolomha',['коломна']],['cehat',['сенат']],['paketa',['ракета']],['kotehok',['котенок']],
    ['sbornayarf',['сборная рф']],['1by',['1бу']],['joyband',['джойбанд']],['mike',['майк']],['xabib',['хабиб']],['bbllllka',['вышка']]
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

  function makeLocalHaystack(text) {
    const base = normalize(text);
    if (!base) return '';
    const parts = new Set([base, base.replace(/\s+/g, '')]);
    if (/[а-я]/u.test(base)) {
      const lat = cyrToLat(base);
      if (lat) { parts.add(lat); parts.add(lat.replace(/\s+/g, '')); }
    }
    if (/[a-z]/.test(base)) {
      const read = englishRead(base);
      if (read) { parts.add(read); parts.add(read.replace(/\s+/g, '')); }
      const pseudo = pseudoRead(base);
      if (pseudo) { parts.add(pseudo); parts.add(pseudo.replace(/\s+/g, '')); }
    }
    aliasesFor(base).forEach(alias => {
      const a = normalize(alias);
      if (!a) return;
      parts.add(a);
      parts.add(a.replace(/\s+/g, ''));
      const lat = cyrToLat(a);
      if (lat) { parts.add(lat); parts.add(lat.replace(/\s+/g, '')); }
    });
    return [...parts].join(' ');
  }

  function queryForms(value) {
    const q = normalize(value);
    if (!q) return [];
    const forms = new Set([q, q.replace(/\s+/g, '')]);
    if (/[а-я]/u.test(q)) {
      const lat = cyrToLat(q);
      if (lat) { forms.add(lat); forms.add(lat.replace(/\s+/g, '')); }
    } else if (/[a-z]/.test(q)) {
      const read = englishRead(q); if (read) forms.add(read);
      const pseudo = pseudoRead(q); if (pseudo) forms.add(pseudo);
    }
    aliasesFor(q).forEach(alias => {
      const a = normalize(alias);
      if (a) forms.add(a);
    });
    return [...forms].filter(Boolean);
  }

  function matchesHaystack(haystack, rawQuery) {
    const q = normalize(rawQuery);
    if (!q) return true;
    const text = clean(haystack);
    const forms = queryForms(rawQuery);
    if (forms.some(form => text.includes(form))) return true;
    const words = q.split(' ').filter(Boolean);
    return words.length > 1 && words.every(word => queryForms(word).some(form => text.includes(form)));
  }

  function telegramId(value) {
    const match = clean(value).replace(/\.0$/, '').match(/\d{5,20}/);
    return match ? match[0] : '';
  }

  function canonicalGame(value) {
    const n = normalize(value);
    if (n === 'рм' || n.includes('royal match')) return 'Royal Match';
    if (n === 'рк' || n.includes('royal kingdom')) return 'Royal Kingdom';
    return clean(value);
  }
  function teamKey(name, game) { return `${normalize(name)}\n${canonicalGame(game)}`; }

  function refreshPublicMaps() {
    const participants = Array.isArray(snapshotState?.participants) ? snapshotState.participants : [];
    if (publicParticipantSource !== participants) {
      publicParticipantSource = participants;
      publicParticipantById = new Map();
      participants.forEach(p => {
        const id = telegramId(p?.telegramId);
        if (id) publicParticipantById.set(id, p);
      });
    }

    const teams = Array.isArray(snapshotState?.teams) ? snapshotState.teams : [];
    if (publicTeamSource !== teams) {
      publicTeamSource = teams;
      publicTeamByKey = new Map();
      teams.forEach(team => {
        const games = [];
        if (team?.game) games.push(team.game);
        if (Array.isArray(team?.games)) games.push(...team.games);
        if (!games.length) games.push('');
        games.forEach(game => publicTeamByKey.set(teamKey(team?.name, game), team));
      });
    }
  }

  function firstLetter(value) {
    const text = clean(value).replace(/^@/, '');
    return text ? Array.from(text)[0].toUpperCase() : '👤';
  }

  function participantIdFromRecord(record) {
    const summaryText = clean(record?.querySelector('summary .royal-admin-summary-main small')?.textContent);
    const match = summaryText.match(/(?:^|·\s*)ID\s+(\d{5,20})(?:\s|$)/i);
    return match ? match[1] : '';
  }

  function sourceRow(record) {
    const cached = Number(record?.dataset?.adminSourceRow || 0);
    if (cached > 0) return cached;
    const fields = [...(record?.querySelectorAll?.('.royal-admin-detail .royal-admin-field') || [])];
    const field = fields.find(node => normalize(node.querySelector('span:first-child')?.textContent) === 'строка базы');
    const row = Number(clean(field?.querySelector('span:last-child')?.textContent).replace(/\D+/g, '')) || 999999;
    if (record) record.dataset.adminSourceRow = String(row);
    return row;
  }

  function teamIdentityFromRecord(record) {
    const name = clean(record?.querySelector('summary .royal-admin-summary-main strong')?.textContent);
    const meta = clean(record?.querySelector('summary .royal-admin-summary-main small')?.textContent);
    return { name, game: canonicalGame(meta) };
  }

  function addAvatar(record) {
    if (!record || record.dataset.adminAvatarEnhanced === '1') return;
    const summary = record.querySelector('summary');
    const main = summary?.querySelector('.royal-admin-summary-main');
    if (!summary || !main) return;

    const id = participantIdFromRecord(record);
    refreshPublicMaps();
    const p = id ? publicParticipantById.get(id) : null;
    const title = clean(main.querySelector('strong')?.textContent) || clean(p?.name || p?.telegramName || p?.username) || 'Участник';
    const avatarFile = clean(p?.avatarFileId);

    const wrap = document.createElement('div');
    wrap.className = `person-avatar-wrap small royal-admin-participant-avatar${avatarFile ? '' : ' fallback'}`;
    wrap.setAttribute('aria-hidden', 'true');
    const fallback = document.createElement('span');
    fallback.textContent = firstLetter(title);
    wrap.appendChild(fallback);
    if (avatarFile) {
      const img = document.createElement('img');
      img.className = 'person-avatar';
      img.alt = '';
      img.dataset.avatarFile = avatarFile;
      wrap.appendChild(img);
    }
    summary.insertBefore(wrap, main);
    record.dataset.adminAvatarEnhanced = '1';
  }

  function enhanceSearchRecord(record, kind) {
    if (!record) return;
    refreshPublicMaps();
    if (!record.dataset.adminSearchRaw) record.dataset.adminSearchRaw = clean(record.dataset.adminSearch);
    const raw = record.dataset.adminSearchRaw || '';
    const parts = [makeLocalHaystack(raw)];

    let item = null;
    if (kind === 'participants') {
      const id = participantIdFromRecord(record);
      item = id ? publicParticipantById.get(id) : null;
    } else {
      const identity = teamIdentityFromRecord(record);
      item = publicTeamByKey.get(teamKey(identity.name, identity.game)) || null;
    }
    (Array.isArray(item?.searchKeys) ? item.searchKeys : []).forEach(key => {
      const n = normalize(key);
      if (!n) return;
      parts.push(n, n.replace(/\s+/g, ''));
    });
    record.dataset.adminSearch = parts.filter(Boolean).join(' ');
  }

  function currentParticipantFilter() {
    return clean(document.querySelector('[data-admin-participant-filter].is-active')?.dataset?.adminParticipantFilter || 'all');
  }
  function currentTeamGameFilter() {
    return clean(document.querySelector('[data-admin-team-game-filter].is-active')?.dataset?.adminTeamGameFilter || 'all');
  }
  function currentTeamStatusFilter() {
    return clean(document.querySelector('[data-admin-team-status-filter].is-active')?.dataset?.adminTeamStatusFilter || 'all');
  }

  function restoreOrSortParticipantOrder(records, filter) {
    const list = document.querySelector('.royal-admin-list');
    if (!list || !records.length) return;
    records.forEach((record, index) => {
      if (!record.dataset.adminOriginalOrder) record.dataset.adminOriginalOrder = String(index + 1);
    });
    const ordered = records.slice().sort((a, b) => {
      if (filter === 'exit') {
        const rowDiff = sourceRow(a) - sourceRow(b);
        if (rowDiff) return rowDiff;
      }
      return Number(a.dataset.adminOriginalOrder || 0) - Number(b.dataset.adminOriginalOrder || 0);
    });
    ordered.forEach(record => list.appendChild(record));
  }

  function applyParticipantFilters() {
    const input = document.querySelector('[data-admin-search-input="participants"]');
    if (!input) return false;
    const q = input.value || '';
    const filter = currentParticipantFilter();
    const records = [...document.querySelectorAll('[data-admin-participant="1"]')];
    restoreOrSortParticipantOrder(records, filter);
    let visible = 0;
    records.forEach(record => {
      const statusOk = filter === 'all' || record.dataset.adminStatusKey === filter;
      const searchOk = matchesHaystack(record.dataset.adminSearch || '', q);
      record.hidden = !(statusOk && searchOk);
      if (!record.hidden) visible += 1;
    });
    const count = document.querySelector('[data-admin-count]');
    if (count) count.textContent = `Показано: ${visible} из ${records.length}`;
    return true;
  }

  function applyTeamFilters() {
    const input = document.querySelector('[data-admin-search-input="teams"]');
    if (!input) return false;
    const q = input.value || '';
    const gameFilter = currentTeamGameFilter();
    const statusFilter = currentTeamStatusFilter();
    const records = [...document.querySelectorAll('[data-admin-team="1"]')];
    let visible = 0;
    records.forEach(record => {
      const gameOk = gameFilter === 'all' || record.dataset.adminTeamGame === gameFilter;
      const statusOk = statusFilter === 'all' || normalize(record.dataset.adminTeamStatus) === normalize(statusFilter);
      const searchOk = matchesHaystack(record.dataset.adminSearch || '', q);
      record.hidden = !(gameOk && statusOk && searchOk);
      if (!record.hidden) visible += 1;
    });
    const count = document.querySelector('[data-admin-count]');
    if (count) count.textContent = `Показано: ${visible} из ${records.length}`;
    return true;
  }

  function decorateAdmin() {
    if (decorating) return;
    const screen = document.querySelector('.royal-admin-screen');
    if (!screen) return;
    decorating = true;
    try {
      const participantRecords = [...screen.querySelectorAll('[data-admin-participant="1"]')];
      participantRecords.forEach(record => {
        addAvatar(record);
        enhanceSearchRecord(record, 'participants');
      });
      const teamRecords = [...screen.querySelectorAll('[data-admin-team="1"]')];
      teamRecords.forEach(record => enhanceSearchRecord(record, 'teams'));

      if (participantRecords.length) {
        try { if (typeof setupAvatarLoading === 'function') setupAvatarLoading(screen); } catch (_) {}
        applyParticipantFilters();
      } else if (teamRecords.length) {
        applyTeamFilters();
      }
    } finally {
      decorating = false;
    }
  }

  function scheduleDecorate() {
    if (scheduled) clearTimeout(scheduled);
    scheduled = window.setTimeout(() => {
      scheduled = 0;
      decorateAdmin();
    }, 0);
  }

  // Do not block IME/input. Native admin search runs first; this module then
  // applies the full hybrid matcher over the same already-rendered records.
  document.addEventListener('input', event => {
    if (!event.target?.matches?.('[data-admin-search-input]')) return;
    if (event.target.matches('[data-admin-search-input="participants"]')) applyParticipantFilters();
    else applyTeamFilters();
  }, true);
  document.addEventListener('change', event => {
    if (event.target?.matches?.('[data-admin-search-input]')) scheduleDecorate();
  }, true);
  document.addEventListener('click', event => {
    if (event.target?.closest?.('[data-admin-participant-filter],[data-admin-team-game-filter],[data-admin-team-status-filter],[data-admin-tab],[data-admin-refresh]')) {
      window.setTimeout(decorateAdmin, 0);
    }
  }, true);

  const style = document.createElement('style');
  style.dataset.adminSearchMediaSortV0600 = '1';
  style.textContent = `
    .royal-admin-participant-avatar{flex:0 0 46px;width:46px!important;height:46px!important;margin:0!important;border-radius:50%;overflow:hidden}
    .royal-admin-participant-avatar>span{font-size:16px}
    .royal-admin-participant-avatar .person-avatar{width:100%!important;height:100%!important;object-fit:cover;border-radius:50%}
    .royal-admin-record summary .royal-admin-participant-avatar+ .royal-admin-summary-main{min-width:0}
  `;
  document.head.appendChild(style);

  const observer = new MutationObserver(records => {
    if (decorating) return;
    if (records.some(record => [...record.addedNodes].some(node => node instanceof Element && (node.matches?.('.royal-admin-screen,.royal-admin-record') || node.querySelector?.('.royal-admin-screen,.royal-admin-record'))))) {
      scheduleDecorate();
    }
  });
  observer.observe(document.body, { childList:true, subtree:true });

  window.setTimeout(decorateAdmin, 0);
  window.setTimeout(decorateAdmin, 500);
  window.RoyalAdminSearchMediaSortV0600 = {
    version: VERSION,
    decorate: decorateAdmin,
    applyParticipants: applyParticipantFilters,
    applyTeams: applyTeamFilters,
    pseudoRead
  };
})();
