/* Royal CRM Mini App — stable UI version v0.5.13 */
(() => {
  const VERSION = '0.5.13';

  function applyVersion() {
    const badge = document.getElementById('versionBadge');
    if (badge) badge.textContent = `v${VERSION}`;
    window.__ROYAL_UI_VERSION__ = VERSION;
  }

  applyVersion();

  if (typeof renderAuth === 'function') {
    const nativeRenderAuth = renderAuth;
    renderAuth = function(data) {
      const result = nativeRenderAuth(data);
      applyVersion();
      return result;
    };
  }

  if (typeof showFatal === 'function') {
    const nativeShowFatal = showFatal;
    showFatal = function(message, details) {
      const result = nativeShowFatal(message, details);
      applyVersion();
      return result;
    };
  }

  // One delayed correction is enough for synchronous legacy modules; no observers.
  setTimeout(applyVersion, 100);
})();
