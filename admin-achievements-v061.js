/* Royal CRM Mini App v0.6.1 — admin participant achievement editor */
(() => {
  'use strict';
  if (String(window.__ROYAL_BUILD__ || '') !== '0.6.1') return;
  if (window.__ROYAL_ADMIN_ACHIEVEMENTS_V061__) return;

  const VERSION = '0.6.1-admin-achievements.2';
  const FALLBACK_CATALOG = [
    { code:'mayak', title:'МАЯК', description:'Участник проекта «МАЯК»', project:'mayak' }
  ];
  const FORM_SELECTOR = '[data-admin-write-modal="1"] [data-write-participant-form="1"][data-write-mode="update"]';

  const clean = value => String(value == null ? '' : value).trim();
  const cleanId = value => clean(value).replace(/\.0$/, '').match(/^\d{5,20}$/)?.[0] || '';
  const cleanCode = value => clean(value).toLocaleLowerCase('en-US').replace(/[^a-z0-9_-]+/g, '');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  function adminPayload() {
    try { return window.RoyalAdminDataV0600?.current || null; }
    catch (_) { return null; }
  }

  function catalog() {
    const candidates = [
      adminPayload()?.adminData?.achievementCatalog,
      adminPayload()?.achievementCatalog,
      (() => { try { return snapshotState?.achievementCatalog; } catch (_) { return null; } })()
    ];
    for (const source of candidates) {
      if (!Array.isArray(source) || !source.length) continue;
      const normalized = source.map(item => ({
        code:cleanCode(item?.code),
        title:clean(item?.title || item?.code),
        description:clean(item?.description),
        project:clean(item?.project)
      })).filter(item => item.code && item.title);
      if (normalized.length) return normalized;
    }
    return FALLBACK_CATALOG.map(item => ({ ...item }));
  }

  function participantRecord(telegramId) {
    const id = cleanId(telegramId);
    if (!id) return null;
    const admin = adminPayload()?.adminData?.participants;
    if (Array.isArray(admin)) {
      const found = admin.find(item => cleanId(item?.telegramId) === id);
      if (found) return found;
    }
    try {
      const list = Array.isArray(snapshotState?.participants) ? snapshotState.participants : [];
      return list.find(item => cleanId(item?.telegramId) === id) || null;
    } catch (_) { return null; }
  }

  function currentCodes(telegramId) {
    const record = participantRecord(telegramId);
    if (Array.isArray(record?.achievements)) {
      return [...new Set(record.achievements.map(cleanCode).filter(Boolean))];
    }
    try {
      const legacy = Array.isArray(window.RoyalMayak?.participantIds) ? window.RoyalMayak.participantIds : [];
      if (legacy.map(cleanId).includes(cleanId(telegramId))) return ['mayak'];
    } catch (_) {}
    return [];
  }

  function setLocalCodes(telegramId, codes) {
    const id = cleanId(telegramId);
    const next = [...new Set((Array.isArray(codes) ? codes : []).map(cleanCode).filter(Boolean))];
    const mutate = list => {
      if (!Array.isArray(list)) return;
      const record = list.find(item => cleanId(item?.telegramId) === id);
      if (record) record.achievements = [...next];
    };
    try { mutate(window.RoyalAdminDataV0600?.current?.adminData?.participants); } catch (_) {}
    try { mutate(snapshotState?.participants); } catch (_) {}
    scheduleMayakReconcile();
    try {
      window.dispatchEvent(new CustomEvent('royal:achievements-updated', {
        detail:{ telegramId:id, achievements:[...next] }
      }));
    } catch (_) {}
  }

  function countLabel(codes) {
    const count = Array.isArray(codes) ? codes.length : 0;
    if (!count) return 'нет';
    return String(count);
  }

  function participantIdFromForm(form) {
    return cleanId(form?.querySelector?.('[data-write-field="telegramId"]')?.value);
  }

  function selectedCodes(root) {
    return [...(root?.querySelectorAll?.('[data-achievement-code]') || [])]
      .filter(input => input.checked)
      .map(input => cleanCode(input.dataset.achievementCode))
      .filter(Boolean);
  }

  function makeRequestId() {
    let random = '';
    try { random = crypto.randomUUID?.().replace(/-/g, '') || ''; } catch (_) {}
    if (!random) random = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    return `ach-${Date.now().toString(36)}-${random.slice(0, 20)}`;
  }

  function mergeLocalJournal(entry) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
    try {
      const current = window.RoyalAdminDataV0600?.current;
      if (!current?.adminData) return;
      const journal = current.adminData.journal && typeof current.adminData.journal === 'object'
        ? current.adminData.journal
        : { version:'0.6.0-read', rows:[] };
      const rows = Array.isArray(journal.rows) ? journal.rows : [];
      const key = clean(entry.requestId || entry.eventId);
      journal.version = `${clean(journal.version) || '0.6.0-read'}+achievements.1`;
      journal.rows = [
        entry,
        ...rows.filter(row => clean(row?.requestId || row?.eventId) !== key)
      ];
      current.adminData.journal = journal;
    } catch (_) {}
  }

  function renderPanel(control, telegramId) {
    const panel = control.querySelector('[data-admin-achievements-panel="1"]');
    if (!panel) return;
    const selected = new Set(currentCodes(telegramId));
    const items = catalog();
    panel.innerHTML = `
      <div class="royal-admin-achievements-list-v061">
        ${items.map(item => `<label class="royal-admin-achievement-row-v061"><input type="checkbox" data-achievement-code="${esc(item.code)}"${selected.has(item.code) ? ' checked' : ''}><span class="royal-admin-achievement-icon-v061">${item.code === 'mayak' ? '🗼' : '🏅'}</span><span><b>${esc(item.title)}</b>${item.description ? `<small>${esc(item.description)}</small>` : ''}</span></label>`).join('')}
      </div>
      <div class="royal-admin-achievement-status-v061" data-admin-achievements-status="1" aria-live="polite"></div>
      <button type="button" class="royal-admin-achievement-save-v061" data-admin-achievements-save="1">💾 Сохранить награды</button>`;
    const button = control.querySelector('[data-admin-achievements-toggle="1"]');
    const badge = button?.querySelector('[data-admin-achievements-count="1"]');
    if (badge) badge.textContent = countLabel([...selected]);
  }

  function ensureControl(form) {
    if (!form || form.querySelector('[data-admin-achievements-control="1"]')) return;
    const telegramId = participantIdFromForm(form);
    if (!telegramId) return;

    const control = document.createElement('section');
    control.className = 'royal-admin-achievements-control-v061';
    control.dataset.adminAchievementsControl = '1';
    control.dataset.telegramId = telegramId;
    const codes = currentCodes(telegramId);
    control.innerHTML = `
      <button type="button" class="royal-admin-achievements-toggle-v061" data-admin-achievements-toggle="1" aria-expanded="false">
        <span>🏅 Награды</span><span class="royal-admin-achievements-count-v061" data-admin-achievements-count="1">${countLabel(codes)}</span>
      </button>
      <div class="royal-admin-achievements-panel-v061" data-admin-achievements-panel="1" hidden></div>`;

    const anchor = form.querySelector('.royal-admin-write-section-title') || form.querySelector('.royal-admin-form-note') || form.firstElementChild;
    if (anchor?.parentElement) anchor.insertAdjacentElement(anchor.classList.contains('royal-admin-write-section-title') ? 'beforebegin' : 'afterend', control);
    else form.prepend(control);
  }

  async function save(control) {
    const telegramId = cleanId(control?.dataset?.telegramId);
    const panel = control?.querySelector?.('[data-admin-achievements-panel="1"]');
    const status = panel?.querySelector?.('[data-admin-achievements-status="1"]');
    const button = panel?.querySelector?.('[data-admin-achievements-save="1"]');
    if (!telegramId || !panel || !button) return;
    const achievements = selectedCodes(panel);
    const requestId = makeRequestId();

    button.disabled = true;
    if (status) {
      status.className = 'royal-admin-achievement-status-v061 is-loading';
      status.textContent = 'Сохраняем…';
    }

    try {
      const token = clean(typeof sessionToken === 'undefined' ? '' : sessionToken);
      if (!token) throw new Error('Сессия приложения не готова.');
      const response = await fetch(`${API_URL}/admin-achievements`, {
        method:'POST',
        mode:'cors',
        cache:'no-store',
        headers:{
          Authorization:`Bearer ${token}`,
          'Content-Type':'application/json'
        },
        body:JSON.stringify({ telegramId, achievements, requestId })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) throw new Error(data?.message || `HTTP ${response.status}`);

      const saved = Array.isArray(data.achievements) ? data.achievements.map(cleanCode).filter(Boolean) : achievements;
      setLocalCodes(telegramId, saved);
      mergeLocalJournal(data.journalEntry);
      const badge = control.querySelector('[data-admin-achievements-count="1"]');
      if (badge) badge.textContent = countLabel(saved);
      if (status) {
        status.className = 'royal-admin-achievement-status-v061 is-ok';
        status.textContent = data.changed === false ? 'Награды без изменений.' : 'Награды сохранены и записаны в журнал.';
      }
      try {
        const current = window.RoyalAdminDataV0600?.current;
        if (current?.adminData) {
          current.adminData.achievementCatalog = Array.isArray(data.achievementCatalog) ? data.achievementCatalog : current.adminData.achievementCatalog;
        }
      } catch (_) {}
    } catch (error) {
      if (status) {
        status.className = 'royal-admin-achievement-status-v061 is-error';
        status.textContent = error?.message || 'Не удалось сохранить награды.';
      }
    } finally {
      button.disabled = false;
    }
  }

  function decorate(root=document) {
    const forms = [];
    if (root?.matches?.(FORM_SELECTOR)) forms.push(root);
    root?.querySelectorAll?.(FORM_SELECTOR)?.forEach(form => forms.push(form));
    forms.forEach(ensureControl);
  }

  /* v0.6.1 public MAYAK surfaces now follow the achievement projection. The
   * historical hardcoded list stays only as a rollback/fallback inside the old
   * v0.5.36 module. Once snapshot participants carry achievements[], MAYAK
   * badges and the project participant list are driven by code='mayak'. */
  function snapshotParticipants() {
    try { return Array.isArray(snapshotState?.participants) ? snapshotState.participants : []; }
    catch (_) { return []; }
  }

  function hasAchievementProjection() {
    return snapshotParticipants().some(item => Array.isArray(item?.achievements));
  }

  function hasAchievement(record, code) {
    if (!Array.isArray(record?.achievements)) return false;
    return record.achievements.map(cleanCode).includes(cleanCode(code));
  }

  function mayakParticipants() {
    const all = snapshotParticipants();
    if (hasAchievementProjection()) return all.filter(item => hasAchievement(item, 'mayak'));
    let legacy = [];
    try { legacy = Array.isArray(window.RoyalMayak?.participantIds) ? window.RoyalMayak.participantIds.map(cleanId) : []; }
    catch (_) {}
    const set = new Set(legacy.filter(Boolean));
    return all.filter(item => set.has(cleanId(item?.telegramId)));
  }

  function participantById(id) {
    const key = cleanId(id);
    return snapshotParticipants().find(item => cleanId(item?.telegramId) === key) || null;
  }

  function mayakLighthouseSvg() {
    return `<svg class="mayak-lighthouse-svg" viewBox="0 0 64 64" aria-hidden="true"><path fill="currentColor" d="M28 6h8l2 6h5l5 9H16l5-9h5l2-6Zm-7 18h22l4 34H17l4-34Zm6 5-1 8h12l-1-8H27Zm-2 14-1 9h16l-1-9H25ZM8 23l12 4-.6 5L8 35V23Zm48 0v12l-11.4-3-.6-5L56 23Z"/><path fill="#fff4b0" d="M29 15h6v6h-6z"/></svg>`;
  }

  function createMayakBadge() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mayak-achievement-v0536';
    button.dataset.openMayakParticipants = '1';
    button.setAttribute('title', 'Участники проекта «МАЯК»');
    button.setAttribute('aria-label', 'Достижение МАЯК. Открыть участников проекта');
    button.innerHTML = `${mayakLighthouseSvg()}<span>МАЯК</span>`;
    return button;
  }

  function visibleCardId(card) {
    return cleanId(
      card?.dataset?.profileTelegramId ||
      card?.dataset?.participantTelegramId ||
      card?.dataset?.directoryTelegramId ||
      card?.querySelector?.('[data-telegram-id]')?.dataset?.telegramId
    );
  }

  function reconcileMayakCard(card) {
    const row = card?.querySelector?.('.participant-achievements-row');
    if (!row) return;
    const participant = participantById(visibleCardId(card));
    const shouldHave = !!participant && hasAchievement(participant, 'mayak');
    let slot = row.querySelector(':scope > .participant-achievements-future-slot');
    const badges = slot ? [...slot.querySelectorAll(':scope > .mayak-achievement-v0536')] : [];
    if (!shouldHave) {
      badges.forEach(node => node.remove());
      row.classList.remove('has-mayak-v0536');
      return;
    }
    if (!slot) {
      slot = document.createElement('span');
      slot.className = 'participant-achievements-future-slot';
      row.appendChild(slot);
    }
    if (!slot.querySelector(':scope > .mayak-achievement-v0536')) slot.appendChild(createMayakBadge());
    row.classList.add('has-mayak-v0536');
  }

  function reconcileMayakDetail() {
    const card = document.querySelector('.participant-detail-card');
    if (!card) return;
    const id = cleanId(card.querySelector('.participant-detail-avatar[data-telegram-id]')?.dataset?.telegramId);
    const participant = participantById(id);
    const shouldHave = !!participant && hasAchievement(participant, 'mayak');
    const stage = card.querySelector('.rank-premium-stage');
    if (!stage) return;
    let strip = card.querySelector('.participant-detail-achievement-strip-v0536');
    if (!shouldHave) {
      strip?.remove();
      return;
    }
    if (!strip) {
      strip = document.createElement('div');
      strip.className = 'participant-detail-achievement-strip-v0536';
    }
    if (stage.nextElementSibling !== strip) stage.insertAdjacentElement('afterend', strip);
    if (!strip.querySelector('.mayak-achievement-v0536')) strip.appendChild(createMayakBadge());
  }

  function reconcileMayakUi() {
    if (!hasAchievementProjection()) return;
    document.querySelectorAll('.person-card,.team-member,.directory-person-card:not(.directory-person-card--external),.hero-card')
      .forEach(reconcileMayakCard);
    reconcileMayakDetail();
    const count = mayakParticipants().length;
    document.querySelectorAll('.mayak-participants-button-v0536 small').forEach(node => {
      node.textContent = `${count} участников · золотое достижение «МАЯК»`;
    });
    try {
      if (window.RoyalMayak && Array.isArray(window.RoyalMayak.participantIds)) {
        window.RoyalMayak.participantIds = mayakParticipants().map(item => cleanId(item?.telegramId)).filter(Boolean);
      }
    } catch (_) {}
  }

  let reconcileTimer = 0;
  function scheduleMayakReconcile() {
    if (reconcileTimer) clearTimeout(reconcileTimer);
    reconcileTimer = setTimeout(() => {
      reconcileTimer = 0;
      reconcileMayakUi();
      [90, 280, 650].forEach(delay => setTimeout(reconcileMayakUi, delay));
    }, 0);
  }

  function renderMayakParticipantsFromAchievements() {
    const found = mayakParticipants();
    try { window.RoyalNav?.pushCurrent?.(); } catch (_) {}
    document.body.classList.add('royal-section-screen');
    const selfCard = document.getElementById('selfProfileCard');
    if (selfCard) selfCard.hidden = true;
    const panel = document.getElementById('panel');
    if (!panel) return;
    panel.hidden = false;
    const cards = typeof participantCard === 'function' ? found.map(participantCard).join('') : '';
    panel.innerHTML = `<button type="button" class="royal-back-button" data-royal-back="1">← Назад</button><section class="mayak-participants-page-v0536"><span class="guide-head" hidden aria-hidden="true"></span><header><span>${mayakLighthouseSvg()}</span><h2>Участники проекта<br>«МАЯК»</h2></header><div class="people-list">${cards || '<div class="empty-state">Участники пока недоступны.</div>'}</div></section>`;
    try { setupAvatarLoading(panel); } catch (_) {}
    try { window.RoyalNav?.enhanceVisibleBack?.(); } catch (_) {}
    try { window.RoyalTeamGameColors?.refresh?.(); } catch (_) {}
    try { window.RoyalAdminBadges?.refresh?.(0); } catch (_) {}
    try { window.RoyalScrollTop?.afterForwardRender?.(); } catch (_) {}
    scheduleMayakReconcile();
  }

  const style = document.createElement('style');
  style.dataset.adminAchievementsV061 = '1';
  style.textContent = `
    .royal-admin-achievements-control-v061{display:grid;gap:8px;margin:2px 0 4px}
    .royal-admin-achievements-toggle-v061{width:100%;min-height:50px;padding:0 14px;border-radius:14px;border:1px solid rgba(240,197,76,.55);background:linear-gradient(135deg,#3a3214,#211d10);color:#fff4b0;display:flex;align-items:center;justify-content:space-between;gap:12px;font:900 15px/1.2 inherit;touch-action:manipulation}
    .royal-admin-achievements-count-v061{min-width:30px;padding:4px 9px;border-radius:999px;background:rgba(255,222,103,.14);border:1px solid rgba(255,222,103,.24);font-size:12px;text-align:center}
    .royal-admin-achievements-panel-v061{display:grid;gap:10px;padding:11px;border:1px solid rgba(240,197,76,.28);border-radius:14px;background:rgba(38,31,9,.42)}
    .royal-admin-achievements-panel-v061[hidden]{display:none!important}
    .royal-admin-achievements-list-v061{display:grid;gap:8px}
    .royal-admin-achievement-row-v061{display:grid!important;grid-template-columns:auto auto 1fr;align-items:center;gap:10px;min-height:58px;padding:10px;border:1px solid rgba(255,226,118,.20);border-radius:12px;background:#101b24;color:#f5f8fa;touch-action:manipulation}
    .royal-admin-achievement-row-v061 input{width:22px!important;height:22px!important;min-height:0!important;accent-color:#e4bc43}
    .royal-admin-achievement-icon-v061{font-size:24px}
    .royal-admin-achievement-row-v061 b{display:block;color:#ffe891;font-size:14px}
    .royal-admin-achievement-row-v061 small{display:block;margin-top:3px;color:#8fa3b1;font-size:11px;line-height:1.35}
    .royal-admin-achievement-save-v061{width:100%;min-height:48px;border:1px solid rgba(240,197,76,.55);border-radius:12px;background:linear-gradient(135deg,#6a5418,#3e3212);color:#fff9d6;font:900 14px/1.2 inherit;touch-action:manipulation}
    .royal-admin-achievement-save-v061:disabled{opacity:.55}
    .royal-admin-achievement-status-v061{min-height:0;color:#8fa3b1;font-size:12px;line-height:1.4}
    .royal-admin-achievement-status-v061.is-ok{color:#bdf5d5}
    .royal-admin-achievement-status-v061.is-error{color:#ffc5ca}
  `;
  document.head.appendChild(style);

  window.addEventListener('click', event => {
    const participants = event.target?.closest?.('[data-open-mayak-participants="1"]');
    if (!participants || !hasAchievementProjection()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    renderMayakParticipantsFromAchievements();
  }, true);

  document.addEventListener('click', event => {
    const toggle = event.target?.closest?.('[data-admin-achievements-toggle="1"]');
    if (toggle) {
      event.preventDefault();
      event.stopPropagation();
      const control = toggle.closest('[data-admin-achievements-control="1"]');
      const panel = control?.querySelector?.('[data-admin-achievements-panel="1"]');
      if (!control || !panel) return;
      const opening = panel.hidden;
      if (opening) renderPanel(control, control.dataset.telegramId);
      panel.hidden = !opening;
      toggle.setAttribute('aria-expanded', opening ? 'true' : 'false');
      return;
    }

    const saveButton = event.target?.closest?.('[data-admin-achievements-save="1"]');
    if (saveButton) {
      event.preventDefault();
      event.stopPropagation();
      const control = saveButton.closest('[data-admin-achievements-control="1"]');
      save(control);
    }
  }, true);

  const observer = new MutationObserver(records => {
    let needsDecorate = false;
    let needsMayak = false;
    for (const record of records) {
      for (const node of record.addedNodes || []) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.(FORM_SELECTOR) || node.querySelector?.(FORM_SELECTOR)) needsDecorate = true;
        if (node.matches?.('.person-card,.team-member,.participant-detail-card,.hero-card,.mayak-project-page-v0536') ||
            node.querySelector?.('.person-card,.team-member,.participant-detail-card,.hero-card,.mayak-project-page-v0536')) needsMayak = true;
      }
    }
    if (needsDecorate) decorate(document);
    if (needsMayak) scheduleMayakReconcile();
  });
  observer.observe(document.body, { childList:true, subtree:true });

  window.addEventListener('royal:auth-ready', scheduleMayakReconcile);
  window.addEventListener('royal:snapshot-ready', scheduleMayakReconcile);
  window.addEventListener('royal:achievements-updated', scheduleMayakReconcile);
  window.addEventListener('pageshow', scheduleMayakReconcile);

  decorate(document);
  scheduleMayakReconcile();
  window.RoyalAdminAchievementsV061 = {
    version:VERSION,
    refresh:() => { decorate(document); scheduleMayakReconcile(); }
  };
  window.__ROYAL_ADMIN_ACHIEVEMENTS_V061__ = VERSION;
})();
