const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const primary='royal-crm-miniapp-api.tropical-spoon.workers.dev';
const relay='royal-crm-api-relay.pages.dev';
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.ROYAL_CHROMIUM_PATH?{executablePath:process.env.ROYAL_CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 try {
  for(const offline of [false,true,...(process.env.ROYAL_LIVE_RELAY_CHECK==='1'?['live']:[])]){
   const live=offline==='live';
   const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],calls=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.addInitScript(()=>{window.Telegram={WebApp:{initData:'fixture-only',initDataUnsafe:{user:{id:42,first_name:'Fixture'}},ready(){},expand(){},disableVerticalSwipes(){},onEvent(){},offEvent(){},CloudStorage:{getItem(k,cb){cb(null,null)},setItem(k,v,cb){cb(null,true)}}}}});
   await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if([primary,relay].includes(url.hostname)){
     calls.push({host:url.hostname,path:url.pathname});
     if(offline&&url.hostname===primary)return route.abort('failed');
     if(live&&url.hostname===relay)return route.continue();
     let data={ok:false,error:'FIXTURE_NOT_FOUND'};
     if(url.pathname==='/auth')data={ok:true,access:true,session:'fixture-session',user:{telegramId:'42',crmName:'Fixture'},role:{code:'member',title:'Участник',isChatAdmin:false},memberships:[]};
     if(url.pathname==='/snapshot')data={ok:true,snapshot:{participants:[{telegramId:'42',name:'Fixture',chatState:'В чате',memberships:[]}],teams:[],specnazHistory:{sections:[]}}};
     return route.fulfill({status:data.ok?200:404,contentType:'application/json',body:JSON.stringify(data)});
    }
    if(url.hostname===(live?'antonsoloway.github.io':'fixture.test')){
     const pathname=live?url.pathname.replace('/Specnaz-mini-app',''):url.pathname;
     const file=path.resolve(root,'.'+decodeURIComponent(pathname));
     if(file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({body:fs.readFileSync(file),contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'})[path.extname(file)]||'application/octet-stream'});
    }
    return route.fulfill({status:200,contentType:'application/javascript',body:''});
   });
   const {target}=require('./release-entry-fixture.cjs').activeHtml();
   await page.goto((live?'https://antonsoloway.github.io/Specnaz-mini-app/':'https://fixture.test/')+target);
   if(live){
    await page.waitForFunction(()=>document.querySelector('[data-startup-message]')?.textContent.includes('HASH_MISSING'),{},{timeout:15000});
    assert.equal(await page.evaluate(()=>window.__ROYAL_AUTH_READY__),null);
   }else{
   await page.waitForFunction(()=>window.__ROYAL_AUTH_READY__?.access===true&&document.getElementById('royalStartup').hidden,{},{timeout:12000});
   assert.match(await page.locator('#hello').textContent(),/Fixture/);
   }
   const auth=calls.filter(c=>c.path==='/auth');
   assert.deepEqual(auth.map(c=>c.host),offline?[primary,relay]:[primary]);
   if(!live)assert.ok(calls.some(c=>c.path==='/snapshot'&&c.host===(offline?relay:primary)));
   assert.deepEqual(errors,[]);
   await page.close();
  }
  console.log('Complete active app startup: primary and primary-offline/relay, auth-ready, snapshot, revealed UI PASS');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
