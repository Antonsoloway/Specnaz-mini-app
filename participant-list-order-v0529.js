/* Royal CRM Mini App — participant list ordering v0.5.29
 * UI-only: participants that have Telegram ID but no visible identity fields
 * are kept in the list and moved to the very bottom.
 */
(() => {
  const VERSION = '0.5.29';

  function hasVisibleIdentity(p) {
    return [p?.name, p?.telegramName, p?.username]
      .some(value => String(value || '').trim().length > 0);
  }

  function orderParticipants(list) {
    return (Array.isArray(list) ? list : [])
      .map((participant, index) => ({ participant, index, incomplete: !hasVisibleIdentity(participant) }))
      .sort((a, b) => Number(a.incomplete) - Number(b.incomplete) || a.index - b.index)
      .map(item => item.participant);
  }

  if (typeof renderParticipantsPage === 'function') {
    const nativeRenderParticipantsPage = renderParticipantsPage;
    renderParticipantsPage = function(query = '') {
      const state = (typeof snapshotState !== 'undefined' && snapshotState) ? snapshotState : null;
      const original = state && Array.isArray(state.participants) ? state.participants : null;
      if (!original) return nativeRenderParticipantsPage(query);

      state.participants = orderParticipants(original);
      try {
        return nativeRenderParticipantsPage(query);
      } finally {
        state.participants = original;
      }
    };
  }

  window.__ROYAL_PARTICIPANT_ORDER_VERSION__ = VERSION;
})();
