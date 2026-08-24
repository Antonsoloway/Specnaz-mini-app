/* Royal CRM Mini App v0.6.1 — admin team media stability + ghost-tap guard */
(() => {
  'use strict';
  if (String(window.__ROYAL_BUILD__ || '') !== '0.6.1') return;
  if (window.__ROYAL_ADMIN_TEAM_STABILITY_V061__) return;

  const VERSION = '0.6.1-admin-team-stability.1';
  const EDIT_SHIELD_MS = 850;
  const stable = new Map();
  const pending = new Map();
  const retryAt = new Map();
  let scheduled = 0;

  const clean = value => String(value == null ? '' : value).trim();
  const normText = value => clean(value).toLocaleLowerCase('ru-RU').replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/giu, ' ').replace(/\s+/g, ' ').trim();
  function game(value) {
    const raw = clean(value);
    const low = raw.toLocaleLowerCase('ru-RU');
    if (low === 'рм' || low.includes('royal match')) return 'Royal Match';
    if (low === 'рк' || low.includes('royal kingdom')) return 'Royal Kingdom';
    return raw;
  }
  const keyFor = (name, teamGame) => `${normText(name)}\n${normText(game(teamGame))}`;

  function identity(img) {
    const name = clean(img?.dataset?.teamName);
    const teamGame = game(img?.dataset?.teamGame);
    if (!name || !teamGame) return null;
    return { name, game:teamGame, key:keyFor(name, teamGame) };
  }
  function teamImages(root=document) {
    const selector = 'img[data-admin-media-kind="team"][data-team-name][data-team-game]';
    const out = [];
    if (root?.matches?.(selector)) out.push(root);
    root?.querySelectorAll?.(selector)?.forEach(img => out.push(img));
    return out;
  }
  function reveal(img) {
    img?.closest?.('.team-photo-box')?.classList.remove('photo-error');
    img?.closest?.('.royal-admin-team-thumbnail')?.classList.remove('fallback');
  }
  function visibleUses(url) {
    if (!url) return false;
    return [...document.images].some(img => clean(img.currentSrc || img.src) === url);
  }
  function retire(url, delay=60000) {
    if (!url || !url.startsWith('blob:')) return;
    window.setTimeout(() => {
      if (visibleUses(url)) { retire(url, 30000); return; }
      try { URL.revokeObjectURL(url); } catch (_) {}
    }, delay);
  }
  function storeBlob(id, blob, source='network') {
    if (!id?.key || !(blob instanceof Blob) || !blob.size || !String(blob.type || '').startsWith('image/')) return null;
    const previous = stable.get(id.key);
    const url = URL.createObjectURL(blob);
    const entry = { url, blob, source, at:Date.now() };
    stable.set(id.key, entry);
    if (previous?.url && previous.url !== url) retire(previous.url);
    return entry;
  }
  function applyStable(img, id, entry) {
    if (!img?.isConnected || !id || !entry?.url) return false;
    const current = identity(img);
    if (!current || current.key !== id.key) return false;
    img.dataset.v061TeamPhotoUrl = entry.url;
    img.dataset.v061AdminStablePhoto = VERSION;
    img.dataset.adminMediaLoaded = '1';
    img.dataset.adminMediaCache = 'v061-admin-stable';
    img.src = entry.url;
    reveal(img);
    return true;
  }
  function applyStableToIdentity(id, entry) {
    teamImages(document).forEach(img => {
      const current = identity(img);
      if (current?.key === id.key) applyStable(img, current, entry);
    });
  }
  function authToken() {
    try { return clean(typeof sessionToken !== 'undefined' ? sessionToken : ''); }
    catch (_) { return ''; }
  }
  function apiBase() {
    try { return clean(typeof API_URL !== 'undefined' ? API_URL : ''); }
    catch (_) { return ''; }
  }
  async function fetchCurrent(id) {
    const token = authToken();
    const api = apiBase();
    if (!id || !token || !api) throw new Error('ADMIN_TEAM_PHOTO_AUTH_MISSING');
    const url = new URL(`${api}/admin-team-photo`);
    url.searchParams.set('team', id.name);
    url.searchParams.set('game', id.game);
    const response = await fetch(url.toString(), {
      method:'GET', mode:'cors', cache:'no-store', headers:{ Authorization:`Bearer ${token}` }
    });
    if (!response.ok) throw new Error(`ADMIN_TEAM_PHOTO_HTTP_${response.status}`);
    const blob = await response.blob();
    if (!(blob instanceof Blob) || !blob.size || !String(blob.type || '').startsWith('image/')) {
      throw new Error('ADMIN_TEAM_PHOTO_INVALID');
    }
    return blob;
  }
  async function recover(img, force=false) {
    if (!img?.isConnected) return false;
    const id = identity(img);
    if (!id) return false;
    const fallback = stable.get(id.key);
    if (fallback && (!img.naturalWidth || img.closest('.team-photo-box')?.classList.contains('photo-error') || img.closest('.royal-admin-team-thumbnail')?.classList.contains('fallback'))) {
      applyStable(img, id, fallback);
    }
    const now = Date.now();
    if (!force && now < Number(retryAt.get(id.key) || 0)) return !!fallback;
    retryAt.set(id.key, now + 2500);
    let task = pending.get(id.key);
    if (!task || force) {
      task = fetchCurrent(id).then(blob => storeBlob(id, blob, 'authenticated-network'));
      if (!force) pending.set(id.key, task);
    }
    try {
      const entry = await task;
      if (entry) applyStableToIdentity(id, entry);
      return !!entry;
    } finally {
      if (!force && pending.get(id.key) === task) pending.delete(id.key);
    }
  }
  async function cloneLoaded(img) {
    if (!img?.isConnected || !img.naturalWidth) return;
    const id = identity(img);
    if (!id) return;
    reveal(img);
    const src = clean(img.currentSrc || img.src);
    const existing = stable.get(id.key);
    if (!src || existing?.url === src || img.dataset.v061StableCloneBusy === '1') return;
    img.dataset.v061StableCloneBusy = '1';
    try {
      const response = await fetch(src);
      const blob = await response.blob();
      const entry = storeBlob(id, blob, 'cloned-loaded-image');
      if (entry && img.isConnected) applyStable(img, id, entry);
    } catch (_) {
      reveal(img);
    } finally {
      delete img.dataset.v061StableCloneBusy;
    }
  }
  function decorateImage(img) {
    if (!img?.isConnected) return;
    const id = identity(img);
    if (!id) return;
    const cached = stable.get(id.key);
    if (cached && (!img.naturalWidth || img.closest('.team-photo-box')?.classList.contains('photo-error') || img.closest('.royal-admin-team-thumbnail')?.classList.contains('fallback'))) {
      applyStable(img, id, cached);
    }
    if (img.dataset.v061AdminTeamStableEvents !== VERSION) {
      img.dataset.v061AdminTeamStableEvents = VERSION;
      img.addEventListener('load', () => { reveal(img); cloneLoaded(img); });
      img.addEventListener('error', () => {
        const current = identity(img);
        const fallback = current ? stable.get(current.key) : null;
        window.setTimeout(() => {
          if (!img.isConnected) return;
          if (fallback) applyStable(img, current, fallback);
          else recover(img, true).catch(() => {});
        }, 0);
      });
    }
    if (!img.naturalWidth && img.dataset.v061AdminStableBootstrap !== VERSION) {
      img.dataset.v061AdminStableBootstrap = VERSION;
      window.setTimeout(() => {
        if (!img.isConnected || img.naturalWidth) return;
        recover(img).catch(() => {});
      }, 280);
    }
  }

  function shieldEditButton(shell) {
    if (!shell?.isConnected || !shell.classList.contains('royal-admin-team-detail-shell')) return;
    let until = Number(shell.dataset.v061TeamEditShieldUntil || 0);
    if (!until) {
      until = Date.now() + EDIT_SHIELD_MS;
      shell.dataset.v061TeamEditShieldUntil = String(until);
    }
    const button = shell.querySelector('[data-admin-edit-team="1"]');
    if (!button || button.dataset.v061TeamEditShield === VERSION) return;
    button.dataset.v061TeamEditShield = VERSION;
    button.disabled = true;
    button.style.pointerEvents = 'none';
    const release = () => {
      if (!button.isConnected) return;
      const remaining = Number(shell.dataset.v061TeamEditShieldUntil || 0) - Date.now();
      if (remaining > 0) { window.setTimeout(release, Math.min(remaining + 20, 300)); return; }
      if (button.dataset.v061TeamEditShield === VERSION) {
        button.disabled = false;
        button.style.pointerEvents = '';
        delete button.dataset.v061TeamEditShield;
      }
    };
    window.setTimeout(release, Math.max(20, until - Date.now() + 20));
  }

  function decorate(root=document) {
    teamImages(root).forEach(decorateImage);
    const shells = [];
    if (root?.matches?.('.royal-admin-team-detail-shell')) shells.push(root);
    root?.querySelectorAll?.('.royal-admin-team-detail-shell')?.forEach(shell => shells.push(shell));
    shells.forEach(shell => {
      shieldEditButton(shell);
      teamImages(shell).forEach(decorateImage);
    });
  }
  function schedule(root=document) {
    if (scheduled) return;
    scheduled = window.requestAnimationFrame(() => {
      scheduled = 0;
      decorate(root?.isConnected === false ? document : root);
    });
  }

  const observer = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes || []) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.('.royal-admin-team-detail-shell,[data-admin-team="1"],img[data-admin-media-kind="team"]') ||
            node.querySelector?.('.royal-admin-team-detail-shell,[data-admin-team="1"],img[data-admin-media-kind="team"]')) {
          schedule(node);
          return;
        }
      }
    }
  });
  observer.observe(document.body, { childList:true, subtree:true });

  [0,120,350,900,1800].forEach(delay => window.setTimeout(() => schedule(document), delay));
  window.addEventListener('pageshow', () => schedule(document));
  window.addEventListener('royal:snapshot-ready', () => schedule(document));
  window.addEventListener('pagehide', () => {
    stable.forEach(entry => { try { URL.revokeObjectURL(entry?.url); } catch (_) {} });
    stable.clear();
  }, { once:true });

  decorate(document);
  window.__ROYAL_ADMIN_TEAM_STABILITY_V061__ = {
    version:VERSION,
    refresh:() => schedule(document),
    forceRefresh() { teamImages(document).forEach(img => recover(img, true).catch(() => {})); }
  };
})();
