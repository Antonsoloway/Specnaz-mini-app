const tg = window.Telegram?.WebApp;
const API_URL = 'https://royal-crm-miniapp-api.tropical-spoon.workers.dev';
const BUILD = /^\d+\.\d+\.\d+$/.test(String(window.__ROYAL_BUILD__ || '').trim())
  ? String(window.__ROYAL_BUILD__).trim()
  : '0.5.59';

let authState = null;
let snapshotState = null;
let sessionToken = '';
let activePage = 'home';
let avatarObserver = null;
const avatarBlobCache = new Map();
const protectedMediaObjectUrls = new Map();
const protectedMediaLoads = new Map();
const protectedMediaGenerations = new Map();
const protectedMediaAssets = new Set(['background-v0600']);

function emitAppLifecycle(type, detail = {}) {
  const payload = { ...detail, build: BUILD };
  if (type === 'auth-ready' && payload.access === true) {
    window.__ROYAL_AUTH_READY__ = { access: true, build: BUILD };
  } else if (type === 'fatal' || type === 'access-denied') {
    window.__ROYAL_AUTH_READY__ = null;
  }
  [window.RoyalStartupV0600, window.RoyalMusicV0600].forEach(target => {
    try { target?.handleAppEvent?.(type, payload); } catch (error) { console.warn(`Lifecycle ${type} hook failed:`, error); }
  });
  try {
    if (typeof window.CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent(`royal:${type}`, { detail: payload }));
    }
  } catch (_) {}
}

async function protectedMediaObjectUrl(asset) {
  const key = String(asset || '').trim();
  if (!protectedMediaAssets.has(key)) throw new Error('PROJECT_MEDIA_UNKNOWN');
  if (!sessionToken) throw new Error('PROJECT_MEDIA_SESSION_MISSING');
  if (protectedMediaObjectUrls.has(key)) return protectedMediaObjectUrls.get(key);
  const generation = Number(protectedMediaGenerations.get(key) || 0);
  const existingLoad = protectedMediaLoads.get(key);
  if (existingLoad?.generation === generation) return existingLoad.promise;
  const sessionAtStart = sessionToken;
  const load = (async () => {
    const response = await fetch(`${API_URL}/project-mayak-media?asset=${encodeURIComponent(key)}`, {
      method: 'GET', mode: 'cors', cache: 'no-store',
      headers: { Authorization: `Bearer ${sessionAtStart}` }
    });
    if (!response.ok) throw new Error(`PROJECT_MEDIA_HTTP_${response.status}`);
    const blob = await response.blob();
    if (!blob || !blob.size || !String(blob.type || '').startsWith('audio/')) {
      throw new Error('PROJECT_MEDIA_INVALID');
    }
    const objectUrl = URL.createObjectURL(blob);
    if (Number(protectedMediaGenerations.get(key) || 0) !== generation || sessionToken !== sessionAtStart) {
      try { URL.revokeObjectURL(objectUrl); } catch (_) {}
      throw new Error('PROJECT_MEDIA_CANCELLED');
    }
    protectedMediaObjectUrls.set(key, objectUrl);
    return objectUrl;
  })().finally(() => {
    if (protectedMediaLoads.get(key)?.promise === load) protectedMediaLoads.delete(key);
  });
  protectedMediaLoads.set(key, { generation, promise: load });
  return load;
}

function releaseProtectedMedia(asset = '') {
  const keys = asset
    ? [String(asset)]
    : [...new Set([...protectedMediaObjectUrls.keys(), ...protectedMediaLoads.keys()])];
  keys.forEach(key => {
    protectedMediaGenerations.set(key, Number(protectedMediaGenerations.get(key) || 0) + 1);
    const objectUrl = protectedMediaObjectUrls.get(key);
    if (objectUrl) {
      protectedMediaObjectUrls.delete(key);
      try { URL.revokeObjectURL(objectUrl); } catch (_) {}
    }
  });
}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function enc(value) { return encodeURIComponent(String(value ?? '')); }
function normalizeUsername(value) { return String(value || '').trim().replace(/^@+/, ''); }
function normalizeTeam(value) { return String(value || '').trim().toLocaleLowerCase('ru-RU'); }
function displayName(p) { return String(p?.name || p?.telegramName || p?.username || 'Без имени').trim(); }
function firstLetter(value) {
  const text = String(value || '').replace(/^@/, '').trim();
  return text ? Array.from(text)[0].toUpperCase() : '👤';
}

function setButtonsEnabled(enabled) {
  document.querySelectorAll('button[data-page]').forEach(btn => { btn.disabled = !enabled; });
}

function setActiveNav(page) {
  activePage = page;
  document.querySelectorAll('.bottom-nav .nav').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === page);
  });
}

function showDenied(message) {
  emitAppLifecycle('access-denied', { message: String(message || '') });
  document.body.innerHTML = `<main class="gate-screen"><div class="gate-icon">🕊️</div><h1>Доступ закрыт</h1><p>${esc(message || 'Извините, вы не состоите в спецназе.')}</p><small>Доступ к приложению есть только у участников ЧАТА ПОБЕДИТЕЛЕЙ со статусом «В чате».</small></main>`;
}

function showFatal(message, details = '') {
  emitAppLifecycle('fatal', { message: String(message || ''), code: String(details || '') });
  document.getElementById('panel').innerHTML = `<h2>Не удалось войти</h2><p>${esc(message)}</p>${details ? `<p class="muted">${esc(details)}</p>` : ''}<p class="muted">Закройте приложение и откройте его снова из бота.</p>`;
}

function renderAuth(data) {
  authState = data;
  sessionToken = data.session || '';
  const user = data.user || {};
  const role = data.role || {};
  document.getElementById('hello').textContent = `Привет, ${user.crmName || user.telegramFirstName || ''}!`;
  document.getElementById('userMeta').textContent = role.title ? `Роль: ${role.title}` : 'Доступ подтверждён';
  document.getElementById('authStatus').textContent = 'Доступ подтверждён';
  document.getElementById('versionBadge').textContent = `v${BUILD}`;
  const teams = Array.isArray(data.memberships) ? data.memberships : [];
  const teamText = teams.length
    ? teams.map(m => `${esc(m.team || 'Без команды')} — ${esc(m.role || 'Без роли')}`).join('<br>')
    : 'Командные роли не указаны';
  document.getElementById('panel').innerHTML = `<h2>${esc(role.title || 'Участник')}</h2><p><strong>${esc(user.crmName || user.telegramFirstName || '')}</strong></p><p class="muted">${teamText}</p><p class="muted" id="dataStatus">Загружаем справочник…</p>`;
  setButtonsEnabled(true);
  emitAppLifecycle('auth-ready', {
    access: true,
    user: {
      participantKey: String(user.participantKey || ''),
      crmName: String(user.crmName || ''),
      telegramFirstName: String(user.telegramFirstName || '')
    }
  });
}

async function workerAuth(initData) {
  const response = await fetch(`${API_URL}/auth`, {
    method: 'POST', mode: 'cors', cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.message || `HTTP ${response.status}`);
    error.code = data?.error || `HTTP_${response.status}`;
    throw error;
  }
  return data;
}

async function loadSnapshot() {
  if (!sessionToken) return;
  emitAppLifecycle('snapshot-start');
  try {
    const response = await fetch(`${API_URL}/snapshot`, {
      method: 'GET', mode: 'cors', cache: 'no-store',
      headers: { Authorization: `Bearer ${sessionToken}` }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok) {
      const error = new Error(data?.message || `HTTP ${response.status}`);
      error.code = data?.error || `HTTP_${response.status}`;
      throw error;
    }
    snapshotState = data.snapshot || null;
    const status = document.getElementById('dataStatus');
    if (status && snapshotState) {
      const stats = snapshotState.stats || {};
      status.textContent = `CRM загружена: ${Number(stats.inChat || stats.participants || 0)} участников, ${Number(stats.teams || 0)} команд.`;
    }
    emitAppLifecycle('snapshot-ready', { stats: snapshotState?.stats || {} });
    return snapshotState;
  } catch (error) {
    emitAppLifecycle('snapshot-error', { code: String(error?.code || error?.message || 'UNKNOWN') });
    throw error;
  }
}

async function authenticate() {
  setButtonsEnabled(false);
  document.getElementById('versionBadge').textContent = `v${BUILD}`;
  emitAppLifecycle('auth-start');
  if (!tg) { showFatal('Приложение нужно открыть внутри Telegram.', `build=${BUILD}`); return; }
  tg.ready(); tg.expand();
  if (!tg.initData) { showFatal('Telegram не передал данные авторизации.', `build=${BUILD}`); return; }
  const previewUser = tg.initDataUnsafe?.user;
  if (previewUser?.first_name) document.getElementById('hello').textContent = `Привет, ${previewUser.first_name}!`;
  document.getElementById('userMeta').textContent = 'Проверяем доступ…';
  try {
    const data = await workerAuth(tg.initData);
    if (!data?.ok) { showFatal(data?.message || 'Не удалось подтвердить Telegram-пользователя.', `${data?.error || 'UNKNOWN'} · build=${BUILD}`); return; }
    if (!data.access) { showDenied(data.message || 'Извините, вы не состоите в спецназе.'); return; }
    renderAuth(data);
    loadSnapshot().then(() => { if (activePage !== 'home') renderPage(activePage); }).catch(error => {
      console.error('Snapshot load error:', error);
      const status = document.getElementById('dataStatus');
      if (status) status.textContent = `Справочник временно недоступен: ${error?.code || error?.message || 'UNKNOWN'}`;
    });
  } catch (error) {
    console.error('Mini App auth error:', error);
    showFatal('Сервер авторизации пока недоступен.', `${error?.code || error?.message || 'NETWORK_ERROR'} · build=${BUILD}`);
  }
}

function usernameButton(p, compact = false) {
  const username = normalizeUsername(p?.username);
  if (!username) return '';
  return `<button type="button" class="username-link ${compact ? 'compact' : ''}" data-user-menu="${esc(username)}" data-user-name="${esc(displayName(p))}">@${esc(username)}</button>`;
}

function membershipHtml(m) {
  const team = String(m?.team || '').trim();
  const role = String(m?.role || 'Без роли').trim();
  const game = String(m?.game || '').trim();
  if (!team) return `<span class="membership-pill no-team">Без команды — ${esc(role)}</span>`;
  return `<button type="button" class="membership-pill team-link" data-team="${enc(team)}"><span>${esc(team)}</span><small>${esc(role)}${game ? ` · ${esc(game)}` : ''}</small></button>`;
}

function participantCard(p) {
  const name = displayName(p);
  const memberships = (p.memberships || []).filter(m => m.team || m.role);
  const avatarFile = String(p.avatarFileId || '');
  const avatar = avatarFile
    ? `<div class="person-avatar-wrap"><span>${esc(firstLetter(name))}</span><img class="person-avatar" alt="" data-avatar-file="${esc(avatarFile)}"></div>`
    : `<div class="person-avatar-wrap fallback"><span>${esc(firstLetter(name))}</span></div>`;
  return `<article class="person-card">${avatar}<div class="person-main"><div class="person-title">${esc(name)}</div>${usernameButton(p)}${p.telegramName && p.telegramName !== name ? `<div class="telegram-name">${esc(p.telegramName)}</div>` : ''}<div class="membership-list">${memberships.length ? memberships.map(membershipHtml).join('') : '<span class="muted">Команда не указана</span>'}</div></div></article>`;
}

function participantSearchText(p) {
  const membershipText = (p.memberships || []).map(m => [m.team, m.teamRaw, m.nickname, m.role, m.game].filter(Boolean).join(' ')).join(' ');
  return [p.name, p.telegramName, p.username, membershipText].filter(Boolean).join(' ').toLocaleLowerCase('ru-RU');
}

function renderParticipantsPage(query = '') {
  const participants = snapshotState?.participants || [];
  if (!participants.length) { document.getElementById('panel').innerHTML = '<h2>Участники</h2><p>Список ещё загружается. Попробуйте через секунду.</p>'; return; }
  const q = String(query || '').trim().toLocaleLowerCase('ru-RU');
  const filtered = q ? participants.filter(p => participantSearchText(p).includes(q)) : participants;
  document.getElementById('panel').innerHTML = `<div class="section-title-row"><div><h2>Участники</h2><div class="muted">${filtered.length}${q ? ` из ${participants.length}` : ''}</div></div></div><label class="search-box"><span>🔎</span><input id="participantSearch" type="search" placeholder="Имя, @ник, команда, роль…" value="${esc(query)}" autocomplete="off"></label><div class="people-list">${filtered.length ? filtered.map(participantCard).join('') : '<div class="empty-state">Ничего не найдено</div>'}</div>`;
  const input = document.getElementById('participantSearch');
  if (input) input.addEventListener('input', e => {
    const cursor = e.target.selectionStart; const value = e.target.value;
    renderParticipantsPage(value);
    const next = document.getElementById('participantSearch');
    if (next) { next.focus(); try { next.setSelectionRange(cursor, cursor); } catch (_) {} }
  });
  setupAvatarLoading(document.getElementById('panel'));
}

function teamSearchText(t) { return [t.name, ...(t.games || [])].filter(Boolean).join(' ').toLocaleLowerCase('ru-RU'); }

function teamCard(t) {
  const games = Array.isArray(t.games) && t.games.length ? t.games.join(' · ') : '';
  return `<button type="button" class="team-card" data-team="${enc(t.name || '')}"><div class="team-card-icon">🏰</div><div class="team-card-main"><strong>${esc(t.name || 'Без названия')}</strong>${games ? `<span>${esc(games)}</span>` : ''}<small>Участников: ${Number(t.memberCount || 0)} · лидеров: ${Number(t.leaderCount || 0)} · помощников: ${Number(t.assistantCount || 0)}</small></div><span class="chevron">›</span></button>`;
}

function renderTeamsPage(query = '') {
  const teams = snapshotState?.teams || [];
  if (!teams.length) { document.getElementById('panel').innerHTML = '<h2>Команды</h2><p>Список ещё загружается. Попробуйте через секунду.</p>'; return; }
  const q = String(query || '').trim().toLocaleLowerCase('ru-RU');
  const filtered = q ? teams.filter(t => teamSearchText(t).includes(q)) : teams;
  document.getElementById('panel').innerHTML = `<div class="section-title-row"><div><h2>Команды</h2><div class="muted">${filtered.length}${q ? ` из ${teams.length}` : ''}</div></div></div><label class="search-box"><span>🔎</span><input id="teamSearch" type="search" placeholder="Название команды или игра…" value="${esc(query)}" autocomplete="off"></label><div class="teams-list">${filtered.length ? filtered.map(teamCard).join('') : '<div class="empty-state">Ничего не найдено</div>'}</div>`;
  const input = document.getElementById('teamSearch');
  if (input) input.addEventListener('input', e => {
    const cursor = e.target.selectionStart; const value = e.target.value;
    renderTeamsPage(value);
    const next = document.getElementById('teamSearch');
    if (next) { next.focus(); try { next.setSelectionRange(cursor, cursor); } catch (_) {} }
  });
}

function roleRank(role) {
  const value = String(role || '');
  if (value === 'Лидер') return 0;
  if (value === 'Помощник') return 1;
  if (value === 'Игрок') return 2;
  return 3;
}

function teamMemberInfo(p, teamName) {
  const key = normalizeTeam(teamName);
  return (p.memberships || []).filter(m => normalizeTeam(m.team) === key).sort((a, b) => roleRank(a.role) - roleRank(b.role));
}

function teamMemberCard(p, teamName) {
  const name = displayName(p);
  const teamMemberships = teamMemberInfo(p, teamName);
  const info = teamMemberships.map(m => {
    const role = m.role || 'Без роли';
    const extra = [m.nickname, m.game].filter(Boolean).join(' · ');
    return `<div class="team-member-role">${esc(role)}${extra ? ` · ${esc(extra)}` : ''}</div>`;
  }).join('');
  const avatarFile = String(p.avatarFileId || '');
  const avatar = avatarFile
    ? `<div class="person-avatar-wrap small"><span>${esc(firstLetter(name))}</span><img class="person-avatar" alt="" data-avatar-file="${esc(avatarFile)}"></div>`
    : `<div class="person-avatar-wrap small fallback"><span>${esc(firstLetter(name))}</span></div>`;
  return `<article class="team-member">${avatar}<div class="team-member-main"><strong>${esc(name)}</strong>${usernameButton(p, true)}${info}</div></article>`;
}

function renderTeamDetail(teamName) {
  const teams = snapshotState?.teams || [];
  const participants = snapshotState?.participants || [];
  const key = normalizeTeam(teamName);
  const team = teams.find(t => normalizeTeam(t.name) === key);
  if (!team) { document.getElementById('panel').innerHTML = `<button type="button" class="back-link" data-page="teams">‹ Команды</button><h2>Команда не найдена</h2>`; return; }
  const members = participants.filter(p => teamMemberInfo(p, team.name).length).sort((a, b) => {
    const ar = roleRank(teamMemberInfo(a, team.name)[0]?.role);
    const br = roleRank(teamMemberInfo(b, team.name)[0]?.role);
    return ar - br || displayName(a).localeCompare(displayName(b), 'ru', { sensitivity: 'base' });
  });
  const photo = team.photoUrl
    ? `<div class="team-photo-box"><img class="team-photo" src="${esc(team.photoUrl)}" alt="${esc(team.name)}" referrerpolicy="no-referrer" onerror="this.parentElement.classList.add('photo-error')"><div class="team-photo-fallback">🏰</div></div>`
    : `<div class="team-photo-box photo-error"><div class="team-photo-fallback">🏰</div></div>`;
  document.getElementById('panel').innerHTML = `<button type="button" class="back-link" data-page="teams">‹ Все команды</button>${photo}<div class="team-detail-head"><h2>${esc(team.name)}</h2><div class="muted">${esc((team.games || []).join(' · '))}</div></div><div class="team-stats"><span><b>${members.length}</b><small>участников</small></span><span><b>${Number(team.leaderCount || 0)}</b><small>лидеров</small></span><span><b>${Number(team.assistantCount || 0)}</b><small>помощников</small></span></div><h3 class="subheading">Состав команды</h3><div class="team-members-list">${members.length ? members.map(p => teamMemberCard(p, team.name)).join('') : '<div class="empty-state">Участники не найдены</div>'}</div>`;
  setActiveNav('teams');
  setupAvatarLoading(document.getElementById('panel'));
}

function openUserMenu(username, name) {
  const clean = normalizeUsername(username);
  if (!clean) return;
  closeUserMenu();
  const sheet = document.createElement('div');
  sheet.id = 'userActionSheet';
  sheet.className = 'action-sheet-backdrop';
  sheet.innerHTML = `<div class="action-sheet" role="dialog" aria-modal="true"><div class="action-sheet-handle"></div><div class="action-sheet-title">${esc(name || `@${clean}`)}</div><div class="action-sheet-user">@${esc(clean)}</div><button type="button" data-user-action="dm">💬 Написать в ЛС</button><button type="button" data-user-action="invite">📣 Позвать в чате</button><button type="button" class="cancel" data-user-action="cancel">Отмена</button></div>`;
  sheet.addEventListener('click', e => {
    if (e.target === sheet) closeUserMenu();
    const action = e.target.closest('[data-user-action]')?.dataset.userAction;
    if (!action) return;
    if (action === 'cancel') { closeUserMenu(); return; }
    if (action === 'dm') { closeUserMenu(); tg?.openTelegramLink?.(`https://t.me/${encodeURIComponent(clean)}`); return; }
    if (action === 'invite') {
      closeUserMenu();
      const profile = `https://t.me/${clean}`;
      const share = `https://t.me/share/url?url=${encodeURIComponent(profile)}&text=${encodeURIComponent(`@${clean}`)}`;
      tg?.openTelegramLink?.(share);
    }
  });
  document.body.appendChild(sheet);
}

function closeUserMenu() { document.getElementById('userActionSheet')?.remove(); }

async function loadAvatarImage(img) {
  if (!img || img.dataset.avatarLoaded === '1') return;
  const fileId = String(img.dataset.avatarFile || '');
  if (!fileId || !sessionToken) return;
  if (avatarBlobCache.has(fileId)) {
    img.src = avatarBlobCache.get(fileId); img.dataset.avatarLoaded = '1'; return;
  }
  img.dataset.avatarLoaded = 'loading';
  try {
    const response = await fetch(`${API_URL}/avatar?fileId=${encodeURIComponent(fileId)}`, {
      method: 'GET', mode: 'cors', cache: 'force-cache',
      headers: { Authorization: `Bearer ${sessionToken}` }
    });
    if (!response.ok) throw new Error(`avatar ${response.status}`);
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) throw new Error('avatar type');
    const objectUrl = URL.createObjectURL(blob);
    avatarBlobCache.set(fileId, objectUrl);
    img.src = objectUrl;
    img.dataset.avatarLoaded = '1';
  } catch (_) {
    img.dataset.avatarLoaded = 'error';
  }
}

function setupAvatarLoading(root) {
  const images = [...(root || document).querySelectorAll('img[data-avatar-file]')];
  if (!images.length) return;
  if (!('IntersectionObserver' in window)) { images.forEach(loadAvatarImage); return; }
  if (avatarObserver) avatarObserver.disconnect();
  avatarObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      avatarObserver.unobserve(entry.target);
      loadAvatarImage(entry.target);
    });
  }, { rootMargin: '180px 0px' });
  images.forEach(img => avatarObserver.observe(img));
}

function renderPage(page) {
  if (!authState?.access) return;
  const panel = document.getElementById('panel');
  if (page === 'changelog' && panel?.querySelector('.changelog-screen')) {
    setActiveNav(page);
    panel.hidden = false;
    return;
  }
  setActiveNav(page);
  const role = authState.role?.title || 'Участник';
  const memberships = authState.memberships || [];
  if (page === 'home') {
    const stats = snapshotState?.stats || {};
    const loaded = snapshotState ? `<p class="muted">CRM: ${Number(stats.inChat || stats.participants || 0)} участников · ${Number(stats.teams || 0)} команд</p>` : '<p class="muted">CRM загружается…</p>';
    panel.innerHTML = `<h2>${esc(role)}</h2><p>Доступ подтверждён.</p>${loaded}`; return;
  }
  if (page === 'profile') {
    const items = memberships.length ? memberships.map(m => `<li>${esc(m.team || 'Без команды')} — ${esc(m.role || 'Без роли')}</li>`).join('') : '<li>Командные роли не указаны</li>';
    panel.innerHTML = `<h2>Мой профиль</h2><p>Основная роль: <strong>${esc(role)}</strong></p><ul>${items}</ul>`; return;
  }
  if (page === 'players') { renderParticipantsPage(); return; }
  if (page === 'teams') { renderTeamsPage(); return; }
  const labels = { help: ['Спецназ', 'Доступ подтверждён. Здесь появятся заявки помощи.'], projects: ['Проекты', 'Здесь появятся Маяк и другие проекты.'] };
  const [title, text] = labels[page] || [page, 'Раздел готовится.'];
  panel.innerHTML = `<h2>${esc(title)}</h2><p>${esc(text)}</p>`;
}

document.addEventListener('click', e => {
  const pageButton = e.target.closest('button[data-page]');
  if (pageButton) { renderPage(pageButton.dataset.page); return; }
  const teamButton = e.target.closest('[data-team]');
  if (teamButton) { renderTeamDetail(decodeURIComponent(teamButton.dataset.team || '')); return; }
  const userButton = e.target.closest('[data-user-menu]');
  if (userButton) openUserMenu(userButton.dataset.userMenu, userButton.dataset.userName);
});

if (BUILD === '0.6.0') {
  window.RoyalAppV0600 = {
    version: BUILD,
    fetchProtectedMediaObjectUrl: protectedMediaObjectUrl,
    releaseProtectedMedia,
    reloadSnapshot: async () => {
      const snapshot = await loadSnapshot();
      if (activePage !== 'home') renderPage(activePage);
      return snapshot;
    }
  };
  window.addEventListener('pagehide', () => releaseProtectedMedia(), { once: true });
}

authenticate();
