/* Royal CRM Mini App — v0.6.0 version guard + final admin-write loader */
(() => {
  const VERSION = '0.6.0';
  const CACHE = '20260820-1018';

  function apply() {
    const badge = document.getElementById('versionBadge');
    if (badge && badge.textContent !== `v${VERSION} ›`) badge.textContent = `v${VERSION} ›`;
  }

  function loadPhotoModule() {
    if (window.RoyalAdminTeamPhotoV0600 || document.querySelector('script[data-admin-team-photo-v0600="1"]')) return;
    const photo = document.createElement('script');
    photo.src = `admin-team-photo-v0600.js?v=${CACHE}`;
    photo.async = false;
    photo.dataset.adminTeamPhotoV0600 = '1';
    document.body.appendChild(photo);
  }

  function loadAdminWrite() {
    if (window.RoyalAdminWriteV0600) {
      loadPhotoModule();
      return;
    }
    if (document.querySelector('script[data-admin-write-v0600-v3="1"]')) return;
    const script = document.createElement('script');
    script.src = `admin-write-v0600-v3.js?v=${CACHE}`;
    script.async = false;
    script.dataset.adminWriteV0600V3 = '1';
    script.addEventListener('load', loadPhotoModule, { once:true });
    document.body.appendChild(script);
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
  loadAdminWrite();
})();
