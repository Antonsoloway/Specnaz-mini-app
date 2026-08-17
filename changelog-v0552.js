/* Royal CRM Mini App — changelog v0.5.52 */
(() => {
  const VERSION = '0.5.52';
  const previousRaw = Array.isArray(window.RoyalChangelog?.releases) ? window.RoyalChangelog.releases : [];
  function cleanChanges(changes) {
    return (Array.isArray(changes) ? changes : []).filter(item => {
      const text = String(item || '').toLocaleLowerCase('ru-RU');
      if (!text) return false;
      if (text.includes('@sfinks_spb') || text.includes('@o_chaplygina') || text.includes('@yanochka_2404')) return false;
      if (text.includes('блок помощи в разработке') || text.includes('помощь в разработке, тест')) return false;
      return true;
    });
  }
  const previous = previousRaw.filter(item => String(item?.version || '') !== VERSION).map(item => ({ ...item, changes: cleanChanges(item?.changes) }));
  const RELEASES = [{
    version:'0.5.52',
    title:'Поиск названий РК в основном модуле',
    changes:[
      'Соответствия «HEPBbl B HOPME → нервы в норме» и «Mbl Pycckue → мы русские» перенесены прямо в основной гибридный поиск до построения кэша карточек.',
      'Запрос «нервы в норме» теперь должен находить обе одноимённые команды в режиме «Все» и только команду Royal Kingdom при фильтре РК.',
      'Убран зависимый от времени отдельный патч алиасов v0.5.51.'
    ]
  }, ...previous];
  function esc(value){return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}
  function releaseHtml(release,index){const current=release.version===VERSION;const items=cleanChanges(release.changes).map(item=>`<li>${esc(item)}</li>`).join('');return `<details class="release-card${current?' is-current':''}" ${index===0?'open':''}><summary class="release-summary"><span class="release-version">v${esc(release.version)}</span><span class="release-title">${esc(release.title)}</span><span class="release-arrow">›</span></summary><div class="release-body"><ul>${items}</ul></div></details>`;}
  function renderChangelog(){try{window.RoyalNav?.pushCurrent?.();}catch(_){}document.body.classList.add('royal-section-screen');document.querySelectorAll('.bottom-nav .nav').forEach(btn=>btn.classList.remove('active'));const panel=document.getElementById('panel');if(!panel)return;panel.hidden=false;panel.innerHTML=`<div class="changelog-screen"><button type="button" class="royal-back-button" data-royal-back="1">← Назад</button><div class="changelog-head"><h2>История изменений</h2><p class="changelog-developer">Разработчик: <a href="https://t.me/ansoloway" target="_blank" rel="noopener">@ansoloway</a></p><p class="changelog-developer">Помощь в разработке, тесты: <a href="https://t.me/sfinks_spb" target="_blank" rel="noopener">@sfinks_spb</a> · <a href="https://t.me/O_Chaplygina" target="_blank" rel="noopener">@O_Chaplygina</a> · <a href="https://t.me/Yanochka_2404" target="_blank" rel="noopener">@Yanochka_2404</a></p><p>Что добавлялось и менялось в приложении Чата Победителей.</p><span class="changelog-current">● Текущая версия v${VERSION}</span></div><div class="changelog-list">${RELEASES.map(releaseHtml).join('')}</div><div class="release-note">Новая версия добавляется сюда первой, предыдущая история сохраняется.</div></div>`;try{window.RoyalNav?.enhanceVisibleBack?.();}catch(_){}requestAnimationFrame(()=>requestAnimationFrame(()=>{try{window.scrollTo(0,0);}catch(_){}}));}
  window.RoyalChangelog={version:VERSION,releases:RELEASES,open:renderChangelog};
  window.__ROYAL_CHANGELOG_VERSION__=VERSION;
})();