import {authorizeAdmin} from './entry-v1380.js';
import {isSosiskaOwner,restrictSosiskaData,SOSISKA_OWNER_ID} from './sosiska-access.js';
// Short-lived download capability for Telegram's native file downloader.
const encode=v=>btoa(String.fromCharCode(...new TextEncoder().encode(v))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const decode=v=>new TextDecoder().decode(Uint8Array.from(atob(v.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0)));
async function key(env){if(typeof env.SESSION_SECRET!=='string'||!env.SESSION_SECRET)throw Error('EXPORT_NOT_CONFIGURED');return crypto.subtle.importKey('raw',new TextEncoder().encode(env.SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
const bytes=v=>Uint8Array.from(atob(v.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
export async function prepareHistoryExport(request,env,body,now=Date.now(),ownerMetrics=false){
 const payload=encode(JSON.stringify({purpose:'sosiska-export-v1',ownerMetrics,subject:ownerMetrics?SOSISKA_OWNER_ID:null,teamId:body.teamId,game:body.game==='rk'?'rk':'rm',from:body.from,to:body.to,exp:now+10*60000}));
 const signature=new Uint8Array(await crypto.subtle.sign('HMAC',await key(env),new TextEncoder().encode(payload)));
 const sig=btoa(String.fromCharCode(...signature)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
 const url=new URL('/admin-agent-export',request.url);url.searchParams.set('token',payload+'.'+sig);
 return {url:url.href,fileName:`sosiska-${body.game==='rk'?'rk-':''}${body.teamId}-${body.from.slice(0,10)}-${body.to.slice(0,10)}.json`,requiresOwnerSession:ownerMetrics,expiresAt:new Date(now+10*60000).toISOString()};
}
export async function downloadHistoryExport(request,env,fetchAgent=fetch,now=Date.now(),authorize=authorizeAdmin){
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Access-Control-Allow-Origin':String(env.FRONTEND_ORIGIN||'https://antonsoloway.github.io'),'Access-Control-Allow-Headers':'Authorization','Access-Control-Allow-Methods':'GET,HEAD,OPTIONS','Vary':'Origin'};
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(!['GET','HEAD'].includes(request.method))return new Response('METHOD_NOT_ALLOWED',{status:405,headers});
 let p;
 try{
  const token=new URL(request.url).searchParams.get('token');if(!token||token.length>2048)throw Error();
  const [payload,sig,...extra]=token.split('.');if(extra.length||!payload||!sig||!await crypto.subtle.verify('HMAC',await key(env),bytes(sig),new TextEncoder().encode(payload)))throw Error();
  p=JSON.parse(decode(payload));
  if(p.purpose!=='sosiska-export-v1'||(p.game!==undefined&&!['rm','rk'].includes(p.game))||!Number.isSafeInteger(p.exp)||p.exp<=now||p.exp>now+10*60000||typeof p.teamId!=='string'||!/^[1-9]\d{0,18}$/.test(p.teamId)||BigInt(p.teamId)>9223372036854775807n||![p.from,p.to].every(v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v)))||p.from>=p.to)throw Error();
 }catch{return new Response('DOWNLOAD_EXPIRED_OR_INVALID',{status:403,headers});}
 if(p.ownerMetrics===true){try{if(p.subject!==SOSISKA_OWNER_ID||!isSosiskaOwner(await authorize(request,env)))throw Error();}catch{return new Response('OWNER_REQUIRED',{status:403,headers});}}
 const fileName=`sosiska-${p.game==='rk'?'rk-':''}${p.teamId}-${p.from.slice(0,10)}-${p.to.slice(0,10)}.json`;
 Object.assign(headers,{'Content-Type':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="${fileName}"`});
 if(request.method==='HEAD')return new Response(null,{headers});
 try{
  const readPage=async before=>{
   const body={operation:'history',teamId:p.teamId,limit:20,...(before?{before}:{})};
   let r;
   if(p.game==='rk'){
    if(!env.SOSISKA_RK_MONITOR)throw Error();
    const stub=env.SOSISKA_RK_MONITOR.get(env.SOSISKA_RK_MONITOR.idFromName('kingdom-monitor-v1'));
    r=await stub.fetch('https://rk-monitor.internal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   }else{
    if(typeof env.RM_AGENT_API_KEY!=='string'||env.RM_AGENT_API_KEY.length<32)throw Error();
    r=await fetchAgent('https://specnaz-royal-match-agent-stage1.specnaz-sosiska.workers.dev/v1/monitor',{method:'POST',headers:{Authorization:'Bearer '+env.RM_AGENT_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'manual'});
   }
   const page=await r.json();if(!r.ok||!page.ok||!Array.isArray(page.data?.records))throw Error('EXPORT_HISTORY');return page.data;
  };
  const encoder=new TextEncoder();let before,first=true,done=false,started=false;
  const stream=new ReadableStream({async pull(controller){try{
   if(!started){controller.enqueue(encoder.encode(JSON.stringify({game:p.game||'rm',teamId:p.teamId,from:p.from,to:p.to}).slice(0,-1)+',"records":['));started=true;return;}
   if(done){controller.enqueue(encoder.encode(']}'));controller.close();return;}
   let emitted=false;
   do{
   const page=await readPage(before);
   for(const record of page.records){
    const at=record.snapshot?.capturedAt;if(!at||at<p.from){done=true;break;}if(at>=p.to)continue;
    controller.enqueue(encoder.encode((first?'':',')+JSON.stringify(restrictSosiskaData(record,p.ownerMetrics===true))));first=false;emitted=true;
   }
   const next=page.nextBefore;if(!next)done=true;else if(before&&next>=before)throw Error('EXPORT_PAGINATION');before=next;
   }while(!emitted&&!done);
   if(done){controller.enqueue(encoder.encode(']}'));controller.close();}
  }catch(error){controller.error(error);}}});
  return new Response(stream,{headers});
 }catch{return new Response('EXPORT_UNAVAILABLE',{status:502,headers:{...headers,'Content-Type':'text/plain','Content-Disposition':'inline'}});}
}
