/*
 * Royal CRM / Таблица ЧП
 * 21_MINIAPP_START_WELCOME.js
 * v1.0.0
 *
 * Handles private /start before the reliable webhook queue.
 * First /start: welcome + Mini App button.
 * Repeated /start: compact launch message + button.
 */

var MINIAPP_START_WELCOME_VERSION = '1.0.0';
var MINIAPP_START_WELCOME_PROP_PREFIX = 'MINIAPP_START_WELCOME_SENT_';
var MINIAPP_START_WELCOME_FALLBACK_URL = 'https://antonsoloway.github.io/Specnaz-mini-app/';

function MINIAPP_handleStartWelcome_(e) {
  var update;
  try {
    var raw = e && e.postData && e.postData.contents ? String(e.postData.contents) : '';
    if (!raw) return null;
    update = JSON.parse(raw);
  } catch (_) {
    return null;
  }

  var message = update && update.message;
  if (!message || !message.chat || String(message.chat.type || '') !== 'private') return null;

  var text = String(message.text || '').trim();
  if (!/^\/start(?:@[A-Za-z0-9_]+)?(?:\s|$)/i.test(text)) return null;

  var chatId = String(message.chat.id || '').trim();
  var userId = String((message.from && message.from.id) || message.chat.id || '').trim();
  if (!chatId || !userId) return MINIAPP_startWelcomeJson_({ ok: true, handled: true });

  var props = PropertiesService.getScriptProperties();
  var token = String(props.getProperty('TELEGRAM_BOT_TOKEN') || props.getProperty('BOT_TOKEN') || '').trim();
  if (!token) {
    console.warn('MINIAPP /start welcome: bot token is missing');
    return MINIAPP_startWelcomeJson_({ ok: true, handled: true, sent: false });
  }

  var markerKey = MINIAPP_START_WELCOME_PROP_PREFIX + userId;
  var firstWelcome = !props.getProperty(markerKey);
  var appUrl = MINIAPP_startWelcomeResolveAppUrl_(token);

  var firstName = String((message.from && message.from.first_name) || '').trim();
  var greetingName = firstName ? ', ' + firstName : '';
  var body = firstWelcome
    ? '🕊️ Добро пожаловать' + greetingName + ' в ЧАТ ПОБЕДИТЕЛЕЙ!\n\nЗдесь можно быстро найти участников и команды, посмотреть составы, спецназ и проекты.\n\nНажмите кнопку ниже, чтобы открыть приложение.'
    : '🕊️ Приложение ЧАТА ПОБЕДИТЕЛЕЙ готово к запуску.';

  var payload = {
    chat_id: chatId,
    text: body,
    reply_markup: {
      inline_keyboard: [[
        {
          text: '🚀 Открыть приложение',
          web_app: { url: appUrl }
        }
      ]]
    }
  };

  try {
    var response = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    var code = response.getResponseCode();
    var result = {};
    try { result = JSON.parse(response.getContentText() || '{}'); } catch (_) {}

    if (code === 200 && result && result.ok) {
      if (firstWelcome) props.setProperty(markerKey, new Date().toISOString());
      return MINIAPP_startWelcomeJson_({ ok: true, handled: true, sent: true, first: firstWelcome });
    }

    console.warn('MINIAPP /start welcome send failed HTTP ' + code + ': ' + String(result.description || 'unknown'));
  } catch (err) {
    console.warn('MINIAPP /start welcome error:', err && err.message ? err.message : err);
  }

  // Always acknowledge /start so Telegram does not retry the webhook and
  // accidentally enqueue the command into CRM.
  return MINIAPP_startWelcomeJson_({ ok: true, handled: true, sent: false });
}

function MINIAPP_startWelcomeResolveAppUrl_(token) {
  try {
    var response = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/getChatMenuButton', {
      method: 'post',
      contentType: 'application/json',
      payload: '{}',
      muteHttpExceptions: true
    });
    if (response.getResponseCode() === 200) {
      var body = JSON.parse(response.getContentText() || '{}');
      var url = body && body.ok && body.result && body.result.web_app
        ? String(body.result.web_app.url || '').trim()
        : '';
      if (url) return url;
    }
  } catch (_) {}

  var gasUrl = String(ScriptApp.getService().getUrl() || '').trim();
  var url = MINIAPP_START_WELCOME_FALLBACK_URL + '?v=055';
  if (gasUrl) url += '&gas=' + encodeURIComponent(gasUrl);
  return url;
}

function MINIAPP_startWelcomeJson_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data || { ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
