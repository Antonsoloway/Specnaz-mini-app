const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');let browser;
(async()=>{
 browser=await chromium.launch({headless:true,...(process.env.ROYAL_CHROMIUM_PATH?{executablePath:process.env.ROYAL_CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-gpu']});
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<main id="panel"></main>');
 await page.evaluate(()=>{
  window.sessionToken='fixture';window.calls=0;window.responses=[];
  window.RoyalAdminDataV0600={current:{adminData:{teams:[{name:'FORTUNA',game:'Royal Match',gameTeamId:'12'},{name:'SECOND',game:'Royal Match',gameTeamId:'13'}]}}};
  window.fetch=()=>{calls++;return new Promise((resolve,reject)=>responses.push({resolve,reject}));};
  window.mount=(name='FORTUNA',id='12',game='Royal Match')=>{document.querySelector('#panel').innerHTML='<form data-write-team-form="1"><select data-write-field="game"><option>'+game+'</option></select><input data-write-field="name"><input data-write-field="gameTeamId"><input data-write-field="leader" value="Marina"><button type="button" data-team-live-pick>Bind</button><div id="photoDraft">Saved photo draft</div></form>';document.querySelector('[data-write-field="name"]').value=name;document.querySelector('[data-write-field="gameTeamId"]').value=id;};
  window.RoyalSosiska={pickTeam(choose){window.choose=choose;}};
 });
 for(const f of ['team-emblems-v061.js','team-live-v061.js'])await page.addScriptTag({path:path.join(root,f)});
 const input=()=>page.locator('[data-write-field="name"]');
 await page.evaluate(()=>mount());await page.waitForFunction(()=>calls===1);assert.equal(await input().inputValue(),'FORTUNA');
 await page.evaluate(()=>responses.shift().resolve(Response.json({ok:true,data:{teamId:'12',logo:136}})));await page.waitForFunction(()=>document.querySelector('[data-write-field="name"]').value==='🇷🇺FORTUNA');
 assert.equal(await page.locator('[data-write-field="leader"]').inputValue(),'Marina');assert.equal(await page.locator('#photoDraft').textContent(),'Saved photo draft');
 // Existing manual emoji survives reopening, with no request for metadata.
 await page.evaluate(()=>mount('⚡ FORTUNA'));await page.waitForTimeout(50);assert.equal(await input().inputValue(),'⚡FORTUNA');assert.equal(await page.evaluate(()=>calls),1);
 // Slow read must never overwrite typing or a changed link/game.
 await page.evaluate(()=>mount('SECOND','13'));await page.waitForFunction(()=>calls===2);await input().fill('My custom title');await page.evaluate(()=>responses.shift().resolve(Response.json({ok:true,data:{teamId:'13',logo:136}})));await page.waitForTimeout(50);assert.equal(await input().inputValue(),'My custom title');
 await page.evaluate(()=>{window.dispatchEvent(new Event('royal:auth-ready'));mount('SECOND','13');});await page.waitForFunction(()=>calls===3);await page.evaluate(()=>{document.querySelector('[data-write-field="gameTeamId"]').value='99';responses.shift().resolve(Response.json({ok:true,data:{teamId:'13',logo:136}}));});await page.waitForTimeout(50);assert.equal(await input().inputValue(),'SECOND');
 await page.evaluate(()=>mount('FORTUNA','12','Royal Kingdom'));await page.waitForTimeout(50);assert.equal(await input().inputValue(),'FORTUNA');assert.equal(await page.evaluate(()=>calls),3);
 // Picker supplies the prefix before normal Save; repeated binding is idempotent.
 await page.evaluate(()=>mount('Draft',''));await page.locator('[data-team-live-pick]').click();await page.evaluate(()=>choose({TeamId:'12',TeamName:'FORTUNA',Logo:136}));assert.equal(await input().inputValue(),'🇷🇺FORTUNA');
 await page.locator('[data-team-live-pick]').click();await page.evaluate(()=>choose({TeamId:'12',TeamName:'🇷🇺 FORTUNA',TeamLogo:136}));assert.equal(await input().inputValue(),'🇷🇺FORTUNA');
 await page.locator('[data-team-live-pick]').click();await page.evaluate(()=>choose({TeamId:'12',TeamName:'FORTUNA',Logo:999}));assert.equal(await input().inputValue(),'FORTUNA');
 assert.deepEqual(errors,[]);console.log('team emoji: existing linked editor, Russia prefix, manual edits, ID/game race guards, RK exclusion, picker, no duplicates, unknown logo PASS');await browser.close();
})().catch(async e=>{console.error(e);await browser?.close();process.exit(1)});
