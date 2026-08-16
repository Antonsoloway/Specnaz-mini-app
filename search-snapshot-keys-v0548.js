/* Royal CRM Mini App — Snapshot Search Keys v0.5.48
 * Search intelligence lives in snapshot.json (searchKeys).
 * Client only performs cheap substring comparisons against precomputed keys.
 */
(() => {
  const VERSION = '0.5.48';
  const POLL_MS = 90;
  const FILTER_DELAY = 30;
  let participantTimer = 0;
  let teamTimer = 0;
  let participantMapSource = null;
  let participantById = new Map();
  let teamMapSource = null;
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

  function refreshMaps() {
    const participants = Array.isArray(snapshotState?.participants) ? snapshotState.participants : [];
    if (participantMapSource !== participants) {
      participantMapSource = participants;
      participantById = new Map();
      participants.forEach(p => {
        const id = String(p?.telegramId || '').trim().replace(/\.0$/, '');
        if (id) participantById.set(id, p);
      });
    }

    const teams = Array.isArray(snapshotState?.teams) ? snapshotState.teams : [];
    if (teamMapSource !== teams) {
      teamMapSource = teams;
      teamByName = new Map();
      teams.forEach(t => {
        const key = normalize(t?.name || '');
        if (key) teamByName.set(key, t);
      });
    }
  }

  function itemKeys(item, fallbackText) {
    const keys = Array.isArray(item?.searchKeys) ? item.searchKeys : [];
    if (keys.length) return keys.map(normalize).filter(Boolean);
    const fallback = normalize(fallbackText || '');
    return fallback ? [fallback, fallback.replace(/\s+/g, '')] : [];
  }

  function matches(keys, rawQuery) {
    const q = normalize(rawQuery);
    if (!q) return true;
    const qc = q.replace(/\s+/g, '');
    if (keys.some(k => k.includes(q) || (qc && k.replace(/\s+/g, '').includes(qc)))) return true;
    const words = q.split(' ').filter(Boolean);
    return words.length > 1 && words.every(word => keys.some(k => k.includes(word)));
  }

  function participantForCard(card) {
    refreshMaps();
    const id = String(card?.dataset?.participantTelegramId || '').trim().replace(/\.0$/, '');
    return id ? participantById.get(id) || null : null;
  }

  function teamForCard(card) {
    refreshMaps();
    let name = String(card?.dataset?.team || '');
    try { name = decodeURIComponent(name); } catch (_) {}
    return teamByName.get(normalize(name)) || null;
  }

  function ensureEmpty(container) {
    if (!container) return null;
    let empty = container.querySelector(':scope > .search-empty-v0548');
    if (!empty) {
      empty = document.createElement('div');
      empty.className = 'empty-state search-empty-v0548';
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
      const item = participants ? participantForCard(card) : teamForCard(card);
      const keys = itemKeys(item, card.textContent || '');
      const show = !hasQuery || matches(keys, rawQuery);
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
    if (old.dataset.snapshotSearchV0548 === '1') return old;

    // Remove app.js direct re-render listener once. Do not intercept IME/composition.
    const input = old.cloneNode(true);
    input.value = old.value;
    input.dataset.snapshotSearchV0548 = '1';
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
    renderParticipantsPage = function renderParticipantsPageV0548(query = '') {
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
    renderTeamsPage = function renderTeamsPageV0548(query = '') {
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

  window.RoyalSnapshotSearch = {
    version: VERSION,
    filter: filterRendered,
    searchIndexVersion: () => String(snapshotState?.searchIndexVersion || '')
  };
  window.__ROYAL_SNAPSHOT_SEARCH_VERSION__ = VERSION;
})();
