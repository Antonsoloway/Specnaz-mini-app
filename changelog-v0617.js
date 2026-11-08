/* Royal CRM Mini App v0.6.17 — departed player profiles and current-team navigation. */
(() => {
  const VERSION='0.6.17';
  const sections=[{title:'База битв',changes:[
    'Добавлен закрытый для участников раздел «База битв»: поиск по названию команды и соперника, RM/RK, битвам и турнирам, итоговым и промежуточным скриншотам, датам публикации и очкам.',
    'Раздел использует существующую базу D1. Поисковый индекс кэшируется отдельно и помечается на обновление при поступлении новых распознанных скриншотов — повторный поиск не сканирует D1.',
    'Доступ к разделу и данным повторно проверяется сервером по статусу администратора Telegram. Архив эпичных битв дополнительно остаётся доступен только владельцу.'
  ]}];
  const previous=Array.isArray(window.RoyalChangelog?.releases)
    ? window.RoyalChangelog.releases.filter(item=>String(item?.version||'')!==VERSION):[];
  const release={version:VERSION,title:'Профили выбывших участников и переход в текущую команду',sections,changes:sections.flatMap(section=>section.changes)};
  const releases=[release,...previous];
  const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const list=changes=>'<ul>'+(changes||[]).map(change=>'<li>'+esc(change)+'</li>').join('')+'</ul>';
  const releaseBody=item=>Array.isArray(item.sections)&&item.sections.length
    ?item.sections.map(section=>'<section class="release-group">'+(section.title?'<h3>'+esc(section.title)+'</h3>':'')+list(section.changes)+'</section>').join('')
    :list(item.changes);
  const card=(item,index)=>'<details class="release-card'+(index===0?' is-current':'')+'" '+(index===0?'open':'')+
    '><summary class="release-summary"><span class="release-version">v'+esc(item.version)+'</span><span class="release-title">'+
    esc(item.title)+'</span><span class="release-arrow">›</span></summary><div class="release-body">'+releaseBody(item)+'</div></details>';
  function open(){
    try{window.RoyalNav?.pushCurrent?.();}catch{}
    try{if(typeof setActiveNav==='function')setActiveNav('changelog');}catch{}
    document.body.classList.add('royal-section-screen');
    document.querySelectorAll('.bottom-nav .nav').forEach(button=>button.classList.remove('active'));
    const target=document.getElementById('panel');if(!target)return;
    target.hidden=false;
    target.innerHTML='<div class="changelog-screen"><button type="button" class="royal-back-button" data-royal-back="1">← Назад</button>'+
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
