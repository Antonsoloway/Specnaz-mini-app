// Royal CRM Mini App fallback transport — v0.5.5
// Uses Cloudflare Worker first. On network failure/timeout, transparently
// switches the whole Mini App session to the Google Apps Script web app.
(function () {
  const FALLBACK_TRANSPORT_VERSION = '0.5.5';
  const WORKER_ORIGIN = 'https://royal-crm-miniapp-api.tropical-spoon.workers.dev';
  const params = new URLSearchParams(window.location.search);
  const GAS_URL = String(params.get('gas') || '').trim();
  const nativeFetch = window.fetch.bind(window);
  let callbackSeq = 0;
  let gasMode = false;

  function forceVersionBadge() {
    const badge = document.getElementById('versionBadge');
    if (badge && badge.textContent !== `v${FALLBACK_TRANSPORT_VERSION}`) {
      badge.textContent = `v${FALLBACK_TRANSPORT_VERSION}`;
    }
  }

  function getInitData() {
    return String(window.Telegram?.WebApp?.initData || '');
  }

  function jsonp(action, payload) {
    if (!GAS_URL) return Promise.reject(new Error('GAS_FALLBACK_URL_MISSING'));

    return new Promise((resolve, reject) => {
      const callback = `__royalGasFallback_${Date.now()}_${++callbackSeq}`;
      const url = new URL(GAS_URL);
      url.searchParams.set('action', action);
      url.searchParams.set('callback', callback);

      Object.entries(payload || {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
      });

      const script = document.createElement('script');
      let done = false;
      const timer = setTimeout(() => finish(new Error('GAS_FALLBACK_TIMEOUT')), 20000);

      function cleanup() {
        clearTimeout(timer);
        try { delete window[callback]; } catch (_) { window[callback] = undefined; }
        script.remove();
      }

      function finish(error, value) {
        if (done) return;
        done = true;
        cleanup();
        if (error) reject(error);
        else resolve(value);
      }

      window[callback] = data => finish(null, data);
      script.onerror = () => finish(new Error('GAS_FALLBACK_LOAD_FAILED'));
      script.src = url.toString();
      document.head.appendChild(script);
    });
  }

  async function fetchWorkerWithTimeout(input, init) {
    const options = { ...(init || {}) };
    let controller = null;
    let timer = null;

    if (!options.signal && 'AbortController' in window) {
      controller = new AbortController();
      options.signal = controller.signal;
      timer = setTimeout(() => controller.abort(), 4500);
    }

    try {
      return await nativeFetch(input, options);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function jsonResponse(data, status) {
    return new Response(JSON.stringify(data || {}), {
      status: status || 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Royal-Backend': 'google-apps-script'
      }
    });
  }

  function mediaResponse(data) {
    if (!data || !data.ok || !data.base64) {
      return jsonResponse(data || { ok: false, error: 'FALLBACK_MEDIA_MISSING' }, 502);
    }

    const binary = atob(String(data.base64));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': String(data.mime || 'image/jpeg'),
        'Cache-Control': 'private, max-age=86400',
        'X-Royal-Backend': 'google-apps-script'
      }
    });
  }

  async function fallbackFor(urlString, init) {
    const url = new URL(urlString);
    const initData = getInitData();
    if (!initData) throw new Error('TELEGRAM_INIT_DATA_MISSING');

    if (url.pathname === '/auth') {
      let body = {};
      try { body = JSON.parse(String(init?.body || '{}')); } catch (_) {}
      const data = await jsonp('fallback-auth', { initData: body.initData || initData });
      if (data && data.ok && data.access) {
        gasMode = true;
        if (!data.session) data.session = 'gas-fallback-session';
      }
      const status = data && data.ok !== false ? 200 : 403;
      return jsonResponse(data, status);
    }

    if (url.pathname === '/snapshot') {
      const data = await jsonp('fallback-snapshot', { initData });
      return jsonResponse(data, data && data.ok ? 200 : 403);
    }

    if (url.pathname === '/avatar') {
      const data = await jsonp('fallback-avatar', {
        initData,
        fileId: url.searchParams.get('fileId') || ''
      });
      return mediaResponse(data);
    }

    if (url.pathname === '/team-photo') {
      const data = await jsonp('fallback-team-photo', {
        initData,
        team: url.searchParams.get('team') || '',
        game: url.searchParams.get('game') || ''
      });
      return mediaResponse(data);
    }

    throw new Error('NO_GAS_FALLBACK_FOR_ROUTE');
  }

  if (GAS_URL) {
    window.fetch = async function royalFetch(input, init) {
      const urlString = typeof input === 'string' ? input : String(input?.url || '');
      if (!urlString.startsWith(WORKER_ORIGIN)) return nativeFetch(input, init);

      if (gasMode) return fallbackFor(urlString, init);

      try {
        return await fetchWorkerWithTimeout(input, init);
      } catch (workerError) {
        console.warn('Worker network unavailable; switching to GAS fallback:', workerError?.message || workerError);
        return fallbackFor(urlString, init);
      }
    };
  }

  const badgeObserver = new MutationObserver(forceVersionBadge);
  const startBadgeWatch = () => {
    forceVersionBadge();
    const badge = document.getElementById('versionBadge');
    if (badge) badgeObserver.observe(badge, { childList: true, characterData: true, subtree: true });
    setTimeout(forceVersionBadge, 50);
    setTimeout(forceVersionBadge, 250);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startBadgeWatch, { once: true });
  else startBadgeWatch();
})();
