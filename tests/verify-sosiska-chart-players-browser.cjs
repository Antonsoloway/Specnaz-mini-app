const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');let browser;
(async()=>{
 browser=await chromium.launch({headless:true,...(process.env.ROYAL_CHROMIUM_PATH?{executablePath:process.env.ROYAL_CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-gpu']});
 const errors=[];
 for(const game of ['rm','rk']){
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><div class="grid"></div><main id="panel"></main>');
  await page.addStyleTag({path:path.join(root,'sosiska-v061.css')});
  await page.evaluate(()=>{
   window.sessionToken='fixture';window.authState={role:{isChatAdmin:true}};window.activePage='home';window.setActiveNav=()=>{};
   const members=n=>[
    {UserId:'slow',Name:'Small',Level:100+n*2,Crown:20+n,HelpCount:n},
    {UserId:'fast',Name:'<Fast>',Level:100+n*7,Crown:20+n*5,HelpCount:n*4},
    {UserId:'idle',Name:'Idle',Level:100,Crown:10,HelpCount:0},
    {UserId:'reset',Name:'Reset',Level:100-n,Crown:10-n,HelpCount:10-n},
    {UserId:'unknown',Name:'Unknown',Level:null,Crown:null,HelpCount:null},
    ...(n?[{UserId:'joined',Name:'Joined',Level:9000,Crown:9000,HelpCount:9000}]:[])
   ];
   window.chartTeam={TeamId:'1',TeamName:'Fixture',Members:members(1),Leader:'fast',CoLeaders:[],MinLevel:0,MinCrown:0,Type:true,Description:''};
   window.chartSnapshots=[2,1].map(n=>({sequence:n,snapshot:{teamId:'1',capturedAt:n===1?'2026-11-20T09:00:00Z':'2026-11-20T10:00:00Z',raw:{TeamName:'Fixture',Members:members(n-1)},tournament:{available:true,kind:'battle',eventId:101,groupId:'g',teamScore:(n-1)*55,players:[{userId:'fast',name:'<Fast>',score:(n-1)*40},{userId:'slow',name:'Small',score:(n-1)*15}]}},changes:{baseline:n===1,from:'2026-11-20T09:00:00Z',to:'2026-11-20T10:00:00Z',tournament:{comparable:n===2,teamScoreDelta:55,players:[{userId:'fast',name:'<Fast>',delta:40},{userId:'slow',name:'Small',delta:15}]}}}));
   window.chartCalls=[];
   window.fetch=async(_,init)=>{
    const b=JSON.parse(init.body);chartCalls.push(b);
    const data=b.operation==='list'?{watches:[{teamId:'1',intervalMinutes:60}]}:b.operation==='team'?chartTeam:b.operation==='history'?{records:b.limit===1?chartSnapshots.slice(0,1):chartSnapshots,nextBefore:null}:b.operation==='analysisStatus'?{available:false}:null;
    if(data===null)throw Error('Unexpected '+b.operation);
    return Response.json({ok:true,capabilities:{ownerTeamMetrics:true},data});
   };
  });
  for(const f of ['sosiska-period-v061.js','sosiska-v061.js'])await page.addScriptTag({path:path.join(root,f)});
  await page.evaluate(g=>RoyalSosiska.open(g),game);
  await page.locator('[data-sosiska-action="team"]').first().click();await page.waitForSelector('.sosiska-chart');
  for(const [metric,gains] of [['levels',[7,2]],['crowns',[5,1]],['help',[4,1]],['event',[40,15]]]){
   await page.locator('[data-metric="'+metric+'"]').first().click();
   const figure=page.locator('.sosiska-chart').first(),viewport=figure.locator('[data-chart-viewport]');
   await viewport.scrollIntoViewIfNeeded();const box=await viewport.boundingBox();
   await page.touchscreen.tap(box.x+box.width*.55,box.y+box.height*.5);
   const selection=figure.locator('[data-chart-selection]');await selection.waitFor({state:'visible'});
   assert.deepEqual(await selection.locator('li span').allTextContents(),['<Fast>','Small'],game+' '+metric+' descending contributors');
   assert.deepEqual(await selection.locator('li b').allTextContents(),gains.map(v=>'+'+v));
   assert.match(await selection.textContent(),/12:00:00.*13:00:00/s);
   assert.equal(await selection.locator('img,script').count(),0);
   assert.doesNotMatch(await selection.locator('ol').textContent(),/Idle|Reset|Unknown|Joined/);
   await selection.locator('[data-chart-dismiss]').click();assert.equal(await selection.isVisible(),false);
   // Dragging and pinching must not be mistaken for a tap.
   await viewport.scrollIntoViewIfNeeded();const drag=await viewport.boundingBox();
   await page.mouse.move(drag.x+drag.width*.6,drag.y+drag.height*.5);await page.mouse.down();await page.mouse.move(drag.x+drag.width*.4,drag.y+drag.height*.5,{steps:6});await page.mouse.up();
   assert.equal(await selection.isVisible(),false,'drag keeps list closed');
   await figure.locator('.sosiska-chart-values summary').click();
   await figure.locator('[data-chart-interval]').first().click();assert.equal(await selection.isVisible(),true,'keyboard-accessible interval alternative opens list');
  }
  assert.equal(await page.evaluate(()=>chartCalls.some(c=>['capture','watch'].includes(c.operation))),false);
  await page.close();
 }
 assert.deepEqual(errors,[]);await browser.close();console.log('Chart players: RM/RK x 4 metrics, mobile tap, descending gains, resets/joins/unknown excluded, event scope, escaping, drag and interval alternative PASS');
})().catch(async e=>{console.error(e);await browser?.close();process.exit(1)});
