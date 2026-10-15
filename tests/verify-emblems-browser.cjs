const {chromium}=require('playwright'),http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{const p=path.join(root,new URL(req.url,'http://fixture').pathname);if(!p.startsWith(root+'/')){res.writeHead(403).end();return;}try{const bytes=fs.readFileSync(p);res.setHeader('Content-Type',p.endsWith('.webp')?'image/webp':p.endsWith('.css')?'text/css':'text/javascript');res.end(bytes);}catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.ROYAL_CHROMIUM_PATH?{executablePath:process.env.ROYAL_CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-gpu']});const errors=[];
 for(const width of [320,390,768]){
  const page=await browser.newPage({viewport:{width,height:844},isMobile:true,hasTouch:true});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/fixture.html');await page.setContent('<base href="'+base+'/"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:12px;font-family:Arial;background:#142131;color:white}button{display:block;width:100%;background:#304963;color:white;padding:14px;margin:10px 0;border-radius:14px;border:0;text-align:left}.team-card-main{display:block}strong{font-size:20px}.team-detail-head h2{font-size:26px}</style><main id="panel"></main>');
  await page.addStyleTag({path:path.join(root,'team-emblems-v061.css')});
  await page.evaluate(()=>{
   window.sessionToken='fixture';window.snapshotState={teams:Array.from({length:24},(_,i)=>({name:i===0?'CRM editable name < &':'Team '+i,game:'Royal Match',gameTeamId:String(i+1)})).concat([{name:'Team 1',game:'Royal Kingdom',gameTeamId:'99'}])};window.calls=[];window.activeCalls=0;window.peakCalls=0;
   const ref=t=>encodeURIComponent(JSON.stringify([t.name,t.game])),esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;');document.getElementById('panel').innerHTML=snapshotState.teams.map(t=>'<button class="team-card" data-team="'+ref(t)+'"><span class="team-card-main"><strong>'+esc(t.name)+'</strong><small>'+t.game+'</small></span></button>').join('');
   window.fetch=async url=>{const name=new URL(url).searchParams.get('team');calls.push(name);activeCalls++;peakCalls=Math.max(peakCalls,activeCalls);await new Promise(r=>setTimeout(r,30));activeCalls--;const t=snapshotState.teams.find(t=>t.name===name&&t.game==='Royal Match');return Response.json({ok:true,data:{teamId:t.gameTeamId,logo:t.gameTeamId==='1'?0:175}});};
  });
  await page.addScriptTag({path:path.join(root,'team-emblems-v061.js')});
  if(width===320){
   const failures=await page.evaluate(async()=>{
    const results=await Promise.all(Array.from({length:176},(_,id)=>new Promise(resolve=>{
     const img=new Image();img.onload=()=>resolve(img.naturalWidth===160&&img.naturalHeight===176?null:id);img.onerror=()=>resolve(id);
     const template=document.createElement('template');template.innerHTML=RoyalTeamEmblems.image(id);img.src=template.content.firstChild.src;
    })));return results.filter(id=>id!==null);
   });assert.deepEqual(failures,[],'every catalogue image must decode, including 74 and151 from owner report');
  }await page.waitForSelector('[data-rm-logo="0"]');await page.waitForTimeout(300);
  assert.ok(await page.evaluate(()=>calls.length<24),'offscreen teams must not prewarm');assert.ok(await page.evaluate(()=>peakCalls<=2));assert.equal(await page.locator('.team-card').last().locator('.rm-team-emblem').count(),0,'RK never gets RM logo');assert.equal(await page.locator('.team-card strong').first().textContent(),'CRM editable name < &');
  await page.locator('.team-card').nth(23).scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelectorAll('[data-rm-logo="175"]').length>3);
  await page.evaluate(()=>{const t=snapshotState.teams[0];snapshotState.teams=[t];document.getElementById('panel').innerHTML='<div class="team-detail-head"><h2>CRM editable name &lt; &amp;</h2><div class="muted">Royal Match</div></div><button class="membership-pill" data-team="'+encodeURIComponent(JSON.stringify([t.name,t.game]))+'"><span>CRM editable name &lt; &amp;</span><small>Leader</small></button><button class="participant-profile-team-link" data-team="'+encodeURIComponent(JSON.stringify([t.name,t.game]))+'"><span class="participant-profile-team-main"><b>CRM editable name &lt; &amp;</b><small>Leader</small></span></button>';});
  await page.waitForFunction(()=>document.querySelectorAll('#panel .rm-team-emblem').length===3);assert.equal(await page.locator('h2').textContent(),'CRM editable name < &');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
  await page.locator('#panel').screenshot({path:'/tmp/emblems-mobile-'+width+'.png'});
  await page.evaluate(()=>{delete snapshotState.teams[0].gameTeamId;RoyalTeamEmblems.decorate();});assert.equal(await page.locator('.rm-team-emblem').count(),0,'unlink removes stale images');
  await page.evaluate(()=>{window.RoyalAdminDataV0600={current:{adminData:{teams:[{name:'Admin team',game:'Royal Match',gameTeamId:'175'}]}}};window.snapshotState.teams.push({name:'Admin team',game:'Royal Match',gameTeamId:'175'});document.getElementById('panel').innerHTML='<section class="royal-admin-team-detail-shell" data-admin-team="1" data-admin-team-name="Admin team" data-admin-team-full-game="Royal Match"><div class="team-detail-head"><h2>Admin team</h2></div><button data-admin-participant-team="1" data-team-name="Admin team" data-team-game="Royal Match"><b>Admin team</b><small>Leader</small></button></section>';});await page.waitForFunction(()=>document.querySelectorAll('.rm-team-emblem').length===2);
  await page.evaluate(()=>window.dispatchEvent(new Event('royal:access-denied')));assert.equal(await page.locator('.rm-team-emblem').count(),0);
  await page.close();
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({widths:[320,390,768],zero:true,last:true,RKExcluded:true,renamePreserved:true,unlinkClears:true,revocationClears:true,maxConcurrent:2,offscreenPrewarm:false,overflow:false,pageErrors:0}));await browser.close();server.close();
})().catch(e=>{console.error(e);process.exit(1)});
