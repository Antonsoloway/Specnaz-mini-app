// Android/Telegram WebView media compatibility patch — v0.5.1
const MEDIA_FIX_VERSION = '0.5.1';
const mediaAvatarCache = new Map();
const mediaTeamPhotoCache = new Map();

function mediaBlobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('file reader'));
    reader.readAsDataURL(blob);
  });
}

// Override v0.5.0 avatar loader: no IntersectionObserver, no blob: URLs.
async function loadAvatarImage(img) {
  if (!img || img.dataset.avatarLoaded === '1' || img.dataset.avatarLoaded === 'loading') return;

  const fileId = String(img.dataset.avatarFile || '');
  if (!fileId || !sessionToken) return;

  if (mediaAvatarCache.has(fileId)) {
    img.src = mediaAvatarCache.get(fileId);
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
    if (!blob.type.startsWith('image/')) throw new Error(`avatar type ${blob.type || 'missing'}`);

    const dataUrl = await mediaBlobToDataUrl(blob);
    if (!dataUrl) throw new Error('avatar empty');

    mediaAvatarCache.set(fileId, dataUrl);
    img.src = dataUrl;
    img.dataset.avatarLoaded = '1';
  } catch (error) {
    console.warn('Avatar load failed:', error?.message || 'unknown');
    img.dataset.avatarLoaded = 'error';
  }
}

function setupAvatarLoading(root) {
  const images = [...(root || document).querySelectorAll('img[data-avatar-file]')];
  images.forEach(img => loadAvatarImage(img));
}

async function mediaLoadTeamPhoto() {
  const panel = document.getElementById('panel');
  if (!panel || !sessionToken) return;

  const img = panel.querySelector('.team-photo-box .team-photo');
  const title = panel.querySelector('.team-detail-head h2');
  if (!img || !title) return;

  const teamName = String(title.textContent || '').trim();
  if (!teamName || img.dataset.teamProxyLoaded === '1' || img.dataset.teamProxyLoaded === 'loading') return;

  const key = normalizeTeam(teamName);
  if (mediaTeamPhotoCache.has(key)) {
    img.src = mediaTeamPhotoCache.get(key);
    img.dataset.teamProxyLoaded = '1';
    img.parentElement?.classList.remove('photo-error');
    return;
  }

  img.dataset.teamProxyLoaded = 'loading';

  try {
    // Stop relying on the temporary googleusercontent URL embedded in snapshot.
    img.removeAttribute('src');

    const response = await fetch(`${API_URL}/team-photo?team=${encodeURIComponent(teamName)}`, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-store',
      headers: { Authorization: `Bearer ${sessionToken}` }
    });

    if (!response.ok) throw new Error(`team photo ${response.status}`);

    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) throw new Error(`team photo type ${blob.type || 'missing'}`);

    const dataUrl = await mediaBlobToDataUrl(blob);
    if (!dataUrl) throw new Error('team photo empty');

    mediaTeamPhotoCache.set(key, dataUrl);
    img.src = dataUrl;
    img.dataset.teamProxyLoaded = '1';
    img.parentElement?.classList.remove('photo-error');
  } catch (error) {
    console.warn('Team photo load failed:', error?.message || 'unknown');
    img.dataset.teamProxyLoaded = 'error';
    img.parentElement?.classList.add('photo-error');
  }
}

function mediaRefresh() {
  setupAvatarLoading(document.getElementById('panel'));
  mediaLoadTeamPhoto();
}

const mediaPanel = document.getElementById('panel');
if (mediaPanel && 'MutationObserver' in window) {
  const mediaObserver = new MutationObserver(() => {
    queueMicrotask(mediaRefresh);
  });
  mediaObserver.observe(mediaPanel, { childList: true, subtree: true });
}

queueMicrotask(mediaRefresh);
