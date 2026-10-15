const {chromium}=require('playwright'),path=require('node:path'),assert=require('node:assert/strict');
const root=process.argv[2]||path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.ROYAL_CHROMIUM_PATH?{executablePath:process.env.ROYAL_CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-gpu']});const errors=[];
 for(const width of [320,390,768]){
  const page=await browser.newPage({viewport:{width,height:900},isMobile:true,hasTouch:true});page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:12px;background:#142131;color:white;font-family:Arial}#panel{max-width:620px;margin:auto}.team-photo-box{height:200px;background:#789}button{cursor:pointer}</style><main id="panel"><div class="team-photo-box">Saved screenshot</div><div class="team-detail-head"><h2>CRM</h2><div class="muted">Royal Match</div></div><div class="team-members-list">Existing CRM members</div></main>');
  await page.addStyleTag({path:path.join(root,'team-live-v061.css')});
  await page.evaluate(()=>{
   window.sessionToken='fixture';window.snapshotState={teams:[{name:'CRM',game:'Royal Match',gameTeamId:'12'}]};window.calls=0;
   window.fixture={teamId:'12',name:'Team with a long editable name',description:'Welcome! Description on several lines.\nActive players',memberCount:49,capacity:50,score:806485,minLevel:14300,minCrowns:2000,type:'Открытая',leadership:[{userId:'1',name:'Leader & Friends',role:'Лидер',level:14301,crowns:4311,help:11},...['Second','Third','Fourth'].map((name,i)=>({userId:String(i+2),name,role:'Помощник',level:14301,crowns:4000-i*500,help:i}))],fetchedAt:'2026-10-14T19:00:00.000Z',stale:false};
   window.fetch=async()=>{calls++;return Response.json({ok:true,data:fixture});};
  });
  await page.addScriptTag({path:path.join(root,'team-live-v061.js')});await page.waitForSelector('.team-live-player');
  assert.equal(await page.locator('.team-live-player').count(),4);assert.equal(await page.locator('.team-photo-box').isVisible(),false);assert.equal(await page.locator('.team-members-list').textContent(),'Existing CRM members');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
  await page.locator('[data-team-live-photo]').click();assert.equal(await page.locator('.team-photo-box').isVisible(),true);
  await page.evaluate(()=>{const p=document.getElementById('panel');p.innerHTML=p.innerHTML;});
  await page.waitForFunction(()=>calls===2);await page.locator('[data-team-live-refresh]').click();await page.waitForFunction(()=>calls===3);
  await page.locator('[data-team-live-photo]').click();assert.equal(await page.locator('.team-photo-box').isVisible(),false);
  await page.locator('.team-live-card').screenshot({path:'/tmp/team-live-'+width+'.png'});
  await page.evaluate(()=>window.dispatchEvent(new Event('royal:access-denied')));assert.equal(await page.locator('.team-live-card').count(),0);await page.waitForTimeout(50);assert.equal(await page.locator('.team-live-card').count(),0);
  await page.close();
 }
 for(const device of ['Android','iPhone']){
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:device==='iPhone'?'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile':'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/145.0.0.0 Mobile Safari/537.36'});page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><div class="grid"></div><main id="panel" class="royal-admin-screen">Editor remains</main><div class="royal-admin-modal-backdrop" data-admin-write-modal="1"><div class="royal-admin-modal"><h3>Edit CRM team</h3><form id="draft" class="royal-admin-form" data-write-team-form="1"><div class="royal-admin-form-grid"><label class="royal-admin-input"><span>Game</span><select data-write-field="game" disabled><option>Royal Match</option></select></label><label class="royal-admin-input"><span>Name</span><input data-write-field="name" value="Old"></label><label class="royal-admin-input is-wide"><span>ID</span><input data-write-field="gameTeamId"><button type="button" class="royal-admin-form-button team-live-pick-button" data-team-live-pick>Find and bind</button></label></div><div id="photoDraft">Saved photo draft</div></form></div></div>');
 for(const name of ['style.css','admin-write-v0600.css','admin-write-v0600-v2.css','sosiska-v061.css','team-live-v061.css','team-emblems-v061.css'])await page.addStyleTag({path:path.join(root,name)});
 await page.evaluate(()=>{
  window.__ROYAL_BUILD__='0.6.1';window.authState={role:{isChatAdmin:true}};window.sessionToken='fixture';window.calls=[];window.renderPage=()=>{};window.setActiveNav=()=>{};
  window.fetch=async(_,init)=>{const b=JSON.parse(init.body);calls.push(b.operation);const t={TeamId:'12',TeamName:'Selected team',Leader:'2',CoLeaders:[],Members:[{UserId:'2',Name:'Leader',Level:200,Crown:20}],TeamLogo:0,Type:true,MinLevel:100,MinCrown:0};return Response.json({ok:true,data:b.operation==='search'?{candidates:[{teamId:'12',name:t.TeamName}],warnings:[]}:t});};
 });
 for(const name of ['v061-ios-admin-touch-fix.js','v061-admin-ghost-click-guard.js','v061-admin-context-integrity.js','sosiska-period-v061.js','team-emblems-v061.js','sosiska-v061.js','team-live-v061.js'])await page.addScriptTag({path:path.join(root,name)});
 await page.locator('[data-write-field="gameTeamId"]').focus();await page.locator('[data-team-live-pick]').tap();await page.waitForSelector('.sosiska-picker');
 const topmost=await page.evaluate(()=>{const input=document.querySelector('[data-sosiska-search] input'),r=input.getBoundingClientRect();return !!document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('.team-live-picker-backdrop');});assert.equal(topmost,true,device+' search must be above the actual admin modal');
 await page.locator('[data-sosiska-action="back"]').tap();assert.equal(await page.locator('[data-write-field="name"]').inputValue(),'Old');assert.equal(await page.locator('#photoDraft').textContent(),'Saved photo draft');
 await page.locator('[data-team-live-pick]').tap();await page.waitForSelector('.sosiska-picker');
 await page.locator('[data-sosiska-search] input').fill('Selected');await page.locator('[data-sosiska-search] button').tap();await page.waitForSelector('[data-sosiska-action="bind"]');
 await page.locator('[name="scoreMin"]').fill('200');await page.locator('[data-sosiska-filters] button').first().tap();await page.waitForFunction(()=>!document.querySelector('[data-sosiska-action="bind"]').disabled);
 await page.locator('.sosiska-picker').screenshot({path:'/tmp/team-live-picker-'+device+'.png'});await page.locator('[data-sosiska-action="bind"]').tap();await page.waitForFunction(()=>!document.querySelector('.team-live-picker-backdrop'));
 assert.equal(await page.locator('[data-write-field="name"]').inputValue(),'⚜️Selected team');assert.equal(await page.locator('[data-write-field="gameTeamId"]').inputValue(),'12');assert.equal(await page.locator('#photoDraft').textContent(),'Saved photo draft');assert.equal(await page.locator('#panel').textContent(),'Editor remains');assert.ok((await page.evaluate(()=>calls)).every(x=>['search','team'].includes(x)));
 await page.close();
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({mobileWidths:[320,390,768],overflow:false,leadershipLimit:4,backRestore:'pass',photoToggle:'pass',revocation:'pass',pickerFilters:'pass',actualEditorTap:['Android','iPhone'],draftPreserved:'pass',pageErrors:0}));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
