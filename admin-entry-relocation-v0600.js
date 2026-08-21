/* Royal CRM Mini App — move admin entry near admin header v0.6.0 */
(() => {
  const VERSION = '0.6.0-admin-entry-relocation.1';

  function moveAdminEntry() {
    const tile = document.querySelector('[data-admin-mode="1"]');
    if (!tile) return;

    let head = document.querySelector('.hero');
    if (!head) return;

    if (document.querySelector('.royal-admin-header-entry')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'royal-admin-header-entry';
    button.innerHTML = '🛡️';
    button.title = 'Админ режим';
    button.addEventListener('click', () => tile.click());

    head.appendChild(button);
    tile.style.display = 'none';
  }

  window.addEventListener('load', () => {
    setTimeout(moveAdminEntry, 500);
    setTimeout(moveAdminEntry, 1500);
  });

  window.RoyalAdminEntryRelocationV0600 = { version: VERSION, move: moveAdminEntry };
})();
