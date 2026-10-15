const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');let browser;
(async()=>{
 browser=await chromium.launch({headless:true,...(process.env.ROYAL_CHROMIUM_PATH?{executablePath:process.env.ROYAL_CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-gpu']});
 const names=['🇷🇺СССР ВСЕМ ХАНА','🇷🇺CCCP ROSSIA 1','🇷🇺COBECTu HET','🇷🇺FORTUNA','🇷🇺Anna and ksu 2','🇷🇺ТАВЕРНА ХУТОРОК','🇷🇺НАС НЕ ДОГОНЯТ','🇷🇺Tit Tan','⚡'+('Очень длинное название '.repeat(8))];
 for(const width of [320,390,768]){
  const page=await browser.newPage({viewport:{width,height:900},isMobile:true,hasTouch:true});
  await page.route('https://title.test/assets/rm-emblems/*',route=>route.fulfill({contentType:'image/webp',body:fs.readFileSync(path.join(root,'assets/rm-emblems/136.webp'))}));
  await page.setContent('<base href="https://title.test/"><meta name="viewport" content="width=device-width,initial-scale=1"><main class="app"><section class="panel" id="panel"><div class="teams-list"></div><div class="royal-admin-screen"></div></section></main>');
  for(const m of fs.readFileSync(path.join(root,'app-v0600.html'),'utf8').matchAll(/<link[^>]+href="([^?]+\.css)/g))await page.addStyleTag({path:path.join(root,m[1])});
  const preview=fs.readFileSync(path.join(root,'team-list-preview-v061-v2.js'),'utf8').match(/style.textContent = `([\s\S]*?)`;/)[1];await page.addStyleTag({content:preview});
  await page.evaluate(names=>{
   document.querySelector('.teams-list').innerHTML=names.map((name,i)=>'<button class="team-card '+(i!==7?'active-team-gold-v0559 ':'')+(i===5?'team-game-rk-v0535':'team-game-rm-v0535')+'" data-team="'+encodeURIComponent(JSON.stringify([name,i===5?'Royal Kingdom':'Royal Match']))+'"><div class="team-card-icon royal-team-list-preview-v061">🏰</div><div class="team-card-main"><strong class="rm-team-name">'+((i!==5&&i!==6&&i!==7&&i!==8)?'<img class="rm-team-emblem" src="assets/rm-emblems/136.webp" data-rm-loaded="1"><span class="rm-team-emoji-prefix">🇷🇺</span>'+name.slice(4):name)+'</strong><span>Royal '+(i===5?'Kingdom':'Match')+'</span><small>Участников: 11 · лидеров: 1 · помощников: 3</small></div><span class="chevron">›</span></button>').join('');
   document.querySelector('.royal-admin-screen').innerHTML='<details class="royal-admin-record" data-admin-team="1"><summary><div class="royal-admin-summary-main"><strong>'+names[0]+'</strong><small>Royal Match · строка 1</small></div><span class="royal-admin-status">Активна</span><span>›</span></summary></details>';
  },names);
  await page.waitForFunction(()=>[...document.images].every(img=>img.complete&&img.naturalWidth>0));
  const result=await page.evaluate(()=>[...document.querySelectorAll('.team-card-main>strong')].map(title=>{
   const card=title.closest('.team-card'),media=card.querySelector('.team-card-icon'),name=title.getBoundingClientRect(),photo=media.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(title);
   return {nowrap:getComputedStyle(title).whiteSpace,top:name.top,bottom:name.bottom,photoTop:photo.top,width:name.width,cardWidth:card.clientWidth,textFits:title.scrollWidth<=title.clientWidth+1,contentHeight:range.getBoundingClientRect().height,raw:title.textContent,ref:JSON.parse(decodeURIComponent(card.dataset.team))[0]};
  }));
  for(const [i,r] of result.entries()){
   assert.equal(r.nowrap,'nowrap');assert.ok(r.contentHeight<=40,'emblem and text share one visual line');assert.equal(r.raw,r.ref,'raw CRM identity preserved');
   assert.ok(r.bottom<=r.photoTop+1,'title above photo, never squeezed beside it');
   assert.ok(r.width>r.cardWidth-36,'title uses full card width');
   if(i<8)assert.ok(r.textFits,`owner name fits at${width}: ${r.raw}`);
  }
  assert.equal(result.at(-1).textFits,false,'extreme name is clipped instead of wrapping');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width,'no page overflow');
  assert.equal(await page.locator('.royal-admin-summary-main strong').evaluate(n=>getComputedStyle(n).whiteSpace),'nowrap');
  await page.locator('.team-card').nth(5).click();assert.equal(await page.locator('.team-card').count(),names.length);
  await page.screenshot({path:'/tmp/team-title-'+width+'.png',fullPage:true});await page.close();
 }
 console.log('Team titles: full app and preview styles, widths320/390/768, owner names single-line/unclipped, extreme ellipsis, media below title, RM/RK/unlinked/admin identities preserved PASS');await browser.close();
})().catch(async e=>{console.error(e);await browser?.close();process.exit(1)});
