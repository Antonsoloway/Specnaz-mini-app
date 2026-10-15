/* Royal CRM Mini App v0.6.1 — live additions to the current changelog card */
(() => {
  'use strict';

  const VERSION = '0.6.1';
  const PATCH_VERSION = '0.6.1-changelog-latest.13';
  const CHANGE = 'В админском Журнале исправлен порядок записей: все события теперь принудительно сортируются по фактическому времени от новых к старым, независимо от источника записи и порядка, в котором данные пришли с сервера.';

  const AGENT_CHANGE = 'Добавлен отдельный админский модуль «Сосиска»: поиск команд Royal Match, выбор по описанию и лидеру, состав игроков, снимки, история изменений и управление отслеживанием.';

  const FILTER_CHANGE = 'В поиске Сосиски добавлены совместные фильтры: командные очки от указанного значения, ник лидера, число участников, уровень и короны для входа, открытая или закрытая команда. Подробности проверяются по всем найденным командам, включая следующие страницы.';

  const PERIOD_CHANGE = 'Снимки от 5 минут, почасовая активность по дням и экспорт истории команды за выбранные даты в JSON. Сосиска: состав отсортирован по уровням и коронам, технический JSON убран. При открытии команды загружается вся история, рассчитываются изменения игроков и скорости уровней/корон в час, отдельно отмечены выходы и сбросы. Причина недоступности ИИ показывается явно.';

  const TEAM_CHANGE = 'Для Royal Match добавлена привязка игрового ID через поиск Сосиски с фильтрами. Вместо скриншота можно показывать актуальные сведения команды, лидера и до трёх помощников. Название редактируется, сохранённый скриншот остаётся доступным. Исправлено открытие поиска поверх окна редактирования команды.';

  const MEDIA_SAVE_CHANGE = 'Уменьшено число обращений к таблице при переименовании команды: все пять слотов состава читаются одним запросом. Фото с неизменившимися байтами не записывается повторно в GitHub; конфликт записи автоматически проверяется повторно с тем же содержимым.';

  const releases = Array.isArray(window.RoyalChangelog?.releases)
    ? window.RoyalChangelog.releases
    : [];
  const current = releases.find(item => String(item?.version || '') === VERSION) || null;
  if (!current) return;

  if (!Array.isArray(current.sections)) current.sections = [];
  let section = current.sections.find(item => String(item?.title || '') === 'Последние изменения');
  if (!section) {
    section = { title:'Последние изменения', changes:[] };
    current.sections.unshift(section);
  }
  if (!Array.isArray(section.changes)) section.changes = [];
  const CARD_REPAIR='Исправлены повторяющиеся блоки загрузки карточки RM и исчезновение админского редактора. Описание теперь занимает всю ширину, ники лидера и помощников отделены от показателей. Исправлены слишком короткое ожидание сервера и обработка временного сбоя; сохранённый скриншот доступен при ошибке.';
  if (!section.changes.includes(CARD_REPAIR)) section.changes.unshift(CARD_REPAIR);
  const EMBLEM_CHANGE='Добавлены 176 игровых эмблем Royal Match: перед названиями привязанных команд, в поиске, карточках, профилях игроков и сравнении Сосиски. Эмблема выбирается по номеру сервера; редактирование названия не меняет эмблему.';
  if (!section.changes.includes(EMBLEM_CHANGE)) section.changes.unshift(EMBLEM_CHANGE);
  if (!section.changes.includes(TEAM_CHANGE)) section.changes.unshift(TEAM_CHANGE);
  if (!section.changes.includes(CHANGE)) section.changes.unshift(CHANGE);

  if (!section.changes.includes(AGENT_CHANGE)) section.changes.unshift(AGENT_CHANGE);

  if (!section.changes.includes(FILTER_CHANGE)) section.changes.unshift(FILTER_CHANGE);

  if (!section.changes.includes(PERIOD_CHANGE)) section.changes.unshift(PERIOD_CHANGE);

  const CACHE_CHANGE='Карточки Royal Match сохраняют последние загруженные данные на устройстве: при повторном открытии показывают их сразу и обновляют в фоне. При сбое остаются сохранённые сведения с датой обновления.';
  if (!section.changes.includes(CACHE_CHANGE)) section.changes.unshift(CACHE_CHANGE);

  const EMOJI_CHANGE='При привязке Royal Match эмодзи эмблемы автоматически добавляется вплотную перед названием команды, без пробела (🇷🇺FORTUNA). В редакторе уже привязанной команды эмодзи подставляется, если его ещё нет; название можно изменить вручную перед сохранением.';
  if (!section.changes.includes(EMOJI_CHANGE)) section.changes.unshift(EMOJI_CHANGE);

  const EMBLEM_DISPLAY='Если у привязанной команды загрузилась игровая эмблема, начальный эмодзи в отображаемом названии скрывается: остаются эмблема и название. Без привязки или при недоступной эмблеме полное название с эмодзи сохраняется.';
  if (!section.changes.includes(EMBLEM_DISPLAY)) section.changes.unshift(EMBLEM_DISPLAY);

  const MEMBERSHIP_CHANGE='В Сосиске добавлены «Выбывшие» и «Новенькие» за всё время слежения с датами изменений. В составе новенькие и вернувшиеся отмечены зелёным, выбывшие — красным и показаны отдельно. Исходный состав первого снимка не считается новеньким.';
  if (!section.changes.includes(MEMBERSHIP_CHANGE)) section.changes.unshift(MEMBERSHIP_CHANGE);

  const SAVE_REPAIR='Исправлено повторное сохранение в админском редакторе: запоздавшее обновление не возвращает старую карточку после переименования; новое название обновляется и в локальных составах. При долгом ответе выполняется одна безопасная проверка с тем же ID операции. Сохранение без изменений не отправляет лишний запрос.';
  if (!section.changes.includes(SAVE_REPAIR)) section.changes.unshift(SAVE_REPAIR);
  if (!section.changes.includes(MEDIA_SAVE_CHANGE)) section.changes.unshift(MEDIA_SAVE_CHANGE);
  const READABLE_ANALYSIS = 'ИИ-анализ получает новый формат простым русским языком: короткие выводы, даты по Москве и ключевые игроки без служебных полей. Отчёты отображаются с заголовками и списками; старые таблицы открываются отдельно. Состав и активность игроков свёрнуты по умолчанию. Почасовой график уплотнён: время и числа больше не переносятся по символам.';
  if (!section.changes.includes(READABLE_ANALYSIS)) section.changes.unshift(READABLE_ANALYSIS);

  const EMBLEM_REPAIR='Восстановлены 15 пустых файлов игровых эмблем. Все 176 изображений проверяются на открытие в браузере; исправленные картинки загружаются без старого кэша.';
  if (!section.changes.includes(EMBLEM_REPAIR)) section.changes.unshift(EMBLEM_REPAIR);

  const TEAM_TITLE='В списке команд название с эмблемой расположено одной строкой на всю ширину карточки. Скриншот и значок спецназа размещены ниже; очень длинные названия сокращаются многоточием без переноса.';
  if (!section.changes.includes(TEAM_TITLE)) section.changes.unshift(TEAM_TITLE);

  const TEAM_LOADING='Ожидание сведений о команде ограничено целиком, включая чтение ответа и повтор. Зависший запрос больше не удерживает обновление остальных карточек. При занятой игровой сессии появляется отдельное сообщение; сохранённые данные остаются, кнопка обновления снова доступна.';
  if (!section.changes.includes(TEAM_LOADING)) section.changes.unshift(TEAM_LOADING);

  current.changes = current.sections.flatMap(item => Array.isArray(item?.changes) ? item.changes : []);
  window.RoyalChangelog0601 = current;
  window.__ROYAL_CHANGELOG_LATEST_V061__ = PATCH_VERSION;


})();
