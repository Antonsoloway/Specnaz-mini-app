/* Royal CRM Mini App — No-flicker self avatar v0.5.56
 * Keeps the signed-in user's already loaded avatar across profile-card rerenders.
 * No timers between rerender and avatar restore: sticky URL is applied synchronously.
 */
(() => {
  const VERSION = '0.5.56';
  const stickyUrls = new Map();

  function cleanTelegramId(value) {
    const text = String(value == null ? '' : value).trim().replace(/\.0$/, '');
    return /^\d+$/.test(text) ? text : '';
  }

  function currentTelegramId() {
    return cleanTelegramId(authState?.user?.telegramId || window.Telegram?.WebApp?.initDataUnsafe?.user?.id || '');
  }

  function usableSrc(img) {
    const src = String(img?.currentSrc || img?.src || '').trim();
    if (!src || src === window.location.href) return '';
    return src;
  }

  function rememberImage(img, telegramId) {
    const id = cleanTelegramId(telegramId || currentTelegramId());
    const src = usableSrc(img);
    if (!id || !src) return '';
    stickyUrls.set(id, src);
    return src;
  }

  function captureVisible(root = document) {
    const id = currentTelegramId();
    if (!id) return;
    const scope = root?.querySelectorAll ? root : document;
    const holders = Array.from(scope.querySelectorAll('.self-avatar'));
    if (scope.matches?.('.self-avatar')) holders.unshift(scope);
    for (const holder of holders) {
      const img = holder.querySelector('img');
      if (img && rememberImage(img, holder.dataset.telegramId || id)) return;
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

    const sticky = stickyUrls.get(telegramId) || '';
    if (sticky) {
      if (usableSrc(img) !== sticky) img.src = sticky;
      img.dataset.avatarLoaded = '1';
      img.dataset.mediaCache = 'memory-sticky';
      holder.classList.remove('fallback');
    }

    if (img.dataset.selfAvatarPriorityV0556 !== '1') {
      img.dataset.selfAvatarPriorityV0556 = '1';
      img.addEventListener('load', () => {
        rememberImage(img, telegramId);
        holder.classList.remove('fallback');
      });
    }

    if (sticky || img.dataset.avatarLoaded === '1' || img.dataset.avatarLoaded === 'loading') return;

    try {
      const result = loadAvatarImage(img);
      if (result?.then) {
        result.then(() => {
          rememberImage(img, telegramId);
          if (usableSrc(img)) holder.classList.remove('fallback');
        }).catch(() => {});
      } else {
        rememberImage(img, telegramId);
      }
    } catch (_) {}
  }

  function scan(root = document) {
    const id = currentTelegramId();
    if (!id) return;
    const scope = root?.querySelectorAll ? root : document;
    const holders = Array.from(scope.querySelectorAll('.self-avatar'));
    if (scope.matches?.('.self-avatar')) holders.unshift(scope);
    holders.forEach(holder => {
      if (!holder.dataset.telegramId) holder.dataset.telegramId = id;
      ensurePriorityAvatar(holder);
    });
  }

  if (typeof renderAuth === 'function') {
    const nativeRenderAuth = renderAuth;
    renderAuth = function renderAuthV0556(data) {
      captureVisible(document);
      const result = nativeRenderAuth(data);
      scan(document);
      return result;
    };
  }

  if (typeof loadSnapshot === 'function') {
    const nativeLoadSnapshot = loadSnapshot;
    loadSnapshot = async function loadSnapshotV0556() {
      captureVisible(document);
      const result = await nativeLoadSnapshot();
      // The profile card may have been recreated inside nativeLoadSnapshot.
      // Restore the already visible avatar in the same task, before the next paint.
      scan(document);
      return result;
    };
  }

  if (typeof renderPage === 'function') {
    const nativeRenderPage = renderPage;
    renderPage = function renderPageV0556(page) {
      captureVisible(document);
      const result = nativeRenderPage(page);
      if (page === 'home' || page === 'profile') scan(document);
      return result;
    };
  }

  if ('MutationObserver' in window) {
    const observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes || []) {
          if (!(node instanceof Element)) continue;
          if (node.matches?.('.self-avatar') || node.querySelector?.('.self-avatar')) {
            // MutationObserver runs before the browser's next paint; do not defer with setTimeout.
            scan(node);
          }
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  window.RoyalSelfAvatarPriority = {
    version: VERSION,
    scan: () => scan(document),
    capture: () => captureVisible(document),
    stickyUrl: () => stickyUrls.get(currentTelegramId()) || ''
  };
  window.__ROYAL_SELF_AVATAR_PRIORITY_VERSION__ = VERSION;
})();
