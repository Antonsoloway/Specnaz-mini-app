const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');let browser;
(async()=>{
 browser=await chromium.launch({headless:true,...(process.env.ROYAL_CHROMIUM_PATH?{executablePath:process.env.ROYAL_CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-gpu']});const errors=[];
 for(const width of [320,390,768]){
  const page=await browser.newPage({viewport:{width,height:844}});page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><div class="grid"></div><main id="panel"></main>');
  for(const m of fs.readFileSync(path.join(root,'app-v0600.html'),'utf8').matchAll(/<link[^>]+href="([^?]+\.css)/g))await page.addStyleTag({path:path.join(root,m[1])});
  await page.evaluate(()=>{
   window.sessionToken='fixture';window.authState={role:{isChatAdmin:true}};window.activePage='home';window.setActiveNav=()=>{};window.alerted=false;window.reportMode='legacy';
   const members=delta=>Array.from({length:50},(_,i)=>({UserId:String(i+1),Name:'Игрок '+(i+1),Level:100+i+delta,Crown:i+delta,HelpCount:delta}));
   window.testTeam={TeamId:'1',TeamName:'Тестовая команда',Members:members(3),Leader:'1',CoLeaders:[],MinLevel:0,MinCrown:0,Type:true,Description:'Тест'};
   window.snapshots=[2,1].map(n=>({sequence:n,snapshot:{teamId:'1',capturedAt:n===1?'2026-10-12T00:00:00Z':'2026-10-12T07:00:00Z',raw:{TeamName:'Тестовая команда',Members:members(n===1?0:3)}},changes:{baseline:n===1}}));
   const legacy='## Коротко\nРост **подтверждён**. <img src=x onerror="alerted=true">\n\n### Ключевые игроки\n| Ник | Прирост |\n|---|---|\n| Игрок 1 | **+3** |\n| <script>alerted=true</script> | +2 |\n\n- Подробности по наблюдениям.';
   window.fetch=async(_,init)=>{const b=JSON.parse(init.body);let data;
    if(b.operation==='list')data={watches:[{teamId:'1',intervalMinutes:60}]};
    else if(b.operation==='team')data=testTeam;
    else if(b.operation==='history')data={records:b.limit===1?snapshots.slice(0,1):snapshots,nextBefore:null};
    else if(b.operation==='analysisStatus'){const text=reportMode==='legacy'?legacy:'## Коротко\nПрирост подтверждён.\n\n## Игроки\n- **Игрок 1:** +3 уровня.';data={available:true,state:'done',jobId:'fixture-job',scope:'team',processedSnapshots:2,summary:{text},teams:[{teamId:'1',teamName:'Тестовая команда',count:2,from:snapshots[1].snapshot.capturedAt,to:snapshots[0].snapshot.capturedAt,text}]};}
    else throw Error('Unexpected '+b.operation);
    return Response.json({ok:true,data});
   };
  });
  for(const f of ['sosiska-period-v061.js','sosiska-v061.js'])await page.addScriptTag({path:path.join(root,f)});
  await page.evaluate(()=>RoyalSosiska.open());await page.locator('[data-sosiska-action="team"]').click();await page.waitForSelector('.sosiska-period-roster');
  const roster=page.locator('.sosiska-period-roster');assert.equal(await roster.getAttribute('open'),null);assert.equal(await roster.locator('.sosiska-player').count(),50);assert.equal(await roster.locator('.sosiska-player').first().isVisible(),false,'roster collapsed by default');
  assert.equal(await page.locator('#sosiskaAnalysis .sosiska-analysis').count(),1,'single-team report not duplicated');assert.equal(await page.locator('#sosiskaAnalysis strong').first().textContent(),'подтверждён');assert.equal(await page.locator('#sosiskaAnalysis h4').first().textContent(),'Коротко');
  const table=page.locator('.sosiska-report-table');assert.equal(await table.getAttribute('open'),null);await table.locator('summary').click();assert.equal(await table.locator('dl').count(),2);assert.equal(await page.locator('#sosiskaAnalysis img,#sosiskaAnalysis script').count(),0);assert.equal(await page.evaluate(()=>alerted),false);assert.doesNotMatch(await page.locator('#sosiskaAnalysis').textContent(),/\*\*|###|\|---/);
  await roster.locator(':scope > summary').click();await page.locator('[data-sosiska-action="player"][data-player-id="1"]').click();await page.waitForSelector('.sosiska-player-detail');assert.equal(await roster.getAttribute('open'),'');
  const grid=page.locator('.sosiska-hour-grid');assert.equal(await grid.locator('button').count(),24);assert.ok((await grid.boundingBox()).height<=330,'compact 24-hour grid');
  for(const cell of await grid.locator('button').all()){
   assert.ok((await cell.boundingBox()).height<=51);for(const selector of ['b','span'])assert.equal(await cell.locator(selector).evaluate(el=>{const r=document.createRange();r.selectNodeContents(el);return r.getClientRects().length;}),1,'time/rate never splits into lines');
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width,'no horizontal page overflow');
  await page.locator('.sosiska-player-detail [data-sosiska-action="metric"][data-metric="crowns"]').click();assert.equal(await page.locator('.sosiska-period-roster').getAttribute('open'),'','roster stays open after metric rerender');
  await page.locator('[data-hour="3"]').click();assert.match(await page.locator('.sosiska-hour-days h4').textContent(),/03:00–04:00/);
  if(width===390){await page.locator('.sosiska-hour-grid').screenshot({path:'/tmp/sosiska-compact-hours.png'});await page.locator('#sosiskaAnalysis').screenshot({path:'/tmp/sosiska-readable-analysis.png'});}
  await page.locator('.sosiska-period-roster > summary').click();assert.equal(await page.locator('.sosiska-period-roster .sosiska-player').first().isVisible(),false);
  await page.evaluate(()=>{reportMode='new';});await page.locator('[data-sosiska-action="team"]').click();await page.waitForSelector('#sosiskaAnalysis .sosiska-analysis ul');assert.equal(await page.locator('.sosiska-report-table').count(),0);assert.equal(await page.locator('#sosiskaAnalysis .sosiska-analysis').count(),1);
  if(width===390)await page.locator('#sosiskaAnalysis').screenshot({path:'/tmp/sosiska-new-readable-analysis.png'});
  await page.close();
 }
 assert.deepEqual(errors,[]);await browser.close();console.log('readability: 320/390/768, 50-player collapse/state, legacy Markdown/table cards, XSS escaped, one report, 24 compact unsplit hours, metric/hour details PASS');
})().catch(async e=>{console.error(e);await browser?.close();process.exit(1)});
