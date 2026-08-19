/* Royal CRM Mini App — stability/version guard v0.5.59 */
(() => {
  const VERSION = '0.5.59';
  const STABLE_PATCH = '0.5.59.3';
  const IOS_MEDIA_DB = 'royal-crm-media-cache';
  const IOS_MEDIA_DB_VERSION = 1;
  const IOS_MEDIA_STORE = 'images';
  const IOS_TEAM_MAX_AGE_MS = 45 * 24 * 60 * 60 * 1000;
  const iosTeamPhotoMemory = new Map();
  let iosDbPromise = null;
  let iosWarmPromise = null;

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

  function normalizeGame(value) {
    const raw = String(value || '').trim();
    const low = raw.toLocaleLowerCase('ru-RU');
    if (low === 'рм' || low.includes('royal match')) return 'Royal Match';
    if (low === 'рк' || low.includes('royal kingdom')) return 'Royal Kingdom';
    return raw;
  }

  function normalizeText(value) {
    return String(value || '')
      .toLocaleLowerCase('ru-RU')
      .replace(/ё/g, 'е')
      .replace(/[^a-zа-я0-9]+/giu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function stableTeamKey(teamName, game) {
    const n = normalizeText(teamName);
    const g = normalizeText(normalizeGame(game));
    return n ? `team:${n}\n${g}` : '';
  }

  function parseTeamRef(value) {
    const raw = String(value || '');
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return { name: String(parsed[0] || '').trim(), game: normalizeGame(parsed[1]) };
      }
    } catch (_) {}
    return { name: raw.trim(), game: '' };
  }

  function teamForRef(teamRef) {
    const ref = parseTeamRef(teamRef);
    const teams = Array.isArray(snapshotState?.teams) ? snapshotState.teams : [];
    const wantedName = normalizeText(ref.name);
    const wantedGame = normalizeGame(ref.game);
    return teams.find(team =>
      normalizeText(team?.name) === wantedName
      && (!wantedGame || normalizeGame(team?.game || team?.games?.[0]) === wantedGame)
    ) || teams.find(team => normalizeText(team?.name) === wantedName) || null;
  }

  function openIosMediaDb() {
    if (!isIOS() || !('indexedDB' in window)) return Promise.resolve(null);
    if (iosDbPromise) return iosDbPromise;
    iosDbPromise = new Promise(resolve => {
      let req;
      try { req = indexedDB.open(IOS_MEDIA_DB, IOS_MEDIA_DB_VERSION); }
      catch (_) { resolve(null); return; }
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
      req.onupgradeneeded = () => {
        try {
          const db = req.result;
          if (!db.objectStoreNames.contains(IOS_MEDIA_STORE)) {
            const store = db.createObjectStore(IOS_MEDIA_STORE, { keyPath: 'key' });
            store.createIndex('touchedAt', 'touchedAt', { unique: false });
          }
        } catch (_) {}
      };
    });
    return iosDbPromise;
  }

  async function readAllIosMediaRecords() {
    const db = await openIosMediaDb();
    if (!db) return [];
    return new Promise(resolve => {
      let tx;
      try { tx = db.transaction(IOS_MEDIA_STORE, 'readonly'); }
      catch (_) { resolve([]); return; }
      const store = tx.objectStore(IOS_MEDIA_STORE);
      if (typeof store.getAll === 'function') {
        const req = store.getAll();
        req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
        req.onerror = () => resolve([]);
        return;
      }
      const rows = [];
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) { resolve(rows); return; }
        rows.push(cursor.value);
        cursor.continue();
      };
      req.onerror = () => resolve(rows);
    });
  }

  async function readIosTeamRecord(key) {
    const db = await openIosMediaDb();
    if (!db || !key) return null;
    return new Promise(resolve => {
      let tx;
      try { tx = db.transaction(IOS_MEDIA_STORE, 'readonly'); }
      catch (_) { resolve(null); return; }
      const req = tx.objectStore(IOS_MEDIA_STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  }

  function rememberIosTeamRecord(record) {
    const key = String(record?.key || '');
    const blob = record?.blob;
    if (!key.startsWith('team:') || !(blob instanceof Blob) || !blob.size) return false;
    const age = Date.now() - Number(record?.touchedAt || record?.createdAt || 0);
    if (age >= IOS_TEAM_MAX_AGE_MS) return false;
    if (!iosTeamPhotoMemory.has(key)) {
      try { iosTeamPhotoMemory.set(key, URL.createObjectURL(blob)); }
      catch (_) { return false; }
    }
    return true;
  }

  async function warmIosTeamPhotos() {
    if (!isIOS()) return;
    if (iosWarmPromise) return iosWarmPromise;
    iosWarmPromise = (async () => {
      const records = await readAllIosMediaRecords();
      for (const record of records) {
        if (record?.kind !== 'team' && !String(record?.key || '').startsWith('team:')) continue;
        rememberIosTeamRecord(record);
      }
    })();
    try { await iosWarmPromise; }
    finally { iosWarmPromise = null; }
  }

  async function preloadIosTeamRef(teamRef) {
    if (!isIOS()) return;
    const team = teamForRef(teamRef);
    if (!team) return;
    const game = normalizeGame(team?.game || team?.games?.[0] || '');
    const key = stableTeamKey(team?.name || '', game);
    if (!key || iosTeamPhotoMemory.has(key)) return;
    const record = await readIosTeamRecord(key);
    rememberIosTeamRecord(record);
  }

  function applyIosFastTeamPhoto(teamRef) {
    if (!isIOS()) return false;
    const team = teamForRef(teamRef);
    if (!team) return false;
    const game = normalizeGame(team?.game || team?.games?.[0] || '');
    const key = stableTeamKey(team?.name || '', game);
    const cachedUrl = iosTeamPhotoMemory.get(key);
    if (!cachedUrl) return false;

    const panel = document.getElementById('panel');
    const img = panel?.querySelector?.('.team-photo-box .team-photo');
    if (!img) return false;

    try {
      img.loading = 'eager';
      img.decoding = 'sync';
      try { img.fetchPriority = 'high'; } catch (_) {}
      img.dataset.iosFastTeamPhoto = STABLE_PATCH;
      img.dataset.teamProxyLoaded = '1';
      img.dataset.mediaCache = 'ios-memory';
      img.src = cachedUrl;
      img.parentElement?.classList.remove('photo-error');

      img.addEventListener('error', () => {
        if (img.dataset.iosFastTeamPhoto !== STABLE_PATCH) return;
        delete img.dataset.iosFastTeamPhoto;
        img.dataset.teamProxyLoaded = '';
        try { mediaV0517LoadTeamPhoto(); } catch (_) {}
      }, { once: true });
      return true;
    } catch (_) {
      return false;
    }
  }

  function installIosFastTeamRender() {
    if (!isIOS()) return;
    if (window.__ROYAL_IOS_FAST_TEAM_RENDER__ === STABLE_PATCH) return;
    if (typeof renderTeamDetail !== 'function') return;

    const nativeRenderTeamDetail = renderTeamDetail;
    renderTeamDetail = function iosFastRenderTeamDetail(teamRef) {
      const result = nativeRenderTeamDetail(teamRef);
      applyIosFastTeamPhoto(teamRef);
      return result;
    };

    document.addEventListener('pointerdown', event => {
      const target = event.target?.closest?.('[data-team]');
      if (!target) return;
      let ref = String(target.dataset?.team || '');
      try { ref = decodeURIComponent(ref); } catch (_) {}
      preloadIosTeamRef(ref).catch(() => {});
    }, true);

    window.__ROYAL_IOS_FAST_TEAM_RENDER__ = STABLE_PATCH;
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

      if (img.dataset.iosFastTeamPhoto === STABLE_PATCH && String(img.getAttribute('src') || '').trim()) {
        return;
      }

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
        window.RoyalPersistentMediaCache.iosFastWarm = warmIosTeamPhotos;
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

  if (isIOS()) {
    warmIosTeamPhotos().catch(() => {});
  }

  installIosTeamPhotoGuard();
  installIosFastTeamRender();
  applyVersion();

  setTimeout(() => {
    installIosTeamPhotoGuard();
    installIosFastTeamRender();
    if (isIOS()) warmIosTeamPhotos().catch(() => {});
    applyVersion();
  }, 0);

  window.__ROYAL_UI_VERSION__ = VERSION;
  window.__ROYAL_STABLE_PATCH_VERSION__ = STABLE_PATCH;
  window.RoyalIosTeamPhotoFastCache = {
    version: STABLE_PATCH,
    warm: warmIosTeamPhotos,
    preload: preloadIosTeamRef,
    get size() { return iosTeamPhotoMemory.size; }
  };
})();