/* Shared team ordering. Identity is exact CRM name + canonical game. */
(() => {
  const clean = value => String(value ?? '').trim().toLocaleLowerCase('ru-RU');
  function game(value) {
    const raw = clean(value);
    if (raw === 'рм' || raw === 'royal match') return 'royal match';
    if (raw === 'рк' || raw === 'royal kingdom') return 'royal kingdom';
    return raw;
  }
  const key = (name, value) => JSON.stringify([clean(name), game(value)]);
  const teamKey = team => key(team?.name, team?.game || team?.games?.[0]);
  function number(value) {
    const parsed = Number(String(value ?? '').replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  function metrics(participants) {
    const result = new Map();
    const seen = new Set();
    for (const participant of participants || []) {
      const id = String(participant?.telegramId ?? '').trim().replace(/\.0$/, '');
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      const score = number(participant?.specnazTrips ?? participant?.specnaz);
      const memberships = new Set();
      for (const membership of participant?.memberships || []) {
        if (!clean(membership?.team) || !game(membership?.game)) continue;
        const identity = key(membership.team, membership.game);
        if (memberships.has(identity)) continue;
        memberships.add(identity);
        const metric = result.get(identity) || { total: 0, scoredMembers: 0 };
        metric.total += score;
        if (score > 0) metric.scoredMembers++;
        result.set(identity, metric);
      }
    }
    return result;
  }
  function order(teams, participants, useSheetTotals = false) {
    const byTeam = metrics(participants);
    return (teams || []).map((team, index) => {
      const metric = byTeam.get(teamKey(team)) || { total: 0, scoredMembers: 0 };
      return { team, index, total: useSheetTotals ? number(team?.specnazTrips) : metric.total,
        scoredMembers: metric.scoredMembers };
    }).sort((a, b) => b.total - a.total || b.scoredMembers - a.scoredMembers || a.index - b.index)
      .map(item => item.team);
  }
  window.RoyalTeamSpecnazOrder = { order, metrics, teamKey };

  if (typeof renderTeamsPage === 'function') {
    const originalRender = renderTeamsPage;
    renderTeamsPage = function (...args) {
      const state = typeof snapshotState !== 'undefined' ? snapshotState : null;
      if (!Array.isArray(state?.teams)) return originalRender(...args);
      const originalTeams = state.teams;
      state.teams = order(originalTeams, state.participants);
      try { return originalRender(...args); }
      finally { state.teams = originalTeams; }
    };
  }
})();
