const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');let browser;
(async()=>{
 browser=await chromium.launch({headless:true,...(process.env.ROYAL_CHROMIUM_PATH?{executablePath:process.env.ROYAL_CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-gpu']});const errors=[];
 const css=[...fs.readFileSync(path.join(root,'app-v0600.html'),'utf8').matchAll(/<link[^>]+href="([^?]+\.css)/g)].map(m=>m[1]);
 for(const width of (process.env.ROYAL_TEST_WIDTHS?JSON.parse(process.env.ROYAL_TEST_WIDTHS):[320,390,768])){
  const admin=width!==320,page=await browser.newPage({viewport:{width,height:844},isMobile:true,hasTouch:true});page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://fixture.invalid/assets/rm-emblems/*',route=>{const id=new URL(route.request().url()).pathname.match(/\/(\d+)\.webp$/)?.[1];return id&&Number(id)<176?route.fulfill({contentType:'image/webp',body:fs.readFileSync(path.join(root,'assets/rm-emblems',id+'.webp'))}):route.abort();});
  await page.setContent('<base href="http://fixture.invalid/"><meta name="viewport" content="width=device-width,initial-scale=1"><div class="app"><main id="panel" class="panel '+(admin?'royal-admin-screen':'')+'"><section '+(admin?'class="royal-admin-team-detail-shell" data-admin-team="1" data-admin-team-name="FORTUNA" data-admin-team-full-game="Royal Match"':'')+'><div class="team-photo-box"><img class="team-photo" alt="Saved screenshot"><div class="team-photo-fallback">🏰</div></div><div class="team-detail-head"><h2>FORTUNA</h2><div class="muted">Royal Match</div></div><button data-admin-edit-team="1">Редактировать</button><div class="team-members-list">CRM members preserved</div></section></main></div>');
  for(const name of css)await page.addStyleTag({path:path.join(root,name)});
  await page.evaluate(({admin,width})=>{
   window.__ROYAL_BUILD__='0.6.1';window.sessionToken='fixture';window.snapshotState={teams:[{name:'FORTUNA',game:'Royal Match',gameTeamId:'12'}]};window.RoyalAdminDataV0600={current:{adminData:{teams:snapshotState.teams}}};window.calls=0;window.mode=width===390?'slow':'good';window.failure=true;
   window.fixture={teamId:'12',name:'FORTUNA',description:'🕊️116 побед подряд!✈️RWstydy\n🛒 Marina_super_j',memberCount:48,capacity:50,score:355783,minLevel:0,minCrowns:0,type:'Открытая',logo:126,leadership:['Ochki mne','Nurochka','JluceH0K'].map((name,i)=>({name,userId:String(i+1),role:i===0?'Лидер':'Помощник',crowns:0,help:i,level:i===0?7837:i===1?14772:19995})),fetchedAt:new Date().toISOString(),stale:false};
   window.fetch=async()=>{calls++;if(mode==='fail')throw new TypeError('Failed to fetch');if(mode==='slow'){if(failure){failure=false;throw new TypeError('Failed to fetch');}await new Promise(r=>setTimeout(r,6000));}return Response.json({ok:true,data:fixture});};
  },{admin,width});
  for(const name of ['transport-v0514.js','team-emblems-v061.js','admin-edit-ux-v061.js'])await page.addScriptTag({path:name==='admin-edit-ux-v061.js'&&process.env.ROYAL_TEST_EDIT_UX?process.env.ROYAL_TEST_EDIT_UX:path.join(root,name)});
  await page.addScriptTag({path:process.env.ROYAL_TEST_TEAM_LIVE||path.join(root,'team-live-v061.js')});
  await page.waitForTimeout(450);assert.equal(await page.locator('.team-live-card').count(),1,'actual admin edit observer cannot remount live card');
  await page.waitForSelector('.team-live-player',{timeout:10000});assert.equal(await page.locator('.team-live-card').count(),1);
  assert.equal(await page.locator('.team-members-list').textContent(),'CRM members preserved');
  const wraps=await page.evaluate(()=>[...document.querySelectorAll('.team-live-player-name b')].map(n=>n.getBoundingClientRect().height/parseFloat(getComputedStyle(n).lineHeight)));assert.ok(wraps.every(n=>n<1.2),'all three reported names fit one line');
  const description=await page.locator('.team-live-description').boundingBox(),summary=await page.locator('.team-live-title').boundingBox();assert.ok(description.width>summary.width*.95,'description uses whole width');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width,'no overflow with real entry CSS');
  await page.evaluate(()=>{fixture.logo=null;});await page.locator('[data-team-live-refresh]').tap();await page.waitForFunction(()=>document.querySelector('.team-live-emblem')?.textContent===''&&!document.querySelector('.team-live-emblem img'));
  assert.ok((await page.locator('.team-live-title h3').boundingBox()).width>120,'missing logo still leaves a full-width team name');
  await page.evaluate(()=>{fixture.logo=126;mode='good';});await page.locator('[data-team-live-refresh]').tap();await page.waitForSelector('.team-live-emblem img');
  await page.locator('.team-live-card').screenshot({path:'/tmp/repaired-card-'+width+'.png'});
  if(admin){
   await page.evaluate(()=>{const modal=document.createElement('div');modal.className='royal-admin-modal-backdrop';modal.dataset.adminWriteModal='1';modal.innerHTML='<div class="royal-admin-modal"><h3>Редактирование</h3><form data-write-team-form="1" class="royal-admin-form"><div class="royal-admin-form-grid"><label class="royal-admin-input"><span>Название</span><input data-write-field="name" value="FORTUNA"></label><label class="royal-admin-input"><span>ID</span><input data-write-field="gameTeamId" value="12"></label></div></form></div>';document.body.appendChild(modal);});
   await page.addScriptTag({path:path.join(root,'admin-team-photo-v0600.js')});await page.waitForTimeout(450);
   assert.equal(await page.locator('[data-write-field="name"]').inputValue(),'FORTUNA');assert.equal(await page.locator('[data-write-field="gameTeamId"]').inputValue(),'12');assert.equal(await page.locator('.team-live-card').count(),1);assert.equal(await page.locator('[data-admin-team-photo-input]').count(),1);
   await page.evaluate(()=>document.querySelector('[data-admin-write-modal]').remove());
  }
  await page.evaluate(()=>{const panel=document.getElementById('panel');panel.querySelector('.team-live-card').remove();mode='fail';panel.innerHTML=panel.innerHTML;});await page.waitForFunction(()=>document.querySelector('[data-team-live-status]').textContent.includes('Не удалось обновить'),{timeout:10000});
  assert.equal(await page.locator('.team-live-card').count(),1);assert.equal(await page.locator('.team-live-player').count(),3);assert.ok(!(await page.locator('.team-live-card').textContent()).includes('Failed to fetch'));assert.ok(!(await page.locator('.team-live-card').textContent()).includes('Получаем сведения'));
  await page.evaluate(()=>{mode='good';});await page.locator('[data-team-live-refresh]').tap();await page.waitForSelector('.team-live-player');assert.equal(await page.locator('.team-live-card').count(),1);
  await page.evaluate(()=>window.dispatchEvent(new Event('royal:access-denied')));assert.equal(await page.locator('.team-live-card').count(),0);
  await page.close();
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({realCSSWidths:[320,390,768],reportedNamesSingleLine:true,descriptionFullWidth:true,adminObserverStable:true,editorFieldsPreserved:true,sixSecondResponse:true,transientRetry:true,errorScreenshotFallback:true,retryRecovery:true,pageErrors:0}));await browser.close();
})().catch(async e=>{console.error(e);await browser?.close();process.exit(1)});
