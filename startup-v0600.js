/* Royal CRM Mini App — bounded startup state machine v0.6.0 */
(() => {
  'use strict';

  const VERSION = '0.6.0-startup.2';
  const MIN_BOOT_MS = 1100;
  const WELCOME_MS = 820;
  const SNAPSHOT_WAIT_MS = 6500;
  const AUTH_SLOW_MS = 12000;
  const AUTH_WATCHDOG_MS = 30000;
  const REVEAL_MS = 320;
  const startedAt = Date.now();
  const root = document.getElementById('royalStartup');
  if (!root) return;

  const title = root.querySelector('[data-startup-title]');
  const message = root.querySelector('[data-startup-message]');
  const retryButton = root.querySelector('[data-startup-retry]');
  const continueButton = root.querySelector('[data-startup-continue]');
  const video = root.querySelector('[data-startup-video]');
  const appRoots = [document.querySelector('main.app'), document.querySelector('nav.bottom-nav')].filter(Boolean);
  const reducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let state = 'boot';
  let participantName = '';
  let authComplete = false;
  let snapshotComplete = false;
  let snapshotTimer = 0;
  let slowTimer = 0;
  let watchdogTimer = 0;
  let revealTimer = 0;
  let minimumTimer = 0;
  let welcomeTimer = 0;
  let videoFallbackTimer = 0;
  let revealed = false;
  let revealing = false;
  let terminal = false;
  let flowGeneration = 0;
  let welcomeScheduled = false;
  let resolveReveal = () => {};
  const whenRevealed = new Promise(resolve => { resolveReveal = resolve; });

  function setInert(enabled) {
    appRoots.forEach(element => {
      try { element.inert = enabled; } catch (_) {}
      if (enabled) element.setAttribute('aria-hidden', 'true');
      else element.removeAttribute('aria-hidden');
    });
  }

  function clearTimer(id) {
    if (id) window.clearTimeout(id);
  }

  function clearSnapshotTimer() {
    clearTimer(snapshotTimer);
    snapshotTimer = 0;
  }

  function cancelFlowTimers() {
    clearSnapshotTimer();
    clearTimer(slowTimer);
    clearTimer(watchdogTimer);
    clearTimer(minimumTimer);
    clearTimer(welcomeTimer);
    clearTimer(revealTimer);
    slowTimer = 0;
    watchdogTimer = 0;
    minimumTimer = 0;
    welcomeTimer = 0;
    revealTimer = 0;
    welcomeScheduled = false;
  }

  function setText(element, value) {
    if (element) element.textContent = String(value || '');
  }

  function transition(next, heading, detail, force = false) {
    if (revealed || (terminal && !force)) return false;
    state = next;
    root.dataset.state = next;
    setText(title, heading);
    setText(message, detail);
    return true;
  }

  function beginSnapshotWait() {
    clearSnapshotTimer();
    const generation = flowGeneration;
    snapshotTimer = window.setTimeout(() => {
      if (!terminal && generation === flowGeneration && !snapshotComplete && authComplete) {
        showDegraded('Загрузка основных данных заняла больше обычного.');
      }
    }, SNAPSHOT_WAIT_MS);
  }

  function showDegraded(reason) {
    if (revealed || terminal || snapshotComplete) return;
    clearSnapshotTimer();
    transition(
      'degraded',
      'Данные пока не загрузились',
      `${String(reason || 'Связь с сервером прервалась')} Можно повторить загрузку или открыть приложение в ограниченном режиме.`
    );
    if (retryButton) retryButton.textContent = 'Повторить загрузку';
  }

  function showFatal(reason) {
    if (revealed || terminal) return;
    terminal = true;
    flowGeneration += 1;
    cancelFlowTimers();
    clearTimer(videoFallbackTimer);
    revealing = false;
    root.hidden = false;
    root.removeAttribute('aria-hidden');
    root.classList.remove('is-revealing');
    document.documentElement.classList.remove('royal-startup-revealing');
    document.documentElement.classList.add('royal-startup-active');
    setInert(true);
    try { video?.pause?.(); } catch (_) {}
    transition(
      'fatal',
      'Не удалось запустить приложение',
      String(reason || 'Закройте приложение и откройте его снова из бота.'),
      true
    );
    if (retryButton) retryButton.textContent = 'Открыть заново';
  }

  function emitReady() {
    const detail = { version: VERSION, degraded: !snapshotComplete };
    try { window.dispatchEvent(new CustomEvent('royal:startup-ready', { detail })); } catch (_) {}
  }

  function reveal() {
    if (revealed || revealing || terminal) return;
    const generation = flowGeneration;
    revealing = true;
    cancelFlowTimers();
    clearTimer(videoFallbackTimer);
    try { video?.pause?.(); } catch (_) {}
    setInert(false);
    document.documentElement.classList.add('royal-startup-revealing');
    root.classList.add('is-revealing');
    revealTimer = window.setTimeout(() => {
      if (terminal || generation !== flowGeneration || !revealing) return;
      revealing = false;
      revealed = true;
      root.hidden = true;
      root.setAttribute('aria-hidden', 'true');
      document.documentElement.classList.remove('royal-startup-active', 'royal-startup-revealing');
      resolveReveal({ degraded: !snapshotComplete });
      emitReady();
    }, REVEAL_MS);
  }

  function welcomeThenReveal() {
    if (revealed || revealing || terminal || state === 'welcome' || welcomeScheduled) return;
    welcomeScheduled = true;
    clearSnapshotTimer();
    const generation = flowGeneration;
    const waitForMinimum = Math.max(0, MIN_BOOT_MS - (Date.now() - startedAt));
    minimumTimer = window.setTimeout(() => {
      minimumTimer = 0;
      if (revealed || revealing || terminal || generation !== flowGeneration) return;
      const name = participantName ? `, ${participantName}` : '';
      transition(
        'welcome',
        `Добро пожаловать${name}!`,
        snapshotComplete ? 'Основные данные готовы.' : 'Открываем ограниченный режим без справочника.'
      );
      welcomeTimer = window.setTimeout(() => {
        welcomeTimer = 0;
        if (terminal || generation !== flowGeneration) return;
        reveal();
      }, WELCOME_MS);
    }, waitForMinimum);
  }

  function retrySnapshot() {
    if (state === 'fatal') {
      try { window.location.reload(); } catch (_) {}
      return;
    }
    if (!authComplete) {
      try { window.location.reload(); } catch (_) {}
      return;
    }
    snapshotComplete = false;
    transition('preload', 'Готовим приложение', 'Повторно загружаем участников и команды…');
    beginSnapshotWait();
    const reload = window.RoyalAppV0600?.reloadSnapshot;
    if (typeof reload !== 'function') {
      showDegraded('Повторная загрузка недоступна.');
      return;
    }
    Promise.resolve(reload()).catch(error => {
      showDegraded(error?.message || 'Связь с сервером прервалась.');
    });
  }

  function continueDegraded() {
    if (state !== 'degraded') return;
    welcomeThenReveal();
  }

  function handleAppEvent(type, detail = {}) {
    if (revealed || terminal) return;
    if (type === 'auth-start') {
      transition('auth', 'Проверяем доступ', 'Подтверждаем вход через Telegram…');
      return;
    }
    if (type === 'auth-ready') {
      authComplete = true;
      clearTimer(slowTimer);
      clearTimer(watchdogTimer);
      const user = detail.user || {};
      participantName = String(user.crmName || user.telegramFirstName || '').trim();
      transition('preload', 'Готовим приложение', 'Загружаем участников и команды…');
      beginSnapshotWait();
      return;
    }
    if (type === 'snapshot-start') {
      if (authComplete) {
        transition('preload', 'Готовим приложение', 'Загружаем участников и команды…');
        beginSnapshotWait();
      }
      return;
    }
    if (type === 'snapshot-ready') {
      snapshotComplete = true;
      welcomeThenReveal();
      return;
    }
    if (type === 'snapshot-error') {
      showDegraded('Основные данные временно недоступны.');
      return;
    }
    if (type === 'fatal') {
      showFatal(detail.message);
      return;
    }
    if (type === 'access-denied') {
      terminal = true;
      flowGeneration += 1;
      cancelFlowTimers();
      clearTimer(videoFallbackTimer);
      try { video?.pause?.(); } catch (_) {}
    }
  }

  function usePoster() {
    root.classList.add('video-fallback');
    try { video?.pause?.(); } catch (_) {}
  }

  function initializeVideo() {
    if (!video) return;
    if (reducedMotion) {
      usePoster();
      return;
    }
    const markReady = () => {
      clearTimer(videoFallbackTimer);
      root.classList.remove('video-fallback');
    };
    video.addEventListener('canplay', markReady, { once: true });
    video.addEventListener('playing', markReady, { once: true });
    video.addEventListener('error', usePoster, { once: true });
    videoFallbackTimer = window.setTimeout(() => {
      if (Number(video.readyState || 0) < 2) usePoster();
    }, 1800);
    try {
      const play = video.play?.();
      if (play && typeof play.catch === 'function') play.catch(usePoster);
    } catch (_) { usePoster(); }
  }

  retryButton?.addEventListener('click', retrySnapshot);
  continueButton?.addEventListener('click', continueDegraded);
  document.addEventListener('visibilitychange', () => {
    if (!video || reducedMotion || revealed || terminal) return;
    if (document.visibilityState === 'hidden') {
      try { video.pause(); } catch (_) {}
      return;
    }
    try { video.play()?.catch?.(usePoster); } catch (_) { usePoster(); }
  });
  window.addEventListener('pagehide', () => {
    terminal = true;
    flowGeneration += 1;
    cancelFlowTimers();
    clearTimer(videoFallbackTimer);
  }, { once: true });

  setInert(true);
  transition('boot', 'Загружаем приложение', 'Подготавливаем безопасный вход…');
  initializeVideo();
  slowTimer = window.setTimeout(() => {
    if (!terminal && !authComplete && !revealed) transition('auth', 'Проверяем доступ', 'Связь медленнее обычного. Продолжаем попытку…');
  }, AUTH_SLOW_MS);
  watchdogTimer = window.setTimeout(() => {
    if (!terminal && !authComplete && !revealed) showFatal('Сервер авторизации не ответил. Откройте приложение заново из бота.');
  }, AUTH_WATCHDOG_MS);

  window.RoyalStartupV0600 = {
    version: VERSION,
    handleAppEvent,
    retry: retrySnapshot,
    reveal: continueDegraded,
    whenRevealed,
    get state() { return state; },
    get ready() { return revealed; },
    get terminal() { return terminal; }
  };
  window.__ROYAL_STARTUP_VERSION__ = VERSION;
})();
