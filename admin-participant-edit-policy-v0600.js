/* Royal CRM Mini App — participant edit policy v0.6.0
 * Existing participant:
 *   editable manually: CRM name + five team/role/nickname slots.
 *   bot/system managed: Telegram identity/name/username, chat state, date,
 *   specnaz/screens/activity counters.
 * Create-participant form is intentionally not changed by this UI-only module.
 */
(() => {
  const VERSION = '0.6.0-participant-policy.1';
  const SYSTEM_FIELDS = new Set([
    'telegramId','chatState','telegramName','username','date',
    'specnaz','screens','activityBase','activityOutside'
  ]);

  function applyToForm(form) {
    if (!form || form.dataset.writeMode !== 'update' || form.dataset.participantPolicyApplied === '1') return;
    form.dataset.participantPolicyApplied = '1';

    form.querySelectorAll('.royal-admin-form-grid .royal-admin-input').forEach(label => {
      const field = label.querySelector('[data-write-field]');
      const key = field?.dataset?.writeField || '';
      if (!SYSTEM_FIELDS.has(key)) return;

      // Keep the original value in the DOM so the legacy collector cannot
      // accidentally replace system data with an empty/default value.
      if (field.tagName === 'SELECT') field.disabled = true;
      else field.readOnly = true;
      field.setAttribute('aria-readonly','true');
      label.hidden = true;
    });

    const note = form.querySelector('.royal-admin-form-note');
    if (note) {
      note.textContent = 'Вручную изменяются только имя и команды/роли/игровые ники. Telegram-данные, статус чата, дата и счётчики заполняются ботом автоматически.';
    }
  }

  function decorate(root=document) {
    root.querySelectorAll?.('[data-write-participant-form="1"]').forEach(applyToForm);
  }

  decorate();
  const observer = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.('[data-write-participant-form="1"]')) applyToForm(node);
        decorate(node);
      }
    }
  });
  observer.observe(document.body,{childList:true,subtree:true});

  window.RoyalAdminParticipantEditPolicyV0600 = { version:VERSION, decorate };
})();
