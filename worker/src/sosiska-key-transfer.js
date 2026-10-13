// One-time private transfer helper. Not imported by the production entry point.
const path='/__sosiska_keys_v1';
const aad=new TextEncoder().encode('sosiska-groq-transfer-v1');
const response=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function sealGroqKeys(keys,key){
 const bytes=Uint8Array.from(key.match(/../g),v=>parseInt(v,16));
 const aes=await crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt']);
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},aes,new TextEncoder().encode(JSON.stringify({kind:'sosiska-groq-transfer-v1',keys}))));
 const b64=arr=>btoa(Array.from(arr,b=>String.fromCharCode(b)).join(''));
 return {version:1,iv:b64(iv),ciphertext:b64(cipher)};
}
export function wrapSosiskaKeyTransfer(original,{mode}){
 return {...original,async fetch(request,env,ctx){
  if(new URL(request.url).pathname!==path)return original.fetch(request,env,ctx);
  const key=env.SOSISKA_KEY_TRANSFER,until=Number(env.SOSISKA_KEY_TRANSFER_UNTIL),now=Date.now();
  if(request.method!=='POST'||!/^[a-f0-9]{64}$/.test(key??'')||!Number.isFinite(until)||until<=now||until>now+3600000)return response({ok:false},404);
  const a=new TextEncoder().encode(request.headers.get('Authorization')??''),b=new TextEncoder().encode('Bearer '+key);
  if(a.length!==b.length)return response({ok:false},404);
  let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];if(diff)return response({ok:false},404);
  try{
   if(mode==='source'){
    const names=['GROQ_API_KEY',...Array.from({length:20},(_,i)=>'GROQ_INTERNAL_API_KEY_'+(i+1))];
    const keys=[...new Set(names.map(n=>env[n]).filter(v=>typeof v==='string'&&v.trim()).map(v=>v.trim()))];
    if(!keys.length)return response({ok:false},409);
    return response(await sealGroqKeys(keys,key));
   }
   if(mode==='target'){
    const text=await request.text();if(text.length>1024)return response({ok:false},413);
    const body=JSON.parse(text);if(!['start','status'].includes(body.operation)||Object.keys(body).some(k=>!['operation','jobId'].includes(k))||body.jobId!==undefined&&!/^[a-f0-9-]{36}$/.test(body.jobId))return response({ok:false},400);
    const stub=env.SOSISKA_ANALYSIS.get(env.SOSISKA_ANALYSIS.idFromName('full-history-v1'));
    return stub.fetch('https://analysis.internal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   }
   return response({ok:false},404);
  }catch{return response({ok:false},502);}
 }};
}
