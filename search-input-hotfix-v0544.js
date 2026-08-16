/* Royal CRM Mini App — Search Input Hotfix v0.5.44
 * Fixes Android/iOS Telegram WebView typing regression introduced in v0.5.43.
 *
 * Principle:
 * - NEVER stop/prevent input/composition events;
 * - replace the rendered search input with a clean clone, removing legacy
 *   re-render listeners from app.js and v0.5.43;
 * - keep the input DOM node alive while typing;
 * - debounce only result filtering, never keyboard/input processing.
 */
(() => {
  const VERSION = '0.5.44';
  const DELAY = 160;
  const IN_CHAT = 'В чате';
  let participantTimer = 0;
  let teamTimer = 0;

  function normalize(value) {
    return String(value == null ? '' : value)
      .toLocaleLowerCase('ru-RU')
      .replace(/ё/g, 'е')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function visibleParticipants() {
    const list = Array.isArray(snapshotState?.participants) ? snapshotState.participants : [];
    return list
      .filter(p => {
        const state = String(p?.chatState || '').trim();
        return !state || state === IN_CHAT;
      })
      .map((p, i) => ({ p, i, incomplete: ![p?.name, p?.telegramName, p?.username].some(v => String(v || '').trim()) }))
      .sort((a, b) => Number(a.incomplete) - Number(b.incomplete) || a.i - b.i)
      .map(x => x.p);
  }

  function decorateAfterUpdate() {
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
    const heading = [...(panel?.querySelectorAll?.('.section-title-row h2') || [])]
      .find(h => h.textContent.trim() === title);
    const muted = heading?.parentElement?.querySelector('.muted');
    if (muted) muted.textContent = hasQuery ? `${found} из ${total}` : String(total);
  }

  function participantMatches(p, query) {
    try {
      if (window.RoyalLeanSearch?.participantMatches) return !!window.RoyalLeanSearch.participantMatches(p, query);
    } catch (_) {}
    const text = typeof participantSearchText === 'function' ? participantSearchText(p) : [p?.name, p?.telegramName, p?.username].join(' ');
    return normalize(text).includes(normalize(query));
  }

  function teamMatches(t, query) {
    try {
      if (window.RoyalLeanSearch?.teamMatches) return !!window.RoyalLeanSearch.teamMatches(t, query);
    } catch (_) {}
    const text = typeof teamSearchText === 'function' ? teamSearchText(t) : [t?.name, ...(t?.games || [])].join(' ');
    return normalize(text).includes(normalize(query));
  }

  function updateParticipants(query) {
    const all = visibleParticipants();
    const q = normalize(query);
    const filtered = q ? all.filter(p => participantMatches(p, q)) : all;
    const box = document.querySelector('#panel .people-list');
    if (!box) return;
    box.innerHTML = filtered.length
      ? filtered.map(participantCard).join('')
      : '<div class="empty-state">Ничего не найдено</div>';
    updateCount('Участники', filtered.length, all.length, !!q);
    decorateAfterUpdate();
  }

  function updateTeams(query) {
    const all = Array.isArray(snapshotState?.teams) ? snapshotState.teams : [];
    const q = normalize(query);
    const filtered = q ? all.filter(t => teamMatches(t, q)) : all;
    const box = document.querySelector('#panel .teams-list');
    if (!box) return;
    box.innerHTML = filtered.length
      ? filtered.map(teamCard).join('')
      : '<div class="empty-state">Ничего не найдено</div>';
    updateCount('Команды', filtered.length, all.length, !!q);
    decorateAfterUpdate();
  }

  function cleanInput(id, kind) {
    const current = document.getElementById(id);
    if (!current) return null;
    if (current.dataset.searchInputHotfixV0544 === '1') return current;

    // cloneNode removes ALL listeners attached directly by old renderers,
    // while preserving value, attributes and layout. No event is cancelled.
    const input = current.cloneNode(true);
    input.value = current.value;
    input.dataset.searchInputHotfixV0544 = '1';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocapitalize', 'none');
    input.setAttribute('spellcheck', 'false');
    current.replaceWith(input);

    if (kind === 'participants') {
      input.addEventListener('input', () => {
        clearTimeout(participantTimer);
        const value = input.value;
        participantTimer = setTimeout(() => updateParticipants(value), DELAY);
      });
      input.addEventListener('search', () => {
        clearTimeout(participantTimer);
        updateParticipants(input.value);
      });
    } else {
      input.addEventListener('input', () => {
        clearTimeout(teamTimer);
        const value = input.value;
        teamTimer = setTimeout(() => updateTeams(value), DELAY);
      });
      input.addEventListener('search', () => {
        clearTimeout(teamTimer);
        updateTeams(input.value);
      });
    }
    return input;
  }

  function installCurrent() {
    cleanInput('participantSearch', 'participants');
    cleanInput('teamSearch', 'teams');
  }

  const previousParticipants = typeof renderParticipantsPage === 'function' ? renderParticipantsPage : null;
  if (previousParticipants) {
    renderParticipantsPage = function renderParticipantsPageV0544(query = '') {
      const result = previousParticipants(query);
      const input = cleanInput('participantSearch', 'participants');
      if (input && String(query || '') !== input.value) input.value = String(query || '');
      return result;
    };
  }

  const previousTeams = typeof renderTeamsPage === 'function' ? renderTeamsPage : null;
  if (previousTeams) {
    renderTeamsPage = function renderTeamsPageV0544(query = '') {
      const result = previousTeams(query);
      const input = cleanInput('teamSearch', 'teams');
      if (input && String(query || '') !== input.value) input.value = String(query || '');
      return result;
    };
  }

  setTimeout(installCurrent, 0);
  window.RoyalSearchInputHotfix = {
    version: VERSION,
    install: installCurrent,
    updateParticipants,
    updateTeams
  };
  window.__ROYAL_SEARCH_INPUT_HOTFIX_VERSION__ = VERSION;
})();
