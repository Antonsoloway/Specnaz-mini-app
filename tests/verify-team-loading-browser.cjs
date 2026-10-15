const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');let browser;
(async()=>{
 browser=await chromium.launch({headless:true,...(process.env.ROYAL_CHROMIUM_PATH?{executablePath:process.env.ROYAL_CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-gpu']});
 for(const admin of [false,true])for(const stall of ['fetch','body']){
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://loading.test/**',r=>r.fulfill({contentType:'text/html',body:'<main id="panel"></main>'}));await page.goto('https://loading.test/');
  await page.evaluate(({admin,stall})=>{
   localStorage.clear();window.sessionToken=btoa(JSON.stringify({tg:'1'}))+'.fixture';window.snapshotState={teams:[{name:'CRM',game:'Royal Match',gameTeamId:'12'}]};window.RoyalAdminDataV0600={current:{adminData:{teams:snapshotState.teams}}};
   window.shell='<section '+(admin?'data-admin-team="1" data-admin-team-name="CRM" data-admin-team-full-game="Royal Match"':'')+'><div class="team-photo-box">Saved screenshot</div><div class="team-detail-head"><h2>CRM</h2><div class="muted">Royal Match</div></div></section>';document.querySelector('#panel').innerHTML=shell;
   window.fixture={teamId:'12',name:'CRM',score:123,leadership:[{name:'Leader',role:'Лидер'}],fetchedAt:'2026-10-15T19:00:00Z'};window.mode=stall;window.calls=0;window.late=[];
   const nativeTimer=setTimeout;window.setTimeout=(f,ms,...args)=>nativeTimer(f,ms===45000?250:ms===10000?50:ms,...args);
   window.fetch=async()=>{calls++;if(mode==='good')return Response.json({ok:true,data:fixture});if(mode==='busy')return Response.json({ok:false,error:'TEAM_LIVE_BUSY'},{status:429});
    const promise=new Promise(resolve=>late.push(resolve));return mode==='body'?{ok:true,status:200,json:()=>promise}:promise;
   };
  },{admin,stall});
  for(const name of ['transport-v0514.js','team-emblems-v061.js','team-live-v061.js'])await page.addScriptTag({path:path.join(root,name)});
  await page.waitForFunction(()=>document.querySelector('[data-team-live-status]').textContent.includes('дольше обычного'));
  await page.waitForFunction(()=>!document.querySelector('[data-team-live-refresh]').disabled);
  assert.equal(await page.locator('.team-live-card').count(),1);assert.ok(!(await page.locator('[data-team-live-content]').textContent()).includes('Получаем'));
  assert.match(await page.locator('[data-team-live-status]').textContent(),/недоступен/);assert.equal(await page.locator('.team-photo-box').isVisible(),true);
  await page.evaluate(()=>{mode='good';});await page.locator('[data-team-live-refresh]').click();await page.waitForSelector('.team-live-facts');assert.equal(await page.locator('.team-live-facts b').first().textContent(),'123');
  await page.evaluate(stall=>{fixture.score=999;for(const resolve of late.splice(0))resolve(stall==='body'?{ok:true,data:fixture}:Response.json({ok:false},{status:403}));},stall);
  await page.waitForTimeout(40);assert.equal(await page.locator('.team-live-facts b').first().textContent(),'123','late body/auth response cannot replace good data');
  await page.evaluate(stall=>{mode=stall;document.querySelector('#panel').innerHTML=shell;},stall);
  await page.waitForSelector('.team-live-facts');assert.equal(await page.locator('.team-live-facts b').first().textContent(),'123','saved data appears immediately on reopen');
  await page.waitForFunction(()=>!document.querySelector('[data-team-live-refresh]').disabled);assert.match(await page.locator('[data-team-live-status]').textContent(),/Последние сохранённые/);
  const before=await page.evaluate(()=>calls);await page.evaluate(()=>{mode='busy';});await page.locator('[data-team-live-refresh]').click();await page.waitForFunction(()=>document.querySelector('[data-team-live-status]').textContent.includes('сессия занята'));
  assert.equal(await page.evaluate(()=>calls),before+1,'busy session is not immediately replayed');assert.equal(await page.locator('.team-live-facts b').first().textContent(),'123');
  // The card's own deadline also works with an independently stuck shared helper.
  await page.evaluate(()=>{window.realHelper=RoyalTeamEmblems.fetchLive;RoyalTeamEmblems.fetchLive=()=>new Promise(()=>{});});await page.locator('[data-team-live-refresh]').click();await page.waitForFunction(()=>!document.querySelector('[data-team-live-refresh]').disabled);
  assert.match(await page.locator('[data-team-live-status]').textContent(),/Последние сохранённые/);
  await page.evaluate(()=>{RoyalTeamEmblems.fetchLive=realHelper;mode='good';fixture.score=456;});await page.locator('[data-team-live-refresh]').click();await page.waitForFunction(()=>document.querySelector('.team-live-facts b')?.textContent==='456');
  await page.evaluate(()=>{window.fullHelper=RoyalTeamEmblems;window.RoyalTeamEmblems=null;mode='body';});await page.locator('[data-team-live-refresh]').click();await page.waitForFunction(()=>!document.querySelector('[data-team-live-refresh]').disabled);
  assert.equal(await page.locator('.team-live-facts b').first().textContent(),'456','standalone response-body timeout retains saved data');
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Team loading: public/admin, ignored abort/stalled JSON, bounded shared and card waits, delayed status, late-result rejection, saved-data retention, busy-session no replay and recovery PASS');await browser.close();
})().catch(async e=>{console.error(e);await browser?.close();process.exit(1)});
