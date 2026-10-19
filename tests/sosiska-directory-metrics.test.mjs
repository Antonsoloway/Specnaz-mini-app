import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../worker/src/team-directory-metrics.js',import.meta.url),'utf8');
const {projectDirectoryMetrics,applyDirectoryMetrics,createDirectoryMetricsLoader,directoryTeamKey:key} =
  await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const rm='Royal Match',rk='Royal Kingdom';
const env={DATA_REPO:'fixture/data',GITHUB_TOKEN:'fixture-secret'};
function data(){return {adminData:{teams:[{name:'A',game:rm,specnazTrips:'20',activityBase:'1 234,5',activityOutside:3,leader:'PRIVATE',revision:'PRIVATE'}],
 participants:[{telegramId:'1',specnaz:2,memberships:[{team:'A',game:rm},{team:'A',game:'РМ'},{team:'A',game:rk}]},
 {telegramId:'1',specnaz:2,memberships:[{team:'A',game:rm}]},{telegramId:'2',specnaz:0,memberships:[{team:'A',game:rm}]}],journal:[{secret:'PRIVATE'}]}};}
test('directory exposes only F/I/J and distinct positive member counts with game isolation',()=>{
 const projection=projectDirectoryMetrics(data());
 assert.deepEqual(projection.get(key('A',rm)),{specnazTrips:20,specnazMemberCount:1,activityBase:1234.5,activityOutside:3});
 assert.equal(projection.has(key('A',rk)),false);
 assert.equal(JSON.stringify([...projection]).includes('PRIVATE'),false);
 const duplicate=data();duplicate.adminData.teams.push({...duplicate.adminData.teams[0]});
 assert.equal(projectDirectoryMetrics(duplicate).get(key('A',rm)),null);
});
test('public server projection drops inactive/empty teams, keeps paused teams, leaves private/source objects intact',()=>{
 const teams=[{name:'A',game:rm,memberCount:1,status:'Активен'},
  {name:'Paused',game:rk,memberCount:1,status:'На паузе'},
  {name:'Inactive',game:rm,memberCount:3,status:'Неактивен'},
  {name:'Empty',game:rm,memberCount:0,status:'Активен'}];
 const original={teams,participants:[{telegramId:'1',memberships:[{team:'A',game:rm},{team:'Paused',game:rk}]}],stats:{teams:4,participants:9}};
 const result=applyDirectoryMetrics(original,projectDirectoryMetrics(data()));
 assert.deepEqual(result.teams.map(t=>t.name),['A','Paused']);assert.equal(result.stats.teams,2);
 assert.equal(original.teams.length,4);assert.equal(original.teams[0].activityBase,undefined);
 assert.equal(result.teams[0].specnazTrips,20);assert.equal(result.stats.participants,9);
});
test('private metric reads are bounded, deduplicated, credential-scoped and retain only bounded stale aggregates',async()=>{
 let now=0,calls=0,fail=false;
 const load=createDirectoryMetricsLoader(async()=>{calls++;if(fail)throw Error('offline');return Response.json(data());},()=>now);
 const [a,b]=await Promise.all([load(env),load(env)]);assert.equal(a,b);assert.equal(calls,1);
 await load(env);assert.equal(calls,1);
 now=61_000;fail=true;assert.equal(await load(env),a);assert.equal(calls,2);
 now=601_000;await assert.rejects(load(env),/offline/);
 await assert.rejects(load({...env,GITHUB_TOKEN:'different-secret'}),/offline/);
});
test('timeout includes a response body that ignores abort',async()=>{
 const load=createDirectoryMetricsLoader(async()=>({ok:true,json:()=>new Promise(()=>{})}));
 const start=Date.now();await assert.rejects(load(env),/directory timeout/);
 assert.ok(Date.now()-start<4000);
});
test('frontend policy works in future releases, on warm snapshots, and after fresh snapshot arrival without touching admin records',async()=>{
 const code=await readFile(new URL('../public-team-visibility-v061.js',import.meta.url),'utf8');
 for(const version of ['0.6.13','0.7.0']){
  const listeners={};let visible;
  const all=[{name:'Active',memberCount:1,status:'Активен'},{name:'Paused',memberCount:1,status:'На паузе'},
   {name:'Inactive',memberCount:1,status:'Неактивен'},{name:'Empty',memberCount:0,status:'Активен'}];
  const ctx={window:{__ROYAL_BUILD__:version,addEventListener:(n,f)=>listeners[n]=f,setTimeout(){}},
   snapshotState:{teams:all,stats:{teams:4}},renderTeamsPage(){visible=ctx.snapshotState.teams;}};
  vm.runInNewContext(code,ctx);ctx.renderTeamsPage();
  assert.deepEqual(Array.from(visible,t=>t.name),['Active','Paused']);assert.equal(ctx.snapshotState.stats.teams,2);
  assert.equal(all.length,4,'separate private records retain inactive teams');
  ctx.snapshotState={teams:all.slice(),stats:{teams:4}};listeners['royal:snapshot-ready']();
  assert.equal(ctx.snapshotState.teams.length,2);
 }
});
