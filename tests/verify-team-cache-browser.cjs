const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');let browser;
(async()=>{
 browser=await chromium.launch({headless:true,...(process.env.ROYAL_CHROMIUM_PATH?{executablePath:process.env.ROYAL_CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-gpu']});
 const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://cache.test/**',r=>r.fulfill({contentType:'text/html',body:'<main id="panel"></main>'}));
 const shell='<section><div class="team-photo-box">Saved screenshot</div><div class="team-detail-head"><h2>FORTUNA</h2><div class="muted">Royal Match</div></div></section>';
 async function boot({user='1',admin=false,id='12',blocked=false}={}){
  await page.goto('https://cache.test/');
  await page.evaluate(({user,admin,id,blocked,shell})=>{
   window.sessionToken=btoa(JSON.stringify({tg:user,nonce:Math.random()}))+'.fixture';window.snapshotState={teams:[{name:'FORTUNA',game:'Royal Match',gameTeamId:id}]};window.RoyalAdminDataV0600={current:{adminData:{teams:snapshotState.teams}}};
   document.querySelector('#panel').innerHTML=admin?shell.replace('<section>','<section data-admin-team="1" data-admin-team-name="FORTUNA" data-admin-team-full-game="Royal Match">'):shell;
   window.fixture={teamId:id,name:'FORTUNA',score:111,description:'saved description',leadership:[{name:'Leader',role:'Лидер'}],fetchedAt:'2026-10-15T04:00:00Z'};window.calls=0;window.responses=[];
   window.fetch=()=>{calls++;return new Promise((resolve,reject)=>responses.push({resolve,reject}));};
   if(blocked)Object.defineProperty(window,'localStorage',{get(){throw Error('blocked');}});
  },{user,admin,id,blocked,shell});
  for(const name of ['team-emblems-v061.js','team-live-v061.js'])await page.addScriptTag({path:name==='team-live-v061.js'&&process.env.ROYAL_TEST_TEAM_LIVE?process.env.ROYAL_TEST_TEAM_LIVE:path.join(root,name)});
  await page.waitForFunction(()=>calls===1);
 }
 const score=()=>page.locator('.team-live-facts b').first().textContent();
 async function resolve(scoreValue=111){await page.evaluate(n=>{fixture.score=n;fixture.fetchedAt=n===111?'2026-10-15T04:00:00Z':'2026-10-15T05:00:00Z';responses.shift().resolve(Response.json({ok:true,data:fixture}));},scoreValue);await page.waitForFunction(()=>!document.querySelector('[data-team-live-refresh]').disabled);}
 await boot();await resolve();assert.equal(await score(),'111');
 // Same-page navigation restores before the pending network response finishes.
 await page.evaluate(shell=>{document.querySelector('#panel').innerHTML=shell;},shell);await page.waitForFunction(()=>calls===2);assert.equal(await score(),'111');
 assert.match(await page.locator('[data-team-live-status]').textContent(),/Сохранённые данные.*Обновляем/);
 await resolve(222);assert.equal(await score(),'222');
 // Actual page restart with a fresh session for the same user retains data.
 await boot();assert.equal(await score(),'222');
 await page.evaluate(()=>responses.shift().reject(new TypeError('Failed to fetch')));await page.waitForFunction(()=>calls===2);await page.evaluate(()=>responses.shift().reject(new TypeError('Failed to fetch')));await page.waitForFunction(()=>document.querySelector('[data-team-live-status]').textContent.includes('Не удалось'));
 assert.equal(await score(),'222');assert.match(await page.locator('[data-team-live-status]').textContent(),/15\.10\.2026/);
 // Different account, mode and changed ID must never reuse another cache entry.
 for(const config of [{user:'2'},{admin:true},{id:'13'}]){await boot(config);assert.equal(await page.locator('.team-live-summary').count(),0);}
 await boot();assert.equal(await score(),'222');
 // Auth rejection clears persisted cards; the next launch cannot recover them.
 await page.evaluate(()=>responses.shift().resolve(Response.json({ok:false},{status:403})));await page.waitForFunction(()=>document.querySelector('[data-team-live-status]').textContent.includes('заново'));
 assert.equal(await page.locator('.team-live-summary').count(),0);await boot();assert.equal(await page.locator('.team-live-summary').count(),0);
 await resolve();await page.evaluate(()=>window.dispatchEvent(new Event('royal:access-denied')));assert.equal(await page.locator('.team-live-card').count(),0);
 await boot();assert.equal(await page.locator('.team-live-summary').count(),0);
 await page.evaluate(()=>localStorage.setItem('royal-team-live:v1:3:public','{broken'));await boot({user:'3'});assert.equal(await page.locator('.team-live-summary').count(),0);
 await page.evaluate(()=>responses.shift().reject(new TypeError('Failed to fetch')));await page.waitForFunction(()=>calls===2);await page.evaluate(()=>responses.shift().reject(new TypeError('Failed to fetch')));await page.waitForFunction(()=>document.querySelector('[data-team-live-status]').textContent.includes('недоступен'));assert.equal(await page.locator('.team-photo-box').isVisible(),true);
 // Storage denial is nonfatal and the in-memory fallback still survives navigation.
 await boot({blocked:true});await resolve();await page.evaluate(shell=>{document.querySelector('#panel').innerHTML=shell;},shell);await page.waitForFunction(()=>calls===2);assert.equal(await score(),'111');
 await page.evaluate(()=>{snapshotState.teams[0].gameTeamId='';window.RoyalTeamLive.decorate();});assert.equal(await page.locator('.team-live-card').count(),0);
 assert.deepEqual(errors,[]);console.log('team cache: reopen, page restart, background update, offline retention, user/mode/ID isolation, revocation, storage denial PASS');await browser.close();
})().catch(async e=>{console.error(e);await browser?.close();process.exit(1)});
