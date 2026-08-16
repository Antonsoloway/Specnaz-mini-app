/* Royal CRM Mini App — changelog v0.5.46 */
(() => {
  const VERSION = '0.5.46';
  const previous = Array.isArray(window.RoyalChangelog?.releases) ? window.RoyalChangelog.releases : [];
  const RELEASES = [{
    version:'0.5.46',
    title:'Android-safe поиск',
    changes:[
      'Исправлена Android-регрессия v0.5.45: клавиатура больше не должна открываться с многосекундной задержкой и блокировать ввод.',
      'Полностью удалён предварительный prewarm расширенного поискового индекса CRM.',
      'Поиск больше не строит тяжёлые индексы по всем участникам и командам при первой введённой букве.',
      'Фильтрация работает по уже отрисованным карточкам и лёгким кэшированным текстовым ключам.',
      'Поиск не вмешивается в beforeinput/composition события Android IME; значение поля дополнительно читается лёгким таймером только пока поле находится в фокусе.',
      'Сохранены русско-латинский поиск и явные алиасы: нас не догонят, хаос, тормозов нет, майк, хабиб, джойбанд и другие ранее подтверждённые варианты.',
      'Блок помощи в разработке и тестировании сохранён: @sfinks_spb, @O_Chaplygina, @Yanochka_2404.'
    ]
  }, ...previous.filter(item => String(item?.version || '') !== VERSION)];

  function esc(value){return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}
  function releaseHtml(release,index){const current=release.version===VERSION;const items=(release.changes||[]).map(item=>`<li>${esc(item)}</li>`).join('');return `<details class="release-card${current?' is-current':''}" ${index===0?'open':''}><summary class="release-summary"><span class="release-version">v${esc(release.version)}</span><span class="release-title">${esc(release.title)}</span><span class="release-arrow">›</span></summary><div class="release-body"><ul>${items}</ul></div></details>`;}
  function renderChangelog(){try{window.RoyalNav?.pushCurrent?.();}catch(_){}document.body.classList.add('royal-section-screen');document.querySelectorAll('.bottom-nav .nav').forEach(btn=>btn.classList.remove('active'));const panel=document.getElementById('panel');if(!panel)return;panel.hidden=false;panel.innerHTML=`<div class="changelog-screen"><button type="button" class="royal-back-button" data-royal-back="1">← Назад</button><div class="changelog-head"><h2>История изменений</h2><p class="changelog-developer">Разработчик: <a href="https://t.me/ansoloway" target="_blank" rel="noopener">@ansoloway</a></p><p class="changelog-developer">Помощь в разработке, тесты: <a href="https://t.me/sfinks_spb" target="_blank" rel="noopener">@sfinks_spb</a> · <a href="https://t.me/O_Chaplygina" target="_blank" rel="noopener">@O_Chaplygina</a> · <a href="https://t.me/Yanochka_2404" target="_blank" rel="noopener">@Yanochka_2404</a></p><p>Что добавлялось и менялось в приложении Чата Победителей.</p><span class="changelog-current">● Текущая версия v${VERSION}</span></div><div class="changelog-list">${RELEASES.map(releaseHtml).join('')}</div><div class="release-note">Новая версия добавляется сюда первой, предыдущая история сохраняется.</div></div>`;try{window.RoyalNav?.enhanceVisibleBack?.();}catch(_){}requestAnimationFrame(()=>requestAnimationFrame(()=>{try{window.scrollTo(0,0);}catch(_){}}));}
  window.RoyalChangelog={version:VERSION,releases:RELEASES,open:renderChangelog};
  window.__ROYAL_CHANGELOG_VERSION__=VERSION;
})();
