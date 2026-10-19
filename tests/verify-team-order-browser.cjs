const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');let browser;
(async()=>{
 browser=await chromium.launch({headless:true,...(process.env.ROYAL_CHROMIUM_PATH?{executablePath:process.env.ROYAL_CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-gpu']});
 for(const width of [320,390,768]){
  const page=await browser.newPage({viewport:{width,height:900},isMobile:true,hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<main class="app"><section id="panel" class="panel"></section></main><nav class="bottom-nav"></nav>');
  for(const m of fs.readFileSync(path.join(root,'app-v0612.html'),'utf8').matchAll(/<link[^>]+href="([^?]+\.css)/g))await page.addStyleTag({path:path.join(root,m[1])});
  await page.addScriptTag({content:fs.readFileSync(path.join(root,'app.js'),'utf8').replace(/\nauthenticate\(\);\s*$/, '')});
  await page.evaluate(()=>{
   const rm='Royal Match',rk='Royal Kingdom';
   snapshotState={teams:[{name:'Alpha',game:rm},{name:'Beta',game:rm},{name:'Alpha',game:rk},{name:'Zero',game:rm}].map(t=>({...t,status:'Активен',games:[t.game],memberCount:3})),participants:[
    {telegramId:'1',specnazTrips:20,memberships:[{team:'Alpha',game:rm}]},
    {telegramId:'2',specnazTrips:10,memberships:[{team:'Beta',game:rm}]},
    {telegramId:'3',specnazTrips:10,memberships:[{team:'Beta',game:rm}]},
    {telegramId:'4',specnazTrips:21,memberships:[{team:'Alpha',game:rk}]}
   ]};
   window.RoyalAdminDataV0600={load:async()=>({adminData:{teams:snapshotState.teams.map((t,i)=>({...t,specnazTrips:[20,20,21,0][i],screens:[1,2,3,0][i]})),participants:snapshotState.participants.map(p=>({...p,specnaz:p.specnazTrips,specnazTrips:undefined}))}})};
  });
  for(const file of ['team-identity-fix.js','team-specnaz-order-v0612.js','search-hybrid-v0553.js','active-teams-v0559.js','admin-team-detail-v0600.js'])await page.addScriptTag({path:path.join(root,file)});
  const refs=()=>page.locator('.teams-list .team-card').evaluateAll(nodes=>nodes.map(n=>JSON.parse(decodeURIComponent(n.dataset.team))));
  await page.evaluate(()=>renderTeamsPage());
  assert.deepEqual(await refs(),[['Alpha','Royal Kingdom'],['Beta','Royal Match'],['Alpha','Royal Match'],['Zero','Royal Match']]);
  const input=page.locator('#teamSearch');await input.fill('Alpha');
  await page.waitForFunction(()=>[...document.querySelectorAll('.teams-list .team-card')].filter(n=>!n.hidden).length===2);
  await input.fill('');await page.locator('[data-game-filter="rm"]').click();
  assert.deepEqual(await page.locator('.teams-list .team-card').evaluateAll(nodes=>nodes.filter(n=>!n.hidden).map(n=>JSON.parse(decodeURIComponent(n.dataset.team))[0])),['Beta','Alpha','Zero']);
  await page.evaluate(()=>renderTeamDetail(JSON.stringify(['Beta','Royal Match'])));
  await page.evaluate(()=>renderTeamsPage());assert.equal((await refs())[0][1],'Royal Kingdom');
  assert.deepEqual(await page.evaluate(()=>RoyalActiveTeams.getActiveTeams().map(t=>[t.name,t.game])),[['Alpha','Royal Kingdom'],['Beta','Royal Match'],['Alpha','Royal Match'],['Zero','Royal Match']]);
  await page.evaluate(()=>RoyalAdminTeamDetailV0600.ranking('specnazTrips','','',false));
  assert.deepEqual(await page.locator('[data-admin-ranking-team]').evaluateAll(nodes=>nodes.map(n=>[n.dataset.teamName,n.dataset.teamGame])),[['Alpha','Royal Kingdom'],['Beta','Royal Match'],['Alpha','Royal Match'],['Zero','Royal Match']]);
  await page.evaluate(()=>{snapshotState.participants[0].specnazTrips=50;renderTeamsPage();});
  assert.deepEqual((await refs())[0],['Alpha','Royal Match']);
  assert.equal(await page.evaluate(()=>snapshotState.teams[0].name),'Alpha','source order is retained');
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Team order: native rendering, search, RM filter, return, active teams, private F ranking, fresh score changes at320/390/768 PASS');await browser.close();
})().catch(async e=>{console.error(e);await browser?.close();process.exit(1)});
