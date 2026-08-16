/* Royal CRM Mini App — changelog v0.5.36 */
(() => {
  const VERSION = '0.5.36';
  const previous = Array.isArray(window.RoyalChangelog?.releases) ? window.RoyalChangelog.releases : [];
  const RELEASES = [{version:'0.5.36',title:'МАЯК — медиа и порядок достижений',changes:[
    'Исправлена загрузка фото, песни и видео проекта «МАЯК»: медиа теперь открываются напрямую из подготовленных файлов Google Drive.',
    'На странице участников проекта убраны технические подписи о количестве участников и сопоставлении Telegram ID.',
    'Достижение «МАЯК» переработано в компактную золотую плашку со значком маяка и надписью «МАЯК».',
    'У участников проекта правые плашки выстраиваются строго вертикально: «Админ» сверху, затем ранг, «МАЯК» всегда снизу.',
    'Исправлено исчезновение достижения «МАЯК» после перехода в профиль участника и возврата кнопкой «Назад».',
    'Идентификация участников проекта по-прежнему выполняется только по Telegram ID.'
  ]}, ...previous.filter(item => String(item?.version || '') !== VERSION)];
  function esc2(value){return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}
  function releaseHtml(release,index){const current=release.version===VERSION;const items=(release.changes||[]).map(item=>`<li>${esc2(item)}</li>`).join('');return `<details class="release-card${current?' is-current':''}" ${index===0?'open':''}><summary class="release-summary"><span class="release-version">v${esc2(release.version)}</span><span class="release-title">${esc2(release.title)}</span><span class="release-arrow">›</span></summary><div class="release-body"><ul>${items}</ul></div></details>`;}
  function renderChangelog(){try{window.RoyalNav?.pushCurrent?.();}catch(_){}document.body.classList.add('royal-section-screen');document.querySelectorAll('.bottom-nav .nav').forEach(btn=>btn.classList.remove('active'));const panel=document.getElementById('panel');if(!panel)return;panel.hidden=false;panel.innerHTML=`<div class="changelog-screen"><button type="button" class="royal-back-button" data-royal-back="1">← Назад</button><div class="changelog-head"><h2>История изменений</h2><p class="changelog-developer">Разработчик: <a href="https://t.me/ansoloway" target="_blank" rel="noopener">@ansoloway</a></p><p class="changelog-developer">Помощь в разработке, тесты: <a href="https://t.me/sfinks_spb" target="_blank" rel="noopener">@sfinks_spb</a></p><p>Что добавлялось и менялось в приложении Чата Победителей.</p><span class="changelog-current">● Текущая версия v${VERSION}</span></div><div class="changelog-list">${RELEASES.map(releaseHtml).join('')}</div><div class="release-note">Новая версия добавляется сюда первой, предыдущая история сохраняется.</div></div>`;try{window.RoyalNav?.enhanceVisibleBack?.();}catch(_){}requestAnimationFrame(()=>requestAnimationFrame(()=>{try{window.scrollTo(0,0);}catch(_){}}));}
  function prepareBadge(){const badge=document.getElementById('versionBadge');if(!badge)return;badge.setAttribute('role','button');badge.setAttribute('tabindex','0');badge.setAttribute('aria-label',`Версия ${VERSION}. Открыть историю изменений`);badge.setAttribute('title','История изменений');}
  window.addEventListener('click',event=>{const badge=event.target?.closest?.('#versionBadge');if(!badge)return;event.preventDefault();event.stopImmediatePropagation();renderChangelog();},true);
  window.addEventListener('keydown',event=>{const badge=event.target?.closest?.('#versionBadge');if(!badge||(event.key!=='Enter'&&event.key!==' '))return;event.preventDefault();event.stopImmediatePropagation();renderChangelog();},true);
  prepareBadge();window.RoyalChangelog={version:VERSION,releases:RELEASES,open:renderChangelog};window.__ROYAL_CHANGELOG_VERSION__=VERSION;
})();
