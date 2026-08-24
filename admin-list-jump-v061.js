/* Royal CRM Mini App v0.6.1 — floating top/bottom arrows for every admin list */
(() => {
  'use strict';
  if (String(window.__ROYAL_BUILD__ || '') !== '0.6.1') return;
  if (window.__ROYAL_ADMIN_LIST_JUMP_V061__) return;

  const VERSION = '0.6.1-admin-list-jump.1';
  const LIST_SELECTOR = [
    '.royal-admin-list',
    '.royal-admin-journal-list',
    '.royal-admin-participant-ranking-list',
    '.royal-admin-team-ranking-list',
    '.royal-admin-team-members',
    '.royal-admin-team-member-list',
    '.royal-admin-directory-list',
    '.royal-admin-search-results',
    '[class*="royal-admin"][class*="list"]'
  ].join(',');
  const TOP_ANCHOR_SELECTOR = [
    '.royal-admin-toolbar',
    '.royal-admin-participant-ranking-head',
    '.royal-admin-team-ranking-head',
    '.royal-admin-journal-head',
    LIST_SELECTOR
  ].join(',');

  let timer = 0;
  let observer = null;

  function maxScrollY() {
    const root = document.scrollingElement || document.documentElement;
    return Math.max(0, Number(root?.scrollHeight || 0) - Number(window.innerHeight || 0));
  }

  function visible(node) {
    if (!node || !node.isConnected || node.closest?.('[hidden]')) return false;
    const style = window.getComputedStyle?.(node);
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
    const rect = node.getBoundingClientRect?.();
    return !!rect && rect.height > 0 && rect.width > 0;
  }

  function adminListInfo() {
    const panel = document.getElementById('panel');
    if (!panel || panel.hidden || !visible(panel)) return null;
    const lists = [...panel.querySelectorAll(LIST_SELECTOR)].filter(visible);
    if (!lists.length) return null;
    const useful = lists.some(list => {
      const rect = list.getBoundingClientRect();
      const visibleChildren = [...list.children].filter(visible).length;
      return visibleChildren >= 2 && rect.height >= 300;
    });
    if (!useful || maxScrollY() <= 520) return null;
    return { panel, lists };
  }

  function ensureBox() {
    let box = document.querySelector('.royal-list-jump-v0539');
    if (box) return box;
    box = document.createElement('div');
    box.className = 'royal-list-jump-v0539';
    box.setAttribute('aria-label', 'Быстрая навигация по списку');
    box.innerHTML = '<button type="button" data-scroll-edge="top" aria-label="К началу списка" title="К началу списка">↑</button><button type="button" data-scroll-edge="bottom" aria-label="В конец списка" title="В конец списка">↓</button>';
    document.body.appendChild(box);
    return box;
  }

  function update() {
    timer = 0;
    const info = adminListInfo();
    const box = ensureBox();
    if (!info) {
      if (box.dataset.v061AdminJump === '1') {
        delete box.dataset.v061AdminJump;
        try { window.RoyalUX0539?.refreshJumpButtons?.(); } catch (_) {}
      }
      return;
    }

    box.dataset.v061AdminJump = '1';
    box.classList.add('is-visible');
    const y = Number(window.scrollY || document.scrollingElement?.scrollTop || 0);
    const max = maxScrollY();
    const top = box.querySelector('[data-scroll-edge="top"]');
    const bottom = box.querySelector('[data-scroll-edge="bottom"]');
    if (top) top.hidden = y < 220;
    if (bottom) bottom.hidden = y > max - 220;
  }

  function schedule(delay = 20) {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(update, delay);
  }

  function scrollTop() {
    const info = adminListInfo();
    if (!info) return;
    const anchor = info.panel.querySelector(TOP_ANCHOR_SELECTOR) || info.lists[0] || info.panel;
    const top = Math.max(0, Number(anchor.getBoundingClientRect?.().top || 0) + Number(window.scrollY || 0) - 12);
    try { window.scrollTo({ top, behavior:'smooth' }); }
    catch (_) { window.scrollTo(0, top); }
  }

  function scrollBottom() {
    const top = maxScrollY();
    try { window.scrollTo({ top, behavior:'smooth' }); }
    catch (_) { window.scrollTo(0, top); }
  }

  /* Window capture runs before the legacy document handler, so admin arrows get
     one deterministic scroll target while ordinary-mode arrows keep old logic. */
  window.addEventListener('click', event => {
    const button = event.target?.closest?.('.royal-list-jump-v0539 [data-scroll-edge]');
    if (!button || !adminListInfo()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (button.dataset.scrollEdge === 'top') scrollTop();
    else scrollBottom();
    schedule(80);
  }, true);

  window.addEventListener('scroll', update, { passive:true });
  window.addEventListener('resize', () => schedule(30), { passive:true });
  window.addEventListener('pageshow', () => schedule(0));
  window.addEventListener('royal:snapshot-ready', () => schedule(0));

  observer = new MutationObserver(() => schedule(25));
  observer.observe(document.getElementById('panel') || document.body, {
    childList:true,
    subtree:true,
    attributes:true,
    attributeFilter:['hidden','class','style']
  });

  [0, 80, 250, 700].forEach(delay => window.setTimeout(update, delay));
  window.RoyalAdminListJumpV061 = { version:VERSION, refresh:update };
  window.__ROYAL_ADMIN_LIST_JUMP_V061__ = VERSION;
})();
