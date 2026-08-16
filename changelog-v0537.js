/* Royal CRM Mini App — changelog v0.5.37 */
(() => {
  const VERSION = '0.5.37';
  const previous = Array.isArray(window.RoyalChangelog?.releases) ? window.RoyalChangelog.releases : [];
  const RELEASES = [{
    version:'0.5.37',
    title:'Рамки медиа и надёжная история версий',
    changes:[
      'У всех медиа проекта «МАЯК» добавлены заметные двойные рамки: отдельная внешняя рамка карточки и внутренняя рамка самого файла.',
      'Рамки применяются к итоговым изображениям, видео и аудиоплееру в едином стиле проекта.',
      'Исправлен механизм открытия истории изменений: плашка версии теперь всегда открывает самую новую историю, а не старый обработчик предыдущей версии.',
      'Запись v0.5.36 сохранена в истории и отображается сразу под текущей v0.5.37.',
      'Строка «Помощь в разработке, тесты: @sfinks_spb» сохранена.'
    ]
  }, ...previous.filter(item => String(item?.version || '') !== VERSION)];

  function esc(value){return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}
  function releaseHtml(release,index){const current=release.version===VERSION;const items=(release.changes||[]).map(item=>`<li>${esc(item)}</li>`).join('');return `<details class="release-card${current?' is-current':''}" ${index===0?'open':''}><summary class="release-summary"><span class="release-version">v${esc(release.version)}</span><span class="release-title">${esc(release.title)}</span><span class="release-arrow">›</span></summary><div class="release-body"><ul>${items}</ul></div></details>`;}

  function renderChangelog(){
    try{window.RoyalNav?.pushCurrent?.();}catch(_){}
    document.body.classList.add('royal-section-screen');
    document.querySelectorAll('.bottom-nav .nav').forEach(btn=>btn.classList.remove('active'));
    const panel=document.getElementById('panel');
    if(!panel)return;
    panel.hidden=false;
    panel.innerHTML=`<div class="changelog-screen"><button type="button" class="royal-back-button" data-royal-back="1">← Назад</button><div class="changelog-head"><h2>История изменений</h2><p class="changelog-developer">Разработчик: <a href="https://t.me/ansoloway" target="_blank" rel="noopener">@ansoloway</a></p><p class="changelog-developer">Помощь в разработке, тесты: <a href="https://t.me/sfinks_spb" target="_blank" rel="noopener">@sfinks_spb</a></p><p>Что добавлялось и менялось в приложении Чата Победителей.</p><span class="changelog-current">● Текущая версия v${VERSION}</span></div><div class="changelog-list">${RELEASES.map(releaseHtml).join('')}</div><div class="release-note">Новая версия добавляется сюда первой, предыдущая история сохраняется.</div></div>`;
    try{window.RoyalNav?.enhanceVisibleBack?.();}catch(_){}
    requestAnimationFrame(()=>requestAnimationFrame(()=>{try{window.scrollTo(0,0);}catch(_){}}));
  }

  function prepareBadge(){
    const badge=document.getElementById('versionBadge');
    if(!badge)return;
    badge.setAttribute('role','button');
    badge.setAttribute('tabindex','0');
    badge.setAttribute('aria-label',`Версия ${VERSION}. Открыть историю изменений`);
    badge.setAttribute('title','История изменений');
  }

  prepareBadge();
  window.RoyalChangelog={version:VERSION,releases:RELEASES,open:renderChangelog};
  window.__ROYAL_CHANGELOG_VERSION__=VERSION;
})();
