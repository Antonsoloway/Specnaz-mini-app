/* Royal CRM Mini App — Telegram write access v0.5.38
 * Rule: successful Mini App entry by an allowed CRM participant must also
 * activate the private bot dialog. Telegram requires explicit user consent.
 */
(() => {
  const VERSION = '0.5.38';
  const tg = window.Telegram?.WebApp || null;
  let state = 'idle';
  let gate = null;
  let previewRequestScheduled = false;

  function userAlreadyAllows() {
    try { return tg?.initDataUnsafe?.user?.allows_write_to_pm === true; }
    catch (_) { return false; }
  }

  function supported() {
    if (!tg || typeof tg.requestWriteAccess !== 'function') return false;
    try { return typeof tg.isVersionAtLeast !== 'function' || tg.isVersionAtLeast('6.9'); }
    catch (_) { return true; }
  }

  function removeGate() {
    gate?.remove?.();
    gate = null;
    document.documentElement.classList.remove('royal-write-access-required');
  }

  function markAllowed() {
    state = 'allowed';
    removeGate();
    try { localStorage.setItem('royal_bot_write_access', 'allowed'); } catch (_) {}
    window.__ROYAL_BOT_WRITE_ACCESS__ = 'allowed';
  }

  function showGate(message = '') {
    state = 'denied';
    if (!document.body) return;
    removeGate();
    document.documentElement.classList.add('royal-write-access-required');
    gate = document.createElement('div');
    gate.className = 'royal-write-access-gate';
    gate.innerHTML = `<section class="royal-write-access-card" role="dialog" aria-modal="true" aria-label="Разрешение сообщений от Голубя">
      <div class="royal-write-access-icon">🕊️</div>
      <h2>Подключите Голубя</h2>
      <p>Для работы приложения нужно разрешить <strong>@doveofpeace_bot</strong> отправлять вам личные сообщения. Это нужно для уведомлений Чата Победителей.</p>
      ${message ? `<p class="royal-write-access-error">${message}</p>` : ''}
      <button type="button" class="royal-write-access-button" data-royal-write-access="1">Разрешить сообщения</button>
      <small class="royal-write-access-help">Telegram покажет системное окно подтверждения. После разрешения отдельный /start не нужен.</small>
    </section>`;
    document.body.appendChild(gate);
  }

  function requestAccess() {
    if (state === 'pending' || state === 'allowed') return;
    if (userAlreadyAllows()) {
      markAllowed();
      return;
    }
    if (!supported()) {
      showGate('Обновите Telegram до актуальной версии и откройте приложение снова.');
      return;
    }

    state = 'pending';
    try {
      tg.requestWriteAccess(allowed => {
        if (allowed) {
          markAllowed();
          return;
        }
        showGate('Без разрешения Голубь не сможет присылать уведомления, поэтому вход в приложение не завершён.');
      });
    } catch (error) {
      console.warn('requestWriteAccess failed:', error?.message || error);
      showGate('Не удалось открыть запрос Telegram. Нажмите кнопку ещё раз.');
    }
  }

  function requireAfterAuth(data) {
    if (!data || data.access !== true) return;
    const startupReady = window.RoyalStartupV0600?.whenRevealed;
    if (startupReady && typeof startupReady.then === 'function') {
      if (previewRequestScheduled) return;
      previewRequestScheduled = true;
      Promise.resolve(startupReady).then(() => {
        if (window.RoyalStartupV0600?.terminal) return;
        window.setTimeout(() => {
          if (!window.RoyalStartupV0600?.terminal) requestAccess();
        }, 120);
      }).catch(() => { previewRequestScheduled = false; });
      return;
    }
    window.setTimeout(requestAccess, 120);
  }

  if (tg && typeof tg.onEvent === 'function') {
    try {
      tg.onEvent('writeAccessRequested', event => {
        if (event?.status === 'allowed') markAllowed();
        else if (event?.status === 'cancelled' && state !== 'allowed') {
          showGate('Разрешите сообщения от Голубя, чтобы продолжить работу с приложением.');
        }
      });
    } catch (_) {}
  }

  if (typeof renderAuth === 'function') {
    const nativeRenderAuth = renderAuth;
    renderAuth = function(data) {
      const result = nativeRenderAuth(data);
      requireAfterAuth(data);
      return result;
    };
  }

  if (window.RoyalStartupV0600 && typeof window.addEventListener === 'function') {
    window.addEventListener('royal:auth-ready', event => requireAfterAuth(event?.detail));
    const durableAuth = window.__ROYAL_AUTH_READY__;
    if (durableAuth?.access === true && durableAuth.build === '0.6.0') requireAfterAuth(durableAuth);
  }

  document.addEventListener('click', event => {
    const button = event.target?.closest?.('[data-royal-write-access="1"]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    state = 'idle';
    requestAccess();
  }, true);

  if (userAlreadyAllows()) markAllowed();

  window.RoyalWriteAccess = {
    version: VERSION,
    request: requestAccess,
    get state() { return state; }
  };
  window.__ROYAL_WRITE_ACCESS_VERSION__ = VERSION;
})();
