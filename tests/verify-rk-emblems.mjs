import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
const here=new URL('../',import.meta.url);
test('all 184 RK assets match zero-based IDs and WebP RIFF structure',async()=>{
 const cat=JSON.parse(await readFile(new URL('assets/rk-emblems/catalog.json',here)));
 assert.equal(cat.count,184);
 assert.deepEqual(cat.entries.map(x=>x.id),Array.from({length:184},(_,i)=>i));
 for(let id=0;id<184;id++){
  const data=await readFile(new URL('assets/rk-emblems/'+id+'.webp',here));
  assert.equal(data.toString('ascii',0,4),'RIFF');
  assert.equal(data.toString('ascii',8,12),'WEBP');
  assert.equal(data.readUInt32LE(4)+8,data.length);
 }
});
test('RK rendering is isolated and uses 0 not RM logo assets',async()=>{
 const ctx={window:{},document:{addEventListener(){}}};vm.createContext(ctx);
 vm.runInContext(await readFile(new URL('rk-team-emblems-v064.js',here),'utf8'),ctx);
 const api=ctx.window.RoyalKingdomEmblems;
 assert.ok(api.image(0).includes('rk-emblems/0.webp'));
 assert.ok(api.image(183).includes('rk-emblems/183.webp'));
 for(const value of [-1,184,null,'0',undefined,0.5])assert.equal(api.image(value),'');
 assert.ok(!api.name('<BOLTAMnet>','1',0).includes('rm-emblems'));
 assert.ok(api.name('<BOLTAMnet>','1',0).includes('&lt;BOLTAMnet&gt;'));
 assert.equal(api.logoOf({TeamLogo:0,Logo:7}),0);
});

test('source references RK assets and keeps RM names untouched',async()=>{
 const s=await readFile(new URL('sosiska-v061.js',here),'utf8');
 const html=await readFile(new URL('app-v0604.html',here),'utf8');
 assert.match(s,/game==='rk'\?\(window\.RoyalKingdomEmblems\?\.name/);
 assert.match(html,/rk-team-emblems-v064\.js\?v=20261018-rk-emblems184/);
 assert.ok(html.indexOf('rk-team-emblems-v064.js')<html.indexOf('sosiska-v061.js'));
 assert.ok(s.includes('window.RoyalTeamEmblems?.name(text,id,logo)'));
 const catalog=JSON.parse(await readFile(new URL('assets/rk-emblems/catalog.json',here)));
 assert.equal(catalog.entries[0].asset,'assets/rk-emblems/0.webp');
 assert.equal(catalog.entries[183].asset,'assets/rk-emblems/183.webp');
});

test('RK emoji catalogue covers every ID and preserves editable names without duplicate prefixes',async()=>{
 const ctx={window:{},document:{addEventListener(){}}};vm.createContext(ctx);
 vm.runInContext(await readFile(new URL('rk-team-emblems-v064.js',here),'utf8'),ctx);
 const api=ctx.window.RoyalKingdomEmblems;
 for(let id=0;id<184;id++)assert.ok(api.emoji(id),'RK emoji '+id);
 assert.equal(api.emojiName('FORTUNA',140),'🇷🇺FORTUNA');
 assert.equal(api.emojiName('WeAreJustice',155),'🇹🇷WeAreJustice');
 assert.equal(api.emojiName('Da budet Swet',52),'⚓Da budet Swet');
 assert.equal(api.emojiName('🌟 Kingdom Team',140),'🌟Kingdom Team');
 assert.equal(api.emojiName('Kingdom Team',999),'Kingdom Team');
 assert.equal(api.emojiName(api.emojiName('Team',8),8),'♞Team');
});

test('native array IDs, not visual menu order, select every image and emoji',async()=>{
 const native=JSON.parse(await readFile(new URL('assets/rk-emblems/native-order-33931.json',here)));
 const cat=JSON.parse(await readFile(new URL('assets/rk-emblems/catalog.json',here)));
 assert.equal(native.count,184);assert.equal(native.bundleSha256,cat.nativeBundleSha256);
 assert.deepEqual(native.entries.map(e=>e.serverId),Array.from({length:184},(_,i)=>i));
 assert.equal(new Set(native.entries.map(e=>e.visualOrder)).size,184);
 for(const entry of native.entries){
  const c=cat.entries[entry.serverId];assert.equal(c.visualOrder,entry.visualOrder);
  assert.equal(c.screenshotIndex,entry.visualOrder-1);
  assert.equal(c.nativeBackground,entry.background);assert.equal(c.nativeLogo,entry.logo);
  assert.equal(createHash('sha256').update(await readFile(new URL(c.asset,here))).digest('hex'),c.sha256);
 }
 const ctx={window:{},document:{addEventListener(){}}};vm.createContext(ctx);
 vm.runInContext(await readFile(new URL('rk-team-emblems-v064.js',here),'utf8'),ctx);
 const api=ctx.window.RoyalKingdomEmblems;
 for(const [id,visual,emoji,symbol] of [[124,129,'🇺🇸','usa'],[136,141,'🇩🇰','denmark'],[140,145,'🇷🇺','russia'],[144,149,'🇲🇽','mexico'],[155,160,'🇹🇷','turkey'],[179,184,'🇰🇼','kuwait'],[180,125,'🦋','butterfly_1'],[183,128,'🧙','wizard_hat_2']]){
  const e=native.entries[id];assert.equal(e.visualOrder,visual);assert.ok((e.logo||e.background).endsWith(symbol));assert.equal(api.emoji(id),emoji);
 }
 assert.equal(api.emojiName('НА АЗАРТЕ',140),'🇷🇺НА АЗАРТЕ');
 assert.equal(cat.entries[140].sha256,'d875cae4fe792fa6799f233415e9943c84fdcd3e9c77cceb0ff9010e5df5872e');
});
