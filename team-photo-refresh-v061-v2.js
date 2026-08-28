/* Royal CRM Mini App — v0.6.1 team photo replacement/cache bridge, symbol-safe identity v2 */
(() => {
  'use strict';
  if (String(window.__ROYAL_BUILD__ || '') !== '0.6.1') return;
  if (window.__ROYAL_TEAM_PHOTO_REFRESH_V061_V2__) return;

  const VERSION = '0.6.1-team-photo-refresh.2-symbol-safe';
  const API = String(typeof API_URL !== 'undefined' ? API_URL : 'https://royal-crm-miniapp-api.tropical-spoon.workers.dev');
  const memory = new Map();
  const pending = new Map();
  const generations = new Map();
  const adminTokens = new Map();
  const publicTokens = new Map();
  let adminPatched = false;
  let fetchPatched = false;

  const clean = value => String(value == null ? '' : value).trim();
  const normGame = value => {
    const raw = clean(value);
    const low = raw.toLocaleLowerCase('ru-RU');
    if (low === 'рм' || low.includes('royal match')) return 'Royal Match';
    if (low === 'рк' || low.includes('royal kingdom')) return 'Royal Kingdom';
    return raw;
  };
  const identityText = value => {
    let text = clean(value);
    try { text = text.normalize('NFC'); } catch (_) {}
    return text.toLocaleLowerCase('ru-RU').replace(/\s+/gu, ' ').trim();
  };
  const searchText = value => clean(value).toLocaleLowerCase('ru-RU').replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/giu, ' ').replace(/\s+/g, ' ').trim();
  const baseKey = (name, game) => `v2:${identityText(name)}\n${identityText(normGame(game))}`;

  function session() {
    try { return clean(typeof sessionToken === 'undefined' ? '' : sessionToken); }
    catch (_) { return ''; }
  }

  function publicTeams() {
    try { return Array.isArray(snapshotState?.teams) ? snapshotState.teams : []; }
    catch (_) { return []; }
  }

  function adminTeams() {
    try {
      const current = window.RoyalAdminDataV0600?.current;
      return Array.isArray(current?.adminData?.teams) ? current.adminData.teams : [];
    } catch (_) { return []; }
  }

  function recordFor(mode, name, game) {
    const wantedIdentity = identityText(name);
    const wantedSearch = searchText(name);
    const wantedGame = normGame(game);
    const list = mode === 'admin' ? adminTeams() : publicTeams();
    if (!wantedIdentity) return null;

    const byGame = wantedGame
      ? list.filter(item => normGame(item?.game || item?.games?.[0]) === wantedGame)
      : list;
    const exact = byGame.find(item => identityText(item?.name) === wantedIdentity);
    if (exact) return exact;

    // Never select the first stripped-name match when more than one symbol-
    // distinct team exists. A fuzzy fallback is safe only when unambiguous.
    const fuzzy = byGame.filter(item => searchText(item?.name) === wantedSearch);
    return fuzzy.length === 1 ? fuzzy[0] : null;
  }

  function photoToken(record, mode) {
    const url = clean(record?.photoUrl);
    if (url) {
      if (mode === 'admin') {
        try {
          const parsed = new URL(url, window.location.href);
          const version = clean(parsed.searchParams.get('v'));
          if (version) return `v:${version}`;
        } catch (_) {}
      }
      return `url:${url}`;
    }
    return clean(record?.revision) ? `rev:${record.revision}` : 'none';
  }

  function currentToken(mode, name, game) {
    return photoToken(recordFor(mode, name, game), mode);
  }

  function identityForImage(img) {
    const name = clean(img?.dataset?.teamName);
    const game = normGame(img?.dataset?.teamGame);
    return name && game ? { name, game, key:baseKey(name, game) } : null;
  }

  function sameIdentity(img, identity) {
    const current = identityForImage(img);
    return !!current && current.key === identity.key;
  }

  function modeForImage(img) {
    return img?.dataset?.adminMediaKind === 'team' || !!img?.closest?.('.royal-admin-team-detail-shell,.royal-admin-screen')
      ? 'admin' : 'public';
  }

  function dropMemoryForBase(key) {
    const marker = `|${key}|`;
    for (const [cacheKey, entry] of memory.entries()) {
      if (!cacheKey.includes(marker)) continue;
      memory.delete(cacheKey);
      try { if (entry?.url?.startsWith('blob:')) URL.revokeObjectURL(entry.url); } catch (_) {}
    }
  }

  function generation(key) { return Number(generations.get(key) || 0); }

  function bump(key) {
    generations.set(key, generation(key) + 1);
    dropMemoryForBase(key);
  }

  async function fetchCurrent(mode, identity) {
    const token = session();
    if (!token) throw new Error('TEAM_PHOTO_SESSION_MISSING');
    const url = new URL(`${API}/${mode === 'admin' ? 'admin-team-photo' : 'team-photo'}`);
    url.searchParams.set('team', identity.name);
    url.searchParams.set('game', identity.game);
    const response = await fetch(url.toString(), {
      method:'GET', mode:'cors', cache:'no-store',
      headers:{ Authorization:`Bearer ${token}` }
    });
    if (!response.ok) throw new Error(`TEAM_PHOTO_HTTP_${response.status}`);
    const blob = await response.blob();
    if (!(blob instanceof Blob) || !blob.size || !String(blob.type || '').startsWith('image/')) {
      throw new Error('TEAM_PHOTO_INVALID');
    }
    return blob;
  }

  function apply(img, cacheKey, entry, mode) {
    if (!img?.isConnected || !entry?.url) return false;
    const identity = identityForImage(img);
    if (!identity) return false;
    img.src = entry.url;
    img.dataset.v061TeamPhotoCacheKey = cacheKey;
    img.dataset.v061TeamPhotoUrl = entry.url;
    img.dataset.v061TeamPhotoMode = mode;
    if (mode === 'admin') {
      img.dataset.adminMediaLoaded = '1';
      img.dataset.adminMediaKey = identity.key;
      img.dataset.adminMediaCache = 'v061-symbol-v2';
    } else {
      img.dataset.teamProxyLoaded = '1';
      img.dataset.mediaCache = 'v061-symbol-v2';
    }
    img.closest?.('.team-photo-box')?.classList.remove('photo-error');
    img.closest?.('.royal-admin-team-thumbnail')?.classList.remove('fallback');
    return true;
  }

  async function loadVersioned(img, modeOverride='', force=false) {
    if (!img?.isConnected) return false;
    const identity = identityForImage(img);
    if (!identity) return false;
    const mode = modeOverride || modeForImage(img);
    const token = currentToken(mode, identity.name, identity.game);
    const gen = generation(identity.key);
    const cacheKey = `${mode}|${identity.key}|${token}|g${gen}`;

    if (!force && memory.has(cacheKey)) {
      return apply(img, cacheKey, memory.get(cacheKey), mode);
    }

    let task = pending.get(cacheKey);
    if (!task || force) {
      task = (async () => {
        const blob = await fetchCurrent(mode, identity);
        const url = URL.createObjectURL(blob);
        const old = memory.get(cacheKey);
        memory.set(cacheKey, { url, blob, at:Date.now() });
        if (old?.url && old.url !== url && old.url.startsWith('blob:')) {
          setTimeout(() => { try { URL.revokeObjectURL(old.url); } catch (_) {} }, 1000);
        }
        return memory.get(cacheKey);
      })();
      if (!force) pending.set(cacheKey, task);
    }
    try {
      const entry = await task;
      if (!sameIdentity(img, identity)) return false;
      return apply(img, cacheKey, entry, mode);
    } finally {
      if (!force && pending.get(cacheKey) === task) pending.delete(cacheKey);
    }
  }

  function visibleTeamImages(identity) {
    return [...document.querySelectorAll('img.team-photo[data-team-name],img[data-admin-media-kind="team"][data-team-name]')]
      .filter(img => sameIdentity(img, identity));
  }

  function invalidate(name, game, options={}) {
    const identity = { name:clean(name), game:normGame(game), key:baseKey(name, game) };
    if (!identity.name || !identity.game || !identity.key.trim()) return false;
    bump(identity.key);
    const images = visibleTeamImages(identity);
    images.forEach(img => {
      delete img.dataset.v061TeamPhotoCacheKey;
      delete img.dataset.v061TeamPhotoUrl;
      delete img.dataset.teamProxyLoaded;
      delete img.dataset.adminMediaLoaded;
      const mode = options.mode || modeForImage(img);
      setTimeout(() => loadVersioned(img, mode, true).catch(() => {}), 0);
    });
    return true;
  }

  function publicLoader() {
    const img = document.querySelector('#panel .team-photo-box .team-photo');
    if (!img) return Promise.resolve(false);
    return loadVersioned(img, 'public').catch(error => {
      console.warn('v0.6.1 symbol-safe public team photo refresh failed:', error?.message || error);
      return false;
    });
  }

  function installPublicOverride() {
    try { mediaV0517LoadTeamPhoto = publicLoader; } catch (_) {}
    try { window.mediaV0517LoadTeamPhoto = publicLoader; } catch (_) {}
    try {
      if (window.RoyalPersistentMediaCache) {
        window.RoyalPersistentMediaCache.loadTeamPhoto = publicLoader;
        window.RoyalPersistentMediaCache.invalidateTeam = (name, game) => invalidate(name, game, { mode:'public' });
        window.RoyalPersistentMediaCache.teamPhotoVersion = VERSION;
      }
    } catch (_) {}
  }

  function installAdminOverride() {
    const cache = window.RoyalAdminPersistentMediaV0600;
    if (!cache) return false;
    if (cache.teamPhotoVersion === VERSION) { adminPatched = true; return true; }
    cache.loadTeam = img => loadVersioned(img, 'admin').catch(() => false);
    cache.invalidateTeam = (name, game) => invalidate(name, game, { mode:'admin' });
    cache.teamPhotoVersion = VERSION;
    adminPatched = true;
    document.querySelectorAll('img[data-admin-media-kind="team"][data-team-name]').forEach(img => {
      setTimeout(() => loadVersioned(img, 'admin').catch(() => {}), 0);
    });
    return true;
  }

  function syncTokenMap(mode, map, list) {
    const next = new Map();
    (Array.isArray(list) ? list : []).forEach(record => {
      const name = clean(record?.name);
      const game = normGame(record?.game || record?.games?.[0]);
      if (!name || !game) return;
      const key = baseKey(name, game);
      const token = photoToken(record, mode);
      next.set(key, { token, name, game });
      const previous = map.get(key);
      if (previous && previous !== token) invalidate(name, game, { mode });
    });
    map.clear();
    next.forEach((value, key) => map.set(key, value.token));
  }

  function syncPublicTokens() { syncTokenMap('public', publicTokens, publicTeams()); }

  function syncAdminTokens(payload=null) {
    const list = payload?.adminData?.teams || adminTeams();
    syncTokenMap('admin', adminTokens, list);
  }

  function installFetchObserver() {
    if (fetchPatched || typeof window.fetch !== 'function') return;
    fetchPatched = true;
    const upstream = window.fetch.bind(window);
    window.fetch = async function v061TeamPhotoWriteObserverSymbolSafe(input, init) {
      const raw = typeof input === 'string' ? input : clean(input?.url);
      const method = clean(init?.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();
      let body = null;
      let photoWrite = null;
      if (method === 'POST' && /\/admin-write(?:$|\?)/.test(raw) && init?.body) {
        try { body = JSON.parse(String(init.body)); } catch (_) {}
        if (body && (body.op === 'updateTeam' || body.op === 'createTeam')) {
          const payload = body.payload || {};
          const photo = body.op === 'updateTeam' ? payload?.changes?.photo : payload?.photo;
          if (photo) {
            photoWrite = {
              game:normGame(payload.game),
              oldName:clean(payload.name),
              newName:clean(payload?.changes?.name || payload.name)
            };
          }
        }
      }
      const response = await upstream(input, init);
      if (photoWrite && response?.ok) {
        const identities = [photoWrite.oldName, photoWrite.newName].filter(Boolean);
        [0, 350, 1400].forEach(delay => setTimeout(() => {
          identities.forEach(name => invalidate(name, photoWrite.game));
          installAdminOverride();
        }, delay));
      }
      return response;
    };
  }

  installPublicOverride();
  installFetchObserver();
  syncPublicTokens();

  try {
    window.RoyalAdminDataV0600?.subscribe?.(event => {
      if (event?.type === 'accept' && event?.payload) {
        syncAdminTokens(event.payload);
        installAdminOverride();
      }
    });
  } catch (_) {}

  [0,120,350,900,1800,3500].forEach(delay => setTimeout(() => {
    installPublicOverride();
    installAdminOverride();
    if (delay >= 350) syncAdminTokens();
  }, delay));

  window.addEventListener('royal:snapshot-ready', () => {
    installPublicOverride();
    syncPublicTokens();
  });

  document.addEventListener('load', event => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement)) return;
    const identity = identityForImage(img);
    if (!identity) return;
    const isTeam = img.matches?.('img.team-photo[data-team-name],img[data-admin-media-kind="team"][data-team-name]');
    if (!isTeam) return;
    const ownedUrl = clean(img.dataset.v061TeamPhotoUrl);
    if (ownedUrl && clean(img.src) === ownedUrl) return;
    requestAnimationFrame(() => loadVersioned(img, modeForImage(img)).catch(() => {}));
  }, true);

  if ('MutationObserver' in window) {
    const observer = new MutationObserver(records => {
      const images = [];
      records.forEach(record => {
        for (const node of record.addedNodes || []) {
          if (!(node instanceof Element)) continue;
          if (node.matches?.('img.team-photo[data-team-name],img[data-admin-media-kind="team"][data-team-name]')) images.push(node);
          node.querySelectorAll?.('img.team-photo[data-team-name],img[data-admin-media-kind="team"][data-team-name]').forEach(img => images.push(img));
        }
      });
      if (!images.length) return;
      requestAnimationFrame(() => images.forEach(img => loadVersioned(img, modeForImage(img)).catch(() => {})));
    });
    observer.observe(document.body, { childList:true, subtree:true });
  }

  window.RoyalTeamPhotoRefreshV061 = {
    version:VERSION,
    invalidate,
    refreshVisible() {
      document.querySelectorAll('img.team-photo[data-team-name],img[data-admin-media-kind="team"][data-team-name]').forEach(img => {
        loadVersioned(img, modeForImage(img), true).catch(() => {});
      });
    }
  };
  window.__ROYAL_TEAM_PHOTO_REFRESH_V061__ = VERSION;
  window.__ROYAL_TEAM_PHOTO_REFRESH_V061_V2__ = VERSION;
})();
