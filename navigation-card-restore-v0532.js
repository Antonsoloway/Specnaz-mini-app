/* Royal CRM Mini App — navigation/card restore hotfix v0.5.32
 * Fixes participant-list UI reverting after returning from a participant profile.
 * Identity remains raw Telegram ID only.
 */
(() => {
  const VERSION = '0.5.32';

  function decorateNow() {
    try { window.RoyalParticipantCardUX?.decorate?.(); } catch (_) {}
  }

  function decorateAfterRestore() {
    decorateNow();
    requestAnimationFrame(() => {
      decorateNow();
      requestAnimationFrame(decorateNow);
    });
  }

  // RoyalNav restores the participants page by calling renderParticipantsPage()
  // directly. v0.5.31 decorated cards after ordinary page navigation, but that
  // direct restore path bypassed the decorator and brought back the old layout.
  if (typeof renderParticipantsPage === 'function') {
    const nativeRenderParticipantsPage = renderParticipantsPage;
    renderParticipantsPage = function(query = '') {
      const result = nativeRenderParticipantsPage(query);
      decorateAfterRestore();
      return result;
    };
  }

  // Keep team-member lists consistent if a team detail is rendered again rather
  // than restored from captured HTML.
  if (typeof renderTeamDetail === 'function') {
    const nativeRenderTeamDetail = renderTeamDetail;
    renderTeamDetail = function(teamRef) {
      const result = nativeRenderTeamDetail(teamRef);
      decorateAfterRestore();
      return result;
    };
  }

  // Visible app Back button is handled on document capture by RoyalNav with
  // stopImmediatePropagation(). Window capture runs first and schedules a final
  // post-restore decoration without interfering with navigation itself.
  window.addEventListener('click', event => {
    if (!event.target?.closest?.('[data-royal-back]')) return;
    setTimeout(decorateAfterRestore, 0);
  }, true);

  window.addEventListener('pageshow', () => setTimeout(decorateAfterRestore, 0));

  decorateAfterRestore();
  window.__ROYAL_NAV_CARD_RESTORE_VERSION__ = VERSION;
})();
