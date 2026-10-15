/* Royal CRM Mini App v0.6.1 — live additions to the current changelog card */
(() => {
  'use strict';

  const VERSION = '0.6.1';
  const PATCH_VERSION = '0.6.1-changelog-latest.7';
  const CHANGE = 'В админском Журнале исправлен порядок записей: все события теперь принудительно сортируются по фактическому времени от новых к старым, независимо от источника записи и порядка, в котором данные пришли с сервера.';

  const AGENT_CHANGE = 'Добавлен отдельный админский модуль «Сосиска»: поиск команд Royal Match, выбор по описанию и лидеру, состав игроков, снимки, история изменений и управление отслеживанием.';

  const FILTER_CHANGE = 'В поиске Сосиски добавлены совместные фильтры: командные очки от указанного значения, ник лидера, число участников, уровень и короны для входа, открытая или закрытая команда. Подробности проверяются по всем найденным командам, включая следующие страницы.';

  const PERIOD_CHANGE = 'Снимки от 5 минут, почасовая активность по дням и экспорт истории команды за выбранные даты в JSON. Сосиска: состав отсортирован по уровням и коронам, технический JSON убран. При открытии команды загружается вся история, рассчитываются изменения игроков и скорости уровней/корон в час, отдельно отмечены выходы и сбросы. Причина недоступности ИИ показывается явно.';

  const TEAM_CHANGE = 'Для Royal Match добавлена привязка игрового ID через поиск Сосиски с фильтрами. Вместо скриншота можно показывать актуальные сведения команды, лидера и до трёх помощников. Название редактируется, сохранённый скриншот остаётся доступным. Исправлено открытие поиска поверх окна редактирования команды.';

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

  const EMOJI_CHANGE='При привязке Royal Match эмодзи эмблемы автоматически добавляется перед названием команды. В редакторе уже привязанной команды эмодзи подставляется, если его ещё нет; название можно изменить вручную перед сохранением.';
  if (!section.changes.includes(EMOJI_CHANGE)) section.changes.unshift(EMOJI_CHANGE);

  current.changes = current.sections.flatMap(item => Array.isArray(item?.changes) ? item.changes : []);
  window.RoyalChangelog0601 = current;
  window.__ROYAL_CHANGELOG_LATEST_V061__ = PATCH_VERSION;
})();
