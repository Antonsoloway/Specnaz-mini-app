/* Royal CRM Mini App v0.6.1 — admin context integrity + admin team photo recovery */
(() => {
  'use strict';
  if (String(window.__ROYAL_BUILD__ || '') !== '0.6.1') return;
  if (window.__ROYAL_ADMIN_CONTEXT_INTEGRITY_V061__) return;

  const VERSION = '0.6.1-admin-context-integrity.1';
  const ADMIN_SURFACE = [
    '.royal-admin-screen',
    '.royal-admin-participant-detail',
    '.royal-admin-team-detail-shell',
    '.royal-admin-participant-ranking-shell',
    '.royal-admin-team-ranking-shell',
    '[data-admin-participant="1"]',
    '[data-admin-team="1"]'
  ].join(',');
  const TEAM_TARGET = [
    '[data-admin-participant-team="1"]',
    '[data-admin-route-team="1"]',
    '[data-admin-ranking-team="1"]',
    '.royal-admin-participant-detail .participant-profile-membership'
  ].join(',');
  let press = null;
  let suppressClickUntil = 0;
  let lastRouteKey = '';
  let lastRouteAt = 0;
  const photoUrls = new WeakMap();

  const clean = value => String(value == null ? '' : value).trim();
  function id(value) {
    const match = clean(value).replace(/\.0$/, '').match(/\d{5,20}/);
    return match ? match[0] : '';
  }
  function game(value) {
    const raw = clean(value);
    const low = raw.toLocaleLowerCase('ru-RU');
    if (low === 'рм' || low.includes('royal match')) return 'Royal Match';
    if (low === 'рк' || low.includes('royal kingdom')) return 'Royal Kingdom';
    return raw;
  }
  function adminVisible(origin=null) {
    return !!origin?.closest?.(ADMIN_SURFACE) || !!document.querySelector(ADMIN_SURFACE);
  }
  function stop(event, prevent=true) {
    if (!event) return;
    if (prevent) event.preventDefault();
    event.stopImmediatePropagation();
  }
  function dedupe(key) {
    const now=Date.now();
    if (lastRouteKey === key && now-lastRouteAt < 420) return true;
    lastRouteKey=key; lastRouteAt=now; return false;
  }
  function teamRef(node) {
    if (!node) return null;
    let name=clean(node.dataset?.teamName);
    let teamGame=game(node.dataset?.teamGame);
    if (!name) name=clean(node.querySelector?.('b')?.textContent);
    if (!teamGame) {
      const meta=clean(node.querySelector?.('small')?.textContent);
      const tail=meta.includes('·') ? meta.split('·').pop() : meta;
      teamGame=game(tail);
    }
    return name ? {name,game:teamGame} : null;
  }
  function openAdminTeam(ref,event) {
    if (!ref?.name || !ref?.game || !window.RoyalAdminTeamDetailV0600?.open) return false;
    const key=`team:${ref.game}:${ref.name}`;
    stop(event);
    if (!dedupe(key)) window.RoyalAdminTeamDetailV0600.open(ref.name,ref.game);
    return true;
  }
  function openAdminParticipant(pid,event) {
    pid=id(pid);
    if (!pid || !window.RoyalAdminParticipantDetailV0600?.open) return false;
    const key=`participant:${pid}`;
    stop(event);
    if (!dedupe(key)) window.RoyalAdminParticipantDetailV0600.open(pid);
    return true;
  }
  function explicitTeamTarget(target) {
    return target?.closest?.(TEAM_TARGET) || null;
  }
  function participantTarget(target) {
    const ranking=target?.closest?.('[data-admin-ranking-participant="1"]');
    if (ranking) return id(ranking.dataset.telegramId);
    const member=target?.closest?.('.royal-admin-team-detail-shell .team-member[data-telegram-id]');
    if (member && !target?.closest?.('a,[data-user-menu],.username-link')) return id(member.dataset.telegramId);
    const summary=target?.closest?.('[data-admin-participant="1"] > summary');
    if (summary && !target?.closest?.('button,a,input,select,textarea')) {
      const record=summary.closest('[data-admin-participant="1"]');
      return id(record?.dataset?.adminParticipantId || record?.dataset?.telegramId);
    }
    return '';
  }
  function route(target,event) {
    if (!target || !adminVisible(target)) return false;
    const teamNode=explicitTeamTarget(target);
    if (teamNode) {
      const ref=teamRef(teamNode);
      if (ref?.name && ref?.game) return openAdminTeam(ref,event);
    }
    const pid=participantTarget(target);
    if (pid) return openAdminParticipant(pid,event);
    return false;
  }

  // Own the physical Android tap at window capture, before ordinary document routers.
  window.addEventListener('pointerdown', event => {
    if (!adminVisible(event.target)) { press=null; return; }
    const teamNode=explicitTeamTarget(event.target);
    const pid=participantTarget(event.target);
    if (!teamNode && !pid) { press=null; return; }
    press={
      pointerId:event.pointerId,
      target:teamNode || event.target,
      x:Number(event.clientX||0), y:Number(event.clientY||0), at:Date.now()
    };
    // Do not preventDefault here: preserve scroll cancellation semantics.
    event.stopImmediatePropagation();
  }, true);

  window.addEventListener('pointerup', event => {
    const saved=press; press=null;
    if (!saved || saved.pointerId !== event.pointerId) return;
    const dx=Number(event.clientX||0)-saved.x;
    const dy=Number(event.clientY||0)-saved.y;
    if ((dx*dx+dy*dy)>196 || Date.now()-saved.at>900) { event.stopImmediatePropagation(); return; }
    if (route(event.target,event) || route(saved.target,event)) suppressClickUntil=Date.now()+750;
  }, true);
  window.addEventListener('pointercancel',()=>{press=null;},true);

  window.addEventListener('click', event => {
    if (Date.now() < suppressClickUntil && adminVisible(event.target)) {
      const teamNode=explicitTeamTarget(event.target);
      const pid=participantTarget(event.target);
      if (teamNode || pid) { stop(event); return; }
    }
    route(event.target,event);
  }, true);

  function patchOrdinaryTeamRouter() {
    const host=window.RoyalTeamDetail;
    const ordinary=host?.open;
    if (typeof ordinary !== 'function' || ordinary.__royalAdminContextProtected) return;
    const guarded=function(name,teamGame,...rest) {
      if (adminVisible() && window.RoyalAdminTeamDetailV0600?.open) {
        const ref={name:clean(name),game:game(teamGame)};
        if (ref.name && ref.game) {
          if (!dedupe(`team:${ref.game}:${ref.name}`)) window.RoyalAdminTeamDetailV0600.open(ref.name,ref.game);
          return true;
        }
      }
      return ordinary.call(this,name,teamGame,...rest);
    };
    guarded.__royalAdminContextProtected=true;
    guarded.__royalOrdinaryOpen=ordinary;
    host.open=guarded;
  }

  async function directAdminTeamPhoto(img) {
    if (!img?.isConnected) return false;
    const name=clean(img.dataset.teamName);
    const teamGame=game(img.dataset.teamGame);
    let token=''; let api='';
    try { token=clean(typeof sessionToken !== 'undefined' ? sessionToken : ''); } catch (_) {}
    try { api=clean(typeof API_URL !== 'undefined' ? API_URL : ''); } catch (_) {}
    if (!name || !teamGame || !token || !api) return false;
    const url=new URL(`${api}/admin-team-photo`);
    url.searchParams.set('team',name); url.searchParams.set('game',teamGame);
    const response=await fetch(url.toString(),{
      method:'GET',mode:'cors',cache:'no-store',headers:{Authorization:`Bearer ${token}`}
    });
    if (!response.ok) throw new Error(`ADMIN_TEAM_PHOTO_HTTP_${response.status}`);
    const blob=await response.blob();
    if (!(blob instanceof Blob) || !blob.size || !String(blob.type||'').startsWith('image/')) throw new Error('ADMIN_TEAM_PHOTO_INVALID');
    const objectUrl=URL.createObjectURL(blob);
    const previous=photoUrls.get(img);
    photoUrls.set(img,objectUrl);
    img.addEventListener('load',()=>{
      img.closest('.team-photo-box')?.classList.remove('photo-error');
      if (previous && previous!==objectUrl) { try{URL.revokeObjectURL(previous);}catch(_){} }
    },{once:true});
    img.src=objectUrl;
    return true;
  }

  function recoverPhoto(img) {
    if (!img?.isConnected || img.dataset.v061AdminIntegrityPhoto === VERSION) return;
    img.dataset.v061AdminIntegrityPhoto=VERSION;
    try { window.RoyalTeamPhotoRefreshV061?.refreshVisible?.(); } catch (_) {}
    try { window.RoyalAdminPersistentMediaV0600?.loadTeam?.(img)?.catch?.(()=>{}); } catch (_) {}
    window.setTimeout(async()=>{
      if (!img.isConnected) return;
      const box=img.closest('.team-photo-box');
      if (Number(img.naturalWidth||0)>0 && !box?.classList.contains('photo-error')) return;
      try { await directAdminTeamPhoto(img); }
      catch (_) {
        try { window.RoyalTeamPhotoRefreshV061?.refreshVisible?.(); } catch (_) {}
      }
    },320);
  }
  function recoverVisiblePhotos(root=document) {
    const images=[];
    if (root?.matches?.('.royal-admin-team-detail-shell img.team-photo[data-admin-media-kind="team"]')) images.push(root);
    root?.querySelectorAll?.('.royal-admin-team-detail-shell img.team-photo[data-admin-media-kind="team"]')?.forEach(img=>images.push(img));
    images.forEach(recoverPhoto);
  }

  let scheduled=0;
  function scheduleIntegrity() {
    if (scheduled) return;
    scheduled=window.setTimeout(()=>{
      scheduled=0;
      patchOrdinaryTeamRouter();
      recoverVisiblePhotos(document);
    },0);
  }
  const observer=new MutationObserver(records=>{
    for (const record of records) {
      for (const node of record.addedNodes||[]) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.(ADMIN_SURFACE) || node.querySelector?.(ADMIN_SURFACE) ||
            node.matches?.('.team-photo,[data-admin-participant-team="1"],[data-admin-route-team="1"]') ||
            node.querySelector?.('.team-photo,[data-admin-participant-team="1"],[data-admin-route-team="1"]')) {
          scheduleIntegrity(); return;
        }
      }
    }
  });
  observer.observe(document.body,{childList:true,subtree:true});
  [0,120,450,1200,2500].forEach(delay=>window.setTimeout(scheduleIntegrity,delay));
  window.addEventListener('pageshow',scheduleIntegrity);

  window.__ROYAL_ADMIN_CONTEXT_INTEGRITY_V061__={version:VERSION,recoverPhotos:()=>recoverVisiblePhotos(document)};
})();
