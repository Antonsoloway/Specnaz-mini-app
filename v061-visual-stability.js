/* Royal CRM v0.6.1 — rank/compositor visual stability for Telegram WebView.
 * Replaces the legacy periodic viewport scan with IntersectionObserver.
 */
(() => {
  if (String(window.__ROYAL_BUILD__ || '') !== '0.6.1') return;

  const VERSION = '0.6.1-visual-stability.1';
  const suppressed = Number(window.RoyalV061RankIntervalGuard?.restore?.() || 0);
  const observed = new WeakSet();
  let observer = null;
  let mutationObserver = null;
  let registerQueued = false;

  function collect(root, out) {
    if (!root || root.nodeType !== 1) return;
    if (root.matches?.('.rank-badge--compact')) out.push(root);
    root.querySelectorAll?.('.rank-badge--compact').forEach(node => out.push(node));
  }

  function register(root = document.documentElement) {
    const nodes = [];
    collect(root, nodes);
    nodes.forEach(node => {
      if (observed.has(node)) return;
      observed.add(node);
      if (observer) observer.observe(node);
      else node.classList.add('rank-is-visible');
    });
  }

  function queueRegister(root = document.documentElement) {
    if (registerQueued) return;
    registerQueued = true;
    requestAnimationFrame(() => {
      registerQueued = false;
      register(root);
    });
  }

  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        entry.target.classList.toggle('rank-is-visible', entry.isIntersecting);
      });
    }, {
      root: null,
      rootMargin: '100px 0px',
      threshold: 0
    });

    register(document.documentElement);

    if ('MutationObserver' in window) {
      mutationObserver = new MutationObserver(records => {
        let hasRelevantAdditions = false;
        records.some(record => {
          for (const node of record.addedNodes || []) {
            if (node?.nodeType !== 1) continue;
            if (node.matches?.('.rank-badge--compact') || node.querySelector?.('.rank-badge--compact')) {
              hasRelevantAdditions = true;
              return true;
            }
          }
          return false;
        });
        if (hasRelevantAdditions) queueRegister(document.documentElement);
      });
      mutationObserver.observe(document.documentElement, { childList: true, subtree: true });
    }
  } else {
    /* Rare fallback: keep the existing scroll/resize listeners but do not recreate the timer. */
    try { window.RoyalRank?.refreshVisible?.(); } catch (_) {}
  }

  window.addEventListener('pageshow', () => queueRegister(document.documentElement), { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) queueRegister(document.documentElement);
  }, { passive: true });
  window.addEventListener('royal:snapshot-ready', () => queueRegister(document.documentElement));

  window.RoyalV061VisualStability = {
    version: VERSION,
    suppressedLegacyRankIntervals: suppressed,
    refresh() { queueRegister(document.documentElement); }
  };
})();
