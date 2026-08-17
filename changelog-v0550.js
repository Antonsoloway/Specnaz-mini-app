/* Royal CRM Mini App — changelog v0.5.50 */
(() => {
  const VERSION = '0.5.50';
  const previous = Array.isArray(window.RoyalChangelog?.releases) ? window.RoyalChangelog.releases : [];
  const RELEASES = [{
    version:'0.5.50',
    title:'Фильтр по игре и клавиатура',
    changes:[
      'На страницах «Участники» и «Команды» над поиском добавлен переключатель Все / РМ / РК. По умолчанию выбран режим «Все».',
      'Фильтр и поиск работают совместно: при выборе РМ учитываются только данные Royal Match, при выборе РК — только Royal Kingdom.',
      'Для участника с двумя играми имя и @ник доступны в обеих его играх, но командные поля, игровые ники и роли при активном фильтре ищутся только внутри выбранной игры.',
      'Переключение Все / РМ / РК не очищает введённый поисковый запрос и сразу пересчитывает результаты.',
      'Исправлено поведение экранной клавиатуры: при прокрутке результатов, тапе вне поля поиска или нажатии Enter поле теряет фокус и клавиатура закрывается, а текст запроса сохраняется.',
      'Гибридный поиск v0.5.49 сохранён: локальный поиск v0.5.47 остаётся основой, searchKeys только добавляют совпадения.',
      'Блок помощи в разработке и тестировании сохранён: @sfinks_spb, @O_Chaplygina, @Yanochka_2404.'
    ]
  }, ...previous.filter(item => String(item?.version || '') !== VERSION)];
  function esc(value){return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}
  function releaseHtml(release,index){const current=release.version===VERSION;const items=(release.changes||[]).map(item=>`<li>${esc(item)}</li>`).join('');return `<details class="release-card${current?' is-current':''}" ${index===0?'open':''}><summary class="release-summary"><span class="release-version">v${esc(release.version)}</span><span class="release-title">${esc(release.title)}</span><span class="release-arrow">›</span></summary><div class="release-body"><ul>${items}</ul></div></details>`;}
  function renderChangelog(){try{window.RoyalNav?.pushCurrent?.();}catch(_){}document.body.classList.add('royal-section-screen');document.querySelectorAll('.bottom-nav .nav').forEach(btn=>btn.classList.remove('active'));const panel=document.getElementById('panel');if(!panel)return;panel.hidden=false;panel.innerHTML=`<div class="changelog-screen"><button type="button" class="royal-back-button" data-royal-back="1">← Назад</button><div class="changelog-head"><h2>История изменений</h2><p class="changelog-developer">Разработчик: <a href="https://t.me/ansoloway" target="_blank" rel="noopener">@ansoloway</a></p><p class="changelog-developer">Помощь в разработке, тесты: <a href="https://t.me/sfinks_spb" target="_blank" rel="noopener">@sfinks_spb</a> · <a href="https://t.me/O_Chaplygina" target="_blank" rel="noopener">@O_Chaplygina</a> · <a href="https://t.me/Yanochka_2404" target="_blank" rel="noopener">@Yanochka_2404</a></p><p>Что добавлялось и менялось в приложении Чата Победителей.</p><span class="changelog-current">● Текущая версия v${VERSION}</span></div><div class="changelog-list">${RELEASES.map(releaseHtml).join('')}</div><div class="release-note">Новая версия добавляется сюда первой, предыдущая история сохраняется.</div></div>`;try{window.RoyalNav?.enhanceVisibleBack?.();}catch(_){}requestAnimationFrame(()=>requestAnimationFrame(()=>{try{window.scrollTo(0,0);}catch(_){}}));}
  window.RoyalChangelog={version:VERSION,releases:RELEASES,open:renderChangelog};
  window.__ROYAL_CHANGELOG_VERSION__=VERSION;
})();
