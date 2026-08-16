/* Royal CRM Mini App — developer credit for changelog v0.5.28 */
(() => {
  const USERNAME = 'ansoloway';

  function ensureStyles() {
    if (document.getElementById('royalChangelogCreditStyle')) return;
    const style = document.createElement('style');
    style.id = 'royalChangelogCreditStyle';
    style.textContent = `
      .changelog-developer{display:flex;align-items:center;gap:7px;margin:9px 0 0;color:#9fb0bf;font-size:14px;font-weight:600}
      .changelog-developer button{appearance:none;border:0;background:transparent;padding:0;color:#5db8f2;font:inherit;font-weight:900;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:rgba(84,169,235,.14)}
      .changelog-developer button:active{opacity:.72}
    `;
    document.head.appendChild(style);
  }

  function addCredit() {
    ensureStyles();
    const head = document.querySelector('.changelog-head');
    if (!head || head.querySelector('.changelog-developer')) return;
    const title = head.querySelector('h2');
    if (!title) return;
    const line = document.createElement('div');
    line.className = 'changelog-developer';
    line.innerHTML = `Разработчик: <button type="button" data-changelog-developer>@${USERNAME}</button>`;
    title.insertAdjacentElement('afterend', line);
  }

  document.addEventListener('click', event => {
    if (event.target?.closest?.('#versionBadge')) addCredit();
    const developer = event.target?.closest?.('[data-changelog-developer]');
    if (!developer) return;
    event.preventDefault();
    event.stopPropagation();
    const url = `https://t.me/${USERNAME}`;
    try {
      if (window.Telegram?.WebApp?.openTelegramLink) window.Telegram.WebApp.openTelegramLink(url);
      else window.open(url, '_blank', 'noopener');
    } catch (_) {
      window.location.href = url;
    }
  });

  try {
    if (window.RoyalChangelog?.open) {
      const nativeOpen = window.RoyalChangelog.open;
      window.RoyalChangelog.open = function() {
        const result = nativeOpen.apply(this, arguments);
        addCredit();
        return result;
      };
    }
  } catch (_) {}
})();
