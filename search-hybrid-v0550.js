/* Royal CRM Mini App — Hybrid Search + Game Filter v0.5.50
 * v0.5.49 hybrid search is preserved: local v0.5.47-style fallback OR snapshot searchKeys.
 * Adds game scope (Все / РМ / РК) and Android-safe keyboard dismissal.
 */
(() => {
  const VERSION = '0.5.50';
  const POLL_MS = 90;
  const FILTER_DELAY = 45;
  const GAME_ALL = 'all';
  const GAME_RM = 'rm';
  const GAME_RK = 'rk';
  let participantTimer = 0;
  let teamTimer = 0;
  const allCardCache = new WeakMap();
  const scopedCardCache = new WeakMap();
  const filters = { participants: GAME_ALL, teams: GAME_ALL };
  const queries = { participants: '', teams: '' };
  let participantSource = null;
  let participantById = new Map();
  let teamSource = null;
  let teamByName = new Map();

  function normalize(value) {
    let text = String(value == null ? '' : value);
    try { text = text.normalize('NFKC'); } catch (_) {}
    return text.toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/^@+/,'').replace(/[’'`]/g,'').replace(/[^a-zа-я0-9@]+/giu,' ').replace(/\s+/g,' ').trim();
  }
  function compact(value) { return normalize(value).replace(/\s+/g, ''); }

  const CYR_TO_LAT = {а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'};
  function cyrToLat(value) { return Array.from(normalize(value)).map(ch => CYR_TO_LAT[ch] ?? ch).join(''); }
  const LAT_MULTI = [['shch','щ'],['sch','щ'],['zh','ж'],['kh','х'],['ts','ц'],['ch','ч'],['sh','ш'],['yu','ю'],['ya','я'],['yo','е'],['ye','е']];
  const LAT_SINGLE = {a:'а',b:'б',c:'к',d:'д',e:'е',f:'ф',g:'г',h:'х',i:'и',j:'дж',k:'к',l:'л',m:'м',n:'н',o:'о',p:'п',q:'к',r:'р',s:'с',t:'т',u:'у',v:'в',w:'в',x:'кс',y:'й',z:'з'};

  function englishRead(value) {
    let raw = normalize(value);
    if (!raw || !/[a-z]/.test(raw) || /[а-я]/u.test(raw)) return '';
    raw = raw.replace(/^([a-z]*?)i([bcdfghjklmnpqrstvwxyz])e$/g,'$1§$2').replace(/^x(?=[a-z])/g,'х').replace(/joy/g,'джой').replace(/oy/g,'ой');
    const placeholders = [];
    LAT_MULTI.forEach(([latin,cyr]) => { const mark = String.fromCharCode(0xE800 + placeholders.length); placeholders.push(cyr); raw = raw.replace(new RegExp(latin,'g'),mark); });
    let out = '';
    for (const ch of Array.from(raw)) {
      if (ch === '§') { out += 'ай'; continue; }
      const code = ch.charCodeAt(0);
      if (code >= 0xE800 && code < 0xE800 + placeholders.length) out += placeholders[code - 0xE800];
      else out += LAT_SINGLE[ch] ?? ch;
    }
    return normalize(out);
  }

  const ALIASES = new Map([
    ['has ne dogonyat',['нас не догонят']],['xaoc',['хаос']],['topmo3ob het',['тормозов нет']],['ha a3apte',['на азарте']],['cbet b okhe',['свет в окне']],
    ['da budet swet 5',['да будет свет 5','да будет свет']],['da budet swet',['да будет свет']],['molot poka',['молот рока']],['aquamarine',['аквамарин']],['hepbbi b hopme',['нервы в норме']],
    ['opuoh',['орион']],['kpytbie',['крутые']],['tabepha xytopok',['таверна хуторок']],['cobectu het',['совести нет']],['cbou',['свои']],['pa3ym',['разум']],['pa3hbie',['разные']],
    ['kapma b kapmahe',['карма в кармане']],['akyha matata',['акуна матата']],['xopobod',['хоровод']],['kolomha',['коломна']],['cehat',['сенат']],['paketa',['ракета']],['kotehok',['котенок']],
    ['sbornayarf',['сборная рф']],['1by',['1бу']],['joyband',['джойбанд']],['mike',['майк']],['xabib',['хабиб']]
  ]);
  function aliasesFor(value) {
    const n = normalize(value), c = compact(value), out = [];
    for (const [key,aliases] of ALIASES) {
      const nk = normalize(key), ck = compact(key);
      if (n === nk || c === ck || n.includes(nk)) out.push(...aliases);
    }
    return out;
  }

  function makeLocalHaystack(text) {
    const base = normalize(text);
    if (!base) return '';
    const parts = new Set([base,base.replace(/\s+/g,'')]);
    if (/[а-я]/u.test(base)) { const lat = cyrToLat(base); parts.add(lat); parts.add(lat.replace(/\s+/g,'')); }
    if (/[a-z]/.test(base)) { const read = englishRead(base); if (read) { parts.add(read); parts.add(read.replace(/\s+/g,'')); } }
    aliasesFor(base).forEach(alias => { const a = normalize(alias); if (!a) return; parts.add(a); parts.add(a.replace(/\s+/g,'')); const lat = cyrToLat(a); if (lat) parts.add(lat); });
    return [...parts].join(' ');
  }
  function queryForms(value) {
    const q = normalize(value);
    if (!q) return [];
    const forms = new Set([q,q.replace(/\s+/g,'')]);
    if (/[а-я]/u.test(q)) { const lat = cyrToLat(q); forms.add(lat); forms.add(lat.replace(/\s+/g,'')); }
    else if (/[a-z]/.test(q)) { const read = englishRead(q); if (read) forms.add(read); }
    aliasesFor(q).forEach(alias => forms.add(normalize(alias)));
    return [...forms].filter(Boolean);
  }

  function gameCode(value) {
    const n = normalize(value);
    if (!n) return '';
    if (n.includes('royal match') || n === 'рм' || n.endsWith(' рм')) return GAME_RM;
    if (n.includes('royal kingdom') || n === 'рк' || n.endsWith(' рк')) return GAME_RK;
    return '';
  }
  function gameCodesFromTeam(team) {
    const out = new Set();
    [team?.game,...(Array.isArray(team?.games)?team.games:[])].forEach(value => { const code = gameCode(value); if (code) out.add(code); });
    return out;
  }
  function gameCodesFromCard(card) {
    const text = normalize(card?.textContent || ''), out = new Set();
    if (text.includes('royal match')) out.add(GAME_RM);
    if (text.includes('royal kingdom')) out.add(GAME_RK);
    return out;
  }

  function refreshMaps() {
    const participants = Array.isArray(snapshotState?.participants) ? snapshotState.participants : [];
    if (participantSource !== participants) {
      participantSource = participants; participantById = new Map();
      participants.forEach(p => { const id = String(p?.telegramId || '').trim().replace(/\.0$/,''); if (id) participantById.set(id,p); });
    }
    const teams = Array.isArray(snapshotState?.teams) ? snapshotState.teams : [];
    if (teamSource !== teams) {
      teamSource = teams; teamByName = new Map();
      teams.forEach(t => { const key = normalize(t?.name || ''); if (!key) return; const list = teamByName.get(key) || []; list.push(t); teamByName.set(key,list); });
    }
  }
  function teamForCard(card) {
    refreshMaps();
    let name = String(card?.dataset?.team || ''); try { name = decodeURIComponent(name); } catch (_) {}
    const candidates = teamByName.get(normalize(name)) || [];
    if (candidates.length <= 1) return candidates[0] || null;
    const cardCodes = gameCodesFromCard(card);
    const exact = candidates.find(team => { const codes = gameCodesFromTeam(team); return [...cardCodes].some(code => codes.has(code)); });
    return exact || candidates[0] || null;
  }
  function snapshotItemForCard(card,kind) {
    refreshMaps();
    if (kind === 'participants') { const id = String(card?.dataset?.participantTelegramId || '').trim().replace(/\.0$/,''); return id ? participantById.get(id) || null : null; }
    return teamForCard(card);
  }
  function itemMatchesGame(item,card,kind,filterCode) {
    if (filterCode === GAME_ALL) return true;
    if (kind === 'participants') {
      const memberships = Array.isArray(item?.memberships) ? item.memberships : [];
      if (memberships.some(m => gameCode(m?.game || m?.teamRaw) === filterCode)) return true;
      return gameCodesFromCard(card).has(filterCode);
    }
    if (gameCodesFromTeam(item).has(filterCode)) return true;
    return gameCodesFromCard(card).has(filterCode);
  }
  function participantScopedText(item,filterCode) {
    if (!item) return '';
    const values = [item.name,item.telegramName,item.username];
    (Array.isArray(item.memberships)?item.memberships:[]).forEach(m => {
      if (gameCode(m?.game || m?.teamRaw) !== filterCode) return;
      values.push(m?.team,m?.teamRaw,m?.nickname,m?.role,m?.game,m?.teamAlias,m?.alias);
    });
    return values.filter(Boolean).join(' ');
  }

  function allCombinedHaystack(card,kind) {
    const cached = allCardCache.get(card); if (cached) return cached;
    const parts = [makeLocalHaystack(card?.textContent || '')];
    const item = snapshotItemForCard(card,kind), keys = Array.isArray(item?.searchKeys) ? item.searchKeys : [];
    keys.forEach(key => { const n = normalize(key); if (n) parts.push(n,n.replace(/\s+/g,'')); });
    const haystack = parts.filter(Boolean).join(' '); allCardCache.set(card,haystack); return haystack;
  }
  function scopedCombinedHaystack(card,kind,filterCode) {
    if (filterCode === GAME_ALL || kind === 'teams') return allCombinedHaystack(card,kind);
    let scoped = scopedCardCache.get(card); if (!scoped) { scoped = {}; scopedCardCache.set(card,scoped); }
    if (scoped[filterCode]) return scoped[filterCode];
    const haystack = makeLocalHaystack(participantScopedText(snapshotItemForCard(card,kind),filterCode));
    scoped[filterCode] = haystack; return haystack;
  }
  function matchesHaystack(haystack,rawQuery) {
    const q = normalize(rawQuery); if (!q) return true;
    const forms = queryForms(rawQuery); if (forms.some(form => haystack.includes(form))) return true;
    const words = q.split(' ').filter(Boolean);
    return words.length > 1 && words.every(word => queryForms(word).some(form => haystack.includes(form)));
  }

  function ensureEmpty(container) {
    if (!container) return null;
    let empty = container.querySelector(':scope > .search-empty-v0550');
    if (!empty) { empty = document.createElement('div'); empty.className = 'empty-state search-empty-v0550'; empty.textContent = 'Ничего не найдено'; empty.hidden = true; container.appendChild(empty); }
    return empty;
  }
  function updateCount(title,found,total,eligible,hasQuery,filterCode) {
    const panel = document.getElementById('panel');
    const heading = [...(panel?.querySelectorAll?.('.section-title-row h2') || [])].find(h => h.textContent.trim() === title);
    const muted = heading?.parentElement?.querySelector('.muted'); if (!muted) return;
    if (filterCode === GAME_ALL) muted.textContent = hasQuery ? `${found} из ${total}` : String(total);
    else muted.textContent = hasQuery ? `${found} из ${eligible}` : `${eligible} из ${total}`;
  }
  function filterRendered(kind,rawQuery) {
    const participants = kind === 'participants';
    const container = document.querySelector(participants ? '#panel .people-list' : '#panel .teams-list'); if (!container) return;
    const cards = [...container.querySelectorAll(participants ? ':scope > .person-card' : ':scope > .team-card')];
    const filterCode = filters[kind] || GAME_ALL, hasQuery = !!normalize(rawQuery);
    let found = 0, eligible = 0;
    for (const card of cards) {
      const item = snapshotItemForCard(card,kind), gameOk = itemMatchesGame(item,card,kind,filterCode);
      if (gameOk) eligible += 1;
      const searchOk = !hasQuery || matchesHaystack(scopedCombinedHaystack(card,kind,filterCode),rawQuery);
      const show = gameOk && searchOk; card.hidden = !show; card.classList.toggle('royal-search-hidden',!show); if (show) found += 1;
    }
    const empty = ensureEmpty(container); if (empty) empty.hidden = found !== 0;
    updateCount(participants?'Участники':'Команды',found,cards.length,eligible,hasQuery,filterCode);
    try { window.RoyalUX0539?.refreshJumpButtons?.(); } catch (_) {}
  }
  function schedule(kind,value) {
    queries[kind] = String(value || '');
    if (kind === 'participants') { clearTimeout(participantTimer); participantTimer = setTimeout(() => filterRendered(kind,queries[kind]),FILTER_DELAY); }
    else { clearTimeout(teamTimer); teamTimer = setTimeout(() => filterRendered(kind,queries[kind]),FILTER_DELAY); }
  }

  function filterBarHtml(kind) {
    const current = filters[kind] || GAME_ALL;
    const label = kind === 'participants' ? 'Фильтр участников по игре' : 'Фильтр команд по игре';
    const button = (code,text) => `<button type="button" class="royal-game-filter-btn${current===code?' is-active':''}" data-search-kind="${kind}" data-game-filter="${code}" aria-pressed="${current===code?'true':'false'}">${text}</button>`;
    return `<div class="royal-game-filter" role="group" aria-label="${label}">${button(GAME_ALL,'Все')}${button(GAME_RM,'РМ')}${button(GAME_RK,'РК')}</div>`;
  }
  function updateFilterButtons(kind) {
    document.querySelectorAll(`.royal-game-filter-btn[data-search-kind="${kind}"]`).forEach(btn => { const active = btn.dataset.gameFilter === filters[kind]; btn.classList.toggle('is-active',active); btn.setAttribute('aria-pressed',active?'true':'false'); });
  }
  function installFilter(kind) {
    const input = document.getElementById(kind === 'participants' ? 'participantSearch' : 'teamSearch'), box = input?.closest?.('.search-box'); if (!box) return;
    let bar = box.previousElementSibling;
    if (!bar?.classList?.contains('royal-game-filter')) { box.insertAdjacentHTML('beforebegin',filterBarHtml(kind)); bar = box.previousElementSibling; }
    updateFilterButtons(kind);
    bar.querySelectorAll('.royal-game-filter-btn').forEach(btn => {
      if (btn.dataset.gameFilterBoundV0550 === '1') return; btn.dataset.gameFilterBoundV0550 = '1';
      btn.addEventListener('click',() => { const code = btn.dataset.gameFilter || GAME_ALL; if (![GAME_ALL,GAME_RM,GAME_RK].includes(code)) return; filters[kind] = code; updateFilterButtons(kind); try { input.blur(); } catch (_) {} filterRendered(kind,input.value || queries[kind] || ''); });
    });
  }

  function activeSearchInput() { const active = document.activeElement; return active && (active.id === 'participantSearch' || active.id === 'teamSearch') ? active : null; }
  function dismissKeyboard() { const input = activeSearchInput(); if (!input) return; try { input.blur(); } catch (_) {} }
  function installKeyboardDismiss() {
    if (window.__ROYAL_SEARCH_KEYBOARD_DISMISS_V0550__) return; window.__ROYAL_SEARCH_KEYBOARD_DISMISS_V0550__ = true;
    document.addEventListener('pointerdown',event => { const input = activeSearchInput(); if (!input) return; if (event.target === input || event.target?.closest?.('.search-box')) return; dismissKeyboard(); },true);
    // Only a real finger movement closes the keyboard. Programmatic viewport scroll caused by Android IME is ignored.
    document.addEventListener('touchmove',dismissKeyboard,{passive:true,capture:true});
  }

  function installInput(id,kind) {
    const old = document.getElementById(id); if (!old) return null;
    if (old.dataset.hybridSearchV0550 === '1') { installFilter(kind); return old; }
    const input = old.cloneNode(true); input.value = queries[kind] || old.value || ''; input.dataset.hybridSearchV0550 = '1'; input.setAttribute('autocomplete','off'); input.setAttribute('autocapitalize','none'); input.setAttribute('spellcheck','false'); old.replaceWith(input);
    let poll = 0, lastValue = input.value;
    const check = () => { const value = input.value; if (value === lastValue) return; lastValue = value; schedule(kind,value); };
    const startPoll = () => { if (poll) return; check(); poll = window.setInterval(check,POLL_MS); };
    const stopPoll = () => { if (poll) clearInterval(poll); poll = 0; check(); };
    input.addEventListener('focus',startPoll,{passive:true}); input.addEventListener('blur',stopPoll,{passive:true}); input.addEventListener('input',check,{passive:true}); input.addEventListener('change',check,{passive:true}); input.addEventListener('search',check,{passive:true});
    input.addEventListener('keydown',event => { if (event.key === 'Enter') setTimeout(() => { try { input.blur(); } catch (_) {} },0); });
    installFilter(kind); return input;
  }
  function installCurrent() {
    const p = installInput('participantSearch','participants'), t = installInput('teamSearch','teams');
    if (p) filterRendered('participants',p.value || queries.participants); if (t) filterRendered('teams',t.value || queries.teams);
  }

  const nativeParticipants = typeof renderParticipantsPage === 'function' ? renderParticipantsPage : null;
  if (nativeParticipants) renderParticipantsPage = function renderParticipantsPageV0550(query='') { const desired = String(query || queries.participants || ''); queries.participants = desired; const result = nativeParticipants(''); const input = installInput('participantSearch','participants'); if (input) { input.value = desired; filterRendered('participants',desired); } return result; };
  const nativeTeams = typeof renderTeamsPage === 'function' ? renderTeamsPage : null;
  if (nativeTeams) renderTeamsPage = function renderTeamsPageV0550(query='') { const desired = String(query || queries.teams || ''); queries.teams = desired; const result = nativeTeams(''); const input = installInput('teamSearch','teams'); if (input) { input.value = desired; filterRendered('teams',desired); } return result; };

  installKeyboardDismiss(); setTimeout(installCurrent,0);
  window.RoyalHybridSearch = {version:VERSION,filter:filterRendered,localFallback:true,snapshotKeys:true,gameFilter:true,getGameFilter:kind=>filters[kind]||GAME_ALL,setGameFilter:(kind,code)=>{if(!Object.prototype.hasOwnProperty.call(filters,kind)||![GAME_ALL,GAME_RM,GAME_RK].includes(code))return false;filters[kind]=code;updateFilterButtons(kind);filterRendered(kind,queries[kind]||'');return true;},searchIndexVersion:()=>String(snapshotState?.searchIndexVersion||'')};
  window.__ROYAL_HYBRID_SEARCH_VERSION__ = VERSION;
})();
