/* Admin agent cards. Only server-verified, short-lived diagnostics show green. */
(() => {
 const endpoint='https://royal-crm-miniapp-api.tropical-spoon.workers.dev/admin-agent';
 const TTL=60000,MAX_AGE=90000;
 const labels={checking:'Проверка…',online:'Онлайн',offline:'Офлайн',busy:'Занят',unknown:'Нет связи'};
 let owner='',generation=0,controller=null,refreshTimer=null,expiryTimer=null,updated=0,records=new Map();
 const session=()=>typeof sessionToken==='undefined'?'':sessionToken;
 const admin=()=>typeof authState!=='undefined'&&!!(authState?.role?.isChatAdmin||authState?.role?.code==='admin'||authState?.permissions?.canManageAll);
 const cards=()=>[...document.querySelectorAll('[data-agent-id]')];
 const visible=()=>!document.hidden&&admin()&&!!session()&&cards().length>0;
 function stop(clear=false){
  generation++;controller?.abort();controller=null;clearTimeout(refreshTimer);clearTimeout(expiryTimer);
  refreshTimer=expiryTimer=null;
  if(clear){owner='';updated=0;records.clear();for(const card of cards())card.querySelector('[data-agent-self-status]')?.remove();}
 }
 function paint(){
  for(const card of cards()){
   let box=card.querySelector('[data-agent-self-status]');
   if(!box){box=document.createElement('div');box.dataset.agentSelfStatus='';box.className='agent-self-status';box.setAttribute('role','status');box.setAttribute('aria-live','polite');
    const level=document.createElement('span');level.className='agent-self-level';level.dataset.agentLevel='';
    const state=document.createElement('span');state.className='agent-self-state';state.dataset.agentState='';box.append(level,state);card.appendChild(box);}
   const record=records.get(card.dataset.agentId),checked=Date.parse(record?.checkedAt??'');
   const fresh=Number.isFinite(checked)&&checked<=Date.now()+5000&&Date.now()-checked<MAX_AGE;
   const status=record?.status==='online'&&!fresh?'checking':labels[record?.status]?record.status:'checking';
   const value=Number.isInteger(record?.level)&&record.level>0?record.level:null;
   const level=box.querySelector('[data-agent-level]'),state=box.querySelector('[data-agent-state]');
   level.textContent='Уровень '+(value?value.toLocaleString('ru-RU'):'—');
   const verified=record?.levelVerified===true&&status==='online';
   box.dataset.levelVerified=String(verified);
   level.title=value&&!verified?'Последний подтверждённый уровень'+(record.lastOnlineAt?' · '+new Date(record.lastOnlineAt).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})+' МСК':''):'';
   state.dataset.state=status;state.textContent=labels[status];
  }
 }
 function plan(){
  clearTimeout(refreshTimer);clearTimeout(expiryTimer);
  if(!visible())return;
  refreshTimer=setTimeout(()=>refresh(),TTL);
  const times=[...records.values()].filter(r=>r.status==='online').map(r=>Date.parse(r.checkedAt)+MAX_AGE-Date.now());
  if(times.length)expiryTimer=setTimeout(()=>{paint();},Math.max(1,Math.min(...times)));
 }
 async function refresh(){
  if(!visible()||controller)return;
  const token=session(),version=generation,c=new AbortController();controller=c;
  const timer=setTimeout(()=>c.abort(),20000);
  try{
   const response=await fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({operation:'status'}),signal:c.signal});
   if(version!==generation||token!==session()||!admin())return;
   if(response.status===401||response.status===403){stop(true);return;}
   const result=await response.json();
   if(version!==generation||token!==session()||!admin())return;
   if(!response.ok||result.ok!==true||!Array.isArray(result.data?.agents))throw Error('UNAVAILABLE');
   const next=new Map();
   for(const item of result.data.agents){
    if(typeof item?.id!=='string'||!['online','offline','busy'].includes(item.status))continue;
    const previous=records.get(item.id);
    next.set(item.id,{status:item.status,level:Number.isInteger(item.level)&&item.level>0?item.level:previous?.level??null,
     checkedAt:item.checkedAt,lastOnlineAt:item.lastOnlineAt||previous?.lastOnlineAt,levelVerified:item.levelVerified===true});
   }
   records=next;updated=Date.now();
  }catch{
   if(version!==generation||token!==session())return;
   for(const card of cards())records.set(card.dataset.agentId,{...records.get(card.dataset.agentId),status:'unknown',levelVerified:false});
   updated=0;
  }finally{
   clearTimeout(timer);
   if(version===generation){controller=null;paint();plan();}
  }
 }
 function decorate(){
  if(!admin()||!session()){stop(true);return;}
  if(owner!==session()){stop(true);owner=session();}
  paint();
  if(!visible()){clearTimeout(refreshTimer);clearTimeout(expiryTimer);return;}
  if(!updated||Date.now()-updated>=TTL)refresh();else plan();
 }
 document.addEventListener('visibilitychange',()=>{if(document.hidden){stop();for(const [id,r]of records)records.set(id,{...r,status:'checking'});paint();}else decorate();});
 window.addEventListener('online',()=>{updated=0;decorate();});
 window.addEventListener('offline',()=>{stop();for(const [id,r]of records)records.set(id,{...r,status:'unknown',levelVerified:false});paint();});
 window.addEventListener('royal:auth-ready',()=>{stop(true);decorate();});
 for(const event of ['royal:access-denied','royal:fatal'])window.addEventListener(event,()=>stop(true));
 if(typeof renderPage==='function'){const original=renderPage;renderPage=function(...args){const result=original.apply(this,args);decorate();return result;};}
 window.RoyalAdminDataV0600?.subscribe?.(event=>{if(event.type==='clear'&&['unauthorized','forbidden','session-changed'].includes(event.reason))stop(true);});
 window.RoyalAgentStatus={decorate,refresh};decorate();
})();
