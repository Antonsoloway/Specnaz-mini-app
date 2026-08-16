/* Royal CRM Mini App — changelog v0.5.48 */
(() => {
  const VERSION = '0.5.48';
  const previous = Array.isArray(window.RoyalChangelog?.releases) ? window.RoyalChangelog.releases : [];
  const RELEASES = [{
    version:'0.5.48',
    title:'Поисковые ключи из CRM',
    changes:[
      'Архитектура поиска изменена: готовые searchKeys теперь формируются сервером при создании единого snapshot, а не вычисляются на телефоне.',
      'Каждая команда и каждый участник получают собственный набор поисковых ключей; у участника в ключи также входят Telegram-имя, @ник, команды, игровые ники, роли и игры.',
      'Подтверждённые сложные названия вынесены в серверный словарь алиасов: MOLOT ROKA ↔ молот рока, Aquamarine ↔ аквамарин, Da budet swet 5 ↔ да будет свет, XAOC ↔ хаос и другие.',
      'Mini App во время ввода выполняет только дешёвое сравнение строки с готовыми ключами snapshot: без prewarm, без тяжёлой транслитерации и без перебора вариантов на Android.',
      'Сохранён Android-safe ввод: поле поиска не перерисовывается, IME-события не блокируются, результаты только скрываются/показываются.',
      'Unified Snapshot обновлён до v1.1.0, schema 1.4.0, searchIndexVersion 1.0.0.',
      'Блок помощи в разработке и тестировании сохранён: @sfinks_spb, @O_Chaplygina, @Yanochka_2404.'
    ]
  }, ...previous.filter(item => String(item?.version || '') !== VERSION)];

  function esc(value){return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}
  function releaseHtml(release,index){const current=release.version===VERSION;const items=(release.changes||[]).map(item=>`<li>${esc(item)}</li>`).join('');return `<details class="release-card${current?' is-current':''}" ${index===0?'open':''}><summary class="release-summary"><span class="release-version">v${esc(release.version)}</span><span class="release-title">${esc(release.title)}</span><span class="release-arrow">›</span></summary><div class="release-body"><ul>${items}</ul></div></details>`;}
  function renderChangelog(){try{window.RoyalNav?.pushCurrent?.();}catch(_){}document.body.classList.add('royal-section-screen');document.querySelectorAll('.bottom-nav .nav').forEach(btn=>btn.classList.remove('active'));const panel=document.getElementById('panel');if(!panel)return;panel.hidden=false;panel.innerHTML=`<div class="changelog-screen"><button type="button" class="royal-back-button" data-royal-back="1">← Назад</button><div class="changelog-head"><h2>История изменений</h2><p class="changelog-developer">Разработчик: <a href="https://t.me/ansoloway" target="_blank" rel="noopener">@ansoloway</a></p><p class="changelog-developer">Помощь в разработке, тесты: <a href="https://t.me/sfinks_spb" target="_blank" rel="noopener">@sfinks_spb</a> · <a href="https://t.me/O_Chaplygina" target="_blank" rel="noopener">@O_Chaplygina</a> · <a href="https://t.me/Yanochka_2404" target="_blank" rel="noopener">@Yanochka_2404</a></p><p>Что добавлялось и менялось в приложении Чата Победителей.</p><span class="changelog-current">● Текущая версия v${VERSION}</span></div><div class="changelog-list">${RELEASES.map(releaseHtml).join('')}</div><div class="release-note">Новая версия добавляется сюда первой, предыдущая история сохраняется.</div></div>`;try{window.RoyalNav?.enhanceVisibleBack?.();}catch(_){}requestAnimationFrame(()=>requestAnimationFrame(()=>{try{window.scrollTo(0,0);}catch(_){}}));}
  window.RoyalChangelog={version:VERSION,releases:RELEASES,open:renderChangelog};
  window.__ROYAL_CHANGELOG_VERSION__=VERSION;
})();
