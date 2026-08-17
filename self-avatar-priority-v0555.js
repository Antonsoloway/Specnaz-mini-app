/* Royal CRM Mini App — Priority self avatar v0.5.55
 * Show the current user's cached avatar immediately after auth, before snapshot finishes loading.
 */
(() => {
  const VERSION = '0.5.55';
  const DB_NAME = 'royal-crm-media-cache';
  const DB_VERSION = 1;
  const STORE = 'images';
  let scanTimer = 0;
  let promoteBusy = false;

  function cleanTelegramId(value) {
    const text = String(value == null ? '' : value).trim().replace(/\.0$/, '');
    return /^\d+$/.test(text) ? text : '';
  }

  function currentTelegramId() {
    return cleanTelegramId(authState?.user?.telegramId || window.Telegram?.WebApp?.initDataUnsafe?.user?.id || '');
  }

  function currentParticipant() {
    const id = currentTelegramId();
    const participants = Array.isArray(snapshotState?.participants) ? snapshotState.participants : [];
    return participants.find(p => cleanTelegramId(p?.telegramId) === id) || null;
  }

  function openDb() {
    if (!('indexedDB' in window)) return Promise.resolve(null);
    return new Promise(resolve => {
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); }
      catch (_) { resolve(null); return; }
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    });
  }

  async function promoteFileIdCacheToTelegramAlias() {
    if (promoteBusy) return;
    const telegramId = currentTelegramId();
    const fileId = String(currentParticipant()?.avatarFileId || '').trim();
    if (!telegramId || !fileId) return;
    promoteBusy = true;
    try {
      const db = await openDb();
      if (!db || !db.objectStoreNames.contains(STORE)) return;
      const sourceKey = `avatar:${fileId}`;
      const aliasKey = `avatar:tg-${telegramId}`;
      const record = await new Promise(resolve => {
        try {
          const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(sourceKey);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => resolve(null);
        } catch (_) { resolve(null); }
      });
      if (!(record?.blob instanceof Blob) || !record.blob.size) return;
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put({ ...record, key: aliasKey, kind: 'avatar', touchedAt: Date.now() });
      } catch (_) {}
    } finally {
      promoteBusy = false;
    }
  }

  function ensurePriorityAvatar(holder) {
    if (!holder) return;
    const telegramId = cleanTelegramId(holder.dataset.telegramId || currentTelegramId());
    if (!telegramId) return;
    holder.dataset.telegramId = telegramId;

    let img = holder.querySelector('img');
    if (!img) {
      img = document.createElement('img');
      img.alt = '';
      holder.appendChild(img);
    }
    if (img.dataset.selfAvatarPriorityV0555 === '1') return;
    img.dataset.selfAvatarPriorityV0555 = '1';
    img.addEventListener('load', () => holder.classList.remove('fallback'), { once: true });

    // Bypass the regular queue/IntersectionObserver for the signed-in user's own avatar.
    // Before snapshot arrives the persistent media layer automatically uses avatar:tg-<telegramId>.
    try {
      const result = loadAvatarImage(img);
      if (result?.catch) result.catch(() => {});
    } catch (_) {}
  }

  function scan(root) {
    const scope = root?.querySelectorAll ? root : document;
    const id = currentTelegramId();
    if (!id) return;
    const holders = Array.from(scope.querySelectorAll('.self-avatar'));
    if (scope.matches?.('.self-avatar')) holders.unshift(scope);
    holders.forEach(holder => {
      if (!holder.dataset.telegramId) holder.dataset.telegramId = id;
      ensurePriorityAvatar(holder);
    });
    promoteFileIdCacheToTelegramAlias().catch(() => {});
  }

  function scheduleScan(root) {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => scan(root || document), 0);
  }

  if (typeof renderAuth === 'function') {
    const nativeRenderAuth = renderAuth;
    renderAuth = function renderAuthV0555(data) {
      const result = nativeRenderAuth(data);
      scheduleScan(document);
      return result;
    };
  }

  if (typeof loadSnapshot === 'function') {
    const nativeLoadSnapshot = loadSnapshot;
    loadSnapshot = async function loadSnapshotV0555() {
      const result = await nativeLoadSnapshot();
      scheduleScan(document);
      return result;
    };
  }

  if (typeof renderPage === 'function') {
    const nativeRenderPage = renderPage;
    renderPage = function renderPageV0555(page) {
      const result = nativeRenderPage(page);
      if (page === 'home' || page === 'profile') scheduleScan(document);
      return result;
    };
  }

  if ('MutationObserver' in window) {
    const observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes || []) {
          if (!(node instanceof Element)) continue;
          if (node.matches?.('.self-avatar') || node.querySelector?.('.self-avatar')) {
            scheduleScan(node);
            return;
          }
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  window.RoyalSelfAvatarPriority = { version: VERSION, scan: () => scan(document) };
  window.__ROYAL_SELF_AVATAR_PRIORITY_VERSION__ = VERSION;
})();
