/**
 * GOLUB OWNER WEBHOOK INGRESS v2
 *
 * A deliberately small private Telegram ingress for the branded bot
 * «Голубь Мира». It does not enable AI in CHP and it does not forward private
 * Telegram messages to Royal CRM. Configuration lives only in Apps Script
 * Properties; no owner ID, bot token or webhook secret belongs in source.
 */

const GOLUB_OWNER_WEBHOOK_VERSION = '2.0.0';
const GOLUB_OWNER_WEBHOOK_PROP = Object.freeze({
  enabled: 'GOLUB_OWNER_WEBHOOK_ENABLED',
  ownerUserId: 'GOLUB_OWNER_USER_ID',
  querySecret: 'GOLUB_OWNER_WEBHOOK_QUERY_SECRET',
  lastUpdateId: 'GOLUB_OWNER_LAST_UPDATE_ID',
  lastOk: 'GOLUB_OWNER_LAST_OK',
  lastError: 'GOLUB_OWNER_LAST_ERROR',
  aiEnabled: 'GOLUB_SHADOW_PRIVATE_ENABLED',
  aiUrl: 'GOLUB_SHADOW_WORKER_URL',
  aiSecret: 'GOLUB_SHADOW_SHARED_SECRET'
});
const GOLUB_OWNER_WEBHOOK_QUERY_PARAM = 'golub_owner_key';
const GOLUB_OWNER_AI_UNAVAILABLE =
  '🕊 Сейчас не смог получить ответ от ИИ. Повтори сообщение через минуту.';

function GOLUB_OWNER_json_(body) {
  return ContentService
    .createTextOutput(JSON.stringify(body || {}))
    .setMimeType(ContentService.MimeType.JSON);
}

function GOLUB_OWNER_raw_(e) {
  return e && e.postData && e.postData.contents
    ? String(e.postData.contents)
    : '';
}

function GOLUB_OWNER_safeJson_(raw) {
  try {
    var parsed = JSON.parse(String(raw || ''));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;
  }
}

function GOLUB_OWNER_safeEqual_(left, right) {
  left = String(left || '');
  right = String(right || '');
  if (!left || !right) return false;
  var max = Math.max(left.length, right.length);
  var diff = left.length ^ right.length;
  for (var index = 0; index < max; index += 1) {
    diff |= left.charCodeAt(index % left.length) ^ right.charCodeAt(index % right.length);
  }
  return diff === 0;
}

function GOLUB_OWNER_isDirectTelegramUpdate_(data) {
  return Boolean(
    data &&
    typeof data === 'object' &&
    /^\d+$/.test(String(data.update_id == null ? '' : data.update_id)) &&
    data.message &&
    typeof data.message === 'object' &&
    data.message.chat &&
    typeof data.message.chat === 'object'
  );
}

function GOLUB_OWNER_hmacHex_(secret, value) {
  var bytes = Utilities.computeHmacSha256Signature(
    String(value || ''),
    String(secret || ''),
    Utilities.Charset.UTF_8
  );
  return bytes.map(function(byte) {
    return ('0' + ((byte + 256) % 256).toString(16)).slice(-2);
  }).join('');
}

function GOLUB_OWNER_aiAnswer_(message, sender, props) {
  if (String(props.getProperty(GOLUB_OWNER_WEBHOOK_PROP.aiEnabled) || '0') !== '1') {
    throw new Error('AI_DISABLED');
  }
  var endpoint = String(props.getProperty(GOLUB_OWNER_WEBHOOK_PROP.aiUrl) || '');
  var secret = String(props.getProperty(GOLUB_OWNER_WEBHOOK_PROP.aiSecret) || '');
  if (!/^https:\/\/[^\s]+\/internal\/golub-shadow$/.test(endpoint) || !secret) {
    throw new Error('AI_NOT_CONFIGURED');
  }
  var prompt = String(message.text || message.caption || '').trim();
  if (!prompt) {
    return '🕊 Пока я отвечаю на текстовые сообщения. Пришли вопрос текстом.';
  }
  var payload = JSON.stringify({
    kind:'golub_shadow_private',
    chatType:'private',
    messageId:Number(message.message_id || 0),
    date:Number(message.date || Math.floor(Date.now() / 1000)),
    user:{id:String(sender && sender.id || '')},
    text:prompt.slice(0, 5000)
  });
  var timestamp = String(Date.now());
  var nonce = Utilities.getUuid().replace(/-/g, '');
  var path = '/internal/golub-shadow';
  var signature = GOLUB_OWNER_hmacHex_(
    secret,
    timestamp + '|' + nonce + '|' + path + '|' + payload
  );
  var response = UrlFetchApp.fetch(endpoint, {
    method:'post',
    contentType:'application/json; charset=utf-8',
    payload:payload,
    headers:{
      'x-specnaz-timestamp':timestamp,
      'x-specnaz-nonce':nonce,
      'x-specnaz-signature':signature
    },
    followRedirects:false,
    muteHttpExceptions:true
  });
  if (response.getResponseCode() !== 200) throw new Error('AI_HTTP_' + response.getResponseCode());
  var body = GOLUB_OWNER_safeJson_(response.getContentText());
  var answer = body && body.ok === true ? String(body.answer || '').trim() : '';
  if (!answer) throw new Error('AI_EMPTY_ANSWER');
  return answer.slice(0, 12000);
}

function GOLUB_OWNER_sendAnswer_(chatId, answer) {
  var rest = String(answer || '').trim();
  if (!rest) throw new Error('EMPTY_ANSWER');
  while (rest) {
    var chunk = rest.slice(0, 3900);
    if (rest.length > 3900) {
      var split = Math.max(chunk.lastIndexOf('\n'), chunk.lastIndexOf(' '));
      if (split > 2400) chunk = chunk.slice(0, split);
    }
    tgAvatarApi_('sendMessage', {
      chat_id:String(chatId),
      text:chunk,
      disable_web_page_preview:true
    });
    rest = rest.slice(chunk.length).trim();
  }
}

/**
 * Called before all existing POST routing.
 *
 * Returns null only when the payload is not a direct Telegram update. Once a
 * direct update is identified it is always consumed with HTTP 200, including
 * invalid-secret, disabled, group and non-owner traffic. This prevents private
 * Telegram traffic from leaking into the ChatKeeper/Royal CRM queue.
 */
function GOLUB_OWNER_tryHandleTelegram_(e) {
  var data = GOLUB_OWNER_safeJson_(GOLUB_OWNER_raw_(e));
  if (!GOLUB_OWNER_isDirectTelegramUpdate_(data)) return null;

  var props = PropertiesService.getScriptProperties();
  if (String(props.getProperty(GOLUB_OWNER_WEBHOOK_PROP.enabled) || '0') !== '1') {
    return GOLUB_OWNER_json_({ok:true});
  }

  var expectedSecret = props.getProperty(GOLUB_OWNER_WEBHOOK_PROP.querySecret) || '';
  var suppliedSecret = e && e.parameter
    ? String(e.parameter[GOLUB_OWNER_WEBHOOK_QUERY_PARAM] || '')
    : '';
  if (!GOLUB_OWNER_safeEqual_(suppliedSecret, expectedSecret)) {
    return GOLUB_OWNER_json_({ok:true});
  }

  var message = data.message;
  var sender = message.from && typeof message.from === 'object' ? message.from : null;
  var ownerUserId = String(props.getProperty(GOLUB_OWNER_WEBHOOK_PROP.ownerUserId) || '');
  var senderUserId = sender ? String(sender.id == null ? '' : sender.id) : '';
  var chatType = String(message.chat.type || '');
  if (!ownerUserId || chatType !== 'private' || senderUserId !== ownerUserId) {
    return GOLUB_OWNER_json_({ok:true});
  }

  var updateId = Number(data.update_id);
  var lastUpdateId = Number(props.getProperty(GOLUB_OWNER_WEBHOOK_PROP.lastUpdateId) || -1);
  if (isFinite(lastUpdateId) && updateId <= lastUpdateId) {
    return GOLUB_OWNER_json_({ok:true});
  }

  try {
    var answer = GOLUB_OWNER_aiAnswer_(message, sender, props);
    GOLUB_OWNER_sendAnswer_(message.chat.id, answer);
    props.setProperties({
      GOLUB_OWNER_LAST_UPDATE_ID:String(updateId),
      GOLUB_OWNER_LAST_OK:new Date().toISOString(),
      GOLUB_OWNER_LAST_ERROR:''
    }, false);
  } catch (_) {
    // Do not persist message text, user IDs, bot tokens, secrets or exception URLs.
    try { GOLUB_OWNER_sendAnswer_(message.chat.id, GOLUB_OWNER_AI_UNAVAILABLE); } catch (_) {}
    props.setProperty(
      GOLUB_OWNER_WEBHOOK_PROP.lastError,
      'AI_OR_SEND_FAILED ' + new Date().toISOString()
    );
  }

  // Telegram must receive 200 even when delivery fails, otherwise it retries
  // the private update and can create a storm while diagnostics are running.
  return GOLUB_OWNER_json_({ok:true});
}

