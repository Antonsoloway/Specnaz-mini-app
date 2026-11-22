const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const helper=fs.readFileSync(path.join(__dirname,'../patches/specnaz-cross-topic-20261122/history-append-fastpath.js'),'utf8');
const headers=['Дата','Аватар','Имя','Команда','Было','Стало','Добавлено','Звание','Сообщение','Источник','Строка базы','Telegram ID','Ключ события','Тип события','Имя для Telegram-ссылки','Ссылка сообщения'];
let repairs=0,reads=0;
const ctx={HISTORY_WIDTH:16,clean_:v=>String(v||'').trim(),ensureHistoryStructure_:()=>repairs++};
vm.createContext(ctx);vm.runInContext(helper,ctx);
function sheet(h,width=26){return {getMaxColumns:()=>width,getRange:(r,c,n,m)=>{assert.deepEqual([r,c,n,m],[1,1,1,16]);reads++;return {getDisplayValues:()=>[h]}}};}
ctx.ensureHistoryStructureForAppend_(sheet(headers));assert.equal(repairs,0);assert.equal(reads,1);
const wrong=headers.slice();wrong[15]='';ctx.ensureHistoryStructureForAppend_(sheet(wrong));assert.equal(repairs,1);
ctx.ensureHistoryStructureForAppend_(sheet(headers,10));assert.equal(repairs,2);assert.equal(reads,2);
const patch=fs.readFileSync(path.join(__dirname,'../patches/specnaz-cross-topic-20261122/history-append-fastpath.patch'),'utf8');
assert.ok(patch.includes('-  ensureHistoryStructure_(history);')||patch.includes('-    ensureHistoryStructure_(history);'));
assert.ok(patch.includes('+  ensureHistoryStructureForAppend_(history);')||patch.includes('+    ensureHistoryStructureForAppend_(history);'));
console.log('PASS: established history reads one header row and performs zero bulk formatting; damaged/narrow schema invokes full repair');
