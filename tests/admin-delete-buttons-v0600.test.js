const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function element() {
  return {
    dataset:{},
    hidden:false,
    innerHTML:'',
    textContent:'',
    appendChild(){},
    remove(){},
    addEventListener(){},
    querySelector(){ return null; },
    querySelectorAll(){ return []; },
    closest(){ return null; }
  };
}

function baseSandbox(panel, payload) {
  const document = {
    body:{ ...element(), contains(){ return true; } },
    head:element(),
    querySelector(){ return null; },
    querySelectorAll(){ return []; },
    createElement(){ return element(); },
    getElementById(id){ return id === 'panel' ? panel : null; },
    addEventListener(){}
  };
  const sandbox = {
    console,
    document,
    sessionToken:'test-session',
    API_URL:'https://worker.test',
    snapshotState:{ participants:[] },
    fetch:async () => ({
      ok:true,
      status:200,
      json:async () => payload
    }),
    MutationObserver:class { observe(){} },
    setTimeout(){ return 1; },
    clearTimeout(){},
    requestAnimationFrame(fn){ fn(); },
    setActiveNav(){},
    alert(){},
    confirm(){ return false; }
  };
  sandbox.window = sandbox;
  sandbox.window.addEventListener = () => {};
  sandbox.window.scrollTo = () => {};
  sandbox.window.RoyalNav = { pushCurrent(){} };
  sandbox.window.RoyalAdminDataV0600 = {
    load:async () => payload,
    accept:() => true,
    clear(){},
    subscribe(){ return () => {}; },
    protect(){},
    release(){}
  };
  return sandbox;
}

function readyPayload(overrides={}) {
  return {
    ok:true,
    permissions:{ isAdmin:true, canEdit:true, canDelete:true },
    adminData:{
      participants:[],
      teams:[],
      write:{
        enabled:true,
        version:'0.6.0-write.5',
        deleteEnabled:true,
        operations:['updateParticipant','createParticipant','deleteParticipant','updateTeam','createTeam','deleteTeam']
      }
    },
    ...overrides
  };
}

function loadWriteApi(payload) {
  const panel = element();
  const sandbox = baseSandbox(panel, payload);
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'admin-write-v0600-v3.js'), 'utf8'), sandbox);
  return sandbox.window.RoyalAdminWriteV0600;
}

async function renderDetail(filename, exportName, method, payload, args) {
  const panel = element();
  const sandbox = baseSandbox(panel, payload);
  const writeApi = loadWriteApi(payload);
  sandbox.window.RoyalAdminWriteV0600 = writeApi;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, filename), 'utf8'), sandbox, { filename });
  await sandbox.window[exportName][method](...args);
  return panel.innerHTML;
}

test('write UI exposes the exact delete eligibility used by detail pages', () => {
  const ready = readyPayload();
  const api = loadWriteApi(ready);
  assert.equal(api.canDeleteParticipant({ chatState:'Вышел' }, ready), true);
  assert.equal(api.canDeleteParticipant({ chatState:'В чате' }, ready), false);
  assert.equal(api.canDeleteTeam({ status:'Неактивен', players:0 }, ready), true);
  assert.equal(api.canDeleteTeam({ status:'Неактивен', players:1 }, ready), false);
  assert.equal(api.canDeleteTeam({ status:'На паузе', players:0 }, ready), false);

  const blocked = readyPayload({ permissions:{ isAdmin:true, canEdit:true, canDelete:false } });
  assert.equal(api.canDeleteParticipant({ chatState:'Вышел' }, blocked), false);
  assert.equal(api.canDeleteTeam({ status:'Неактивен', players:0 }, blocked), false);
});

test('participant detail shows delete only for an exited participant', async () => {
  const exited = { telegramId:'12345', name:'Тест', chatState:'Вышел', memberships:[], revision:'rev-p' };
  const ready = readyPayload();
  ready.adminData.participants = [exited];
  let html = await renderDetail(
    'admin-participant-detail-v0600.js',
    'RoyalAdminParticipantDetailV0600',
    'open',
    ready,
    ['12345']
  );
  assert.match(html, /data-admin-delete-participant="1"/);

  const active = readyPayload();
  active.adminData.participants = [{ ...exited, chatState:'В чате' }];
  html = await renderDetail(
    'admin-participant-detail-v0600.js',
    'RoyalAdminParticipantDetailV0600',
    'open',
    active,
    ['12345']
  );
  assert.doesNotMatch(html, /data-admin-delete-participant="1"/);
});

test('team detail shows delete only for an inactive empty team', async () => {
  const empty = { name:'Test Team', game:'Royal Match', status:'Неактивен', players:0, revision:'rev-t' };
  const ready = readyPayload();
  ready.adminData.teams = [empty];
  let html = await renderDetail(
    'admin-team-detail-v0600.js',
    'RoyalAdminTeamDetailV0600',
    'open',
    ready,
    ['Test Team','Royal Match']
  );
  assert.match(html, /data-admin-delete-team="1"/);

  const occupied = readyPayload();
  occupied.adminData.teams = [{ ...empty, players:1 }];
  html = await renderDetail(
    'admin-team-detail-v0600.js',
    'RoyalAdminTeamDetailV0600',
    'open',
    occupied,
    ['Test Team','Royal Match']
  );
  assert.doesNotMatch(html, /data-admin-delete-team="1"/);
});
