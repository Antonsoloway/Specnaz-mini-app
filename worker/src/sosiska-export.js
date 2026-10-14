// Short-lived download capability for Telegram's native file downloader.
const encode=v=>btoa(String.fromCharCode(...new TextEncoder().encode(v))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const decode=v=>new TextDecoder().decode(Uint8Array.from(atob(v.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0)));
async function key(env){if(typeof env.SESSION_SECRET!=='string'||!env.SESSION_SECRET)throw Error('EXPORT_NOT_CONFIGURED');return crypto.subtle.importKey('raw',new TextEncoder().encode(env.SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
const bytes=v=>Uint8Array.from(atob(v.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
export async function prepareHistoryExport(request,env,body,now=Date.now()){
 const payload=encode(JSON.stringify({purpose:'sosiska-export-v1',teamId:body.teamId,from:body.from,to:body.to,exp:now+10*60000}));
 const signature=new Uint8Array(await crypto.subtle.sign('HMAC',await key(env),new TextEncoder().encode(payload)));
 const sig=btoa(String.fromCharCode(...signature)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
 const url=new URL('/admin-agent-export',request.url);url.searchParams.set('token',payload+'.'+sig);
 return {url:url.href,fileName:`sosiska-${body.teamId}-${body.from.slice(0,10)}-${body.to.slice(0,10)}.json`,expiresAt:new Date(now+10*60000).toISOString()};
}
export async function downloadHistoryExport(request,env,fetchAgent=fetch,now=Date.now()){
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Access-Control-Allow-Origin':'https://web.telegram.org'};
 if(!['GET','HEAD'].includes(request.method))return new Response('METHOD_NOT_ALLOWED',{status:405,headers});
 let p;
 try{
  const token=new URL(request.url).searchParams.get('token');if(!token||token.length>2048)throw Error();
  const [payload,sig,...extra]=token.split('.');if(extra.length||!payload||!sig||!await crypto.subtle.verify('HMAC',await key(env),bytes(sig),new TextEncoder().encode(payload)))throw Error();
  p=JSON.parse(decode(payload));
  if(p.purpose!=='sosiska-export-v1'||!Number.isSafeInteger(p.exp)||p.exp<=now||p.exp>now+10*60000||typeof p.teamId!=='string'||!/^[1-9]\d{0,18}$/.test(p.teamId)||BigInt(p.teamId)>9223372036854775807n||![p.from,p.to].every(v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v)))||p.from>=p.to)throw Error();
 }catch{return new Response('DOWNLOAD_EXPIRED_OR_INVALID',{status:403,headers});}
 const fileName=`sosiska-${p.teamId}-${p.from.slice(0,10)}-${p.to.slice(0,10)}.json`;
 Object.assign(headers,{'Content-Type':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="${fileName}"`});
 if(request.method==='HEAD')return new Response(null,{headers});
 try{
  if(typeof env.RM_AGENT_API_KEY!=='string'||env.RM_AGENT_API_KEY.length<32)throw Error();
  const response=await fetchAgent('https://specnaz-royal-match-agent-stage1.specnaz-sosiska.workers.dev/v1/monitor',{method:'POST',headers:{Authorization:`Bearer ${env.RM_AGENT_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({operation:'export',teamId:p.teamId,from:p.from,to:p.to}),redirect:'manual'});
  if(!response.ok||!response.headers.get('Content-Type')?.includes('application/json'))throw Error();
  return new Response(response.body,{headers});
 }catch{return new Response('EXPORT_UNAVAILABLE',{status:502,headers:{...headers,'Content-Type':'text/plain','Content-Disposition':'inline'}});}
}
