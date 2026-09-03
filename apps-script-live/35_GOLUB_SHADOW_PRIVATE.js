/**
 * GOLUB SHADOW PRIVATE v1
 *
 * Owner-only private testing surface for the existing branded bot «Голубь Мира».
 * The public CHP/ChatKeeper webhook remains unchanged. This sidecar only catches
 * an explicitly marked private ChatKeeper payload before the Royal CRM queue,
 * calls the signed Specnaz AI Worker shadow endpoint and sends the answer through
 * the existing Golub Telegram token stored in Script Properties.
 */

const GOLUB_SHADOW_VERSION = '1.0.0';
const GOLUB_SHADOW_PROP = Object.freeze({
  enabled: 'GOLUB_SHADOW_PRIVATE_ENABLED',
  ownerUserId: 'GOLUB_SHADOW_OWNER_USER_ID',
  workerUrl: 'GOLUB_SHADOW_WORKER_URL',
  sharedSecret: 'GOLUB_SHADOW_SHARED_SECRET',
  ingressSecret: 'GOLUB_SHADOW_INGRESS_SECRET',
  lastOk: 'GOLUB_SHADOW_LAST_OK',
  lastError: 'GOLUB_SHADOW_LAST_ERROR'
});
const GOLUB_SHADOW_DEFAULT_OWNER_ID = '1456874273';
const GOLUB_SHADOW_EVENT_NAMES = Object.freeze([
  'golub_shadow',
  'golub_shadow_private',
  'shadow_private',
  'private_message_ai'
]);

function GOLUB_SHADOW_clean_(value, max) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max || 10000);
}

function GOLUB_SHADOW_safeJson_(raw) {
  try {
    var parsed = JSON.parse(String(raw || ''));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function GOLUB_SHADOW_safeEqual_(left, right) {
  left = String(left || '');
  right = String(right || '');
  if (!left || !right) return false;
  var max = Math.max(left.length, right.length);
  var diff = left.length ^ right.length;
  for (var i = 0; i < max; i += 1) {
    diff |= left.charCodeAt(i % left.length) ^ right.charCodeAt(i % right.length);
  }
  return diff === 0;
}

function GOLUB_SHADOW_json_(body) {
  return ContentService
    .createTextOutput(JSON.stringify(body || {}))
    .setMimeType(ContentService.MimeType.JSON);
}

function GOLUB_SHADOW_raw_(e) {
  return e && e.postData && e.postData.contents
    ? String(e.postData.contents)
    : '';
}

function GOLUB_SHADOW_ownerId_() {
  return GOLUB_SHADOW_clean_(
    PropertiesService.getScriptProperties().getProperty(GOLUB_SHADOW_PROP.ownerUserId) ||
      GOLUB_SHADOW_DEFAULT_OWNER_ID,
    40
  );
}

function GOLUB_SHADOW_bootstrap_(data) {
  var token = GOLUB_SHADOW_clean_(data && data.__golub_shadow_bootstrap, 300);
  if (!token) return null;
  if (typeof GOLUB_SHADOW_localBootstrapToken_ !== 'function') {
    return GOLUB_SHADOW_json_({status:'GOLUB_SHADOW_BOOTSTRAP_DISABLED'});
  }
  var expected = GOLUB_SHADOW_clean_(GOLUB_SHADOW_localBootstrapToken_(), 300);
  if (!GOLUB_SHADOW_safeEqual_(token, expected)) {
    return GOLUB_SHADOW_json_({status:'GOLUB_SHADOW_BOOTSTRAP_DENIED'});
  }

  var workerUrl = GOLUB_SHADOW_clean_(data.worker_url, 1000);
  var sharedSecret = GOLUB_SHADOW_clean_(data.shared_secret, 1000);
  var ingressSecret = GOLUB_SHADOW_clean_(data.ingress_secret || sharedSecret, 1000);
  var ownerId = GOLUB_SHADOW_clean_(data.owner_user_id || GOLUB_SHADOW_DEFAULT_OWNER_ID, 40);
  if (!/^https:\/\//i.test(workerUrl) || workerUrl.indexOf('/internal/golub-shadow') < 0) {
    return GOLUB_SHADOW_json_({status:'GOLUB_SHADOW_BOOTSTRAP_BAD_WORKER_URL'});
  }
  if (sharedSecret.length < 32 || ingressSecret.length < 24 || !/^\d+$/.test(ownerId)) {
    return GOLUB_SHADOW_json_({status:'GOLUB_SHADOW_BOOTSTRAP_BAD_CONFIG'});
  }

  PropertiesService.getScriptProperties().setProperties({
    GOLUB_SHADOW_PRIVATE_ENABLED: '1',
    GOLUB_SHADOW_OWNER_USER_ID: ownerId,
    GOLUB_SHADOW_WORKER_URL: workerUrl,
    GOLUB_SHADOW_SHARED_SECRET: sharedSecret,
    GOLUB_SHADOW_INGRESS_SECRET: ingressSecret,
    GOLUB_SHADOW_LAST_ERROR: ''
  }, false);
  return GOLUB_SHADOW_json_({
    status:'GOLUB_SHADOW_BOOTSTRAPPED',
    version:GOLUB_SHADOW_VERSION,
    owner_user_id:ownerId,
    worker_configured:true,
    secret_configured:true
  });
}

function GOLUB_SHADOW_extract_(data) {
  data = data && typeof data === 'object' ? data : {};
  var update = data.update && typeof data.update === 'object' ? data.update : data;
  var message = update.message || update.edited_message || null;
  if (message && message.chat && message.from) {
    return {
      source:'telegram_update',
      event:'telegram_private_message',
      chatType:GOLUB_SHADOW_clean_(message.chat.type, 40),
      chatId:GOLUB_SHADOW_clean_(message.chat.id, 60),
      userId:GOLUB_SHADOW_clean_(message.from.id, 60),
      username:GOLUB_SHADOW_clean_(message.from.username, 120),
      firstName:GOLUB_SHADOW_clean_(message.from.first_name, 120),
      lastName:GOLUB_SHADOW_clean_(message.from.last_name, 120),
      messageId:GOLUB_SHADOW_clean_(message.message_id, 60),
      date:Number(message.date || Math.floor(Date.now() / 1000)),
      text:GOLUB_SHADOW_clean_(message.text || message.caption, 5000),
      ingressSecret:GOLUB_SHADOW_clean_(data.shadow_secret || data.secret, 1000)
    };
  }

  var eventName = GOLUB_SHADOW_clean_(data.event || data.event_type || data.action, 100).toLowerCase();
  var userId = GOLUB_SHADOW_clean_(
    data.tg_id || data.actor_user_id || data.user_id || data.from_user_id || data.reply_user_id,
    60
  );
  var chatId = GOLUB_SHADOW_clean_(data.chat_id || data.private_chat_id || userId, 60);
  var chatType = GOLUB_SHADOW_clean_(data.chat_type || data.type, 40).toLowerCase();
  var text = GOLUB_SHADOW_clean_(
    data.text || data.message_text || data.query || data.message || data.reply_message,
    5000
  );
  return {
    source:'chatkeeper_webhook',
    event:eventName,
    chatType:chatType,
    chatId:chatId,
    userId:userId,
    username:GOLUB_SHADOW_clean_(data.tg_link || data.actor_login || data.username, 120).replace(/^@/, ''),
    firstName:GOLUB_SHADOW_clean_(data.tg_name || data.actor_username || data.first_name, 120),
    lastName:GOLUB_SHADOW_clean_(data.last_name, 120),
    messageId:GOLUB_SHADOW_clean_(data.message_id || data.event_id || data.event_key, 60),
    date:GOLUB_SHADOW_parseDate_(data.datetime || data.date || data.time),
    text:text,
    ingressSecret:GOLUB_SHADOW_clean_(data.shadow_secret || data.secret, 1000)
  };
}

function GOLUB_SHADOW_parseDate_(value) {
  if (typeof value === 'number' && value > 0) {
    return value > 20000000000 ? Math.floor(value / 1000) : Math.floor(value);
  }
  var millis = Date.parse(String(value || ''));
  return isNaN(millis) ? Math.floor(Date.now() / 1000) : Math.floor(millis / 1000);
}

function GOLUB_SHADOW_isMarkedPrivate_(item) {
  if (!item) return false;
  var eventMarked = GOLUB_SHADOW_EVENT_NAMES.indexOf(String(item.event || '').toLowerCase()) >= 0;
  var rawPrivate = item.source === 'telegram_update' && item.chatType === 'private';
  var normalizedPrivate = item.chatType === 'private' ||
    (item.chatId && item.userId && item.chatId === item.userId);
  return eventMarked || rawPrivate || normalizedPrivate;
}

function GOLUB_SHADOW_ingressAllowed_(data, item) {
  var props = PropertiesService.getScriptProperties();
  var configured = GOLUB_SHADOW_clean_(props.getProperty(GOLUB_SHADOW_PROP.ingressSecret), 1000);
  if (configured && GOLUB_SHADOW_safeEqual_(item && item.ingressSecret, configured)) return true;

  // ChatKeeper already signs all Royal CRM webhook actions with this rotating
  // secret. Reuse the existing validator when the shadow trigger sends the same
  // `secret` field; no second public secret needs to be placed in Git.
  if (typeof royalWebhookSecretMatch_ === 'function') {
    try {
      return Boolean(royalWebhookSecretMatch_(data && data.secret));
    } catch (_) {}
  }
  return false;
}

function GOLUB_SHADOW_hmacHex_(secret, text) {
  var bytes = Utilities.computeHmacSha256Signature(
    String(text || ''),
    String(secret || ''),
    Utilities.Charset.UTF_8
  );
  return bytes.map(function(value) {
    var unsigned = value < 0 ? value + 256 : value;
    return ('0' + unsigned.toString(16)).slice(-2);
  }).join('');
}

function GOLUB_SHADOW_callWorker_(item) {
  var props = PropertiesService.getScriptProperties();
  var workerUrl = GOLUB_SHADOW_clean_(props.getProperty(GOLUB_SHADOW_PROP.workerUrl), 1000);
  var secret = GOLUB_SHADOW_clean_(props.getProperty(GOLUB_SHADOW_PROP.sharedSecret), 1000);
  if (!workerUrl || !secret) throw new Error('GOLUB_SHADOW_NOT_CONFIGURED');

  var payload = {
    kind:'golub_shadow_private',
    chatType:'private',
    chatId:String(item.chatId || item.userId || ''),
    messageId:String(item.messageId || ''),
    date:Number(item.date || Math.floor(Date.now() / 1000)),
    user:{
      id:String(item.userId || ''),
      username:String(item.username || ''),
      firstName:String(item.firstName || ''),
      lastName:String(item.lastName || '')
    },
    text:String(item.text || '')
  };
  var body = JSON.stringify(payload);
  var timestamp = Date.now();
  var nonce = Utilities.getUuid();
  var path = '/internal/golub-shadow';
  var signature = GOLUB_SHADOW_hmacHex_(
    secret,
    String(timestamp) + '|' + nonce + '|' + path + '|' + body
  );
  var response = UrlFetchApp.fetch(workerUrl, {
    method:'post',
    contentType:'application/json; charset=utf-8',
    payload:body,
    headers:{
      'x-specnaz-timestamp':String(timestamp),
      'x-specnaz-nonce':nonce,
      'x-specnaz-signature':signature
    },
    muteHttpExceptions:true,
    followRedirects:true
  });
  var code = response.getResponseCode();
  var parsed = GOLUB_SHADOW_safeJson_(response.getContentText());
  if (code < 200 || code >= 300 || !parsed || parsed.ok !== true) {
    throw new Error('GOLUB_SHADOW_WORKER_' + code + ': ' + GOLUB_SHADOW_clean_(parsed.error || response.getContentText(), 500));
  }
  return parsed;
}

function GOLUB_SHADOW_sendAnswer_(chatId, answer, replyToMessageId) {
  var text = String(answer || '').trim();
  if (!text) throw new Error('GOLUB_SHADOW_EMPTY_ANSWER');
  var chunks = [];
  while (text.length > 3900) {
    var cut = text.lastIndexOf('\n', 3900);
    if (cut < 1000) cut = 3900;
    chunks.push(text.slice(0, cut));
    text = text.slice(cut).replace(/^\s+/, '');
  }
  if (text) chunks.push(text);

  chunks.forEach(function(chunk, index) {
    var params = {
      chat_id:String(chatId),
      text:chunk,
      disable_web_page_preview:false
    };
    if (index === 0 && /^\d+$/.test(String(replyToMessageId || ''))) {
      params.reply_to_message_id = Number(replyToMessageId);
      params.allow_sending_without_reply = true;
    }
    tgAvatarApi_('sendMessage', params);
  });
}

/**
 * Called before MINIAPP/ChatKeeper queue routing. Returns null for every normal
 * production event, so existing group behavior is byte-for-byte unchanged.
 */
function GOLUB_SHADOW_tryHandleOwnerPrivate_(e) {
  var raw = GOLUB_SHADOW_raw_(e);
  if (!raw) return null;
  var data = GOLUB_SHADOW_safeJson_(raw);

  var bootstrap = GOLUB_SHADOW_bootstrap_(data);
  if (bootstrap) return bootstrap;

  var props = PropertiesService.getScriptProperties();
  if (String(props.getProperty(GOLUB_SHADOW_PROP.enabled) || '0') !== '1') return null;

  var item = GOLUB_SHADOW_extract_(data);
  if (!GOLUB_SHADOW_isMarkedPrivate_(item)) return null;
  if (!GOLUB_SHADOW_ingressAllowed_(data, item)) {
    return GOLUB_SHADOW_json_({status:'GOLUB_SHADOW_IGNORED',reason:'BAD_INGRESS_SECRET'});
  }

  var ownerId = GOLUB_SHADOW_ownerId_();
  if (!item.userId || item.userId !== ownerId) {
    // Fail closed and do not reveal that a private AI surface exists.
    return GOLUB_SHADOW_json_({status:'IGNORED'});
  }
  if (!item.text) {
    return GOLUB_SHADOW_json_({status:'GOLUB_SHADOW_IGNORED',reason:'EMPTY_TEXT'});
  }

  try {
    var result = GOLUB_SHADOW_callWorker_(item);
    GOLUB_SHADOW_sendAnswer_(ownerId, result.answer, item.messageId);
    props.setProperty(GOLUB_SHADOW_PROP.lastOk, new Date().toISOString());
    props.setProperty(GOLUB_SHADOW_PROP.lastError, '');
    return GOLUB_SHADOW_json_({
      status:'GOLUB_SHADOW_ANSWERED',
      version:GOLUB_SHADOW_VERSION,
      evidence_count:Number(result.evidenceCount || 0)
    });
  } catch (error) {
    var message = GOLUB_SHADOW_clean_(error && error.stack ? error.stack : error, 1200);
    props.setProperty(GOLUB_SHADOW_PROP.lastError, message);
    try {
      GOLUB_SHADOW_sendAnswer_(ownerId, 'Теневой режим Голубя временно не ответил. Ошибка уже записана для диагностики.', item.messageId);
    } catch (_) {}
    return GOLUB_SHADOW_json_({status:'GOLUB_SHADOW_ERROR',message:message});
  }
}

function GOLUB_SHADOW_check() {
  var props = PropertiesService.getScriptProperties();
  var result = {
    version:GOLUB_SHADOW_VERSION,
    enabled:String(props.getProperty(GOLUB_SHADOW_PROP.enabled) || '0') === '1',
    owner_user_id:GOLUB_SHADOW_ownerId_(),
    worker_configured:Boolean(props.getProperty(GOLUB_SHADOW_PROP.workerUrl)),
    shared_secret_configured:Boolean(props.getProperty(GOLUB_SHADOW_PROP.sharedSecret)),
    ingress_secret_configured:Boolean(props.getProperty(GOLUB_SHADOW_PROP.ingressSecret)),
    telegram_token_configured:Boolean(props.getProperty('TELEGRAM_BOT_TOKEN')),
    last_ok:props.getProperty(GOLUB_SHADOW_PROP.lastOk) || '',
    last_error:props.getProperty(GOLUB_SHADOW_PROP.lastError) || '',
    public_webhook_changed:false,
    chp_group_behavior_changed:false
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/**
 * Reference payload for a ChatKeeper webhook action. Values in percent signs
 * are ChatKeeper placeholders; `secret` must use the already configured Royal
 * CRM webhook secret, not a new value committed to source.
 */
function GOLUB_SHADOW_chatKeeperPayloadExample() {
  return {
    event:'golub_shadow',
    secret:'<ROYAL_CRM_WEBHOOK_SECRET_CURRENT>',
    tg_id:'%actor_user_id%',
    tg_name:'%actor_username%',
    tg_link:'%actor_login%',
    chat_id:'%actor_user_id%',
    chat_type:'private',
    message:'%message%',
    message_id:'%message_id%',
    datetime:'%datetime%'
  };
}
