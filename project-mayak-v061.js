/* Royal CRM Mini App v0.6.1 — Project MAYAK + dynamic achievement registry */
(() => {
  'use strict';
  if (String(window.__ROYAL_BUILD__ || '') !== '0.6.1') return;

  const VERSION = '0.6.1-mayak-achievements.1';
  const MAYAK_CODE = 'mayak';
  const LEGACY_PROJECT_IDS = [
    '1227767356','883147905','5174386839','834202553','2117344494','5388198360','7412264154','6412411936',
    '1456874273','1160854994','1717013873','370318871','5708116632','5226858099','6342429850','1353971226',
    '5230090002','751260242','1288448351','1109283806','1881110694','5173176624','8229861913','1726484063',
    '922856055','964367936','1736287993','2018300844','5254381299','1077349134','539316340','1766945517',
    '509711332','7907143322','334268466','5996962645','1117087970','6322082596','411378708','5119343526',
    '1086215867','6267538185','1066463157','7092186210','1067824353','6589931544','635474888','8258569745',
    '6746380164','990056319','5217701700','7998301726','1516294727','948150870','5475797534','7638779670'
  ];
  const LEGACY_PROJECT_SET = new Set(LEGACY_PROJECT_IDS);
  const MEDIA_ASSETS = new Set(['leaderboard-players','leaderboard-team','audio','video']);
  const mediaCache = new Map();

  function cleanId(value) {
    const id = String(value == null ? '' : value).trim().replace(/\.0$/, '');
    return /^\d+$/.test(id) ? id : '';
  }

  function cleanCode(value) {
    return String(value == null ? '' : value).trim().toLocaleLowerCase('en-US');
  }

  function participants() {
    try { return Array.isArray(snapshotState?.participants) ? snapshotState.participants : []; }
    catch (_) { return []; }
  }

  function registryReady() {
    return participants().some(item => Object.prototype.hasOwnProperty.call(item || {}, 'achievements'));
  }

  function hasMayak(participant) {
    if (!participant) return false;
    if (Array.isArray(participant.achievements)) {
      return participant.achievements.some(code => cleanCode(code) === MAYAK_CODE);
    }
    return LEGACY_PROJECT_SET.has(cleanId(participant.telegramId));
  }

  function hasMayakId(id) {
    id = cleanId(id);
    if (!id) return false;
    const participant = participants().find(item => cleanId(item?.telegramId) === id);
    if (participant && Object.prototype.hasOwnProperty.call(participant, 'achievements')) return hasMayak(participant);
    return LEGACY_PROJECT_SET.has(id);
  }

  function projectParticipantIds() {
    const all = participants();
    if (registryReady()) return all.filter(hasMayak).map(item => cleanId(item.telegramId)).filter(Boolean);
    return [...LEGACY_PROJECT_IDS];
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
    const shouldHave = hasMayakId(cardId(card));
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

    if (!hasMayakId(id)) {
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

  async function mediaObjectUrl(asset) {
    if (mediaCache.has(asset)) return mediaCache.get(asset);
    if (!MEDIA_ASSETS.has(asset)) throw new Error('PROJECT_MEDIA_UNKNOWN');
    if (!sessionToken) throw new Error('PROJECT_MEDIA_SESSION_MISSING');
    const response = await fetch(`${API_URL}/project-mayak-media?asset=${encodeURIComponent(asset)}`, {
      method:'GET', mode:'cors', cache:'no-store',
      headers:{ Authorization:`Bearer ${sessionToken}` }
    });
    if (!response.ok) throw new Error(`PROJECT_MEDIA_HTTP_${response.status}`);
    const blob = await response.blob();
    if (!blob || !blob.size) throw new Error('PROJECT_MEDIA_EMPTY');
    const objectUrl = URL.createObjectURL(blob);
    mediaCache.set(asset, objectUrl);
    return objectUrl;
  }

  async function hydrateProjectMedia(panel) {
    const nodes = [...(panel?.querySelectorAll?.('[data-mayak-media]') || [])];
    await Promise.allSettled(nodes.map(async node => {
      const asset = String(node.dataset.mayakMedia || '');
      const status = node.closest('.mayak-media-frame-v0536')?.querySelector('.mayak-media-status-v0536');
      try {
        const src = await mediaObjectUrl(asset);
        node.src = src;
        try { node.load?.(); } catch (_) {}
        if (status) status.remove();
      } catch (error) {
        if (status) status.textContent = 'Не удалось загрузить файл.';
        console.warn('MAYAK media:', asset, error?.message || error);
      }
    }));
  }

  function renderMayakProject() {
    pushCurrent();
    const count = projectParticipantIds().length;
    const panel = showPanel(`<button type="button" class="royal-back-button" data-royal-back="1">← Назад</button><section class="mayak-project-page-v0536"><header class="mayak-project-hero-v0536">${lighthouseSvg('hero-project')}<div><div class="eyebrow">ИСТОРИЯ ПРОЕКТОВ</div><h2>Проект «МАЯК»</h2><p>8–21 июня 2026</p></div></header><button type="button" class="mayak-participants-button-v0536" data-open-mayak-participants="1"><span>🏅</span><span><b>Участники проекта</b><small>${count} участников · золотое достижение «МАЯК»</small></span><i>›</i></button><div class="mayak-results-title-v0536"><h3>🏆 Итоги Royal League</h3><p>Результаты проекта, опубликованные после завершения сезона.</p></div><figure class="mayak-media-frame-v0536"><figcaption>Командный рейтинг</figcaption><div class="mayak-media-status-v0536">Загружаем…</div><img data-mayak-media="leaderboard-team" alt="Командный рейтинг проекта МАЯК"></figure><figure class="mayak-media-frame-v0536"><figcaption>Личный рейтинг</figcaption><div class="mayak-media-status-v0536">Загружаем…</div><img data-mayak-media="leaderboard-players" alt="Личный рейтинг проекта МАЯК"></figure><section class="mayak-media-frame-v0536 compact"><h3>🎵 Песня проекта</h3><div class="mayak-media-status-v0536">Загружаем аудио…</div><audio data-mayak-media="audio" controls preload="metadata"></audio></section><section class="mayak-media-frame-v0536 compact"><h3>🎬 Видео проекта</h3><div class="mayak-media-status-v0536">Загружаем видео…</div><video data-mayak-media="video" controls playsinline preload="metadata"></video></section></section>`);
    hydrateProjectMedia(panel);
  }

  function renderMayakParticipants() {
    pushCurrent();
    const all = participants();
    const byId = new Map(all.map(p => [cleanId(p?.telegramId), p]));
    const found = projectParticipantIds().map(id => byId.get(id)).filter(Boolean);
    const cards = typeof participantCard === 'function' ? found.map(participantCard).join('') : '';
    const panel = showPanel(`<button type="button" class="royal-back-button" data-royal-back="1">← Назад</button><section class="mayak-participants-page-v0536"><span class="guide-head" hidden aria-hidden="true"></span><header><span>${lighthouseSvg('participants-head')}</span><h2>Участники проекта<br>«МАЯК»</h2></header><div class="people-list">${cards || '<div class="empty-state">Участники пока недоступны.</div>'}</div></section>`);
    try { setupAvatarLoading(panel); } catch (_) {}
    scheduleDecorate();
    try { window.RoyalTeamGameColors?.refresh?.(); } catch (_) {}
    try { window.RoyalAdminBadges?.refresh?.(0); } catch (_) {}
  }

  if (typeof renderParticipantsPage === 'function') {
    const native = renderParticipantsPage;
    renderParticipantsPage = function(query = '') {
      const result = native(query);
      scheduleDecorate();
      return result;
    };
  }
  if (typeof renderTeamDetail === 'function') {
    const native = renderTeamDetail;
    renderTeamDetail = function(teamRef) {
      const result = native(teamRef);
      scheduleDecorate();
      return result;
    };
  }
  if (typeof renderPage === 'function') {
    const native = renderPage;
    renderPage = function(page) {
      const result = native(page);
      if (page === 'projects') renderProjectsIndex();
      scheduleDecorate();
      return result;
    };
  }
  if (typeof loadSnapshot === 'function') {
    const native = loadSnapshot;
    loadSnapshot = async function() {
      const result = await native.apply(this, arguments);
      scheduleDecorate();
      return result;
    };
  }

  if (typeof window.RoyalParticipantCardUX?.decorate === 'function') {
    const native = window.RoyalParticipantCardUX.decorate;
    window.RoyalParticipantCardUX.decorate = function() {
      const result = native.apply(this, arguments);
      window.setTimeout(decorateAchievements, 0);
      return result;
    };
  }

  document.addEventListener('click', event => {
    const project = event.target?.closest?.('[data-open-mayak-project="1"]');
    if (project) {
      event.preventDefault(); event.stopImmediatePropagation(); renderMayakProject(); return;
    }
    const projectParticipants = event.target?.closest?.('[data-open-mayak-participants="1"]');
    if (projectParticipants) {
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
  window.addEventListener('royal:achievements-updated', scheduleDecorate);
  window.addEventListener('royal:snapshot-ready', scheduleDecorate);

  scheduleDecorate();
  window.RoyalMayak = {
    version:VERSION,
    get participantIds(){ return projectParticipantIds(); },
    openProject:renderMayakProject,
    openParticipants:renderMayakParticipants,
    refresh:scheduleDecorate
  };
  window.__ROYAL_MAYAK_VERSION__ = VERSION;
})();
