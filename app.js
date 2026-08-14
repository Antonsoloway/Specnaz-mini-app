const tg = window.Telegram?.WebApp;
const API_URL = 'https://script.google.com/macros/s/AKfycbzbjYBCLWHMvpQuMvMeh1B6mOIRMvljCk31sn4o1n5X0aqyL5ZfSzrTra7cGw7sfCvSdQ/exec';
const BUILD = '0.2.3';

let authState = null;
let authTransport = 'not-started';

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
    <p class="muted">${teamText}</p>`;

  setButtonsEnabled(true);
}

function makeRequestId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID().replaceAll('-', '');
  }
  const part = () => Math.random().toString(36).slice(2);
  return `${Date.now().toString(36)}${part()}${part()}${part()}`;
}

function jsonpPoll(requestId, timeoutMs = 22000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    let stopped = false;

    const poll = () => {
      if (stopped) return;
      if (Date.now() - started > timeoutMs) {
        stopped = true;
        reject(new Error(`AUTH_TIMEOUT build=${BUILD} transport=${authTransport}`));
        return;
      }

      const callback = `__miniappAuth_${Date.now()}_${Math.random().toString(36).slice(2)}`.replace(/[^A-Za-z0-9_$]/g, '_');
      const script = document.createElement('script');
      const cleanup = () => {
        try { delete window[callback]; } catch (_) { window[callback] = undefined; }
        script.remove();
      };

      const timer = setTimeout(() => {
        cleanup();
        setTimeout(poll, 450);
      }, 3500);

      window[callback] = data => {
        clearTimeout(timer);
        cleanup();
        if (data?.pending) {
          setTimeout(poll, 350);
          return;
        }
        stopped = true;
        resolve(data);
      };

      script.onerror = () => {
        clearTimeout(timer);
        cleanup();
        setTimeout(poll, 500);
      };

      const params = new URLSearchParams({
        miniapp: '1',
        action: 'poll',
        requestId,
        callback,
        _: String(Date.now())
      });
      script.src = `${API_URL}?${params.toString()}`;
      document.head.appendChild(script);
    };

    poll();
  });
}

function submitAuthPost(requestId, initData) {
  const params = new URLSearchParams({
    miniapp: '1',
    action: 'auth',
    requestId,
    initData
  });

  let beaconAccepted = false;
  try {
    if (navigator.sendBeacon) {
      beaconAccepted = navigator.sendBeacon(API_URL, params);
    }
  } catch (error) {
    console.warn('sendBeacon failed', error);
  }

  // Отправляем также обычную HTML-форму в скрытый iframe как независимый fallback.
  const frameName = `miniapp_auth_${requestId}`;
  const iframe = document.createElement('iframe');
  iframe.name = frameName;
  iframe.style.display = 'none';
  iframe.setAttribute('aria-hidden', 'true');

  const form = document.createElement('form');
  form.method = 'POST';
  form.action = API_URL;
  form.target = frameName;
  form.style.display = 'none';

  for (const [name, value] of params.entries()) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }

  document.body.appendChild(iframe);
  document.body.appendChild(form);
  form.submit();

  authTransport = beaconAccepted ? 'beacon+form' : 'form';
  setTimeout(() => form.remove(), 500);
  setTimeout(() => iframe.remove(), 22000);
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

  const requestId = makeRequestId();

  try {
    submitAuthPost(requestId, tg.initData);
    await new Promise(resolve => setTimeout(resolve, 500));
    const data = await jsonpPoll(requestId);

    if (!data?.ok && !data?.access) {
      showFatal(data?.message || 'Не удалось подтвердить Telegram-пользователя.', `${data?.error || 'UNKNOWN'} · build=${BUILD}`);
      return;
    }

    if (!data.access) {
      showDenied(data.message || 'Извините, вы не состоите в спецназе.');
      return;
    }

    renderAuth(data);
  } catch (error) {
    console.error('Mini App auth error:', error);
    showFatal('Сервер авторизации пока недоступен.', error?.message || `NETWORK_ERROR build=${BUILD}`);
  }
}

function renderPage(page) {
  if (!authState?.access) return;

  const role = authState.role?.title || 'Участник';
  const memberships = authState.memberships || [];

  if (page === 'home') {
    document.getElementById('panel').innerHTML = `<h2>${esc(role)}</h2><p>Доступ подтверждён. CRM подключена.</p>`;
    return;
  }

  if (page === 'profile') {
    const items = memberships.length
      ? memberships.map(m => `<li>${esc(m.team || 'Без команды')} — ${esc(m.role || 'Без роли')}</li>`).join('')
      : '<li>Командные роли не указаны</li>';
    document.getElementById('panel').innerHTML = `<h2>Мой профиль</h2><p>Основная роль: <strong>${esc(role)}</strong></p><ul>${items}</ul>`;
    return;
  }

  const labels = {
    players: ['Участники', 'Следующим шагом подключим полный список участников.'],
    teams: ['Команды', 'Следующим шагом подключим полный список команд и составы.'],
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
