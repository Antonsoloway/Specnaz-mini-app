// Compare the current app Worker with the module wrapper in real workerd.
// No production credentials or external calls are allowed.
import {createRequire} from 'node:module';
import {createHmac} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(process.argv[2]);
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const [oldPath,newPath]=process.argv.slice(3);
if(!oldPath||!newPath)throw new Error('Provide legacy and module Worker bundles');
const persist=await mkdtemp(join(tmpdir(),'sosiska-isolation-'));
let fixtureCalls=0;
const snapshot={generatedAt:'2026-10-12T00:00:00Z',participants:[{telegramId:'123',name:'Fixture admin',chatState:'В чате'}],teams:[{name:'Fixture team',game:'RM'}],stats:{participants:1,teams:1}};
const outboundService=async request=>{
 fixtureCalls++;const url=new URL(request.url);
 if(url.hostname==='api.telegram.org')return Response.json({ok:true,result:{status:'administrator'}});
 if(url.hostname==='api.github.com'&&url.pathname.endsWith('/snapshot.json'))return Response.json(snapshot);
 if(url.hostname==='api.github.com'&&url.pathname.endsWith('/admin-snapshot.json'))return Response.json({generatedAt:snapshot.generatedAt,adminData:{participants:snapshot.participants,teams:snapshot.teams,journal:[],write:{}}});
 if(url.hostname==='api.github.com'&&url.pathname.endsWith('/achievements.json'))return new Response('',{status:404});
 throw new Error('Unexpected outbound request in isolation fixture');
};
const create=(scriptPath,name)=>{
 const options={name,rootPath:dirname(scriptPath),modules:true,scriptPath,compatibilityDate:'2026-08-15',bindings:{FRONTEND_ORIGIN:'https://antonsoloway.github.io',SESSION_SECRET:'fixture-secret',BOT_TOKEN:'fixture-bot',TELEGRAM_CHAT_ID:'-1001',GITHUB_TOKEN:'fixture-github',DATA_REPO:'fixture/data'},outboundService};
 return new Miniflare(convertV4MiniflareOptions?{...convertV4MiniflareOptions(options),resourcePersistencePath:join(persist,name)}:options);
};
let oldRuntime,newRuntime;
try {
 oldRuntime=create(oldPath,'legacy');newRuntime=create(newPath,'module');
 const routes=['/health','/auth','/snapshot','/admin-data','/admin-write','/admin-team-photo','/admin-achievements','/contact-by-id','/background-music','/missing-route'];
 let checks=0;
 for(const path of routes)for(const method of ['GET','POST','OPTIONS']) {
  const init={method,headers:{Origin:'https://antonsoloway.github.io',Authorization:'Bearer invalid-fixture','Content-Type':'application/json'},...(method==='POST'?{body:'{}'}:{})};
  const a=await oldRuntime.dispatchFetch('https://miniapp.test'+path,init);
  const b=await newRuntime.dispatchFetch('https://miniapp.test'+path,init);
  const label=method+' '+path;
  assert.equal(b.status,a.status,label+' status');
  assert.deepEqual([...b.headers],[...a.headers],label+' headers');
  assert.equal(await b.text(),await a.text(),label+' body');checks++;
 }
 assert.equal(fixtureCalls,0,'Invalid sessions must not reach outbound services');
 const payload=Buffer.from(JSON.stringify({tg:'123',exp:Math.floor(Date.now()/1000)+600})).toString('base64url');
 const token=payload+'.'+createHmac('sha256','fixture-secret').update(payload).digest('base64url');
 for(const path of ['/snapshot','/admin-data']) {
  const init={headers:{Origin:'https://antonsoloway.github.io',Authorization:'Bearer '+token}};
  const a=await oldRuntime.dispatchFetch('https://miniapp.test'+path,init);
  const b=await newRuntime.dispatchFetch('https://miniapp.test'+path,init);
  assert.equal(a.status,200,path+' legacy success');assert.equal(b.status,200,path+' module success');
  assert.deepEqual([...b.headers],[...a.headers],path+' authenticated headers');
  assert.equal(await b.text(),await a.text(),path+' authenticated content');checks++;
 }
 assert.ok(fixtureCalls>0);
 console.log(JSON.stringify({checks,legacyRoutes:'identical status/headers/body',authenticatedSnapshotAndAdmin:'pass',fixtureCalls,liveNetworkCalls:0}));
}finally{await Promise.all([oldRuntime?.dispose(),newRuntime?.dispose()]);await rm(persist,{recursive:true,force:true});}
