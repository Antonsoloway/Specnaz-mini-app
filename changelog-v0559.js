/* Royal CRM Mini App — changelog v0.5.59 */
(() => {
  const VERSION = '0.5.59';
  const previousRaw = Array.isArray(window.RoyalChangelog?.releases) ? window.RoyalChangelog.releases : [];
  function cleanChanges(changes) {
    return (Array.isArray(changes) ? changes : []).filter(item => {
      const text = String(item || '').toLocaleLowerCase('ru-RU');
      if (!text) return false;
      if (text.includes('@sfinks_spb') || text.includes('@o_chaplygina') || text.includes('@yanochka_2404') || text.includes('@dmitryroyal')) return false;
      if (text.includes('блок помощи в разработке') || text.includes('помощь в разработке, тест')) return false;
      return true;
    });
  }
  const previous = previousRaw.filter(item => String(item?.version || '') !== VERSION).map(item => ({ ...item, changes: cleanChanges(item?.changes) }));
  const RELEASES = [{
    version:'0.5.59',
    title:'Активные команды спецназа',
    changes:[
      'Команды со статусом «Активен» в Royal CRM выделяются золотой рамкой в списке команд и на карточках команд у участников.',
      'На странице активной команды название выделено золотым цветом и золотой рамкой, справа добавлен специальный значок.',
      'Крот теперь берётся точно из присланного чистого изображения и встроен напрямую в CSS как JPEG data-asset без SVG-обёрток и промежуточных файлов.',
      'У карточек активных команд справа вместо стрелки показывается такой же крот; эта зона остаётся частью кликабельной карточки и открывает выбранную команду.',
      'Заголовок каталога исправлен на «Команды принимающие участие в базе спецназа».',
      'На странице активных команд добавлены отдельные фильтры «Все / РМ / РК» и строка поиска по названию команды или игре.',
      'В поиск добавлен подтверждённый серверный алиас: команда BbllllKA в Royal Kingdom находится по запросу «вышка».',
      'Фото команд теперь кэшируются по стабильной связке «команда + игра», а не по временным Google URL; сохранённые фото поднимаются из IndexedDB в память после загрузки CRM.',
      'На iPhone исправлено исчезновение фото команды после открытия: медиакэш больше не стирает уже показанный CRM-src до завершения асинхронного чтения, а при проблеме кэша/прокси возвращает исходное фото вместо замка.',
      'У участников без @username отображается кнопка «Связаться»: Голубец отправляет в ЛС Telegram inline-кнопку «Открыть профиль» по raw Telegram ID. После отправки Mini App показывает «Ссылка готова», а кнопка «Открыть Голубя» переводит в чат с ботом. Прямой tg://user?id из Mini App не используется.',
      'Кнопки «Связаться» теперь повторно восстанавливаются после возврата из профиля/команды в список участников, включая Telegram системный Back.',
      'Авторизация стала устойчивее к кратковременным задержкам: /auth ждёт до 12 секунд и один раз автоматически повторяет запрос при таймауте или сетевом сбое; Android AbortError code 20 нормализуется в AUTH_TIMEOUT.',
      'Нажатие на значок на странице команды открывает каталог активных команд.'
    ]
  }, ...previous];
  function esc(value){return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}
  function releaseHtml(release,index){const current=release.version===VERSION;const items=cleanChanges(release.changes).map(item=>`<li>${esc(item)}</li>`).join('');return `<details class="release-card${current?' is-current':''}" ${index===0?'open':''}><summary class="release-summary"><span class="release-version">v${esc(release.version)}</span><span class="release-title">${esc(release.title)}</span><span class="release-arrow">›</span></summary><div class="release-body"><ul>${items}</ul></div></details>`;}
  function renderChangelog(){try{window.RoyalNav?.pushCurrent?.();}catch(_){}document.body.classList.add('royal-section-screen');document.querySelectorAll('.bottom-nav .nav').forEach(btn=>btn.classList.remove('active'));const panel=document.getElementById('panel');if(!panel)return;panel.hidden=false;panel.innerHTML=`<div class="changelog-screen"><button type="button" class="royal-back-button" data-royal-back="1">← Назад</button><div class="changelog-head"><h2>История изменений</h2><p class="changelog-developer">Разработчик: <a href="https://t.me/ansoloway" target="_blank" rel="noopener">@ansoloway</a></p><p class="changelog-developer">Помощь в разработке, тесты: <a href="https://t.me/sfinks_spb" target="_blank" rel="noopener">@sfinks_spb</a> · <a href="https://t.me/O_Chaplygina" target="_blank" rel="noopener">@O_Chaplygina</a> · <a href="https://t.me/Yanochka_2404" target="_blank" rel="noopener">@Yanochka_2404</a> · <a href="https://t.me/DmitryRoyal" target="_blank" rel="noopener">@DmitryRoyal</a></p><p>Что добавлялось и менялось в приложении Чата Победителей.</p><span class="changelog-current">● Текущая версия v${VERSION}</span></div><div class="changelog-list">${RELEASES.map(releaseHtml).join('')}</div><div class="release-note">Новая версия добавляется сюда первой, предыдущая история сохраняется.</div></div>`;try{window.RoyalNav?.enhanceVisibleBack?.();}catch(_){}requestAnimationFrame(()=>requestAnimationFrame(()=>{try{window.scrollTo(0,0);}catch(_){}}));}
  window.RoyalChangelog={version:VERSION,releases:RELEASES,open:renderChangelog};
  window.__ROYAL_CHANGELOG_VERSION__=VERSION;
})();