/* Royal CRM / Таблица ЧП — 22_MINIAPP_BOT_APP_MENU.js v1.0.34 */
var MINIAPP_BOT_APP_MENU_VERSION = '1.0.34';
var MINIAPP_BOT_APP_URL = 'https://antonsoloway.github.io/Specnaz-mini-app/app-v0536.html';
function MINIAPP_setupBotAppMenu() {
  var props=PropertiesService.getScriptProperties();
  var token=String(props.getProperty('TELEGRAM_BOT_TOKEN')||props.getProperty('BOT_TOKEN')||'').trim();
  if(!token) throw new Error('Telegram bot token property is missing');
  var gasUrl=String(ScriptApp.getService().getUrl()||'').trim();
  var appUrl=MINIAPP_BOT_APP_URL+'?cb=20260816-1736';
  if(gasUrl) appUrl+='&gas='+encodeURIComponent(gasUrl);
  var api='https://api.telegram.org/bot'+token+'/';
  var commands=MINIAPP_botAppMenuCall_(api+'setMyCommands',{commands:[{command:'start',description:'🚀 Открыть приложение'}],scope:{type:'all_private_chats'}});
  if(!commands.ok) throw new Error('setMyCommands failed: '+String(commands.description||'unknown'));
  MINIAPP_botAppMenuCall_(api+'setChatMenuButton',{menu_button:{type:'commands'}}); Utilities.sleep(350);
  var menu=MINIAPP_botAppMenuCall_(api+'setChatMenuButton',{menu_button:{type:'web_app',text:'🕊️Приложение ЧП🕊️',web_app:{url:appUrl}}});
  if(!menu.ok) throw new Error('setChatMenuButton failed: '+String(menu.description||'unknown'));
  var verify=MINIAPP_botAppMenuCall_(api+'getChatMenuButton',{});
  return {ok:true,version:MINIAPP_BOT_APP_MENU_VERSION,appUrl:appUrl,menuButton:verify&&verify.ok?verify.result:null};
}
function MINIAPP_botAppMenuCall_(url,payload){var response=UrlFetchApp.fetch(url,{method:'post',contentType:'application/json',payload:JSON.stringify(payload||{}),muteHttpExceptions:true});var body={};try{body=JSON.parse(response.getContentText()||'{}');}catch(_){}if(!body||typeof body!=='object')body={};body.httpCode=response.getResponseCode();return body;}
