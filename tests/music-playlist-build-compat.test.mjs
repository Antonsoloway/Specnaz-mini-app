import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../music-playlist-v061.js', import.meta.url),'utf8');
const html = fs.readFileSync(new URL('../app-v0617.html',import.meta.url),'utf8');
for (const build of ['0.6.1','0.6.15','0.6.16','0.6.17']) {
  const timers=[];
  const handlers={};
  const listeners={};
  const audio={isConnected:true,dataset:{},loop:true,
    addEventListener:(name,fn)=>listeners[name]=fn};
  const app={fetchProtectedMediaObjectUrl:async asset=>asset,releaseProtectedMedia:()=>{}};
  const window={
    __ROYAL_BUILD__:build,
    RoyalAppV0600:app,
    setTimeout:(fn,delay)=>{timers.push({fn,delay});return 1;},
    addEventListener:(name,fn)=>{handlers[name]=fn},
  };
  const document={getElementById:()=>audio,querySelector:()=>audio};
  vm.runInNewContext(source,{window,document,console,URL,Blob,Math,setTimeout:window.setTimeout});
  assert.equal(window.__ROYAL_MUSIC_PLAYLIST_V061__,'0.6.1-playlist.1',build);
  assert.equal(window.RoyalMusicPlaylistV061.tracks.length,6,build);
  assert.equal(timers.length,6,build);
  assert.equal(audio.loop,true,'installation only after first scheduling');
  timers[0].fn();
  assert.equal(audio.loop,false,'player installed on ' + build);
  assert.equal(typeof handlers['royal:auth-ready'],'function');
  assert.equal(typeof listeners.ended,'function');
}
for (const build of ['0.5.59','1.0.0','',null]) {
  const window={__ROYAL_BUILD__:build};
  vm.runInNewContext(source,{window});
  assert.equal(window.RoyalMusicPlaylistV061,undefined,'disabled for '+build);
}
assert.match(html,/music-playlist-v061\.js\?v=20261116-v0617-music-compat1/);
assert.doesNotMatch(html,/music-playlist-v061\.js\?v=20260824-v061-music-playlist1/);
console.log('PASS music playlist 0.6.x build compatibility, installation and cache bust (9 checks)');
