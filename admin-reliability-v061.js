/* Royal CRM Mini App v0.6.1 — admin reliability: media queue, save retries, active-team mole */
(() => {
  'use strict';
  if (String(window.__ROYAL_BUILD__ || '') !== '0.6.1') return;
  if (window.__ROYAL_ADMIN_RELIABILITY_V061__) return;

  const VERSION = '0.6.1-admin-reliability.1';
  const PHOTO_CONCURRENCY = 3;
  const PHOTO_RETRY_MS = [650, 1400, 2800];
  const WRITE_RETRY_MS = [700, 1500, 3000, 5200];
  const TRANSIENT_HTTP = new Set([408, 425, 429, 502, 503, 504]);
  const upstreamFetch = window.fetch.bind(window);
  const photoQueue = [];
  const photoPending = new Map();
  const photoObserved = new WeakSet();
  let photoActive = 0;
  let imageObserver = null;
  let mutationTimer = 0;
  let lastMoleRefresh = 0;

  const clean = value => String(value == null ? '' : value).trim();
  const sleep = ms => new Promise(resolve => window.setTimeout(resolve, ms));

  function urlString(input) {
    try {
      if (typeof input === 'string') return input;
      if (input instanceof URL) return input.toString();
      return clean(input?.url);
    } catch (_) { return ''; }
  }

  function methodOf(input, init) {
    return clean(init?.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();
  }

  function pathOf(raw) {
    try { return new URL(raw, window.location.href).pathname; }
    catch (_) { return ''; }
  }

  function transientStatus(status) {
    return TRANSIENT_HTTP.has(Number(status || 0));
  }

  async function retryingFetch(input, init, delays, kind) {
    let lastError = null;
    const maxAttempts = delays.length + 1;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const response = await upstreamFetch(input, init);
        if (!transientStatus(response.status) || attempt >= delays.length) return response;
        try { await response.body?.cancel?.(); } catch (_) {}
        lastError = new Error(`${kind || 'request'} HTTP ${response.status}`);
        lastError.httpStatus = response.status;
      } catch (error) {
        lastError = error;
        if (attempt >= delays.length) throw error;
      }
      await sleep(delays[attempt]);
    }
    throw lastError || new Error(`${kind || 'request'} failed`);
  }

  function headerValue(init, name) {
    try {
      const headers = new Headers(init?.headers || {});
      return clean(headers.get(name));
    } catch (_) { return ''; }
  }

  function photoKey(raw, init) {
    return `${raw}\n${headerValue(init, 'Authorization')}`;
  }

  function photoIdentity(raw) {
    try {
      const url = new URL(raw, window.location.href);
      return {
        name: clean(url.searchParams.get('team')),
        game: clean(url.searchParams.get('game'))
      };
    } catch (_) { return { name:'', game:'' }; }
  }

  function sameTeamImage(img, ref) {
    if (!(img instanceof HTMLImageElement) || !ref?.name) return false;
    const name = clean(img.dataset.teamName);
    const game = clean(img.dataset.teamGame);
    return name === ref.name && (!ref.game || !game || game === ref.game);
  }

  function matchingAdminImages(ref) {
    if (!ref?.name) return [];
    return [...document.querySelectorAll('img[data-admin-media-kind="team"][data-team-name]')]
      .filter(img => sameTeamImage(img, ref));
  }

  function photoPriority(job) {
    const ref = photoIdentity(job.raw);
    const images = matchingAdminImages(ref);
    if (!images.length) return 9;
    if (images.some(img => img.closest('.royal-admin-team-detail-shell'))) return 0;
    const h = Math.max(1, Number(window.innerHeight || document.documentElement.clientHeight || 800));
    for (const img of images) {
      const rect = img.getBoundingClientRect();
      if (rect.bottom >= -500 && rect.top <= h + 900) return 1;
    }
    return 5;
  }

  function prunePhotoQueue() {
    const now = Date.now();
    for (let i = photoQueue.length - 1; i >= 0; i -= 1) {
      const job = photoQueue[i];
      if (photoPriority(job) !== 9 || now - job.createdAt < 1800) continue;
      photoQueue.splice(i, 1);
      job.reject(new DOMException('Admin team photo target is no longer visible', 'AbortError'));
    }
  }

  function nextPhotoJob() {
    prunePhotoQueue();
    if (!photoQueue.length) return null;
    let bestIndex = -1;
    let bestPriority = 99;
    for (let i = 0; i < photoQueue.length; i += 1) {
      const priority = photoPriority(photoQueue[i]);
      if (priority < bestPriority) {
        bestPriority = priority;
        bestIndex = i;
        if (priority === 0) break;
      }
    }
    // Do not spend network/admin checks on far-offscreen list images. They stay
    // queued and become eligible automatically when the user scrolls near them.
    if (bestIndex < 0 || bestPriority > 1) return null;
    return photoQueue.splice(bestIndex, 1)[0];
  }

  function pumpPhotoQueue() {
    while (photoActive < PHOTO_CONCURRENCY) {
      const job = nextPhotoJob();
      if (!job) break;
      photoActive += 1;
      retryingFetch(job.input, job.init, PHOTO_RETRY_MS, 'admin-team-photo')
        .then(job.resolve, job.reject)
        .finally(() => {
          photoActive -= 1;
          pumpPhotoQueue();
        });
    }
  }

  function queuedAdminPhoto(input, init, raw) {
    const key = photoKey(raw, init);
    const existing = photoPending.get(key);
    if (existing) return existing.then(response => response.clone());

    let resolveJob;
    let rejectJob;
    const task = new Promise((resolve, reject) => {
      resolveJob = resolve;
      rejectJob = reject;
    });
    photoPending.set(key, task);
    photoQueue.push({
      key, raw, input, init,
      createdAt:Date.now(),
      resolve:resolveJob,
      reject:rejectJob
    });
    task.finally(() => {
      if (photoPending.get(key) === task) photoPending.delete(key);
    }).catch(() => {});
    pumpPhotoQueue();
    return task.then(response => response.clone());
  }

  window.fetch = function royalV061AdminReliabilityFetch(input, init) {
    const raw = urlString(input);
    const method = methodOf(input, init);
    const path = pathOf(raw);

    if (method === 'GET' && path === '/admin-team-photo') {
      return queuedAdminPhoto(input, init || {}, raw);
    }

    // Admin write bodies already carry one requestId. Reusing the exact same
    // request body across bounded transport/edge retries is therefore idempotent
    // even when the first HTTP response was lost after a server commit.
    if (method === 'POST' && path === '/admin-write' &&
        typeof input === 'string' && typeof init?.body === 'string') {
      return retryingFetch(input, init, WRITE_RETRY_MS, 'admin-write');
    }

    return upstreamFetch(input, init);
  };

  function revealIfLoaded(img) {
    if (!(img instanceof HTMLImageElement) || !img.naturalWidth) return;
    img.closest('.royal-admin-team-thumbnail')?.classList.remove('fallback');
    img.closest('.team-photo-box')?.classList.remove('photo-error');
  }

  function requestAdminPhoto(img, attempt = 0) {
    if (!(img instanceof HTMLImageElement) || !img.isConnected) return;
    revealIfLoaded(img);
    if (img.naturalWidth) return;
    let promise = null;
    try { promise = window.RoyalAdminPersistentMediaV0600?.loadTeam?.(img); } catch (_) {}
    Promise.resolve(promise).catch(() => false).finally(() => {
      revealIfLoaded(img);
      if (!img.isConnected || img.naturalWidth || attempt >= 2) return;
      window.setTimeout(() => {
        if (img.isConnected && !img.naturalWidth) requestAdminPhoto(img, attempt + 1);
      }, 900 + attempt * 900);
    });
  }

  function ensureImageObserver() {
    if (imageObserver || !('IntersectionObserver' in window)) return;
    imageObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const img = entry.target;
        imageObserver.unobserve(img);
        requestAdminPhoto(img, 0);
        pumpPhotoQueue();
      });
    }, { rootMargin:'700px 0px' });
  }

  function observeAdminPhoto(img) {
    if (!(img instanceof HTMLImageElement) || photoObserved.has(img)) return;
    photoObserved.add(img);
    img.addEventListener('load', () => revealIfLoaded(img));
    if (img.closest('.royal-admin-team-detail-shell')) {
      requestAdminPhoto(img, 0);
      return;
    }
    ensureImageObserver();
    if (imageObserver) imageObserver.observe(img);
    else requestAdminPhoto(img, 0);
  }

  function decorateAdminPhotos(root = document) {
    const selector = 'img[data-admin-media-kind="team"][data-team-name]';
    if (root?.matches?.(selector)) observeAdminPhoto(root);
    root?.querySelectorAll?.(selector)?.forEach(observeAdminPhoto);
  }

  function refreshActiveTeamMole() {
    const shell = document.querySelector('.royal-admin-team-detail-shell');
    if (!shell) return;
    const now = Date.now();
    if (now - lastMoleRefresh < 30) return;
    lastMoleRefresh = now;
    try { window.RoyalActiveTeams?.refresh?.(); } catch (_) {}
    window.setTimeout(() => {
      if (!shell.isConnected) return;
      try { window.RoyalActiveTeams?.refresh?.(); } catch (_) {}
    }, 90);
  }

  function decorate(root = document) {
    decorateAdminPhotos(root);
    const hasDetail = root?.matches?.('.royal-admin-team-detail-shell') ||
      root?.querySelector?.('.royal-admin-team-detail-shell') ||
      document.querySelector('.royal-admin-team-detail-shell');
    if (hasDetail) window.requestAnimationFrame(refreshActiveTeamMole);
    pumpPhotoQueue();
  }

  const observer = new MutationObserver(records => {
    let relevant = false;
    for (const record of records) {
      for (const node of record.addedNodes || []) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.('.royal-admin-team-detail-shell,img[data-admin-media-kind="team"],[data-admin-team="1"]') ||
            node.querySelector?.('.royal-admin-team-detail-shell,img[data-admin-media-kind="team"],[data-admin-team="1"]')) {
          relevant = true;
          decorate(node);
        }
      }
    }
    if (!relevant) return;
    if (mutationTimer) window.clearTimeout(mutationTimer);
    mutationTimer = window.setTimeout(() => { mutationTimer = 0; decorate(document); }, 120);
  });
  observer.observe(document.body, { childList:true, subtree:true });

  const wakePhotoQueue = () => {
    pumpPhotoQueue();
    decorateAdminPhotos(document);
  };
  window.addEventListener('scroll', wakePhotoQueue, { passive:true, capture:true });
  window.addEventListener('resize', wakePhotoQueue, { passive:true });
  window.addEventListener('pageshow', () => decorate(document));
  window.addEventListener('royal:snapshot-ready', () => decorate(document));

  decorate(document);
  [120, 400, 1000, 2200].forEach(delay => window.setTimeout(() => decorate(document), delay));

  window.__ROYAL_ADMIN_RELIABILITY_V061__ = {
    version:VERSION,
    refresh:() => decorate(document),
    photoQueue:() => ({ active:photoActive, queued:photoQueue.length, pending:photoPending.size })
  };
})();
