import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,access} from 'node:fs/promises';
import {projectTeam} from '../worker/src/team-live.js';
import {normalizePlayerProfile} from '../worker/src/sosiska-api.js';
const source=await readFile(new URL('../team-emblems-v061.js',import.meta.url),'utf8');
function runtime(fetch){const c={sessionToken:'fixture',fetch,queueMicrotask(){},URLSearchParams,AbortController,setTimeout,clearTimeout,window:{addEventListener(){}},document:{body:{},querySelectorAll:()=>[]},MutationObserver:class{observe(){}}};vm.createContext(c);vm.runInContext(source,c);return {api:c.window.RoyalTeamEmblems,c};}
test('all 176 catalogue IDs have assets; zero and final ID render, unknown IDs never become another emblem',async()=>{
 const catalog=JSON.parse(await readFile(new URL('../assets/rm-emblems/catalog.json',import.meta.url)));assert.equal(catalog.count,176);assert.equal(catalog.entries.length,176);
 for(let i=0;i<176;i++){assert.equal(catalog.entries[i].id,i);await access(new URL('../assets/rm-emblems/'+i+'.webp',import.meta.url));}
 const {api}=runtime();assert.match(api.image(0),/\/0.webp/);assert.match(api.image(175),/\/175.webp/);
 for(const v of [null,undefined,-1,176,1.5,'0','../0',false])assert.equal(api.image(v),'');
 api.remember('12',0);assert.match(api.name('<edited>', '12'),/0.webp/);assert.match(api.name('<edited>','12'),/&lt;edited&gt;/);
});
test('read-only team and player projections preserve TeamLogo zero and reject malformed values',()=>{
 const base={Status:0,Members:[],TeamId:'12'};
 assert.equal(projectTeam({...base,TeamLogo:0},'now').logo,0);assert.equal(projectTeam({...base,Logo:0},'now').logo,0);assert.equal(projectTeam({...base,Logo:136},'now').logo,136);assert.equal(projectTeam({...base,TeamLogo:175},'now').logo,175);
 for(const v of [null,-1,176,'0'])assert.equal(projectTeam({...base,TeamLogo:v},'now').logo,null);
 const data={Profile:{Name:'Player',Level:1,Crown:0,JoinDate:'1',TeamId:'12',TeamName:'same',TeamLogo:0},Stats:[]};assert.equal(normalizePlayerProfile('1',data).teamLogo,0);
});
test('same CRM identity coalesces requests, rename retains emblem by ID; mismatched team never populates cache',async()=>{
 let calls=0;const {api}=runtime(async()=>{calls++;return Response.json({ok:true,data:{teamId:'12',logo:0}})});const r={name:'Edited',gameTeamId:'12'};
 await Promise.all([api.fetchLive(r),api.fetchLive(r)]);assert.equal(calls,1);assert.match(api.name('Edited','12'),/0.webp/);await api.fetchLive(r,false,false,true);assert.equal(calls,1);await api.fetchLive(r);assert.equal(calls,2);
 const bad=runtime(async()=>Response.json({ok:true,data:{teamId:'99',logo:175}}));await assert.rejects(bad.api.fetchLive(r));assert.doesNotMatch(bad.api.name('Edited','12'),/webp/);
});
test('session change during game read cannot retain another session response',async()=>{
 let resolve;const {api,c}=runtime(()=>new Promise(r=>resolve=r));const p=api.fetchLive({name:'CRM',gameTeamId:'12'});c.sessionToken='changed';resolve(Response.json({ok:true,data:{teamId:'12',logo:0}}));await assert.rejects(p,/STALE/);assert.doesNotMatch(api.name('CRM','12'),/webp/);
});

test('game reads retry one transient failure, but never retry access denial or changed identity',async()=>{
 let calls=0;const {api}=runtime(async()=>{calls++;if(calls===1)throw new TypeError('Failed to fetch');return Response.json({ok:true,data:{teamId:'12',logo:0}});});await api.fetchLive({name:'CRM',gameTeamId:'12'});assert.equal(calls,2);
 for(const status of [401,403,400]){let calls=0;const r=runtime(async()=>{calls++;return Response.json({ok:false},{status});});await assert.rejects(r.api.fetchLive({name:'CRM',gameTeamId:'12'}));assert.equal(calls,1);}
});


test('catalogue emoji names follow logo IDs, preserve manual prefixes and reject unknown IDs',()=>{
 const {api}=runtime();
 for(let i=0;i<176;i++){assert.ok(api.emoji(i));assert.equal(api.emojiName('Team',i),api.emoji(i)+'Team');}
 assert.equal(api.emojiName('FORTUNA',136),'🇷🇺FORTUNA');
 assert.equal(api.emojiName('Banda 220 V',22),'⚡Banda 220 V');
 assert.equal(api.emojiName('Aquamarine',0),'⚜️Aquamarine');
 assert.equal(api.emojiName('🇷🇺 FORTUNA',136),'🇷🇺FORTUNA');
 assert.equal(api.emojiName('⭐ Custom name',136),'⭐Custom name');
 for(const logo of [null,undefined,-1,176,'136']){assert.equal(api.emoji(logo),'');assert.equal(api.emojiName('FORTUNA',logo),'FORTUNA');}
 assert.equal(api.emoji(125),String.fromCodePoint(0x1f3f4,0xe0067,0xe0062,0xe0065,0xe006e,0xe0067,0xe007f));assert.equal(api.emojiName('🇷🇺   FORTUNA',136),'🇷🇺FORTUNA');assert.equal(api.emojiName('FORTUNA TEAM',136),'🇷🇺FORTUNA TEAM');assert.equal(api.emoji(120),'🇺🇸');assert.equal(api.emoji(126),'🇨🇭');assert.equal(api.emoji(175),'🇰🇼');
});
