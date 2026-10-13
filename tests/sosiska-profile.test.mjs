import test from 'node:test';
import assert from 'node:assert/strict';
import {createSosiskaApi,validateAgentAction,normalizePlayerProfile} from '../worker/src/sosiska-api.js';
const raw={RequestedUserId:'777',Profile:{Name:'Player',Level:14201,Crown:15,JoinDate:'1685577600',TeamId:'999',TeamName:'Team'},Stats:[{Id:9,Value:'32155'},{Id:8,Value:'14244'},{Id:10,Value:'10'},{Id:2,Value:'15257'},{Id:3,Value:'1046'},{Id:4,Value:'0'},{Id:5,Value:'160'},{Id:31,Value:'12'},{Id:30,Value:'199'},{Id:999,Value:'9007199254740993'}]};
test('nine game profile statistics map exactly; missing fields stay absent, legitimate zero stays zero',()=>{
 assert.deepEqual(normalizePlayerProfile('777',raw).stats,{totalCrown:'32155',highestCrown:'14244',leagueWins:'10',firstTryWins:'15257',helpsMade:'1046',helpsReceived:'0',areasCompleted:'160',collectionsCompleted:'12',setsCompleted:'199'});
 assert.deepEqual(normalizePlayerProfile('777',{...raw,Stats:[]}).stats,{});assert.throws(()=>normalizePlayerProfile('777',{...raw,Stats:[{Id:9,Value:'-1'}]}));assert.throws(()=>normalizePlayerProfile('777',{...raw,Stats:[{Id:9,Value:'1'},{Id:9,Value:'2'}]}));
});
test('profile target validation preserves int64 IDs',()=>{assert.doesNotThrow(()=>validateAgentAction({operation:'profile',userId:'9223372036854775807'}));for(const userId of [777,'0','x','9223372036854775808'])assert.throws(()=>validateAgentAction({operation:'profile',userId}));});
test('authorized profile facade invokes only selected player and rejects mismatched request correlation',async()=>{
 const messages=[],env={FRONTEND_ORIGIN:'https://mini.test',RM_AGENT_API_KEY:'private'.repeat(10)};
 const handle=createSosiskaApi({authorizeAdmin:async()=>{},fetchAgent:async(url,init)=>{messages.push(JSON.parse(init.body));return Response.json({ok:true,data:raw});}});
 const request=()=>new Request('https://api.test/admin-agent',{method:'POST',headers:{Origin:env.FRONTEND_ORIGIN,'Content-Type':'application/json'},body:JSON.stringify({operation:'profile',userId:'777'})});
 const result=await handle(request(),env);assert.equal(result.status,200);assert.deepEqual(messages,[{protocolVersion:1,operation:'getProfile',payload:{userId:'777'}}]);assert.equal((await result.json()).data.userId,'777');
 const wrong=createSosiskaApi({authorizeAdmin:async()=>{},fetchAgent:async()=>Response.json({ok:true,data:{...raw,RequestedUserId:'778'}})});assert.equal((await wrong(request(),env)).status,502);
});
