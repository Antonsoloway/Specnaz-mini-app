/* Royal CRM Mini App — stability/version guard v0.5.59 */
(() => {
  const VERSION = '0.5.59';
  const STABLE_PATCH = '0.5.59.2';

  function applyVersion() {
    const badge = document.getElementById('versionBadge');
    if (badge) badge.textContent = `v${VERSION} ›`;
  }

  function isIOS() {
    const ua = String(navigator.userAgent || '');
    return /iPad|iPhone|iPod/.test(ua)
      || (navigator.platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1);
  }

  function waitForImage(img, timeoutMs = 900) {
    if (!img?.isConnected) return Promise.resolve(false);
    if (Number(img.naturalWidth || 0) > 0) return Promise.resolve(true);
    return new Promise(resolve => {
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true;
        try { img.removeEventListener('load', onLoad); } catch (_) {}
        try { img.removeEventListener('error', onError); } catch (_) {}
        resolve(!!value);
      };
      const onLoad = () => finish(Number(img.naturalWidth || 0) > 0);
      const onError = () => finish(false);
      img.addEventListener('load', onLoad, { once: true });
      img.addEventListener('error', onError, { once: true });
      setTimeout(() => finish(Number(img.naturalWidth || 0) > 0), timeoutMs);
    });
  }

  function installIosTeamPhotoGuard() {
    if (!isIOS()) return;
    if (window.__ROYAL_IOS_TEAM_PHOTO_GUARD__ === STABLE_PATCH) return;
    if (typeof mediaV0517LoadTeamPhoto !== 'function') return;

    const nativeLoadTeamPhoto = mediaV0517LoadTeamPhoto;

    mediaV0517LoadTeamPhoto = async function iosSafeTeamPhotoLoad() {
      const panel = document.getElementById('panel');
      const img = panel?.querySelector?.('.team-photo-box .team-photo');
      if (!img) return nativeLoadTeamPhoto();

      const originalSrc = String(img.getAttribute('src') || '').trim();
      const parent = img.parentElement;
      const nativeRemoveAttribute = img.removeAttribute;
      let restoreAttempted = false;
      let removePatched = false;

      const restoreOriginal = () => {
        if (!originalSrc || !img.isConnected || restoreAttempted) return false;
        const current = String(img.getAttribute('src') || '').trim();
        if (current === originalSrc && Number(img.naturalWidth || 0) > 0) {
          parent?.classList.remove('photo-error');
          return true;
        }
        restoreAttempted = true;
        try {
          img.src = originalSrc;
          img.dataset.teamProxyLoaded = 'fallback';
          parent?.classList.remove('photo-error');
          return true;
        } catch (_) {
          return false;
        }
      };

      const onError = () => {
        const current = String(img.getAttribute('src') || '').trim();
        if (originalSrc && current !== originalSrc) {
          setTimeout(restoreOriginal, 0);
        }
      };
      img.addEventListener('error', onError);

      try {
        img.removeAttribute = function(name) {
          if (String(name || '').toLowerCase() === 'src') return;
          return nativeRemoveAttribute.call(this, name);
        };
        removePatched = true;
      } catch (_) {}

      let task;
      try {
        task = nativeLoadTeamPhoto();
      } finally {
        if (removePatched) {
          try { img.removeAttribute = nativeRemoveAttribute; } catch (_) {}
        }
      }

      try {
        await task;
        const loaded = await waitForImage(img, 900);
        if (loaded && img.isConnected) {
          parent?.classList.remove('photo-error');
        } else {
          restoreOriginal();
        }
      } catch (_) {
        restoreOriginal();
      } finally {
        setTimeout(() => {
          try { img.removeEventListener('error', onError); } catch (_) {}
        }, 3000);
      }
    };

    try {
      if (window.RoyalPersistentMediaCache) {
        window.RoyalPersistentMediaCache.loadTeamPhoto = mediaV0517LoadTeamPhoto;
        window.RoyalPersistentMediaCache.iosSafeGuard = STABLE_PATCH;
      }
    } catch (_) {}

    window.__ROYAL_IOS_TEAM_PHOTO_GUARD__ = STABLE_PATCH;
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

  installIosTeamPhotoGuard();
  applyVersion();
  setTimeout(() => {
    installIosTeamPhotoGuard();
    applyVersion();
  }, 0);

  window.__ROYAL_UI_VERSION__ = VERSION;
  window.__ROYAL_STABLE_PATCH_VERSION__ = STABLE_PATCH;
})();