const {chromium}=require('playwright'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');let browser;
(async()=>{
 const {performFolderAction}=await import('../worker/src/sosiska-watch-folders.js');
 browser=await chromium.launch({headless:true,...(process.env.ROYAL_CHROMIUM_PATH?{executablePath:process.env.ROYAL_CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-gpu']});
 for(const width of [320,390,768])for(const game of ['rm','rk']){
  const data=new Map(),storage={get:async k=>structuredClone(data.get(k)),put:async(k,v)=>data.set(k,structuredClone(v))},calls=[];
  const page=await browser.newPage({viewport:{width,height:844},hasTouch:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/admin-agent',async route=>{
   const b=route.request().postDataJSON();calls.push(b);let status=200,out;
   try{
    if(['folders','folderSave','folderDelete'].includes(b.operation))out=await performFolderAction(storage,b);
    else if(b.operation==='list')out={watches:['1','2','3'].map(teamId=>({teamId,teamName:'Team '+teamId,teamLogo:null,intervalMinutes:60}))};
    else if(b.operation==='team')out={Status:0,TeamId:b.teamId,TeamName:'Team '+b.teamId,Members:[]};
    else if(b.operation==='history')out={records:[],nextBefore:null};
    else if(b.operation==='analysisStatus')out={available:false};
    else throw Error('Unexpected '+b.operation);
   }catch(e){status=e.status||500;out=null;}
   await route.fulfill({status,contentType:'application/json',body:JSON.stringify({ok:status===200,data:out,message:status===409?'Папки уже изменены. Обновите список.':undefined})});
  });
  await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><div class="grid"></div><main id="panel"></main>');
  await page.addStyleTag({path:path.join(root,'style.css')});await page.addStyleTag({path:path.join(root,'sosiska-v061.css')});
  await page.evaluate(()=>{window.sessionToken='fixture';window.authState={role:{isChatAdmin:true}};window.activePage='home';window.setActiveNav=()=>{};});
  for(const f of ['sosiska-period-v061.js','sosiska-v061.js'])await page.addScriptTag({path:path.join(root,f)});
  await page.evaluate(g=>RoyalSosiska.open(g),game);
  const action=a=>page.locator('[data-sosiska-action="'+a+'"]');
  await action('folder-create').click();
  await page.locator('[name="folderName"]').fill('<img src=x onerror=alert(1)> Маяк');
  await page.locator('[name="folderTeam"][value="1"]').check();await page.locator('[name="folderTeam"][value="2"]').check();
  await page.locator('[data-sosiska-folder-form] button:not([type="button"])').click();
  await action('folder-edit').waitFor();assert.equal(await page.locator('[data-sosiska-watch-name]').count(),2);
  assert.equal(await page.locator('[data-sosiska-folders] img').count(),0,'title escaped');
  await action('folder-back').click();assert.equal(await page.locator('.sosiska-folder-list article').count(),1);
  assert.equal(await page.locator('[data-sosiska-watch-name]').textContent(),'Team 3');
  await action('folder-open').click();await action('folder-edit').click();
  await page.locator('[name="folderName"]').fill('Маяк 2');await page.locator('[name="folderTeam"][value="2"]').uncheck();
  await page.locator('[data-sosiska-folder-form] button:not([type="button"])').click();
  await page.waitForFunction(()=>document.querySelector('[data-sosiska-folders] h4')?.textContent==='📁 Маяк 2');
  assert.equal(await page.locator('[data-sosiska-watch-name]').count(),1);
  // Reopen must retrieve durable settings and render folder in the list.
  await page.evaluate(g=>RoyalSosiska.open(g),game);await action('folder-open').click();
  assert.equal(await page.locator('[data-sosiska-watch-name]').textContent(),'Team 1');
  page.once('dialog',d=>d.accept());await action('folder-delete').click();
  await page.waitForFunction(()=>!document.querySelector('[data-sosiska-action="folder-open"]')&&document.querySelectorAll('[data-sosiska-watch-name]').length===3);
  assert.equal(calls.some(c=>['watch','unwatch','capture'].includes(c.operation)),false);
  assert.ok(calls.every(c=>(c.game||'rm')===game),'game routes isolated');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow '+width);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Folders browser: RM/RK create, multi-select, edit, reopen, delete, escaping and 320/390/768 layouts PASS');
 await browser.close();
})().catch(async e=>{console.error(e);await browser?.close();process.exitCode=1;});
