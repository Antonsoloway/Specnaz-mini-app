import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
for(const [file,target] of [['app.html','app-v0601.html'],['app-v0601.html','app-v0600.html']])test(file+' preserves Telegram launch query and hash',async()=>{
 const html=await readFile(new URL('../'+file,import.meta.url),'utf8'),script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
 let destination;
 const context={URLSearchParams,window:{location:{search:'?gas=fixture&owner=value',hash:'#tgWebAppData=fixture%26signed',replace(value){destination=value;}}}};
 vm.runInNewContext(script,context);
 const url=new URL(destination,'https://miniapp.test/');
 assert.equal(url.pathname,'/'+target);assert.equal(url.searchParams.get('gas'),'fixture');assert.equal(url.searchParams.get('owner'),'value');assert.equal(url.searchParams.get('releaseBuild'),'20261013-v061-sosiska-activity1');assert.equal(url.hash,context.window.location.hash);
});
test('Sosiska appears in current changelog without losing existing entries',async()=>{
 const source=await readFile(new URL('../changelog-v061-latest.js',import.meta.url),'utf8');
 const entry={version:'0.6.1',sections:[{title:'Earlier',changes:['Keep existing history']}]};
 const context={window:{RoyalChangelog:{releases:[entry]}}};vm.runInNewContext(source,context);vm.runInNewContext(source,context);
 assert.ok(entry.changes.includes('Keep existing history'));assert.equal(entry.changes.filter(s=>s.includes('«Сосиска»')).length,1);
});
