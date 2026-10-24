/* Royal CRM v0.6.2 — Sosiska RM/RK isolation release. */
(() => {
  const VERSION='0.6.14';
  const sections=[{title:"\u041a\u043e\u043c\u0430\u043d\u0434\u044b \u0438 \u043d\u0430\u0432\u0438\u0433\u0430\u0446\u0438\u044f",changes:[
    "\u0418\u0441\u043f\u0440\u0430\u0432\u043b\u0435\u043d \u043f\u0435\u0440\u0435\u0445\u043e\u0434 \u0441 \u0433\u043b\u0430\u0432\u043d\u043e\u0439 \u0441\u0442\u0440\u0430\u043d\u0438\u0446\u044b \u043a \u0441\u0432\u043e\u0435\u0439 \u043a\u043e\u043c\u0430\u043d\u0434\u0435 Royal Kingdom \u043f\u0440\u0438 \u0440\u0430\u0437\u043d\u044b\u0445 \u043d\u0430\u043f\u0438\u0441\u0430\u043d\u0438\u044f\u0445 \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u044f.",
    "\u041a\u043e\u043c\u0430\u043d\u0434\u0430 \u043d\u0430\u0445\u043e\u0434\u0438\u0442\u0441\u044f \u043f\u043e \u0438\u0433\u0440\u043e\u0432\u043e\u043c\u0443 ID \u0438 \u0438\u0433\u0440\u0435; \u043f\u043e\u0438\u0441\u043a \u043f\u043e \u043f\u043e\u0445\u043e\u0436\u0438\u043c \u0438\u043c\u0435\u043d\u0430\u043c \u043d\u0435 \u043e\u0442\u043a\u0440\u044b\u0432\u0430\u0435\u0442 \u0447\u0443\u0436\u0443\u044e \u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0443.",
    "\u041f\u0440\u0438 \u0441\u0442\u0430\u0440\u044b\u0445 \u0434\u0430\u043d\u043d\u044b\u0445 \u0430\u0434\u043c\u0438\u043d\u043a\u0438 \u043e\u0434\u0438\u043d \u0440\u0430\u0437 \u043e\u0431\u043d\u043e\u0432\u043b\u044f\u0435\u0442\u0441\u044f \u0441\u043f\u0440\u0430\u0432\u043e\u0447\u043d\u0438\u043a \u043a\u043e\u043c\u0430\u043d\u0434.",
  ]}];
  const previous=Array.isArray(window.RoyalChangelog?.releases)
    ? window.RoyalChangelog.releases.filter(r=>String(r?.version||'')!==VERSION):[];
  const release={version:VERSION,title:"\u041f\u0435\u0440\u0435\u0445\u043e\u0434 \u0432 \u0441\u0432\u043e\u044e \u043a\u043e\u043c\u0430\u043d\u0434\u0443",sections,changes:sections.flatMap(s=>s.changes)};
  const releases=[release,...previous];
  const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const list=changes=>'<ul>'+(changes||[]).map(change=>'<li>'+esc(change)+'</li>').join('')+'</ul>';
  const releaseBody=r=>Array.isArray(r.sections)&&r.sections.length?r.sections.map(s=>'<section class="release-group">'+
    (s.title?'<h3>'+esc(s.title)+'</h3>':'')+list(s.changes)+'</section>').join(''):list(r.changes);
  const card=(r,index)=>'<details class="release-card'+(index===0?' is-current':'')+'" '+(index===0?'open':'')+
    '><summary class="release-summary"><span class="release-version">v'+esc(r.version)+'</span><span class="release-title">'+
    esc(r.title)+'</span><span class="release-arrow">›</span></summary><div class="release-body">'+releaseBody(r)+'</div></details>';
  function open(){
    try{window.RoyalNav?.pushCurrent?.();}catch{}
    try{if(typeof setActiveNav==='function')setActiveNav('changelog');}catch{}
    document.body.classList.add('royal-section-screen');
    document.querySelectorAll('.bottom-nav .nav').forEach(b=>b.classList.remove('active'));
    const panel=document.getElementById('panel');if(!panel)return;
    panel.hidden=false;
    panel.innerHTML='<div class="changelog-screen"><button type="button" class="royal-back-button" data-royal-back="1">← Назад</button>'+
      '<div class="changelog-head"><h2>История изменений</h2><p class="changelog-developer">Разработчик: <a href="https://t.me/ansoloway" target="_blank" rel="noopener">@ansoloway</a></p>'+
      '<p class="changelog-developer">Помощь в разработке, тесты: <a href="https://t.me/sfinks_spb" target="_blank" rel="noopener">@sfinks_spb</a> · '+
      '<a href="https://t.me/O_Chaplygina" target="_blank" rel="noopener">@O_Chaplygina</a> · '+
      '<a href="https://t.me/Yanochka_2404" target="_blank" rel="noopener">@Yanochka_2404</a> · '+
      '<a href="https://t.me/DmitryRoyal" target="_blank" rel="noopener">@DmitryRoyal</a></p>'+
      '<span class="changelog-current">Текущая версия v'+VERSION+'</span></div>'+
      '<div class="changelog-list">'+releases.map(card).join('')+'</div></div>';
    try{window.RoyalNav?.enhanceVisibleBack?.();}catch{}
    requestAnimationFrame(()=>requestAnimationFrame(()=>{try{window.scrollTo(0,0);}catch{}}));
  }
  window.RoyalChangelog={version:VERSION,releases,open};
  window.__ROYAL_CHANGELOG_VERSION__=VERSION;
})();
