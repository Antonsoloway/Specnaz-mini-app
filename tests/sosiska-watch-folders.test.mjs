import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {performFolderAction,validateFolderAction} from '../worker/src/sosiska-watch-folders.js';
import {SosiskaKingdomMonitor} from '../worker/src/sosiska-rk-monitor.js';
import {createSosiskaApi} from '../worker/src/sosiska-api.js';
globalThis.crypto??=webcrypto;
const storage=()=>{const data=new Map();return {data,get:async k=>structuredClone(data.get(k)),put:async(k,v)=>data.set(k,structuredClone(v))};};
const save=(name,ids,revision,folderId=null,game='rm')=>({operation:'folderSave',game,name,teamIds:ids,revision,folderId});
test('folders persist, move exact IDs, rename and delete without modifying watch history',async()=>{
 const s=storage();await s.put('rk:watches:v1',{7:{intervalMinutes:60}});
 let state=await performFolderAction(s,save('Маяк',['7','8'],0));const id=state.folders[0].id;
 state=await performFolderAction(s,save('Другие',['8'],1));
 assert.deepEqual(state.folders[0].teamIds,['7']);
 state=await performFolderAction(s,save('Новое имя',['7'],2,id));assert.equal(state.folders.find(f=>f.id===id).name,'Новое имя');
 assert.deepEqual(await performFolderAction(s,{operation:'folders'}),state);
 state=await performFolderAction(s,{operation:'folderDelete',folderId:id,revision:3});
 assert.equal(state.folders.length,1);assert.deepEqual(await s.get('rk:watches:v1'),{7:{intervalMinutes:60}});
});
test('same team ID and folder name remain separate in RM and RK',async()=>{
 const s=storage();await performFolderAction(s,save('Группа',['7'],0));
 assert.deepEqual(await performFolderAction(s,{operation:'folders',game:'rk'}),{revision:0,folders:[]});
 await performFolderAction(s,save('Группа',['7'],0,null,'rk'));
 assert.equal(s.data.size,2);
});
test('stale edits fail closed and duplicate titles or malformed parameters cannot overwrite folders',async()=>{
 const s=storage();await performFolderAction(s,save('Маяк',[],0));
 await assert.rejects(()=>performFolderAction(s,save('Other',[],0)),e=>e.status===409);
 await assert.rejects(()=>performFolderAction(s,save('маяк',[],1)),e=>e.status===409);
 for(const b of [save('',[],0),save('x',['1','1'],0),save('x',['-1'],0),save('x',['9223372036854775808'],0),save('x',Array(101).fill('1'),0),{operation:'folders',game:'bad'},{operation:'folders',token:'secret'}])assert.throws(()=>validateFolderAction(b));
 assert.doesNotThrow(()=>validateFolderAction(save('<img onerror=alert(1)>',['7'],0)));
});
test('real Durable Object serializes concurrent edits, reports conflict and survives a new instance',async()=>{
 const s=storage(),ctx={storage:s},obj=new SosiskaKingdomMonitor(ctx,{});
 const req=b=>new Request('https://internal',{method:'POST',body:JSON.stringify(b)});
 const results=await Promise.all([obj.fetch(req(save('One',[],0))),obj.fetch(req(save('Two',[],0)))]);
 assert.deepEqual(results.map(r=>r.status),[200,409]);
 const next=new SosiskaKingdomMonitor(ctx,{}),r=await next.fetch(req({operation:'folders'}));
 assert.equal((await r.json()).data.folders.length,1);
});
test('admin facade authorizes before any folder storage access and never calls game agent',async()=>{
 let calls=0;const s=storage(),obj=new SosiskaKingdomMonitor({storage:s},{});
 const env={SOSISKA_RK_MONITOR:{idFromName:n=>{assert.equal(n,'watch-folders-v1');return n;},get:()=>({fetch:(url,init)=>{calls++;return obj.fetch(new Request(url,init));}})}};
 const req=b=>new Request('https://api/admin-agent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});
 const handle=createSosiskaApi({authorizeAdmin:async()=>({telegramId:'101'}),fetchAgent:()=>{throw Error('No game request permitted');}});
 assert.equal((await handle(req(save('Test',['1'],0)),env)).status,200);
 assert.equal((await handle(req({operation:'folders'}),env)).status,200);
 const deny=createSosiskaApi({authorizeAdmin:async()=>{throw Object.assign(Error(),{status:403});}});
 assert.equal((await deny(req({operation:'folders'}),env)).status,403);assert.equal(calls,2);
});

test('0.6.18 entry loads matching history, current modules and preserves previous releases',async()=>{
 const fs=await import('node:fs/promises'),vm=await import('node:vm');
 const html=await fs.readFile(new URL('../app-v0618.html',import.meta.url),'utf8');
 assert.match(html,/window.__ROYAL_BUILD__='0\.6\.18'/);assert.match(html,/id="versionBadge">v0\.6\.18/);
 assert.match(html,/sosiska-v061.js\?v=20261123-watch-folders1/);
 assert.match(html,/sosiska-v061.css\?v=20261123-watch-folders1/);
 assert.ok(html.indexOf('changelog-v0618.js')>html.indexOf('changelog-v0617.js'));
 for(const feature of ['project-mayak-v061.js','battle-base-v0615.js','music-playlist-v061.js'])assert.ok(html.includes(feature));
 const context={window:{RoyalChangelog:{releases:[{version:'0.6.17',changes:['previous']}]}}};
 vm.runInNewContext(await fs.readFile(new URL('../changelog-v0618.js',import.meta.url),'utf8'),context);
 assert.equal(context.window.RoyalChangelog.version,'0.6.18');assert.equal(context.window.RoyalChangelog.releases[1].version,'0.6.17');
});
