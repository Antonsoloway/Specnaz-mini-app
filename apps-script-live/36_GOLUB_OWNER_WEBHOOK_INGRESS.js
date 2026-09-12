/**
 * GOLUB OWNER WEBHOOK INGRESS v2
 *
 * A deliberately small private Telegram ingress for the branded bot
 * «Голубь Мира». It does not enable AI in CHP and it does not forward private
 * Telegram messages to Royal CRM. Configuration lives only in Apps Script
 * Properties; no owner ID, bot token or webhook secret belongs in source.
 */

const GOLUB_OWNER_WEBHOOK_VERSION = '2.9.0';
const GOLUB_OWNER_WEBHOOK_PROP = Object.freeze({
  enabled: 'GOLUB_OWNER_WEBHOOK_ENABLED',
  ownerUserId: 'GOLUB_OWNER_USER_ID',
  querySecret: 'GOLUB_OWNER_WEBHOOK_QUERY_SECRET',
  lastUpdateId: 'GOLUB_OWNER_LAST_UPDATE_ID',
  lastOk: 'GOLUB_OWNER_LAST_OK',
  lastError: 'GOLUB_OWNER_LAST_ERROR',
  lastIngress: 'GOLUB_OWNER_LAST_INGRESS',
  aiEnabled: 'GOLUB_OWNER_WEBHOOK_ENABLED',
  unifiedUrl: 'GOLUB_OWNER_UNIFIED_WORKER_URL',
  aiUrl: 'GOLUB_SHADOW_WORKER_URL',
  aiSecret: 'GOLUB_SHADOW_SHARED_SECRET'
});
const GOLUB_OWNER_WEBHOOK_QUERY_PARAM = 'golub_owner_key';
const GOLUB_OWNER_PRODUCTION_WEBAPP_URL =
  'https://script.google.com/macros/s/AKfycbwmFpY8BPmxcQhBwwk0v2oXLUc9PukMbostm9o44X9RKf0WyST80V_vDtJXRFV3DZ8LUg/exec';
const GOLUB_OWNER_RELAY_WEBHOOK_URL =
  'https://golub-chp-gateway.soloway3852.chatgpt.site/api/telegram';
const GOLUB_OWNER_DEFAULT_AI_WORKER_URL =
  'https://specnaz-ai-telegram-gateway.soloway3852.workers.dev/internal/golub-owner';
const GOLUB_OWNER_AI_UNAVAILABLE =
  '🕊 Сейчас не смог получить ответ от ИИ. Повтори сообщение через минуту.';

function GOLUB_OWNER_json_(body) {
  // Apps Script ContentService responds through a 302 redirect. Telegram does
  // not accept that as a successful webhook acknowledgement, so private/direct
  // Telegram traffic must receive an HtmlOutput, which is served as HTTP 200.
  return HtmlService.createHtmlOutput(JSON.stringify(body || {}));
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

function GOLUB_OWNER_isDirectTelegramEvent_(e) {
  return GOLUB_OWNER_isDirectTelegramUpdate_(
    GOLUB_OWNER_safeJson_(GOLUB_OWNER_raw_(e))
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

function GOLUB_OWNER_signedPost_(endpoint, path, payload, secret) {
  var timestamp = String(Date.now());
  var nonce = Utilities.getUuid().replace(/-/g, '');
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
  return {
    code:response.getResponseCode(),
    body:GOLUB_OWNER_safeJson_(response.getContentText())
  };
}

function GOLUB_OWNER_workerError_(result) {
  return result && result.body
    ? String(result.body.error || '').replace(/[^A-Z0-9_ -]/gi, '').slice(0, 80)
    : '';
}

function GOLUB_OWNER_cleanPlain_(value) {
  return String(value == null ? '' : value)
    .replace(/\[([^\]\n]{1,400})\]\(https?:\/\/[^\s)<>]{1,1800}\)/gi, '$1')
    .replace(/https?:\/\/t\.me\/\S+/gi, 'сообщение в Telegram')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/<\/?a\b[^>]*>/gi, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/ {2,}/g, ' ')
    .trim()
    .slice(0, 12000);
}

function GOLUB_OWNER_safeTelegramHtml_(value) {
  var source = String(value == null ? '' : value).replace(/\r\n?/g, '\n').trim();
  if (!source || source.length > 3900) return '';
  var anchors = [];
  source = source.replace(/<a href="(https:\/\/t\.me\/[A-Za-z0-9_?=&.\/-]{3,1800})">([^<>]{1,400})<\/a>/g, function(_, url, label) {
    if (!/^https:\/\/t\.me\/(?:c\/\d+(?:\/\d+){1,2}|[A-Za-z0-9_]{5,32}\/\d+)(?:\?[^\s<>"']*)?$/.test(url)) return '§BADLINK§';
    var token = '§GOLUBLINK' + anchors.length + '§';
    anchors.push({token:token, html:'<a href="' + url + '">' + label + '</a>'});
    return token;
  });
  if (/§BADLINK§|https?:\/\/|<|>/.test(source)) return '';
  anchors.forEach(function(anchor) {
    source = source.split(anchor.token).join(anchor.html);
  });
  return source.trim();
}

function GOLUB_OWNER_answerEnvelope_(plain, telegram) {
  var cleanPlain = GOLUB_OWNER_cleanPlain_(plain);
  var safeHtml = telegram && String(telegram.parseMode || '') === 'HTML'
    ? GOLUB_OWNER_safeTelegramHtml_(telegram.text)
    : '';
  return {plain:cleanPlain, html:safeHtml};
}

function GOLUB_OWNER_workerEndpoint_(props, path) {
  var configured = String(
    props.getProperty(GOLUB_OWNER_WEBHOOK_PROP.unifiedUrl) ||
    props.getProperty(GOLUB_OWNER_WEBHOOK_PROP.aiUrl) ||
    GOLUB_OWNER_DEFAULT_AI_WORKER_URL
  ).trim();
  var origin = configured.replace(/\/internal\/[^/?#]+$/, '');
  if (!/^https:\/\/[^/\s]+$/.test(origin)) throw new Error('AI_ENDPOINT_INVALID');
  return origin + String(path || '');
}

function GOLUB_OWNER_workerSecret_(props) {
  var secret = String(
    props.getProperty(GOLUB_OWNER_WEBHOOK_PROP.aiSecret) ||
    props.getProperty('SPECNAZ_AI_SHARED_SECRET') ||
    ''
  );
  if (secret.length < 32) throw new Error('AI_SECRET_NOT_CONFIGURED');
  return secret;
}

// Carry Telegram context, never arbitrary ingress memory or authorization flags.
function GOLUB_OWNER_messageContext_(message, includeReply) {
  var result = {};
  ['message_id', 'date', 'edit_date', 'message_thread_id', 'media_group_id',
   'text', 'caption', 'entities', 'caption_entities', 'quote', 'photo', 'video',
   'video_note', 'voice', 'audio', 'document', 'animation', 'sticker',
   'forum_topic_created', 'forum_topic_edited'].forEach(function(key) {
    if (message[key] != null) result[key] = message[key];
  });
  var from = message.from || {};
  result.from = {id:from.id, is_bot:Boolean(from.is_bot),
    first_name:String(from.first_name || ''), last_name:String(from.last_name || ''),
    username:String(from.username || '')};
  var chat = message.chat || {};
  result.chat = {id:chat.id, type:String(chat.type || ''), title:String(chat.title || '')};
  if (includeReply && message.reply_to_message) {
    result.reply_to_message = GOLUB_OWNER_messageContext_(message.reply_to_message, false);
  }
  return result;
}

function GOLUB_OWNER_aiAnswer_(message, sender, props, updateId) {
  if (String(props.getProperty(GOLUB_OWNER_WEBHOOK_PROP.aiEnabled) || '0') !== '1') {
    throw new Error('AI_DISABLED');
  }
  var prompt = String(message.text || message.caption || '').trim();
  if (!prompt) {
    return {
      plain:'🕊 Пока я отвечаю на текстовые сообщения. Пришли вопрос текстом.',
      html:'',
      commit:null,
      commitAnswer:''
    };
  }

  var path = '/internal/golub-owner';
  var endpoint = GOLUB_OWNER_workerEndpoint_(props, path);
  var secret = GOLUB_OWNER_workerSecret_(props);
  var payload = JSON.stringify({
    kind:'golub_owner_private',
    chatType:'private',
    chatId:String(message && message.chat && message.chat.id || ''),
    messageId:Number(message.message_id || 0),
    date:Number(message.date || Math.floor(Date.now() / 1000)),
    updateId:Number(updateId || message.message_id || 0),
    contextVersion:'shared-answer-context-v1',
    user:{id:String(sender && sender.id || ''), is_bot:Boolean(sender && sender.is_bot),
      first_name:String(sender && sender.first_name || ''),
      last_name:String(sender && sender.last_name || ''),
      username:String(sender && sender.username || '')},
    message:GOLUB_OWNER_messageContext_(message, true),
    text:String(message.text || '').slice(0, 10000),
    caption:String(message.caption || '').slice(0, 4096)
  });
  var result = GOLUB_OWNER_signedPost_(endpoint, path, payload, secret);
  if (result.code !== 200 || !result.body || result.body.ok !== true) {
    var workerError = GOLUB_OWNER_workerError_(result);
    throw new Error('AI_HTTP_' + result.code + (workerError ? '_' + workerError : ''));
  }

  var rawAnswer = String(result.body.answer || '').trim();
  var commit = result.body.commit && typeof result.body.commit === 'object'
    ? result.body.commit
    : null;
  if (!rawAnswer) throw new Error('AI_EMPTY_ANSWER');
  if (!commit) throw new Error('AI_COMMIT_ENVELOPE_MISSING');

  // The Worker is now the single output/grounding authority. Do not rewrite
  // its answer in transport: the post-send commit hashes this exact text.
  return {
    plain:rawAnswer.slice(0, 12000),
    html:'',
    commit:commit,
    commitAnswer:rawAnswer.slice(0, 12000)
  };
}

function GOLUB_OWNER_sendReceipt_(data) {
  var result = data && data.result && typeof data.result === 'object' ? data.result : null;
  var messageId = result ? String(result.message_id == null ? '' : result.message_id) : '';
  var botUserId = result && result.from ? String(result.from.id == null ? '' : result.from.id) : '';
  var date = result ? Number(result.date || 0) : 0;
  if (!/^\d+$/.test(messageId) || !/^[1-9]\d*$/.test(botUserId)) {
    throw new Error('TELEGRAM_SEND_RECEIPT_INVALID');
  }
  return {messageId:messageId, botUserId:botUserId, date:date};
}

function GOLUB_OWNER_sendAnswer_(chatId, answer) {
  var envelope = answer && typeof answer === 'object'
    ? answer
    : {plain:String(answer || ''), html:''};
  var html = GOLUB_OWNER_safeTelegramHtml_(envelope.html);
  if (html) {
    return GOLUB_OWNER_sendReceipt_(tgAvatarApi_('sendMessage', {
      chat_id:String(chatId),
      text:html,
      parse_mode:'HTML',
      disable_web_page_preview:true
    }));
  }

  // Unified-runtime prose is already grounded and output-guarded. Preserve it
  // byte-for-byte (apart from trim/chunk boundaries) so answerHash commits the
  // same logical assistant text that was delivered to Telegram.
  var rest = String(envelope.plain == null ? '' : envelope.plain).trim();
  if (!rest) throw new Error('EMPTY_ANSWER');
  var firstReceipt = null;
  var receipts = [];
  while (rest) {
    var chunk = rest.slice(0, 3900);
    if (rest.length > 3900) {
      var split = Math.max(chunk.lastIndexOf('\n'), chunk.lastIndexOf(' '));
      if (split > 2400) chunk = chunk.slice(0, split);
    }
    var sent = tgAvatarApi_('sendMessage', {
      chat_id:String(chatId),
      text:chunk,
      disable_web_page_preview:true
    });
    var receipt = GOLUB_OWNER_sendReceipt_(sent);
    receipts.push(receipt);
    if (!firstReceipt) firstReceipt = receipt;
    rest = rest.slice(chunk.length).trim();
  }
  return {messageId:firstReceipt.messageId, botUserId:firstReceipt.botUserId,
    date:firstReceipt.date, messages:receipts};
}

function GOLUB_OWNER_commitAnswer_(answer, sentReceipt, props) {
  if (!answer || !answer.commit) return {ok:true, skipped:'no-runtime-commit'};
  var path = '/internal/golub-owner-commit';
  var endpoint = GOLUB_OWNER_workerEndpoint_(props, path);
  var secret = GOLUB_OWNER_workerSecret_(props);
  var commitAnswer = String(answer.commitAnswer || answer.plain || '').trim();
  var payload = JSON.stringify({
    commit:answer.commit,
    sent:sentReceipt || {},
    answer:commitAnswer
  });
  var result = GOLUB_OWNER_signedPost_(endpoint, path, payload, secret);
  if (result.code !== 200 || !result.body || result.body.ok !== true) {
    var workerError = GOLUB_OWNER_workerError_(result);
    throw new Error('DURABLE_COMMIT_HTTP_' + result.code + (workerError ? '_' + workerError : ''));
  }
  return result.body;
}

function GOLUB_OWNER_aiBridgeStatus() {
  var props = PropertiesService.getScriptProperties();
  var secret = String(
    props.getProperty(GOLUB_OWNER_WEBHOOK_PROP.aiSecret) ||
    props.getProperty('SPECNAZ_AI_SHARED_SECRET') ||
    ''
  );
  var result = {
    version:GOLUB_OWNER_WEBHOOK_VERSION,
    ownerWebhookEnabled:String(props.getProperty(GOLUB_OWNER_WEBHOOK_PROP.enabled) || '0') === '1',
    ownerConfigured:Boolean(props.getProperty(GOLUB_OWNER_WEBHOOK_PROP.ownerUserId)),
    unifiedWorkerConfigured:Boolean(
      props.getProperty(GOLUB_OWNER_WEBHOOK_PROP.unifiedUrl) ||
      props.getProperty(GOLUB_OWNER_WEBHOOK_PROP.aiUrl) ||
      GOLUB_OWNER_DEFAULT_AI_WORKER_URL
    ),
    sharedSecretConfigured:secret.length >= 32,
    commitCapable:secret.length >= 32,
    commitRetry:'private_script_properties_outbox_v1',
    legacyBrainFallback:false,
    publicChpSpeaking:false,
    aiReady:secret.length >= 32,
    ingressDiagnostics:'golub-ingress-errors-v1',
    deliveryReceipts:'independent-per-update-v1',
    outboxVersion:GOLUB_COMMIT_OUTBOX_VERSION
  };
  Logger.log(JSON.stringify(result));
  return result;
}

function GOLUB_OWNER_webhookDiagnostic() {
  var props = PropertiesService.getScriptProperties();
  var secret = String(props.getProperty(GOLUB_OWNER_WEBHOOK_PROP.querySecret) || '');
  var directUrl = GOLUB_OWNER_PRODUCTION_WEBAPP_URL && secret
    ? GOLUB_OWNER_PRODUCTION_WEBAPP_URL + '?' + GOLUB_OWNER_WEBHOOK_QUERY_PARAM + '=' + encodeURIComponent(secret)
    : '';
  var info = tgAvatarApi_('getWebhookInfo', {});
  var current = info && info.result && typeof info.result === 'object'
    ? info.result
    : {};
  var result = {
    ok:Boolean(info && info.ok),
    version:GOLUB_OWNER_WEBHOOK_VERSION,
    webhookConfigured:Boolean(current.url),
    webhookMatchesOwnerEndpoint:Boolean(
      GOLUB_OWNER_RELAY_WEBHOOK_URL &&
      GOLUB_OWNER_safeEqual_(String(current.url || ''), GOLUB_OWNER_RELAY_WEBHOOK_URL)
    ),
    webhookUsesRelay:Boolean(
      GOLUB_OWNER_RELAY_WEBHOOK_URL &&
      GOLUB_OWNER_safeEqual_(String(current.url || ''), GOLUB_OWNER_RELAY_WEBHOOK_URL)
    ),
    webhookUsesLegacyDirect:Boolean(
      directUrl && GOLUB_OWNER_safeEqual_(String(current.url || ''), directUrl)
    ),
    pendingUpdateCount:Number(current.pending_update_count || 0),
    hasLastTelegramError:Boolean(current.last_error_date || current.last_error_message),
    lastTelegramErrorDate:Number(current.last_error_date || 0),
    lastTelegramError:String(current.last_error_message || '')
      .replace(/https?:\/\/\S+/gi, '[URL]')
      .replace(/[^A-Z0-9А-ЯЁ _.,:;()\/-]/gi, '')
      .slice(0, 240),
    maxConnections:Number(current.max_connections || 0),
    allowedUpdates:Array.isArray(current.allowed_updates) ? current.allowed_updates : [],
    lastIngress:String(props.getProperty(GOLUB_OWNER_WEBHOOK_PROP.lastIngress) || ''),
    lastOk:String(props.getProperty(GOLUB_OWNER_WEBHOOK_PROP.lastOk) || ''),
    hasOwnerHandlerError:Boolean(props.getProperty(GOLUB_OWNER_WEBHOOK_PROP.lastError)),
    ingressDiagnostic:GOLUB_OWNER_readDiagnostic_(props)
  };
  Logger.log(JSON.stringify(result));
  return result;
}

function GOLUB_OWNER_repairWebhook() {
  var props = PropertiesService.getScriptProperties();
  var secret = String(props.getProperty(GOLUB_OWNER_WEBHOOK_PROP.querySecret) || '');
  if (!GOLUB_OWNER_RELAY_WEBHOOK_URL || !secret) {
    throw new Error('OWNER_WEBHOOK_NOT_CONFIGURED');
  }
  tgAvatarApi_('setWebhook', {
    url:GOLUB_OWNER_RELAY_WEBHOOK_URL,
    secret_token:secret,
    allowed_updates:[
      'message',
      'edited_message',
      'chat_member',
      'my_chat_member',
      'chat_join_request',
      'message_reaction'
    ],
    drop_pending_updates:false,
    max_connections:10
  });
  props.setProperty(
    GOLUB_OWNER_WEBHOOK_PROP.lastIngress,
    'WEBHOOK_REPAIRED ' + new Date().toISOString()
  );
  return GOLUB_OWNER_webhookDiagnostic();
}

function GOLUB_OWNER_installRelayWebhook() {
  return GOLUB_OWNER_repairWebhook();
}

function GOLUB_OWNER_recordIngress_(props, code) {
  try {
    props.setProperty(
      GOLUB_OWNER_WEBHOOK_PROP.lastIngress,
      String(code || 'UNKNOWN').replace(/[^A-Z0-9_ -]/gi, '').slice(0, 80) +
        ' ' + new Date().toISOString()
    );
  } catch (_) {}
}

function GOLUB_OWNER_probeAiBridge() {
  // P9B durable answer calls write inbound/provenance by design. A synthetic
  // probe must therefore remain configuration-only; real verification is done
  // with a real owner Telegram update during the guarded live gate.
  var result = GOLUB_OWNER_aiBridgeStatus();
  result.syntheticAiRequest = false;
  result.syntheticDurableWrite = false;
  Logger.log(JSON.stringify(result));
  return result;
}

/**
 * Called before all existing POST routing.
 *
 * Returns null when the payload is not a direct Telegram update or when it is
 * group traffic. Group updates must continue through the existing Tables 1.3 /
 * ChatKeeper route. Once a direct private update is identified it is always
 * consumed with HTTP 200, including invalid-secret, disabled and non-owner
 * traffic, so private Telegram messages never leak into Royal CRM.
 */
// Only fixed categories are logged. Never persist exception text, URLs, user
// identifiers, request bodies, provider replies, tokens or stack traces.
function GOLUB_OWNER_errorCode_(error) {
  var text = String(error && error.message || error || '');
  var known = ['COMMIT_OUTBOX_BUSY','AI_ENDPOINT_INVALID','AI_SECRET_NOT_CONFIGURED',
    'AI_DISABLED','AI_EMPTY_ANSWER','AI_COMMIT_ENVELOPE_MISSING','EMPTY_ANSWER',
    'TELEGRAM_SEND_RECEIPT_INVALID','COMMIT_UPDATE_ID_INVALID','COMMIT_PAYLOAD_SIZE_INVALID',
    'COMMIT_SENT_STATE_INVALID','DURABLE_COMMIT_PENDING','COMMIT_ACK_REQUIRED'];
  if (known.indexOf(text) >= 0) return text;
  var http = /^(AI_HTTP|DURABLE_COMMIT_HTTP)_([1-5][0-9]{2})(?:_|$)/.exec(text);
  if (http) {
    var code = http[1] + '_' + http[2];
    var workerCodes = ['PLANNER_CONTRACT_REJECTED','TASK_EXECUTION_MISMATCH',
      'CONTRACT_FIELD_REQUIRED','UNAUTHORIZED','DISABLED','NOT_ALLOWED',
      'AI_WORKFLOW_PLAN_FAILED','AI_WORKFLOW_EXECUTION_FAILED','NARRATIVE_EMPTY',
      'D1_QUOTA_EXCEEDED','SOURCE_UNAVAILABLE','EMPTY_RESULT'];
    for (var i = 0; i < workerCodes.length; i++) {
      if (text.slice(http[0].length).split(/[^A-Z0-9_]+/).indexOf(workerCodes[i]) >= 0) {
        return code + '_' + workerCodes[i];
      }
    }
    return code;
  }
  if (/too many|quota|limit exceeded|слишком много|квот/i.test(text)) return 'SERVICE_QUOTA';
  if (/permission|authorization|not have permission|разрешени|авторизаци/i.test(text)) return 'SERVICE_AUTH';
  if (/timed? ?out|timeout|время ожидания/i.test(text)) return 'SERVICE_TIMEOUT';
  return 'UNCLASSIFIED';
}

function GOLUB_OWNER_readDiagnostic_(props) {
  try {
    var value = JSON.parse(props.getProperty('GOLUB_OWNER_LAST_DIAGNOSTIC_V1') || 'null');
    if (!value || value.version !== 'golub-ingress-errors-v1') return null;
    return {version:value.version, at:value.at, stage:value.stage,
      primaryCode:value.primaryCode, secondaryCodes:value.secondaryCodes,
      sendAttempted:Boolean(value.sendAttempted), deliveryConfirmed:Boolean(value.deliveryConfirmed)};
  } catch (_) { return null; }
}

function GOLUB_OWNER_saveDiagnostic_(props, stage, error, secondary, attempted, confirmed) {
  var result = {version:'golub-ingress-errors-v1', at:new Date().toISOString(),
    stage:stage, primaryCode:GOLUB_OWNER_errorCode_(error),
    secondaryCodes:secondary.slice(0, 4), sendAttempted:Boolean(attempted),
    deliveryConfirmed:Boolean(confirmed)};
  // Independent best-effort writes: a quota/storage failure must not replace
  // the original exception or escape from the Telegram error handler.
  try { props.setProperty('GOLUB_OWNER_LAST_DIAGNOSTIC_V1', JSON.stringify(result)); } catch (_) {}
  try { props.setProperty(GOLUB_OWNER_WEBHOOK_PROP.lastError,
    result.primaryCode + ' ' + result.at); } catch (_) {}
  try { Logger.log(JSON.stringify(result)); } catch (_) {}
  return result;
}

function GOLUB_OWNER_tryHandleTelegram_(e) {
  var data = GOLUB_OWNER_safeJson_(GOLUB_OWNER_raw_(e));
  if (!GOLUB_OWNER_isDirectTelegramUpdate_(data)) return null;

  var message = data.message;
  var chatType = String(message.chat.type || '');
  if (chatType !== 'private') return null;

  var props = PropertiesService.getScriptProperties();
  if (String(props.getProperty(GOLUB_OWNER_WEBHOOK_PROP.enabled) || '0') !== '1') {
    GOLUB_OWNER_recordIngress_(props, 'PRIVATE_DISABLED');
    return GOLUB_OWNER_json_({ok:true});
  }

  var expectedSecret = props.getProperty(GOLUB_OWNER_WEBHOOK_PROP.querySecret) || '';
  var suppliedSecret = e && e.parameter
    ? String(e.parameter[GOLUB_OWNER_WEBHOOK_QUERY_PARAM] || '')
    : '';
  if (!GOLUB_OWNER_safeEqual_(suppliedSecret, expectedSecret)) {
    GOLUB_OWNER_recordIngress_(props, 'PRIVATE_BAD_QUERY_SECRET');
    return GOLUB_OWNER_json_({ok:true});
  }

  var sender = message.from && typeof message.from === 'object' ? message.from : null;
  var ownerUserId = String(props.getProperty(GOLUB_OWNER_WEBHOOK_PROP.ownerUserId) || '');
  var senderUserId = sender ? String(sender.id == null ? '' : sender.id) : '';
  if (!ownerUserId || senderUserId !== ownerUserId) {
    GOLUB_OWNER_recordIngress_(props, 'PRIVATE_NON_OWNER');
    return GOLUB_OWNER_json_({ok:true});
  }

  var updateId = Number(data.update_id);
  var lastUpdateId = Number(props.getProperty(GOLUB_OWNER_WEBHOOK_PROP.lastUpdateId) || -1);
  if (GOLUB_OWNER_deliveryRecord_(props, updateId) ||
    (isFinite(lastUpdateId) && updateId <= lastUpdateId)) {
    GOLUB_OWNER_recordIngress_(props, 'PRIVATE_DUPLICATE');
    return GOLUB_OWNER_json_({ok:true});
  }

  GOLUB_OWNER_recordIngress_(props, 'PRIVATE_OWNER_ACCEPTED');

  var telegramAttempted = false;
  var deliveryConfirmed = false;
  var stage = 'ensure_timer';
  var commitJob = null;
  var sentReceipt = null;
  try {
    // A dedicated minute timer is ensured before the next Telegram send.
    GOLUB_OWNER_ensureCommitTimer_();
    stage = 'worker_request';
    var answer = GOLUB_OWNER_aiAnswer_(message, sender, props, updateId);
    stage = 'prepare_commit';
    commitJob = GOLUB_OWNER_prepareCommit_(answer, updateId, props);
    if (commitJob && commitJob.duplicate) return GOLUB_OWNER_json_({ok:true});
    stage = 'telegram_send';
    // A prepared outbox already prevents resending an answer after an ambiguous
    // send. The per-update marker also covers text-only/fallback deliveries.
    GOLUB_OWNER_recordDelivery_(props, updateId, null, 'answer');
    telegramAttempted = true;
    sentReceipt = GOLUB_OWNER_sendAnswer_(message.chat.id, answer);
    deliveryConfirmed = true;
    var sentAt = new Date().toISOString();
    stage = 'record_receipt';
    GOLUB_OWNER_recordDelivery_(props, updateId, sentReceipt, 'answer');
    stage = 'mark_commit_sent';
    if (commitJob) GOLUB_OWNER_markCommitSent_(commitJob.key, sentReceipt, props);

    // The user already received this update. Persist dedupe BEFORE the durable
    // commit callback so a storage/commit fault cannot produce a duplicate
    // Telegram answer on any replay path.
    stage = 'record_handled';
    GOLUB_OWNER_recordHandledUpdate_(props, updateId, {
      GOLUB_OWNER_LAST_OK:sentAt,
      GOLUB_OWNER_LAST_ERROR:'',
      GOLUB_OWNER_LAST_INGRESS:'PRIVATE_OWNER_SENT ' + sentAt
    });

    if (answer && answer.commit) {
      stage = 'commit_callback';
      try {
        var committed = GOLUB_OWNER_attemptCommit_(commitJob.key, props);
        if (!committed.committed) throw new Error('DURABLE_COMMIT_PENDING');
        props.setProperty(
          GOLUB_OWNER_WEBHOOK_PROP.lastIngress,
          'PRIVATE_OWNER_ANSWERED ' + new Date().toISOString()
        );
      } catch (commitError) {
        // Exact payload and receipts remain in the durable outbox for the timer.
        props.setProperty(
          GOLUB_OWNER_WEBHOOK_PROP.lastError,
          'DURABLE_COMMIT_RETRY_PENDING ' + new Date().toISOString()
        );
        GOLUB_OWNER_recordIngress_(props, 'PRIVATE_OWNER_COMMIT_FAILED');
        GOLUB_OWNER_saveDiagnostic_(props, stage, commitError, [], true, true);
      }
    } else {
      GOLUB_OWNER_recordIngress_(props, 'PRIVATE_OWNER_ANSWERED_NO_COMMIT');
    }
  } catch (error) {
    // Do not persist message text, user IDs, bot tokens, secrets or exception URLs.
    // A send response or later property write can fail after delivery. Never
    // add a second/fallback Telegram message once a send has been attempted.
    var secondary = [];
    GOLUB_OWNER_saveDiagnostic_(props, stage, error, secondary, telegramAttempted, deliveryConfirmed);
    if (!telegramAttempted) {
      try {
        // A concurrent successful request may already own this update.
        if (!GOLUB_OWNER_deliveryRecord_(props, updateId) &&
          (!props.getProperty(GOLUB_COMMIT_PREFIX + updateId + '_META') || commitJob)) {
          GOLUB_OWNER_recordDelivery_(props, updateId, null, 'fallback');
          telegramAttempted = true;
          var fallbackReceipt = GOLUB_OWNER_sendAnswer_(message.chat.id, GOLUB_OWNER_AI_UNAVAILABLE);
          deliveryConfirmed = true;
          GOLUB_OWNER_recordDelivery_(props, updateId, fallbackReceipt, 'fallback');
        }
      } catch (sendError) { secondary.push(GOLUB_OWNER_errorCode_(sendError)); }
    } else if (sentReceipt) {
      // Retry only recording the receipt. Never retry the Telegram operation.
      try { GOLUB_OWNER_recordDelivery_(props, updateId, sentReceipt, 'answer'); }
      catch (receiptError) { secondary.push(GOLUB_OWNER_errorCode_(receiptError)); }
    }
    try {
      GOLUB_OWNER_recordHandledUpdate_(props, updateId, {
        GOLUB_OWNER_LAST_ERROR:GOLUB_OWNER_errorCode_(error) + ' ' + new Date().toISOString()
      });
    } catch (statusError) { secondary.push(GOLUB_OWNER_errorCode_(statusError)); }
    try { GOLUB_OWNER_recordIngress_(props, deliveryConfirmed && sentReceipt
      ? 'PRIVATE_OWNER_COMMIT_FAILED' : 'PRIVATE_OWNER_FAILED'); }
    catch (ingressError) { secondary.push(GOLUB_OWNER_errorCode_(ingressError)); }
    GOLUB_OWNER_saveDiagnostic_(props, stage, error, secondary, telegramAttempted, deliveryConfirmed);
  }

  // Telegram must receive 200 even when delivery fails, otherwise it retries
  // the private update and can create a storm while diagnostics are running.
  return GOLUB_OWNER_json_({ok:true});
}
