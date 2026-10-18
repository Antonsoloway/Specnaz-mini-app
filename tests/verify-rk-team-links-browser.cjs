const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.ROYAL_CHROMIUM_PATH?{executablePath:process.env.ROYAL_CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-gpu']});
 try{
 for(const width of [320,390,768]){
  const page=await browser.newPage({viewport:{width,height:900},isMobile:true,hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://rk-links.test/**',r=>{
   const file=path.join(root,new URL(r.request().url()).pathname);
   if(file.includes(path.sep+'assets'+path.sep)&&fs.existsSync(file))return r.fulfill({body:fs.readFileSync(file),contentType:'image/webp'});
   return r.fulfill({body:'<meta name="viewport" content="width=device-width,initial-scale=1"><main id="panel"></main>',contentType:'text/html'});
  });
  await page.goto('https://rk-links.test/');await page.addStyleTag({content:'body{margin:12px;background:#17212b;color:white;font-family:Arial}#panel{max-width:620px;margin:auto}*{box-sizing:border-box}'});
  for(const f of [...new Set([...fs.readFileSync(path.join(root,'app-v0605.html'),'utf8').matchAll(/href="([^"?]+\.css)/g)].map(m=>m[1]).concat(['admin-write-v0600.css','admin-write-v0600-v2.css','team-live-v061.css','sosiska-v061.css','rk-team-emblems-v064.css']))])await page.addStyleTag({path:path.join(root,f)});
  await page.evaluate(()=>{
   window.API_URL='https://rk-links.test';window.sessionToken=btoa(JSON.stringify({tg:'12345'}))+'.fixture';window.authState={role:{isChatAdmin:true}};window.calls=[];window.snapshotState={teams:[]};window.renderPage=()=>{};window.setActiveNav=()=>{};
   window.payload={ok:true,permissions:{canEdit:true},adminData:{teams:[],participants:[],write:{enabled:true,transport:'worker-signed-hmac',gameTeamLink:{enabled:true,games:['Royal Match','Royal Kingdom']},operations:['updateTeam','createTeam']}}};
   window.RoyalAdminDataV0600={current:payload,accept:x=>x,subscribe(){}};
   window.fetch=async(url,init={})=>{
    if(String(url).includes('/admin-agent')){
     const b=JSON.parse(init.body);calls.push({kind:'agent',...b});
     const t={TeamId:'12',TeamName:b.game==='rk'?'WeAreJustice':'Match Team',Leader:'2',CoLeaders:['3'],Members:[{UserId:'3',Name:'Helper',Level:5401,Crown:100},{UserId:'2',Name:'Leader',Level:5401,Crown:200}],Score:764030,TeamLogo:b.game==='rk'?151:0,Type:false,MinLevel:5400,MinCrown:8000};
     return Response.json({ok:true,data:b.operation==='search'?{candidates:[{teamId:'12',name:t.TeamName}],warnings:[]}:t});
    }
    if(String(url).includes('/admin-write')){const b=JSON.parse(init.body);calls.push({kind:'write',...b});return Response.json({ok:true,requestId:b.requestId,entityType:'team',revision:'r2',record:{...b.payload,...b.payload.changes,revision:'r2'}});}
    if(String(url).includes('team-live')){const g=new URL(url).searchParams.get('game');calls.push({kind:'live',game:g});return Response.json({ok:true,data:{teamId:'12',game:g,name:g==='Royal Kingdom'?'WeAreJustice':'Match Team',logo:g==='Royal Kingdom'?151:0,description:'Friendly & Active players only! ❤️',star:5,weeklyHelp:913,memberCount:49,capacity:50,score:g==='Royal Kingdom'?764030:100,minLevel:5400,minCrowns:8000,type:'Закрытая',leadership:[{userId:'2',name:'Actual leader',role:'Лидер',level:5401,crowns:23830,help:27},{userId:'3',name:'Assistant',role:'Помощник',level:5401,crowns:18766,help:12}],fetchedAt:new Date().toISOString()}});}
    return Response.json(payload);
   };
  });
  const source=fs.readFileSync(path.join(root,'admin-write-v0600-v3.js'),'utf8').replace(/\}\)\(\);\s*$/,'window.__write={state,openTeamModal,closeModal,saveTeam};})();');
  await page.addScriptTag({content:source});
  await page.evaluate(()=>{__write.state.payload=payload;__write.openTeamModal({name:'Original',game:'Royal Kingdom',leader:'Caption',revision:'r1',gameTeamId:'99'});const n=document.createElement('div');n.id='photoDraft';n.textContent='Preserved draft';document.querySelector('[data-write-team-form]').appendChild(n);});
  for(const f of ['sosiska-period-v061.js','team-emblems-v061.js','rk-team-emblems-v064.js','sosiska-v061.js','team-live-v061.js'])await page.addScriptTag({path:path.join(root,f)});
  assert.equal(await page.locator('[data-write-field="gameTeamId"]').isEnabled(),true);
  await page.locator('[data-team-live-pick]').tap();await page.waitForSelector('.sosiska-picker');assert.match(await page.locator('.sosiska-picker h2').textContent(),/РК/);
  await page.locator('[data-sosiska-action="back"]').tap();assert.equal(await page.locator('[data-write-field="name"]').inputValue(),'Original');assert.equal(await page.locator('#photoDraft').textContent(),'Preserved draft');
  await page.locator('[data-team-live-pick]').tap();await page.locator('[data-sosiska-search] input').fill('Justice');await page.locator('[data-sosiska-search] button').tap();await page.waitForSelector('[data-sosiska-action="bind"]');
  await page.locator('[name="scoreMin"]').fill('1000');await page.locator('[data-sosiska-filters] button').first().tap();await page.waitForFunction(()=>document.querySelector('[data-sosiska-action="bind"]')?.disabled===false);
  await page.locator('[data-sosiska-action="bind"]').tap();await page.waitForFunction(()=>!document.querySelector('.team-live-picker-backdrop'));
  assert.equal(await page.locator('[data-write-field="name"]').inputValue(),'WeAreJustice');assert.equal(await page.locator('[data-write-field="gameTeamId"]').inputValue(),'12');assert.equal(await page.locator('#photoDraft').textContent(),'Preserved draft');
  await page.evaluate(()=>__write.saveTeam(document.querySelector('[data-write-team-form]')));
  const saved=await page.evaluate(()=>calls.find(c=>c.kind==='write'));assert.equal(saved.payload.game,'Royal Kingdom');assert.equal(saved.payload.changes.gameTeamId,'12');assert.equal(saved.payload.expectedRevision,'r1');
  // A new form switches games, clears the previous game's ID and selects RM agent.
  await page.evaluate(()=>__write.openTeamModal(null,true));await page.locator('[data-write-field="game"]').selectOption('Royal Kingdom');await page.locator('[data-write-field="gameTeamId"]').fill('12');await page.locator('[data-write-field="game"]').selectOption('Royal Match');assert.equal(await page.locator('[data-write-field="gameTeamId"]').inputValue(),'');
  await page.locator('[data-team-live-pick]').tap();await page.locator('[data-sosiska-search] input').fill('Match');await page.locator('[data-sosiska-search] button').tap();await page.waitForSelector('[data-sosiska-action="bind"]');await page.locator('[data-sosiska-action="bind"]').tap();await page.waitForFunction(()=>!document.querySelector('.team-live-picker-backdrop'));
  const games=await page.evaluate(()=>calls.filter(c=>c.kind==='agent').map(c=>c.game||'rm'));assert.ok(games.includes('rk')&&games.includes('rm'));assert.ok((await page.evaluate(()=>calls.filter(c=>c.kind==='agent'))).every(c=>['search','team'].includes(c.operation)));
  await page.evaluate(()=>{__write.closeModal();window.RoyalAdminDataV0600.current.adminData.teams=['Royal Match','Royal Kingdom'].map(game=>({name:'Same',game,gameTeamId:'12'}));window.shell=game=>'<section data-admin-team="1" data-admin-team-name="Same" data-admin-team-full-game="'+game+'"><div class="team-photo-box">Original screenshot</div><div class="team-detail-head"><h2>Same</h2><span class="muted">'+game+'</span></div><div id="crmRoster">CRM members unchanged</div></section>';document.querySelector('#panel').innerHTML=shell('Royal Match');});
  await page.waitForFunction(()=>document.querySelector('.team-live-title h3')?.textContent==='Match Team');
  await page.evaluate(()=>document.querySelector('#panel').innerHTML=shell('Royal Kingdom'));await page.waitForFunction(()=>document.querySelector('.team-live-title h3')?.textContent.startsWith('WeAreJustice'));
  assert.equal(await page.locator('.team-live-emblem .rk-team-emblem').count(),1);assert.equal(await page.locator('.team-live-emblem .rm-team-emblem').count(),0);
  assert.equal(await page.locator('.team-live-player-name small').first().textContent(),'Лидер');assert.equal(await page.locator('.team-live-player-name small').nth(1).textContent(),'Помощник');assert.equal(await page.locator('.team-live-player').count(),2);
  assert.match(await page.locator('.team-live-card').textContent(),/Еженедельная помощь.*913/);assert.match(await page.locator('.team-live-card').textContent(),/Кубки/);assert.equal(await page.locator('#crmRoster').textContent(),'CRM members unchanged');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);await page.locator('.team-live-card').screenshot({path:path.join(os.tmpdir(),'rk-linked-card-'+width+'.png')});
  await page.locator('[data-team-live-photo]').tap();assert.equal(await page.locator('.team-photo-box').isVisible(),true);
  await page.evaluate(()=>{RoyalAdminDataV0600.current.adminData.teams.find(t=>t.game==='Royal Kingdom').gameTeamId='';RoyalTeamLive.decorate();});assert.equal(await page.locator('.team-live-card').count(),0);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('RK linking: real admin form, create/update ID, game switch, correct picker/filters, draft, leader order, RK emblem, cache isolation, photo/unlink, 320/390/768 PASS');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
