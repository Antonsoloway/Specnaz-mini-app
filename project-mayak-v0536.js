/* Royal CRM Mini App — Project MAYAK + achievement v0.5.36
 * Historical project membership is bound ONLY by raw Telegram ID.
 * v0.5.36: public Drive media, compact MAYAK pill, strict vertical achievement order,
 * and reliable restoration after participant -> Back navigation.
 */
(() => {
  const VERSION = '0.5.36';
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
  const MEDIA = {
    'leaderboard-players': { type:'image', url:'https://drive.google.com/uc?export=view&id=1qP59gUe5hB7fymTk89RjJ0ks5ahc2r7e' },
    'leaderboard-team': { type:'image', url:'https://drive.google.com/uc?export=view&id=1q-wZDOswV5D8PpqPDIHPo-4sNdwTzJAY' },
    'audio': { type:'audio', url:'https://drive.usercontent.google.com/download?id=1I1MYbQYAnKyqGxM2y9TtufslpyYXdFaB&export=download&confirm=t' },
    'video': { type:'video', url:'https://drive.usercontent.google.com/download?id=1MF-I4VUjAshkoVBQ2ay6SZGlRDFgeIxw&export=download&confirm=t' }
  };

  function cleanId(value) {
    const id = String(value == null ? '' : value).trim().replace(/\.0$/, '');
    return /^\d+$/.test(id) ? id : '';
  }

  function lighthouseSvg(sizeClass = '') {
    return `<svg class="mayak-lighthouse-svg ${sizeClass}" viewBox="0 0 64 64" aria-hidden="true"><path fill="currentColor" d="M28 6h8l2 6h5l5 9H16l5-9h5l2-6Zm-7 18h22l4 34H17l4-34Zm6 5-1 8h12l-1-8H27Zm-2 14-1 9h16l-1-9H25ZM8 23l12 4-.6 5L8 35V23Zm48 0v12l-11.4-3-.6-5L56 23Z"/><path fill="#fff4b0" d="M29 15h6v6h-6z"/></svg>`;
  }

  function projectBadge() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mayak-achievement-v0536';
    button.dataset.openMayakParticipants = '1';
    button.setAttribute('title', 'Участники проекта «МАЯК»');
    button.setAttribute('aria-label', 'Достижение МАЯК. Открыть участников проекта');
    button.innerHTML = `${lighthouseSvg()}<span>МАЯК</span>`;
    return button;
  }

  function cardId(card) {
    return cleanId(
      card?.dataset?.profileTelegramId ||
      card?.dataset?.participantTelegramId ||
      card?.dataset?.directoryTelegramId ||
      card?.querySelector?.('[data-telegram-id]')?.dataset?.telegramId
    );
  }

  function decorateCard(card) {
    if (!card) return;
    const achievements = card.querySelector('.participant-achievements-row');
    if (!achievements) return;
    const id = cardId(card);
    const shouldHave = !!id && PROJECT_SET.has(id);
    let slot = achievements.querySelector(':scope > .participant-achievements-future-slot');

    if (!shouldHave) {
      achievements.classList.remove('has-mayak-v0536');
      slot?.querySelectorAll(':scope > .mayak-achievement-v0536').forEach(node => node.remove());
      return;
    }

    if (!slot) {
      slot = document.createElement('span');
      slot.className = 'participant-achievements-future-slot';
      achievements.appendChild(slot);
    }
    if (!slot.querySelector(':scope > .mayak-achievement-v0536')) slot.appendChild(projectBadge());
    achievements.classList.add('has-mayak-v0536');
  }

  function decorateDetail() {
    const card = document.querySelector('.participant-detail-card');
    if (!card) return;
    const id = cleanId(card.querySelector('.participant-detail-avatar[data-telegram-id]')?.dataset?.telegramId);
    const stage = card.querySelector('.rank-premium-stage');
    if (!stage) return;
    let strip = card.querySelector('.participant-detail-achievement-strip-v0536');

    if (!PROJECT_SET.has(id)) {
      strip?.remove();
      return;
    }

    if (!strip) {
      strip = document.createElement('div');
      strip.className = 'participant-detail-achievement-strip-v0536';
    }
    if (stage.nextElementSibling !== strip) stage.insertAdjacentElement('afterend', strip);
    if (!strip.querySelector('.mayak-achievement-v0536')) strip.appendChild(projectBadge());
  }

  function decorateAchievements() {
    document.querySelectorAll('.person-card,.team-member,.directory-person-card:not(.directory-person-card--external),.hero-card').forEach(decorateCard);
    decorateDetail();
  }

  function scheduleDecorate() {
    [0, 40, 120, 280, 520].forEach(delay => window.setTimeout(decorateAchievements, delay));
  }

  function pushCurrent() {
    try { window.RoyalNav?.pushCurrent?.(); } catch (_) {}
  }

  function showPanel(html) {
    document.body.classList.add('royal-section-screen');
    const selfCard = document.getElementById('selfProfileCard');
    if (selfCard) selfCard.hidden = true;
    const panel = document.getElementById('panel');
    if (!panel) return null;
    panel.hidden = false;
    panel.innerHTML = html;
    try { window.RoyalNav?.enhanceVisibleBack?.(); } catch (_) {}
    requestAnimationFrame(() => { try { window.scrollTo(0, 0); } catch (_) {} });
    return panel;
  }

  function renderProjectsIndex() {
    showPanel(`<button type="button" class="royal-back-button" data-royal-back="1">← Назад</button><section class="mayak-projects-index-v0536"><div class="mayak-projects-head-v0536"><h2>Проекты</h2><p>История проектов Чата Победителей.</p></div><button type="button" class="mayak-project-card-v0536" data-open-mayak-project="1"><span class="mayak-project-card-icon-v0536">${lighthouseSvg('project-card')}</span><span><b>Проект «МАЯК»</b><small>8–21 июня 2026</small></span><i>›</i></button></section>`);
  }

  function hydrateProjectMedia(panel) {
    const nodes = [...(panel?.querySelectorAll?.('[data-mayak-media]') || [])];
    nodes.forEach(node => {
      const asset = String(node.dataset.mayakMedia || '');
      const cfg = MEDIA[asset];
      const status = node.closest('.mayak-media-frame-v0536')?.querySelector('.mayak-media-status-v0536');
      if (!cfg) {
        if (status) status.textContent = 'Файл не найден.';
        return;
      }

      const fail = () => {
        if (status) status.textContent = 'Не удалось загрузить файл.';
      };
      const ok = () => { if (status) status.remove(); };
      node.addEventListener('error', fail, { once:true });
      if (node.tagName === 'IMG') node.addEventListener('load', ok, { once:true });
      else node.addEventListener('loadedmetadata', ok, { once:true });
      node.src = cfg.url;
      try { node.load?.(); } catch (_) {}
    });
  }

  function renderMayakProject() {
    pushCurrent();
    const panel = showPanel(`<button type="button" class="royal-back-button" data-royal-back="1">← Назад</button><section class="mayak-project-page-v0536"><header class="mayak-project-hero-v0536">${lighthouseSvg('hero-project')}<div><div class="eyebrow">ИСТОРИЯ ПРОЕКТОВ</div><h2>Проект «МАЯК»</h2><p>8–21 июня 2026</p></div></header><button type="button" class="mayak-participants-button-v0536" data-open-mayak-participants="1"><span>🏅</span><span><b>Участники проекта</b><small>56 участников · золотое достижение «МАЯК»</small></span><i>›</i></button><div class="mayak-results-title-v0536"><h3>🏆 Итоги Royal League</h3><p>Результаты проекта, опубликованные после завершения сезона.</p></div><figure class="mayak-media-frame-v0536"><figcaption>Командный рейтинг</figcaption><div class="mayak-media-status-v0536">Загружаем…</div><img data-mayak-media="leaderboard-team" alt="Командный рейтинг проекта МАЯК"></figure><figure class="mayak-media-frame-v0536"><figcaption>Личный рейтинг</figcaption><div class="mayak-media-status-v0536">Загружаем…</div><img data-mayak-media="leaderboard-players" alt="Личный рейтинг проекта МАЯК"></figure><section class="mayak-media-frame-v0536 compact"><h3>🎵 Песня проекта</h3><div class="mayak-media-status-v0536">Загружаем аудио…</div><audio data-mayak-media="audio" controls preload="metadata"></audio></section><section class="mayak-media-frame-v0536 compact"><h3>🎬 Видео проекта</h3><div class="mayak-media-status-v0536">Загружаем видео…</div><video data-mayak-media="video" controls playsinline preload="metadata"></video></section></section>`);
    hydrateProjectMedia(panel);
  }

  function renderMayakParticipants() {
    pushCurrent();
    const all = Array.isArray(snapshotState?.participants) ? snapshotState.participants : [];
    const byId = new Map(all.map(p => [cleanId(p?.telegramId), p]));
    const found = PROJECT_IDS.map(id => byId.get(id)).filter(Boolean);
    const cards = typeof participantCard === 'function' ? found.map(participantCard).join('') : '';
    const panel = showPanel(`<button type="button" class="royal-back-button" data-royal-back="1">← Назад</button><section class="mayak-participants-page-v0536"><header><span>${lighthouseSvg('participants-head')}</span><h2>Участники проекта<br>«МАЯК»</h2></header><div class="people-list">${cards || '<div class="empty-state">Участники пока недоступны.</div>'}</div></section>`);
    try { setupAvatarLoading(panel); } catch (_) {}
    scheduleDecorate();
    try { window.RoyalTeamGameColors?.refresh?.(); } catch (_) {}
    try { window.RoyalAdminBadges?.refresh?.(0); } catch (_) {}
  }

  if (typeof renderParticipantsPage === 'function') {
    const nativeRenderParticipantsPage = renderParticipantsPage;
    renderParticipantsPage = function(query = '') {
      const result = nativeRenderParticipantsPage(query);
      scheduleDecorate();
      return result;
    };
  }
  if (typeof renderTeamDetail === 'function') {
    const nativeRenderTeamDetail = renderTeamDetail;
    renderTeamDetail = function(teamRef) {
      const result = nativeRenderTeamDetail(teamRef);
      scheduleDecorate();
      return result;
    };
  }
  if (typeof renderPage === 'function') {
    const nativeRenderPage = renderPage;
    renderPage = function(page) {
      const result = nativeRenderPage(page);
      if (page === 'projects') renderProjectsIndex();
      scheduleDecorate();
      return result;
    };
  }
  if (typeof loadSnapshot === 'function') {
    const nativeLoadSnapshot = loadSnapshot;
    loadSnapshot = async function() {
      const result = await nativeLoadSnapshot();
      scheduleDecorate();
      return result;
    };
  }

  if (typeof window.RoyalParticipantCardUX?.decorate === 'function') {
    const nativeCardDecorate = window.RoyalParticipantCardUX.decorate;
    window.RoyalParticipantCardUX.decorate = function() {
      const result = nativeCardDecorate.apply(this, arguments);
      window.setTimeout(decorateAchievements, 0);
      return result;
    };
  }

  document.addEventListener('click', event => {
    const project = event.target?.closest?.('[data-open-mayak-project="1"]');
    if (project) {
      event.preventDefault(); event.stopImmediatePropagation(); renderMayakProject(); return;
    }
    const participants = event.target?.closest?.('[data-open-mayak-participants="1"]');
    if (participants) {
      event.preventDefault(); event.stopImmediatePropagation(); renderMayakParticipants(); return;
    }
    scheduleDecorate();
  }, true);

  window.addEventListener('click', event => {
    if (!event.target?.closest?.('[data-royal-back]')) return;
    scheduleDecorate();
    window.setTimeout(scheduleDecorate, 60);
    window.setTimeout(scheduleDecorate, 220);
  }, true);

  document.addEventListener('input', scheduleDecorate, true);
  document.addEventListener('pointerup', () => window.setTimeout(scheduleDecorate, 20), true);
  window.addEventListener('pageshow', scheduleDecorate);

  scheduleDecorate();
  window.RoyalMayak = { version:VERSION, participantIds:[...PROJECT_IDS], openProject:renderMayakProject, openParticipants:renderMayakParticipants, refresh:scheduleDecorate };
  window.__ROYAL_MAYAK_VERSION__ = VERSION;
})();
