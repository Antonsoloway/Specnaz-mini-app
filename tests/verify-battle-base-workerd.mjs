import {createRequire} from 'node:module';
import {createHmac} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import assert from 'node:assert/strict';

const require=createRequire(process.argv[2]||import.meta.url);
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const scriptPath=process.argv[3];
if(!scriptPath)throw new Error('Provide bundled Worker path');
const persist=await mkdtemp(join(tmpdir(),'battle-base-workerd-'));
const sessionSecret='battle-base-test-session-secret';
const adminTokenFor=tg=>{
  const payload=Buffer.from(JSON.stringify({tg:String(tg),exp:Math.floor(Date.now()/1000)+600})).toString('base64url');
  return payload+'.'+createHmac('sha256',sessionSecret).update(payload).digest('base64url');
};
const adminToken=adminTokenFor('123');
const nonAdminToken=adminTokenFor('456');
const index={
  ok:true,version:'competition-index-api-v1',generatedAt:new Date().toISOString(),
  counts:{total:1,standard:1,epic:0,parsed:1,review:0,teams:2},
  results:[{
    resultId:'battle-screen-1',resultClass:'standard',status:'parsed',game:'RM',eventType:'battle',stage:'final',
    firstPublicationUnix:1793976195,firstPublication:'2026-11-06T14:43:15.000Z',publicationUnixValues:[1793976195],
    communityTeam:{name:'JoyBand',rank:1,score:70000},
    visibleTeams:[
      {name:'JoyBand',role:'community',rank:1,score:70000,searchKeys:['joyband','джойбанд']},
      {name:'AVENGERS TEAM',role:'opponent',rank:2,score:64000,searchKeys:['avengers team','avengersteam']}
    ],
    sources:[{author:'Санчо Панса',caption:'Битва с AVENGERS TEAM',topic:'База спецназа',link:'https://t.me/c/2109152418/21213/318882'}]
  }]
};
let gatewayCalls=0;
const options={
  rootPath:dirname(scriptPath),name:'battle-base-fixture',modules:true,scriptPath,compatibilityDate:'2026-08-15',
  bindings:{
    FRONTEND_ORIGIN:'https://antonsoloway.github.io',
    SESSION_SECRET:sessionSecret,
    BOT_TOKEN:'fixture-bot-token',
    TELEGRAM_CHAT_ID:'-1002109152418',
    GITHUB_TOKEN:'fixture-github-token',
    DATA_REPO:'fixture/data',
    COMPETITION_INDEX_URL:'https://specnaz-ai-telegram-gateway.soloway3852.workers.dev/api/internal/competition-index'
  },
  outboundService:async request=>{
    const url=new URL(request.url);
    if(url.hostname==='api.telegram.org'){
      const userId=url.searchParams.get('user_id');
      return Response.json({ok:true,result:{status:userId==='123'?'administrator':'member'}});
    }
    if(url.hostname==='specnaz-ai-telegram-gateway.soloway3852.workers.dev'){
      gatewayCalls+=1;
      assert.equal(request.headers.get('Authorization'),'Bearer '+adminToken);
      return Response.json(index);
    }
    throw new Error('Unexpected outbound host '+url.hostname);
  }
};
let mf;
try{
  mf=new Miniflare(convertV4MiniflareOptions?{...convertV4MiniflareOptions(options),resourcePersistencePath:persist}:options);
  const verified=await mf.dispatchFetch('https://miniapp.test/verify-admin-session',{headers:{Authorization:'Bearer '+adminToken}});
  assert.equal(verified.status,200);
  assert.deepEqual(await verified.json(),{ok:true});

  const denied=await mf.dispatchFetch('https://miniapp.test/verify-admin-session',{headers:{Authorization:'Bearer '+nonAdminToken}});
  assert.equal(denied.status,403);

  const preflight=await mf.dispatchFetch('https://miniapp.test/admin-battle-base',{
    method:'OPTIONS',headers:{Origin:'https://antonsoloway.github.io','Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'authorization'}
  });
  assert.equal(preflight.status,204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),'https://antonsoloway.github.io');

  const deniedSearch=await mf.dispatchFetch('https://miniapp.test/admin-battle-base',{
    headers:{Origin:'https://antonsoloway.github.io',Authorization:'Bearer '+nonAdminToken}
  });
  assert.equal(deniedSearch.status,403);
  assert.equal(gatewayCalls,0,'non-admin must be rejected before the index service');

  const search=await mf.dispatchFetch('https://miniapp.test/admin-battle-base?q=AVENGERS',{
    headers:{Origin:'https://antonsoloway.github.io',Authorization:'Bearer '+adminToken}
  });
  assert.equal(search.status,200);
  assert.equal(search.headers.get('Access-Control-Allow-Origin'),'https://antonsoloway.github.io');
  const body=await search.json();
  assert.equal(body.ok,true);
  assert.equal(body.pagination.total,1);
  assert.equal(body.results[0].communityTeam.name,'JoyBand');
  assert.equal(body.results[0].visibleTeams[1].name,'AVENGERS TEAM');
  assert.equal(gatewayCalls,1);

  const wrongOrigin=await mf.dispatchFetch('https://miniapp.test/admin-battle-base',{
    headers:{Origin:'https://evil.example',Authorization:'Bearer '+adminToken}
  });
  assert.equal(wrongOrigin.status,403);
  assert.equal(gatewayCalls,1);
  console.log(JSON.stringify({checks:8,adminSession:'pass',nonAdminDenied:'pass',cors:'pass',opponentSearch:'pass',gatewayCalls,liveNetworkCalls:0}));
}finally{
  await mf?.dispose();
  await rm(persist,{recursive:true,force:true});
}
