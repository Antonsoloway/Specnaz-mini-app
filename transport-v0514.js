/* Royal CRM Mini App — transport v0.5.14
 * No DOM observers and no version rewriting.
 */
(() => {
  const WORKER_ORIGIN = 'https://royal-crm-miniapp-api.tropical-spoon.workers.dev';
  const params = new URLSearchParams(window.location.search);
  const GAS_URL = String(params.get('gas') || '').trim();
  const nativeFetch = window.fetch.bind(window);
  let callbackSeq = 0;
  let gasMode = false;

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
      const timer = setTimeout(() => finish(new Error('GAS_FALLBACK_TIMEOUT')), 8000);

      function cleanup() {
        clearTimeout(timer);
        try { delete window[callback]; } catch (_) { window[callback] = undefined; }
        try { script.remove(); } catch (_) {}
      }
      function finish(error, value) {
        if (done) return;
        done = true;
        cleanup();
        if (error) reject(error); else resolve(value);
      }

      window[callback] = data => finish(null, data);
      script.onerror = () => finish(new Error('GAS_FALLBACK_LOAD_FAILED'));
      script.src = url.toString();
      document.head.appendChild(script);
    });
  }

  async function fetchWithTimeout(input, init, ms) {
    const options = { ...(init || {}) };
    let controller = null;
    if (!options.signal && 'AbortController' in window) {
      controller = new AbortController();
      options.signal = controller.signal;
    }
    let timeoutId = null;
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        try { controller?.abort(); } catch (_) {}
        reject(new Error('WORKER_TIMEOUT'));
      }, ms);
    });
    try {
      return await Promise.race([nativeFetch(input, options), timeout]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
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
      return jsonResponse(data, data && data.ok !== false ? 200 : 403);
    }
    if (url.pathname === '/snapshot') {
      const data = await jsonp('fallback-snapshot', { initData });
      return jsonResponse(data, data && data.ok ? 200 : 403);
    }
    if (url.pathname === '/avatar') {
      const data = await jsonp('fallback-avatar', { initData, fileId: url.searchParams.get('fileId') || '' });
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

  window.fetch = async function royalFetch(input, init) {
    const urlString = typeof input === 'string' ? input : String(input?.url || '');
    if (!urlString.startsWith(WORKER_ORIGIN)) return nativeFetch(input, init);
    if (gasMode) return fallbackFor(urlString, init);
    try {
      return await fetchWithTimeout(input, init, 5000);
    } catch (workerError) {
      if (!GAS_URL) throw workerError;
      console.warn('Worker unavailable; using GAS fallback:', workerError?.message || workerError);
      return fallbackFor(urlString, init);
    }
  };

  window.__ROYAL_TRANSPORT_VERSION__ = '0.5.14';
})();
