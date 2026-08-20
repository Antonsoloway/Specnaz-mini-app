/* Royal CRM Mini App — Admin Mode eligibility v0.6.0 */
(() => {
  const VERSION = '0.6.0-read.3';
  let eligibility = null;
  let checkPromise = null;
  let retryTimer = 0;
  let retryCount = 0;

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

  function markAuthAdmin(value) {
    if (!authState || typeof value !== 'boolean') return;
    authState.role = { ...(authState.role || {}), isChatAdmin: value };
    if (value) {
      authState.permissions = { ...(authState.permissions || {}), canManageAll: true };
    }
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

  function scheduleRetry(delay) {
    if (retryTimer) return;
    const ms = Number(delay) > 0 ? Number(delay) : (retryCount < 8 ? 300 : 1000);
    retryTimer = setTimeout(() => {
      retryTimer = 0;
      retryCount += 1;
      check(true);
    }, ms);
  }

  async function protectedAdminFallback() {
    try {
      const response = await fetch(`${API_URL}/admin-data`, {
        method: 'GET', mode: 'cors', cache: 'no-store',
        headers: { Authorization: `Bearer ${sessionToken}` }
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data?.ok && data?.adminData) return true;
      if (response.status === 401 || response.status === 403) return false;
      return null;
    } catch (_) {
      return null;
    }
  }

  async function check(force = false) {
    if (!force && eligibility !== null) return eligibility;
    if (checkPromise) return checkPromise;

    const telegramId = currentTelegramId();
    if (!telegramId || !sessionToken) {
      // Auth may still be starting. This is UNKNOWN, not "not admin".
      eligibility = null;
      removeTile();
      scheduleRetry();
      return null;
    }

    checkPromise = (async () => {
      let nextEligibility = null;
      try {
        const response = await fetch(`${API_URL}/participant-role?telegramId=${encodeURIComponent(telegramId)}`, {
          method: 'GET', mode: 'cors', cache: 'no-store',
          headers: { Authorization: `Bearer ${sessionToken}` }
        });
        const data = await response.json().catch(() => ({}));

        if (response.ok && data?.ok) {
          nextEligibility = data?.isChatAdmin === true;
        } else if (response.status === 401 || response.status === 403) {
          nextEligibility = false;
        } else {
          // participant-role can have a transient/route failure. /admin-data is
          // independently protected and is therefore a safe positive fallback.
          nextEligibility = await protectedAdminFallback();
        }
      } catch (_) {
        nextEligibility = await protectedAdminFallback();
      }

      eligibility = nextEligibility;
      if (eligibility === true) {
        retryCount = 0;
        markAuthAdmin(true);
        ensureTile();
      } else if (eligibility === false) {
        retryCount = 0;
        markAuthAdmin(false);
        removeTile();
      } else {
        // Network/backend transient: keep state unknown and retry. Never turn a
        // temporary failure into a persistent "not admin" UI state.
        removeTile();
        scheduleRetry(retryCount < 8 ? 500 : 1500);
      }
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
      retryCount = 0;
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
          else check(false);
        }, 0);
      }
      return result;
    };
  }

  // First probe is intentionally delayed enough for normal auth startup, but a
  // missing token still remains UNKNOWN and is retried instead of denied.
  setTimeout(() => { removeTile(); check(false); }, 250);
  setTimeout(() => { if (eligibility !== true) check(true); }, 1000);
  setTimeout(() => { if (eligibility !== true) check(true); }, 2500);

  window.RoyalAdminEligibilityV0600 = {
    version: VERSION,
    check,
    ensureTile,
    removeTile,
    get isAdmin() { return eligibility === true; },
    get state() { return eligibility; }
  };
})();
