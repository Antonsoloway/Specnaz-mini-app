const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const lib=require(path.join(root,'team-navigation-resolver-v0614.js'));
const id='4150799287';
// Publicly documented sample identity, no Telegram IDs or private CRM export
// are copied into the public app repository.
const reference={
 name:'🇷🇺HA A3APTE',game:'Royal Kingdom',gameTeamId:id,
 searchKeys:['ha a3apte','na azarte','на азарте','royal kingdom']
};
const adminReference={name:'🇷🇺HA A3APTE',game:'Royal Kingdom',gameTeamId:id};
const fixture={teams:[reference],participants:[{memberships:[{
 team:reference.name,game:reference.game,role:'Лидер'}]}]};
const fixtureAdmin={adminData:{teams:[adminReference]}};
// If the authorized private checkout is mounted alongside this public repo,
// additionally verify against its actual Oct 20 source snapshot. CI does not
// require that private repo and tests never print user records.
const privateDir=path.resolve(root,'../royal-crm-data');
let privateFixture=false;
if(process.env.ROYAL_NAV_TEST_NO_PRIVATE!=='1'&&
   fs.existsSync(path.join(privateDir,'snapshot.json'))&&
   fs.existsSync(path.join(privateDir,'admin-snapshot.json'))){
 const publicSnapshot=JSON.parse(fs.readFileSync(path.join(privateDir,'snapshot.json'),'utf8'));
 const adminSnapshot=JSON.parse(fs.readFileSync(path.join(privateDir,'admin-snapshot.json'),'utf8'));
 const foundPublic=publicSnapshot.teams?.find(t=>String(t.gameTeamId)===id);
 const foundAdmin=adminSnapshot.adminData?.teams?.find(t=>String(t.gameTeamId)===id);
 if(foundPublic&&foundAdmin){
  fixture.teams=publicSnapshot.teams;fixture.participants=publicSnapshot.participants;
  fixtureAdmin.adminData.teams=adminSnapshot.adminData.teams;
  privateFixture=true;
 }
}
let pass=0;
function check(label,fn){fn();pass++;console.log('PASS',label);}
const original=fixture.teams.find(t=>String(t.gameTeamId)===id);
const adminRecord=fixtureAdmin.adminData.teams.find(t=>String(t.gameTeamId)===id);
check('sample RK team exists in public and administrative snapshots',()=>{
 assert.ok(original&&adminRecord);
 assert.equal(original.game,'Royal Kingdom');
 assert.equal(adminRecord.game,'Royal Kingdom');
});
check('leader membership resolves through canonical RK identity',()=>{
 const leader=fixture.participants.find(p=>p.memberships?.some(m=>
  m.team===original.name&&m.game==='Royal Kingdom'&&m.role==='Лидер'));
 assert.ok(leader);
 assert.equal(lib.publicTeam(fixture.teams,leader.memberships[0].team,'Royal Kingdom'),original);
});
check('Cyrillic and mixed-script names resolve through published search aliases',()=>{
 assert.equal(lib.publicTeam(fixture.teams,'НА АЗАРТЕ','Royal Kingdom'),original);
 assert.equal(lib.publicTeam(fixture.teams,'🇷🇺НА АЗАРТЕ','РК'),original);
 assert.equal(lib.publicTeam(fixture.teams,'🇷🇺HA A3APTE','RK'),original);
});
check('administrative detail resolves nickname using original stable game ID',()=>{
 assert.equal(lib.adminTeam(fixtureAdmin,'НА АЗАРТЕ','РК',fixture.teams),adminRecord);
 assert.equal(lib.adminTeam(fixtureAdmin,'🇷🇺НА АЗАРТЕ','Royal Kingdom',fixture.teams),adminRecord);
});
check('server-renamed admin row still resolves by stable ID',()=>{
 const renamed={...adminRecord,name:'🇷🇺Новое название команды',gameTeamId:id};
 const copy={adminData:{teams:fixtureAdmin.adminData.teams.map(t=>t===adminRecord?renamed:t)}};
 assert.equal(lib.adminTeam(copy,'НА АЗАРТЕ','РК',fixture.teams),renamed);
});
check('public team can be found from explicit unchanged ID after rename',()=>{
 const changed={...original,name:'🇷🇺Переименованная команда'};
 assert.equal(lib.publicTeam([changed],'Старое название','Royal Kingdom',id),changed);
});
check('wrong game cannot open namesake',()=>{
 assert.equal(lib.publicTeam(fixture.teams,'НА АЗАРТЕ','Royal Match'),null);
 assert.equal(lib.adminTeam(fixtureAdmin,'НА АЗАРТЕ','Royal Match',fixture.teams),null);
});
check('collisions cannot open random alias or duplicate team ID',()=>{
 const a={name:'Team Alpha',game:'Royal Kingdom',searchKeys:['same'],gameTeamId:'100001'};
 const b={name:'Team Beta',game:'Royal Kingdom',searchKeys:['same'],gameTeamId:'100002'};
 assert.equal(lib.publicTeam([a,b],'same','Royal Kingdom'),null);
 assert.equal(lib.adminTeam([a,b],'same','Royal Kingdom',[a,b]),null);
 assert.equal(lib.publicTeam([a,b],'anything','Royal Kingdom','100002'),b);
});
check('duplicate name in RM/RK remains game-scoped',()=>{
 const a={name:'DUP',game:'Royal Match',gameTeamId:'100001'};
 const b={name:'DUP',game:'Royal Kingdom',gameTeamId:'100002'};
 assert.equal(lib.publicTeam([a,b],'DUP','Royal Kingdom'),b);
 assert.equal(lib.adminTeam([a,b],'DUP','Royal Match',[a,b]),a);
 assert.equal(lib.publicTeam([a,b],'DUP',''),null);
});
check('all bound local CRM teams keep their original ID/game when resolving',()=>{
 for(const team of fixture.teams){
  if(!lib.gid(team.gameTeamId))continue;
  const resolved=lib.adminTeam(fixtureAdmin,team.name,team.game,fixture.teams);
  if(resolved)assert.equal(String(resolved.gameTeamId),String(team.gameTeamId));
 }
});
check('unknown team is not guessed through substrings',()=>{
 assert.equal(lib.publicTeam(fixture.teams,'АЗАРТ','РК'),null);
 assert.equal(lib.adminTeam(fixtureAdmin,'АЗАРТ','РК',fixture.teams),null);
});
check('actual home membership click passes canonical RK team to admin route',()=>{
 const vm=require('node:vm');
 const listeners={};const calls=[];
 const card={
  childNodes:[{nodeType:3,textContent:'НА АЗАРТЕ'}],
  querySelector:()=>({textContent:'Лидер · Royal Kingdom'})
 };
 const document={
  body:{classList:{contains:c=>c==='admin-mode'}},
  addEventListener:(kind,fn)=>{listeners[kind]=fn;},
  querySelectorAll:()=>[]
 };
 const window={
  RoyalTeamNavigationV0614:lib,
  RoyalAdminTeamDetailV0600:{open:(...args)=>calls.push(args)},
  addEventListener:()=>{},
  RoyalNav:{pushCurrent:()=>{}}
 };
 const sandbox={window,document,Node:{TEXT_NODE:3,ELEMENT_NODE:1},
  MutationObserver:class{observe(){}},
  requestAnimationFrame:()=>{},
  snapshotState:fixture};
 vm.runInNewContext(fs.readFileSync(path.join(root,'profile-team-link-v0614.js'),'utf8'),sandbox);
 let stopped=false;let prevented=false;
 listeners.click({
  target:{closest:selector=>selector==='.self-membership[data-team]'?card:null},
  preventDefault:()=>{prevented=true;},
  stopImmediatePropagation:()=>{stopped=true;}
 });
 assert.deepEqual(JSON.parse(JSON.stringify(calls)),[[original.name,'Royal Kingdom']]);
 assert.equal(prevented,true);assert.equal(stopped,true);
});
check('v0.6.14 uses resolver, guarded refresh and separate dynamic team loader',()=>{
 const names=['app-v0614.html','profile-team-link-v0614.js',
  'team-identity-fix-v0614.js','admin-team-detail-v0614.js','version-v0614.js'];
 const texts=names.map(f=>fs.readFileSync(path.join(root,f),'utf8'));
 assert.ok(texts[0].includes("__ROYAL_BUILD__='0.6.14'"));
 assert.ok(texts[0].includes('team-navigation-resolver-v0614.js'));
 assert.ok(texts[1].includes('RoyalTeamNavigationV0614?.publicTeam'));
 assert.ok(texts[2].includes('RoyalTeamNavigationV0614?.publicTeam'));
 assert.ok(texts[3].includes('RoyalTeamNavigationV0614?.adminTeam'));
 assert.ok(texts[3].includes('await adminData(true)'));
 assert.ok(texts[4].includes('admin-team-detail-v0614.js'));
 assert.ok(texts[4].includes('profile-team-link-v0614.js'));
 assert.ok(!fs.readFileSync(path.join(root,'app-v0613.html'),'utf8')
   .includes('team-navigation-resolver-v0614.js'));
});
console.log(JSON.stringify({suite:'team-navigation-resolver-v0614',
 pass,fail:0,privateFixture,liveBackendVerified:false,productionChanged:false}));
