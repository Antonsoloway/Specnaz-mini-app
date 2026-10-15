const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');let browser;
(async()=>{
 browser=await chromium.launch({headless:true,...(process.env.ROYAL_CHROMIUM_PATH?{executablePath:process.env.ROYAL_CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-gpu']});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<div id="panel"><section class="royal-admin-screen"><div class="royal-admin-summary-main"><strong>Old</strong><small>Royal Match</small></div></section></div>');
 await page.evaluate(()=>{
  window.API_URL='https://save.test';window.sessionToken='fixture';window.authState={role:{isChatAdmin:true}};window.snapshotState={};window.calls=[];window.pendingReads=[];window.mode='normal';window.commits=0;window.receipts=new Map();
  window.payload={ok:true,permissions:{canEdit:true},dataHash:'old',adminData:{teams:[{name:'Old',game:'Royal Match',leader:'Leader',gameTeamId:'12',revision:'r1'}],participants:[{telegramId:'12345',memberships:[{slot:1,game:'Royal Match',team:'Old',role:'Игрок'}]}],journal:{rows:[]},write:{enabled:true,transport:'worker-signed-hmac',operations:['updateTeam','createTeam','updateParticipant','createParticipant']}}};
  window.server=structuredClone(payload.adminData.teams[0]);window.fetch=async(url,init)=>{
   if(String(url).includes('/admin-data'))return new Promise(resolve=>pendingReads.push(resolve));
   if(!String(url).includes('/admin-write'))return Response.json({ok:true});
   const body=JSON.parse(init.body);calls.push(body);
   if(mode==='lost')throw new TypeError('Failed to fetch');
   if(receipts.has(body.requestId))return Response.json(receipts.get(body.requestId));
   if(body.payload.name!==server.name||body.payload.expectedRevision!==server.revision)return Response.json({ok:false,error:'TEAM_NOT_FOUND',message:'Команда не найдена.'},{status:404});
   commits++;server={...server,...body.payload.changes,revision:'r'+(commits+1)};
   const result={ok:true,requestId:body.requestId,entityType:'team',previousEntityKey:'Royal Match :: '+body.payload.name,entityKey:'Royal Match :: '+server.name,record:structuredClone(server),revision:server.revision,...(mode==='no-queue'?{}:{adminSnapshot:{queued:true}})};receipts.set(body.requestId,result);
   if(mode==='slow'&&calls.filter(c=>c.requestId===body.requestId).length===1)return new Promise(resolve=>window.slowResponse=()=>resolve(Response.json(result)));
   return Response.json(result);
  };
  window.RoyalAdminV0600={acceptPayload(data){return RoyalAdminDataV0600.accept(data);}};
  const nativeSetTimeout=window.setTimeout;window.setTimeout=(fn,ms,...args)=>nativeSetTimeout(fn,ms===20000?250:ms===700?1:ms,...args);
 });
 await page.addScriptTag({path:path.join(root,'admin-data-client-v0600.js')});
 let source=fs.readFileSync(process.env.ROYAL_TEST_ADMIN_WRITE||path.join(root,'admin-write-v0600-v3.js'),'utf8');source=source.replace(/\}\)\(\);\s*$/,'window.__write={state,openTeamModal,submitForm,refreshVisibleAdminSnapshot,findTeamByNode,adminWrite,refreshAfterMutation};})();');await page.addScriptTag({content:source});
 await page.evaluate(()=>{__write.state.payload=payload;RoyalAdminDataV0600.accept(payload);__write.state.editing=true;});
 // Start a stale refresh before the first commit, then deliver it after rename.
 await page.evaluate(()=>{window.old=structuredClone(payload);window.background=__write.refreshVisibleAdminSnapshot();window.sharedRead=RoyalAdminDataV0600.load({force:true});});
 await page.waitForFunction(()=>pendingReads.length===1);
 async function save(name,leader){await page.evaluate(({name,leader})=>{__write.openTeamModal(__write.state.payload.adminData.teams[0]);const form=document.querySelector('[data-write-team-form]');form.querySelector('[data-write-field="name"]').value=name;form.querySelector('[data-write-field="leader"]').value=leader;return __write.submitForm(form);},{name,leader});}
 await save('🇷🇺New','Leader');assert.equal(await page.locator('[data-admin-write-modal]').count(),0);await page.evaluate(()=>pendingReads.shift()(Response.json(old)));await page.evaluate(()=>Promise.all([background,sharedRead]));
 assert.equal(await page.evaluate(()=>__write.state.payload.adminData.teams[0].name),'🇷🇺New');assert.equal(await page.evaluate(()=>RoyalAdminDataV0600.current.adminData.teams[0].name),'🇷🇺New');assert.equal(await page.evaluate(()=>__write.state.payload.adminData.participants[0].memberships[0].team),'🇷🇺New');
 await page.evaluate(()=>{document.getElementById('panel').innerHTML='<section class="royal-admin-screen" data-admin-team="1"><div class="royal-admin-summary-main"><strong>Old</strong><small>Royal Match</small></div><button id="oldEdit"></button></section>';});assert.equal(await page.evaluate(()=>__write.findTeamByNode(document.getElementById('oldEdit')).name),'🇷🇺New');
 await save('🇷🇺New','Second');assert.equal(await page.evaluate(()=>server.leader),'Second');assert.equal(await page.evaluate(()=>calls[1].payload.name),'🇷🇺New');assert.equal(await page.evaluate(()=>calls[1].payload.expectedRevision),'r2');
 const count=await page.evaluate(()=>calls.length);await save('🇷🇺New','Second');assert.equal(await page.evaluate(()=>calls.length),count,'unchanged form sends no write');
 // A complete committed record does not wait for snapshot queue metadata.
 await page.evaluate(()=>mode='no-queue');await save('🇷🇺New','Third');assert.equal(await page.locator('[data-admin-write-modal]').count(),0);
 // Lost/slow primary acknowledgement: probe has exactly the same request ID/body.
 await page.evaluate(()=>mode='slow');await save('🇷🇺New','Fourth');assert.equal(await page.locator('[data-admin-write-modal]').count(),0);const pair=await page.evaluate(()=>calls.slice(-2));assert.deepEqual(pair[0],pair[1]);assert.equal(await page.evaluate(()=>commits),4,'one logical commit per change');await page.evaluate(()=>slowResponse());
 // An unresolved outcome keeps its ID across a deliberate user retry.
 await page.evaluate(()=>mode='lost');await save('🇷🇺New','Fifth');assert.equal(await page.locator('[data-admin-write-modal]').count(),1);const retryId=await page.evaluate(()=>calls.at(-1).requestId);await page.evaluate(()=>mode='normal');await page.evaluate(()=>__write.submitForm(document.querySelector('[data-write-team-form]')));assert.equal(await page.evaluate(()=>calls.at(-1).requestId),retryId);
 await page.addScriptTag({path:path.join(root,'admin-team-photo-v0600.js')});
 await page.evaluate(()=>{mode='slow';__write.openTeamModal(__write.state.payload.adminData.teams[0]);});await page.waitForSelector('[data-admin-team-photo-input]');
 await page.locator('[data-admin-team-photo-input]').setInputFiles(path.join(root,'assets/rm-emblems/136.webp'));
 const beforePhoto=await page.evaluate(()=>calls.length);await page.evaluate(()=>{window.photoSave=__write.submitForm(document.querySelector('[data-write-team-form]'));});await page.waitForFunction(n=>calls.length>n,beforePhoto);
 assert.equal(await page.locator('[data-write-field="name"]').isDisabled(),true);
 await page.locator('[data-admin-team-photo-input]').setInputFiles(path.join(root,'assets/rm-emblems/175.webp'));await page.evaluate(()=>photoSave);
 const photoPair=await page.evaluate(()=>calls.slice(-2));assert.deepEqual(photoPair[0],photoPair[1],'photo content frozen for receipt probe');assert.ok(photoPair[0].payload.changes.photo.data);await page.evaluate(()=>slowResponse());
 assert.deepEqual(errors,[]);console.log('sequential save: delayed snapshot race, rename cascade/Back alias, second revision, no-op, nonqueued receipt, slow same-ID probe, uncertain retry ID, no duplicate commit PASS');await browser.close();
})().catch(async e=>{console.error(e);await browser?.close();process.exit(1)});
