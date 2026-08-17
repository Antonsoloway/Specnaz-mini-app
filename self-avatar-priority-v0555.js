/* Royal CRM Mini App — Priority self avatar v0.5.55
 * Show the current user's cached avatar immediately after auth, before snapshot finishes loading.
 */
(() => {
  const VERSION = '0.5.55';
  let scanTimer = 0;

  function cleanTelegramId(value) {
    const text = String(value == null ? '' : value).trim().replace(/\.0$/, '');
    return /^\d+$/.test(text) ? text : '';
  }

  function currentTelegramId() {
    return cleanTelegramId(authState?.user?.telegramId || window.Telegram?.WebApp?.initDataUnsafe?.user?.id || '');
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

    // Bypass the normal avatar queue/IntersectionObserver for the signed-in user's own avatar.
    // Before snapshot arrives the persistent media layer uses avatar:tg-<telegramId>, so the
    // cached image can be restored from IndexedDB immediately on later launches.
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

  // Covers cards recreated by later UI decorators without polling.
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
