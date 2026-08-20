/* Royal CRM Mini App — v0.6 admin participant navigation guard
 * Keeps list avatars visible but makes the whole admin participant summary the
 * single navigation target, preventing the ordinary avatar tap handler from
 * opening the public participant profile first.
 */
(() => {
  const VERSION = '0.6.0-admin-participant-nav-guard.1';

  function installStyle() {
    if (document.querySelector('style[data-admin-participant-nav-guard="1"]')) return;
    const style = document.createElement('style');
    style.dataset.adminParticipantNavGuard = '1';
    style.textContent = `
      [data-admin-participant="1"] > summary .person-avatar-wrap,
      [data-admin-participant="1"] > summary .person-avatar-wrap * {
        pointer-events:none!important;
      }
    `;
    document.head.appendChild(style);
  }

  function decorateHiddenIds(root=document) {
    root.querySelectorAll?.('.royal-admin-participant-hidden-id').forEach(node => {
      node.setAttribute('aria-hidden','true');
    });
  }

  const observer = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes || []) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.('.royal-admin-participant-hidden-id')) node.setAttribute('aria-hidden','true');
        decorateHiddenIds(node);
      }
    }
  });

  installStyle();
  decorateHiddenIds();
  observer.observe(document.body,{childList:true,subtree:true});
  window.RoyalAdminParticipantNavGuardV0600 = { version:VERSION };
})();
