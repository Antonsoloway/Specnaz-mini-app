/* Royal CRM Mini App — shared protected admin-data client v0.6.0 */
(() => {
  const VERSION = '0.6.0-admin-data-client.1';
  const RETRY_DELAYS_MS = Object.freeze([0, 700, 1600]);
  let payload = null;
  let payloadSession = '';
  let loading = null;
  let loadingSession = '';
  let cacheEpoch = 0;
  const listeners = new Set();
  const protectedRequestIds = new Set();

  const clean = value => String(value == null ? '' : value).trim();
  const currentSession = () => clean(typeof sessionToken === 'undefined' ? '' : sessionToken);

  function notify(type, value, reason='') {
    listeners.forEach(listener => {
      try { listener({ type, payload:value || null, reason }); } catch (_) {}
    });
  }

  function clear(reason='manual') {
    cacheEpoch += 1;
    payload = null;
    payloadSession = '';
    loading = null;
    loadingSession = '';
    if (reason === 'unauthorized' || reason === 'forbidden' || reason === 'session-changed') {
      protectedRequestIds.clear();
    }
    notify('clear', null, reason);
  }

  function journalContains(data, requestId) {
    const rows = Array.isArray(data?.adminData?.journal?.rows) ? data.adminData.journal.rows : [];
    return rows.some(row => clean(row?.requestId) === clean(requestId));
  }

  function accept(data, session=currentSession()) {
    if (!data?.ok || !data?.adminData) return false;
    if (protectedRequestIds.size && ![...protectedRequestIds].every(requestId => journalContains(data, requestId))) {
      notify('reject-stale', data, 'pending-write');
      return false;
    }
    payload = data;
    payloadSession = clean(session);
    notify('accept', data);
    return true;
  }

  function isTransient(error) {
    const status = Number(error?.httpStatus || 0);
    const code = clean(error?.code);
    const message = clean(error?.message).toLocaleLowerCase('ru-RU');
    return [502, 503, 504].includes(status) ||
      ['WORKER_TIMEOUT','ADMIN_DATA_TIMEOUT','HTTP_502','HTTP_503','HTTP_504','ADMIN_DATA_INVALID_RESPONSE','ADMIN_NETWORK_RETRY_EXHAUSTED'].includes(code) ||
      error?.name === 'AbortError' || error?.name === 'TimeoutError' ||
      error instanceof TypeError ||
      message.includes('failed to fetch') ||
      message.includes('networkerror') ||
      message.includes('load failed');
  }

  function normalizeFinalError(error, requestSession) {
    const status = Number(error?.httpStatus || 0);
    const code = clean(error?.code);
    if (status === 401) {
      if (currentSession() === requestSession) clear('unauthorized');
      const next = new Error('Сессия приложения истекла. Откройте приложение заново.');
      next.code = code || 'ADMIN_SESSION_EXPIRED';
      next.httpStatus = status;
      return next;
    }
    if (status === 403) {
      if (currentSession() === requestSession) clear('forbidden');
      const next = new Error('Админский доступ больше не подтверждён.');
      next.code = code || 'ADMIN_REQUIRED';
      next.httpStatus = status;
      return next;
    }
    if (code === 'ADMIN_WORKER_REQUIRED' || code === 'NO_GAS_FALLBACK_FOR_ROUTE') {
      const next = new Error('Админ-режим требует соединения с основным сервером. Откройте приложение заново.');
      next.code = 'ADMIN_WORKER_REQUIRED';
      return next;
    }
    if (isTransient(error)) {
      const next = new Error('Связь с сервером прервалась. Нажмите «Повторить».');
      next.code = 'ADMIN_NETWORK_RETRY_EXHAUSTED';
      return next;
    }
    return error || new Error('Не удалось загрузить админские данные.');
  }

  async function fetchOnce(requestSession) {
    if (!requestSession) {
      const error = new Error('Сессия приложения не готова. Откройте приложение заново.');
      error.code = 'SESSION_MISSING';
      error.httpStatus = 401;
      throw error;
    }
    const response = await fetch(`${API_URL}/admin-data`, {
      method:'GET',
      mode:'cors',
      cache:'no-store',
      headers:{ Authorization:`Bearer ${requestSession}` }
    });
    let parseFailed = false;
    const data = await response.json().catch(() => {
      parseFailed = true;
      return {};
    });
    if (!response.ok || !data?.ok || !data?.adminData) {
      const error = new Error(data?.message || `HTTP ${response.status}`);
      error.code = response.ok && (parseFailed || data?.ok !== false)
        ? 'ADMIN_DATA_INVALID_RESPONSE'
        : data?.error || `HTTP_${response.status}`;
      error.httpStatus = response.status;
      throw error;
    }
    return data;
  }

  async function request(requestSession, requestEpoch) {
    let lastError = null;
    for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
      if (RETRY_DELAYS_MS[attempt]) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
      }
      try {
        const data = await fetchOnce(requestSession);
        if (currentSession() !== requestSession || cacheEpoch !== requestEpoch) {
          const error = new Error('Сессия приложения изменилась. Повторите загрузку.');
          error.code = currentSession() !== requestSession ? 'ADMIN_SESSION_CHANGED' : 'ADMIN_CACHE_INVALIDATED';
          throw error;
        }
        return data;
      } catch (error) {
        lastError = error;
        if (!isTransient(error) || attempt === RETRY_DELAYS_MS.length - 1) break;
      }
    }
    throw normalizeFinalError(lastError, requestSession);
  }

  function load(options={}) {
    const force = options === true || options?.force === true;
    const allowStale = options?.allowStale === true;
    const commit = options?.commit !== false;
    const requestSession = currentSession();
    if (payload && payloadSession !== requestSession) clear('session-changed');
    const cached = payload && payloadSession === requestSession ? payload : null;
    if (cached && !force) return Promise.resolve(cached);

    if (!loading || loadingSession !== requestSession) {
      const operation = request(requestSession, cacheEpoch);
      loading = operation;
      loadingSession = requestSession;
      operation.finally(() => {
        if (loading === operation) {
          loading = null;
          loadingSession = '';
        }
      }).catch(() => {});
    }

    const operation = loading;
    return operation.then(data => {
      if (!commit) return data;
      if (accept(data, requestSession)) return data;
      return payloadSession === requestSession && payload ? payload : data;
    }).catch(error => {
      if (allowStale && cached && isTransient(error) && payloadSession === requestSession) return cached;
      throw error;
    });
  }

  function protect(requestId) {
    const id = clean(requestId);
    if (id) protectedRequestIds.add(id);
  }

  function release(requestId) {
    protectedRequestIds.delete(clean(requestId));
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  window.RoyalAdminDataV0600 = {
    version:VERSION,
    load,
    accept,
    clear,
    subscribe,
    isTransient,
    protect,
    release,
    get current(){ return payloadSession === currentSession() ? payload : null; },
    get loading(){ return loading; }
  };
})();
