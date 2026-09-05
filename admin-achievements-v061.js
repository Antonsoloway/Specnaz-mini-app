/* Royal CRM Mini App v0.6.1 — admin participant achievement editor */
(() => {
  'use strict';
  if (String(window.__ROYAL_BUILD__ || '') !== '0.6.1') return;
  if (window.__ROYAL_ADMIN_ACHIEVEMENTS_V061__) return;

  const VERSION = '0.6.1-admin-achievements.1';
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
    try { window.RoyalMayak?.refresh?.(); } catch (_) {}
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
        body:JSON.stringify({ telegramId, achievements })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) throw new Error(data?.message || `HTTP ${response.status}`);

      const saved = Array.isArray(data.achievements) ? data.achievements.map(cleanCode).filter(Boolean) : achievements;
      setLocalCodes(telegramId, saved);
      const badge = control.querySelector('[data-admin-achievements-count="1"]');
      if (badge) badge.textContent = countLabel(saved);
      if (status) {
        status.className = 'royal-admin-achievement-status-v061 is-ok';
        status.textContent = 'Награды сохранены.';
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
    for (const record of records) {
      for (const node of record.addedNodes || []) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.(FORM_SELECTOR) || node.querySelector?.(FORM_SELECTOR)) {
          decorate(node);
          return;
        }
      }
    }
  });
  observer.observe(document.body, { childList:true, subtree:true });

  decorate(document);
  window.RoyalAdminAchievementsV061 = { version:VERSION, refresh:() => decorate(document) };
  window.__ROYAL_ADMIN_ACHIEVEMENTS_V061__ = VERSION;
})();
