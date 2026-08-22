/* Royal CRM Mini App — changelog v0.6.0 admin preview */
(() => {
  const VERSION = '0.6.0';
  const previous = Array.isArray(window.RoyalChangelog?.releases)
    ? window.RoyalChangelog.releases.filter(item => String(item?.version || '') !== VERSION)
    : [];
  const RELEASES = [{
    version:VERSION,
    title:'Защищённый админ-режим',
    changes:[
      'Добавлен отдельный админ-режим с полными карточками участников и команд, поиском, рейтингами и защищённым редактированием Royal CRM.',
      'Сохранение ускорено: после подтверждённой записи в таблицу форма закрывается сразу, а служебные снимки данных обновляются в фоне.',
      'Загрузка админских карточек стала устойчивее к медленной мобильной сети: экран, рейтинги и редактор используют один защищённый кэш и не создают лишние повторные запросы.',
      'После сохранения или удаления временный сбой кнопки «Обновить» больше не скрывает уже подтверждённые админские данные: экран сохраняет последний безопасный снимок и продолжает фоновое обновление.',
      'В каждом membership-слоте участника появилась кнопка «Очистить данные»: она сбрасывает игру, роль, команду и игровой ник в форме, а изменение записывается только после общего «Сохранить».',
      'Если таблица кратковременно занята, приложение безопасно повторяет только эту явную ошибку с тем же идентификатором операции — без дублей.',
      'Неактивную команду без участников и участника со статусом «Вышел» можно удалить только после подтверждения и повторной серверной проверки.'
    ]
  }, ...previous];

  function esc(value) {
    return String(value ?? '')
      .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
      .replaceAll('"','&quot;').replaceAll("'",'&#039;');
  }
  function releaseHtml(release,index) {
    const items = (Array.isArray(release?.changes) ? release.changes : [])
      .map(item => `<li>${esc(item)}</li>`).join('');
    return `<details class="release-card${release?.version === VERSION ? ' is-current' : ''}" ${index === 0 ? 'open' : ''}><summary class="release-summary"><span class="release-version">v${esc(release?.version)}</span><span class="release-title">${esc(release?.title)}</span><span class="release-arrow">›</span></summary><div class="release-body"><ul>${items}</ul></div></details>`;
  }
  function renderChangelog() {
    try { window.RoyalNav?.pushCurrent?.(); } catch (_) {}
    document.body.classList.add('royal-section-screen');
    document.querySelectorAll('.bottom-nav .nav').forEach(btn => btn.classList.remove('active'));
    const panel = document.getElementById('panel');
    if (!panel) return;
    panel.hidden = false;
    panel.innerHTML = `<div class="changelog-screen"><button type="button" class="royal-back-button" data-royal-back="1">← Назад</button><div class="changelog-head"><h2>История изменений</h2><p class="changelog-developer">Разработчик: <a href="https://t.me/ansoloway" target="_blank" rel="noopener">@ansoloway</a></p><p class="changelog-developer">Помощь в разработке, тесты: <a href="https://t.me/sfinks_spb" target="_blank" rel="noopener">@sfinks_spb</a> · <a href="https://t.me/O_Chaplygina" target="_blank" rel="noopener">@O_Chaplygina</a> · <a href="https://t.me/Yanochka_2404" target="_blank" rel="noopener">@Yanochka_2404</a> · <a href="https://t.me/DmitryRoyal" target="_blank" rel="noopener">@DmitryRoyal</a></p><p>Что добавлялось и менялось в приложении Чата Победителей.</p><span class="changelog-current">● Текущая версия v${VERSION}</span></div><div class="changelog-list">${RELEASES.map(releaseHtml).join('')}</div><div class="release-note">Новая версия добавляется сюда первой, предыдущая история сохраняется.</div></div>`;
    try { window.RoyalNav?.enhanceVisibleBack?.(); } catch (_) {}
    requestAnimationFrame(() => requestAnimationFrame(() => { try { window.scrollTo(0,0); } catch (_) {} }));
  }

  window.RoyalChangelog = { version:VERSION, releases:RELEASES, open:renderChangelog };
  window.__ROYAL_CHANGELOG_VERSION__ = VERSION;
})();
