/* Royal CRM Mini App — stability/version guard v0.5.51 */
(() => {
  const VERSION = '0.5.51';
  function applyVersion() {
    const badge = document.getElementById('versionBadge');
    if (badge) badge.textContent = `v${VERSION} ›`;
  }
  if (typeof renderAuth === 'function') {
    const nativeRenderAuth = renderAuth;
    renderAuth = function(data) {
      const result = nativeRenderAuth(data);
      applyVersion();
      return result;
    };
  }
  if (typeof renderPage === 'function') {
    const nativeRenderPage = renderPage;
    renderPage = function(page) {
      const result = nativeRenderPage(page);
      applyVersion();
      return result;
    };
  }
  applyVersion();
  setTimeout(applyVersion, 0);
  window.__ROYAL_UI_VERSION__ = VERSION;
})();