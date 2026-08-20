/* Royal CRM Mini App — v0.6 admin persistent media bridge
 *
 * One storage, same as normal mode:
 *   IndexedDB: royal-crm-media-cache / images
 *   avatar key: avatar:<avatarFileId> (or avatar:tg-<id> only when public snapshot has no participant)
 *   team key:   team:<normalized team>\n<normalized game>
 *
 * Goals:
 * - admin avatars reuse the exact persistent records created by normal mode;
 * - do not race the legacy setupAvatarLoading() on admin screens;
 * - admin team list gets lazy thumbnails using the exact normal team cache key;
 * - disk is rendered first; network is only fallback/30-minute team refresh.
 */
(() => {
  const VERSION = '0.6.0-admin-media-cache.1';
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
  let scheduleTimer = 0;
  let decorating = false;

  const nativeSetupAvatarLoading = typeof window.setupAvatarLoading === 'function'
    ? window.setupAvatarLoading
    : (typeof setupAvatarLoading === 'function' ? setupAvatarLoading : null);

  function clean(value) { return String(value == null ? '' : value).trim(); }
  function cleanTelegramId(value) {
    const text = clean(value).replace(/\.0$/, '');
    const match = text.match(/\d{5,20}/);
    return match ? match[0] : '';
  }
  function normalizeGame(value) {
    const text = clean(value);
    const low = text.toLocaleLowerCase('ru-RU');
    if (low === 'рм' || low.includes('royal match')) return 'Royal Match';
    if (low === 'рк' || low.includes('royal kingdom')) return 'Royal Kingdom';
    return text;
  }
  function normalizeText(value) {
    return clean(value)
      .toLocaleLowerCase('ru-RU')
      .replace(/ё/g, 'е')
      .replace(/[^a-zа-я0-9]+/giu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function stableTeamKey(name, game) {
    const n = normalizeText(name);
    const g = normalizeText(normalizeGame(game));
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
          store.createIndex('touchedAt','touchedAt',{unique:false});
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
      try { tx = db.transaction(STORE,'readonly'); }
      catch (_) { resolve(null); return; }
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  }

  async function idbPut(key, blob, kind, extra={}) {
    if (!key || !(blob instanceof Blob) || !blob.size) return false;
    const db = await openDb();
    if (!db) return false;
    const now = Date.now();
    const record = {
      key,
      blob,
      kind:clean(kind),
      createdAt:Number(extra.createdAt || now),
      touchedAt:now,
      fetchedAt:Number(extra.fetchedAt || now),
      size:blob.size,
      ...extra
    };
    return new Promise(resolve => {
      let tx;
      try { tx = db.transaction(STORE,'readwrite'); }
      catch (_) { resolve(false); return; }
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    });
  }

  async function idbTouch(record) {
    if (!record?.key) return;
    const db = await openDb();
    if (!db) return;
    try {
      const tx = db.transaction(STORE,'readwrite');
      record.touchedAt = Date.now();
      tx.objectStore(STORE).put(record);
    } catch (_) {}
  }

  function validRecord(record) {
    return !!(
      record?.blob instanceof Blob &&
      record.blob.size &&
      Date.now() - Number(record.touchedAt || record.createdAt || 0) < MAX_AGE_MS
    );
  }

  function objectUrl(key, blob) {
    if (memory.has(key)) return memory.get(key);
    const url = URL.createObjectURL(blob);
    memory.set(key,url);
    return url;
  }

  function replaceObjectUrl(key, blob) {
    const old = memory.get(key);
    const next = URL.createObjectURL(blob);
    memory.set(key,next);
    if (old && old.startsWith('blob:')) {
      setTimeout(() => { try { URL.revokeObjectURL(old); } catch (_) {} },1200);
    }
    return next;
  }

  function participantFromPublicSnapshot(id) {
    const participants = Array.isArray(snapshotState?.participants) ? snapshotState.participants : [];
    return participants.find(p => cleanTelegramId(p?.telegramId) === id) || null;
  }

  async function resolveAvatarIdentity(id, waitMs=900) {
    const started = Date.now();
    let participant = participantFromPublicSnapshot(id);
    while (!participant && Date.now() - started < waitMs) {
      await new Promise(resolve => setTimeout(resolve,90));
      participant = participantFromPublicSnapshot(id);
    }
    const fileId = clean(participant?.avatarFileId);
    return {
      telegramId:id,
      fileId,
      key:fileId ? `avatar:${fileId}` : `avatar:tg-${id}`
    };
  }

  function participantIdFromRecord(record) {
    const direct = cleanTelegramId(record?.dataset?.telegramId);
    if (direct) return direct;
    const meta = clean(record?.querySelector('summary .royal-admin-summary-main small')?.textContent);
    const match = meta.match(/(?:^|·\s*)ID\s+(\d{5,20})(?:\s|$)/i);
    return match ? match[1] : '';
  }

  function firstLetter(value) {
    const text = clean(value).replace(/^@/,'');
    return text ? Array.from(text)[0].toUpperCase() : '👤';
  }

  function ensureAvatar(record) {
    const id = participantIdFromRecord(record);
    if (!id) return null;
    record.dataset.telegramId = id;
    const summary = record.querySelector('summary');
    const main = summary?.querySelector('.royal-admin-summary-main');
    if (!summary || !main) return null;

    let wrap = summary.querySelector('.royal-admin-participant-avatar');
    if (!wrap) {
      const title = clean(main.querySelector('strong')?.textContent) || 'Участник';
      wrap = document.createElement('div');
      wrap.className = 'person-avatar-wrap small royal-admin-participant-avatar fallback';
      wrap.innerHTML = `<span>${firstLetter(title)}</span>`;
      summary.insertBefore(wrap,main);
    }
    wrap.dataset.telegramId = id;

    let img = wrap.querySelector('img.person-avatar');
    if (!img) {
      img = document.createElement('img');
      img.className = 'person-avatar';
      img.alt = '';
      wrap.appendChild(img);
    }
    img.dataset.adminMediaKind = 'avatar';
    img.dataset.telegramId = id;
    if (img.dataset.adminMediaEvents !== '1') {
      img.dataset.adminMediaEvents = '1';
      img.addEventListener('load',() => wrap.classList.remove('fallback'));
      img.addEventListener('error',() => wrap.classList.add('fallback'));
    }
    record.dataset.adminAvatarEnhanced = '1';
    return img;
  }

  function teamIdentityFromRecord(record) {
    const name = clean(record?.querySelector('summary .royal-admin-summary-main strong')?.textContent);
    const meta = clean(record?.querySelector('summary .royal-admin-summary-main small')?.textContent);
    const game = normalizeGame(meta);
    return { name, game };
  }

  function teamHasPhoto(record) {
    const fields = [...(record?.querySelectorAll?.('.royal-admin-detail .royal-admin-field') || [])];
    const field = fields.find(node => normalizeText(node.querySelector('span:first-child')?.textContent) === 'фото c');
    return /есть|✅/iu.test(clean(field?.querySelector('span:last-child')?.textContent));
  }

  function ensureTeamThumbnail(record) {
    const identity = teamIdentityFromRecord(record);
    if (!identity.name) return null;
    const summary = record.querySelector('summary');
    const main = summary?.querySelector('.royal-admin-summary-main');
    if (!summary || !main) return null;

    record.dataset.adminTeamName = identity.name;
    record.dataset.adminTeamFullGame = identity.game;

    let wrap = summary.querySelector('.royal-admin-team-thumbnail');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'royal-admin-team-thumbnail fallback';
      wrap.innerHTML = '<span>🏰</span>';
      summary.insertBefore(wrap,main);
    }
    if (!teamHasPhoto(record)) {
      wrap.classList.add('fallback');
      return null;
    }

    let img = wrap.querySelector('img');
    if (!img) {
      img = document.createElement('img');
      img.alt = '';
      wrap.appendChild(img);
    }
    img.dataset.adminMediaKind = 'team';
    img.dataset.teamName = identity.name;
    img.dataset.teamGame = identity.game;
    if (img.dataset.adminMediaEvents !== '1') {
      img.dataset.adminMediaEvents = '1';
      img.addEventListener('load',() => wrap.classList.remove('fallback'));
      img.addEventListener('error',() => wrap.classList.add('fallback'));
    }
    return img;
  }

  async function fetchImage(url) {
    const response = await fetch(url,{
      method:'GET',mode:'cors',cache:'no-store',
      headers:{Authorization:`Bearer ${sessionToken}`}
    });
    if (!response.ok) throw new Error(`media ${response.status}`);
    const blob = await response.blob();
    if (!(blob instanceof Blob) || !blob.size || !blob.type.startsWith('image/')) {
      throw new Error('invalid image blob');
    }
    return blob;
  }

  function applyImage(img,key,blob,source) {
    if (!img?.isConnected) return;
    img.src = objectUrl(key,blob);
    img.dataset.adminMediaLoaded = '1';
    img.dataset.adminMediaCache = source;
    img.dataset.adminMediaKey = key;
  }

  async function loadAvatar(img) {
    const id = cleanTelegramId(img?.dataset?.telegramId || img?.closest?.('[data-telegram-id]')?.dataset?.telegramId);
    if (!id || !sessionToken || !img?.isConnected) return;

    const identity = await resolveAvatarIdentity(id,900);
    const key = identity.key;
    if (!key || !img.isConnected) return;
    if (img.dataset.adminMediaLoaded === '1' && img.dataset.adminMediaKey === key) return;

    if (memory.has(key)) {
      img.src = memory.get(key);
      img.dataset.adminMediaLoaded = '1';
      img.dataset.adminMediaCache = 'memory';
      img.dataset.adminMediaKey = key;
      return;
    }

    const cached = await idbGet(key);
    if (validRecord(cached)) {
      applyImage(img,key,cached.blob,'disk');
      idbTouch(cached).catch(() => {});
      return;
    }

    const taskKey = `fetch:${key}`;
    let task = pending.get(taskKey);
    if (!task) {
      task = (async () => {
        const blob = await fetchImage(`${API_URL}/avatar?telegramId=${encodeURIComponent(id)}`);
        // Await the durable write before reporting success. This is the key
        // difference from the old admin race: a quick close cannot skip disk persistence.
        await idbPut(key,blob,'avatar',{
          telegramId:id,
          avatarFileId:identity.fileId || '',
          fetchedAt:Date.now()
        });
        return blob;
      })();
      pending.set(taskKey,task);
    }
    try {
      const blob = await task;
      applyImage(img,key,blob,'network');
    } finally {
      if (pending.get(taskKey) === task) pending.delete(taskKey);
    }
  }

  async function fetchTeamBlob(name,game) {
    const url = new URL(`${API_URL}/team-photo`);
    url.searchParams.set('team',name);
    if (game) url.searchParams.set('game',game);
    return fetchImage(url.toString());
  }

  async function refreshTeamInBackground(img,identity,key,current) {
    const taskKey = `refresh:${key}`;
    if (pending.has(taskKey) || !sessionToken) return;
    const task = (async () => {
      try {
        const blob = await fetchTeamBlob(identity.name,identity.game);
        await idbPut(key,blob,'team',{
          teamName:identity.name,
          game:identity.game,
          fetchedAt:Date.now()
        });
        const same = current?.blob instanceof Blob && current.blob.size === blob.size && current.blob.type === blob.type;
        if (!same && img?.isConnected) {
          const next = replaceObjectUrl(key,blob);
          img.src = next;
          img.dataset.adminMediaCache = 'refresh';
          img.dataset.adminMediaLoaded = '1';
          img.dataset.adminMediaKey = key;
        }
      } catch (error) {
        console.warn('Admin team photo background refresh failed:',identity.name,error?.message || error);
      }
    })();
    pending.set(taskKey,task);
    try { await task; }
    finally { pending.delete(taskKey); }
  }

  async function loadTeam(img) {
    const name = clean(img?.dataset?.teamName);
    const game = normalizeGame(img?.dataset?.teamGame);
    if (!name || !sessionToken || !img?.isConnected) return;
    const key = stableTeamKey(name,game);
    if (!key) return;
    if (img.dataset.adminMediaLoaded === '1' && img.dataset.adminMediaKey === key) return;

    if (memory.has(key)) {
      img.src = memory.get(key);
      img.dataset.adminMediaLoaded = '1';
      img.dataset.adminMediaCache = 'memory';
      img.dataset.adminMediaKey = key;
      return;
    }

    const cached = await idbGet(key);
    if (validRecord(cached)) {
      applyImage(img,key,cached.blob,'disk');
      idbTouch(cached).catch(() => {});
      const fetchedAt = Number(cached.fetchedAt || cached.createdAt || 0);
      if (Date.now() - fetchedAt >= TEAM_REFRESH_MS) {
        refreshTeamInBackground(img,{name,game},key,cached).catch(() => {});
      }
      return;
    }

    const taskKey = `fetch:${key}`;
    let task = pending.get(taskKey);
    if (!task) {
      task = (async () => {
        const blob = await fetchTeamBlob(name,game);
        await idbPut(key,blob,'team',{
          teamName:name,
          game,
          fetchedAt:Date.now()
        });
        return blob;
      })();
      pending.set(taskKey,task);
    }
    try {
      const blob = await task;
      applyImage(img,key,blob,'network');
    } finally {
      if (pending.get(taskKey) === task) pending.delete(taskKey);
    }
  }

  function enqueue(img) {
    if (!img || !img.isConnected || queued.has(img) || img.dataset.adminMediaLoading === '1') return;
    if (!img.dataset.adminMediaKind) return;
    queued.add(img);
    queue.push(img);
    pump();
  }

  function pump() {
    while (active < CONCURRENCY && queue.length) {
      const img = queue.shift();
      if (img) queued.delete(img);
      if (!img?.isConnected) continue;
      img.dataset.adminMediaLoading = '1';
      active += 1;
      const task = img.dataset.adminMediaKind === 'team' ? loadTeam(img) : loadAvatar(img);
      Promise.resolve(task).catch(error => {
        console.warn('Admin persistent media load failed:',error?.message || error);
      }).finally(() => {
        delete img.dataset.adminMediaLoading;
        active -= 1;
        pump();
      });
    }
  }

  function observe(img) {
    if (!img || !img.isConnected) return;
    if (!('IntersectionObserver' in window)) { enqueue(img); return; }
    if (!observer) {
      observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          enqueue(entry.target);
        });
      },{rootMargin:'360px 0px'});
    }
    observer.observe(img);
  }

  function decorate() {
    scheduleTimer = 0;
    if (decorating) return;
    const screen = document.querySelector('.royal-admin-screen');
    if (!screen) return;
    decorating = true;
    try {
      [...screen.querySelectorAll('[data-admin-participant="1"]')].forEach(record => {
        const img = ensureAvatar(record);
        if (img) observe(img);
      });
      [...screen.querySelectorAll('[data-admin-team="1"]')].forEach(record => {
        const img = ensureTeamThumbnail(record);
        if (img) observe(img);
      });
      screen.dataset.adminMediaCache = VERSION;
    } finally {
      decorating = false;
    }
  }

  function schedule(delay=0) {
    if (scheduleTimer) clearTimeout(scheduleTimer);
    scheduleTimer = setTimeout(decorate,delay);
  }

  function routedSetupAvatarLoading(root) {
    const node = root instanceof Element ? root : null;
    const admin = !!(node?.matches?.('.royal-admin-screen') || node?.querySelector?.('.royal-admin-screen'));
    if (admin) {
      schedule(0);
      return;
    }
    if (typeof nativeSetupAvatarLoading === 'function') return nativeSetupAvatarLoading(root);
  }

  try { window.setupAvatarLoading = routedSetupAvatarLoading; } catch (_) {}
  try { setupAvatarLoading = routedSetupAvatarLoading; } catch (_) {}

  const style = document.createElement('style');
  style.dataset.adminMediaCacheV0600 = '1';
  style.textContent = `
    .royal-admin-team-thumbnail{position:relative;flex:0 0 54px;width:54px;height:54px;margin:0;overflow:hidden;border-radius:13px;background:#132633;border:1px solid #2b4758;display:grid;place-items:center}
    .royal-admin-team-thumbnail>span{font-size:28px;line-height:1}
    .royal-admin-team-thumbnail>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
    .royal-admin-team-thumbnail.fallback>img{display:none}
    .royal-admin-record summary .royal-admin-team-thumbnail+.royal-admin-summary-main{min-width:0}
  `;
  document.head.appendChild(style);

  const mutationObserver = new MutationObserver(mutations => {
    if (decorating) return;
    const relevant = mutations.some(mutation => [...mutation.addedNodes].some(node => {
      if (!(node instanceof Element)) return false;
      return node.matches?.('.royal-admin-screen,[data-admin-participant="1"],[data-admin-team="1"]') ||
        !!node.querySelector?.('.royal-admin-screen,[data-admin-participant="1"],[data-admin-team="1"]');
    }));
    if (relevant) schedule(0);
  });
  mutationObserver.observe(document.body,{childList:true,subtree:true});

  document.addEventListener('click',event => {
    if (event.target?.closest?.('[data-admin-tab],[data-admin-refresh],[data-admin-participant-filter],[data-admin-team-game-filter],[data-admin-team-status-filter]')) {
      schedule(0);
    }
  },true);

  schedule(0);
  setTimeout(decorate,350);
  setTimeout(decorate,1200);

  window.RoyalAdminPersistentMediaV0600 = {
    version:VERSION,
    dbName:DB_NAME,
    setup:decorate,
    schedule,
    stableTeamKey
  };
})();
