/* Royal CRM Mini App v0.6.1 — private randomized background playlist */
(() => {
  'use strict';
  if (String(window.__ROYAL_BUILD__ || '') !== '0.6.1') return;
  if (window.__ROYAL_MUSIC_PLAYLIST_V061__) return;

  const VERSION = '0.6.1-playlist.1';
  const TRACKS = [
    'background-v0600',
    'music-v061-02',
    'music-v061-03',
    'music-v061-04',
    'music-v061-05',
    'music-v061-06'
  ];
  const objectUrls = new Map();
  const pending = new Map();
  let bag = [];
  let currentAsset = '';
  let transition = null;
  let installed = false;

  const clean = value => String(value == null ? '' : value).trim();

  function randomIndex(max) {
    if (max <= 1) return 0;
    try {
      if (window.crypto?.getRandomValues) {
        const data = new Uint32Array(1);
        window.crypto.getRandomValues(data);
        return Number(data[0] % max);
      }
    } catch (_) {}
    return Math.floor(Math.random() * max);
  }

  function refillBag(avoid='') {
    const list = TRACKS.slice();
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = randomIndex(i + 1);
      [list[i], list[j]] = [list[j], list[i]];
    }
    if (avoid && list.length > 1 && list[0] === avoid) {
      const swap = 1 + randomIndex(list.length - 1);
      [list[0], list[swap]] = [list[swap], list[0]];
    }
    bag = list;
  }

  function nextAsset() {
    if (!bag.length) refillBag(currentAsset);
    const next = bag.shift() || TRACKS[0];
    currentAsset = next;
    return next;
  }

  function apiBase() {
    try { return clean(typeof API_URL === 'undefined' ? '' : API_URL); }
    catch (_) { return ''; }
  }

  function session() {
    try { return clean(typeof sessionToken === 'undefined' ? '' : sessionToken); }
    catch (_) { return ''; }
  }

  async function loadAsset(asset) {
    const key = clean(asset);
    if (!TRACKS.includes(key)) throw new Error('PROJECT_MEDIA_UNKNOWN');
    if (objectUrls.has(key)) return objectUrls.get(key);
    if (pending.has(key)) return pending.get(key);
    const token = session();
    const api = apiBase();
    if (!token || !api) throw new Error('PROJECT_MEDIA_SESSION_MISSING');

    const task = (async () => {
      const response = await fetch(`${api}/project-mayak-media?asset=${encodeURIComponent(key)}`, {
        method:'GET', mode:'cors', cache:'no-store',
        headers:{ Authorization:`Bearer ${token}` }
      });
      if (!response.ok) throw new Error(`PROJECT_MEDIA_HTTP_${response.status}`);
      const blob = await response.blob();
      if (!(blob instanceof Blob) || !blob.size || !String(blob.type || '').startsWith('audio/')) {
        throw new Error('PROJECT_MEDIA_INVALID');
      }
      const url = URL.createObjectURL(blob);
      objectUrls.set(key, url);
      return url;
    })().finally(() => {
      if (pending.get(key) === task) pending.delete(key);
    });
    pending.set(key, task);
    return task;
  }

  async function choosePlayable(maxAttempts = TRACKS.length) {
    let lastError = null;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const asset = nextAsset();
      try { return { asset, url: await loadAsset(asset) }; }
      catch (error) {
        lastError = error;
        console.warn('v0.6.1 playlist track unavailable:', asset, error?.message || error);
      }
    }
    throw lastError || new Error('PLAYLIST_EMPTY');
  }

  function audioNode() {
    return document.getElementById('royalBackgroundMusic') || document.querySelector('audio[data-royal-background-audio="1"]');
  }

  async function advance(fromEnded = false) {
    const audio = audioNode();
    if (!audio || transition) return transition || false;
    transition = (async () => {
      const previous = currentAsset;
      const selected = await choosePlayable();
      if (!audio.isConnected) return false;
      audio.loop = false;
      audio.src = selected.url;
      audio.dataset.royalPlaylistAsset = selected.asset;
      try { audio.load?.(); } catch (_) {}
      try {
        const result = audio.play();
        if (result && typeof result.then === 'function') await result;
        return true;
      } catch (error) {
        console.warn('v0.6.1 playlist advance failed:', error?.message || error);
        if (fromEnded && selected.asset !== previous) {
          window.setTimeout(() => { advance(true).catch(() => {}); }, 500);
        }
        return false;
      }
    })().finally(() => { transition = null; });
    return transition;
  }

  function install() {
    if (installed) return true;
    const app = window.RoyalAppV0600;
    const audio = audioNode();
    if (!app?.fetchProtectedMediaObjectUrl || !audio) return false;
    installed = true;

    const nativeFetchProtected = app.fetchProtectedMediaObjectUrl.bind(app);
    const nativeRelease = typeof app.releaseProtectedMedia === 'function'
      ? app.releaseProtectedMedia.bind(app) : null;

    app.fetchProtectedMediaObjectUrl = async asset => {
      if (clean(asset) !== 'background-v0600') return nativeFetchProtected(asset);
      if (!currentAsset) nextAsset();
      try { return await loadAsset(currentAsset); }
      catch (_) {
        const selected = await choosePlayable();
        return selected.url;
      }
    };

    app.releaseProtectedMedia = asset => {
      const key = clean(asset);
      if (!key || key === 'background-v0600') {
        objectUrls.forEach(url => { try { URL.revokeObjectURL(url); } catch (_) {} });
        objectUrls.clear();
        pending.clear();
      }
      return nativeRelease ? nativeRelease(asset) : undefined;
    };

    audio.loop = false;
    audio.addEventListener('ended', () => { advance(true).catch(() => {}); });
    audio.addEventListener('error', () => {
      if (!audio.src || audio.paused) return;
      window.setTimeout(() => { advance(false).catch(() => {}); }, 450);
    });
    return true;
  }

  [0, 40, 120, 350, 800, 1600].forEach(delay => {
    window.setTimeout(() => { if (!installed) install(); }, delay);
  });
  window.addEventListener('royal:auth-ready', () => { install(); });

  window.__ROYAL_MUSIC_PLAYLIST_V061__ = VERSION;
  window.RoyalMusicPlaylistV061 = {
    version:VERSION,
    tracks:TRACKS.slice(),
    current:() => currentAsset,
    next:() => advance(false)
  };
})();
