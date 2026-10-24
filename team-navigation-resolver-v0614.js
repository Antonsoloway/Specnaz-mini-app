/* Royal CRM mini-app: conservative team navigation resolution by exact game+ID.
 * Source snapshots may contain transliterated/mixed-script names and flags.
 * No partial matching; ambiguous candidates fail closed.
 */
(function(root, factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.RoyalTeamNavigationV0614=api;
})(typeof window!=='undefined'?window:undefined,function(){
  'use strict';
  function clean(v){return String(v==null?'':v).trim();}
  function game(v){
    const text=clean(v).toLocaleLowerCase('ru-RU');
    if(text==='рк'||text==='rk'||text.includes('royal kingdom'))return 'Royal Kingdom';
    if(text==='рм'||text==='rm'||text.includes('royal match'))return 'Royal Match';
    return clean(v);
  }
  function key(v){
    return clean(v).normalize('NFKC').toLocaleLowerCase('ru-RU')
      .replace(/ё/g,'е').replace(/[\u{1F1E6}-\u{1F1FF}\uFE0F\u200D]/gu,'')
      .replace(/[^a-zа-я0-9]+/gu,' ').trim().replace(/\s+/g,' ');
  }
  function gid(v){
    const id=clean(v).replace(/\.0$/,'');
    return /^\d{5,20}$/.test(id)?id:'';
  }
  function unique(list){return list.length===1?list[0]:null;}
  function sameGame(t,wanted){return !wanted||game(t?.game||(t?.games||[])[0])===wanted;}
  function publicTeam(records, name, requestedGame, requestedId=''){
    const teams=Array.isArray(records)?records:[];
    const wantedGame=game(requestedGame),wantedName=key(name),id=gid(requestedId);
    const inGame=teams.filter(t=>sameGame(t,wantedGame));
    if(id){
      const matching=inGame.filter(t=>gid(t?.gameTeamId)===id);
      if(matching.length)return unique(matching);
    }
    if(!wantedName)return null;
    const exact=inGame.filter(t=>key(t?.name)===wantedName);
    if(exact.length)return unique(exact);
    const aliases=inGame.filter(t=>Array.isArray(t?.searchKeys)&&
      t.searchKeys.some(a=>key(a)===wantedName));
    return unique(aliases);
  }
  function adminTeam(dataOrTeams,name,requestedGame,publicTeams=[],requestedId=''){
    const teams=Array.isArray(dataOrTeams)?dataOrTeams:
      (Array.isArray(dataOrTeams?.adminData?.teams)?dataOrTeams.adminData.teams:[]);
    const wantedGame=game(requestedGame),wantedName=key(name);
    const scoped=teams.filter(t=>sameGame(t,wantedGame));
    let id=gid(requestedId);
    if(!id){
      const source=publicTeam(publicTeams,name,wantedGame);
      id=gid(source?.gameTeamId);
    }
    // Prefer the stable game ID over historical/renamed text, but never cross games.
    if(id){
      const matching=scoped.filter(t=>gid(t?.gameTeamId)===id);
      if(matching.length)return unique(matching);
    }
    if(!wantedName)return null;
    return unique(scoped.filter(t=>key(t?.name)===wantedName));
  }
  return Object.freeze({version:'0.6.14-team-navigation.1',game,key,gid,publicTeam,adminTeam});
});
