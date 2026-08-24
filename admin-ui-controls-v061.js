/* Royal CRM Mini App v0.6.1 — admin UI controls and keyboard parity */
(() => {
  'use strict';
  if (String(window.__ROYAL_BUILD__ || '') !== '0.6.1') return;
  if (window.__ROYAL_ADMIN_UI_CONTROLS_V061__) return;

  const VERSION = '0.6.1-admin-ui-controls.2';
  let scheduled = 0;
  let drag = null;
  let writeReadyPoll = 0;

  const clean = value => String(value == null ? '' : value).trim();
  const lower = value => clean(value).toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');

  function gameKey(record) {
    const direct = lower(record?.dataset?.adminTeamGame || record?.dataset?.teamGame);
    if (direct === 'rk' || direct === 'рк' || direct.includes('royal kingdom')) return 'rk';
    if (direct === 'rm' || direct === 'рм' || direct.includes('royal match')) return 'rm';
    const meta = lower(record?.querySelector?.('summary .royal-admin-summary-main small')?.textContent || record?.textContent);
    if (meta.includes('royal kingdom') || /(^|\s)рк($|\s)/u.test(meta)) return 'rk';
    if (meta.includes('royal match') || /(^|\s)рм($|\s)/u.test(meta)) return 'rm';
    return '';
  }

  function colorTeamRecords(root = document) {
    root.querySelectorAll?.('.royal-admin-record[data-admin-team="1"]').forEach(record => {
      const key = gameKey(record);
      record.classList.toggle('v061-admin-team-rk', key === 'rk');
      record.classList.toggle('v061-admin-team-rm', key === 'rm');
    });
  }

  function actionButton(kind, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'royal-admin-action royal-admin-direct-create-v061';
    button.dataset[kind === 'team' ? 'adminCreateTeam' : 'adminCreateParticipant'] = '1';
    button.textContent = label;
    return button;
  }

  function ensurePrimaryActions(root = document) {
    root.querySelectorAll?.('.royal-admin-screen').forEach(screen => {
      const actions = screen.querySelector('.royal-admin-actions');
      if (!actions) return;

      actions.querySelectorAll('[data-admin-edit-mode="1"]').forEach(node => node.remove());
      actions.classList.add('v061-admin-direct-actions');

      let stack = actions.querySelector('[data-v061-admin-create-stack="1"]');
      if (!stack) {
        stack = document.createElement('div');
        stack.className = 'royal-admin-create-stack-v061';
        stack.dataset.v061AdminCreateStack = '1';
        stack.append(
          actionButton('team', '＋ Добавить команду'),
          actionButton('participant', '＋ Добавить участника')
        );
        actions.appendChild(stack);
      }

      const writeReady = !!window.RoyalAdminWriteV0600;
      stack.querySelectorAll('button').forEach(button => {
        button.disabled = !writeReady;
        button.setAttribute('aria-disabled', writeReady ? 'false' : 'true');
      });

      screen.querySelectorAll('[data-admin-write-toolbar="1"],[data-admin-edit-hint="1"]').forEach(node => node.remove());
    });
  }

  function ensureRecordEditButtons(root = document) {
    if (!window.RoyalAdminWriteV0600) return;

    root.querySelectorAll?.('[data-admin-participant="1"]').forEach(section => {
      if (section.querySelector('[data-admin-edit-participant="1"]')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'royal-admin-edit-record royal-admin-edit-top-v061';
      button.dataset.adminEditParticipant = '1';
      button.textContent = '✏️ Редактировать участника';

      if (section.classList.contains('royal-admin-participant-detail')) {
        const head = section.querySelector('.participant-detail-head');
        if (head) head.insertAdjacentElement('afterend', button);
        else section.prepend(button);
      } else {
        section.querySelector('.royal-admin-detail')?.appendChild(button);
      }
    });

    root.querySelectorAll?.('[data-admin-team="1"]').forEach(section => {
      if (section.querySelector('[data-admin-edit-team="1"]')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'royal-admin-edit-record royal-admin-edit-top-v061';
      button.dataset.adminEditTeam = '1';
      button.textContent = '✏️ Редактировать команду';

      if (section.classList.contains('royal-admin-team-detail-shell')) {
        const photo = section.querySelector('.team-photo-box');
        if (photo) section.insertBefore(button, photo);
        else section.prepend(button);
      } else {
        section.querySelector('.royal-admin-detail')?.appendChild(button);
      }
    });
  }

  function activeAdminSearch() {
    const active = document.activeElement;
    if (!(active instanceof HTMLInputElement)) return null;
    if (!active.matches('input[data-admin-search-input]')) return null;
    if (!active.closest('.royal-admin-screen')) return null;
    return active;
  }

  function dismissAdminKeyboard() {
    const input = activeAdminSearch();
    if (!input) return false;
    try { input.blur(); } catch (_) { return false; }
    return true;
  }

  window.addEventListener('pointerdown', event => {
    const input = activeAdminSearch();
    if (!input) { drag = null; return; }
    const sameSearch = event.target === input || event.target?.closest?.('.royal-admin-search') === input.closest('.royal-admin-search');
    if (sameSearch) {
      drag = { id:event.pointerId, x:Number(event.clientX || 0), y:Number(event.clientY || 0) };
      return;
    }
    drag = null;
    dismissAdminKeyboard();
  }, true);

  window.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId || !activeAdminSearch()) return;
    const dx = Number(event.clientX || 0) - drag.x;
    const dy = Number(event.clientY || 0) - drag.y;
    if ((dx * dx + dy * dy) < 100) return;
    drag = null;
    dismissAdminKeyboard();
  }, true);
  window.addEventListener('pointerup', () => { drag = null; }, true);
  window.addEventListener('pointercancel', () => { drag = null; }, true);

  document.addEventListener('keydown', event => {
    if (!activeAdminSearch()) return;
    if (event.key === 'Enter' || event.key === 'Escape') dismissAdminKeyboard();
  }, true);

  function decorate() {
    colorTeamRecords(document);
    ensurePrimaryActions(document);
    ensureRecordEditButtons(document);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = window.requestAnimationFrame(() => {
      scheduled = 0;
      decorate();
    });
  }

  const style = document.createElement('style');
  style.dataset.adminUiControlsV061 = '1';
  style.textContent = `
    .royal-admin-record[data-admin-team="1"].v061-admin-team-rm{
      background:linear-gradient(145deg,#245b91,#173e69)!important;
      border-color:rgba(110,188,255,.34)!important;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 5px 13px rgba(9,41,77,.16)!important;
    }
    .royal-admin-record[data-admin-team="1"].v061-admin-team-rk{
      background:linear-gradient(145deg,#a63b43,#6e2229)!important;
      border-color:rgba(255,145,151,.34)!important;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 5px 13px rgba(86,14,21,.17)!important;
    }
    .royal-admin-record[data-admin-team="1"].v061-admin-team-rm>summary,
    .royal-admin-record[data-admin-team="1"].v061-admin-team-rk>summary{
      background:transparent!important;
    }
    .royal-admin-record[data-admin-team="1"].v061-admin-team-rm .royal-admin-team-thumbnail{
      background:rgba(43,121,194,.26)!important;
      border-color:rgba(101,181,255,.28)!important;
    }
    .royal-admin-record[data-admin-team="1"].v061-admin-team-rk .royal-admin-team-thumbnail{
      background:rgba(184,53,66,.25)!important;
      border-color:rgba(255,124,137,.28)!important;
    }
    .royal-admin-actions.v061-admin-direct-actions{
      display:grid!important;
      grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;
      gap:12px!important;
      align-items:stretch!important;
    }
    .royal-admin-actions.v061-admin-direct-actions>[data-admin-refresh="1"]{
      width:100%!important;
      min-height:104px!important;
      height:100%!important;
    }
    .royal-admin-create-stack-v061{
      display:grid;
      grid-template-rows:1fr 1fr;
      gap:8px;
      min-width:0;
    }
    .royal-admin-create-stack-v061 .royal-admin-action{
      width:100%!important;
      min-width:0!important;
      min-height:48px!important;
      padding:8px 10px!important;
      font-size:14px!important;
      line-height:1.18!important;
      white-space:normal!important;
    }
    .royal-admin-create-stack-v061 .royal-admin-action:disabled{opacity:.58}
    .royal-admin-edit-top-v061{margin:8px 0 14px!important}
    @media (max-width:390px){
      .royal-admin-actions.v061-admin-direct-actions{gap:9px!important}
      .royal-admin-create-stack-v061{gap:7px}
      .royal-admin-create-stack-v061 .royal-admin-action{font-size:13px!important;padding:7px 8px!important}
    }
  `;
  document.head.appendChild(style);

  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.addedNodes?.length || record.removedNodes?.length) {
        schedule();
        return;
      }
    }
  });
  observer.observe(document.body, { childList:true, subtree:true });

  [0,120,350,800,1600,3000,5000,8000].forEach(delay => window.setTimeout(schedule, delay));
  writeReadyPoll = window.setInterval(() => {
    if (!document.querySelector('.royal-admin-screen')) return;
    schedule();
    if (window.RoyalAdminWriteV0600) {
      window.clearInterval(writeReadyPoll);
      writeReadyPoll = 0;
    }
  }, 500);
  window.setTimeout(() => {
    if (writeReadyPoll) {
      window.clearInterval(writeReadyPoll);
      writeReadyPoll = 0;
    }
  }, 15000);

  window.addEventListener('pageshow', schedule);
  window.addEventListener('royal:auth-ready', schedule);
  window.addEventListener('royal:snapshot-ready', schedule);

  decorate();
  window.__ROYAL_ADMIN_UI_CONTROLS_V061__ = {
    version:VERSION,
    refresh:schedule,
    dismissKeyboard:dismissAdminKeyboard
  };
})();
