const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');let browser;
(async()=>{
 browser=await chromium.launch({headless:true,...(process.env.ROYAL_CHROMIUM_PATH?{executablePath:process.env.ROYAL_CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-gpu']});
 for(const width of [320,390,768]){
  const page=await browser.newPage({viewport:{width,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><main class="app"><div class="grid"><button class="tile"><span>👥</span><b>Участники</b><small>Поиск и профили</small></button></div><div id="panel"></div></main>');
  for(const m of fs.readFileSync(path.join(root,'app-v0600.html'),'utf8').matchAll(/<link[^>]+href="([^?]+\.css)/g))await page.addStyleTag({path:path.join(root,m[1])});
  await page.evaluate(()=>{
   window.sessionToken='session-one';window.authState={role:{isChatAdmin:true}};window.renderPage=()=>{};window.setActiveNav=()=>{};
   window.mode='online';window.calls=[];window.fetch=async(_,init)=>{
    const body=JSON.parse(init.body);calls.push(body.operation);
    if(mode==='network')throw Error('NETWORK');
    if(mode==='denied')return Response.json({ok:false},{status:403});
    return Response.json({ok:true,data:{agents:[{id:'sosiska',status:mode,level:14800,levelVerified:mode==='online',checkedAt:new Date().toISOString(),lastOnlineAt:new Date().toISOString()}]}});
   };
  });
  await page.addScriptTag({path:path.join(root,'sosiska-v061.js')});await page.addScriptTag({path:path.join(root,'agent-status-v061.js')});
  const card=page.locator('[data-agent-id="sosiska"]');await card.locator('[data-agent-state][data-state="online"]').waitFor();
  assert.match(await card.locator('[data-agent-level]').textContent(),/14\s*800/);
  assert.equal(await card.locator('[data-agent-level]').evaluate(el=>el.getBoundingClientRect().height<24),true);
  assert.equal(await card.evaluate(el=>el.scrollWidth<=el.clientWidth),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.evaluate(()=>{mode='offline';return RoyalAgentStatus.refresh();});assert.equal(await card.locator('[data-agent-state]').textContent(),'Офлайн');assert.match(await card.locator('[data-agent-level]').getAttribute('title'),/Последний подтверждённый/);
  await page.evaluate(()=>{mode='busy';return RoyalAgentStatus.refresh();});assert.equal(await card.locator('[data-agent-state]').textContent(),'Занят');
  await page.evaluate(()=>{mode='network';return RoyalAgentStatus.refresh();});assert.equal(await card.locator('[data-agent-state]').textContent(),'Нет связи');assert.match(await card.locator('[data-agent-level]').textContent(),/800/);
  await page.evaluate(()=>{mode='online';return RoyalAgentStatus.refresh();});await card.locator('[data-agent-state][data-state="online"]').waitFor();
  await page.screenshot({path:'/tmp/agent-status-'+width+'.png',fullPage:true});
  await page.evaluate(()=>{mode='denied';return RoyalAgentStatus.refresh();});assert.equal(await card.locator('[data-agent-self-status]').count(),0);
  const count=await page.evaluate(()=>calls.length);await page.evaluate(()=>{sessionToken='another';authState={role:{isChatAdmin:false}};RoyalAgentStatus.decorate();});assert.equal(await page.evaluate(()=>calls.length),count);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log(JSON.stringify({agentCard:'PASS',widths:[320,390,768],states:['online','offline','busy','network','denied'],liveRequests:0}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>browser?.close());
