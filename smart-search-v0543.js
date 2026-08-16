/* Royal CRM Mini App — Lean Search v0.5.43
 * Fast deterministic search.
 * No typo-distance, no combinatorial variant explosion, no input-node re-render.
 * Search index is built once per CRM object and reused while typing.
 */
(() => {
  const VERSION = '0.5.43';
  const INPUT_DELAY = 140;
  const IN_CHAT = 'В чате';
  const participantIndex = new WeakMap();
  const teamIndex = new WeakMap();
  let timer = 0;
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

  function latinToCyrSimple(value) {
    let raw = normalize(value);
    if (!/[a-z]/.test(raw)) return raw;

    // Small deterministic English-reading rules only; no branching.
    raw = raw.replace(/^([a-z]*?)i([bcdfghjklmnpqrstvwxyz])e$/g, '$1§$2');
    raw = raw.replace(/^x(?=[a-z])/g, 'х');
    raw = raw.replace(/joy/g, 'джой').replace(/oy/g, 'ой');

    const placeholders = [];
    LAT_MULTI.forEach(([latin, cyr]) => {
      const mark = String.fromCharCode(0xE500 + placeholders.length);
      placeholders.push(cyr);
      raw = raw.replace(new RegExp(latin, 'g'), mark);
    });

    let out = '';
    for (const ch of Array.from(raw)) {
      if (ch === '§') { out += 'ай'; continue; }
      if (/[а-я]/u.test(ch)) { out += ch; continue; }
      const code = ch.charCodeAt(0);
      if (code >= 0xE500 && code < 0xE500 + placeholders.length) out += placeholders[code - 0xE500];
      else out += LAT_SINGLE[ch] ?? ch;
    }
    return normalize(out);
  }

  const EN_KEYS = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
  const RU_KEYS = 'йцукенгшщзхъфывапролджэячсмитьбюё';
  const EN_TO_RU = Object.fromEntries(Array.from(EN_KEYS).map((ch, i) => [ch, Array.from(RU_KEYS)[i] || ch]));
  const RU_TO_EN = Object.fromEntries(Array.from(RU_KEYS).map((ch, i) => [ch, Array.from(EN_KEYS)[i] || ch]));
  function keyboardSwap(value, map) {
    return Array.from(normalize(value)).map(ch => map[ch] ?? ch).join('');
  }

  // Explicit aliases for pseudo-Russian Royal names. This is intentionally small
  // and maintainable: when a new ambiguous name appears, add one alias instead of
  // generating hundreds of guesses for every keystroke.
  const PSEUDO_ALIASES = new Map([
    ['has ne dogonyat', ['нас не догонят']],
    ['xaoc', ['хаос']],
    ['topmo3ob het', ['тормозов нет']],
    ['ha a3apte', ['на азарте']],
    ['cbet b okhe', ['свет в окне']],
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
    ['sbornayarf', ['сборная рф']],
    ['1by', ['1бу']],
    ['joyband', ['джойбанд']]
  ]);

  function add(set, value) {
    const n = normalize(value);
    if (!n) return;
    set.add(n);
    set.add(n.replace(/\s+/g, ''));
  }

  function flatten(values, out = []) {
    if (Array.isArray(values)) { values.forEach(v => flatten(v, out)); return out; }
    const text = String(values == null ? '' : values).trim();
    if (text) out.push(text);
    return out;
  }

  function aliasesFor(normalizedField) {
    const result = [];
    for (const [key, aliases] of PSEUDO_ALIASES) {
      if (normalizedField === key || normalizedField.includes(key)) result.push(...aliases);
    }
    return result;
  }

  function buildIndex(values) {
    const set = new Set();
    flatten(values).forEach(field => {
      const n = normalize(field);
      if (!n) return;
      add(set, n);
      add(set, cyrToLat(n));
      add(set, latinToCyrSimple(n));
      add(set, keyboardSwap(n, EN_TO_RU));
      add(set, keyboardSwap(n, RU_TO_EN));
      aliasesFor(n).forEach(alias => {
        add(set, alias);
        add(set, cyrToLat(alias));
      });
    });
    return [...set];
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
    if (!idx) { idx = buildIndex(participantFields(p)); participantIndex.set(p, idx); }
    return idx;
  }

  function getTeamIndex(t) {
    let idx = teamIndex.get(t);
    if (!idx) { idx = buildIndex(teamFields(t)); teamIndex.set(t, idx); }
    return idx;
  }

  function queryForms(query) {
    const q = normalize(query);
    const set = new Set();
    add(set, q);
    add(set, cyrToLat(q));
    add(set, latinToCyrSimple(q));
    add(set, keyboardSwap(q, EN_TO_RU));
    add(set, keyboardSwap(q, RU_TO_EN));
    aliasesFor(q).forEach(alias => add(set, alias));
    return [...set];
  }

  function indexMatches(index, query) {
    const q = normalize(query);
    if (!q) return true;
    const words = q.split(' ').filter(Boolean);
    const phraseForms = queryForms(q);
    if (phraseForms.some(form => index.some(candidate => candidate.includes(form)))) return true;
    if (words.length <= 1) return false;
    return words.every(word => {
      const forms = queryForms(word);
      return forms.some(form => index.some(candidate => candidate.includes(form)));
    });
  }

  function participantMatches(p, query) { return indexMatches(getParticipantIndex(p), query); }
  function teamMatches(t, query) { return indexMatches(getTeamIndex(t), query); }

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

  function decorateAfterListUpdate() {
    const panel = document.getElementById('panel');
    try { setupAvatarLoading(panel); } catch (_) {}
    try { window.RoyalParticipantCardUX?.decorate?.(); } catch (_) {}
    try { window.RoyalTeamGameColors?.refresh?.(); } catch (_) {}
    try { window.RoyalAdminBadges?.refresh?.(0); } catch (_) {}
    try { window.RoyalMayak?.refresh?.(); } catch (_) {}
    try { window.RoyalUX0539?.refreshJumpButtons?.(); } catch (_) {}
  }

  function updateCount(title, found, total, hasQuery) {
    const panel = document.getElementById('panel');
    const heading = [...(panel?.querySelectorAll?.('.section-title-row h2') || [])].find(h => h.textContent.trim() === title);
    const muted = heading?.parentElement?.querySelector('.muted');
    if (muted) muted.textContent = hasQuery ? `${found} из ${total}` : String(total);
  }

  function updateParticipantResults(query) {
    const list = visibleParticipants();
    const q = normalize(query);
    const filtered = q ? list.filter(p => participantMatches(p, q)) : list;
    const box = document.querySelector('#panel .people-list');
    if (!box) return;
    box.innerHTML = filtered.length ? filtered.map(participantCard).join('') : '<div class="empty-state">Ничего не найдено</div>';
    updateCount('Участники', filtered.length, list.length, !!q);
    decorateAfterListUpdate();
  }

  function updateTeamResults(query) {
    const list = Array.isArray(snapshotState?.teams) ? snapshotState.teams : [];
    const q = normalize(query);
    const filtered = q ? list.filter(t => teamMatches(t, q)) : list;
    const box = document.querySelector('#panel .teams-list');
    if (!box) return;
    box.innerHTML = filtered.length ? filtered.map(teamCard).join('') : '<div class="empty-state">Ничего не найдено</div>';
    updateCount('Команды', filtered.length, list.length, !!q);
    decorateAfterListUpdate();
  }

  function installInput(id, updater) {
    const input = document.getElementById(id);
    if (!input || input.dataset.leanSearchV0543 === '1') return;
    input.dataset.leanSearchV0543 = '1';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocapitalize', 'none');
    input.setAttribute('spellcheck', 'false');

    const schedule = () => {
      if (composing) return;
      clearTimeout(timer);
      const value = input.value;
      timer = setTimeout(() => updater(value), INPUT_DELAY);
    };

    input.addEventListener('compositionstart', event => {
      composing = true;
      event.stopImmediatePropagation();
    }, { capture:true });
    input.addEventListener('compositionend', event => {
      composing = false;
      event.stopImmediatePropagation();
      schedule();
    }, { capture:true });
    input.addEventListener('input', event => {
      event.stopImmediatePropagation();
      schedule();
    }, { capture:true });
  }

  function installForCurrentPage() {
    installInput('participantSearch', updateParticipantResults);
    installInput('teamSearch', updateTeamResults);
  }

  const nativeParticipants = typeof renderParticipantsPage === 'function' ? renderParticipantsPage : null;
  if (nativeParticipants) {
    renderParticipantsPage = function renderParticipantsPageV0543(query = '') {
      const result = nativeParticipants('');
      const input = document.getElementById('participantSearch');
      if (input) input.value = String(query || '');
      installForCurrentPage();
      if (query) updateParticipantResults(query);
      return result;
    };
  }

  const nativeTeams = typeof renderTeamsPage === 'function' ? renderTeamsPage : null;
  if (nativeTeams) {
    renderTeamsPage = function renderTeamsPageV0543(query = '') {
      const result = nativeTeams('');
      const input = document.getElementById('teamSearch');
      if (input) input.value = String(query || '');
      installForCurrentPage();
      if (query) updateTeamResults(query);
      return result;
    };
  }

  function prewarm() {
    if (!snapshotState) { setTimeout(prewarm, 500); return; }
    const participants = visibleParticipants();
    const teams = Array.isArray(snapshotState?.teams) ? snapshotState.teams : [];
    const work = () => {
      participants.forEach(getParticipantIndex);
      teams.forEach(getTeamIndex);
    };
    if ('requestIdleCallback' in window) requestIdleCallback(work, { timeout:1500 });
    else setTimeout(work, 250);
  }

  setTimeout(prewarm, 300);
  setTimeout(installForCurrentPage, 0);

  window.RoyalLeanSearch = {
    version: VERSION,
    normalize,
    aliases: Object.fromEntries(PSEUDO_ALIASES),
    participantMatches,
    teamMatches
  };
  window.__ROYAL_LEAN_SEARCH_VERSION__ = VERSION;
})();
