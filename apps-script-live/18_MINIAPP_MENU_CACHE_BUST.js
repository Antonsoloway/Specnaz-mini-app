/*
 * Royal CRM / Таблица ЧП
 * 18_MINIAPP_MENU_CACHE_BUST.js
 * v1.3.0
 */

var MINIAPP_MENU_CACHE_BUST_VERSION = '1.3.0';
var MINIAPP_FRONTEND_URL_V055 = 'https://antonsoloway.github.io/Specnaz-mini-app/';

function MINIAPP_switchMenuToV055() {
  var props = PropertiesService.getScriptProperties();
  var token = String(props.getProperty('TELEGRAM_BOT_TOKEN') || props.getProperty('BOT_TOKEN') || '').trim();
  if (!token) throw new Error('Telegram bot token property is missing');

  var gasUrl = String(ScriptApp.getService().getUrl() || '').trim();
  if (!gasUrl) throw new Error('Apps Script web app URL is unavailable');

  var menuUrl = MINIAPP_FRONTEND_URL_V055 + '?v=055&gas=' + encodeURIComponent(gasUrl);
  var api = 'https://api.telegram.org/bot' + token + '/';
  var text = 'Открыть приложение';

  try {
    var currentResp = UrlFetchApp.fetch(api + 'getChatMenuButton', {
      method: 'post', contentType: 'application/json', payload: '{}', muteHttpExceptions: true
    });
    if (currentResp.getResponseCode() === 200) {
      var current = JSON.parse(currentResp.getContentText());
      var existingText = current && current.ok && current.result ? String(current.result.text || '').trim() : '';
      if (existingText) text = existingText;
    }
  } catch (ignore) {}

  var payload = {
    menu_button: { type: 'web_app', text: text, web_app: { url: menuUrl } }
  };

  var response = UrlFetchApp.fetch(api + 'setChatMenuButton', {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  var code = response.getResponseCode();
  var body = JSON.parse(response.getContentText() || '{}');
  if (code !== 200 || !body.ok) {
    throw new Error('Telegram setChatMenuButton failed HTTP ' + code + ': ' + String(body.description || 'unknown'));
  }

  return { ok: true, version: MINIAPP_MENU_CACHE_BUST_VERSION, url: menuUrl, gasFallback: true, text: text };
}

function MINIAPP_switchMenuToV054() { return MINIAPP_switchMenuToV055(); }
function MINIAPP_switchMenuToV053() { return MINIAPP_switchMenuToV055(); }
function MINIAPP_switchMenuToV052() { return MINIAPP_switchMenuToV055(); }
