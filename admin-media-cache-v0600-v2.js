/* Royal CRM Mini App — v0.6 admin persistent media v2
 * ONE cache with normal mode:
 *   IndexedDB royal-crm-media-cache / images
 *   avatars: avatar:<avatarFileId> with tg-id migration fallback
 *   teams:   team:<normalized name>\n<normalized game>
 */
(() => {
  const VERSION = '0.6.0-admin-media-cache.2';
  const DB_NAME = 'royal-crm-media-cache';
  const DB_VERSION = 1;
  const STORE = 'images';
  const MAX_AGE_MS = 45 * 24 * 60 * 60 * 1000;
  const TEAM_REFRESH_MS = 30 * 60 * 1000;
  const CONCURRENCY = 3;
  const memory = new Map();
  const pending = new Map();
  const queued = new WeakSet();
  const queue = [];
  let active = 0;
  let dbPromise = null;
  let observer = null;
  let timer = 0;
  let decorating = false;

  const nativeSetup = typeof setupAvatarLoading === 'function' ? setupAvatarLoading : null;

  const clean = value => String(value == null ? '' : value).trim();
  function telegramId(value) {
    const match = clean(value).replace(/\.0$/, '').match(/\d{5,20}/);
    return match ? match[0] : '';
  }
  function normGame(value) {
    const raw = clean(value);
    const low = raw.toLocaleLowerCase('ru-RU');
    if (low === 'рм' || low.includes('royal match')) return 'Royal Match';
    if (low === 'рк' || low.includes('royal kingdom')) return 'Royal Kingdom';
    return raw;
  }
  function normText(value) {
    return clean(value).toLocaleLowerCase('ru-RU').replace(/ё/g, 'е')
      .replace(/[^a-zа-я0-9]+/giu, ' ').replace(/\s+/g, ' ').trim();
  }
  function teamKey(name, game) {
    const n = normText(name);
    const g = normText(normGame(game));
    return n ? `team:${n}\n${g}` : '';
  }

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
          const store = db.createObjectStore(STORE, { keyPath:'key' });
          store.createIndex('touchedAt', 'touchedAt', { unique:false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    });
    return dbPromise;
  }

  async function getRecord(key) {
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

  async function putRecord(key, blob, kind, extra={}) {
    if (!key || !(blob instanceof Blob) || !blob.size) return false;
    const db = await openDb();
    if (!db) return false;
    const now = Date.now();
    const record = {
      key, blob, kind:clean(kind), size:blob.size,
      createdAt:Number(extra.createdAt || now), touchedAt:now,
      fetchedAt:Number(extra.fetchedAt || now), ...extra
    };
    return new Promise(resolve => {
      let tx;
      try { tx = db.transaction(STORE, 'readwrite'); }
      catch (_) { resolve(false); return; }
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    });
  }

  async function touch(record) {
    if (!record?.key) return;
    const db = await openDb();
    if (!db) return;
    try {
      const tx = db.transaction(STORE, 'readwrite');
      record.touchedAt = Date.now();
      tx.objectStore(STORE).put(record);
    } catch (_) {}
  }

  function valid(record) {
    return !!(record?.blob instanceof Blob && record.blob.size &&
      Date.now() - Number(record.touchedAt || record.createdAt || 0) < MAX_AGE_MS);
  }

  function objectUrl(key, blob) {
    if (memory.has(key)) return memory.get(key);
    const url = URL.createObjectURL(blob);
    memory.set(key, url);
    return url;
  }

  function apply(img, key, blob, source) {
    if (!img?.isConnected) return;
    img.src = objectUrl(key, blob);
    img.dataset.adminMediaLoaded = '1';
    img.dataset.adminMediaKey = key;
    img.dataset.adminMediaCache = source;
  }

  async function fetchImage(url) {
    const response = await fetch(url, {
      method:'GET', mode:'cors', cache:'no-store',
      headers:{ Authorization:`Bearer ${sessionToken}` }
    });
    if (!response.ok) throw new Error(`media ${response.status}`);
    const blob = await response.blob();
    if (!(blob instanceof Blob) || !blob.size || !blob.type.startsWith('image/')) {
      throw new Error('invalid image blob');
    }
    return blob;
  }

  function publicParticipant(id) {
    const list = Array.isArray(snapshotState?.participants) ? snapshotState.participants : [];
    return list.find(item => telegramId(item?.telegramId) === id) || null;
  }

  async function avatarIdentity(id) {
    const started = Date.now();
    while (!snapshotState && Date.now() - started < 5000) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const participant = publicParticipant(id);
    const fileId = clean(participant?.avatarFileId);
    return {
      id, fileId,
      primary:fileId ? `avatar:${fileId}` : `avatar:tg-${id}`,
      fallback:`avatar:tg-${id}`
    };
  }

  async function loadAvatar(img) {
    const id = telegramId(img?.dataset?.telegramId || img?.closest?.('[data-telegram-id]')?.dataset?.telegramId);
    if (!id || !sessionToken || !img?.isConnected) return;
    const identity = await avatarIdentity(id);
    const keys = [...new Set([identity.primary, identity.fallback])];
    if (img.dataset.adminMediaLoaded === '1' && img.dataset.adminMediaKey === identity.primary) return;

    for (const key of keys) {
      if (memory.has(key)) {
        img.src = memory.get(key);
        img.dataset.adminMediaLoaded = '1';
        img.dataset.adminMediaKey = identity.primary;
        img.dataset.adminMediaCache = 'memory';
        return;
      }
      const cached = await getRecord(key);
      if (!valid(cached)) continue;
      apply(img, identity.primary, cached.blob, key === identity.primary ? 'disk' : 'disk-migrated');
      touch(cached).catch(() => {});
      if (identity.fileId && key !== identity.primary) {
        await putRecord(identity.primary, cached.blob, 'avatar', {
          telegramId:id, avatarFileId:identity.fileId, fetchedAt:Number(cached.fetchedAt || Date.now())
        });
      }
      return;
    }

    const taskKey = `avatar-fetch:${identity.primary}`;
    let task = pending.get(taskKey);
    if (!task) {
      task = (async () => {
        const blob = await fetchImage(`${API_URL}/avatar?telegramId=${encodeURIComponent(id)}`);
        await putRecord(identity.primary, blob, 'avatar', {
          telegramId:id, avatarFileId:identity.fileId || '', fetchedAt:Date.now()
        });
        if (identity.primary !== identity.fallback) {
          await putRecord(identity.fallback, blob, 'avatar', { telegramId:id, fetchedAt:Date.now() });
        }
        return blob;
      })();
      pending.set(taskKey, task);
    }
    try { apply(img, identity.primary, await task, 'network'); }
    finally { if (pending.get(taskKey) === task) pending.delete(taskKey); }
  }

  async function loadTeam(img) {
    const name = clean(img?.dataset?.teamName);
    const game = normGame(img?.dataset?.teamGame);
    if (!name || !game || !sessionToken || !img?.isConnected) return;
    const key = teamKey(name, game);
    if (!key) return;
    if (img.dataset.adminMediaLoaded === '1' && img.dataset.adminMediaKey === key) return;

    if (memory.has(key)) {
      img.src = memory.get(key);
      img.dataset.adminMediaLoaded = '1';
      img.dataset.adminMediaKey = key;
      img.dataset.adminMediaCache = 'memory';
      return;
    }

    const cached = await getRecord(key);
    if (valid(cached)) {
      apply(img, key, cached.blob, 'disk');
      touch(cached).catch(() => {});
      const fetchedAt = Number(cached.fetchedAt || cached.createdAt || 0);
      if (Date.now() - fetchedAt >= TEAM_REFRESH_MS) refreshTeam(name, game, key).catch(() => {});
      return;
    }

    const taskKey = `team-fetch:${key}`;
    let task = pending.get(taskKey);
    if (!task) {
      task = (async () => {
        const url = new URL(`${API_URL}/admin-team-photo`);
        url.searchParams.set('team', name);
        url.searchParams.set('game', game);
        const blob = await fetchImage(url.toString());
        await putRecord(key, blob, 'team', { teamName:name, game, fetchedAt:Date.now() });
        return blob;
      })();
      pending.set(taskKey, task);
    }
    try { apply(img, key, await task, 'network'); }
    finally { if (pending.get(taskKey) === task) pending.delete(taskKey); }
  }

  async function refreshTeam(name, game, key) {
    const taskKey = `team-refresh:${key}`;
    if (pending.has(taskKey)) return;
    const task = (async () => {
      try {
        const url = new URL(`${API_URL}/admin-team-photo`);
        url.searchParams.set('team', name);
        url.searchParams.set('game', game);
        const blob = await fetchImage(url.toString());
        await putRecord(key, blob, 'team', { teamName:name, game, fetchedAt:Date.now() });
      } catch (_) {}
    })();
    pending.set(taskKey, task);
    try { await task; } finally { pending.delete(taskKey); }
  }

  function participantId(record) {
    const direct = telegramId(record?.dataset?.telegramId);
    if (direct) return direct;
    const meta = clean(record?.querySelector('summary .royal-admin-summary-main small')?.textContent);
    return telegramId(meta);
  }
  function firstLetter(value) {
    const text = clean(value).replace(/^@/, '');
    return text ? Array.from(text)[0].toUpperCase() : '👤';
  }

  function ensureAvatar(record) {
    const id = participantId(record);
    const summary = record?.querySelector('summary');
    const main = summary?.querySelector('.royal-admin-summary-main');
    if (!id || !summary || !main) return null;
    record.dataset.telegramId = id;
    let wrap = summary.querySelector('.royal-admin-participant-avatar');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'person-avatar-wrap small royal-admin-participant-avatar fallback';
      wrap.innerHTML = `<span>${firstLetter(main.querySelector('strong')?.textContent)}</span>`;
      summary.insertBefore(wrap, main);
    }
    wrap.dataset.telegramId = id;
    let img = wrap.querySelector('img.person-avatar');
    if (!img) {
      img = document.createElement('img');
      img.className = 'person-avatar'; img.alt = '';
      wrap.appendChild(img);
    }
    img.dataset.adminMediaKind = 'avatar';
    img.dataset.telegramId = id;
    if (img.dataset.adminMediaEvents !== '1') {
      img.dataset.adminMediaEvents = '1';
      img.addEventListener('load', () => wrap.classList.remove('fallback'));
      img.addEventListener('error', () => wrap.classList.add('fallback'));
    }
    record.dataset.adminAvatarEnhanced = '1';
    return img;
  }

  function teamIdentity(record) {
    const name = clean(record?.querySelector('summary .royal-admin-summary-main strong')?.textContent);
    const meta = clean(record?.querySelector('summary .royal-admin-summary-main small')?.textContent);
    return { name, game:normGame(meta) };
  }

  function ensureTeam(record) {
    const identity = teamIdentity(record);
    const summary = record?.querySelector('summary');
    const main = summary?.querySelector('.royal-admin-summary-main');
    if (!identity.name || !identity.game || !summary || !main) return null;
    record.dataset.adminTeamName = identity.name;
    record.dataset.adminTeamFullGame = identity.game;
    let wrap = summary.querySelector('.royal-admin-team-thumbnail');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'royal-admin-team-thumbnail fallback';
      wrap.innerHTML = '<span>🏰</span>';
      summary.insertBefore(wrap, main);
    }
    let img = wrap.querySelector('img');
    if (!img) { img = document.createElement('img'); img.alt = ''; wrap.appendChild(img); }
    img.dataset.adminMediaKind = 'team';
    img.dataset.teamName = identity.name;
    img.dataset.teamGame = identity.game;
    if (img.dataset.adminMediaEvents !== '1') {
      img.dataset.adminMediaEvents = '1';
      img.addEventListener('load', () => wrap.classList.remove('fallback'));
      img.addEventListener('error', () => wrap.classList.add('fallback'));
    }
    return img;
  }

  function enqueue(img) {
    if (!img?.isConnected || queued.has(img) || img.dataset.adminMediaLoading === '1') return;
    queued.add(img); queue.push(img); pump();
  }
  function pump() {
    while (active < CONCURRENCY && queue.length) {
      const img = queue.shift();
      if (img) queued.delete(img);
      if (!img?.isConnected) continue;
      img.dataset.adminMediaLoading = '1'; active += 1;
      const job = img.dataset.adminMediaKind === 'team' ? loadTeam(img) : loadAvatar(img);
      Promise.resolve(job).catch(() => {}).finally(() => {
        delete img.dataset.adminMediaLoading; active -= 1; pump();
      });
    }
  }
  function observe(img) {
    if (!img?.isConnected) return;
    if (!('IntersectionObserver' in window)) { enqueue(img); return; }
    if (!observer) {
      observer = new IntersectionObserver(entries => entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target); enqueue(entry.target);
      }), { rootMargin:'360px 0px' });
    }
    observer.observe(img);
  }

  function decorate() {
    timer = 0;
    if (decorating) return;
    const screen = document.querySelector('.royal-admin-screen');
    if (!screen) return;
    decorating = true;
    try {
      screen.querySelectorAll('[data-admin-participant="1"]').forEach(record => {
        const img = ensureAvatar(record); if (img) observe(img);
      });
      screen.querySelectorAll('[data-admin-team="1"]').forEach(record => {
        const img = ensureTeam(record); if (img) observe(img);
      });
      screen.dataset.adminMediaCache = VERSION;
    } finally { decorating = false; }
  }
  function schedule(delay=0) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(decorate, delay);
  }

  function routedSetup(root) {
    const node = root instanceof Element ? root : null;
    const isAdmin = !!(node?.matches?.('.royal-admin-screen') || node?.querySelector?.('.royal-admin-screen'));
    if (isAdmin) { schedule(0); return; }
    if (typeof nativeSetup === 'function') return nativeSetup(root);
  }
  try { setupAvatarLoading = routedSetup; } catch (_) {}
  try { window.setupAvatarLoading = routedSetup; } catch (_) {}

  const style = document.createElement('style');
  style.dataset.adminMediaCacheV0600V2 = '1';
  style.textContent = `
    .royal-admin-team-thumbnail{position:relative;flex:0 0 54px;width:54px;height:54px;overflow:hidden;border-radius:13px;background:#132633;border:1px solid #2b4758;display:grid;place-items:center}
    .royal-admin-team-thumbnail>span{font-size:28px;line-height:1}
    .royal-admin-team-thumbnail>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
    .royal-admin-team-thumbnail.fallback>img{display:none}
    .royal-admin-record summary .royal-admin-team-thumbnail+.royal-admin-summary-main{min-width:0}
  `;
  document.head.appendChild(style);

  const mutation = new MutationObserver(records => {
    if (decorating) return;
    if (records.some(record => [...record.addedNodes].some(node =>
      node instanceof Element && (node.matches?.('.royal-admin-screen,[data-admin-participant="1"],[data-admin-team="1"]') || node.querySelector?.('.royal-admin-screen,[data-admin-participant="1"],[data-admin-team="1"]'))
    ))) schedule(0);
  });
  mutation.observe(document.body, { childList:true, subtree:true });
  document.addEventListener('click', event => {
    if (event.target?.closest?.('[data-admin-tab],[data-admin-refresh],[data-admin-participant-filter],[data-admin-team-game-filter],[data-admin-team-status-filter]')) schedule(0);
  }, true);

  schedule(0); setTimeout(decorate, 350); setTimeout(decorate, 1200);
  window.RoyalAdminPersistentMediaV0600 = {
    version:VERSION, dbName:DB_NAME, setup:decorate, schedule,
    stableTeamKey:teamKey, loadTeam, loadAvatar, observe
  };
})();
