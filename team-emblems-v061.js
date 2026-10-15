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
  function emojiName(text,logo){const name=String(text||'').trim(),prefix=emoji(logo);return prefix&&name&&!hasEmojiPrefix(name)?prefix+' '+name:name;}
  const logos=new Map(),cache=new Map(),pending=new Map(),queue=[];
  let queued=new WeakSet();
  let active=0,generation=0,scheduled=false,permitted=true,lastSession=session();
  function remember(id,logo){if(typeof id!=='string'||!valid(logo))return;if(logos.size>=250&&!logos.has(id))logos.delete(logos.keys().next().value);logos.set(id,logo);schedule();}
  function image(logo){return valid(logo)?'<img class="rm-team-emblem" src="assets/rm-emblems/'+logo+'.webp" width="32" height="34" alt="" aria-hidden="true" loading="lazy" decoding="async" data-rm-logo="'+logo+'">':'';}
  function name(text,id,logo){if(valid(logo))remember(id,logo);return '<span class="rm-team-name"'+(typeof id==='string'?' data-rm-team-id="'+esc(id)+'"':'')+'>'+image(valid(logo)?logo:logos.get(id))+esc(text)+'</span>';}
  async function fetchLive(record,admin=false,refresh=false,metadataOnly=false){
    const token=session(),epoch=generation;if(!permitted||!token)throw Error('SESSION_MISSING');
    const key=JSON.stringify([token,admin,record.name,record.gameTeamId]);const old=cache.get(key);
    if(metadataOnly&&!refresh&&old&&Date.now()-old.at<60000){if(old.error)throw Error('UNAVAILABLE');return old.payload;}
    if(pending.has(key))return pending.get(key);
    const task=(async()=>{
      for(let attempt=0;attempt<2;attempt++){
        const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
        try{
          const params=new URLSearchParams({team:record.name,game:'Royal Match',...(refresh?{refresh:'1'}:{})});
          const r=await fetch(API+(admin?'/admin-team-live?':'/team-live?')+params,{headers:{Authorization:'Bearer '+token},signal:controller.signal});
          if(token!==session()||epoch!==generation||!permitted)throw Error('STALE');
          if(r.status===401||r.status===403){clear(false);throw Object.assign(Error('Откройте приложение заново.'),{denied:true});}
          if(!r.ok)throw Object.assign(Error('Данные игры не загрузились.'),{transient:[408,425,429,502,503,504].includes(r.status)});
          const payload=await r.json();
          if(!payload.ok)throw Error('Данные игры не загрузились.');
          if(payload.data?.teamId!==record.gameTeamId)throw Error('Привязка команды изменилась. Обновите карточку.');
          if(cache.size>=250&&!cache.has(key))cache.delete(cache.keys().next().value);
          cache.set(key,{at:Date.now(),payload});remember(record.gameTeamId,logoOf(payload.data));return payload;
        }catch(e){
          const transient=e.transient||e.name==='AbortError'||e.name==='TypeError'||e.code==='WORKER_TIMEOUT'||e.message==='WORKER_TIMEOUT';
          if(attempt===0&&transient&&epoch===generation&&token===session()&&permitted){await new Promise(r=>setTimeout(r,500));if(epoch!==generation||token!==session()||!permitted)throw Error('STALE');continue;}
          if(epoch===generation&&token===session()&&permitted)cache.set(key,{at:Date.now(),error:true});throw e;
        }finally{clearTimeout(timer);}
      }
    })();pending.set(key,task);try{return await task;}finally{if(pending.get(key)===task)pending.delete(key);}
  }
  function records(admin){try{return admin?(window.RoyalAdminDataV0600?.current?.adminData?.teams||[]):(typeof snapshotState==='undefined'?[]:snapshotState?.teams||[]);}catch{return [];}}
  function find(ref,admin){const matches=records(admin).filter(t=>t.name===ref.name&&(!ref.game||t.game===ref.game));return matches.length===1&&matches[0].game==='Royal Match'&&matches[0].gameTeamId?matches[0]:null;}
  function insert(node,logo){
    if(!valid(logo)||!node?.isConnected)return;
    const old=node.querySelector(':scope > .rm-team-emblem');if(old?.dataset.rmLogo===String(logo))return;old?.remove();
    node.insertAdjacentHTML('afterbegin',image(logo));node.classList.add('rm-team-name');
  }
  function pump(){while(active<2&&queue.length){const job=queue.shift();if(!job.node.isConnected||job.epoch!==generation){queued.delete(job.node);continue;}active++;
    fetchLive(job.record,job.admin,false,true).then(p=>{if(job.epoch===generation&&job.node.isConnected){const current=find({name:job.record.name,game:'Royal Match'},job.admin);if(current?.gameTeamId===job.record.gameTeamId)insert(job.node,logoOf(p.data));}}).catch(()=>{}).finally(()=>{queued.delete(job.node);active--;pump();});}}
  const observer=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){observer.unobserve(e.target);const job=observed.get(e.target);if(job){queue.push(job);pump();}}},{rootMargin:'80px'});
  const observed=new WeakMap();
  function attach(node,record,admin){if(node?.dataset.rmCrmId&&node.dataset.rmCrmId!==record.gameTeamId)node.querySelector(':scope > .rm-team-emblem')?.remove();if(node){node.dataset.rmCrmId=record.gameTeamId;node.dataset.rmCrmName=record.name;node.dataset.rmCrmAdmin=admin?'1':'0';}if(!node||node.hidden||node.closest('[hidden]'))return;const logo=logos.get(record.gameTeamId);if(valid(logo)){insert(node,logo);return;}if(queued.has(node))return;queued.add(node);const job={node,record,admin,epoch:generation};observed.set(node,job);if(observer)observer.observe(node);else{queue.push(job);pump();}}
  function decorate(){
    if(lastSession!==session()){clear(true);lastSession=session();}if(!permitted||!session())return;
    document.querySelectorAll('[data-rm-crm-id]').forEach(n=>{const r=find({name:n.dataset.rmCrmName,game:'Royal Match'},n.dataset.rmCrmAdmin==='1');if(r?.gameTeamId!==n.dataset.rmCrmId){n.querySelector(':scope > .rm-team-emblem')?.remove();delete n.dataset.rmCrmId;}});
    document.querySelectorAll('[data-rm-team-id]').forEach(n=>insert(n,logos.get(n.dataset.rmTeamId)));
    document.querySelectorAll('[data-team]:not(img)').forEach(n=>{let ref;try{const a=JSON.parse(decodeURIComponent(n.dataset.team));if(!Array.isArray(a))return;ref={name:a[0],game:a[1]};}catch{return;}
      const admin=!!n.closest('.royal-admin-screen,.royal-admin-team-detail-shell,.royal-admin-participant-detail-shell')||!!n.dataset.adminRouteTeam;
      const r=find(ref,admin);if(r)attach(n.querySelector('.team-card-main > strong,.participant-profile-team-main > b,span,strong,b')||n,r,admin);});
    document.querySelectorAll('[data-admin-participant-team="1"]').forEach(n=>{const r=find({name:n.dataset.teamName,game:n.dataset.teamGame},true);if(r)attach(n.querySelector('b'),r,true);});
    document.querySelectorAll('[data-admin-team="1"], [data-admin-ranking-team="1"]').forEach(n=>{const name=n.dataset.adminTeamName||n.dataset.teamName||n.querySelector('summary strong')?.textContent;const game=n.dataset.adminTeamFullGame||n.dataset.teamGame||n.querySelector('summary small')?.textContent?.split(' · ')[0];const r=find({name,game},true);if(r)attach(n.querySelector('.team-detail-head h2,summary strong,.royal-admin-team-ranking-main strong'),r,true);});
    const head=document.querySelector('#panel .team-detail-head');if(head&&!head.closest('[data-admin-team]')){const h=head.querySelector('h2'),r=find({name:h?.textContent,game:head.querySelector('.muted')?.textContent},false);if(r)attach(h,r,false);}
  }
  function schedule(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;decorate();});}
  function clear(allow){generation++;permitted=allow;logos.clear();cache.clear();pending.clear();queued=new WeakSet();queue.length=0;observer?.disconnect();document.querySelectorAll('.rm-team-emblem').forEach(n=>n.remove());}
  for(const type of ['royal:access-denied','royal:fatal'])window.addEventListener(type,()=>clear(false));
  window.addEventListener('royal:auth-ready',()=>{clear(true);lastSession=session();schedule();});
  window.RoyalAdminDataV0600?.subscribe?.(e=>{if(e.type==='clear'&&['unauthorized','forbidden','session-changed'].includes(e.reason))clear(false);else schedule();});
  window.RoyalTeamEmblems={version:'1.1.0',valid,logoOf,image,name,emoji,emojiName,hasEmojiPrefix,remember,fetchLive,decorate};
  new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});schedule();
})();
