/* Royal CRM Mini App — Android WebView safety patch v0.5.12 */
(() => {
  const VERSION = '0.5.12';

  // media-fix.js used to rewrite the visible build badge on every panel mutation.
  // Keep the media behavior, but stop touching the badge.
  if (typeof window.mediaRefresh === 'function') {
    window.mediaRefresh = function () {
      try { setupAvatarLoading(document.getElementById('panel')); } catch (_) {}
      try { mediaLoadTeamPhoto(); } catch (_) {}
    };
  }

  const applyVersion = () => {
    const badge = document.getElementById('versionBadge');
    if (badge) badge.textContent = `v${VERSION}`;
  };

  applyVersion();
  window.__ROYAL_UI_VERSION__ = VERSION;
})();
