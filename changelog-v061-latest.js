/* Royal CRM Mini App v0.6.1 — live additions to the current changelog card */
(() => {
  'use strict';

  const VERSION = '0.6.1';
  const PATCH_VERSION = '0.6.1-changelog-latest.2';
  const CHANGE = 'В админском Журнале исправлен порядок записей: все события теперь принудительно сортируются по фактическому времени от новых к старым, независимо от источника записи и порядка, в котором данные пришли с сервера.';

  const AGENT_CHANGE = 'Добавлен отдельный админский модуль «Сосиска»: поиск команд Royal Match, выбор по описанию и лидеру, состав игроков, снимки, история изменений и управление отслеживанием.';

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
  if (!section.changes.includes(CHANGE)) section.changes.unshift(CHANGE);

  if (!section.changes.includes(AGENT_CHANGE)) section.changes.unshift(AGENT_CHANGE);

  current.changes = current.sections.flatMap(item => Array.isArray(item?.changes) ? item.changes : []);
  window.RoyalChangelog0601 = current;
  window.__ROYAL_CHANGELOG_LATEST_V061__ = PATCH_VERSION;
})();
