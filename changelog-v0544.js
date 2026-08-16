/* Royal CRM Mini App — changelog v0.5.44 */
(() => {
  const VERSION = '0.5.44';
  const previous = Array.isArray(window.RoyalChangelog?.releases) ? window.RoyalChangelog.releases : [];
  const RELEASES = [{
    version:'0.5.44',
    title:'Исправление ввода поиска',
    changes:[
      'Исправлена критическая ошибка v0.5.43, из-за которой на части Android-клавиатур и Telegram WebView текст мог вообще не вводиться в поле поиска.',
      'Поиск больше не перехватывает и не блокирует input/composition события клавиатуры.',
      'Поле поиска теперь остаётся стабильным DOM-элементом во время набора; обновляется только список результатов.',
      'Старые обработчики, которые полностью перерисовывали страницу на каждую букву, удаляются через безопасную замену поля на чистую копию.',
      'Сохранён быстрый индексированный поиск и словарь псевдорусских названий из v0.5.43.',
      'Блок помощи в разработке и тестировании сохранён: @sfinks_spb, @O_Chaplygina, @Yanochka_2404.'
    ]
  }, ...previous.filter(item => String(item?.version || '') !== VERSION)];

  function esc(value){return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}
  function releaseHtml(release,index){const current=release.version===VERSION;const items=(release.changes||[]).map(item=>`<li>${esc(item)}</li>`).join('');return `<details class="release-card${current?' is-current':''}" ${index===0?'open':''}><summary class="release-summary"><span class="release-version">v${esc(release.version)}</span><span class="release-title">${esc(release.title)}</span><span class="release-arrow">›</span></summary><div class="release-body"><ul>${items}</ul></div></details>`;}
  function renderChangelog(){try{window.RoyalNav?.pushCurrent?.();}catch(_){}document.body.classList.add('royal-section-screen');document.querySelectorAll('.bottom-nav .nav').forEach(btn=>btn.classList.remove('active'));const panel=document.getElementById('panel');if(!panel)return;panel.hidden=false;panel.innerHTML=`<div class="changelog-screen"><button type="button" class="royal-back-button" data-royal-back="1">← Назад</button><div class="changelog-head"><h2>История изменений</h2><p class="changelog-developer">Разработчик: <a href="https://t.me/ansoloway" target="_blank" rel="noopener">@ansoloway</a></p><p class="changelog-developer">Помощь в разработке, тесты: <a href="https://t.me/sfinks_spb" target="_blank" rel="noopener">@sfinks_spb</a> · <a href="https://t.me/O_Chaplygina" target="_blank" rel="noopener">@O_Chaplygina</a> · <a href="https://t.me/Yanochka_2404" target="_blank" rel="noopener">@Yanochka_2404</a></p><p>Что добавлялось и менялось в приложении Чата Победителей.</p><span class="changelog-current">● Текущая версия v${VERSION}</span></div><div class="changelog-list">${RELEASES.map(releaseHtml).join('')}</div><div class="release-note">Новая версия добавляется сюда первой, предыдущая история сохраняется.</div></div>`;try{window.RoyalNav?.enhanceVisibleBack?.();}catch(_){}requestAnimationFrame(()=>requestAnimationFrame(()=>{try{window.scrollTo(0,0);}catch(_){}}));}
  window.RoyalChangelog={version:VERSION,releases:RELEASES,open:renderChangelog};
  window.__ROYAL_CHANGELOG_VERSION__=VERSION;
})();
