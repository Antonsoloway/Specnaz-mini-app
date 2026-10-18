/* Exact zero-based Royal Match catalogue; all game reads use existing CRM gates. */
(() => {
  'use strict';
  const API=typeof API_URL==='undefined'?'https://royal-crm-miniapp-api.tropical-spoon.workers.dev':API_URL;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const session=()=>typeof sessionToken==='undefined'?'':sessionToken;
  const valid=v=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<176;
  const logoOf=t=>t?.TeamLogo??t?.Logo??t?.teamLogo??t?.logo;
  // Zero-based owner-supplied catalogue. Symbols without an exact Unicode
  // equivalent use a nearby pictogram; colour variants usually share an emoji.
  const EMOJI=["⚜️","⚜️","👑","👑","🌴","🌴","🍸","🍸","🦋","🦋","🐿️","🐿️","🐙","🐙","🎯","🎯","🔥","🔥","🥸","🥸","♣️","♣️","⚡","⚡","🚀","🚀","✈️","✈️","🏀","🏀","⭐","⭐","🌵","🌵","🔔","🔔","☂️","☂️","🎂","🎂","🎠","🎠","💣","💣","🍦","🍦","🦴","🦴","☀️","☀️","🧭","🧭","🚢","🚢","💥","💥","🍀","🍀","🌙","🌙","🐷","🐷","🤠","🤠","🏹","🏹","⭐","⭐","🎵","🎵","🎓","🎓","♠️","♠️","🧙","🧙","🤍","❤️","🐈","🐈","⚗️","⚗️","🖌️","🖌️","🧩","🧩","👨‍🍳","👨‍🍳","🎧","🎧","⚓","⚓","🐕","🐕","🎮","🎮","🍦","🍦","🔱","🔱","💰","💰","⛵","⛵","🐬","🐬","🍎","🍏","🐾","🐾","⚔️","⚔️","💀","💀","🏈","🏈","🌼","🌼","🥊","🥊","🇺🇸","🇨🇦","🇬🇧","🇯🇵","🇸🇪","🇬🇧","🇨🇭","🇵🇹","🇳🇱","🇮🇹","🇩🇪","🇫🇷","🇩🇰","🇪🇸","🇰🇷","🇫🇮","🇷🇺","🇧🇪","🇳🇴","🇮🇪","🇲🇽","🇮🇳","🇨🇳","🇧🇷","🇻🇪","🇿🇦","🇭🇰","🇺🇾","🇹🇼","🇺🇦","🇷🇴","🇹🇷","🇵🇱","🇹🇭","🇵🇭","🇦🇹","🇦🇺","🇦🇷","🇨🇴","🇬🇷","🇮🇩","🇨🇿","🇭🇺","🇨🇱","🇭🇷","🇸🇬","🇵🇪","🇮🇱","🇧🇬","🇦🇪","🇳🇬","🇲🇾","🇪🇬","🇻🇳","🇶🇦","🇰🇼"];
  EMOJI[125]='\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}'; // England, distinct from UK at122.
  const emoji=logo=>valid(logo)?EMOJI[logo]:'';
  const hasEmojiPrefix=text=>/^[\p{Extended_Pictographic}\p{Regional_Indicator}♠♣]/u.test(String(text||'').trim());
  function emojiName(text,logo){const name=String(text||'').trim(),prefix=emoji(logo);if(hasEmojiPrefix(name))return name.replace(/^((?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|[\uFE0E\uFE0F\u200D\u{E0020}-\u{E007F}])+)\s+/u,'$1');return prefix&&name?prefix+name:name;}
  const PREFIX=/^\s*(?:(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|[\uFE0E\uFE0F\u200D\u{E0020}-\u{E007F}])+\s*)+/u;
  // Keep original textContent/CRM identity intact. Only the visual prefix is hidden,
  // and only while a corresponding image has actually loaded successfully.
  function label(text){const raw=String(text??''),prefix=raw.match(PREFIX)?.[0];return prefix&&raw.slice(prefix.length).trim()?'<span class="rm-team-emoji-prefix">'+esc(prefix)+'</span>'+esc(raw.slice(prefix.length)):esc(raw);}
  function wrapPrefix(node,game='Royal Match'){
    const prefixClass=game==='Royal Kingdom'?'rk-team-emoji-prefix':'rm-team-emoji-prefix';
    if(node.querySelector('.'+prefixClass))return;
    const first=n=>{for(const child of n.childNodes){if(child.nodeType===3&&child.textContent.trim())return child;if(child.nodeType===1&&!child.matches('.rm-team-emblem,.rk-team-emblem')){const found=first(child);if(found)return found;}}};
    const text=first(node),prefix=text?.textContent.match(game==='Royal Kingdom'?/^\s*(?:(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|[♞\uFE0E\uFE0F\u200D\u{E0020}-\u{E007F}])+\s*)+/u:PREFIX)?.[0];if(!prefix||!text.textContent.slice(prefix.length).trim())return;
    const span=document.createElement('span');span.className=prefixClass;span.textContent=prefix;text.splitText(prefix.length);text.replaceWith(span);
  }
  function loaded(img){if(img?.matches?.('.rm-team-emblem')&&img.complete&&img.naturalWidth>0){img.hidden=false;img.dataset.rmLoaded='1';}}
  document.addEventListener('load',event=>loaded(event.target),true);
  document.addEventListener('error',event=>{const img=event.target;if(img?.matches?.('.rm-team-emblem')){delete img.dataset.rmLoaded;img.hidden=true;}},true);
  const logos=new Map(),cache=new Map(),pending=new Map(),queue=[];
  let queued=new WeakSet();
  let active=0,generation=0,scheduled=false,permitted=true,lastSession=session();
  const gameApi=game=>game==='Royal Kingdom'?window.RoyalKingdomEmblems:game==='Royal Match'?{valid,image}:null;
  const logoKey=(id,game)=>game==='Royal Kingdom'?'rk:'+id:id;
  function remember(id,logo,game='Royal Match'){const api=gameApi(game),key=logoKey(id,game);if(typeof id!=='string'||!api?.valid(logo))return;if(logos.size>=250&&!logos.has(key))logos.delete(logos.keys().next().value);logos.set(key,logo);schedule();}
  function image(logo){return valid(logo)?'<img class="rm-team-emblem" src="assets/rm-emblems/'+logo+'.webp?v=20261015-emblem-repair1" width="32" height="34" alt="" aria-hidden="true" loading="lazy" decoding="async" data-rm-logo="'+logo+'">':'';}
  function name(text,id,logo){if(valid(logo))remember(id,logo);return '<span class="rm-team-name"'+(typeof id==='string'?' data-rm-team-id="'+esc(id)+'"':'')+'>'+image(valid(logo)?logo:logos.get(id))+label(text)+'</span>';}
  async function fetchLive(record,admin=false,refresh=false,metadataOnly=false){
    const token=session(),epoch=generation;if(!permitted||!token)throw Error('SESSION_MISSING');
    const game=record.game||'Royal Match';if(!['Royal Match','Royal Kingdom'].includes(game))throw Error('INVALID_GAME');
    const key=JSON.stringify([token,admin,game,record.name,record.gameTeamId]);const old=cache.get(key);
    if(metadataOnly&&!refresh&&old&&Date.now()-old.at<60000){if(old.error)throw Error('UNAVAILABLE');return old.payload;}
    if(pending.has(key))return pending.get(key);
    // Bound the entire read, including response.json and retry delay. Aborting a
    // fetch alone does not settle a response body or a signal-ignoring wrapper.
    const controller=new AbortController();let timer;
    const timeout=()=>Object.assign(Error('TEAM_LIVE_TIMEOUT'),{code:'TEAM_LIVE_TIMEOUT'});
    const current=()=>{if(controller.signal.aborted)throw timeout();if(token!==session()||epoch!==generation||!permitted)throw Error('STALE');};
    const request=(async()=>{
      for(let attempt=0;attempt<2;attempt++){
        try{
          current();
          const params=new URLSearchParams({team:record.name,game,...(refresh?{refresh:'1'}:{})});
          const r=await fetch(API+(admin?'/admin-team-live?':'/team-live?')+params,{headers:{Authorization:'Bearer '+token},signal:controller.signal});
          current();
          if(r.status===401||r.status===403){clear(false);throw Object.assign(Error('Откройте приложение заново.'),{denied:true});}
          const payload=await r.json();current();
          if(!r.ok)throw Object.assign(Error('Данные игры не загрузились.'),{busy:r.status===429&&payload.error==='TEAM_LIVE_BUSY',transient:[408,425,429,502,503,504].includes(r.status)&&payload.error!=='TEAM_LIVE_BUSY'});
          if(!payload.ok)throw Error('Данные игры не загрузились.');
          if(payload.data?.teamId!==record.gameTeamId||(payload.data.game??'Royal Match')!==game)throw Error('Привязка команды изменилась. Обновите карточку.');
          return payload;
        }catch(e){
          const transient=e.transient||e.name==='TypeError'||e.code==='WORKER_TIMEOUT'||e.message==='WORKER_TIMEOUT';
          if(attempt===0&&transient&&!controller.signal.aborted&&epoch===generation&&token===session()&&permitted){await new Promise(r=>setTimeout(r,500));current();continue;}
          throw e;
        }
      }
    })();
    const task=Promise.race([request,new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(timeout());},45000);})]).then(payload=>{
      current();if(cache.size>=250&&!cache.has(key))cache.delete(cache.keys().next().value);
      cache.set(key,{at:Date.now(),payload});remember(record.gameTeamId,logoOf(payload.data),game);return payload;
    }).catch(e=>{if(epoch===generation&&token===session()&&permitted)cache.set(key,{at:Date.now(),error:true});throw e;}).finally(()=>clearTimeout(timer));
    pending.set(key,task);try{return await task;}finally{if(pending.get(key)===task)pending.delete(key);}
  }

  function records(admin){try{return admin?(window.RoyalAdminDataV0600?.current?.adminData?.teams||[]):(typeof snapshotState==='undefined'?[]:snapshotState?.teams||[]);}catch{return [];}}
  function find(ref,admin){const matches=records(admin).filter(t=>t.name===ref.name&&(!ref.game||t.game===ref.game));return matches.length===1&&gameApi(matches[0].game)&&matches[0].gameTeamId?matches[0]:null;}
  function insert(node,logo,game='Royal Match'){
    const api=gameApi(game);if(!api?.valid(logo)||!node?.isConnected)return;
    wrapPrefix(node,game);const old=node.querySelector(':scope > .rm-team-emblem,:scope > .rk-team-emblem');
    const rk=game==='Royal Kingdom';if(old?.dataset[rk?'rkLogo':'rmLogo']===String(logo)){loaded(old);return;}old?.remove();
    node.insertAdjacentHTML('afterbegin',api.image(logo));node.classList.add(rk?'rk-team-name':'rm-team-name');loaded(node.querySelector(':scope > .rm-team-emblem'));
  }
  function pump(){while(active<2&&queue.length){const job=queue.shift();if(!job.node.isConnected||job.epoch!==generation){queued.delete(job.node);continue;}active++;
    fetchLive(job.record,job.admin,false,true).then(p=>{if(job.epoch===generation&&job.node.isConnected){const current=find({name:job.record.name,game:job.record.game},job.admin);if(current?.gameTeamId===job.record.gameTeamId&&job.node.dataset.rmCrmId===job.record.gameTeamId&&job.node.dataset.rmCrmGame===job.record.game&&job.node.dataset.rmCrmName===job.record.name)insert(job.node,logoOf(p.data),job.record.game);else schedule();}}).catch(()=>{}).finally(()=>{queued.delete(job.node);active--;pump();});}}
  const observer=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){observer.unobserve(e.target);const job=observed.get(e.target);if(job){queue.push(job);pump();}}},{rootMargin:'80px'});
  const observed=new WeakMap();
  function attach(node,record,admin){
    const game=record.game;
    if(node?.dataset.rmCrmId&&(node.dataset.rmCrmId!==record.gameTeamId||node.dataset.rmCrmGame!==game))node.querySelector(':scope > .rm-team-emblem,:scope > .rk-team-emblem')?.remove();
    if(node){node.dataset.rmCrmId=record.gameTeamId;node.dataset.rmCrmGame=game;node.dataset.rmCrmName=record.name;node.dataset.rmCrmAdmin=admin?'1':'0';}
    if(!node||node.hidden||node.closest('[hidden]'))return;const logo=logos.get(logoKey(record.gameTeamId,game));
    if(gameApi(game)?.valid(logo)){insert(node,logo,game);return;}if(queued.has(node))return;
    queued.add(node);const job={node,record,admin,epoch:generation};observed.set(node,job);if(observer)observer.observe(node);else{queue.push(job);pump();}
  }
  function decorate(){
    if(lastSession!==session()){clear(true);lastSession=session();}if(!permitted||!session())return;
    document.querySelectorAll('[data-rm-crm-id]').forEach(n=>{const r=find({name:n.dataset.rmCrmName,game:n.dataset.rmCrmGame||'Royal Match'},n.dataset.rmCrmAdmin==='1');if(r?.gameTeamId!==n.dataset.rmCrmId){n.querySelector(':scope > .rm-team-emblem,:scope > .rk-team-emblem')?.remove();delete n.dataset.rmCrmId;}});
    document.querySelectorAll('[data-rm-team-id]').forEach(n=>insert(n,logos.get(n.dataset.rmTeamId)));
    document.querySelectorAll('[data-team]:not(img)').forEach(n=>{let ref;try{const a=JSON.parse(decodeURIComponent(n.dataset.team));if(!Array.isArray(a))return;ref={name:a[0],game:a[1]};}catch{return;}
      const admin=!!n.closest('.royal-admin-screen,.royal-admin-team-detail-shell,.royal-admin-participant-detail-shell')||!!n.dataset.adminRouteTeam;
      const r=find(ref,admin);if(r)attach(n.querySelector('.team-card-main > strong,.participant-profile-team-main > b')||n.querySelector('span,strong,b')||n,r,admin);});
    document.querySelectorAll('[data-admin-participant-team="1"]').forEach(n=>{const r=find({name:n.dataset.teamName,game:n.dataset.teamGame},true);if(r)attach(n.querySelector('b'),r,true);});
    document.querySelectorAll('[data-admin-team="1"], [data-admin-ranking-team="1"]').forEach(n=>{const name=n.dataset.adminTeamName||n.dataset.teamName||n.querySelector('summary strong')?.textContent;const game=n.dataset.adminTeamFullGame||n.dataset.teamGame||n.querySelector('summary small')?.textContent?.split(' · ')[0];const r=find({name,game},true);if(r)attach(n.querySelector('.team-detail-head h2,summary strong,.royal-admin-team-ranking-main strong'),r,true);});
    const head=document.querySelector('#panel .team-detail-head');if(head&&!head.closest('[data-admin-team]')){const h=head.querySelector('h2'),r=find({name:h?.textContent,game:head.querySelector('.muted')?.textContent},false);if(r)attach(h,r,false);}
  }
  function schedule(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;decorate();});}
  function clear(allow){generation++;permitted=allow;logos.clear();cache.clear();pending.clear();queued=new WeakSet();queue.length=0;observer?.disconnect();document.querySelectorAll('.rm-team-emblem,.rk-team-emblem').forEach(n=>n.remove());}
  for(const type of ['royal:access-denied','royal:fatal'])window.addEventListener(type,()=>clear(false));
  window.addEventListener('royal:auth-ready',()=>{clear(true);lastSession=session();schedule();});
  window.RoyalAdminDataV0600?.subscribe?.(e=>{if(e.type==='clear'&&['unauthorized','forbidden','session-changed'].includes(e.reason))clear(false);else schedule();});
  window.RoyalTeamEmblems={version:'1.3.0',valid,logoOf,image,name,label,emoji,emojiName,hasEmojiPrefix,remember,fetchLive,decorate};
  new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});schedule();
})();
