/* Royal CRM Mini App — v0.6.0 version guard */
(() => {
  const VERSION = '0.6.0';
  function apply() {
    const badge = document.getElementById('versionBadge');
    if (badge && badge.textContent !== `v${VERSION} ›`) badge.textContent = `v${VERSION} ›`;
  }
  apply();
  setTimeout(apply, 0);
  setTimeout(apply, 500);
  setTimeout(apply, 1500);
  const badge = document.getElementById('versionBadge');
  if (badge && 'MutationObserver' in window) {
    const observer = new MutationObserver(apply);
    observer.observe(badge, { childList: true, characterData: true, subtree: true });
  }
  window.__ROYAL_UI_VERSION__ = VERSION;
})();
