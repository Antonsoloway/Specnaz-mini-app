/* Royal CRM Mini App — active teams title hotfix v0.5.59 */
(() => {
  const TITLE = 'Команды принимающие участие в базе спецназа';

  function applyTitle() {
    document.querySelectorAll('.active-teams-head-v0559 h2').forEach(node => {
      if (node.textContent !== TITLE) node.textContent = TITLE;
    });
    document.querySelectorAll('[data-active-teams-open]').forEach(node => {
      node.setAttribute('aria-label', TITLE);
      node.title = TITLE;
    });
  }

  const panel = document.getElementById('panel');
  if (panel && typeof MutationObserver === 'function') {
    const observer = new MutationObserver(applyTitle);
    observer.observe(panel, { childList: true, subtree: true });
  }

  window.addEventListener('pageshow', applyTitle);
  window.setTimeout(applyTitle, 0);
  window.setTimeout(applyTitle, 120);
  window.__ROYAL_ACTIVE_TEAMS_TITLE_VERSION__ = '0.5.59';
})();