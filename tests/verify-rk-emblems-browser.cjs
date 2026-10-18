const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
  const server=http.createServer((req,res)=>{
    const target=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://fixture').pathname));
    if(!target.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    try {const bytes=fs.readFileSync(target);res.setHeader('Content-Type',target.endsWith('.webp')?'image/webp':target.endsWith('.css')?'text/css':'text/javascript');res.end(bytes);}
    catch {res.writeHead(404).end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,...(process.env.ROYAL_CHROMIUM_PATH?{executablePath:process.env.ROYAL_CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-gpu']});
  try {
    for(const width of [320,390,768]){
      const page=await browser.newPage({viewport:{width,height:800},isMobile:true,hasTouch:true});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.setContent('<base href="'+base+'/"><meta name="viewport" content="width=device-width,initial-scale=1"><main id="panel"></main>');
      await page.addStyleTag({path:path.join(root,'rk-team-emblems-v064.css')});
      await page.addScriptTag({path:path.join(root,'rk-team-emblems-v064.js')});
      const list=await page.evaluate(async()=>{
        const api=window.RoyalKingdomEmblems;
        const markup=api.name('<BOLTAMnet>', 'rk-0',0)+api.name('Конец','rk-183',183)+api.name('Без эмблемы','rk-unknown',999);
        document.querySelector('#panel').innerHTML=markup;
        const img=document.querySelector('.rk-team-emblem');
        await new Promise((resolve,reject)=>{if(img.complete){resolve();return;}img.addEventListener('load',resolve,{once:true});img.addEventListener('error',reject,{once:true});});
        return {count:document.querySelectorAll('.rk-team-emblem').length,first:img.getAttribute('data-rk-logo'),label:document.querySelector('.rk-team-label').textContent,naturalWidth:img.naturalWidth,hasRm:!!document.querySelector('.rm-team-emblem'),last:document.querySelectorAll('.rk-team-emblem')[1].getAttribute('data-rk-logo')};
      });
      assert.deepEqual(list,{count:2,first:'0',label:'<BOLTAMnet>',naturalWidth:160,hasRm:false,last:'183'});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width,'No horizontal scroll');
      if(width===320){
        const bad=await page.evaluate(async()=>{
          const api=window.RoyalKingdomEmblems;
          const results=await Promise.all(Array.from({length:184},(_,id)=>new Promise(resolve=>{
            const template=document.createElement('template');template.innerHTML=api.image(id);
            const image=template.content.firstElementChild;
            image.onload=()=>resolve(image.naturalWidth===160&&image.naturalHeight===176?null:id);
            image.onerror=()=>resolve(id);document.body.appendChild(image);
          })));
          return results.filter(v=>v!==null);
        });
        assert.deepEqual(bad,[],'All RK image IDs must decode in Chromium');
      }
      // The raw saved name survives while its prefix is visually replaced by the image.
      await page.evaluate(()=>{document.querySelector('#panel').innerHTML=RoyalKingdomEmblems.name('🇷🇺FORTUNA','22',144);});
      await page.waitForFunction(()=>document.querySelector('.rk-team-emblem')?.dataset.rkLoaded==='1');
      assert.equal(await page.locator('.rk-team-label').textContent(),'🇷🇺FORTUNA');
      assert.equal(await page.locator('.rk-team-emoji-prefix').isVisible(),false);
      await page.evaluate(()=>document.querySelector('.rk-team-emblem').src='/missing-emblem.webp');
      await page.waitForFunction(()=>document.querySelector('.rk-team-emblem')?.hidden);
      assert.equal(await page.locator('.rk-team-emoji-prefix').isVisible(),true);
      // Actual CRM surfaces share the RM visible-only decorator, with isolated game IDs.
      for(const file of [...new Set([...fs.readFileSync(path.join(root,'app-v0609.html'),'utf8').matchAll(/href="([^"?]+\.css)/g)].map(m=>m[1]))])await page.addStyleTag({path:path.join(root,file)});
      await page.evaluate(()=>{
        window.sessionToken='list-fixture';window.calls=[];window.activeCalls=0;window.peakCalls=0;
        const rk={name:'💀ВЕНОМ',game:'Royal Kingdom',gameTeamId:'1'},rm={name:'⚜️MATCH',game:'Royal Match',gameTeamId:'1'},unlinked={name:'💣Arcane',game:'Royal Kingdom'},offscreen={name:'☀️OFFSCREEN',game:'Royal Kingdom',gameTeamId:'2'};
        window.snapshotState={teams:[rk,rm,unlinked,offscreen]};window.RoyalAdminDataV0600={current:{adminData:{teams:[rk,rm]}}};
        window.ref=t=>encodeURIComponent(JSON.stringify([t.name,t.game]));
        document.querySelector('#panel').innerHTML='<div class="teams-list">'+[rk,rm,unlinked].map((t,i)=>'<button class="team-card" id="list'+i+'" data-team="'+ref(t)+'"><div class="team-card-icon">🏰</div><div class="team-card-main"><strong>'+t.name+'</strong><span>'+t.game+'</span><small>Участников: 2</small></span><span class="chevron">›</span></button>').join('')+'</div>'+
          '<div id="members"><button class="participant-profile-team-link" data-team="'+ref(rk)+'"><span class="participant-profile-team-main"><b>'+rk.name+'</b><small>Лидер</small></span></button><button class="membership-pill" data-team="'+ref(rk)+'"><span>'+rk.name+'</span></button></div>'+
          '<section class="royal-admin-screen"><details data-admin-team="1" data-admin-team-name="'+rk.name+'" data-admin-team-full-game="Royal Kingdom"><summary><strong>'+rk.name+'</strong></summary></details><div data-admin-ranking-team="1" data-team-name="'+rk.name+'" data-team-game="Royal Kingdom"><div class="royal-admin-team-ranking-main"><strong>'+rk.name+'</strong></div></div><button data-admin-participant-team="1" data-team-name="'+rk.name+'" data-team-game="Royal Kingdom"><b>'+rk.name+'</b></button></section>'+
          '<button id="offscreen" style="margin-top:2000px" data-team="'+ref(offscreen)+'"><span>'+offscreen.name+'</span></button>';
        window.fetch=async url=>{const params=new URL(url).searchParams,game=params.get('game'),name=params.get('team');calls.push({game,name});activeCalls++;peakCalls=Math.max(peakCalls,activeCalls);await new Promise(r=>setTimeout(r,30));activeCalls--;return Response.json({ok:true,data:{teamId:name==='☀️OFFSCREEN'?'2':'1',game,logo:game==='Royal Kingdom'?72:0}});};
      });
      await page.addScriptTag({path:path.join(root,'team-emblems-v061.js')});
      await page.waitForFunction(()=>document.querySelector('#list0 img')?.dataset.rkLoaded==='1'&&document.querySelector('#list1 img')?.dataset.rmLoaded==='1');
      assert.equal(await page.locator('#list0 strong').innerText(),'ВЕНОМ');
      assert.equal(await page.locator('#list0 strong').textContent(),'💀ВЕНОМ');
      assert.equal(await page.locator('#list0 img').getAttribute('data-rk-logo'),'72');
      assert.equal(await page.locator('#list1 img').getAttribute('data-rm-logo'),'0');
      assert.equal(await page.locator('#list2 img').count(),0);
      assert.equal(await page.locator('#list2 strong').innerText(),'💣Arcane');
      assert.equal(await page.locator('#list0').getAttribute('data-team'),await page.evaluate(()=>ref(snapshotState.teams[0])));
      assert.equal(await page.evaluate(()=>calls.some(c=>c.name==='☀️OFFSCREEN')),false);
      assert.ok(await page.evaluate(()=>peakCalls<=2));
      for(const target of ['.participant-profile-team-main>b','.membership-pill>span','[data-admin-team] summary strong','.royal-admin-team-ranking-main strong','[data-admin-participant-team]>b']){
        await page.locator(target).scrollIntoViewIfNeeded();
        await page.waitForFunction(selector=>document.querySelector(selector+' img')?.dataset.rkLoaded==='1',target);
        assert.equal(await page.locator(target).innerText(),'ВЕНОМ');assert.equal(await page.locator(target).textContent(),'💀ВЕНОМ');
      }
      await page.locator('#list0').scrollIntoViewIfNeeded();
      await page.locator('#list0 img').evaluate(img=>img.src='/missing-list-emblem.webp');
      await page.waitForFunction(()=>document.querySelector('#list0 img')?.hidden);
      assert.equal(await page.locator('#list0 strong').innerText(),'💀ВЕНОМ');
      await page.evaluate(()=>{delete snapshotState.teams[0].gameTeamId;delete RoyalAdminDataV0600.current.adminData.teams[0].gameTeamId;RoyalTeamEmblems.decorate();});
      assert.equal(await page.locator('#panel .rk-team-emblem').count(),0);
      assert.equal(await page.locator('#list0 strong').innerText(),'💀ВЕНОМ');
      assert.equal(await page.locator('#list1 .rm-team-emblem').count(),1,'unlink RK must preserve RM same-ID image');
      await page.evaluate(()=>window.dispatchEvent(new Event('royal:access-denied')));
      assert.equal(await page.locator('#panel img').count(),0);
      assert.deepEqual(errors,[]);
      await page.close();
    }
    console.log('RK: 184 real images, 0/183 and unknown IDs, no RM fallback, 320/390/768px, public/admin CRM surfaces, same-ID game isolation, loaded/error/unlink/revocation prefix fallback, no browser errors');
  } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
