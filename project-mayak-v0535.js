/* Royal CRM Mini App — Project MAYAK + achievement v0.5.35
 * Historical project membership is bound ONLY by raw Telegram ID.
 */
(() => {
  const VERSION = '0.5.35';
  const PROJECT_IDS = [
    '1227767356','883147905','5174386839','834202553','2117344494','5388198360','7412264154','6412411936',
    '1456874273','1160854994','1717013873','370318871','5708116632','5226858099','6342429850','1353971226',
    '5230090002','751260242','1288448351','1109283806','1881110694','5173176624','8229861913','1726484063',
    '922856055','964367936','1736287993','2018300844','5254381299','1077349134','539316340','1766945517',
    '509711332','7907143322','334268466','5996962645','1117087970','6322082596','411378708','5119343526',
    '1086215867','6267538185','1066463157','7092186210','1067824353','6589931544','635474888','8258569745',
    '6746380164','990056319','5217701700','7998301726','1516294727','948150870','5475797534','7638779670'
  ];
  const PROJECT_SET = new Set(PROJECT_IDS);
  const GAS_URL = String(new URLSearchParams(location.search).get('gas') || '').trim();
  const mediaCache = new Map();
  let callbackSeq = 0;

  function cleanId(value) { const id = String(value == null ? '' : value).trim().replace(/\.0$/, ''); return /^\d+$/.test(id) ? id : ''; }
  function lighthouseSvg(sizeClass = '') {
    return `<svg class="mayak-lighthouse-svg ${sizeClass}" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="mayakGold0535" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#fff3a0"/><stop offset=".42" stop-color="#ffd34d"/><stop offset="1" stop-color="#b97906"/></linearGradient><radialGradient id="mayakGlow0535"><stop stop-color="#ffe781" stop-opacity=".9"/><stop offset="1" stop-color="#d99600" stop-opacity="0"/></radialGradient></defs><circle cx="32" cy="29" r="29" fill="url(#mayakGlow0535)" opacity=".33"/><path d="M8 23 L23 28 L23 32 L8 35 Z" fill="#ffd95a" opacity=".85"/><path d="M56 23 L41 28 L41 32 L56 35 Z" fill="#ffd95a" opacity=".85"/><path d="M24 57 L28 27 H36 L40 57 Z" fill="url(#mayakGold0535)" stroke="#7e5000" stroke-width="1.4"/><path d="M27 34 H37 M26 42 H38 M25 50 H39" stroke="#fff0a0" stroke-width="2" opacity=".72"/><rect x="24" y="20" width="16" height="9" rx="2.5" fill="#fff0a0" stroke="#9b6300" stroke-width="1.4"/><circle cx="32" cy="24.5" r="3.2" fill="#fff9cf"/><path d="M21 20 L32 13 L43 20 Z" fill="url(#mayakGold0535)" stroke="#7e5000" stroke-width="1.4"/><path d="M21 58 H43" stroke="#ffd452" stroke-width="4" stroke-linecap="round"/></svg>`;
  }
  function projectBadge(detail = false) {
    const button = document.createElement('button'); button.type = 'button'; button.className = detail ? 'mayak-achievement-v0535 detail' : 'mayak-achievement-v0535'; button.dataset.openMayakParticipants = '1'; button.setAttribute('title','Проект «МАЯК» — участники'); button.setAttribute('aria-label','Достижение проекта МАЯК. Открыть список участников'); button.innerHTML = `${lighthouseSvg(detail ? 'detail' : '')}${detail ? '<span>МАЯК</span>' : ''}`; return button;
  }
  function cardId(card) { return cleanId(card?.dataset?.profileTelegramId || card?.dataset?.participantTelegramId || card?.dataset?.directoryTelegramId || card?.querySelector?.('[data-telegram-id]')?.dataset?.telegramId); }
  function decorateCard(card) {
    const id = cardId(card); const slot = card?.querySelector?.('.participant-achievements-future-slot'); if (!slot) return; const existing = slot.querySelector(':scope > .mayak-achievement-v0535');
    if (id && PROJECT_SET.has(id)) { if (!existing) slot.appendChild(projectBadge(false)); } else existing?.remove();
  }
  function decorateDetail() {
    const card = document.querySelector('.participant-detail-card'); if (!card) return; const id = cleanId(card.querySelector('.participant-detail-avatar[data-telegram-id]')?.dataset?.telegramId); let strip = card.querySelector('.participant-detail-achievement-strip-v0535');
    if (!PROJECT_SET.has(id)) { strip?.remove(); return; }
    if (!strip) { const title = card.querySelector('.participant-detail-achievements-title'); const stage = card.querySelector('.rank-premium-stage'); if (!title || !stage) return; strip = document.createElement('div'); strip.className = 'participant-detail-achievement-strip-v0535'; stage.parentElement?.insertBefore(strip, stage); }
    if (!strip.querySelector('.mayak-achievement-v0535')) strip.appendChild(projectBadge(true));
  }
  function decorateAchievements() { try { window.RoyalParticipantCardUX?.decorate?.(); } catch (_) {} document.querySelectorAll('.person-card,.team-member,.directory-person-card:not(.directory-person-card--external),.hero-card').forEach(decorateCard); decorateDetail(); }
  function scheduleDecorate() { setTimeout(decorateAchievements,0); setTimeout(decorateAchievements,90); setTimeout(decorateAchievements,260); }
  function pushCurrent() { try { window.RoyalNav?.pushCurrent?.(); } catch (_) {} }
  function showPanel(html) { document.body.classList.add('royal-section-screen'); const selfCard=document.getElementById('selfProfileCard'); if(selfCard)selfCard.hidden=true; const panel=document.getElementById('panel'); if(!panel)return null; panel.hidden=false; panel.innerHTML=html; try{window.RoyalNav?.enhanceVisibleBack?.();}catch(_){} requestAnimationFrame(()=>{try{window.scrollTo(0,0);}catch(_){}}); return panel; }

  function renderProjectsIndex() {
    showPanel(`<button type="button" class="royal-back-button" data-royal-back="1">← Назад</button><section class="mayak-projects-index-v0535"><div class="mayak-projects-head"><h2>Проекты</h2><p>История проектов Чата Победителей.</p></div><button type="button" class="mayak-project-card-v0535" data-open-mayak-project="1"><span class="mayak-project-card-icon">${lighthouseSvg('project-card')}</span><span><b>Проект «МАЯК»</b><small>8–21 июня 2026</small></span><i>›</i></button></section>`);
  }

  function mediaJsonp(asset) {
    if (mediaCache.has(asset)) return Promise.resolve(mediaCache.get(asset)); const initData=String(window.Telegram?.WebApp?.initData||''); if(!GAS_URL||!initData)return Promise.reject(new Error('PROJECT_MEDIA_TRANSPORT_MISSING'));
    return new Promise((resolve,reject)=>{ const callback=`__royalMayakMedia_${Date.now()}_${++callbackSeq}`; const url=new URL(GAS_URL); url.searchParams.set('action','project-mayak-media'); url.searchParams.set('asset',asset); url.searchParams.set('initData',initData); url.searchParams.set('callback',callback); const script=document.createElement('script'); let done=false; const timer=setTimeout(()=>finish(new Error('PROJECT_MEDIA_TIMEOUT')),15000);
      function cleanup(){clearTimeout(timer);try{delete window[callback];}catch(_){window[callback]=undefined;}try{script.remove();}catch(_){}}
      function finish(err,value){if(done)return;done=true;cleanup();err?reject(err):resolve(value);}
      window[callback]=data=>{if(!data?.ok||!data?.base64)return finish(new Error(data?.error||'PROJECT_MEDIA_MISSING'));try{const binary=atob(String(data.base64));const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);const objectUrl=URL.createObjectURL(new Blob([bytes],{type:String(data.mime||'application/octet-stream')}));mediaCache.set(asset,objectUrl);finish(null,objectUrl);}catch(error){finish(error);}};
      script.onerror=()=>finish(new Error('PROJECT_MEDIA_LOAD_FAILED')); script.src=url.toString(); document.head.appendChild(script);
    });
  }

  async function hydrateProjectMedia(panel) {
    const nodes=[...(panel?.querySelectorAll?.('[data-mayak-media]')||[])]; await Promise.allSettled(nodes.map(async node=>{const asset=node.dataset.mayakMedia;const status=node.closest('.mayak-media-frame-v0535')?.querySelector('.mayak-media-status-v0535');try{const src=await mediaJsonp(asset);node.src=src;if(status)status.remove();}catch(error){if(status)status.textContent='Не удалось загрузить файл. Закройте приложение и откройте снова из бота.';console.warn('MAYAK media:',asset,error?.message||error);}}));
  }

  function renderMayakProject() {
    pushCurrent(); const panel=showPanel(`<button type="button" class="royal-back-button" data-royal-back="1">← Назад</button><section class="mayak-project-page-v0535"><header class="mayak-project-hero-v0535">${lighthouseSvg('hero-project')}<div><div class="eyebrow">ИСТОРИЯ ПРОЕКТОВ</div><h2>Проект «МАЯК»</h2><p>8–21 июня 2026</p></div></header><button type="button" class="mayak-participants-button-v0535" data-open-mayak-participants="1"><span>🏅</span><span><b>Участники проекта</b><small>56 участников · золотое достижение «МАЯК»</small></span><i>›</i></button><div class="mayak-results-title-v0535"><h3>🏆 Итоги Royal League</h3><p>Результаты проекта, опубликованные после завершения сезона.</p></div><figure class="mayak-media-frame-v0535"><figcaption>Командный рейтинг</figcaption><div class="mayak-media-status-v0535">Загружаем…</div><img data-mayak-media="leaderboard-team" alt="Командный рейтинг проекта МАЯК"></figure><figure class="mayak-media-frame-v0535"><figcaption>Личный рейтинг</figcaption><div class="mayak-media-status-v0535">Загружаем…</div><img data-mayak-media="leaderboard-players" alt="Личный рейтинг проекта МАЯК"></figure><section class="mayak-media-frame-v0535 compact"><h3>🎵 Песня проекта</h3><div class="mayak-media-status-v0535">Загружаем аудио…</div><audio data-mayak-media="audio" controls preload="metadata"></audio></section><section class="mayak-media-frame-v0535 compact"><h3>🎬 Видео проекта</h3><div class="mayak-media-status-v0535">Загружаем видео…</div><video data-mayak-media="video" controls playsinline preload="metadata"></video></section></section>`); hydrateProjectMedia(panel);
  }

  function renderMayakParticipants() {
    pushCurrent(); const all=Array.isArray(snapshotState?.participants)?snapshotState.participants:[]; const byId=new Map(all.map(p=>[cleanId(p?.telegramId),p])); const found=PROJECT_IDS.map(id=>byId.get(id)).filter(Boolean); const cards=typeof participantCard==='function'?found.map(participantCard).join(''):''; const panel=showPanel(`<button type="button" class="royal-back-button" data-royal-back="1">← Назад</button><section class="mayak-participants-page-v0535"><header><span>${lighthouseSvg('participants-head')}</span><div><h2>Участники проекта «МАЯК»</h2><p>8–21 июня 2026 · ${found.length} из ${PROJECT_IDS.length} сейчас доступны в Чате Победителей</p></div></header><div class="mayak-participants-note-v0535">Золотой маяк присваивается только по точному совпадению Telegram ID.</div><div class="people-list">${cards||'<div class="empty-state">Участники пока недоступны.</div>'}</div></section>`); try{setupAvatarLoading(panel);}catch(_){} scheduleDecorate(); try{window.RoyalTeamGameColors?.refresh?.();}catch(_){}
  }

  if (typeof renderPage === 'function') { const nativeRenderPage=renderPage; renderPage=function(page){const result=nativeRenderPage(page);if(page==='projects')renderProjectsIndex();scheduleDecorate();return result;}; }
  document.addEventListener('click',event=>{const project=event.target?.closest?.('[data-open-mayak-project="1"]');if(project){event.preventDefault();event.stopImmediatePropagation();renderMayakProject();return;}const participants=event.target?.closest?.('[data-open-mayak-participants="1"]');if(participants){event.preventDefault();event.stopImmediatePropagation();renderMayakParticipants();return;}scheduleDecorate();},true);
  document.addEventListener('input',scheduleDecorate,true); document.addEventListener('pointerup',scheduleDecorate,true); window.addEventListener('pageshow',scheduleDecorate); scheduleDecorate();
  window.RoyalMayak={version:VERSION,participantIds:[...PROJECT_IDS],openProject:renderMayakProject,openParticipants:renderMayakParticipants,refresh:scheduleDecorate}; window.__ROYAL_MAYAK_VERSION__=VERSION;
})();
