const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const bytes=[1,-128,127,0],sha=crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob 4\0'),Buffer.from(bytes)])).digest('hex');
function media(responses){
 const calls=[],context={Utilities:{newBlob(s){return {getBytes:()=>[...Buffer.from(s)]};},computeDigest(a,b){assert.equal(a,'sha1');return [...crypto.createHash('sha1').update(Buffer.from(b)).digest()].map(x=>x>127?x-256:x);},DigestAlgorithm:{SHA_1:'sha1'},base64Encode:b=>Buffer.from(b).toString('base64')},UrlFetchApp:{fetch(url,options){calls.push({url,...options});const next=responses.shift();assert.ok(next,'unexpected network call');return {getResponseCode:()=>next[0],getContentText:()=>JSON.stringify(next[1]||{})};}}};
 vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'apps-script-live/17_MINIAPP_PERSISTENT_MEDIA.js'),'utf8'),context);context.MINIAPP_mediaEncodePath_=s=>s;context.MINIAPP_mediaGithubHeaders_=()=>({Authorization:'test'});
 return {calls,run:()=>context.MINIAPP_teamGithubUpsert_({repo:'fixture/private',branch:'main'},'media/teams/test.bin',{getBytes:()=>bytes},'test')};
}
test('unchanged binary media skips GitHub PUT using exact Git blob SHA',()=>{const x=media([[200,{sha}]]);assert.equal(x.run().unchanged,true);assert.equal(x.calls.length,1);});
test('new and replacement media retain exact immutable bytes',()=>{for(const code of [404,200]){const x=media([[code,{sha:'old'}],[201,{}]]);assert.equal(x.run().unchanged,false);const p=JSON.parse(x.calls[1].payload);assert.equal(p.content,Buffer.from(bytes).toString('base64'));assert.equal(p.sha,code===200?'old':undefined);}});
test('branch conflict re-reads SHA and retries the identical content',()=>{const x=media([[200,{sha:'old'}],[409,{}],[200,{sha:'new'}],[200,{}]]);x.run();assert.equal(x.calls.length,4);const a=JSON.parse(x.calls[1].payload),b=JSON.parse(x.calls[3].payload);assert.equal(a.content,b.content);assert.equal(b.sha,'new');});
test('concurrent create resolves to existing identical bytes without another PUT',()=>{const x=media([[404,{}],[422,{message:'sha was not supplied; file already exists'}],[200,{sha}]]);assert.equal(x.run().unchanged,true);assert.equal(x.calls.length,3);});
test('permission, rate limit and invalid requests are not retried',()=>{for(const code of [401,403,429,422,500]){const x=media([[404,{}],[code,{message:'invalid content'}]]);assert.throws(x.run,new RegExp('HTTP '+code));assert.equal(x.calls.length,2);}});
test('conflict retries are bounded and failed lookup never writes',()=>{const x=media(Array.from({length:3},()=>[[404,{}],[409,{}]]).flat());assert.throws(x.run,/HTTP 409/);assert.equal(x.calls.length,6);const y=media([[503,{}]]);assert.throws(y.run,/lookup HTTP 503/);assert.equal(y.calls.length,1);});
function membership(){
 const matrix=Array.from({length:3},()=>Array(27).fill('')),writes=[],reads=[];
 const slots=[5,8,11,14,17];for(let i=0;i<5;i++){matrix[0][slots[i]-1]='Old';matrix[0][22+i]='Royal Match';matrix[1][slots[i]-1]='Old';matrix[1][22+i]='Royal Kingdom';}matrix[2][4]='Ambiguous';matrix[2][22]='Royal Match';
 const base={getLastRow:()=>4,getRange(r,c,n=1,w=1){return {getDisplayValues(){reads.push([r,c,n,w]);return matrix.slice(r-2,r-2+n).map(row=>row.slice(c-1,c-1+w));},setValue(v){writes.push([r,c,v]);matrix[r-2][c-1]=v;}};}};
 const teams={getLastRow:()=>5,getRange(){return {getDisplayValues:()=>[['Royal Match','⚡Old'],['Royal Kingdom','Old'],['Royal Match','🌟Ambiguous'],['Royal Match','💎Ambiguous']]};}};
 const c={SpreadsheetApp:{flush(){}},console};vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(root,'apps-script-live/07_FINAL_ROLE_FIX.js'),'utf8'),c);
 return {c,writes,reads,ss:{getSheetByName:n=>n==='База участников'?base:n==='Команды'?teams:null}};
}
test('rename batches all five membership reads and writes only matching game/team cells',()=>{const x=membership();assert.equal(x.c.finalRoleCascadeTeamRename_(x.ss,'Royal Match','Old','New'),5);assert.deepEqual(x.reads,[[2,5,3,23]]);assert.deepEqual(x.writes, [5,8,11,14,17].map(col=>[2,col,'New']));});
test('decoration repair batches reads, preserves other games and ambiguous identities',()=>{const x=membership();const result=x.c.finalRoleRepairDecoratedTeamMemberships_(x.ss,{skipMark:true});assert.equal(result.changed,5);assert.deepEqual(x.reads,[[2,5,3,23]]);assert.deepEqual(x.writes,[5,8,11,14,17].map(col=>[2,col,'⚡Old']));});
