/* Royal CRM Mini App — stability/version guard v0.5.35 */
(() => {
  const VERSION='0.5.35';
  function applyVersion(){const badge=document.getElementById('versionBadge');if(badge)badge.textContent=`v${VERSION} ›`;}
  if(typeof renderAuth==='function'){const native=renderAuth;renderAuth=function(data){const r=native(data);applyVersion();return r;};}
  if(typeof loadSnapshot==='function'){const native=loadSnapshot;loadSnapshot=async function(){try{return await native();}finally{applyVersion();}};}
  if(typeof renderPage==='function'){const native=renderPage;renderPage=function(page){const r=native(page);applyVersion();return r;};}
  applyVersion();setTimeout(applyVersion,0);window.__ROYAL_UI_VERSION__=VERSION;
})();
