/* Royal CRM Mini App — move admin entry beside the admin name v0.6.0 */
(() => {
  const VERSION = '0.6.0-admin-entry-relocation.2';
  let scheduled = false;

  function moveAdminEntry() {
    const tile = document.querySelector('[data-admin-mode="1"]');
    const existing = document.querySelector('.royal-admin-header-entry');
    if (!tile) {
      existing?.remove();
      return;
    }

    const head = document.querySelector('#selfProfileCard .self-profile-head');
    if (!head) return;

    tile.classList.add('royal-admin-tile--relocated');
    tile.setAttribute('aria-hidden','true');
    tile.tabIndex = -1;

    if (existing && existing.parentElement === head) return;
    existing?.remove();

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'royal-admin-header-entry';
    button.setAttribute('aria-label','Открыть админ-режим');
    button.innerHTML = '<span>🛡️</span><b>Админ режим</b><small>Открыть</small>';
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (window.RoyalAdminV0600?.open) window.RoyalAdminV0600.open(false);
      else tile.click();
    }, true);

    head.appendChild(button);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      moveAdminEntry();
    },0);
  }

  const observer = new MutationObserver(schedule);
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});

  schedule();
  setTimeout(schedule,250);
  setTimeout(schedule,1000);
  setTimeout(schedule,2500);

  window.RoyalAdminEntryRelocationV0600 = { version: VERSION, move: moveAdminEntry, refresh:schedule };
})();
