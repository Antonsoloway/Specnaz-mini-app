import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
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
 assert.equal(api.emojiName('FORTUNA',144),'🇷🇺FORTUNA');
 assert.equal(api.emojiName('WeAreJustice',159),'🇹🇷WeAreJustice');
 assert.equal(api.emojiName('Da budet Swet',52),'⚓Da budet Swet');
 assert.equal(api.emojiName('🌟 Kingdom Team',144),'🌟Kingdom Team');
 assert.equal(api.emojiName('Kingdom Team',999),'Kingdom Team');
 assert.equal(api.emojiName(api.emojiName('Team',8),8),'♞Team');
});
