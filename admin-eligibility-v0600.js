/* Royal CRM Mini App — Admin Mode eligibility v0.6.0 */
(() => {
  const VERSION = '0.6.0-read.1';
  let eligibility = null;
  let checkPromise = null;

  function cleanId(value) {
    const text = String(value == null ? '' : value).trim().replace(/\.0$/, '');
    return /^\d+$/.test(text) ? text : '';
  }

  function currentTelegramId() {
    return cleanId(authState?.user?.telegramId || window.Telegram?.WebApp?.initDataUnsafe?.user?.id);
  }

  function removeTile() {
    document.querySelector('[data-admin-mode="1"]')?.remove();
  }

  function ensureTile() {
    if (eligibility !== true) { removeTile(); return; }
    const grid = document.querySelector('.grid');
    if (!grid || grid.querySelector('[data-admin-mode="1"]')) return;
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'tile royal-admin-tile';
    tile.dataset.adminMode = '1';
    tile.innerHTML = '<span>🛡️</span><b>Админ режим</b><small>Полные данные CRM</small>';
    grid.appendChild(tile);
  }

  async function check(force = false) {
    if (!force && eligibility !== null) return eligibility;
    if (!force && checkPromise) return checkPromise;
    const telegramId = currentTelegramId();
    if (!telegramId || !sessionToken) {
      eligibility = false;
      removeTile();
      return false;
    }

    checkPromise = (async () => {
      try {
        const response = await fetch(`${API_URL}/participant-role?telegramId=${encodeURIComponent(telegramId)}`, {
          method: 'GET', mode: 'cors', cache: 'no-store',
          headers: { Authorization: `Bearer ${sessionToken}` }
        });
        const data = await response.json().catch(() => ({}));
        eligibility = !!(response.ok && data?.ok && data?.isChatAdmin);
      } catch (_) {
        eligibility = false;
      }
      if (eligibility) ensureTile(); else removeTile();
      return eligibility;
    })().finally(() => { checkPromise = null; });

    return checkPromise;
  }

  // Hide optimistic tile until protected Telegram check finishes.
  if (typeof renderAuth === 'function') {
    const nativeRenderAuth = renderAuth;
    renderAuth = function adminEligibilityRenderAuth(data) {
      const result = nativeRenderAuth(data);
      eligibility = null;
      removeTile();
      setTimeout(() => check(true), 0);
      return result;
    };
  }

  if (typeof renderPage === 'function') {
    const nativeRenderPage = renderPage;
    renderPage = function adminEligibilityRenderPage(page) {
      const result = nativeRenderPage(page);
      if (page === 'home') {
        setTimeout(() => {
          if (eligibility === true) ensureTile();
          else if (eligibility === null) check(false);
          else removeTile();
        }, 0);
      }
      return result;
    };
  }

  // admin-v0600 may have optimistically added a tile from auth role; remove it
  // until the protected /participant-role response says the current user is admin.
  setTimeout(() => { removeTile(); check(false); }, 50);

  window.RoyalAdminEligibilityV0600 = { version: VERSION, check, ensureTile, removeTile };
})();
