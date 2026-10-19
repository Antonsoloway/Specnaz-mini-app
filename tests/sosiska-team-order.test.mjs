import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../team-specnaz-order-v0612.js', import.meta.url), 'utf8');
const rm = 'Royal Match', rk = 'Royal Kingdom';
const teams = [{name:'A',game:rm},{name:'B',game:rm},{name:'A',game:rk},{name:'Zero',game:rm}];
const p = (id, score, name, game=rm) => ({telegramId:id,specnazTrips:score,memberships:[{team:name,game}]});
function boot(extra={}) {
  const context = {window:{},...extra}; vm.runInNewContext(source,context); return context;
}
test('score first, positive member count second, game identity and stable complete ties', () => {
  const people=[p('1',20,'A'),p('2',10,'B'),p('3','10','B'),p('4',21,'A',rk),p('5',0,'A'),p('6',0,'A')];
  const api=boot().window.RoyalTeamSpecnazOrder;
  assert.deepEqual(Array.from(api.order(teams,people),t=>t.name+'|'+t.game),['A|'+rk,'B|'+rm,'A|'+rm,'Zero|'+rm]);
  assert.equal(api.metrics(people).get(api.teamKey(teams[0])).scoredMembers,1);
  assert.deepEqual(Array.from(api.order(teams,[])),teams);
  assert.equal(teams[0].name,'A');
});
test('duplicate membership slots/Telegram IDs count once, symbols stay distinct, malformed scores are zero', () => {
  const person=p('1',7,'⚓A');person.memberships.push({...person.memberships[0]});
  const people=[person,{...person},p('2','oops','🎓A'),p('3',0,'⚓A'),p('4',4,'⚓A',rk)];
  const api=boot().window.RoyalTeamSpecnazOrder,m=api.metrics(people);
  assert.equal(m.get(api.teamKey({name:'⚓A',game:rm})).total,7);
  assert.equal(m.get(api.teamKey({name:'⚓A',game:rm})).scoredMembers,1);
  assert.equal(m.get(api.teamKey({name:'🎓A',game:rm})).total,0);
  assert.equal(m.get(api.teamKey({name:'⚓A',game:rk})).total,4);
});
test('admin F total is authoritative and admin specnaz drives the tie breaker', () => {
  const api=boot().window.RoyalTeamSpecnazOrder;
  const list=teams.map((t,i)=>({...t,specnazTrips:i===3?'1 000,5':20}));
  const people=[{...p('1',undefined,'B'),specnaz:1},{...p('2',undefined,'B'),specnaz:1},p('3',100,'A')];
  assert.deepEqual(Array.from(api.order(list,people,true),t=>t.name+'|'+t.game),['Zero|'+rm,'B|'+rm,'A|'+rm,'A|'+rk]);
});
test('render sorting recomputes after score/membership changes and always restores snapshot order', () => {
  let rendered;const state={teams,participants:[p('1',1,'B')]};
  const ctx=boot({snapshotState:state,renderTeamsPage(){rendered=state.teams.map(t=>t.name);}});
  ctx.renderTeamsPage();assert.equal(rendered[0],'B');assert.equal(state.teams,teams);
  state.participants=[p('1',5,'A',rk)];ctx.renderTeamsPage();
  assert.equal(state.teams,teams);assert.equal(ctx.window.RoyalTeamSpecnazOrder.order(teams,state.participants)[0].game,rk);
  const failing=boot({snapshotState:state,renderTeamsPage(){throw Error('render failed');}});
  assert.throws(()=>failing.renderTeamsPage(),/render failed/);assert.equal(state.teams,teams);
});
test('v0.6.12 loads sorting before list wrappers and preserves previous release history', async () => {
  const html=await readFile(new URL('../app-v0612.html',import.meta.url),'utf8');
  assert.ok(html.indexOf('team-specnaz-order-v0612.js')<html.indexOf('search-hybrid-v0553.js'));
  assert.match(html,/version-v0600.js\?v=20261019-v0612-team-order1/);
  const ctx={window:{RoyalChangelog:{releases:[{version:'0.6.11'}]}}};
  vm.runInNewContext(await readFile(new URL('../changelog-v0612.js',import.meta.url),'utf8'),ctx);
  assert.equal(ctx.window.RoyalChangelog.version,'0.6.12');
  assert.equal(ctx.window.RoyalChangelog.releases[1].version,'0.6.11');
});
