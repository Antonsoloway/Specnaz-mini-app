const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
  const server=http.createServer((req,res)=>{
    const target=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://fixture').pathname));
    if(!target.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    try {const bytes=fs.readFileSync(target);res.setHeader('Content-Type',target.endsWith('.webp')?'image/webp':target.endsWith('.css')?'text/css':'text/javascript');res.end(bytes);}
    catch {res.writeHead(404).end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,...(process.env.ROYAL_CHROMIUM_PATH?{executablePath:process.env.ROYAL_CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-gpu']});
  try {
    for(const width of [320,390,768]){
      const page=await browser.newPage({viewport:{width,height:800},isMobile:true,hasTouch:true});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.setContent('<base href="'+base+'/"><meta name="viewport" content="width=device-width,initial-scale=1"><main id="panel"></main>');
      await page.addStyleTag({path:path.join(root,'rk-team-emblems-v064.css')});
      await page.addScriptTag({path:path.join(root,'rk-team-emblems-v064.js')});
      const list=await page.evaluate(async()=>{
        const api=window.RoyalKingdomEmblems;
        const markup=api.name('<BOLTAMnet>', 'rk-0',0)+api.name('Конец','rk-183',183)+api.name('Без эмблемы','rk-unknown',999);
        document.querySelector('#panel').innerHTML=markup;
        const img=document.querySelector('.rk-team-emblem');
        await new Promise((resolve,reject)=>{if(img.complete){resolve();return;}img.addEventListener('load',resolve,{once:true});img.addEventListener('error',reject,{once:true});});
        return {count:document.querySelectorAll('.rk-team-emblem').length,first:img.getAttribute('data-rk-logo'),label:document.querySelector('.rk-team-label').textContent,naturalWidth:img.naturalWidth,hasRm:!!document.querySelector('.rm-team-emblem'),last:document.querySelectorAll('.rk-team-emblem')[1].getAttribute('data-rk-logo')};
      });
      assert.deepEqual(list,{count:2,first:'0',label:'<BOLTAMnet>',naturalWidth:160,hasRm:false,last:'183'});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width,'No horizontal scroll');
      if(width===320){
        const bad=await page.evaluate(async()=>{
          const api=window.RoyalKingdomEmblems;
          const results=await Promise.all(Array.from({length:184},(_,id)=>new Promise(resolve=>{
            const template=document.createElement('template');template.innerHTML=api.image(id);
            const image=template.content.firstElementChild;
            image.onload=()=>resolve(image.naturalWidth===160&&image.naturalHeight===176?null:id);
            image.onerror=()=>resolve(id);document.body.appendChild(image);
          })));
          return results.filter(v=>v!==null);
        });
        assert.deepEqual(bad,[],'All RK image IDs must decode in Chromium');
      }
      // The raw saved name survives while its prefix is visually replaced by the image.
      await page.evaluate(()=>{document.querySelector('#panel').innerHTML=RoyalKingdomEmblems.name('🇷🇺FORTUNA','22',144);});
      await page.waitForFunction(()=>document.querySelector('.rk-team-emblem')?.dataset.rkLoaded==='1');
      assert.equal(await page.locator('.rk-team-label').textContent(),'🇷🇺FORTUNA');
      assert.equal(await page.locator('.rk-team-emoji-prefix').isVisible(),false);
      await page.evaluate(()=>document.querySelector('.rk-team-emblem').src='/missing-emblem.webp');
      await page.waitForFunction(()=>document.querySelector('.rk-team-emblem')?.hidden);
      assert.equal(await page.locator('.rk-team-emoji-prefix').isVisible(),true);
      assert.deepEqual(errors,[]);
      await page.close();
    }
    console.log('RK: 184 real images, 0/183 and unknown IDs, no RM fallback, 320/390/768px, no browser errors');
  } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
