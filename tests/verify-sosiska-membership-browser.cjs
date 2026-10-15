const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');let browser;
(async()=>{
 browser=await chromium.launch({headless:true,...(process.env.ROYAL_CHROMIUM_PATH?{executablePath:process.env.ROYAL_CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-gpu']});const errors=[];
 for(const width of [320,390,768]){
 const page=await browser.newPage({viewport:{width,height:844}});page.on('pageerror',e=>errors.push(e.message));await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><div class="grid"></div><main id="panel"></main>');
 const css=[...fs.readFileSync(path.join(root,'app-v0600.html'),'utf8').matchAll(/<link[^>]+href="([^?]+\.css)/g)].map(m=>m[1]);for(const f of css)await page.addStyleTag({path:path.join(root,f)});
 await page.evaluate(()=>{
  window.sessionToken='fixture';window.authState={role:{isChatAdmin:true}};window.calls=[];window.activePage='home';window.setActiveNav=()=>{};window.mode='normal';
  const m=id=>({UserId:id,Name:id==='A'?'Returned':id==='B'?'Same name':id==='C'?'Same name':'Original',Level:14772,Crown:4311,HelpCount:100});
  const snapshots={6:['A','C','D'],5:['A','D'],4:['B','D'],3:['A','B','D'],2:['A','B','D'],1:['A','D']};
  window.records=Object.entries(snapshots).map(([n,ids])=>({sequence:Number(n),snapshot:{teamId:'1',capturedAt:new Date(Date.UTC(2026,9,13,Number(n))).toISOString(),raw:{TeamName:'Test',Members:ids.map(m)}},changes:{baseline:n==='1'}})).reverse();
  window.team={TeamId:'1',TeamName:'Test',Description:'Test membership',Members:['A','C','D'].map(m),Leader:'D',CoLeaders:[],MinLevel:0,MinCrown:0,Type:true};
  window.fetch=async(_,init)=>{const b=JSON.parse(init.body);calls.push(b);let data;
   if(b.operation==='list')data={watches:[{teamId:'1',intervalMinutes:60}]};
   else if(b.operation==='team')data=team;
   else if(b.operation==='analysisStatus')data={available:false};
   else if(b.operation==='history'){if(mode==='empty')data={records:[],nextBefore:null};else if(b.limit===1)data={records:records.slice(0,1)};else if(mode==='gap')data={records:[records[0],records[2]],nextBefore:null};else if(!b.before)data={records:records.slice(0,3),nextBefore:records.slice(0,3).at(-1).sequence};else data={records:records.slice(3),nextBefore:null};}
   else if(b.operation==='capture'){team.Members.push(m('E'));records.unshift({sequence:7,snapshot:{teamId:'1',capturedAt:new Date(Date.UTC(2026,9,13,7)).toISOString(),raw:{TeamName:'Test',Members:team.Members}},changes:{baseline:false}});data={};}
   else if(b.operation==='profile')data={userId:b.userId,name:'Profile',stats:{}};
   else throw Error('Unexpected operation '+b.operation);
   return Response.json({ok:true,data});};
 });
 for(const f of ['sosiska-period-v061.js','sosiska-v061.js'])await page.addScriptTag({path:path.join(root,f)});
 await page.evaluate(()=>RoyalSosiska.open());await page.locator('[data-sosiska-action="team"]').click();await page.waitForFunction(()=>document.querySelector('[data-sosiska-action="new-members"]')?.textContent==='Новенькие · 3'&&!document.querySelector('.sosiska-screen').getAttribute('aria-busy').includes('true'));
 assert.equal(await page.locator('[data-sosiska-action="left-members"]').textContent(),'Выбывшие · 2');
 await page.locator('[data-sosiska-action="new-members"]').click();assert.equal(await page.locator('[data-membership-view="joined"] [data-membership-player]').count(),3);assert.equal(await page.locator('[data-membership-player="D"]').count(),0,'baseline-only player is not new');assert.equal(await page.locator('[data-membership-player="B"]').count(),1,'departed newcomer retained');assert.match(await page.locator('[data-membership-player="A"]').textContent(),/Вернулся/);
 await page.locator('[data-sosiska-action="left-members"]').click();assert.equal(await page.locator('[data-membership-view="left"] [data-membership-player]').count(),2);assert.match(await page.locator('[data-membership-player="A"]').textContent(),/Вернулся/);assert.match(await page.locator('[data-membership-player="B"]').textContent(),/Выбыл/);assert.ok(await page.locator('.sosiska-membership-events').first().textContent());
 await page.locator('[data-sosiska-action="roster-view"]').click();assert.equal(await page.locator('.sosiska-member.is-left[data-player-id="B"]').count(),1);assert.equal(await page.locator('.sosiska-member.is-new[data-player-id="A"]').count(),1);assert.equal(await page.locator('.sosiska-member.is-new[data-player-id="C"]').count(),1);assert.equal(await page.locator('.sosiska-member[data-player-id="D"]').getAttribute('class'),'sosiska-member');
 const colors=await page.evaluate(()=>['A','B'].map(id=>getComputedStyle(document.querySelector('.sosiska-member[data-player-id="'+id+'"]').querySelector('.sosiska-membership-badge')).backgroundColor));assert.notEqual(colors[0],colors[1]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width,'mobile overflow');
 await page.locator('.sosiska-member.is-left button').click();await page.waitForSelector('.sosiska-player-detail');assert.equal(await page.evaluate(()=>calls.filter(c=>c.operation==='profile').length),0,'departed player uses history, not current-profile lookup');
 await page.locator('[data-sosiska-action="team"]').click();await page.locator('[data-sosiska-action="new-members"]').click();assert.equal(await page.locator('[data-membership-player]').count(),3,'reopen no duplicates');
 await page.locator('details').filter({has:page.locator('[data-sosiska-action="capture"]')}).locator('summary').click();await page.locator('[data-sosiska-action="capture"]').click();await page.waitForFunction(()=>document.querySelector('[data-sosiska-action="new-members"]')?.textContent==='Новенькие · 4'&&document.querySelector('.sosiska-screen').getAttribute('aria-busy')==='false');assert.equal(await page.locator('[data-membership-view="joined"] [data-membership-player]').count(),4,'capture refreshes membership without leaving chosen tab');
 await page.evaluate(()=>{mode='empty';});await page.locator('[data-sosiska-action="team"]').click();await page.locator('[data-sosiska-action="new-members"]').click();assert.match(await page.locator('[data-membership-view]').textContent(),/Снимков пока нет/);
 await page.evaluate(()=>{mode='gap';});await page.locator('[data-sosiska-action="team"]').click();await page.locator('[data-sosiska-action="left-members"]').click();assert.match(await page.locator('[data-membership-view]').textContent(),/не полностью/);
 await page.close();
 }
 assert.deepEqual(errors,[]);console.log('membership history: all pages, newcomers/exits/returns/baseline, same-name IDs, red/green roster, historical player drilldown, reopen/empty/gap,320/390/768 no overflow PASS');await browser.close();
})().catch(async e=>{console.error(e);await browser?.close();process.exit(1)});
