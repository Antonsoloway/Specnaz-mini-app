/* Royal CRM Mini App — media v0.5.16
 * Reliable Android-safe lazy media loader.
 * - no MutationObserver
 * - one persistent IntersectionObserver
 * - limited concurrency
 * - retries transient avatar failures
 */
const mediaV0516AvatarCache = new Map();
const mediaV0516TeamPhotoCache = new Map();
const mediaV0516AvatarQueue = [];
const mediaV0516Queued = new WeakSet();
let mediaV0516AvatarObserver = null;
let mediaV0516ActiveLoads = 0;
const MEDIA_V0516_MAX_CONCURRENT = 4;

function mediaV0516BlobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('file reader'));
    reader.readAsDataURL(blob);
  });
}

function mediaV0516NearViewport(img) {
  try {
    const r = img.getBoundingClientRect();
    const h = window.innerHeight || document.documentElement.clientHeight || 800;
    return r.bottom >= -180 && r.top <= h + 180;
  } catch (_) {
    return false;
  }
}

function mediaV0516ScheduleAvatar(img) {
  if (!img || img.dataset.avatarLoaded === '1' || img.dataset.avatarLoaded === 'loading') return;
  if (mediaV0516Queued.has(img)) return;
  mediaV0516Queued.add(img);
  mediaV0516AvatarQueue.push(img);
  mediaV0516PumpAvatarQueue();
}

function mediaV0516PumpAvatarQueue() {
  while (mediaV0516ActiveLoads < MEDIA_V0516_MAX_CONCURRENT && mediaV0516AvatarQueue.length) {
    const img = mediaV0516AvatarQueue.shift();
    if (img) mediaV0516Queued.delete(img);
    if (!img || !img.isConnected) continue;
    mediaV0516ActiveLoads += 1;
    loadAvatarImage(img).finally(() => {
      mediaV0516ActiveLoads -= 1;
      mediaV0516PumpAvatarQueue();
    });
  }
}

async function loadAvatarImage(img) {
  if (!img || img.dataset.avatarLoaded === '1' || img.dataset.avatarLoaded === 'loading') return;
  const fileId = String(img.dataset.avatarFile || '').trim();
  if (!fileId || !sessionToken) return;

  if (mediaV0516AvatarCache.has(fileId)) {
    img.src = mediaV0516AvatarCache.get(fileId);
    img.dataset.avatarLoaded = '1';
    return;
  }

  img.dataset.avatarLoaded = 'loading';
  const retries = Number(img.dataset.avatarRetries || 0);
  try {
    const response = await fetch(`${API_URL}/avatar?fileId=${encodeURIComponent(fileId)}`, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-store',
      headers: { Authorization: `Bearer ${sessionToken}` }
    });
    if (!response.ok) throw new Error(`avatar ${response.status}`);
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) throw new Error('avatar type');
    const dataUrl = await mediaV0516BlobToDataUrl(blob);
    if (!dataUrl) throw new Error('avatar empty');
    mediaV0516AvatarCache.set(fileId, dataUrl);
    img.src = dataUrl;
    img.dataset.avatarLoaded = '1';
    img.dataset.avatarRetries = '0';
  } catch (error) {
    console.warn('Avatar load failed:', error?.message || error);
    img.dataset.avatarLoaded = 'error';
    if (retries < 2 && img.isConnected) {
      img.dataset.avatarRetries = String(retries + 1);
      setTimeout(() => {
        if (!img.isConnected || img.dataset.avatarLoaded === '1') return;
        img.dataset.avatarLoaded = '';
        mediaV0516ScheduleAvatar(img);
      }, 900 * (retries + 1));
    }
  }
}

function mediaV0516EnsureObserver() {
  if (mediaV0516AvatarObserver || !('IntersectionObserver' in window)) return mediaV0516AvatarObserver;
  mediaV0516AvatarObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      try { mediaV0516AvatarObserver.unobserve(entry.target); } catch (_) {}
      mediaV0516ScheduleAvatar(entry.target);
    });
  }, { rootMargin: '220px 0px' });
  return mediaV0516AvatarObserver;
}

function setupAvatarLoading(root) {
  const images = Array.from((root || document).querySelectorAll('img[data-avatar-file]'))
    .filter(img => img.dataset.avatarLoaded !== '1' && img.dataset.avatarLoaded !== 'loading');
  if (!images.length) return;

  const observer = mediaV0516EnsureObserver();
  images.forEach(img => {
    if (mediaV0516NearViewport(img) || !observer) {
      mediaV0516ScheduleAvatar(img);
    } else {
      try { observer.observe(img); } catch (_) { mediaV0516ScheduleAvatar(img); }
    }
  });
}

function mediaV0516NormalizeGame(value) {
  const raw = String(value || '').trim();
  const low = raw.toLocaleLowerCase('ru-RU');
  if (low === 'рм' || low.includes('royal match')) return 'Royal Match';
  if (low === 'рк' || low.includes('royal kingdom')) return 'Royal Kingdom';
  return raw;
}

function mediaV0516EnsureTeamPhoto(img) {
  if (!img) return;
  const box = img.parentElement;
  img.style.setProperty('width', '100%', 'important');
  img.style.setProperty('height', 'auto', 'important');
  img.style.setProperty('max-height', 'none', 'important');
  img.style.setProperty('object-fit', 'contain', 'important');
  img.style.setProperty('display', 'block', 'important');
  if (box) {
    box.style.setProperty('height', 'auto', 'important');
    box.style.setProperty('min-height', '0', 'important');
    box.style.setProperty('overflow', 'hidden', 'important');
  }
}

async function mediaV0516LoadTeamPhoto() {
  const panel = document.getElementById('panel');
  if (!panel || !sessionToken) return;
  const img = panel.querySelector('.team-photo-box .team-photo');
  const title = panel.querySelector('.team-detail-head h2');
  const gameNode = panel.querySelector('.team-detail-head .muted');
  if (!img || !title) return;

  mediaV0516EnsureTeamPhoto(img);
  const teamName = String(img.dataset.teamName || title.textContent || '').trim();
  const game = mediaV0516NormalizeGame(img.dataset.teamGame || gameNode?.textContent || '');
  if (!teamName || img.dataset.teamProxyLoaded === '1' || img.dataset.teamProxyLoaded === 'loading') return;

  const key = `${normalizeTeam(teamName)}\n${game.toLocaleLowerCase('ru-RU')}`;
  if (mediaV0516TeamPhotoCache.has(key)) {
    img.src = mediaV0516TeamPhotoCache.get(key);
    img.dataset.teamProxyLoaded = '1';
    img.parentElement?.classList.remove('photo-error');
    mediaV0516EnsureTeamPhoto(img);
    return;
  }

  img.dataset.teamProxyLoaded = 'loading';
  try {
    img.removeAttribute('src');
    const url = new URL(`${API_URL}/team-photo`);
    url.searchParams.set('team', teamName);
    if (game) url.searchParams.set('game', game);
    const response = await fetch(url.toString(), {
      method: 'GET',
      mode: 'cors',
      cache: 'no-store',
      headers: { Authorization: `Bearer ${sessionToken}` }
    });
    if (!response.ok) throw new Error(`team photo ${response.status}`);
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) throw new Error('team photo type');
    const dataUrl = await mediaV0516BlobToDataUrl(blob);
    if (!dataUrl) throw new Error('team photo empty');
    mediaV0516TeamPhotoCache.set(key, dataUrl);
    img.src = dataUrl;
    img.dataset.teamProxyLoaded = '1';
    img.parentElement?.classList.remove('photo-error');
    mediaV0516EnsureTeamPhoto(img);
  } catch (error) {
    console.warn('Team photo load failed:', error?.message || error);
    img.dataset.teamProxyLoaded = 'error';
    img.parentElement?.classList.add('photo-error');
  }
}

if (typeof renderTeamDetail === 'function') {
  const mediaV0516NativeRenderTeamDetail = renderTeamDetail;
  renderTeamDetail = function(teamRef) {
    const result = mediaV0516NativeRenderTeamDetail(teamRef);
    setTimeout(() => {
      mediaV0516LoadTeamPhoto();
      setupAvatarLoading(document.getElementById('panel'));
    }, 0);
    return result;
  };
}

window.__ROYAL_MEDIA_VERSION__ = '0.5.16';
