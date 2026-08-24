/* Royal CRM Mini App — v0.6.1 admin edit UX cleanup
 * Existing participant edit: show only fields an admin can change plus Telegram name/ID as read-only reference.
 * Move participant/team edit buttons to the top of their detail views.
 */
(() => {
  'use strict';
  if (String(window.__ROYAL_BUILD__ || '') !== '0.6.1') return;
  if (window.__ROYAL_ADMIN_EDIT_UX_V061__) return;

  const VERSION = '0.6.1-admin-edit-ux.1';
  let scheduled = 0;

  function fieldLabel(form, name) {
    return form?.querySelector?.(`[data-write-field="${name}"]`)?.closest?.('.royal-admin-input') || null;
  }

  function removeField(form, name) {
    fieldLabel(form, name)?.remove();
  }

  function markReadonly(form, name, title) {
    const input = form?.querySelector?.(`[data-write-field="${name}"]`);
    const label = input?.closest?.('.royal-admin-input');
    if (!input || !label) return label;
    input.readOnly = true;
    input.setAttribute('aria-readonly', 'true');
    label.classList.add('royal-admin-reference-field');
    const caption = label.querySelector('span');
    if (caption && title) caption.textContent = title;
    return label;
  }

  function decorateParticipantUpdateForm(form) {
    if (!form || form.dataset.writeMode !== 'update' || form.dataset.v061EditUx === '1') return;
    form.dataset.v061EditUx = '1';

    // Existing participants are server-whitelisted to CRM name + memberships only.
    // These system/bot fields remain visible in the admin card, not in the editor.
    ['chatState','username','date','specnaz','screens','activityBase','activityOutside']
      .forEach(name => removeField(form, name));

    const grid = form.querySelector('.royal-admin-form-grid');
    const nameLabel = fieldLabel(form, 'name');
    const telegramNameLabel = markReadonly(form, 'telegramName', 'Имя Telegram · справочно');
    const telegramIdLabel = markReadonly(form, 'telegramId', 'Telegram ID · справочно');

    // Put the useful editable field first, then the two requested Telegram references.
    if (grid) {
      [telegramIdLabel, telegramNameLabel, nameLabel].forEach(node => {
        if (node) grid.prepend(node);
      });
    }

    const note = form.querySelector('.royal-admin-form-note');
    if (note) {
      note.textContent = 'Редактируются только имя CRM и команды / роли / игровые ники. Имя Telegram и Telegram ID показаны только для сверки и не изменяются вручную.';
    }
  }

  function moveParticipantButton(section) {
    const button = section?.querySelector?.('[data-admin-edit-participant="1"]');
    if (!button) return;
    button.classList.add('royal-admin-edit-top-v061');

    if (section.classList.contains('royal-admin-participant-detail')) {
      const head = section.querySelector('.participant-detail-head');
      if (head && head.nextElementSibling !== button) head.insertAdjacentElement('afterend', button);
      return;
    }

    const legacyDetail = button.closest('.royal-admin-detail');
    if (legacyDetail && legacyDetail.firstElementChild !== button) legacyDetail.prepend(button);
  }

  function moveTeamButton(section) {
    const button = section?.querySelector?.('[data-admin-edit-team="1"]');
    if (!button) return;
    button.classList.add('royal-admin-edit-top-v061');

    if (section.classList.contains('royal-admin-team-detail-shell')) {
      const photo = section.querySelector('.team-photo-box');
      if (photo && photo.previousElementSibling !== button) section.insertBefore(button, photo);
      else if (!photo && section.firstElementChild !== button) section.prepend(button);
      return;
    }

    const legacyDetail = button.closest('.royal-admin-detail');
    if (legacyDetail && legacyDetail.firstElementChild !== button) legacyDetail.prepend(button);
  }

  function decorate(root = document) {
    root.querySelectorAll?.('[data-write-participant-form="1"][data-write-mode="update"]')
      .forEach(decorateParticipantUpdateForm);

    root.querySelectorAll?.('[data-admin-participant="1"]')
      .forEach(moveParticipantButton);
    root.querySelectorAll?.('[data-admin-team="1"]')
      .forEach(moveTeamButton);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = window.requestAnimationFrame(() => {
      scheduled = 0;
      decorate(document);
    });
  }

  const style = document.createElement('style');
  style.dataset.adminEditUxV061 = '1';
  style.textContent = `
    .royal-admin-reference-field input[readonly]{
      opacity:.78;
      background:#0c1922!important;
      color:#9fb0bc!important;
      border-color:#263d4b!important;
    }
    .royal-admin-edit-top-v061{
      margin:8px 0 14px!important;
    }
    .royal-admin-team-detail-shell>.royal-admin-edit-top-v061{
      margin:4px 0 14px!important;
    }
  `;
  document.head.appendChild(style);

  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList:true, subtree:true });
  document.addEventListener('click', schedule, true);

  decorate(document);
  setTimeout(schedule, 0);
  setTimeout(schedule, 350);

  window.__ROYAL_ADMIN_EDIT_UX_V061__ = {
    version: VERSION,
    refresh: schedule
  };
})();
