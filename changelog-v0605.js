/* Royal CRM v0.6.2 — Sosiska RM/RK isolation release. */
(() => {
  const VERSION='0.6.5';
  const sections=[
    {title:'RK: надёжная загрузка профилей',changes:[
      'При временной ошибке игрового сервера RK выполняется одна дополнительная попытка после паузы. Неверные и чужие данные не принимаются.',
      'Успешно загруженные показатели игроков сохраняются в ограниченном кратковременном кэше RK; при сетевом сбое доступна предыдущая достоверная статистика.',
      'На карточке явно отмечается использование сохранённых данных и настоящее время их получения. Старые значения не выдаются за только что обновлённые.',
      'Эмблемы RK 0–183, поиск и отслеживание команд, а также вся механика RM не изменены.'
    ]}
  ];
  const previous=Array.isArray(window.RoyalChangelog?.releases)
    ? window.RoyalChangelog.releases.filter(r=>String(r?.version||'')!==VERSION):[];
  const release={version:VERSION,title:'RK: надёжная загрузка профилей',sections,changes:sections.flatMap(s=>s.changes)};
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
