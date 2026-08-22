/* Royal CRM Mini App — changelog v0.6.0 release candidate */
(() => {
  const VERSION = '0.6.0';
  const previous = Array.isArray(window.RoyalChangelog?.releases)
    ? window.RoyalChangelog.releases.filter(item => String(item?.version || '') !== VERSION)
    : [];

  const SECTIONS = [
    {
      title:'Админ-режим',
      changes:[
        'Добавлен отдельный защищённый админ-режим. Вход в него находится в карточке самого администратора и появляется только после серверной проверки прав.',
        'В админ-режиме доступны полные списки участников и команд, включая участников со статусом «Вышел» и неактивные команды.',
        'Добавлены поиск, фильтры, привычные карточки и отдельные страницы участников и команд без перехода обратно в публичный раздел.',
        'Появились четыре рейтинга участников и шесть рейтингов команд по показателям Royal CRM.',
        'Добавлен журнал административных изменений с информацией об операции, администраторе и состоянии записи до и после изменения.'
      ]
    },
    {
      title:'Участники',
      changes:[
        'Администратор может создавать участников и изменять CRM-имя и пять игровых слотов существующего участника.',
        'Telegram-имя, @username, состояние чата, дата и системные счётчики защищены от ручного изменения в приложении.',
        'В каждом игровом слоте появилась кнопка «Очистить данные». Она очищает только выбранный слот и записывает изменение после общей кнопки «Сохранить».',
        'Игровые слоты сохраняются одной атомарной операцией. При ошибке исходные значения и правила выбора роли восстанавливаются.',
        'Участника со статусом «Вышел» можно удалить только после подтверждения и повторной проверки фактического состояния на сервере.'
      ]
    },
    {
      title:'Команды и фотографии',
      changes:[
        'Администратор может создавать команды, изменять название и лидера, а также добавлять и заменять фотографию команды.',
        'При переименовании команды новое название автоматически обновляется во всех пяти игровых слотах участников той же игры.',
        'Фотографии и аватары в админ-режиме используют тот же постоянный кэш, что и обычные страницы приложения.',
        'Неактивную пустую команду можно удалить только после проверки числа игроков и отсутствия скрытых ссылок во всех игровых слотах.',
        'Исправлено ложное сообщение о таймауте после успешного сохранения команды с фотографией.'
      ]
    },
    {
      title:'Синхронизация и надёжность',
      changes:[
        'История изменений больше не исчезает при фоновом обновлении данных во время чтения и прокрутки.',
        'Сохранение завершается сразу после подтверждённой записи в Google Sheets, а публичный и административный снимки данных обновляются в фоне.',
        'Изменения из приложения и ручные изменения таблиц автоматически запускают обновление данных без перезапуска Telegram.',
        'Несколько быстрых последовательных правок защищены от возврата устаревшего снимка и не отменяют уже подтверждённые изменения.',
        'После сохранения или удаления временный сетевой сбой кнопки «Обновить» больше не скрывает последний подтверждённый экран.',
        'При кратковременной занятости таблицы приложение безопасно повторяет только разрешённую операцию и не создаёт дубликатов.',
        'Медленная загрузка админских карточек использует один защищённый запрос и общий кэш вместо нескольких конкурирующих обращений.',
        'Потеря прав администратора или ответ 401/403 немедленно очищает защищённые данные и не использует устаревший кэш.',
        'Редакторы участников и команд адаптированы для мобильной клавиатуры, длинной формы и корректной прокрутки до нижних игровых слотов.'
      ]
    },
    {
      title:'Запуск и музыка',
      changes:[
        'При запуске v0.6 показывается стартовая заставка с видео голубя в круге, пока приложение проверяет доступ и загружает данные.',
        'После успешной загрузки появляется персональное приветствие с именем участника, а затем открывается интерфейс приложения.',
        'Если справочник загружается медленно, заставка честно сообщает об этом и предлагает повторить загрузку или продолжить с уже доступными данными.',
        'Добавлена фоновая музыка из присланной композиции и кнопка включения или выключения звука.',
        'При первом запуске музыка включается сразу; если Telegram блокирует автозвук, воспроизведение начинается после первого обычного касания экрана без отдельного нажатия на кнопку звука.',
        'Выбор музыки сохраняется индивидуально для участника и применяется при следующих запусках; при ошибке чтения настройки музыка остаётся выключенной до явного нажатия.',
        'Музыка автоматически приостанавливается при сворачивании Telegram и во время воспроизведения другого аудио или видео.'
      ]
    },
    {
      title:'Безопасность',
      changes:[
        'Записи выполняются через защищённую цепочку Mini App → Worker → Apps Script → Google Sheets; служебный ключ не передаётся браузеру.',
        'Перед изменением и удалением сервер повторно проверяет права администратора, актуальность записи и допустимость операции.',
        'Публичные страницы не получают административный снимок, внутренние поля и недоступные обычному участнику записи.',
        'Музыкальный файл не публикуется в открытом репозитории и выдаётся только авторизованному участнику через защищённый запрос.'
      ]
    }
  ];

  const CURRENT_RELEASE = {
    version:VERSION,
    title:'Большое обновление Royal CRM',
    sections:SECTIONS,
    // Keep a flat list for older consumers that only understand `changes`.
    changes:SECTIONS.flatMap(section => section.changes)
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

  window.RoyalChangelog = { version:VERSION, releases:RELEASES, open:renderChangelog };
  window.__ROYAL_CHANGELOG_VERSION__ = VERSION;
})();
