/* Royal CRM Mini App — v0.6.1 participant identity consistency v2
 * Visible identity everywhere: CRM name, clickable @username when present,
 * Telegram display name. Raw Telegram ID stays technical-only outside admin.
 * Event-driven only: no global MutationObserver.
 */
(() => {
  'use strict';
  const VERSION = '0.6.1-participant-identity.2';
  if (String(window.__ROYAL_BUILD__ || '') !== '0.6.1') return;

  const clean = value => String(value == null ? '' : value).trim();
  const cleanId = value => /^\d{5,20}$/.test(clean(value).replace(/\.0$/, '')) ? clean(value).replace(/\.0$/, '') : '';
  const cleanUsername = value => clean(value).replace(/^@+/, '');
  let scheduled = 0;
  let decorating = false;

  function publicParticipants(){
    try { return Array.isArray(snapshotState?.participants) ? snapshotState.participants : []; }
    catch (_) { return []; }
  }
  function adminParticipants(){
    try {
      const current = window.RoyalAdminDataV0600?.current;
      return Array.isArray(current?.adminData?.participants) ? current.adminData.participants : [];
    } catch (_) { return []; }
  }
  function rootId(root){
    return cleanId(
      root?.dataset?.adminParticipantId || root?.dataset?.participantTelegramId ||
      root?.dataset?.profileTelegramId || root?.dataset?.directoryTelegramId ||
      root?.dataset?.telegramId || root?.querySelector?.('[data-telegram-id]')?.dataset?.telegramId || ''
    );
  }
  function participant(id){
    const wanted = cleanId(id);
    if (!wanted) return null;
    const pub = publicParticipants().find(p => cleanId(p?.telegramId) === wanted) || null;
    const adm = adminParticipants().find(p => cleanId(p?.telegramId) === wanted) || null;
    if (!pub && !adm) return null;
    return {
      ...(adm || {}), ...(pub || {}), telegramId:wanted,
      name:clean(pub?.name || adm?.name),
      telegramName:clean(pub?.telegramName || adm?.telegramName),
      username:clean(pub?.username || adm?.username)
    };
  }
  function visibleName(p){ return clean(p?.name || p?.telegramName || p?.username || 'Без имени'); }

  function setText(node, value){
    const next = String(value == null ? '' : value);
    if (node && node.textContent !== next) node.textContent = next;
  }
  function after(anchor, nodes){
    if (!anchor?.parentNode) return;
    let cursor = anchor;
    nodes.filter(Boolean).forEach(node => {
      if (node.parentNode !== cursor.parentNode || node.previousSibling !== cursor) {
        cursor.parentNode.insertBefore(node, cursor.nextSibling);
      }
      cursor = node;
    });
  }
  function nameAnchor(title){ return title?.closest?.('.participant-name-achievements-row,.participant-detail-name-row') || title; }

  function ensureUsername(container, p, variant){
    const value = cleanUsername(p?.username);
    let node = container?.querySelector?.(':scope > [data-user-menu],:scope > .self-username,:scope > .hero-user,:scope > .username-link');
    if (!value) {
      if (node?.dataset?.royalIdentityOwned === '1') node.remove();
      return null;
    }
    container?.querySelectorAll?.(':scope > [data-contact-telegram-id]').forEach(item => item.remove());
    if (!node) {
      node = document.createElement('button');
      node.type = 'button';
      node.dataset.royalIdentityOwned = '1';
      container.appendChild(node);
    }
    if (node.tagName === 'BUTTON') node.type = 'button';
    else { node.setAttribute('role','button'); node.setAttribute('tabindex','0'); }
    if (node.dataset.userMenu !== value) node.dataset.userMenu = value;
    const display = visibleName(p);
    if (node.dataset.userName !== display) node.dataset.userName = display;
    setText(node, `@${value}`);
    node.classList.add('royal-participant-username-v061');
    if (variant === 'hero') node.classList.add('hero-user');
    else if (variant === 'self') node.classList.add('self-username','username-link');
    else node.classList.add('username-link');
    return node;
  }

  function ensureTelegramName(container, p){
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
    node.classList.add('telegram-name','royal-participant-telegram-name-v061');
    setText(node, value);
    if (node.title !== `Имя Telegram: ${value}`) node.title = `Имя Telegram: ${value}`;
    return node;
  }

  function decorateRoot(root, containerSelector, titleSelector){
    const p = participant(rootId(root));
    const container = root?.querySelector?.(containerSelector);
    if (!p || !container) return;
    const title = container.querySelector(titleSelector);
    if (title && clean(p.name)) setText(title, p.name);
    const variant = root.matches('.hero-card') ? 'hero' : root.matches('.self-profile-card') ? 'self' : 'normal';
    const user = ensureUsername(container,p,variant);
    const tgName = ensureTelegramName(container,p);
    const anchor = nameAnchor(title);
    if (anchor) after(anchor,[user,tgName]);
  }

  function decorateAdminSummary(record){
    if (!record?.matches?.('details[data-admin-participant="1"]')) return;
    const p = participant(rootId(record));
    const main = record.querySelector('summary .royal-admin-summary-main');
    const strong = main?.querySelector('strong');
    const small = main?.querySelector('small');
    if (!p || !strong || !small) return;
    if (clean(p.name)) setText(strong,p.name);
    small.classList.add('royal-admin-participant-list-meta');

    const u = cleanUsername(p.username);
    let user = small.querySelector('.royal-admin-participant-list-user');
    if (u) {
      if (!user || user.tagName !== 'BUTTON') {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'royal-admin-participant-list-user royal-participant-username-v061';
        if (user) user.replaceWith(button); else small.prepend(button);
        user = button;
      }
      if (user.dataset.userMenu !== u) user.dataset.userMenu = u;
      if (user.dataset.userName !== visibleName(p)) user.dataset.userName = visibleName(p);
      setText(user,`@${u}`);
    } else if (user) user.remove();

    let tg = small.querySelector('.royal-admin-participant-list-tgname-v061');
    if (clean(p.telegramName)) {
      if (!tg) {
        tg = document.createElement('span');
        tg.className = 'royal-admin-participant-list-tgname-v061';
        small.insertBefore(tg,small.querySelector('.royal-admin-participant-list-teams') || null);
      }
      setText(tg,p.telegramName);
    } else if (tg) tg.remove();
  }

  function decorateAdminRanking(row){
    const p = participant(rootId(row));
    const main = row?.querySelector?.('.royal-admin-participant-ranking-main');
    const strong = main?.querySelector?.('strong');
    if (!p || !main || !strong) return;
    if (clean(p.name)) setText(strong,p.name);
    let meta = main.querySelector('.royal-admin-ranking-identity-v061');
    if (!meta) {
      meta = document.createElement('span');
      meta.className = 'royal-admin-ranking-identity-v061';
      strong.insertAdjacentElement('afterend',meta);
    }
    const bits = [];
    const u = cleanUsername(p.username); if (u) bits.push(`@${u}`);
    if (clean(p.telegramName)) bits.push(p.telegramName);
    setText(meta,bits.join(' · '));
    meta.hidden = !bits.length;
  }

  function decorateVisible(){
    if (decorating) return;
    decorating = true;
    try {
      document.querySelectorAll('.person-card').forEach(r=>decorateRoot(r,'.person-main','.person-title'));
      document.querySelectorAll('.team-member').forEach(r=>decorateRoot(r,'.team-member-main','.participant-name-achievements-row > strong,:scope > strong'));
      document.querySelectorAll('.hero-card').forEach(r=>decorateRoot(r,'.hero-main','.participant-name-achievements-row > strong,:scope > strong'));
      document.querySelectorAll('.history-row').forEach(r=>decorateRoot(r,'.history-person',':scope > strong'));
      document.querySelectorAll('.participant-detail-card').forEach(r=>decorateRoot(r,'.participant-detail-identity','.participant-detail-name-row > h2,:scope > h2'));
      document.querySelectorAll('.self-profile-card').forEach(r=>decorateRoot(r,'.self-profile-identity',':scope > h2'));
      document.querySelectorAll('.directory-person-card:not(.directory-person-card--external)').forEach(r=>decorateRoot(r,'.directory-person-head','.participant-name-achievements-row > strong,:scope > strong'));
      document.querySelectorAll('details[data-admin-participant="1"]').forEach(decorateAdminSummary);
      document.querySelectorAll('[data-admin-ranking-participant="1"]').forEach(decorateAdminRanking);
    } finally { decorating = false; }
  }

  function schedule(delay=0){
    if (scheduled) return;
    scheduled = window.setTimeout(()=>{ scheduled=0; decorateVisible(); },delay);
  }

  function installCss(){
    if (document.querySelector('style[data-participant-identity-v061="2"]')) return;
    const style=document.createElement('style');
    style.dataset.participantIdentityV061='2';
    style.textContent=`
      .royal-participant-username-v061{display:inline-flex!important;align-items:center;width:max-content;max-width:100%;margin:2px 0 0;padding:0;border:0;background:transparent;color:#55a9e8;font:800 16px/1.25 inherit;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;touch-action:manipulation}
      .royal-participant-telegram-name-v061{display:block;max-width:100%;margin-top:2px;color:#8fa3b1;font-size:14px;line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .person-main,.team-member-main,.hero-main,.participant-detail-identity,.self-profile-identity,.directory-person-head,.history-person{min-width:0}
      .person-main>.participant-name-achievements-row,.team-member-main>.participant-name-achievements-row,.hero-main>.participant-name-achievements-row{align-items:flex-start}
      .person-main>.participant-name-achievements-row>.person-title,.team-member-main>.participant-name-achievements-row>strong,.hero-main>.participant-name-achievements-row>strong{white-space:normal!important;overflow:visible!important;text-overflow:clip!important;overflow-wrap:anywhere;line-height:1.08}
      .royal-admin-participant-list-user{appearance:none;-webkit-appearance:none;padding:0;border:0;background:transparent;text-align:left}
      .royal-admin-participant-list-tgname-v061{color:#8fa3b1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .royal-admin-ranking-identity-v061{display:block;color:#5aa8dd;font-size:11px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      @media(max-width:430px){.participant-achievements-row{max-width:48%!important}.royal-participant-username-v061{font-size:15px}.royal-participant-telegram-name-v061{font-size:13px}}
    `;
    document.head.appendChild(style);
  }

  installCss();
  [0,80,500,1500,3000].forEach(schedule);
  document.addEventListener('pointerup',()=>schedule(0),true);
  document.addEventListener('click',()=>schedule(0),true);
  document.addEventListener('input',()=>schedule(0),true);
  window.addEventListener('royal:snapshot-ready',()=>schedule(0));
  window.addEventListener('royal:auth-ready',()=>schedule(0));
  window.addEventListener('focus',()=>schedule(0));
  document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible') schedule(0); });
  try { window.RoyalAdminDataV0600?.subscribe?.(()=>schedule(0)); } catch (_) {}

  document.addEventListener('click',event=>{
    const user=event.target?.closest?.('.royal-participant-username-v061[data-user-menu]');
    if (!user || user.tagName==='BUTTON') return;
    try {
      event.preventDefault(); event.stopPropagation();
      if (typeof openUserMenu==='function') openUserMenu(user.dataset.userMenu,user.dataset.userName||user.textContent);
    } catch (_) {}
  },true);

  window.RoyalParticipantIdentityV061={version:VERSION,decorate:decorateVisible};
  window.__ROYAL_PARTICIPANT_IDENTITY_V061__=VERSION;
})();
