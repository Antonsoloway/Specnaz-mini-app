/* Royal CRM Mini App — Persistent Media Cache v0.5.54.2
 * Persistent IndexedDB cache for participant avatars and team photos.
 * Team photos use a stable team+game cache key because Google Sheets photoUrl is ephemeral.
 * Cache-first, disk-record prewarm, network fallback, low-concurrency avatar loading.
 */
(() => {
  const VERSION = '0.5.54.2';
  const DB_NAME = 'royal-crm-media-cache';
  const DB_VERSION = 1;
  const STORE = 'images';
  const MAX_AGE_MS = 45 * 24 * 60 * 60 * 1000;
  const TEAM_REFRESH_MS = 30 * 60 * 1000;
  const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
  const MAX_RECORDS = 420;
  const CONCURRENCY = 2;
  const avatarMemory = new Map();
  const teamMemory = new Map();
  const teamDiskMemory = new Map();
  const pending = new Map();
  const queue = [];
  const queued = new WeakSet();
  let active = 0;
  let observer = null;
  let dbPromise = null;
  let teamWarmPromise = null;
  let teamWarmReady = false;

  function openDb() {
    if (!('indexedDB' in window)) return Promise.resolve(null);
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(resolve => {
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); }
      catch (_) { resolve(null); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'key' });
          store.createIndex('touchedAt', 'touchedAt', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    });
    return dbPromise;
  }

  async function idbGet(key) {
    const db = await openDb();
    if (!db || !key) return null;
    return new Promise(resolve => {
      let tx;
      try { tx = db.transaction(STORE, 'readonly'); }
      catch (_) { resolve(null); return; }
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  }

  async function idbPut(key, blob, kind, extra = {}) {
    if (!key || !(blob instanceof Blob) || !blob.size) return false;
    const db = await openDb();
    if (!db) return false;
    const now = Date.now();
    const record = {
      key,
      blob,
      kind: String(kind || ''),
      createdAt: Number(extra.createdAt || now),
      touchedAt: now,
      fetchedAt: Number(extra.fetchedAt || now),
      size: blob.size,
      ...extra
    };
    return new Promise(resolve => {
      let tx;
      try { tx = db.transaction(STORE, 'readwrite'); }
      catch (_) { resolve(false); return; }
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => {
        if (record.kind === 'team' || String(record.key || '').startsWith('team:')) {
          teamDiskMemory.set(record.key, record);
        }
        resolve(true);
      };
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    });
  }

  async function idbTouch(record) {
    if (!record?.key) return;
    const db = await openDb();
    if (!db) return;
    try {
      const tx = db.transaction(STORE, 'readwrite');
      record.touchedAt = Date.now();
      tx.objectStore(STORE).put(record);
      if (String(record.key || '').startsWith('team:')) teamDiskMemory.set(record.key, record);
    } catch (_) {}
  }

  function toObjectUrl(blob, memory, key) {
    if (memory.has(key)) return memory.get(key);
    const url = URL.createObjectURL(blob);
    memory.set(key, url);
    return url;
  }

  function replaceMemoryObjectUrl(memory, key, blob) {
    const old = memory.get(key);
    const next = URL.createObjectURL(blob);
    memory.set(key, next);
    if (old && old.startsWith('blob:')) {
      setTimeout(() => { try { URL.revokeObjectURL(old); } catch (_) {} }, 1200);
    }
    return next;
  }

  function cleanTelegramId(value) {
    const text = String(value == null ? '' : value).trim().replace(/\.0$/, '');
    return /^\d+$/.test(text) ? text : '';
  }

  function participantForTelegramId(telegramId) {
    const id = cleanTelegramId(telegramId);
    const participants = Array.isArray(snapshotState?.participants) ? snapshotState.participants : [];
    return participants.find(p => cleanTelegramId(p?.telegramId) === id) || null;
  }

  function avatarIdentity(img) {
    const holder = img?.closest?.('[data-telegram-id]');
    const telegramId = cleanTelegramId(holder?.dataset?.telegramId);
    if (!telegramId) return null;
    const participant = participantForTelegramId(telegramId);
    const fileId = String(participant?.avatarFileId || '').trim();
    const stable = fileId || `tg-${telegramId}`;
    return { telegramId, fileId, key: `avatar:${stable}` };
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

  function teamFor(name, game) {
    const n = normalizeText(name);
    const g = normalizeGame(game);
    const teams = Array.isArray(snapshotState?.teams) ? snapshotState.teams : [];
    return teams.find(t => normalizeText(t?.name) === n && (!g || normalizeGame(t?.game || t?.games?.[0]) === g))
      || teams.find(t => normalizeText(t?.name) === n)
      || null;
  }

  function stableTeamKey(teamName, game) {
    const n = normalizeText(teamName);
    const g = normalizeText(normalizeGame(game));
    return n ? `team:${n}\n${g}` : '';
  }

  function teamIdentity(img) {
    const panel = document.getElementById('panel');
    const title = panel?.querySelector('.team-detail-head h2');
    const gameNode = panel?.querySelector('.team-detail-head .muted');
    const teamName = String(img?.dataset?.teamName || title?.textContent || '').trim();
    const game = normalizeGame(img?.dataset?.teamGame || gameNode?.textContent || '');
    if (!teamName) return null;
    const team = teamFor(teamName, game);
    const resolvedName = String(team?.name || teamName).trim();
    const resolvedGame = normalizeGame(team?.game || team?.games?.[0] || game);
    const photoUrl = String(team?.photoUrl || '').trim();
    const key = stableTeamKey(resolvedName, resolvedGame);
    return { teamName: resolvedName, game: resolvedGame, photoUrl, key, team };
  }

  function validTeamRecord(record, now = Date.now()) {
    if (!(record?.blob instanceof Blob) || !record.blob.size) return false;
    const age = now - Number(record.touchedAt || record.createdAt || 0);
    return age < MAX_AGE_MS;
  }

  async function fetchBlob(cacheKey, fetcher, kind) {
    if (pending.has(cacheKey)) return pending.get(cacheKey);
    const task = (async () => {
      const cached = await idbGet(cacheKey);
      if (cached?.blob instanceof Blob && cached.blob.size && Date.now() - Number(cached.touchedAt || cached.createdAt || 0) < MAX_AGE_MS) {
        idbTouch(cached).catch(() => {});
        return { blob: cached.blob, fromCache: true };
      }
      const blob = await fetcher();
      if (!(blob instanceof Blob) || !blob.size || !blob.type.startsWith('image/')) throw new Error('invalid image blob');
      idbPut(cacheKey, blob, kind).catch(() => {});
      return { blob, fromCache: false };
    })();
    pending.set(cacheKey, task);
    try { return await task; }
    finally { pending.delete(cacheKey); }
  }

  async function persistentLoadAvatar(img) {
    if (!img || img.dataset.avatarLoaded === '1' || img.dataset.avatarLoaded === 'loading') return;
    const identity = avatarIdentity(img);
    if (!identity || !sessionToken) return;
    const { telegramId, key } = identity;
    if (avatarMemory.has(key)) {
      img.src = avatarMemory.get(key);
      img.dataset.avatarLoaded = '1';
      return;
    }
    img.dataset.avatarLoaded = 'loading';
    const retry = Number(img.dataset.avatarRetries || 0);
    try {
      const result = await fetchBlob(key, async () => {
        const response = await fetch(`${API_URL}/avatar?telegramId=${encodeURIComponent(telegramId)}`, {
          method: 'GET', mode: 'cors', cache: 'no-store',
          headers: { Authorization: `Bearer ${sessionToken}` }
        });
        if (!response.ok) throw new Error(`avatar ${response.status}`);
        return response.blob();
      }, 'avatar');
      img.src = toObjectUrl(result.blob, avatarMemory, key);
      img.dataset.avatarLoaded = '1';
      img.dataset.avatarRetries = '0';
      img.dataset.mediaCache = result.fromCache ? 'disk' : 'network';
    } catch (error) {
      console.warn('Persistent avatar load failed:', telegramId, error?.message || error);
      img.dataset.avatarLoaded = 'error';
      if (retry < 2 && img.isConnected) {
        img.dataset.avatarRetries = String(retry + 1);
        setTimeout(() => {
          if (!img.isConnected || img.dataset.avatarLoaded === '1') return;
          img.dataset.avatarLoaded = '';
          enqueue(img);
        }, 900 * (retry + 1));
      }
    }
  }

  function enqueue(img) {
    if (!img || !img.isConnected || img.dataset.avatarLoaded === '1' || img.dataset.avatarLoaded === 'loading' || queued.has(img)) return;
    if (!avatarIdentity(img)) return;
    queued.add(img);
    queue.push(img);
    pump();
  }

  function pump() {
    while (active < CONCURRENCY && queue.length) {
      const img = queue.shift();
      if (img) queued.delete(img);
      if (!img || !img.isConnected) continue;
      active += 1;
      persistentLoadAvatar(img).finally(() => {
        active -= 1;
        pump();
      });
    }
  }

  function persistentSetupAvatarLoading(root) {
    const images = Array.from((root || document).querySelectorAll('[data-telegram-id] img'));
    if (!images.length) return;
    if (!('IntersectionObserver' in window)) {
      images.forEach(enqueue);
      return;
    }
    if (!observer) {
      observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          enqueue(entry.target);
        });
      }, { rootMargin: '320px 0px' });
    }
    images.forEach(img => {
      if (img.dataset.avatarLoaded === '1' || img.dataset.avatarLoaded === 'loading') return;
      observer.observe(img);
    });
  }

  function ensureTeamPhotoLayout(img) {
    if (!img) return;
    const box = img.parentElement;
    img.style.setProperty('width', '100%', 'important');
    img.style.setProperty('height', 'auto', 'important');
    img.style.setProperty('max-height', 'none', 'important');
    img.style.setProperty('object-fit', 'contain', 'important');
    img.style.setProperty('display', 'block', 'important');
    if (box) {
      box.style.setProperty('height', 'auto', 'important');
      box.style.setProperty('min-height', '0', 'important');
      box.style.setProperty('overflow', 'hidden', 'important');
    }
  }

  async function fetchTeamPhotoBlob(teamName, game) {
    const url = new URL(`${API_URL}/team-photo`);
    url.searchParams.set('team', teamName);
    if (game) url.searchParams.set('game', game);
    const response = await fetch(url.toString(), {
      method: 'GET', mode: 'cors', cache: 'no-store',
      headers: { Authorization: `Bearer ${sessionToken}` }
    });
    if (!response.ok) throw new Error(`team photo ${response.status}`);
    const blob = await response.blob();
    if (!(blob instanceof Blob) || !blob.size || !blob.type.startsWith('image/')) throw new Error('invalid team photo blob');
    return blob;
  }

  async function refreshTeamPhotoInBackground(identity, currentRecord, img) {
    if (!identity?.key || !identity.teamName || !sessionToken) return;
    const refreshKey = `refresh:${identity.key}`;
    if (pending.has(refreshKey)) return;
    const task = (async () => {
      try {
        const blob = await fetchTeamPhotoBlob(identity.teamName, identity.game);
        await idbPut(identity.key, blob, 'team', {
          sourceUrl: identity.photoUrl || '',
          fetchedAt: Date.now()
        });
        const same = currentRecord?.blob instanceof Blob
          && currentRecord.blob.size === blob.size
          && currentRecord.blob.type === blob.type;
        if (!same) {
          const objectUrl = replaceMemoryObjectUrl(teamMemory, identity.key, blob);
          if (img?.isConnected) {
            img.src = objectUrl;
            img.dataset.mediaCache = 'refresh';
            img.parentElement?.classList.remove('photo-error');
            ensureTeamPhotoLayout(img);
          }
        }
      } catch (error) {
        console.warn('Background team photo refresh failed:', identity.teamName, error?.message || error);
      }
    })();
    pending.set(refreshKey, task);
    try { await task; }
    finally { pending.delete(refreshKey); }
  }

  async function persistentLoadTeamPhoto() {
    const panel = document.getElementById('panel');
    if (!panel || !sessionToken) return;
    const img = panel.querySelector('.team-photo-box .team-photo');
    if (!img) return;
    ensureTeamPhotoLayout(img);
    const identity = teamIdentity(img);
    if (!identity?.key || img.dataset.teamProxyLoaded === 'loading') return;
    const { key } = identity;

    if (teamMemory.has(key)) {
      img.src = teamMemory.get(key);
      img.dataset.teamProxyLoaded = '1';
      img.dataset.mediaCache = 'memory';
      img.parentElement?.classList.remove('photo-error');
      return;
    }

    const warmRecord = teamDiskMemory.get(key);
    if (validTeamRecord(warmRecord)) {
      img.src = toObjectUrl(warmRecord.blob, teamMemory, key);
      img.dataset.teamProxyLoaded = '1';
      img.dataset.mediaCache = 'disk-memory';
      img.parentElement?.classList.remove('photo-error');
      ensureTeamPhotoLayout(img);

      const now = Date.now();
      const fetchedAt = Number(warmRecord.fetchedAt || warmRecord.createdAt || 0);
      if (now - fetchedAt >= TEAM_REFRESH_MS) {
        refreshTeamPhotoInBackground(identity, warmRecord, img).catch(() => {});
      }
      idbTouch(warmRecord).catch(() => {});
      return;
    }

    img.dataset.teamProxyLoaded = 'loading';
    try { img.removeAttribute('src'); } catch (_) {}

    try {
      const cached = await idbGet(key);
      const now = Date.now();
      const cacheAge = cached ? now - Number(cached.touchedAt || cached.createdAt || 0) : Infinity;

      if (cached?.blob instanceof Blob && cached.blob.size && cacheAge < MAX_AGE_MS) {
        teamDiskMemory.set(key, cached);
        img.src = toObjectUrl(cached.blob, teamMemory, key);
        img.dataset.teamProxyLoaded = '1';
        img.dataset.mediaCache = 'disk';
        img.parentElement?.classList.remove('photo-error');
        ensureTeamPhotoLayout(img);
        idbTouch(cached).catch(() => {});

        const fetchedAt = Number(cached.fetchedAt || cached.createdAt || 0);
        if (now - fetchedAt >= TEAM_REFRESH_MS) {
          refreshTeamPhotoInBackground(identity, cached, img).catch(() => {});
        }
        return;
      }

      const blob = await fetchTeamPhotoBlob(identity.teamName, identity.game);
      await idbPut(key, blob, 'team', {
        sourceUrl: identity.photoUrl || '',
        fetchedAt: Date.now()
      });
      img.src = toObjectUrl(blob, teamMemory, key);
      img.dataset.teamProxyLoaded = '1';
      img.dataset.mediaCache = 'network';
      img.parentElement?.classList.remove('photo-error');
      ensureTeamPhotoLayout(img);
    } catch (error) {
      console.warn('Persistent team photo load failed:', identity?.teamName || '', error?.message || error);
      img.dataset.teamProxyLoaded = 'error';
      img.parentElement?.classList.add('photo-error');
    }
  }

  async function warmTeamCacheFromDisk() {
    if (teamWarmReady) return true;
    if (teamWarmPromise) return teamWarmPromise;

    teamWarmPromise = (async () => {
      const db = await openDb();
      if (!db) return false;
      const now = Date.now();
      await new Promise(resolve => {
        let tx;
        try { tx = db.transaction(STORE, 'readonly'); }
        catch (_) { resolve(); return; }
        const req = tx.objectStore(STORE).openCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) { resolve(); return; }
          const record = cursor.value;
          const key = String(record?.key || cursor.key || '');
          if ((record?.kind === 'team' || key.startsWith('team:')) && validTeamRecord(record, now)) {
            teamDiskMemory.set(key, record);
          }
          cursor.continue();
        };
        req.onerror = () => resolve();
        tx.onabort = () => resolve();
      });
      teamWarmReady = true;
      return true;
    })();

    try { return await teamWarmPromise; }
    finally { teamWarmPromise = null; }
  }

  async function cleanup() {
    const storageKey = 'royalMediaCacheCleanupAt';
    const last = Number(localStorage.getItem(storageKey) || 0);
    if (Date.now() - last < CLEANUP_INTERVAL_MS) return;
    localStorage.setItem(storageKey, String(Date.now()));
    const db = await openDb();
    if (!db) return;
    const records = await new Promise(resolve => {
      const out = [];
      let tx;
      try { tx = db.transaction(STORE, 'readonly'); }
      catch (_) { resolve(out); return; }
      const req = tx.objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) { resolve(out); return; }
        out.push({ key: cursor.key, touchedAt: Number(cursor.value?.touchedAt || cursor.value?.createdAt || 0) });
        cursor.continue();
      };
      req.onerror = () => resolve(out);
    });
    const stale = records.filter(r => Date.now() - r.touchedAt > MAX_AGE_MS).map(r => r.key);
    const keepSorted = records.filter(r => !stale.includes(r.key)).sort((a,b) => b.touchedAt - a.touchedAt);
    keepSorted.slice(MAX_RECORDS).forEach(r => stale.push(r.key));
    if (!stale.length) return;
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      [...new Set(stale)].forEach(key => {
        store.delete(key);
        teamDiskMemory.delete(key);
        const old = teamMemory.get(key);
        if (old && old.startsWith('blob:')) {
          try { URL.revokeObjectURL(old); } catch (_) {}
        }
        teamMemory.delete(key);
      });
    } catch (_) {}
  }

  // Replace the session-only media layer with the persistent cache while preserving the same global API.
  loadAvatarImage = persistentLoadAvatar;
  setupAvatarLoading = persistentSetupAvatarLoading;
  mediaV0517LoadTeamPhoto = persistentLoadTeamPhoto;

  // Start a disk-only record warm immediately. This reads existing IndexedDB records only;
  // it does not create object URLs for every team and never starts network requests.
  warmTeamCacheFromDisk().catch(() => {});

  // Repeat after snapshot load in case IndexedDB was temporarily unavailable during startup.
  if (typeof loadSnapshot === 'function') {
    const nativeLoadSnapshot = loadSnapshot;
    loadSnapshot = async function loadSnapshotWithMediaDiskWarm(...args) {
      const result = await nativeLoadSnapshot.apply(this, args);
      warmTeamCacheFromDisk().catch(() => {});
      return result;
    };
  }

  setTimeout(() => cleanup().catch(() => {}), 1500);
  window.RoyalPersistentMediaCache = {
    version: VERSION,
    dbName: DB_NAME,
    concurrency: CONCURRENCY,
    teamRefreshMs: TEAM_REFRESH_MS,
    setup: persistentSetupAvatarLoading,
    loadTeamPhoto: persistentLoadTeamPhoto,
    warmTeamCacheFromDisk,
    get teamDiskEntries() { return teamDiskMemory.size; },
    get teamObjectUrls() { return teamMemory.size; },
    cleanup
  };
  window.__ROYAL_MEDIA_CACHE_VERSION__ = VERSION;
})();