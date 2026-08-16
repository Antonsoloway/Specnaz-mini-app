/* Royal CRM Mini App — changelog v0.5.49 */
(() => {
  const VERSION = '0.5.49';
  const previous = Array.isArray(window.RoyalChangelog?.releases) ? window.RoyalChangelog.releases : [];
  const RELEASES = [{
    version:'0.5.49',
    title:'Гибридный поиск',
    changes:[
      'Поиск v0.5.47 сохранён как независимый основной fallback: searchKeys больше не заменяют старую поисковую логику и не могут ухудшить её.',
      'Готовые searchKeys из snapshot добавляются вторым слоем к локальному поисковому тексту карточки.',
      'Исправлены подтверждённые варианты: MOLOT POKA ↔ молот рока, XAOC ↔ хаос, TOPMO3OB HET ↔ тормозов нет, HEPBbI B HOPME ↔ нервы в норме, Aquamarine ↔ аквамарин, Da budet swet ↔ да будет свет.',
      'Генератор searchKeys доработан: псевдокириллические названия читаются по словам, поэтому POKA читается как РОКА, а обычное MOLOT остаётся МОЛОТ.',
      'Android-safe ввод v0.5.47 сохранён: поле не перерисовывается, IME не блокируется, карточки только скрываются/показываются.',
      'Unified Snapshot подготовлен к v1.2.0 / schema 1.4.1 / searchIndexVersion 1.1.0.',
      'Блок помощи в разработке и тестировании сохранён: @sfinks_spb, @O_Chaplygina, @Yanochka_2404.'
    ]
  }, ...previous.filter(item => String(item?.version || '') !== VERSION)];

  function esc(value){return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}
  function releaseHtml(release,index){const current=release.version===VERSION;const items=(release.changes||[]).map(item=>`<li>${esc(item)}</li>`).join('');return `<details class="release-card${current?' is-current':''}" ${index===0?'open':''}><summary class="release-summary"><span class="release-version">v${esc(release.version)}</span><span class="release-title">${esc(release.title)}</span><span class="release-arrow">›</span></summary><div class="release-body"><ul>${items}</ul></div></details>`;}
  function renderChangelog(){try{window.RoyalNav?.pushCurrent?.();}catch(_){}document.body.classList.add('royal-section-screen');document.querySelectorAll('.bottom-nav .nav').forEach(btn=>btn.classList.remove('active'));const panel=document.getElementById('panel');if(!panel)return;panel.hidden=false;panel.innerHTML=`<div class="changelog-screen"><button type="button" class="royal-back-button" data-royal-back="1">← Назад</button><div class="changelog-head"><h2>История изменений</h2><p class="changelog-developer">Разработчик: <a href="https://t.me/ansoloway" target="_blank" rel="noopener">@ansoloway</a></p><p class="changelog-developer">Помощь в разработке, тесты: <a href="https://t.me/sfinks_spb" target="_blank" rel="noopener">@sfinks_spb</a> · <a href="https://t.me/O_Chaplygina" target="_blank" rel="noopener">@O_Chaplygina</a> · <a href="https://t.me/Yanochka_2404" target="_blank" rel="noopener">@Yanochka_2404</a></p><p>Что добавлялось и менялось в приложении Чата Победителей.</p><span class="changelog-current">● Текущая версия v${VERSION}</span></div><div class="changelog-list">${RELEASES.map(releaseHtml).join('')}</div><div class="release-note">Новая версия добавляется сюда первой, предыдущая история сохраняется.</div></div>`;try{window.RoyalNav?.enhanceVisibleBack?.();}catch(_){}requestAnimationFrame(()=>requestAnimationFrame(()=>{try{window.scrollTo(0,0);}catch(_){}}));}
  window.RoyalChangelog={version:VERSION,releases:RELEASES,open:renderChangelog};
  window.__ROYAL_CHANGELOG_VERSION__=VERSION;
})();
