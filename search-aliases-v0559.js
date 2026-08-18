/* Royal CRM Mini App — confirmed search aliases hotfix v0.5.59
 * Adds exact team aliases without changing the generic search algorithm.
 */
(() => {
  const VERSION = '0.5.59';
  const CONFIRMED_TEAM_ALIASES = [
    { name: 'BbIIIIKA', game: 'Royal Kingdom', aliases: ['вышка'] }
  ];

  function normalize(value) {
    let text = String(value == null ? '' : value);
    try { text = text.normalize('NFKC'); } catch (_) {}
    return text.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
  }

  function canonicalGame(value) {
    const text = normalize(value);
    if (text === 'рк' || text.includes('royal kingdom')) return 'Royal Kingdom';
    if (text === 'рм' || text.includes('royal match')) return 'Royal Match';
    return String(value || '').trim();
  }

  function teamGame(team) {
    return canonicalGame(team?.game || (Array.isArray(team?.games) ? team.games[0] : '') || '');
  }

  function isExactTeam(team, rule) {
    return normalize(team?.name) === normalize(rule.name) && teamGame(team) === canonicalGame(rule.game);
  }

  function pushAliases(target, aliases) {
    if (!target) return false;
    const keys = Array.isArray(target.searchKeys) ? target.searchKeys.slice() : [];
    const seen = new Set(keys.map(normalize));
    let changed = false;
    aliases.forEach(alias => {
      const key = normalize(alias);
      if (!key || seen.has(key)) return;
      keys.push(alias);
      seen.add(key);
      changed = true;
    });
    if (changed) target.searchKeys = keys;
    return changed;
  }

  function membershipMatchesRule(membership, rule) {
    const teamName = membership?.team || membership?.teamRaw || '';
    const game = membership?.game || membership?.teamRaw || '';
    return normalize(teamName) === normalize(rule.name) && canonicalGame(game) === canonicalGame(rule.game);
  }

  function applyConfirmedAliases() {
    const teams = Array.isArray(snapshotState?.teams) ? snapshotState.teams : [];
    const participants = Array.isArray(snapshotState?.participants) ? snapshotState.participants : [];
    let changed = false;

    CONFIRMED_TEAM_ALIASES.forEach(rule => {
      teams.filter(team => isExactTeam(team, rule)).forEach(team => {
        if (pushAliases(team, rule.aliases)) changed = true;
      });

      participants.forEach(participant => {
        const memberships = Array.isArray(participant?.memberships) ? participant.memberships : [];
        if (!memberships.some(membership => membershipMatchesRule(membership, rule))) return;
        if (pushAliases(participant, rule.aliases)) changed = true;
      });
    });

    return changed;
  }

  if (typeof loadSnapshot === 'function') {
    const nativeLoadSnapshot = loadSnapshot;
    loadSnapshot = async function loadSnapshotWithConfirmedAliasesV0559(...args) {
      const result = await nativeLoadSnapshot.apply(this, args);
      applyConfirmedAliases();
      return result;
    };
  }

  window.setTimeout(applyConfirmedAliases, 0);
  window.setTimeout(applyConfirmedAliases, 500);
  window.RoyalSearchAliasesV0559 = {
    version: VERSION,
    apply: applyConfirmedAliases,
    aliases: CONFIRMED_TEAM_ALIASES.map(item => ({ ...item, aliases: item.aliases.slice() }))
  };
  window.__ROYAL_SEARCH_ALIASES_V0559__ = VERSION;
})();