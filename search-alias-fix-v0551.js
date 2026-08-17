/* Royal CRM Mini App — Search Alias Fix v0.5.51
 * Keeps the v0.5.50/v0.5.47 hybrid search unchanged.
 * Adds confirmed aliases to snapshot objects and game-scoped memberships.
 */
(() => {
  const VERSION = '0.5.51';
  const ALIASES = new Map([
    ['hepbbl b hopme', 'нервы в норме'],
    ['mbl pycckue', 'мы русские']
  ]);

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

  function addKey(item, value) {
    if (!item || !value) return;
    if (!Array.isArray(item.searchKeys)) item.searchKeys = [];
    const n = normalize(value);
    if (n && !item.searchKeys.some(key => normalize(key) === n)) item.searchKeys.push(n);
    const compact = n.replace(/\s+/g, '');
    if (compact && !item.searchKeys.some(key => normalize(key) === compact)) item.searchKeys.push(compact);
  }

  function aliasForTeam(value) {
    const n = normalize(value).replace(/\s+(рм|рк|rm|rk)$/u, '').trim();
    return ALIASES.get(n) || '';
  }

  function applyAliases() {
    let snapshot = null;
    try {
      if (typeof snapshotState !== 'undefined') snapshot = snapshotState;
    } catch (_) {}
    if (!snapshot && window.snapshotState) snapshot = window.snapshotState;
    if (!snapshot || !Array.isArray(snapshot.teams) || !Array.isArray(snapshot.participants)) return false;

    snapshot.teams.forEach(team => {
      const alias = aliasForTeam(team?.name);
      if (!alias) return;
      addKey(team, alias);
    });

    snapshot.participants.forEach(participant => {
      const memberships = Array.isArray(participant?.memberships) ? participant.memberships : [];
      memberships.forEach(membership => {
        const alias = aliasForTeam(membership?.team || membership?.teamRaw);
        if (!alias) return;
        membership.teamAlias = alias;
        membership.alias = alias;
        addKey(participant, alias);
      });
    });

    window.__ROYAL_SEARCH_ALIAS_FIX_APPLIED__ = VERSION;
    return true;
  }

  if (typeof loadSnapshot === 'function') {
    const nativeLoadSnapshot = loadSnapshot;
    loadSnapshot = async function loadSnapshotV0551(...args) {
      const result = await nativeLoadSnapshot.apply(this, args);
      applyAliases();
      return result;
    };
  }

  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    if (applyAliases() || attempts >= 80) clearInterval(timer);
  }, 100);
  setTimeout(applyAliases, 0);

  window.RoyalSearchAliasFix0551 = { version: VERSION, apply: applyAliases };
})();