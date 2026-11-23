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
    const data=b.operation==='list'?{watches:[{teamId:'1',intervalMinutes:60}]}:b.operation==='team'?chartTeam:b.operation==='history'?{records:b.limit===1?chartSnapshots.slice(0,1):chartSnapshots,nextBefore:null}:b.operation==='analysisStatus'?{available:false}:b.operation==='profile'?{userId:b.userId,name:'<Fast> live',teamId:'1',teamName:'Fixture',level:777,crown:7,stats:{},fetchedAt:'2026-11-20T10:00:00Z'}:null;
    if(data===null)throw Error('Unexpected '+b.operation);
    return Response.json({ok:true,capabilities:{ownerTeamMetrics:true},data});
   };
  });
  for(const f of ['sosiska-period-v061.js','sosiska-v061.js'])await page.addScriptTag({path:path.join(root,f)});
  await page.evaluate(g=>RoyalSosiska.open(g),game);
  await page.locator('[data-sosiska-action="team"]').first().click();await page.waitForSelector('.sosiska-chart');
  await page.locator('[data-team-metric][data-metric="crowns"]').click();
  assert.equal(await page.locator('.sosiska-chart').count(),1,'levels and crowns share ONE chart');
  assert.equal(await page.locator('.sosiska-chart svg path[stroke="#38bdf8"]').count(),1);
  assert.equal(await page.locator('.sosiska-chart svg path[stroke="#fbbf24"]').count(),1);
  assert.equal(await page.locator('.sosiska-chart .sosiska-legend').count(),2);
  assert.match(await page.locator('.sosiska-chart figcaption').textContent(),/уровней\/ч/);
  assert.match(await page.locator('.sosiska-chart figcaption').textContent(),game==='rk'?/кубков\/ч/:/корон\/ч/);
  for(const metric of ['levels','crowns'])assert.equal(await page.locator('[data-team-metric][data-metric="'+metric+'"]').getAttribute('aria-pressed'),'true');
  await page.locator('.sosiska-period-roster > summary').click();
  await page.locator('.sosiska-period-roster [data-sosiska-action="player-profile"][data-player-id="fast"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-player-profile] h4')?.textContent==='<Fast> live');
  await page.locator('[data-sosiska-action="profile-close"]').click();
  await page.evaluate(()=>{
    window.chartBaseline=structuredClone(chartSnapshots);
    const third=structuredClone(chartSnapshots[0]);third.sequence=3;third.snapshot.capturedAt='2026-11-20T11:00:00Z';
    third.changes.from='2026-11-20T10:00:00Z';third.changes.to=third.snapshot.capturedAt;
    for(const m of third.snapshot.raw.Members){
      if(m.UserId==='fast'){m.Level+=14;m.Crown+=10;}
      if(m.UserId==='slow'){m.Level+=4;m.Crown+=2;}
    }
    chartSnapshots=[third,...chartSnapshots];
  });
  await page.locator('[data-sosiska-action="team"][data-team-id="1"]').first().click();
  let rangeFigure=page.locator('.sosiska-chart[data-chart-metrics~="levels"]');
  await rangeFigure.locator('[data-chart-action="select"]').click();
  const summary=rangeFigure.locator('[data-chart-range-summary]');
  assert.equal(await summary.locator('[data-range-total="levels"] b').textContent(),'+27');
  assert.equal(await summary.locator('[data-range-total="crowns"] b').textContent(),'+18');
  const viewport=rangeFigure.locator('[data-chart-viewport]');
  async function dragRange(a,b){
    await viewport.scrollIntoViewIfNeeded();const rect=await viewport.boundingBox();
    const x=f=>rect.x+rect.width*(48+296*f)/360,y=rect.y+rect.height*.5;
    await page.mouse.move(x(a),y);await page.mouse.down();await page.mouse.move(x(b),y,{steps:8});await page.mouse.up();
  }
  await dragRange(.05,.45);
  assert.equal(await summary.locator('[data-range-total="levels"] b').textContent(),'+9');
  assert.equal(await summary.locator('[data-range-total="crowns"] b').textContent(),'+6');
  await dragRange(.95,.55);
  assert.equal(await summary.locator('[data-range-total="levels"] b').textContent(),'+18');
  assert.equal(await summary.locator('[data-range-total="crowns"] b').textContent(),'+12');
  assert.match(await summary.textContent(),/13:00:00.*14:00:00/s);
  await summary.locator('[data-chart-range-bound="start"]').fill('0');
  assert.equal(await summary.locator('[data-range-total="levels"] b').textContent(),'+27');
  await rangeFigure.locator('[data-chart-action="clear-range"]').click();
  assert.equal(await summary.isVisible(),false);
  await page.evaluate(()=>{chartSnapshots=chartBaseline;});
  await page.locator('[data-sosiska-action="team"][data-team-id="1"]').first().click();
  // Remove the extra crown selection before the single metric cases below.
  await page.locator('[data-team-metric][data-metric="crowns"]').click();
  for(const [metric,gains] of [['levels',[7,2]],['crowns',[5,1]],['help',[4,1]],['event',[40,15]]]){
   if(await page.locator('[data-team-metric][data-metric="'+metric+'"]').getAttribute('aria-pressed')!=='true')await page.locator('[data-team-metric][data-metric="'+metric+'"]').click();
   const figure=page.locator('.sosiska-chart[data-chart-metrics~="'+metric+'"]').first(),viewport=figure.locator('[data-chart-viewport]');
   await viewport.scrollIntoViewIfNeeded();const box=await viewport.boundingBox();
   await page.touchscreen.tap(box.x+box.width*.55,box.y+box.height*.5);
   const selection=figure.locator('[data-chart-selection]');await selection.waitFor({state:'visible'});
   const activeSelection=selection.locator('[data-selected-metric="'+metric+'"]');
   assert.deepEqual(await activeSelection.locator('li span').allTextContents(),['<Fast>','Small'],game+' '+metric+' descending contributors');
   assert.deepEqual(await activeSelection.locator('li b').allTextContents(),gains.map(v=>'+'+v));
   assert.match(await selection.textContent(),/12:00:00.*13:00:00/s);
   assert.equal(await selection.locator('img,script').count(),0);
   assert.doesNotMatch(await activeSelection.locator('ol').textContent(),/Idle|Reset|Unknown|Joined/);
   await selection.locator('[data-chart-dismiss]').click();assert.equal(await selection.isVisible(),false);
   // Dragging and pinching must not be mistaken for a tap.
   await viewport.scrollIntoViewIfNeeded();const drag=await viewport.boundingBox();
   await page.mouse.move(drag.x+drag.width*.6,drag.y+drag.height*.5);await page.mouse.down();await page.mouse.move(drag.x+drag.width*.4,drag.y+drag.height*.5,{steps:6});await page.mouse.up();
   assert.equal(await selection.isVisible(),false,'drag keeps list closed');
   await figure.locator('.sosiska-chart-values summary').click();
   await figure.locator('[data-chart-interval-metric="'+metric+'"]').first().click();assert.equal(await selection.isVisible(),true,'keyboard-accessible interval alternative opens list');
   await activeSelection.locator('[data-chart-player="fast"]').click();
   await page.waitForSelector('[data-player-profile]');
   await page.waitForFunction(()=>document.querySelector('[data-player-profile] h4')?.textContent==='<Fast> live');
   assert.equal(await page.locator('[data-player-profile] img,[data-player-profile] script').count(),0);
   const request=await page.evaluate(()=>chartCalls.filter(c=>c.operation==='profile').at(-1));
   assert.equal(request.userId,'fast');assert.equal(request.game,game==='rk'?'rk':undefined);
   await page.locator('[data-sosiska-action="profile-close"]').click();
   assert.equal(await page.locator('[data-player-profile]').count(),0);

  }
  assert.equal(await page.evaluate(()=>chartCalls.some(c=>['capture','watch'].includes(c.operation))),false);
  // Same displayed nickname in another team's history resolves by ID, not name.
  await page.evaluate(()=>{
   const original=window.fetch;
   window.fetch=async(url,init)=>{
    const b=JSON.parse(init.body),res=await original(url,init),data=await res.json();
    if(b.operation==='list')data.data.watches=[{teamId:'1',intervalMinutes:60},{teamId:'2',intervalMinutes:60}];
    if(b.operation==='team'&&b.teamId==='2'){data.data.TeamId='2';data.data.TeamName='Second Team';for(const m of data.data.Members)m.UserId+='2';}
    if(b.operation==='history'&&b.teamId==='2')for(const r of data.data.records){r.snapshot.teamId='2';r.snapshot.raw.TeamName='Second Team';for(const m of r.snapshot.raw.Members)m.UserId+='2';}
    return Response.json(data);
   };
  });
  await page.evaluate(g=>RoyalSosiska.open(g),game);
  await page.locator('[data-sosiska-action="select-team"][data-team-id="1"]').click();
  await page.locator('[data-sosiska-action="select-team"][data-team-id="2"]').click();
  await page.locator('[data-sosiska-action="compare"]').click();await page.waitForSelector('.sosiska-chart');
  const compare=page.locator('.sosiska-chart').first();
  await compare.locator('.sosiska-chart-values summary').click();
  await compare.locator('[data-chart-interval][data-chart-line="1"]').first().click();
  await compare.locator('[data-chart-player="fast2"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-player-profile] h4')?.textContent==='<Fast> live');
  const comparedRequest=await page.evaluate(()=>chartCalls.filter(c=>c.operation==='profile').at(-1));
  assert.equal(comparedRequest.userId,'fast2');
  assert.match(await page.locator('[data-player-profile]').textContent(),/Second Team/);
  await page.close();
 }
 assert.deepEqual(errors,[]);await browser.close();console.log('Chart players: RM/RK x 4 metrics, mobile tap, descending gains, resets/joins/unknown excluded, event scope, escaping, drag and interval alternative PASS');
})().catch(async e=>{console.error(e);await browser?.close();process.exit(1)});
