/* Royal CRM Mini App — team game color system v0.5.35 */
(() => {
  const VERSION = '0.5.35';

  function gameKind(value) {
    const text = String(value || '').toLocaleLowerCase('ru-RU');
    const rm = /royal\s*match|(^|[^а-яa-z])рм([^а-яa-z]|$)/i.test(text);
    const rk = /royal\s*kingdom|(^|[^а-яa-z])рк([^а-яa-z]|$)/i.test(text);
    if (rm && rk) return 'both';
    if (rk) return 'rk';
    if (rm) return 'rm';
    return '';
  }

  function setKind(node, kind) {
    if (!node) return;
    node.classList.remove('team-game-rm-v0535','team-game-rk-v0535','team-game-both-v0535');
    if (kind) node.classList.add(`team-game-${kind}-v0535`);
  }

  function decorateMemberships(root = document) {
    root.querySelectorAll?.('.membership-pill,.participant-profile-membership,.self-membership').forEach(node => {
      setKind(node, gameKind(node.textContent));
    });
    root.querySelectorAll?.('.team-card').forEach(card => {
      const games = card.querySelector('.team-card-main > span')?.textContent || card.textContent || '';
      setKind(card, gameKind(games));
    });
    root.querySelectorAll?.('.team-member-role').forEach(role => setKind(role, gameKind(role.textContent)));
    root.querySelectorAll?.('.participant-profile-team-link,.team-link,[data-team]').forEach(node => {
      if (node.classList.contains('membership-pill')) return;
      const kind = gameKind(node.textContent);
      if (kind) setKind(node, kind);
    });
  }

  function schedule() {
    setTimeout(() => decorateMemberships(document), 0);
    setTimeout(() => decorateMemberships(document), 100);
  }

  if (typeof renderParticipantsPage === 'function') { const native = renderParticipantsPage; renderParticipantsPage = function(query = '') { const r = native(query); schedule(); return r; }; }
  if (typeof renderTeamsPage === 'function') { const native = renderTeamsPage; renderTeamsPage = function(query = '') { const r = native(query); schedule(); return r; }; }
  if (typeof renderTeamDetail === 'function') { const native = renderTeamDetail; renderTeamDetail = function(teamRef) { const r = native(teamRef); schedule(); return r; }; }
  if (typeof renderPage === 'function') { const native = renderPage; renderPage = function(page) { const r = native(page); schedule(); return r; }; }
  const nativeOpenParticipant = window.RoyalOpenParticipantByTelegramId;
  if (typeof nativeOpenParticipant === 'function') { window.RoyalOpenParticipantByTelegramId = function(id) { const r = nativeOpenParticipant(id); schedule(); return r; }; }

  document.addEventListener('click', schedule, true);
  document.addEventListener('input', schedule, true);
  window.addEventListener('pageshow', schedule);
  schedule();
  window.RoyalTeamGameColors = { version: VERSION, refresh: schedule, gameKind };
  window.__ROYAL_TEAM_GAME_COLORS_VERSION__ = VERSION;
})();
