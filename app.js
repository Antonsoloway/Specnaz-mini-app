const tg = window.Telegram?.WebApp;
const API_URL = 'https://royal-crm-miniapp-api.tropical-spoon.workers.dev';
const BUILD = '0.4.0';

let authState = null;
let snapshotState = null;
let sessionToken = '';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function setButtonsEnabled(enabled) {
  document.querySelectorAll('button[data-page]').forEach(btn => {
    btn.disabled = !enabled;
  });
}

function showDenied(message) {
  document.body.innerHTML = `
    <main class="gate-screen">
      <div class="gate-icon">🕊️</div>
      <h1>Доступ закрыт</h1>
      <p>${esc(message || 'Извините, вы не состоите в спецназе.')}</p>
      <small>Доступ к приложению есть только у участников ЧАТА ПОБЕДИТЕЛЕЙ со статусом «В чате».</small>
    </main>`;
}

function showFatal(message, details = '') {
  document.getElementById('panel').innerHTML = `
    <h2>Не удалось войти</h2>
    <p>${esc(message)}</p>
    ${details ? `<p class="muted">${esc(details)}</p>` : ''}
    <p class="muted">Закройте приложение и откройте его снова из бота.</p>`;
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

  document.getElementById('panel').innerHTML = `
    <h2>${esc(role.title || 'Участник')}</h2>
    <p><strong>${esc(user.crmName || user.telegramFirstName || '')}</strong></p>
    <p class="muted">${teamText}</p>
    <p class="muted" id="dataStatus">Загружаем справочник…</p>`;

  setButtonsEnabled(true);
}

async function workerAuth(initData) {
  const response = await fetch(`${API_URL}/auth`, {
    method: 'POST',
    mode: 'cors',
    cache: 'no-store',
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

  const response = await fetch(`${API_URL}/snapshot`, {
    method: 'GET',
    mode: 'cors',
    cache: 'no-store',
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
}

async function authenticate() {
  setButtonsEnabled(false);
  document.getElementById('versionBadge').textContent = `v${BUILD}`;

  if (!tg) {
    showFatal('Приложение нужно открыть внутри Telegram.', `build=${BUILD}`);
    return;
  }

  tg.ready();
  tg.expand();

  if (!tg.initData) {
    showFatal('Telegram не передал данные авторизации.', `build=${BUILD}`);
    return;
  }

  const previewUser = tg.initDataUnsafe?.user;
  if (previewUser?.first_name) {
    document.getElementById('hello').textContent = `Привет, ${previewUser.first_name}!`;
  }
  document.getElementById('userMeta').textContent = 'Проверяем доступ…';

  try {
    const data = await workerAuth(tg.initData);

    if (!data?.ok) {
      showFatal(data?.message || 'Не удалось подтвердить Telegram-пользователя.', `${data?.error || 'UNKNOWN'} · build=${BUILD}`);
      return;
    }

    if (!data.access) {
      showDenied(data.message || 'Извините, вы не состоите в спецназе.');
      return;
    }

    renderAuth(data);

    loadSnapshot().catch(error => {
      console.error('Snapshot load error:', error);
      const status = document.getElementById('dataStatus');
      if (status) status.textContent = `Справочник временно недоступен: ${error?.code || error?.message || 'UNKNOWN'}`;
    });
  } catch (error) {
    console.error('Mini App auth error:', error);
    showFatal('Сервер авторизации пока недоступен.', `${error?.code || error?.message || 'NETWORK_ERROR'} · build=${BUILD}`);
  }
}

function renderParticipants() {
  const participants = snapshotState?.participants || [];
  if (!participants.length) {
    return '<p>Список участников ещё загружается. Попробуйте открыть раздел через секунду.</p>';
  }

  const items = participants.map(p => {
    const memberships = (p.memberships || [])
      .filter(m => m.team || m.role)
      .map(m => `${esc(m.team || 'Без команды')} — ${esc(m.role || 'Без роли')}`)
      .join('<br>');
    const tgName = p.username ? ` ${esc(p.username)}` : '';
    return `<li><strong>${esc(p.name || p.telegramName || p.username || 'Без имени')}</strong>${tgName}${memberships ? `<br><span class="muted">${memberships}</span>` : ''}</li>`;
  }).join('');

  return `<p class="muted">Всего: ${participants.length}</p><ul>${items}</ul>`;
}

function renderTeams() {
  const teams = snapshotState?.teams || [];
  if (!teams.length) {
    return '<p>Список команд ещё загружается. Попробуйте открыть раздел через секунду.</p>';
  }

  const items = teams.map(t => {
    const games = Array.isArray(t.games) && t.games.length ? ` · ${esc(t.games.join(', '))}` : '';
    return `<li><strong>${esc(t.name || 'Без названия')}</strong>${games}<br><span class="muted">Участников: ${Number(t.memberCount || 0)} · лидеров: ${Number(t.leaderCount || 0)} · помощников: ${Number(t.assistantCount || 0)}</span></li>`;
  }).join('');

  return `<p class="muted">Всего: ${teams.length}</p><ul>${items}</ul>`;
}

function renderPage(page) {
  if (!authState?.access) return;

  const role = authState.role?.title || 'Участник';
  const memberships = authState.memberships || [];

  if (page === 'home') {
    const stats = snapshotState?.stats || {};
    const loaded = snapshotState
      ? `<p class="muted">CRM: ${Number(stats.inChat || stats.participants || 0)} участников · ${Number(stats.teams || 0)} команд</p>`
      : '<p class="muted">CRM загружается…</p>';
    document.getElementById('panel').innerHTML = `<h2>${esc(role)}</h2><p>Доступ подтверждён.</p>${loaded}`;
    return;
  }

  if (page === 'profile') {
    const items = memberships.length
      ? memberships.map(m => `<li>${esc(m.team || 'Без команды')} — ${esc(m.role || 'Без роли')}</li>`).join('')
      : '<li>Командные роли не указаны</li>';
    document.getElementById('panel').innerHTML = `<h2>Мой профиль</h2><p>Основная роль: <strong>${esc(role)}</strong></p><ul>${items}</ul>`;
    return;
  }

  if (page === 'players') {
    document.getElementById('panel').innerHTML = `<h2>Участники</h2>${renderParticipants()}`;
    return;
  }

  if (page === 'teams') {
    document.getElementById('panel').innerHTML = `<h2>Команды</h2>${renderTeams()}`;
    return;
  }

  const labels = {
    help: ['Спецназ', 'Доступ подтверждён. Здесь появятся заявки помощи.'],
    projects: ['Проекты', 'Здесь появятся Маяк и другие проекты.']
  };
  const [title, text] = labels[page] || [page, 'Раздел готовится.'];
  document.getElementById('panel').innerHTML = `<h2>${esc(title)}</h2><p>${esc(text)}</p>`;
}

document.querySelectorAll('button[data-page]').forEach(btn => {
  btn.addEventListener('click', () => renderPage(btn.dataset.page));
});

authenticate();
