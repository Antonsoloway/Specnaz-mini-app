const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');let browser;
(async()=>{
 browser=await chromium.launch({headless:true,...(process.env.ROYAL_CHROMIUM_PATH?{executablePath:process.env.ROYAL_CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-gpu']});
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://display.test/assets/rm-emblems/*',async route=>{if(route.request().url().includes('broken'))return route.abort();await new Promise(r=>setTimeout(r,600));return route.fulfill({contentType:'image/webp',body:fs.readFileSync(path.join(root,'assets/rm-emblems/136.webp'))});});
 await page.setContent('<base href="https://display.test/"><main id="panel"></main>');await page.addStyleTag({path:path.join(root,'team-emblems-v061.css')});
 await page.evaluate(()=>{
  window.sessionToken='fixture';const team={name:'🇷🇺FORTUNA',game:'Royal Match',gameTeamId:'12'};
  window.snapshotState={teams:[team,{name:'⚡UNLINKED',game:'Royal Match'},{name:'⚡KINGDOM',game:'Royal Kingdom',gameTeamId:'14'},{name:'🌴UNKNOWN',game:'Royal Match',gameTeamId:'13'}]};window.RoyalAdminDataV0600={current:{adminData:{teams:[team]}}};
  const ref=t=>encodeURIComponent(JSON.stringify([t.name,t.game]));window.ref=ref;
  document.querySelector('#panel').innerHTML='<div class="team-detail-head"><h2>🇷🇺FORTUNA</h2><div class="muted">Royal Match</div></div><button id="membership" data-team="'+ref(team)+'"><span>🇷🇺FORTUNA</span><small>Игрок · Royal Match</small></button><button data-admin-participant-team="1" data-team-name="🇷🇺FORTUNA" data-team-game="Royal Match"><b>🇷🇺FORTUNA</b></button><section data-admin-team="1" data-admin-team-name="🇷🇺FORTUNA" data-admin-team-full-game="Royal Match"><div class="team-detail-head"><h2>🇷🇺FORTUNA</h2></div></section>'+snapshotState.teams.slice(1).map((t,i)=>'<button id="other'+i+'" data-team="'+ref(t)+'"><span>'+t.name+'</span></button>').join('');
  window.fetch=async url=>{const t=snapshotState.teams.find(t=>t.name===new URL(url).searchParams.get('team'));return Response.json({ok:true,data:{teamId:t.gameTeamId,logo:t.gameTeamId==='12'?136:999}});};
 });
 await page.addScriptTag({path:path.join(root,'team-emblems-v061.js')});
 await page.waitForSelector('#membership .rm-team-emoji-prefix');assert.equal(await page.locator('#membership .rm-team-emoji-prefix').isVisible(),true,'keep emoji until image has loaded');
 await page.waitForFunction(()=>document.querySelectorAll('.rm-team-emblem[data-rm-loaded="1"]').length===4);
 const labels=page.locator('.rm-team-emoji-prefix');for(let i=0;i<await labels.count();i++)assert.equal(await labels.nth(i).isVisible(),false);
 assert.equal(await page.locator('#membership span.rm-team-name').innerText(),'FORTUNA');assert.equal(await page.locator('#membership span.rm-team-name').textContent(),'🇷🇺FORTUNA');assert.equal(await page.locator('#membership').getAttribute('data-team'),await page.evaluate(()=>ref(snapshotState.teams[0])),'routing identity unchanged');
 assert.equal(await page.locator('.team-detail-head h2').first().innerText(),'FORTUNA');assert.equal(await page.locator('[data-admin-participant-team] b').innerText(),'FORTUNA');assert.equal(await page.locator('section h2').innerText(),'FORTUNA');
 for(const [id,text] of [['other0','⚡UNLINKED'],['other1','⚡KINGDOM'],['other2','🌴UNKNOWN']]){assert.equal(await page.locator('#'+id).innerText(),text);assert.equal(await page.locator('#'+id+' .rm-team-emblem').count(),0);}
 // Shared Sosiska/name helper uses the same display-only prefix; raw text is intact.
 await page.evaluate(()=>{const n=document.createElement('div');n.id='shared';n.innerHTML=RoyalTeamEmblems.name('🇷🇺FORTUNA','12',136);document.body.appendChild(n);});await page.waitForFunction(()=>document.querySelector('#shared img')?.dataset.rmLoaded==='1');assert.equal(await page.locator('#shared').innerText(),'FORTUNA');assert.equal(await page.locator('#shared').textContent(),'🇷🇺FORTUNA');
 await page.addScriptTag({path:path.join(root,'team-live-v061.js')});await page.evaluate(()=>{const n=document.createElement('section');n.id='livehero';n.className='team-live-card';n.innerHTML=RoyalTeamLive.card({name:'🇷🇺FORTUNA',logo:136,leadership:[]});document.body.appendChild(n);});await page.waitForFunction(()=>document.querySelector('#livehero img')?.dataset.rmLoaded==='1');assert.equal(await page.locator('#livehero .team-live-title h3').innerText(),'FORTUNA');assert.equal(await page.locator('#livehero .team-live-title h3').textContent(),'🇷🇺FORTUNA');
 // Actual static-image failure restores the full name instead of hiding both representations.
 await page.locator('#membership img').evaluate(n=>n.src='https://display.test/assets/rm-emblems/broken.webp');await page.waitForFunction(()=>document.querySelector('#membership img').hidden);assert.equal(await page.locator('#membership span.rm-team-name').innerText(),'🇷🇺FORTUNA');
 await page.evaluate(()=>{delete snapshotState.teams[0].gameTeamId;RoyalTeamEmblems.decorate();});assert.equal(await page.locator('#panel img').count(),0);assert.equal(await page.locator('.team-detail-head h2').first().innerText(),'🇷🇺FORTUNA');
 await page.evaluate(()=>window.dispatchEvent(new Event('royal:access-denied')));assert.equal(await page.locator('.rm-team-emblem').count(),0);assert.equal(await page.locator('#shared').innerText(),'🇷🇺FORTUNA');
 assert.deepEqual(errors,[]);console.log('emblem display: public/admin headings and membership, Sosiska helper, delayed image, unlinked/RK/unknown fallback, image failure, unlink/revocation restore, unchanged raw identity PASS');await browser.close();
})().catch(async e=>{console.error(e);await browser?.close();process.exit(1)});
