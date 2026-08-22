/* Royal CRM Mini App — per-participant background music v0.6.0 */
(() => {
  'use strict';

  const VERSION = '0.6.0-music.2';
  const STORAGE_KEY = 'royal_music_v1';
  const LOCAL_PREFIX = `${STORAGE_KEY}:participant:`;
  const PAYLOAD_VERSION = 2;
  const MEDIA_ASSET = 'background-v0600';
  const VOLUME = 0.15;
  const STORAGE_TIMEOUT_MS = 1400;
  const STORAGE_RETRIES = 1;
  const STORAGE_RETRY_DELAY_MS = 180;
  const MAX_FUTURE_SKEW_MS = 365 * 24 * 60 * 60 * 1000;
  const tg = window.Telegram?.WebApp || null;
  const cloud = tg?.CloudStorage || null;
  const device = tg?.DeviceStorage || null;
  const buttons = () => [...document.querySelectorAll('[data-royal-music-toggle]')];
  const live = document.querySelector('[data-royal-music-live]');
  const notice = document.querySelector('[data-royal-music-notice]');
  const noticeText = document.querySelector('[data-royal-music-notice-text]');
  const retryButton = document.querySelector('[data-royal-music-retry]');
  const audio = document.createElement('audio');

  let state = 'loading';
  let storageStatus = 'loading';
  let saveStatus = 'idle';
  let preference = false;
  let preferenceResolved = false;
  let authorized = false;
  let terminal = false;
  let participantKey = '';
  let telegramActive = true;
  let lifecycleGeneration = 0;
  let sourceGeneration = 0;
  let playAttempt = 0;
  let saveRevision = 0;
  let sourceAssigned = false;
  let sourcePromise = null;
  let sourceOwner = 0;
  let authorizationPromise = null;
  let authorizationKey = '';
  let objectUrl = '';
  let lastObservedTimestamp = 0;
  let lastIssuedTimestamp = 0;
  let lastFailedRecord = null;
  let writeQueue = Promise.resolve();
  const externalMedia = new Set();

  audio.id = 'royalBackgroundMusic';
  audio.dataset.royalBackgroundAudio = '1';
  audio.hidden = true;
  audio.loop = true;
  audio.preload = 'none';
  audio.volume = VOLUME;
  audio.setAttribute('aria-hidden', 'true');
  document.body.appendChild(audio);

  function opaqueParticipantKey(value) {
    const key = String(value || '').trim();
    if (!/^[A-Za-z0-9_-]{12,160}$/.test(key)) return '';
    if (/^\d+$/.test(key)) return '';
    return key;
  }

  function parseStored(value, source) {
    const raw = String(value ?? '').trim();
    if (!raw) return { status: 'missing', source };
    const legacy = raw.toLowerCase();
    if (['on', '1', 'true'].includes(legacy)) {
      return { status: 'value', source, record: { enabled: true, updatedAt: 0, version: 1, source } };
    }
    if (['off', '0', 'false'].includes(legacy)) {
      return { status: 'value', source, record: { enabled: false, updatedAt: 0, version: 1, source } };
    }
    try {
      const parsed = JSON.parse(raw);
      const now = Date.now();
      const safeNow = Number.isSafeInteger(now) && now > 0 ? now : 1;
      const maxUpdatedAt = Math.min(Number.MAX_SAFE_INTEGER - 1024, safeNow + MAX_FUTURE_SKEW_MS);
      if (parsed?.v !== PAYLOAD_VERSION || typeof parsed.enabled !== 'boolean'
        || !Number.isSafeInteger(parsed.updatedAt) || parsed.updatedAt <= 0
        || parsed.updatedAt > maxUpdatedAt) {
        return { status: 'error', source, error: 'INVALID_PREFERENCE' };
      }
      return {
        status: 'value',
        source,
        record: { enabled: parsed.enabled, updatedAt: parsed.updatedAt, version: PAYLOAD_VERSION, source }
      };
    } catch (_) {
      return { status: 'error', source, error: 'INVALID_PREFERENCE' };
    }
  }

  function serializeRecord(record) {
    return JSON.stringify({ v: PAYLOAD_VERSION, enabled: Boolean(record.enabled), updatedAt: record.updatedAt });
  }

  function storageGetOnce(storage, source) {
    if (!storage || typeof storage.getItem !== 'function') {
      return Promise.resolve({ status: 'unavailable', source });
    }
    return new Promise(resolve => {
      let settled = false;
      const finish = result => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(result);
      };
      const timer = window.setTimeout(
        () => finish({ status: 'error', source, error: 'TIMEOUT' }),
        STORAGE_TIMEOUT_MS
      );
      try {
        storage.getItem(STORAGE_KEY, (error, value) => {
          if (error) finish({ status: 'error', source, error: String(error) });
          else finish(parseStored(value, source));
        });
      } catch (error) {
        finish({ status: 'error', source, error: error?.message || 'STORAGE_READ_FAILED' });
      }
    });
  }

  function delay(ms) {
    return new Promise(resolve => window.setTimeout(resolve, ms));
  }

  async function storageGet(storage, source, generation) {
    let result = { status: 'unavailable', source };
    for (let attempt = 0; attempt <= STORAGE_RETRIES; attempt += 1) {
      result = await storageGetOnce(storage, source);
      if (generation !== lifecycleGeneration || terminal) return { status: 'cancelled', source };
      if (result.status !== 'error' || attempt === STORAGE_RETRIES) return result;
      await delay(STORAGE_RETRY_DELAY_MS);
      if (generation !== lifecycleGeneration || terminal) return { status: 'cancelled', source };
    }
    return result;
  }

  function storageSetOnce(storage, value, source) {
    if (!storage || typeof storage.setItem !== 'function') {
      return Promise.resolve({ status: 'unavailable', source });
    }
    return new Promise(resolve => {
      let settled = false;
      const finish = result => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(result);
      };
      const timer = window.setTimeout(
        () => finish({ status: 'error', source, error: 'TIMEOUT' }),
        STORAGE_TIMEOUT_MS
      );
      try {
        storage.setItem(STORAGE_KEY, value, (error, stored) => {
          finish(error || stored === false
            ? { status: 'error', source, error: String(error || 'NOT_STORED') }
            : { status: 'success', source });
        });
      } catch (error) {
        finish({ status: 'error', source, error: error?.message || 'STORAGE_WRITE_FAILED' });
      }
    });
  }

  async function storageSet(storage, value, source) {
    let result = { status: 'unavailable', source };
    for (let attempt = 0; attempt <= STORAGE_RETRIES; attempt += 1) {
      result = await storageSetOnce(storage, value, source);
      if (result.status !== 'error' || attempt === STORAGE_RETRIES) return result;
      await delay(STORAGE_RETRY_DELAY_MS);
    }
    return result;
  }

  function localStorageKey(key = participantKey) {
    return key ? `${LOCAL_PREFIX}${key}` : '';
  }

  function readLocalPreference(key) {
    const storageKey = localStorageKey(key);
    if (!storageKey) return { status: 'unavailable', source: 'local' };
    try {
      const storage = window.localStorage;
      if (!storage) return { status: 'unavailable', source: 'local' };
      return parseStored(storage.getItem(storageKey), 'local');
    }
    catch (error) { return { status: 'error', source: 'local', error: error?.message || 'LOCAL_READ_FAILED' }; }
  }

  function writeLocalPreference(key, value) {
    const storageKey = localStorageKey(key);
    if (!storageKey) return { status: 'unavailable', source: 'local' };
    try {
      const storage = window.localStorage;
      if (!storage) return { status: 'unavailable', source: 'local' };
      storage.setItem(storageKey, value);
      return { status: 'success', source: 'local' };
    } catch (error) {
      return { status: 'error', source: 'local', error: error?.message || 'LOCAL_WRITE_FAILED' };
    }
  }

  function pickWinner(results) {
    const records = results.filter(item => item.status === 'value').map(item => item.record);
    const versioned = records.filter(record => record.version === PAYLOAD_VERSION);
    if (versioned.length) {
      const sourceRank = { cloud: 3, device: 2, local: 1 };
      return versioned.sort((left, right) => (
        right.updatedAt - left.updatedAt
        || Number(left.enabled) - Number(right.enabled)
        || (sourceRank[right.source] || 0) - (sourceRank[left.source] || 0)
      ))[0];
    }
    const legacyRank = { cloud: 3, device: 2, local: 1 };
    return records.sort((left, right) => (legacyRank[right.source] || 0) - (legacyRank[left.source] || 0))[0] || null;
  }

  function nextRecord(enabled) {
    const clock = Date.now();
    const now = Number.isSafeInteger(clock) && clock > 0 ? clock : 1;
    const updatedAt = Math.max(now, lastObservedTimestamp + 1, lastIssuedTimestamp + 1);
    lastIssuedTimestamp = updatedAt;
    lastObservedTimestamp = Math.max(lastObservedTimestamp, updatedAt);
    return { enabled: Boolean(enabled), updatedAt, version: PAYLOAD_VERSION };
  }

  function labels() {
    if (state === 'loading') return { icon: '⏳', label: 'Загружаем настройку музыки' };
    if (saveStatus === 'saving') {
      return { icon: '⏳', label: preference ? 'Музыка включена. Сохраняем настройку' : 'Музыка выключена. Сохраняем настройку' };
    }
    if (state === 'storage-error') return { icon: '🔇', label: 'Настройка недоступна. Включить музыку' };
    if (state === 'starting') return { icon: '⏳', label: 'Музыка загружается. Нажмите, чтобы выключить' };
    if (state === 'off') return { icon: '🔇', label: 'Включить музыку' };
    if (state === 'blocked') return { icon: '🔈', label: 'Включить звук' };
    if (state === 'error') return { icon: '⚠️', label: 'Повторить запуск музыки' };
    return { icon: '🔊', label: 'Выключить музыку' };
  }

  function render() {
    const copy = labels();
    buttons().forEach(button => {
      button.textContent = copy.icon;
      button.dataset.musicState = state;
      button.dataset.musicStorageState = ['error', 'degraded'].includes(saveStatus) ? saveStatus : storageStatus;
      button.disabled = state === 'loading';
      button.setAttribute('aria-label', copy.label);
      button.setAttribute('title', copy.label);
      button.setAttribute('aria-pressed', preferenceResolved ? String(Boolean(preference)) : 'mixed');
    });
    renderNotice();
  }

  function renderNotice() {
    if (!notice || !noticeText) return;
    let message = '';
    let canRetry = false;
    if (saveStatus === 'error') {
      message = 'Музыка изменена, но сохранить настройку не удалось.';
      canRetry = Boolean(lastFailedRecord);
    } else if (saveStatus === 'degraded') {
      message = 'Настройка музыки применена, но синхронизация между устройствами не выполнена.';
      canRetry = Boolean(lastFailedRecord);
    } else if (storageStatus === 'read-error' && saveStatus !== 'saving') {
      message = 'Не удалось проверить сохранённую настройку. Музыка выключена; при необходимости включите её кнопкой звука.';
    }
    noticeText.textContent = message;
    notice.hidden = !message;
    if (retryButton) retryButton.hidden = !canRetry;
  }

  function announce(value) {
    if (live) live.textContent = String(value || '');
  }

  function setState(next) {
    state = next;
    render();
  }

  function isCurrent(generation, key = participantKey) {
    return !terminal && generation === lifecycleGeneration && key === participantKey;
  }

  function clearSource() {
    sourceGeneration += 1;
    playAttempt += 1;
    try { audio.pause(); } catch (_) {}
    try { window.RoyalAppV0600?.releaseProtectedMedia?.(MEDIA_ASSET); } catch (_) {}
    try { audio.removeAttribute('src'); audio.load?.(); } catch (_) {}
    objectUrl = '';
    sourceAssigned = false;
    sourcePromise = null;
    sourceOwner = 0;
  }

  async function ensureSource(generation) {
    if (sourceAssigned && sourceOwner === generation) return true;
    if (!isCurrent(generation) || !authorized || !preference) return false;
    const sourceRevision = sourceGeneration;
    if (sourcePromise?.generation === generation && sourcePromise.sourceRevision === sourceRevision) {
      return sourcePromise.promise;
    }
    const load = (async () => {
      const loadProtectedAudio = window.RoyalAppV0600?.fetchProtectedMediaObjectUrl;
      if (typeof loadProtectedAudio !== 'function') throw new Error('PROTECTED_AUDIO_LOADER_MISSING');
      const loadedUrl = await loadProtectedAudio(MEDIA_ASSET);
      if (!isCurrent(generation) || sourceRevision !== sourceGeneration || !authorized || !preference) return false;
      if (!/^blob:/.test(String(loadedUrl || ''))) throw new Error('PROTECTED_AUDIO_INVALID');
      objectUrl = loadedUrl;
      audio.preload = 'metadata';
      audio.src = objectUrl;
      sourceAssigned = true;
      sourceOwner = generation;
      try { audio.load?.(); } catch (_) {}
      return true;
    })();
    const tracked = load.finally(() => {
      if (sourcePromise?.promise === tracked) sourcePromise = null;
    });
    sourcePromise = { generation, sourceRevision, promise: tracked };
    return tracked;
  }

  function pruneExternalMedia() {
    externalMedia.forEach(media => {
      const detached = media?.isConnected === false
        || (typeof document.contains === 'function' && !document.contains(media));
      if (detached || media?.paused === true || media?.ended === true) externalMedia.delete(media);
    });
  }

  function canPlayNow() {
    pruneExternalMedia();
    return document.visibilityState !== 'hidden' && telegramActive && externalMedia.size === 0;
  }

  function pauseForLifecycle() {
    if (!authorized || !preference) return;
    playAttempt += 1;
    try { audio.pause(); } catch (_) {}
    setState('paused');
  }

  async function attemptPlay(fromGesture = false) {
    const generation = lifecycleGeneration;
    if (!isCurrent(generation) || !authorized || !preference) return false;
    if (!canPlayNow()) {
      pauseForLifecycle();
      return false;
    }
    const attempt = ++playAttempt;
    setState('starting');
    try {
      const ready = await ensureSource(generation);
      if (!ready || !isCurrent(generation) || attempt !== playAttempt || !preference) return false;
      const result = audio.play();
      if (result && typeof result.then === 'function') await result;
      if (!isCurrent(generation) || attempt !== playAttempt || !preference) return false;
      setState('playing');
      if (fromGesture) announce('Музыка включена.');
      return true;
    } catch (error) {
      if (!isCurrent(generation) || attempt !== playAttempt || !preference) return false;
      const blocked = error?.name === 'NotAllowedError' || /gesture|notallowed|autoplay/i.test(String(error?.message || ''));
      setState(blocked ? 'blocked' : 'error');
      if (fromGesture) announce(blocked ? 'Telegram не разрешил автозапуск. Нажмите ещё раз.' : 'Не удалось запустить музыку.');
      return false;
    }
  }

  async function executePreferenceWrite(record, key) {
    const value = serializeRecord(record);
    const [cloudResult, deviceResult] = await Promise.all([
      storageSet(cloud, value, 'cloud'),
      storageSet(device, value, 'device')
    ]);
    const localResult = writeLocalPreference(key, value);
    const fallbackSucceeded = [deviceResult, localResult].some(result => result.status === 'success');
    let outcome = 'failed';
    if (cloudResult.status === 'success') outcome = 'synced';
    else if (cloudResult.status === 'unavailable' && fallbackSucceeded) outcome = 'local-only';
    else if (cloudResult.status === 'error' && fallbackSucceeded) outcome = 'degraded';
    return {
      ok: outcome !== 'failed',
      outcome,
      cloudResult,
      deviceResult,
      localResult
    };
  }

  function persistPreference(record, retry = false) {
    const generation = lifecycleGeneration;
    const key = participantKey;
    const revision = ++saveRevision;
    saveStatus = 'saving';
    lastFailedRecord = null;
    render();
    const task = writeQueue.catch(() => {}).then(() => executePreferenceWrite(record, key));
    writeQueue = task;
    return task.then(result => {
      if (!isCurrent(generation, key) || revision !== saveRevision) return { ...result, stale: true };
      if (result.outcome === 'synced') {
        saveStatus = 'idle';
        storageStatus = 'ready';
        announce(retry ? 'Настройка сохранена после повторной попытки.' : 'Настройка сохранена.');
      } else if (result.outcome === 'local-only') {
        saveStatus = 'idle';
        storageStatus = 'local-only';
        announce('Настройка сохранена на этом устройстве.');
      } else if (result.outcome === 'degraded') {
        saveStatus = 'degraded';
        storageStatus = 'degraded';
        lastFailedRecord = record;
        announce('Настройка действует, но синхронизация между устройствами не выполнена.');
      } else {
        saveStatus = 'error';
        lastFailedRecord = record;
        announce('Музыка изменена, но настройку сохранить не удалось. Нажмите «Повторить сохранение».');
      }
      render();
      return result;
    }, () => {
      if (isCurrent(generation, key) && revision === saveRevision) {
        saveStatus = 'error';
        lastFailedRecord = record;
        announce('Музыка изменена, но настройку сохранить не удалось. Нажмите «Повторить сохранение».');
        render();
      }
      return { ok: false };
    });
  }

  function retrySave() {
    if (!['error', 'degraded'].includes(saveStatus) || !lastFailedRecord) return;
    void persistPreference(nextRecord(preference), true);
  }

  function turnOff() {
    preference = false;
    preferenceResolved = true;
    clearSource();
    setState('off');
    announce('Музыка выключена.');
    void persistPreference(nextRecord(false));
  }

  function turnOn() {
    preference = true;
    preferenceResolved = true;
    setState('paused');
    announce('Музыка включается.');
    void persistPreference(nextRecord(true));
    void attemptPlay(true);
  }

  function toggle() {
    if (!preferenceResolved || state === 'loading') return;
    if (!preference) {
      turnOn();
      return;
    }
    if (state === 'blocked' || state === 'error') {
      void attemptPlay(true);
      return;
    }
    turnOff();
  }

  async function reconcileHealthy(results, winner, generation, key) {
    if (!winner || !isCurrent(generation, key)) return null;
    const record = winner.version === PAYLOAD_VERSION
      ? { enabled: winner.enabled, updatedAt: winner.updatedAt, version: PAYLOAD_VERSION }
      : nextRecord(winner.enabled);
    const value = serializeRecord(record);
    const needsWrite = source => {
      const result = results.find(item => item.source === source);
      return result?.status !== 'value' || result.record.version !== PAYLOAD_VERSION
        || result.record.updatedAt !== record.updatedAt || result.record.enabled !== record.enabled;
    };
    const needed = {
      cloud: needsWrite('cloud'),
      device: needsWrite('device'),
      local: needsWrite('local')
    };
    const writes = [];
    if (needed.cloud) writes.push(storageSet(cloud, value, 'cloud'));
    if (needed.device) writes.push(storageSet(device, value, 'device'));
    if (needed.local) writes.push(Promise.resolve(writeLocalPreference(key, value)));
    const writeResults = await Promise.all(writes);
    return {
      record,
      needed,
      results: Object.fromEntries(writeResults.map(result => [result.source, result]))
    };
  }

  function scheduleReconcile(results, winner, generation, key) {
    const revision = saveRevision;
    const task = writeQueue.catch(() => {}).then(() => reconcileHealthy(results, winner, generation, key));
    writeQueue = task;
    task.then(result => {
      if (!result || !isCurrent(generation, key) || revision !== saveRevision) return;
      const cloudResult = result.results.cloud;
      if (result.needed.cloud && cloudResult?.status === 'error') {
        saveStatus = 'degraded';
        storageStatus = 'degraded';
        lastFailedRecord = result.record;
        announce('Настройка действует, но синхронизация между устройствами не выполнена.');
      } else if (result.needed.cloud && cloudResult?.status === 'unavailable') {
        storageStatus = 'local-only';
        announce('Настройка доступна на этом устройстве.');
      }
      render();
    }).catch(() => {});
  }

  async function authorize(key) {
    const safeKey = opaqueParticipantKey(key);
    if (terminal) return false;
    if (authorized && safeKey === participantKey && preferenceResolved) return preference;
    if (authorizationPromise && safeKey === authorizationKey) return authorizationPromise;

    lifecycleGeneration += 1;
    const generation = lifecycleGeneration;
    participantKey = safeKey;
    authorizationKey = safeKey;
    authorized = false;
    preference = false;
    preferenceResolved = false;
    storageStatus = 'loading';
    saveStatus = 'idle';
    lastFailedRecord = null;
    clearSource();
    setState('loading');

    const pending = (async () => {
      const localResult = readLocalPreference(safeKey);
      const remoteResults = await Promise.all([
        storageGet(cloud, 'cloud', generation),
        storageGet(device, 'device', generation)
      ]);
      if (!isCurrent(generation, safeKey)) return false;
      const results = [...remoteResults, localResult];
      if (results.some(result => result.status === 'cancelled')) return false;
      const winner = pickWinner(results);
      results.filter(result => result.status === 'value' && result.record.version === PAYLOAD_VERSION)
        .forEach(result => { lastObservedTimestamp = Math.max(lastObservedTimestamp, result.record.updatedAt); });
      const hasReadError = results.some(result => result.status === 'error');

      if (hasReadError) {
        preference = false;
        preferenceResolved = true;
        authorized = true;
        storageStatus = 'read-error';
        setState('storage-error');
        announce(winner?.enabled === false
          ? 'Музыка выключена. Не все сохранённые настройки удалось проверить.'
          : 'Не удалось проверить настройку музыки. Для безопасности музыка не запущена.');
        return false;
      }

      preference = winner ? winner.enabled : true;
      preferenceResolved = true;
      authorized = true;
      storageStatus = 'ready';
      if (winner) scheduleReconcile(results, winner, generation, safeKey);

      if (!preference) {
        setState('off');
        return false;
      }
      setState('paused');
      const startupReady = window.RoyalStartupV0600?.whenRevealed;
      if (startupReady && typeof startupReady.then === 'function') {
        try { await startupReady; } catch (_) { return false; }
      }
      if (!isCurrent(generation, safeKey) || !authorized || !preference) return false;
      return attemptPlay(false);
    })();
    let tracked = null;
    tracked = pending.finally(() => {
      if (authorizationPromise === tracked) authorizationPromise = null;
    });
    authorizationPromise = tracked;
    return tracked;
  }

  function stop() {
    terminal = true;
    lifecycleGeneration += 1;
    authorized = false;
    authorizationPromise = null;
    authorizationKey = '';
    saveRevision += 1;
    saveStatus = 'idle';
    clearSource();
    setState(preferenceResolved && !preference ? 'off' : 'paused');
  }

  function handleAppEvent(type, detail = {}) {
    if (type === 'auth-ready') {
      void authorize(detail.user?.participantKey || '');
      return;
    }
    if (type === 'fatal' || type === 'access-denied') stop();
  }

  document.addEventListener('click', event => {
    const retry = event.target?.closest?.('[data-royal-music-retry]');
    if (retry) {
      event.preventDefault();
      event.stopPropagation();
      retrySave();
      return;
    }
    const button = event.target?.closest?.('[data-royal-music-toggle]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    toggle();
  }, true);

  document.addEventListener('visibilitychange', () => {
    if (!authorized || !preference) return;
    if (document.visibilityState === 'hidden') pauseForLifecycle();
    else {
      pruneExternalMedia();
      void attemptPlay(false);
    }
  });

  document.addEventListener('play', event => {
    const media = event.target;
    if (!media || media === audio || media.dataset?.startupVideo === '1' || media.muted) return;
    if (!/^(AUDIO|VIDEO)$/.test(String(media.tagName || ''))) return;
    externalMedia.add(media);
    pauseForLifecycle();
  }, true);

  const releaseExternalMedia = event => {
    if (!externalMedia.delete(event.target) || externalMedia.size) return;
    if (authorized && preference) void attemptPlay(false);
  };
  document.addEventListener('pause', releaseExternalMedia, true);
  document.addEventListener('ended', releaseExternalMedia, true);

  if (tg && typeof tg.onEvent === 'function') {
    try {
      tg.onEvent('deactivated', () => {
        telegramActive = false;
        pauseForLifecycle();
      });
      tg.onEvent('activated', () => {
        telegramActive = true;
        pruneExternalMedia();
        if (authorized && preference) void attemptPlay(false);
      });
    } catch (_) {}
  }

  audio.addEventListener('playing', () => {
    if (authorized && preference && !terminal) setState('playing');
  });
  audio.addEventListener('error', () => {
    if (authorized && preference && !terminal) setState('error');
  });
  window.addEventListener('pagehide', stop, { once: true });

  render();
  window.RoyalMusicV0600 = {
    version: VERSION,
    storageKey: STORAGE_KEY,
    handleAppEvent,
    authorize,
    toggle,
    retry: retrySave,
    pause: pauseForLifecycle,
    resume: () => attemptPlay(false),
    getState: () => ({
      state, storageStatus, saveStatus, preference, preferenceResolved, authorized,
      sourceAssigned, volume: audio.volume, mediaAsset: MEDIA_ASSET
    })
  };
  window.__ROYAL_MUSIC_VERSION__ = VERSION;
})();
