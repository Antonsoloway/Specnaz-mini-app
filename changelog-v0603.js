/* Royal CRM v0.6.2 — Sosiska RM/RK isolation release. */
(() => {
  const VERSION='0.6.3';
  const sections=[
    {title:'Royal Kingdom: карточка игрока',changes:[
      'Исправлено получение статистики игроков RK: Cloudflare-агент декодирует подтверждённые поля ClientStats и BackendStats из ответа игрового сервера вместо пустой статистики.',
      'Карточка RK приведена к разделам реальной игры: статистика арены (всего кубков, рекорд кубков, победы на арене), основная статистика (победы с первой попытки, победы на уровнях, помощь, недельный рекорд, коллекции, построенные районы) и рейтинг.',
      'Раздел RK показывает только доступные серверные значения; отсутствующие поля остаются прочерками, а нулевой ранг не считается настоящей позицией.',
      'В карточках состава и текущих значениях RK используются кубки, а не короны RM.'
    ]},
    {title:'Битвы RK',changes:[
      'На кнопке выбора показателя RK указано «Битва» вместо «Турнир / битва». В RM прежняя надпись и расписание событий сохранены.',
      'Наблюдение за командами, история снимков и отдельные хранилища RM/RK не изменены.'
    ]}
  ];
  const previous=Array.isArray(window.RoyalChangelog?.releases)
    ? window.RoyalChangelog.releases.filter(r=>String(r?.version||'')!==VERSION):[];
  const release={version:VERSION,title:'RK: статистика игроков и битвы',sections,changes:sections.flatMap(s=>s.changes)};
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
