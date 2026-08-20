/* Royal CRM Mini App — v0.6.0 version guard + final admin-write loader */
(() => {
  const VERSION = '0.6.0';
  const CACHE = '20260820-1927';

  function apply() {
    const badge = document.getElementById('versionBadge');
    if (badge && badge.textContent !== `v${VERSION} ›`) badge.textContent = `v${VERSION} ›`;
  }

  function loadAdminAvatarRefresh() {
    if (window.RoyalAdminAvatarRefreshV0600 || document.querySelector('script[data-admin-avatar-refresh-v0600="1"]')) return;
    const script = document.createElement('script');
    script.src = `admin-avatar-refresh-v0600.js?v=${CACHE}`;
    script.async = false;
    script.dataset.adminAvatarRefreshV0600 = '1';
    document.body.appendChild(script);
  }

  function loadAdminEnhancements() {
    if (window.RoyalAdminSearchMediaSortV0600 || document.querySelector('script[data-admin-search-media-sort-v0600="1"]')) {
      loadAdminAvatarRefresh();
      return;
    }
    const script = document.createElement('script');
    script.src = `admin-search-media-sort-v0600.js?v=${CACHE}`;
    script.async = false;
    script.dataset.adminSearchMediaSortV0600 = '1';
    script.addEventListener('load', loadAdminAvatarRefresh, { once:true });
    document.body.appendChild(script);
  }

  function loadParticipantPolicy() {
    if (window.RoyalAdminParticipantEditPolicyV0600 || document.querySelector('script[data-admin-participant-policy-v0600="1"]')) {
      loadAdminEnhancements();
      return;
    }
    const policy = document.createElement('script');
    policy.src = `admin-participant-edit-policy-v0600.js?v=${CACHE}`;
    policy.async = false;
    policy.dataset.adminParticipantPolicyV0600 = '1';
    policy.addEventListener('load', loadAdminEnhancements, { once:true });
    document.body.appendChild(policy);
  }

  function loadPhotoModule() {
    if (!window.RoyalAdminTeamPhotoV0600 && !document.querySelector('script[data-admin-team-photo-v0600="1"]')) {
      const photo = document.createElement('script');
      photo.src = `admin-team-photo-v0600.js?v=${CACHE}`;
      photo.async = false;
      photo.dataset.adminTeamPhotoV0600 = '1';
      document.body.appendChild(photo);
    }
    loadParticipantPolicy();
  }

  function loadAdminWriteCore() {
    if (window.RoyalAdminWriteV0600) {
      loadPhotoModule();
      return;
    }
    if (document.querySelector('script[data-admin-write-v0600-v3="1"]')) {
      loadParticipantPolicy();
      return;
    }
    const script = document.createElement('script');
    script.src = `admin-write-v0600-v3.js?v=${CACHE}`;
    script.async = false;
    script.dataset.adminWriteV0600V3 = '1';
    script.addEventListener('load', loadPhotoModule, { once:true });
    document.body.appendChild(script);
  }

  function loadFinalGate() {
    if (window.RoyalAdminWriteGateV0600) {
      loadAdminWriteCore();
      return;
    }
    if (document.querySelector('script[data-admin-write-gate-v0600="1"]')) return;
    const gate = document.createElement('script');
    gate.src = `admin-write-gate-v0600.js?v=${CACHE}`;
    gate.async = false;
    gate.dataset.adminWriteGateV0600 = '1';
    gate.addEventListener('load', loadAdminWriteCore, { once:true });
    document.body.appendChild(gate);
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
  loadFinalGate();
})();
