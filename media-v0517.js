/* Royal CRM Mini App — media v0.5.17
 * Participant avatars are requested ONLY by Telegram ID.
 */
const mediaV0517AvatarCache = new Map();
const mediaV0517TeamPhotoCache = new Map();
const mediaV0517Queue = [];
const mediaV0517Queued = new WeakSet();
let mediaV0517Active = 0;
const MEDIA_V0517_CONCURRENCY = 4;

function mediaV0517BlobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('file reader'));
    reader.readAsDataURL(blob);
  });
}

function mediaV0517TelegramIdForImage(img) {
  const holder = img?.closest?.('[data-telegram-id]');
  const id = String(holder?.dataset?.telegramId || '').trim();
  return /^\d+$/.test(id) ? id : '';
}

function mediaV0517Schedule(img) {
  if (!img || img.dataset.avatarLoaded === '1' || img.dataset.avatarLoaded === 'loading') return;
  if (!mediaV0517TelegramIdForImage(img) || mediaV0517Queued.has(img)) return;
  mediaV0517Queued.add(img);
  mediaV0517Queue.push(img);
  mediaV0517Pump();
}

function mediaV0517Pump() {
  while (mediaV0517Active < MEDIA_V0517_CONCURRENCY && mediaV0517Queue.length) {
    const img = mediaV0517Queue.shift();
    if (!img || !img.isConnected) continue;
    mediaV0517Active += 1;
    loadAvatarImage(img).finally(() => {
      mediaV0517Active -= 1;
      mediaV0517Pump();
    });
  }
}

async function loadAvatarImage(img) {
  if (!img || img.dataset.avatarLoaded === '1' || img.dataset.avatarLoaded === 'loading') return;
  const telegramId = mediaV0517TelegramIdForImage(img);
  if (!telegramId || !sessionToken) return;

  if (mediaV0517AvatarCache.has(telegramId)) {
    img.src = mediaV0517AvatarCache.get(telegramId);
    img.dataset.avatarLoaded = '1';
    return;
  }

  img.dataset.avatarLoaded = 'loading';
  const retry = Number(img.dataset.avatarRetries || 0);
  try {
    const response = await fetch(`${API_URL}/avatar?telegramId=${encodeURIComponent(telegramId)}`, {
      method: 'GET', mode: 'cors', cache: 'no-store',
      headers: { Authorization: `Bearer ${sessionToken}` }
    });
    if (!response.ok) throw new Error(`avatar ${response.status}`);
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) throw new Error('avatar type');
    const dataUrl = await mediaV0517BlobToDataUrl(blob);
    if (!dataUrl) throw new Error('avatar empty');
    mediaV0517AvatarCache.set(telegramId, dataUrl);
    img.src = dataUrl;
    img.dataset.avatarLoaded = '1';
    img.dataset.avatarRetries = '0';
  } catch (error) {
    console.warn('Avatar load failed:', telegramId, error?.message || error);
    img.dataset.avatarLoaded = 'error';
    if (retry < 2 && img.isConnected) {
      img.dataset.avatarRetries = String(retry + 1);
      setTimeout(() => {
        if (!img.isConnected || img.dataset.avatarLoaded === '1') return;
        img.dataset.avatarLoaded = '';
        mediaV0517Queue.push(img);
        mediaV0517Pump();
      }, 800 * (retry + 1));
    }
  }
}

function setupAvatarLoading(root) {
  const images = Array.from((root || document).querySelectorAll('[data-telegram-id] img'));
  images.forEach(mediaV0517Schedule);
}

function mediaV0517NormalizeGame(value) {
  const raw = String(value || '').trim();
  const low = raw.toLocaleLowerCase('ru-RU');
  if (low === 'рм' || low.includes('royal match')) return 'Royal Match';
  if (low === 'рк' || low.includes('royal kingdom')) return 'Royal Kingdom';
  return raw;
}

function mediaV0517EnsureTeamPhoto(img) {
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

async function mediaV0517LoadTeamPhoto() {
  const panel = document.getElementById('panel');
  if (!panel || !sessionToken) return;
  const img = panel.querySelector('.team-photo-box .team-photo');
  const title = panel.querySelector('.team-detail-head h2');
  const gameNode = panel.querySelector('.team-detail-head .muted');
  if (!img || !title) return;
  mediaV0517EnsureTeamPhoto(img);
  const teamName = String(img.dataset.teamName || title.textContent || '').trim();
  const game = mediaV0517NormalizeGame(img.dataset.teamGame || gameNode?.textContent || '');
  if (!teamName || img.dataset.teamProxyLoaded === '1' || img.dataset.teamProxyLoaded === 'loading') return;
  const key = `${normalizeTeam(teamName)}\n${game.toLocaleLowerCase('ru-RU')}`;
  if (mediaV0517TeamPhotoCache.has(key)) {
    img.src = mediaV0517TeamPhotoCache.get(key);
    img.dataset.teamProxyLoaded = '1';
    img.parentElement?.classList.remove('photo-error');
    return;
  }
  img.dataset.teamProxyLoaded = 'loading';
  try {
    img.removeAttribute('src');
    const url = new URL(`${API_URL}/team-photo`);
    url.searchParams.set('team', teamName);
    if (game) url.searchParams.set('game', game);
    const response = await fetch(url.toString(), {
      method: 'GET', mode: 'cors', cache: 'no-store',
      headers: { Authorization: `Bearer ${sessionToken}` }
    });
    if (!response.ok) throw new Error(`team photo ${response.status}`);
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) throw new Error('team photo type');
    const dataUrl = await mediaV0517BlobToDataUrl(blob);
    mediaV0517TeamPhotoCache.set(key, dataUrl);
    img.src = dataUrl;
    img.dataset.teamProxyLoaded = '1';
    img.parentElement?.classList.remove('photo-error');
    mediaV0517EnsureTeamPhoto(img);
  } catch (error) {
    console.warn('Team photo load failed:', error?.message || error);
    img.dataset.teamProxyLoaded = 'error';
    img.parentElement?.classList.add('photo-error');
  }
}

if (typeof renderTeamDetail === 'function') {
  const nativeRenderTeamDetail = renderTeamDetail;
  renderTeamDetail = function(teamRef) {
    const result = nativeRenderTeamDetail(teamRef);
    setTimeout(mediaV0517LoadTeamPhoto, 0);
    return result;
  };
}

window.__ROYAL_MEDIA_VERSION__ = '0.5.17';
