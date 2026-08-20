/* Royal CRM Mini App — v0.6.0 version guard + final admin-write loader */
(() => {
  const VERSION = '0.6.0';
  const CACHE = '20260820-2300';

  function apply() {
    const badge = document.getElementById('versionBadge');
    if (badge && badge.textContent !== `v${VERSION} ›`) badge.textContent = `v${VERSION} ›`;
  }

  function loadAdminNavigationGuard() {
    if (window.RoyalAdminNavigationGuardV0600 || document.querySelector('script[data-admin-navigation-guard-v0600="1"]')) return;
    const guard = document.createElement('script');
    guard.src = `admin-navigation-guard-v0600.js?v=${CACHE}`;
    guard.async = false;
    guard.dataset.adminNavigationGuardV0600 = '1';
    document.body.appendChild(guard);
  }

  function loadAdminParticipantMemberships() {
    if (window.RoyalAdminParticipantMembershipsV0600 || document.querySelector('script[data-admin-participant-memberships-v0600="1"]')) {
      loadAdminNavigationGuard();
      return;
    }
    const memberships = document.createElement('script');
    memberships.src = `admin-participant-memberships-v0600.js?v=${CACHE}`;
    memberships.async = false;
    memberships.dataset.adminParticipantMembershipsV0600 = '1';
    memberships.addEventListener('load', loadAdminNavigationGuard, { once:true });
    document.body.appendChild(memberships);
  }

  function loadAdminParticipantNavGuard() {
    if (window.RoyalAdminParticipantNavGuardV0600 || document.querySelector('script[data-admin-participant-nav-guard-v0600="1"]')) {
      loadAdminParticipantMemberships();
      return;
    }
    const guard = document.createElement('script');
    guard.src = `admin-participant-nav-guard-v0600.js?v=${CACHE}`;
    guard.async = false;
    guard.dataset.adminParticipantNavGuardV0600 = '1';
    guard.addEventListener('load', loadAdminParticipantMemberships, { once:true });
    document.body.appendChild(guard);
  }

  function loadAdminParticipantDetail() {
    if (window.RoyalAdminParticipantDetailV0600 || document.querySelector('script[data-admin-participant-detail-v0600="1"]')) {
      loadAdminParticipantNavGuard();
      return;
    }
    const detail = document.createElement('script');
    detail.src = `admin-participant-detail-v0600.js?v=${CACHE}`;
    detail.async = false;
    detail.dataset.adminParticipantDetailV0600 = '1';
    detail.addEventListener('load', loadAdminParticipantNavGuard, { once:true });
    document.body.appendChild(detail);
  }

  function loadAdminTeamDetail() {
    if (window.RoyalAdminTeamDetailV0600 || document.querySelector('script[data-admin-team-detail-v0600="1"]')) {
      loadAdminParticipantDetail();
      return;
    }
    const detail = document.createElement('script');
    detail.src = `admin-team-detail-v0600.js?v=${CACHE}`;
    detail.async = false;
    detail.dataset.adminTeamDetailV0600 = '1';
    detail.addEventListener('load', loadAdminParticipantDetail, { once:true });
    document.body.appendChild(detail);
  }

  function loadAdminEnhancements() {
    if (window.RoyalAdminSearchMediaSortV0600 || document.querySelector('script[data-admin-search-media-sort-v0600="1"]')) {
      loadAdminTeamDetail();
      return;
    }
    const script = document.createElement('script');
    script.src = `admin-search-media-sort-v0600.js?v=${CACHE}`;
    script.async = false;
    script.dataset.adminSearchMediaSortV0600 = '1';
    script.addEventListener('load', loadAdminTeamDetail, { once:true });
    document.body.appendChild(script);
  }

  function loadAdminPersistentMedia() {
    if (window.RoyalAdminPersistentMediaV0600 || document.querySelector('script[data-admin-persistent-media-v0600="1"]')) {
      loadAdminEnhancements();
      return;
    }
    const media = document.createElement('script');
    media.src = `admin-media-cache-v0600-v2.js?v=${CACHE}`;
    media.async = false;
    media.dataset.adminPersistentMediaV0600 = '1';
    media.addEventListener('load', loadAdminEnhancements, { once:true });
    document.body.appendChild(media);
  }

  function loadParticipantPolicy() {
    if (window.RoyalAdminParticipantEditPolicyV0600 || document.querySelector('script[data-admin-participant-policy-v0600="1"]')) {
      loadAdminPersistentMedia();
      return;
    }
    const policy = document.createElement('script');
    policy.src = `admin-participant-edit-policy-v0600.js?v=${CACHE}`;
    policy.async = false;
    policy.dataset.adminParticipantPolicyV0600 = '1';
    policy.addEventListener('load', loadAdminPersistentMedia, { once:true });
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
    observer.observe(badge, { childList:true, characterData:true, subtree:true });
  }
  window.__ROYAL_UI_VERSION__ = VERSION;
  loadFinalGate();
})();
