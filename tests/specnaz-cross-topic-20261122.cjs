const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const bridge = fs.readFileSync(process.argv[2] || require('node:path').join(__dirname,'../patches/specnaz-cross-topic-20261122/39_SPECNAZ_NATIVE_REACTIONS.js'),'utf8');
let admins = new Set(['5708116632']);
let awards = new Set();
let awardCalls = 0;
let createdSheets = 0;
class Sheet {
  constructor(name) { this.name=name; this.rows=[]; }
  getLastRow(){return this.rows.length;}
  getMaxRows(){return 1000;}
  getRange(r,c,n,m) {
    let self=this;
    return {
      setNumberFormat(){return this;},
      setValues(arr) {arr.forEach((row,i)=>{self.rows[r+i-1]=row.slice();});},
      getDisplayValues(){return Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>String(self.rows[r+i-1]?.[c+j-1]??'')));},
      getDisplayValue(){return String(self.rows[r-1]?.[c-1]??'');},
      createTextFinder(q){return {
        exact:false, matchEntireCell(){this.exact=true;return this;},
        findAll(){ const a=[]; for(let i=r-1;i<r+n-1;i++)if((this.exact ? String(self.rows[i]?.[c-1]??'')===String(q) : String(self.rows[i]?.[c-1]??'').includes(String(q))))a.push({getRow:()=>i+1,getDisplayValue:()=>String(self.rows[i]?.[c-1]??'')});return a; }
      }},
    };
  }
  appendRow(v){this.rows.push(v.slice());}
  hideSheet(){}
  setFrozenRows(){}
}
class Spreadsheet {
  constructor(){this.sheets=new Map()}
  getSheetByName(name){return this.sheets.get(name)||null}
  insertSheet(name){createdSheets++;const x=new Sheet(name);this.sheets.set(name,x);return x;}
}
const spreadsheet=new Spreadsheet();
const ctx={
  PropertiesService:{getScriptProperties(){return {getProperty(k){return k==='KEY'?'TRUST':k==='ROYAL_CRM_WEBHOOK_SECRET_CURRENT'?'INNER':null}}}},
  GOLUB_OWNER_WEBHOOK_PROP:{querySecret:'KEY'},
  GOLUB_OWNER_WEBHOOK_QUERY_PARAM:'golub_owner_key',
  GOLUB_OWNER_raw_:e=>e?.postData?.contents||'',
  GOLUB_OWNER_safeJson_:s=>JSON.parse(s),
  GOLUB_OWNER_safeEqual_:(x,y)=>Boolean(x)&&x===y,
  GOLUB_OWNER_json_:body=>({body}),
  SHEET_LOG:'Лог вебхуков',
  tgAvatarApi_:(_method, q)=>({ok:true,result:{status:admins.has(String(q.user_id))?'administrator':'member'}}),
  parsePlayer_:(_ss,payload)=>({tgId:payload.tg_id,payload}),
  processWebhook_:(_ss,player)=>{const k=player.tgId+'|'+player.payload.reply_message_link;const seen=awards.has(k);if(!seen){awards.add(k);awardCalls++}return {status:seen?'REPUTATION_SOURCE_ALREADY_COUNTED':'REPUTATION_UPDATED',tg_id:player.tgId};},
  console
};
vm.createContext(ctx);
vm.runInContext(bridge,ctx);
const group={id:-1002109152418,type:'supergroup'};
function e(update, secret='TRUST'){return {parameter:{golub_owner_key:secret},postData:{contents:JSON.stringify(update)}}}
function message(mid,updateId=1000){return {update_id:updateId,message:{message_id:mid,message_thread_id:21213,date:1794647090,chat:group,from:{id:7907143322,first_name:'Мила',is_bot:false},text:'Зашла в Friends'}}}
function reaction(mid,updateId=1001,actor=5708116632){return {update_id:updateId,message_reaction:{message_id:mid,date:1794650146,chat:group,user:{id:actor},old_reaction:[],new_reaction:[{type:'emoji',emoji:'🆒'}]}}}
function prep(update,secret='TRUST'){return ctx.SNR_prepareTelegram_(e(update,secret));}
function proc(update,secret='TRUST'){const x=prep(update,secret);assert.ok(x.event);const data=JSON.parse(x.event.postData.contents);return ctx.SNR_process_(spreadsheet,data,'unique-event-'+update.update_id);}
assert.equal(prep(message(322060),'WRONG').response.body.status,'NATIVE_RELAY_AUTH_REQUIRED');
assert.equal(prep({event:'reputation',tg_id:1234}),null);
assert.equal(prep({update_id:1003,message:{...message(322060).message,chat:{id:-100777,type:'supergroup'}}}),null);
assert.equal(proc(message(322060)).status,'NATIVE_SOURCE_STORED');
assert.equal(proc(message(322060,1004)).status,'NATIVE_SOURCE_ALREADY_STORED');
assert.equal(proc(reaction(322060)).status,'REPUTATION_UPDATED');
assert.equal(proc(reaction(322060,1005)).status,'REPUTATION_SOURCE_ALREADY_COUNTED');
assert.equal(awardCalls,1);
assert.equal(proc(reaction(322063,1006)).status,'RETRY_LOCKED');
assert.equal(proc(message(322063,1007)).status,'NATIVE_SOURCE_STORED');
assert.equal(proc(reaction(322063,1008)).status,'REPUTATION_UPDATED');
assert.equal(proc(reaction(322063,1009,999999999)).status,'NATIVE_MARKER_NOT_ADMIN');
assert.equal(awardCalls,2);
const anonymous=reaction(322064,1011);
delete anonymous.message_reaction.user;
anonymous.message_reaction.actor_chat=group;
assert.equal(proc(message(322064,1012)).status,'NATIVE_SOURCE_STORED');
assert.equal(proc(anonymous).status,'REPUTATION_UPDATED');
assert.equal(awardCalls,3);
assert.equal(createdSheets,1);
const neutral={update_id:1010,message_reaction:{...reaction(322060).message_reaction,new_reaction:[{type:'emoji',emoji:'🔥'}]}};
assert.equal(proc(neutral).status,'NATIVE_TELEGRAM_IGNORED');

// Regression: real battle-topic source exists only in the retained raw audit.
const rawlog=spreadsheet.insertSheet('Лог вебхуков');
rawlog.appendRow(Array(20).fill('header'));
const original=message(326200,2000);
original.message.message_thread_id=267777;
const auditrow=Array(20).fill('');
auditrow[19]=JSON.stringify({native:original});
rawlog.appendRow(auditrow);
assert.equal(proc(reaction(326200,2001)).status,'REPUTATION_UPDATED');
assert.equal(awardCalls,4);
const indexed=ctx.SNR_source_(spreadsheet,'-1002109152418',326200);
assert.equal(indexed[2],'267777');
assert.ok([...awards].some(k=>k.endsWith('/267777/326200')));
// Duplicate native/ChatKeeper source cannot increment twice.
assert.equal(proc(reaction(326200,2002)).status,'REPUTATION_SOURCE_ALREADY_COUNTED');
assert.equal(awardCalls,4);
assert.equal(proc(reaction(326200,2003,999999999)).status,'NATIVE_MARKER_NOT_ADMIN');
assert.equal(awardCalls,4);
// Another battle topic, same participant, independent source earns one point.
const other=message(325739,2004);
other.message.message_thread_id=277073;
const another=Array(20).fill('');another[19]=JSON.stringify(other);rawlog.appendRow(another);
assert.equal(proc(reaction(325739,2005)).status,'REPUTATION_UPDATED');
assert.equal(awardCalls,5);
assert.ok([...awards].some(k=>k.endsWith('/277073/325739')));
assert.equal(proc(reaction(999111,2006)).status,'RETRY_LOCKED');
assert.equal(prep(reaction(325739,2007),'WRONG').response.body.status,'NATIVE_RELAY_AUTH_REQUIRED');
console.log('PASS: native auth/admin/idempotency and actual cross-topic raw-log recovery regressions');
