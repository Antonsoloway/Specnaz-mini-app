// Shared admin organization only; separate RM/RK keys, no monitoring or game credentials.
const ident=v=>typeof v==='string'&&/^[1-9]\d{0,18}$/.test(v)&&BigInt(v)<=9223372036854775807n;
const uuid=v=>typeof v==='string'&&/^[a-f0-9-]{36}$/.test(v);
const fail=(status,message)=>{throw Object.assign(new Error(message),{status,publicMessage:message});};
export const isFolderAction=op=>['folders','folderSave','folderDelete'].includes(op);
export function validateFolderAction(b){
 if(!b||!isFolderAction(b.operation))fail(400,'Некорректная операция с папками.');
 const keys=b.operation==='folders'?[]:b.operation==='folderDelete'?['folderId','revision']:['folderId','revision','name','teamIds'];
 if(Object.keys(b).some(k=>!['operation','game',...keys].includes(k))||b.game!==undefined&&!['rm','rk'].includes(b.game))fail(400,'Некорректные параметры папки.');
 if(b.operation==='folders')return b;
 if(!Number.isSafeInteger(b.revision)||b.revision<0||!(b.folderId===null&&b.operation==='folderSave'||uuid(b.folderId)))fail(400,'Некорректные параметры папки.');
 if(b.operation==='folderSave'&&(typeof b.name!=='string'||!b.name.trim()||b.name.trim().length>80||/[\u0000-\u001f\u007f]/.test(b.name)||!Array.isArray(b.teamIds)||b.teamIds.length>100||b.teamIds.some(v=>!ident(v))||new Set(b.teamIds).size!==b.teamIds.length))fail(400,'Введите название до 80 символов и выберите не более 100 команд.');
 return b;
}
export async function performFolderAction(storage,body){
 const b=validateFolderAction(body),key='watch-folders:v1:'+(b.game||'rm');
 const state=await storage.get(key)||{revision:0,folders:[]};
 if(b.operation==='folders')return state;
 if(b.revision!==state.revision)fail(409,'Папки уже изменены. Обновите список и повторите изменение.');
 const current=state.folders.find(f=>f.id===b.folderId);
 if(b.folderId&&!current)fail(409,'Папка уже удалена. Обновите список.');
 let folders=state.folders;
 if(b.operation==='folderDelete')folders=folders.filter(f=>f.id!==b.folderId);
 else{
  const name=b.name.trim();
  if(folders.some(f=>f.id!==b.folderId&&f.name.toLocaleLowerCase('ru')===name.toLocaleLowerCase('ru')))fail(409,'Папка с таким названием уже есть.');
  if(!current&&folders.length>=100)fail(400,'Можно создать не более 100 папок.');
  const chosen=new Set(b.teamIds);
  folders=folders.filter(f=>f.id!==b.folderId).map(f=>({...f,teamIds:f.teamIds.filter(id=>!chosen.has(id))}));
  folders.push({id:b.folderId||crypto.randomUUID(),name,teamIds:[...b.teamIds]});
  if(folders.reduce((n,f)=>n+f.teamIds.length,0)>1000)fail(400,'Слишком много команд в папках.');
 }
 const next={revision:state.revision+1,folders};
 await storage.put(key,next);
 return next;
}
