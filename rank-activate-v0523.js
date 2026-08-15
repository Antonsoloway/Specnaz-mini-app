/* Royal CRM Mini App — rank activation bridge v0.5.23
 * No MutationObserver. Only schedules a visible-badge scan after existing UI renders.
 */
(() => {
  const VERSION = '0.5.23';
  let scheduled = 0;

  function activate() {
    scheduled = 0;
    try { window.RoyalRank?.activate?.(document); } catch (_) {}
  }

  function schedule() {
    if (scheduled) return;
    scheduled = requestAnimationFrame(() => requestAnimationFrame(activate));
  }

  if (typeof renderPage === 'function') {
    const nativeRenderPage = renderPage;
    renderPage = function(page) {
      const result = nativeRenderPage(page);
      schedule();
      return result;
    };
  }

  if (typeof loadSnapshot === 'function') {
    const nativeLoadSnapshot = loadSnapshot;
    loadSnapshot = async function() {
      const result = await nativeLoadSnapshot();
      schedule();
      return result;
    };
  }

  document.addEventListener('click', schedule, false);
  document.addEventListener('pointerup', schedule, false);
  document.addEventListener('toggle', schedule, true);
  schedule();

  window.__ROYAL_RANK_ACTIVATE_VERSION__ = VERSION;
})();
