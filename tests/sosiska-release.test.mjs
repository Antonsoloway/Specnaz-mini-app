import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
for(const [file,target] of [['app.html','app-v0613.html'],['app-v0601.html','app-v0600.html']])test(file+' preserves Telegram launch query and hash',async()=>{
 const html=await readFile(new URL('../'+file,import.meta.url),'utf8'),script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
 let destination;
 const context={URLSearchParams,window:{location:{search:'?gas=fixture&owner=value',hash:'#tgWebAppData=fixture%26signed',replace(value){destination=value;}}}};
 vm.runInNewContext(script,context);
 const url=new URL(destination,'https://miniapp.test/');
 assert.equal(url.pathname,'/'+target);assert.equal(url.searchParams.get('gas'),'fixture');assert.equal(url.searchParams.get('owner'),'value');assert.equal(url.searchParams.get('releaseBuild'),file==='app.html'?'20261019-v0613-directory1':'20261016-v061-agent-status1');assert.equal(url.hash,context.window.location.hash);
});
test('Sosiska appears in current changelog without losing existing entries',async()=>{
 const source=await readFile(new URL('../changelog-v061-latest.js',import.meta.url),'utf8');
 const entry={version:'0.6.1',sections:[{title:'Earlier',changes:['Keep existing history']}]};
 const context={window:{RoyalChangelog:{releases:[entry]}}};vm.runInNewContext(source,context);vm.runInNewContext(source,context);
 assert.ok(entry.changes.includes('Keep existing history'));assert.equal(entry.changes.filter(s=>s.includes('«Сосиска»')).length,1);
});



test('new release entrypoint retains installed services and loads v0.6.2 changelog last',async()=>{
 const html=await readFile(new URL('../app-v0602.html',import.meta.url),'utf8');
 assert.match(html,/Royal CRM v0\.6\.2/);
 assert.match(html,/id="versionBadge">v0\.6\.2/);
 assert.match(html,/sosiska-v061\.js\?v=20261018-rk-tabs1/);
 assert.ok(html.indexOf('changelog-v0601.js')<html.indexOf('changelog-v0602.js'));
 const history=await readFile(new URL('../changelog-v0602.js',import.meta.url),'utf8');
 const old={version:'0.6.1',title:'Earlier',changes:['Previous version remains']};
 const ctx={window:{RoyalChangelog:{releases:[old]}}};
 vm.runInNewContext(history,ctx);
 assert.equal(ctx.window.RoyalChangelog.releases[0].version,'0.6.2');
 assert.equal(ctx.window.RoyalChangelog.releases[1].version,'0.6.1');
 assert.equal(ctx.window.__ROYAL_CHANGELOG_VERSION__,'0.6.2');
});

test('RK stats release v0.6.3 retains v0.6.2 history and routes Telegram launch intact',async()=>{
 const html=await readFile(new URL('../app-v0603.html',import.meta.url),'utf8');
 assert.match(html,/Royal CRM v0\.6\.3/);
 assert.ok(html.indexOf('changelog-v0602.js')<html.indexOf('changelog-v0603.js'));
 assert.match(html,/sosiska-v061\.js\?v=20261018-rk-profile1/);
 const source=await readFile(new URL('../changelog-v0603.js',import.meta.url),'utf8');
 const ctx={window:{RoyalChangelog:{releases:[{version:'0.6.2',title:'Previous',changes:['Keep old history']}]}}};
 vm.runInNewContext(source,ctx);
 assert.equal(ctx.window.RoyalChangelog.version,'0.6.3');
 assert.equal(ctx.window.RoyalChangelog.releases[1].version,'0.6.2');
});

test('new v0.6.4 entrypoint preserves v0.6.3 and has independent RK scripts',async()=>{
 const html=await readFile(new URL('../app-v0604.html',import.meta.url),'utf8');
 assert.match(html,/id="versionBadge">v0\.6\.4/);
 assert.ok(html.indexOf('changelog-v0603.js')<html.indexOf('changelog-v0604.js'));
 assert.ok(html.indexOf('rk-team-emblems-v064.js')<html.indexOf('sosiska-v061.js'));
 const code=await readFile(new URL('../changelog-v0604.js',import.meta.url),'utf8');
 const ctx={window:{RoyalChangelog:{releases:[{version:'0.6.3',title:'Earlier',changes:['Preserve']}]}}};
 vm.runInNewContext(code,ctx);
 assert.equal(ctx.window.RoyalChangelog.version,'0.6.4');
 assert.equal(ctx.window.RoyalChangelog.releases[1].version,'0.6.3');
});

test('profile retry release v0.6.5 preserves RK emblem history and Telegram launch',async()=>{
 const html=await readFile(new URL('../app-v0605.html',import.meta.url),'utf8');
 assert.match(html,/id="versionBadge">v0\.6\.5/);
 assert.ok(html.indexOf('changelog-v0604.js')<html.indexOf('changelog-v0605.js'));
 assert.match(html,/sosiska-v061\.js\?v=20261018-rk-profile-retry1/);
 const js=await readFile(new URL('../changelog-v0605.js',import.meta.url),'utf8');
 const ctx={window:{RoyalChangelog:{releases:[{version:'0.6.4',title:'emblems'}]}}};
 vm.runInNewContext(js,ctx);
 assert.equal(ctx.window.RoyalChangelog.version,'0.6.5');
 assert.equal(ctx.window.RoyalChangelog.releases[1].version,'0.6.4');
});


test('v0.6.6 links release retains prior history, installed services and separate emblem sources',async()=>{
 const html=await readFile(new URL('../app-v0606.html',import.meta.url),'utf8');
 assert.match(html,/id="versionBadge">v0\.6\.6/);
 assert.match(html,/window.__ROYAL_BUILD__='0\.6\.6'/);
 assert.match(html,/team-live-v061\.js\?v=20261018-v066-rk-team-links1/);
 assert.ok(html.indexOf('changelog-v0605.js')<html.indexOf('changelog-v0606.js'));
 assert.ok(html.indexOf('rk-team-emblems-v064.js')<html.indexOf('team-live-v061.js'));
 const code=await readFile(new URL('../changelog-v0606.js',import.meta.url),'utf8');
 const ctx={window:{RoyalChangelog:{releases:[{version:'0.6.5',title:'Previous'}]}}};
 vm.runInNewContext(code,ctx);
 assert.equal(ctx.window.RoyalChangelog.version,'0.6.6');
 assert.equal(ctx.window.RoyalChangelog.releases[1].version,'0.6.5');
});
