/*
 * Royal CRM / Таблица ЧП
 * 18_MINIAPP_MENU_CACHE_BUST.js
 * v1.0.0
 *
 * One-shot helper: changes the Telegram bot Mini App menu URL query parameter
 * so Android Telegram/WebView cannot reuse the previously cached page.
 * Reuses the existing Telegram bot token from Script Properties.
 */

var MINIAPP_MENU_CACHE_BUST_VERSION = '1.0.0';
var MINIAPP_MENU_URL_V052 = 'https://antonsoloway.github.io/Specnaz-mini-app/?v=052';

function MINIAPP_switchMenuToV052() {
  var props = PropertiesService.getScriptProperties();
  var token = String(props.getProperty('TELEGRAM_BOT_TOKEN') || props.getProperty('BOT_TOKEN') || '').trim();
  if (!token) throw new Error('Telegram bot token property is missing');

  var api = 'https://api.telegram.org/bot' + token + '/';
  var text = 'Открыть приложение';

  // Preserve the current menu-button caption when Telegram returns one.
  try {
    var currentResp = UrlFetchApp.fetch(api + 'getChatMenuButton', {
      method: 'post',
      contentType: 'application/json',
      payload: '{}',
      muteHttpExceptions: true
    });
    if (currentResp.getResponseCode() === 200) {
      var current = JSON.parse(currentResp.getContentText());
      var existingText = current && current.ok && current.result ? String(current.result.text || '').trim() : '';
      if (existingText) text = existingText;
    }
  } catch (ignore) {}

  var payload = {
    menu_button: {
      type: 'web_app',
      text: text,
      web_app: { url: MINIAPP_MENU_URL_V052 }
    }
  };

  var response = UrlFetchApp.fetch(api + 'setChatMenuButton', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  var body = JSON.parse(response.getContentText() || '{}');
  if (code !== 200 || !body.ok) {
    throw new Error('Telegram setChatMenuButton failed HTTP ' + code + ': ' + String(body.description || 'unknown'));
  }

  return {
    ok: true,
    version: MINIAPP_MENU_CACHE_BUST_VERSION,
    url: MINIAPP_MENU_URL_V052,
    text: text
  };
}
