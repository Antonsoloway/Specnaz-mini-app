import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAdminBattleBaseApi,
  filterBattleBaseResults,
  validateBattleBaseQuery,
  resetBattleBaseIndexCacheV1
} from '../worker/src/battle-base-api-v1.js';

const sampleIndex = () => ({
  ok:true,
  version:'competition-index-api-v1',
  generatedAt:new Date().toISOString(),
  counts:{total:2,parsed:2,review:0,teams:3},
  results:[
    {
      resultId:'standard-1',resultClass:'standard',status:'parsed',game:'RM',eventType:'battle',stage:'final',
      firstPublicationUnix:1793976195,firstPublication:'2026-11-06T14:43:15.000Z',
      communityTeam:{name:'JoyBand',rank:1,score:70000},
      visibleTeams:[
        {name:'JoyBand',role:'community',score:70000,searchKeys:['joyband','джойбанд']},
        {name:'AVENGERS TEAM',role:'opponent',score:64000,searchKeys:['avengers team','avengersteam']}
      ],
      sources:[{author:'Санчо Панса',caption:'Битва с AVENGERS TEAM',link:'https://t.me/c/2109152418/21213/318882'}]
    },
    {
      resultId:'epic-1',resultClass:'epic',status:'parsed',game:'RM',eventType:'battle',stage:'final',
      firstPublicationUnix:null,firstPublication:null,
      communityTeam:{name:'FORTUNA',rank:1,score:90000},
      visibleTeams:[{name:'FORTUNA',role:'community',score:90000,searchKeys:['fortuna']}],
      sources:[]
    }
  ]
});

test('battle base filters search community and opponent names with bounded game/score/date filters', () => {
  const query=validateBattleBaseQuery(new URL('https://app.test/?q=AVENGERS%20TEAM&game=RM&eventType=battle&stage=final&scoreMin=65000'),false);
  const found=filterBattleBaseResults(sampleIndex(),query,false);
  assert.equal(found.length,1);
  assert.equal(found[0].resultId,'standard-1');
  const russian=validateBattleBaseQuery(new URL('https://app.test/?q=%D0%B4%D0%B6%D0%BE%D0%B9%D0%B1%D0%B0%D0%BD%D0%B4'),false);
  assert.equal(filterBattleBaseResults(sampleIndex(),russian,false).length,1);
});

test('owner-only epic archive is excluded from the general admin battle base', () => {
  const query=validateBattleBaseQuery(new URL('https://app.test/?resultClass=all'));
  assert.deepEqual(filterBattleBaseResults(sampleIndex(),query).map(item=>item.resultId),['standard-1']);
  assert.throws(()=>validateBattleBaseQuery(new URL('https://app.test/?resultClass=epic')),/BATTLE_BASE_CLASS_INVALID/);
});

test('admin route verifies administrator, applies exact CORS and reuses cached index', async () => {
  resetBattleBaseIndexCacheV1();
  let fetches=0;
  const handler=createAdminBattleBaseApi({
    authorizeAdmin:async()=>({telegramId:'999'}),
    fetchSource:async(_url,init)=>{
      fetches+=1;
      assert.equal(init.headers.Authorization,'Bearer '+'a'.repeat(64));
      return new Response(JSON.stringify(sampleIndex()),{status:200,headers:{'Content-Type':'application/json'}});
    }
  });
  const env={COMPETITION_INDEX_URL:'https://gateway.test/api/internal/competition-index',FRONTEND_ORIGIN:'https://antonsoloway.github.io'};
  const request=url=>new Request(url,{headers:{Origin:env.FRONTEND_ORIGIN,Authorization:'Bearer '+'a'.repeat(64)}});
  const first=await handler(request('https://api.test/admin-battle-base?q=AVENGERS'),env);
  assert.equal(first.status,200);
  assert.equal(first.headers.get('Access-Control-Allow-Origin'),env.FRONTEND_ORIGIN);
  const payload=await first.json();
  assert.equal(payload.results.length,1);
  assert.equal(payload.capabilities.ownerEpicArchive,false);
  const second=await handler(request('https://api.test/admin-battle-base?game=RM'),env);
  assert.equal(second.status,200);
  assert.equal(fetches,1);
});

test('admin route denies non-admins before contacting the D1 index service', async () => {
  resetBattleBaseIndexCacheV1();
  let fetches=0;
  const handler=createAdminBattleBaseApi({
    authorizeAdmin:async()=>{throw Object.assign(new Error('ADMIN_REQUIRED'),{status:403,code:'ADMIN_REQUIRED',publicMessage:'Только администраторы.'});},
    fetchSource:async()=>{fetches+=1;return new Response('{}');}
  });
  const response=await handler(new Request('https://api.test/admin-battle-base',{headers:{Origin:'https://antonsoloway.github.io'}}),{
    FRONTEND_ORIGIN:'https://antonsoloway.github.io'
  });
  assert.equal(response.status,403);
  assert.equal((await response.json()).error,'ADMIN_REQUIRED');
  assert.equal(fetches,0);
});

test('battle base rejects malformed dates and excessive result limits', () => {
  assert.throws(()=>validateBattleBaseQuery(new URL('https://app.test/?from=2026-02-31'),false),/BATTLE_BASE_DATE_INVALID/);
  assert.throws(()=>validateBattleBaseQuery(new URL('https://app.test/?limit=1000'),false),/BATTLE_BASE_LIMIT_INVALID/);
});

test('all admins share the safe cached index and epic records never appear', async () => {
  resetBattleBaseIndexCacheV1();
  let fetches=0;
  const handler=createAdminBattleBaseApi({
    authorizeAdmin:async request=>({telegramId:request.headers.get('X-Test-Admin') || '999'}),
    fetchSource:async()=>{
      fetches+=1;
      return new Response(JSON.stringify(sampleIndex()),{status:200});
    }
  });
  const env={COMPETITION_INDEX_URL:'https://gateway.test/api/internal/competition-index',FRONTEND_ORIGIN:'https://antonsoloway.github.io'};
  const request=(token,admin)=>new Request('https://api.test/admin-battle-base',{
    headers:{Origin:env.FRONTEND_ORIGIN,Authorization:'Bearer '+token,'X-Test-Admin':admin}
  });
  const first=await handler(request('n'.repeat(64),'999'),env);
  assert.equal((await first.json()).results.length,1);
  const second=await handler(request('a'.repeat(64),'888'),env);
  assert.equal((await second.json()).results.length,1);
  assert.equal(fetches,1);
});
