/* Royal CRM Mini App — changelog v0.5.33 */
(() => {
  const VERSION = '0.5.33';
  const previous = Array.isArray(window.RoyalChangelog?.releases) ? window.RoyalChangelog.releases : [];
  const RELEASES = [
    {
      version: '0.5.33',
      title: 'Админы в карточках участников',
      changes: [
        'В карточках администраторов чата добавлена красная плашка «Админ» над плашкой ранга.',
        'Красная плашка кликабельна и открывает актуальный список всех администраторов чата.',
        'Статус администратора берётся из защищённого списка админов Telegram и связывается с участником только по Telegram ID.',
        'Новая плашка сохраняется при повторном рендере списков и после возврата из профиля участника.',
        'В истории изменений добавлена строка благодарности за помощь в разработке и тестировании: @sfinks_spb.'
      ]
    },
    {
      version: '0.5.32',
      title: 'Стабильный интерфейс после возврата',
      changes: [
        'Исправлено возвращение старой раскладки карточек после выхода из профиля участника назад в список.',
        'После возврата плашка ранга остаётся справа от имени, как в новом интерфейсе v0.5.31.',
        'Основная площадь карточки после возврата продолжает открывать профиль участника.',
        'Отдельные действия ранга, @ника и команды после возврата сохраняют своё назначение.',
        'Исправление работает и для повторного рендера списка участников без изменения Telegram-ID логики.'
      ]
    },
    {
      version: '0.5.31',
      title: 'Юзер-френдли карточки участников',
      changes: [
        'В списках основная площадь карточки участника теперь открывает его профиль — больше не нужно точно целиться в имя.',
        'Плашка ранга перенесена вправо от имени и остаётся отдельной кнопкой перехода в каталог этого ранга.',
        'Справа от имени подготовлен общий ряд для ранга и будущих ачивок/наград.',
        'На подробной странице участника убран маленький дублирующий ранг; большой премиальный знак сохранён.',
        'Кнопки команды и @ника остаются самостоятельными действиями и не перехватываются переходом в профиль.'
      ]
    },
    {
      version: '0.5.30',
      title: 'Мобильная вёрстка профиля',
      changes: [
        'Исправлено горизонтальное растягивание страницы большим значком ранга на смартфонах.',
        'Большой анимированный знак ранга стал компактнее, сохранив премиальное оформление и салют по нажатию.',
        'Освобождено дополнительное место в профиле под будущие ачивки и награды.',
        'Нижнее меню жёстко привязано к ширине экрана и больше не должно обрезаться справа при прокрутке.',
        'Усилены ограничения ширины карточки участника и элементов профиля на узких экранах.'
      ]
    },
    ...previous.filter(item => !['0.5.33','0.5.32','0.5.31','0.5.30'].includes(String(item?.version || '')))
  ];

  function esc(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function releaseHtml(release, index) {
    const current = release.version === VERSION;
    const items = (release.changes || []).map(item => `<li>${esc(item)}</li>`).join('');
    return `<details class="release-card${current ? ' is-current' : ''}" ${index === 0 ? 'open' : ''}>
      <summary class="release-summary">
        <span class="release-version">v${esc(release.version)}</span>
        <span class="release-title">${esc(release.title)}</span>
        <span class="release-arrow">›</span>
      </summary>
      <div class="release-body"><ul>${items}</ul></div>
    </details>`;
  }

  function renderChangelog() {
    try { window.RoyalNav?.pushCurrent?.(); } catch (_) {}
    document.body.classList.add('royal-section-screen');
    document.querySelectorAll('.bottom-nav .nav').forEach(btn => btn.classList.remove('active'));
    const panel = document.getElementById('panel');
    if (!panel) return;
    panel.hidden = false;
    panel.innerHTML = `<div class="changelog-screen">
      <button type="button" class="royal-back-button" data-royal-back="1">← Назад</button>
      <div class="changelog-head">
        <h2>История изменений</h2>
        <p class="changelog-developer">Разработчик: <a href="https://t.me/ansoloway" target="_blank" rel="noopener">@ansoloway</a></p>
        <p class="changelog-developer">Помощь в разработке, тесты: <a href="https://t.me/sfinks_spb" target="_blank" rel="noopener">@sfinks_spb</a></p>
        <p>Что добавлялось и менялось в приложении Чата Победителей.</p>
        <span class="changelog-current">● Текущая версия v${VERSION}</span>
      </div>
      <div class="changelog-list">${RELEASES.map(releaseHtml).join('')}</div>
      <div class="release-note">Новая версия добавляется сюда первой, предыдущая история сохраняется.</div>
    </div>`;
    try { window.RoyalNav?.enhanceVisibleBack?.(); } catch (_) {}
    requestAnimationFrame(() => requestAnimationFrame(() => {
      try { window.scrollTo(0, 0); } catch (_) {}
    }));
  }

  function prepareBadge() {
    const badge = document.getElementById('versionBadge');
    if (!badge) return;
    badge.setAttribute('role', 'button');
    badge.setAttribute('tabindex', '0');
    badge.setAttribute('aria-label', `Версия ${VERSION}. Открыть историю изменений`);
    badge.setAttribute('title', 'История изменений');
  }

  window.addEventListener('click', event => {
    const badge = event.target?.closest?.('#versionBadge');
    if (!badge) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    renderChangelog();
  }, true);

  window.addEventListener('keydown', event => {
    const badge = event.target?.closest?.('#versionBadge');
    if (!badge || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    renderChangelog();
  }, true);

  prepareBadge();
  window.RoyalChangelog = { version: VERSION, releases: RELEASES, open: renderChangelog };
  window.__ROYAL_CHANGELOG_VERSION__ = VERSION;
})();
