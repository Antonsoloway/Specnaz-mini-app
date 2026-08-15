/* Royal CRM Mini App — version lock v0.5.11 */
(() => {
  const VERSION = '0.5.11';
  const badge = document.getElementById('versionBadge');
  if (!badge) return;
  const apply = () => {
    const expected = `v${VERSION}`;
    if (badge.textContent !== expected) badge.textContent = expected;
  };
  apply();
  new MutationObserver(apply).observe(badge, { childList: true, characterData: true, subtree: true });
  window.__ROYAL_UI_VERSION__ = VERSION;
})();
