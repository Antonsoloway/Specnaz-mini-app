/* Royal CRM Mini App — v0.6.1 participant identity consistency
 * Visible participant identity everywhere:
 *   CRM name -> @Telegram username (when available) -> Telegram display name.
 * Raw Telegram ID remains technical-only outside admin detail.
 */
(() => {
  'use strict';

  const VERSION = '0.6.1-participant-identity.1';
  if (String(window.__ROYAL_BUILD__ || '') !== '0.6.1') return;

  const clean = value => String(value == null ? '' : value).trim();
  const cleanId = value => {
    const match = clean(value).replace(/\.0$/, '').match(/^\d{5,20}$/);
    return match ? match[0] : '';
  };
  const username = value => clean(value).replace(/^@+/, '');

  let scheduled = 0;
  let decorating = false;

  function publicParticipants() {
    try { return Array.isArray(snapshotState?.participants) ? snapshotState.participants : []; }
    catch (_) { return []; }
  }

  function adminParticipants() {
    try {
      const current = window.RoyalAdminDataV0600?.current;
      return Array.isArray(current?.adminData?.participants) ? current.adminData.participants : [];
    } catch (_) { return []; }
  }

  function participantId(root) {
    if (!root) return '';
    return cleanId(
      root.dataset?.adminParticipantId ||
      root.dataset?.participantTelegramId ||
      root.dataset?.profileTelegramId ||
      root.dataset?.directoryTelegramId ||
      root.dataset?.telegramId ||
      root.querySelector?.('[data-telegram-id]')?.dataset?.telegramId ||
      ''
    );
  }

  function mergedParticipant(id) {
    const wanted = cleanId(id);
    if (!wanted) return null;
    const pub = publicParticipants().find(p => cleanId(p?.telegramId) === wanted) || null;
    const adm = adminParticipants().find(p => cleanId(p?.telegramId) === wanted) || null;
    if (!pub && !adm) return null;
    const merged = { ...(adm || {}), ...(pub || {}), telegramId:wanted };
    if (!clean(merged.name)) merged.name = clean(adm?.name || pub?.name);
    if (!clean(merged.telegramName)) merged.telegramName = clean(adm?.telegramName || pub?.telegramName);
    if (!clean(merged.username)) merged.username = clean(adm?.username || pub?.username);
    return merged;
  }

  function displayName(p) {
    return clean(p?.name || p?.telegramName || p?.username || 'Без имени');
  }

  function titleAnchor(title) {
    return title?.closest?.('.participant-name-achievements-row,.participant-detail-name-row') || title || null;
  }

  function placeAfter(anchor, nodes) {
    if (!anchor?.parentNode) return;
    let cursor = anchor;
    nodes.filter(Boolean).forEach(node => {
      if (node.parentNode !== anchor.parentNode || node.previousSibling !== cursor) {
        cursor.parentNode.insertBefore(node, cursor.nextSibling);
      }
      cursor = node;
    });
  }

  function ensureUsername(container, p, variant='normal') {
    const value = username(p?.username);
    let node = container?.querySelector?.(':scope > [data-user-menu],:scope > .self-username,:scope > .hero-user,:scope > .username-link');
    if (!value) {
      if (node?.dataset?.royalIdentityOwned === '1') node.remove();
      return null;
    }

    // If a contact fallback was inserted before username data became available,
    // remove it: a real @username is the preferred Telegram link.
    container?.querySelectorAll?.(':scope > [data-contact-telegram-id]').forEach(item => item.remove());

    if (!node) {
      node = document.createElement('button');
      node.type = 'button';
      node.dataset.royalIdentityOwned = '1';
      container.appendChild(node);
    }
    if (node.tagName !== 'BUTTON') {
      node.setAttribute('role', 'button');
      node.setAttribute('tabindex', '0');
    } else {
      node.type = 'button';
    }
    node.dataset.userMenu = value;
    node.dataset.userName = displayName(p);
    node.textContent = `@${value}`;
    node.classList.add('royal-participant-username-v061');
    if (variant === 'hero') node.classList.add('hero-user');
    else if (variant === 'self') node.classList.add('self-username', 'username-link');
    else node.classList.add('username-link');
    return node;
  }

  function ensureTelegramName(container, p) {
    const value = clean(p?.telegramName);
    let node = container?.querySelector?.(':scope > .royal-participant-telegram-name-v061,:scope > .telegram-name');
    if (!value) {
      if (node?.dataset?.royalIdentityOwned === '1') node.remove();
      return null;
    }
    if (!node) {
      node = document.createElement('div');
      node.dataset.royalIdentityOwned = '1';
      container.appendChild(node);
    }
    node.classList.add('telegram-name', 'royal-participant-telegram-name-v061');
    node.textContent = value;
    node.title = `Имя Telegram: ${value}`;
    return node;
  }

  function decorateIdentityRoot(root, config={}) {
    const pid = participantId(root);
    const p = mergedParticipant(pid);
    if (!p) return;

    const container = root.querySelector(config.container || '.person-main,.team-member-main,.hero-main,.participant-detail-identity,.self-profile-identity,.directory-person-head,.history-person');
    if (!container) return;
    const title = container.querySelector(config.title || '.person-title,:scope > strong,:scope > h2,.participant-name-achievements-row .person-title,.participant-name-achievements-row > strong,.participant-detail-name-row > h2');
    const crmName = clean(p?.name);
    if (title && crmName) title.textContent = crmName;

    const variant = root.matches('.hero-card') ? 'hero' : root.matches('.self-profile-card') ? 'self' : 'normal';
    const user = ensureUsername(container, p, variant);
    const tgName = ensureTelegramName(container, p);
    const anchor = titleAnchor(title);
    if (anchor) placeAfter(anchor, [user, tgName]);

    root.dataset.royalIdentityParticipant = pid;
  }

  function decorateAdminSummary(record) {
    if (!record?.matches?.('details[data-admin-participant="1"]')) return;
    const pid = participantId(record);
    const p = mergedParticipant(pid);
    const main = record.querySelector('summary .royal-admin-summary-main');
    const strong = main?.querySelector('strong');
    const small = main?.querySelector('small');
    if (!p || !main || !strong || !small) return;

    if (clean(p?.name)) strong.textContent = clean(p.name);
    small.classList.add('royal-admin-participant-list-meta');

    const userValue = username(p?.username);
    let user = small.querySelector('.royal-admin-participant-list-user');
    if (userValue) {
      if (!user || user.tagName !== 'BUTTON') {
        const replacement = document.createElement('button');
        replacement.type = 'button';
        replacement.className = 'royal-admin-participant-list-user royal-participant-username-v061';
        if (user) user.replaceWith(replacement); else small.prepend(replacement);
        user = replacement;
      }
      user.dataset.userMenu = userValue;
      user.dataset.userName = displayName(p);
      user.textContent = `@${userValue}`;
    } else if (user) {
      user.remove();
    }

    let tgName = small.querySelector('.royal-admin-participant-list-tgname-v061');
    const tgValue = clean(p?.telegramName);
    if (tgValue) {
      if (!tgName) {
        tgName = document.createElement('span');
        tgName.className = 'royal-admin-participant-list-tgname-v061';
        const teams = small.querySelector('.royal-admin-participant-list-teams');
        small.insertBefore(tgName, teams || null);
      }
      tgName.textContent = tgValue;
      tgName.title = `Имя Telegram: ${tgValue}`;
    } else if (tgName) {
      tgName.remove();
    }
  }

  function decorateRankingRow(row) {
    const pid = participantId(row);
    const p = mergedParticipant(pid);
    const main = row?.querySelector?.('.royal-admin-participant-ranking-main');
    const strong = main?.querySelector?.('strong');
    if (!p || !main || !strong) return;
    if (clean(p?.name)) strong.textContent = clean(p.name);

    let identity = main.querySelector('.royal-admin-ranking-identity-v061');
    if (!identity) {
      identity = document.createElement('span');
      identity.className = 'royal-admin-ranking-identity-v061';
      strong.insertAdjacentElement('afterend', identity);
    }
    const bits = [];
    const u = username(p?.username);
    if (u) bits.push(`@${u}`);
    const tgName = clean(p?.telegramName);
    if (tgName) bits.push(tgName);
    identity.textContent = bits.join(' · ');
    identity.hidden = !bits.length;
  }

  function decorateVisible() {
    if (decorating) return;
    decorating = true;
    try {
      document.querySelectorAll('.person-card').forEach(root => decorateIdentityRoot(root, { container:'.person-main', title:'.person-title' }));
      document.querySelectorAll('.team-member').forEach(root => decorateIdentityRoot(root, { container:'.team-member-main', title:'.participant-name-achievements-row > strong,:scope > strong' }));
      document.querySelectorAll('.hero-card').forEach(root => decorateIdentityRoot(root, { container:'.hero-main', title:'.participant-name-achievements-row > strong,:scope > strong' }));
      document.querySelectorAll('.history-row').forEach(root => decorateIdentityRoot(root, { container:'.history-person', title:':scope > strong' }));
      document.querySelectorAll('.participant-detail-card').forEach(root => decorateIdentityRoot(root, { container:'.participant-detail-identity', title:'.participant-detail-name-row > h2,:scope > h2' }));
      document.querySelectorAll('.self-profile-card').forEach(root => decorateIdentityRoot(root, { container:'.self-profile-identity', title:':scope > h2' }));
      document.querySelectorAll('.directory-person-card:not(.directory-person-card--external)').forEach(root => decorateIdentityRoot(root, { container:'.directory-person-head', title:'.participant-name-achievements-row > strong,:scope > strong' }));
      document.querySelectorAll('details[data-admin-participant="1"]').forEach(decorateAdminSummary);
      document.querySelectorAll('[data-admin-ranking-participant="1"]').forEach(decorateRankingRow);
    } finally {
      decorating = false;
    }
  }

  function schedule(delay=0) {
    if (scheduled) return;
    scheduled = window.setTimeout(() => {
      scheduled = 0;
      decorateVisible();
    }, delay);
  }

  function installCss() {
    if (document.querySelector('style[data-participant-identity-v061="1"]')) return;
    const style = document.createElement('style');
    style.dataset.participantIdentityV061 = '1';
    style.textContent = `
      .royal-participant-username-v061{display:inline-flex!important;align-items:center;width:max-content;max-width:100%;margin:2px 0 0;padding:0;border:0;background:transparent;color:#55a9e8;font:800 16px/1.25 inherit;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;touch-action:manipulation}
      .royal-participant-telegram-name-v061{display:block;max-width:100%;margin-top:2px;color:#8fa3b1;font-size:14px;line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .person-main,.team-member-main,.hero-main,.participant-detail-identity,.self-profile-identity,.directory-person-head,.history-person{min-width:0}
      .person-main>.participant-name-achievements-row,.team-member-main>.participant-name-achievements-row,.hero-main>.participant-name-achievements-row{align-items:flex-start}
      .person-main>.participant-name-achievements-row>.person-title,.team-member-main>.participant-name-achievements-row>strong,.hero-main>.participant-name-achievements-row>strong{white-space:normal!important;overflow:visible!important;text-overflow:clip!important;overflow-wrap:anywhere;line-height:1.08}
      .royal-admin-participant-list-user{appearance:none;-webkit-appearance:none;padding:0;border:0;background:transparent;text-align:left}
      .royal-admin-participant-list-tgname-v061{color:#8fa3b1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .royal-admin-ranking-identity-v061{display:block;color:#5aa8dd;font-size:11px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      @media(max-width:430px){
        .participant-achievements-row{max-width:48%!important}
        .royal-participant-username-v061{font-size:15px}
        .royal-participant-telegram-name-v061{font-size:13px}
      }
    `;
    document.head.appendChild(style);
  }

  installCss();
  decorateVisible();
  schedule(80);
  schedule(600);

  if ('MutationObserver' in window) {
    const observer = new MutationObserver(() => schedule(0));
    observer.observe(document.body, { childList:true, subtree:true });
  }

  try {
    window.RoyalAdminDataV0600?.subscribe?.(() => schedule(0));
  } catch (_) {}

  document.addEventListener('click', event => {
    const user = event.target?.closest?.('.royal-participant-username-v061[data-user-menu]');
    if (!user || user.tagName === 'BUTTON') return;
    try {
      event.preventDefault();
      event.stopPropagation();
      if (typeof openUserMenu === 'function') openUserMenu(user.dataset.userMenu, user.dataset.userName || user.textContent);
    } catch (_) {}
  }, true);

  window.RoyalParticipantIdentityV061 = { version:VERSION, decorate:decorateVisible };
  window.__ROYAL_PARTICIPANT_IDENTITY_V061__ = VERSION;
})();
