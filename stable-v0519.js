/* Royal CRM Mini App — stability guard v0.5.19 */
(() => {
  const VERSION = '0.5.19';
  function applyVersion() {
    const badge = document.getElementById('versionBadge');
    if (badge) badge.textContent = `v${VERSION}`;
  }
  if (typeof renderAuth === 'function') {
    const nativeRenderAuth = renderAuth;
    renderAuth = function(data) {
      const result = nativeRenderAuth(data);
      applyVersion();
      return result;
    };
  }
  if (typeof loadSnapshot === 'function') {
    const nativeLoadSnapshot = loadSnapshot;
    loadSnapshot = async function() {
      try { return await nativeLoadSnapshot(); }
      finally { applyVersion(); }
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
