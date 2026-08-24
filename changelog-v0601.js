/* Royal CRM Mini App — changelog v0.6.1 */
(() => {
  const VERSION = '0.6.1';
  const previous = Array.isArray(window.RoyalChangelog?.releases)
    ? window.RoyalChangelog.releases.filter(item => String(item?.version || '') !== VERSION)
    : [];

  const SECTIONS = [
    {
      title:'Исправления и улучшения',
      changes:[
        'Текущая версия приложения переведена на v0.6.1. Номер версии и история изменений теперь обновляются вместе с релизом.',
        'Добавлен переход из профиля участника прямо в карточку его команды.',
        'С главной страницы из своей карточки профиля теперь можно нажать на плашку команды и сразу открыть карточку этой команды; для одинаковых названий РМ/РК учитывается игра.',
        'Исправляется восстановление аватаров участников, у которых фотография есть в Telegram, но avatarFileId отсутствует в актуальном snapshot.',
        'Для проблемных аватаров добавлена безопасная серверная цепочка: текущий snapshot → приватный ранее сохранённый avatar file_id → приватный медиакэш → live Telegram fallback.',
        'Исправлена клиентская часть этой цепочки: карточка участника теперь создаёт загрузчик изображения даже при пустом avatarFileId, поэтому защищённый fallback по Telegram ID действительно запускается вместо мгновенной буквенной заглушки.',
        'Учтено состояние Apps Script, когда скрытый реестр «Аватары» сохраняет последний известный file_id, но очередная проверка Telegram возвращает ERROR; такое состояние больше не блокирует попытку восстановить ранее сохранённое фото.',
        'Apps Script snapshot исправлен: последний известный avatar file_id теперь сохраняется и для временного статуса ERROR; NO_PHOTO по-прежнему не экспортируется.',
        'Свежий production snapshot уже содержит восстановленные avatarFileId для проблемных карточек Ирины и Syper7.',
        'Исправлен сбой музыки после перехода на v0.6.1: добавлен runtime-bridge, возвращающий защищённый API загрузки фонового аудио для версии 0.6.1.',
        'Обновлены cache-bust маркеры runtime, changelog и avatar-loader, чтобы Telegram WebView не оставался на старом коде.',
        'Ранее сохранённые фотографии участников используются только после проверки авторизованного участника через защищённый snapshot; приватные Telegram ID, file_id и bot token не публикуются в браузере.',
        'Музыка v0.6.1 окончательно переведена на общий runtime 0.6.x: app.js больше не отключает защищённый audio API из-за точного сравнения с 0.6.0; одновременно обновлён Telegram menu cache-bust для принудительной загрузки свежей сборки.',
        'Исправлен повторяющийся экран «Данные пока не загрузились / Failed to fetch»: запрос защищённого snapshot теперь автоматически повторяется при кратковременном сетевом сбое и HTTP 429/502/503/504, а после исчерпания первой серии выполняется один фоновый recovery без нажатия пользователем кнопки.',
        'Основной /snapshot переведён на прямую проверку сессии и единичное чтение приватного snapshot-cache, чтобы убрать нестабильную многоступенчатую серверную цепочку загрузки справочника.',
        'После перевода /snapshot восстановлен админ-режим: /admin-data использует новый прямой snapshot-auth, затем отдельно подтверждает Telegram-admin и загружает приватный admin snapshot; write/delete permissions по-прежнему выдаются только при pinned write.5 contract.',
        'Восстановлена кнопка «Связаться» для участников без @username: /contact-by-id теперь использует прямую проверку сессии и актуального private snapshot, после чего Голубец снова отправляет пользователю в личку кнопку «Открыть профиль».',
        'Для участников, у которых Telegram запрещает tg://user?id из-за настроек приватности, «Связаться» больше не показывает безликую серверную ошибку: Worker распознаёт privacy restriction и сообщает, что это ограничение Telegram, которое приложение не может обходить.',
        'Обработка «Связаться» усилена для других отказов Telegram при создании profile-button: если прямую кнопку отправить нельзя, Worker пробует отправить обычное пояснение от Голубца и возвращает конкретную причину вместо общей ошибки «Не удалось отправить кнопку профиля».',
        'Карточки участников унифицированы во всём v0.6.1, включая обычные списки, составы команд, профиль, спецназ и админ-режим: показываются CRM-имя, кликабельный @username при наличии и имя Telegram; Telegram ID остаётся видимым только в админской детальной информации.',
        'Повторные переходы по ссылкам в истории спецназа сделаны устойчивыми: v0.6.1 перехватывает именно tap/pointerup, повторно активирует Telegram WebApp после возврата из чата и один раз повторяет Telegram deep-link, если первый вызов был проглочен Android WebView.',
        'Исправлены повторные переходы по ссылкам в истории спецназа на Android Telegram: v0.6.1 перехватывает физический touch на window до legacy click-router, выполняет ровно один native Telegram-переход на касание и после возврата сразу разрешает следующий переход без конфликтующих повторных deep-link вызовов.',
        'Исправлена вёрстка «Герои спецназа» после добавления полной информации об участнике: карточка использует больше доступной ширины, имя/Telegram-данные/звание больше не накладываются друг на друга, а на узких экранах карточка увеличивается по высоте вместо обрезания.',
        'Карточки «Истории спецназа» также расширены; длинные имя, @username, Telegram-имя, звание, счёт и текст теперь переносятся внутри карточки без наложений и обрезания.',
        'Ачивки в «Героях спецназа» выровнены единым правым вертикальным стеком: Админ → звание → МАЯК/следующие ачивки; МАЯК больше не переносится влево отдельной строкой.',
        'Предыдущая попытка убрать периодическое дёргание через отключение legacy rank layout-polling не устранила основной дефект на устройстве; эта оптимизация оставлена, но больше не считается причиной/исправлением twitch.',
        'Переливание компактных значков звания теперь рисуется только внутри границ самой плашки: световой блик двигается фоном внутри фиксированной маски, а герб и декоративные крылья снаружи остаются видимыми и не обрезаются.',
        'Найдена фактическая периодическая нагрузка, совпадающая с видео по интервалу: admin-write runtime запускал скрытый refresh общего snapshot сначала через 5 секунд, затем каждые 20 секунд и ещё раз после возврата приложения в foreground. В v0.6.1 постоянный watchdog отключён; post-mutation polling после реальных админских записей сохранён, поэтому изменения по-прежнему подтягиваются без постоянного фонового repaint.',
        'Периодическое дёргание экрана после отключения 20-секундного фонового snapshot-watchdog подтверждено пользователем как исправленное на устройстве.',
        'Кнопки «Редактировать участника» и «Редактировать команду» перенесены вверх карточек админ-режима, чтобы для начала редактирования не приходилось прокручивать длинную карточку до конца.',
        'Админ-редактор существующего участника очищен от системных и автоматически заполняемых полей: дата, спецназ, скрины, активности, состояние чата и @username больше не занимают форму. В форме остаются изменяемое имя CRM и команды/роли/игровые ники; имя Telegram и Telegram ID показываются только как read-only справка.',
        'Админ-навигация сделана замкнутой: любой переход участник ↔ команда, а также переходы из админских рейтингов и составов команд остаются в защищённом админ-режиме; ordinary/public router больше не может перехватить такой переход.',
        'После переноса кнопки редактирования команды наверх восстановлена загрузка фотографий в админской карточке: при отрисовке выполняется защищённое восстановление team photo, а при необходимости — прямой authenticated refetch без ожидания старого медиакэша.',
        'В админском списке команды снова окрашиваются по игре так же, как в обычном режиме: Royal Kingdom — красные карточки, Royal Match — синие.',
        'Кнопка «Режим редактирования» убрана. На её месте постоянно доступны «Добавить команду» и «Добавить участника», а редактирование существующей карточки открывается непосредственно из самой карточки.',
        'Поиск в админ-режиме получил поведение клавиатуры как в обычном режиме: при касании или прокрутке вне поля поиска фокус снимается и клавиатура закрывается.',
        'Стабилизирована загрузка изображений команд в админ-режиме: после успешной загрузки сохраняется независимая session-копия изображения, поэтому старый медиакэш или кратковременный повторный запрос больше не должен возвращать карточку к замку-заглушке.',
        'Убран случайный переход прямо в «Редактировать команду» сразу после открытия команды: кнопка редактирования кратко блокируется на время завершения перехода, чтобы Android WebView не передавал остаточный ghost-tap в уже отрисованную новую страницу.',
        'Последующие исправления, которые входят в v0.6.1, будут дописываться в эту карточку истории изменений.'
      ]
    }
  ];

  const CURRENT_RELEASE = {
    version: VERSION,
    title: 'Исправления v0.6.1',
    sections: SECTIONS,
    changes: SECTIONS.flatMap(section => section.changes)
  };
  const RELEASES = [CURRENT_RELEASE, ...previous];

  function esc(value) {
    return String(value ?? '')
      .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
      .replaceAll('"','&quot;').replaceAll("'",'&#039;');
  }

  function listHtml(changes) {
    const items = (Array.isArray(changes) ? changes : [])
      .filter(item => typeof item === 'string' && item.trim())
      .map(item => `<li>${esc(item)}</li>`).join('');
    return `<ul>${items}</ul>`;
  }

  function bodyHtml(release) {
    if (!Array.isArray(release?.sections) || !release.sections.length) {
      return listHtml(release?.changes);
    }
    return release.sections.map(section => {
      const title = String(section?.title || '').trim();
      return `<section class="release-group">${title ? `<h3>${esc(title)}</h3>` : ''}${listHtml(section?.changes)}</section>`;
    }).join('');
  }

  function releaseHtml(release,index) {
    return `<details class="release-card${release?.version === VERSION ? ' is-current' : ''}" ${index === 0 ? 'open' : ''}><summary class="release-summary"><span class="release-version">v${esc(release?.version)}</span><span class="release-title">${esc(release?.title)}</span><span class="release-arrow">›</span></summary><div class="release-body">${bodyHtml(release)}</div></details>`;
  }

  function renderChangelog() {
    try { window.RoyalNav?.pushCurrent?.(); } catch (_) {}
    try { if (typeof setActiveNav === 'function') setActiveNav('changelog'); } catch (_) {}
    document.body.classList.add('royal-section-screen');
    document.querySelectorAll('.bottom-nav .nav').forEach(btn => btn.classList.remove('active'));
    const panel = document.getElementById('panel');
    if (!panel) return;
    panel.hidden = false;
    panel.innerHTML = `<div class="changelog-screen"><button type="button" class="royal-back-button" data-royal-back="1">← Назад</button><div class="changelog-head"><h2>История изменений</h2><p class="changelog-developer">Разработчик: <a href="https://t.me/ansoloway" target="_blank" rel="noopener">@ansoloway</a></p><p class="changelog-developer">Помощь в разработке, тесты: <a href="https://t.me/sfinks_spb" target="_blank" rel="noopener">@sfinks_spb</a> · <a href="https://t.me/O_Chaplygina" target="_blank" rel="noopener">@O_Chaplygina</a> · <a href="https://t.me/Yanochka_2404" target="_blank" rel="noopener">@Yanochka_2404</a> · <a href="https://t.me/DmitryRoyal" target="_blank" rel="noopener">@DmitryRoyal</a></p><p>Что добавлялось и менялось в приложении Чата Победителей.</p><span class="changelog-current">● Текущая версия v${VERSION}</span></div><div class="changelog-list">${RELEASES.map(releaseHtml).join('')}</div><div class="release-note">Новая версия добавляется сюда первой, предыдущая история сохраняется.</div></div>`;
    try { window.RoyalNav?.enhanceVisibleBack?.(); } catch (_) {}
    requestAnimationFrame(() => requestAnimationFrame(() => { try { window.scrollTo(0,0); } catch (_) {} }));
  }

  window.RoyalChangelog0601 = CURRENT_RELEASE;
  window.RoyalChangelog = { version:VERSION, releases:RELEASES, open:renderChangelog };
  window.__ROYAL_CHANGELOG_VERSION__ = VERSION;
})();