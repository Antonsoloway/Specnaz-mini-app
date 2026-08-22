/* Royal CRM Mini App — transport v0.5.14.3
 * No DOM observers and no version rewriting.
 * /auth gets a longer timeout and one automatic retry for transient failures.
 * /admin-data gets a dedicated read window; retries stay in the shared admin
 * data client so transport never multiplies protected reads.
 * /admin-write gets a write-specific timeout because a photo mutation also
 * updates Sheets media and snapshots before the Worker can answer.
 */
(() => {
  const WORKER_ORIGIN = 'https://royal-crm-miniapp-api.tropical-spoon.workers.dev';
  const params = new URLSearchParams(window.location.search);
  const GAS_URL = String(params.get('gas') || '').trim();
  const nativeFetch = window.fetch.bind(window);
  const DEFAULT_TIMEOUT_MS = 5000;
  const AUTH_TIMEOUT_MS = 12000;
  const ADMIN_DATA_TIMEOUT_MS = 20000;
  const ADMIN_WRITE_TIMEOUT_MS = 60000;
  const AUTH_RETRY_DELAY_MS = 350;
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

  function timeoutError(code) {
    const error = new Error(code);
    error.code = code;
    error.name = 'TimeoutError';
    return error;
  }

  function workerRequiredError() {
    const error = new Error('ADMIN_WORKER_REQUIRED');
    error.code = 'ADMIN_WORKER_REQUIRED';
    return error;
  }

  function isTimeoutish(error) {
    const code = String(error?.code || '');
    const message = String(error?.message || '');
    return error?.name === 'AbortError' ||
      error?.name === 'TimeoutError' ||
      Number(error?.code) === 20 ||
      code === 'WORKER_TIMEOUT' ||
      code === 'AUTH_TIMEOUT' ||
      message === 'WORKER_TIMEOUT' ||
      message === 'AUTH_TIMEOUT';
  }

  function isTransientWorkerError(error) {
    const code = String(error?.code || '');
    const message = String(error?.message || '').toLowerCase();
    return isTimeoutish(error) ||
      error instanceof TypeError ||
      code === 'HTTP_502' || code === 'HTTP_503' || code === 'HTTP_504' ||
      message.includes('failed to fetch') ||
      message.includes('networkerror') ||
      message.includes('load failed');
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function fetchWithTimeout(input, init, ms, timeoutCode = 'WORKER_TIMEOUT') {
    const options = { ...(init || {}) };
    let controller = null;
    if (!options.signal && 'AbortController' in window) {
      controller = new AbortController();
      options.signal = controller.signal;
    }

    let timedOut = false;
    let timeoutId = null;
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        timedOut = true;
        try { controller?.abort(); } catch (_) {}
        reject(timeoutError(timeoutCode));
      }, ms);
    });

    const request = nativeFetch(input, options).catch(error => {
      if (timedOut || isTimeoutish(error)) throw timeoutError(timeoutCode);
      throw error;
    });

    try {
      return await Promise.race([request, timeout]);
    } catch (error) {
      if (timedOut || isTimeoutish(error)) throw timeoutError(timeoutCode);
      throw error;
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

    let pathname = '';
    try { pathname = new URL(urlString).pathname; } catch (_) {}
    if (gasMode) {
      if (pathname === '/admin-data' || pathname === '/admin-write' || pathname === '/admin-team-photo') {
        throw workerRequiredError();
      }
      return fallbackFor(urlString, init);
    }

    const isAuth = pathname === '/auth';
    const isAdminData = pathname === '/admin-data';
    const isAdminWrite = pathname === '/admin-write';
    const attempts = isAuth ? 2 : 1;
    const timeoutMs = isAuth
      ? AUTH_TIMEOUT_MS
      : isAdminData
        ? ADMIN_DATA_TIMEOUT_MS
        : isAdminWrite
          ? ADMIN_WRITE_TIMEOUT_MS
          : DEFAULT_TIMEOUT_MS;
    const timeoutCode = isAuth ? 'AUTH_TIMEOUT' : 'WORKER_TIMEOUT';
    let lastError = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await fetchWithTimeout(input, init, timeoutMs, timeoutCode);
      } catch (workerError) {
        lastError = workerError;
        if (isAuth && attempt < attempts && isTransientWorkerError(workerError)) {
          console.warn(`Auth attempt ${attempt} failed; retrying once:`, workerError?.code || workerError?.message || workerError);
          await sleep(AUTH_RETRY_DELAY_MS);
          continue;
        }
        break;
      }
    }

    if (isAdminData || isAdminWrite || pathname === '/admin-team-photo') {
      throw lastError || workerRequiredError();
    }
    if (!GAS_URL) throw lastError || timeoutError(timeoutCode);
    console.warn('Worker unavailable; using GAS fallback:', lastError?.message || lastError);
    return fallbackFor(urlString, init);
  };

  window.__ROYAL_TRANSPORT_VERSION__ = '0.5.14.3';
})();
