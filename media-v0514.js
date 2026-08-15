/* Royal CRM Mini App — lazy media loader v0.5.14
 * No MutationObserver. Avatars load only when they are near the viewport.
 */
const mediaV0514AvatarCache = new Map();
const mediaV0514TeamPhotoCache = new Map();
let mediaV0514IntersectionObserver = null;

function mediaV0514BlobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('file reader'));
    reader.readAsDataURL(blob);
  });
}

async function loadAvatarImage(img) {
  if (!img || img.dataset.avatarLoaded === '1' || img.dataset.avatarLoaded === 'loading') return;
  const fileId = String(img.dataset.avatarFile || '');
  if (!fileId || !sessionToken) return;

  if (mediaV0514AvatarCache.has(fileId)) {
    img.src = mediaV0514AvatarCache.get(fileId);
    img.dataset.avatarLoaded = '1';
    return;
  }

  img.dataset.avatarLoaded = 'loading';
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
    const dataUrl = await mediaV0514BlobToDataUrl(blob);
    if (!dataUrl) throw new Error('avatar empty');
    mediaV0514AvatarCache.set(fileId, dataUrl);
    img.src = dataUrl;
    img.dataset.avatarLoaded = '1';
  } catch (error) {
    console.warn('Avatar load failed:', error?.message || error);
    img.dataset.avatarLoaded = 'error';
  }
}

function setupAvatarLoading(root) {
  const images = Array.from((root || document).querySelectorAll('img[data-avatar-file]'))
    .filter(img => img.dataset.avatarLoaded !== '1' && img.dataset.avatarLoaded !== 'loading');
  if (!images.length) return;

  if (!('IntersectionObserver' in window)) {
    images.slice(0, 12).forEach(img => loadAvatarImage(img));
    return;
  }

  if (mediaV0514IntersectionObserver) mediaV0514IntersectionObserver.disconnect();
  mediaV0514IntersectionObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      try { mediaV0514IntersectionObserver.unobserve(entry.target); } catch (_) {}
      loadAvatarImage(entry.target);
    });
  }, { rootMargin: '140px 0px' });

  images.forEach(img => mediaV0514IntersectionObserver.observe(img));
}

function mediaV0514NormalizeGame(value) {
  const raw = String(value || '').trim();
  const low = raw.toLocaleLowerCase('ru-RU');
  if (low === 'рм' || low.includes('royal match')) return 'Royal Match';
  if (low === 'рк' || low.includes('royal kingdom')) return 'Royal Kingdom';
  return raw;
}

function mediaV0514EnsureTeamPhoto(img) {
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

async function mediaV0514LoadTeamPhoto() {
  const panel = document.getElementById('panel');
  if (!panel || !sessionToken) return;
  const img = panel.querySelector('.team-photo-box .team-photo');
  const title = panel.querySelector('.team-detail-head h2');
  const gameNode = panel.querySelector('.team-detail-head .muted');
  if (!img || !title) return;

  mediaV0514EnsureTeamPhoto(img);
  const teamName = String(img.dataset.teamName || title.textContent || '').trim();
  const game = mediaV0514NormalizeGame(img.dataset.teamGame || gameNode?.textContent || '');
  if (!teamName || img.dataset.teamProxyLoaded === '1' || img.dataset.teamProxyLoaded === 'loading') return;

  const key = `${normalizeTeam(teamName)}\n${game.toLocaleLowerCase('ru-RU')}`;
  if (mediaV0514TeamPhotoCache.has(key)) {
    img.src = mediaV0514TeamPhotoCache.get(key);
    img.dataset.teamProxyLoaded = '1';
    img.parentElement?.classList.remove('photo-error');
    mediaV0514EnsureTeamPhoto(img);
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
    const dataUrl = await mediaV0514BlobToDataUrl(blob);
    if (!dataUrl) throw new Error('team photo empty');
    mediaV0514TeamPhotoCache.set(key, dataUrl);
    img.src = dataUrl;
    img.dataset.teamProxyLoaded = '1';
    img.parentElement?.classList.remove('photo-error');
    mediaV0514EnsureTeamPhoto(img);
  } catch (error) {
    console.warn('Team photo load failed:', error?.message || error);
    img.dataset.teamProxyLoaded = 'error';
    img.parentElement?.classList.add('photo-error');
  }
}

if (typeof renderTeamDetail === 'function') {
  const mediaV0514NativeRenderTeamDetail = renderTeamDetail;
  renderTeamDetail = function(teamRef) {
    const result = mediaV0514NativeRenderTeamDetail(teamRef);
    setTimeout(mediaV0514LoadTeamPhoto, 0);
    return result;
  };
}

window.__ROYAL_MEDIA_VERSION__ = '0.5.14';
