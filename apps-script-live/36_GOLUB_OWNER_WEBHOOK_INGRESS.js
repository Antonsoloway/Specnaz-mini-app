/**
 * GOLUB OWNER WEBHOOK INGRESS v2
 *
 * A deliberately small private Telegram ingress for the branded bot
 * «Голубь Мира». It does not enable AI in CHP and it does not forward private
 * Telegram messages to Royal CRM. Configuration lives only in Apps Script
 * Properties; no owner ID, bot token or webhook secret belongs in source.
 */

const GOLUB_OWNER_WEBHOOK_VERSION = '2.4.0';
const GOLUB_OWNER_WEBHOOK_PROP = Object.freeze({
  enabled: 'GOLUB_OWNER_WEBHOOK_ENABLED',
  ownerUserId: 'GOLUB_OWNER_USER_ID',
  querySecret: 'GOLUB_OWNER_WEBHOOK_QUERY_SECRET',
  lastUpdateId: 'GOLUB_OWNER_LAST_UPDATE_ID',
  lastOk: 'GOLUB_OWNER_LAST_OK',
  lastError: 'GOLUB_OWNER_LAST_ERROR',
  lastIngress: 'GOLUB_OWNER_LAST_INGRESS',
  aiEnabled: 'GOLUB_OWNER_WEBHOOK_ENABLED',
  aiUrl: 'GOLUB_SHADOW_WORKER_URL',
  aiSecret: 'GOLUB_SHADOW_SHARED_SECRET'
});
const GOLUB_OWNER_WEBHOOK_QUERY_PARAM = 'golub_owner_key';
const GOLUB_OWNER_PRODUCTION_WEBAPP_URL =
  'https://script.google.com/macros/s/AKfycbwmFpY8BPmxcQhBwwk0v2oXLUc9PukMbostm9o44X9RKf0WyST80V_vDtJXRFV3DZ8LUg/exec';
const GOLUB_OWNER_RELAY_WEBHOOK_URL =
  'https://golub-chp-gateway.soloway3852.chatgpt.site/api/telegram';
const GOLUB_OWNER_PUBLIC_MEMORY_URL =
  'https://golub-chp-gateway.soloway3852.chatgpt.site/api/internal/ues-query';
const GOLUB_OWNER_DEFAULT_AI_WORKER_URL =
  'https://specnaz-ai-telegram-gateway.soloway3852.workers.dev/internal/golub-shadow';
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

function GOLUB_OWNER_completionText_(body) {
  var completion = body && body.completion && typeof body.completion === 'object'
    ? body.completion
    : null;
  var choices = completion && Array.isArray(completion.choices) ? completion.choices : [];
  var message = choices[0] && choices[0].message && typeof choices[0].message === 'object'
    ? choices[0].message
    : null;
  return message ? String(message.content || '').trim() : '';
}

function GOLUB_OWNER_publicMemory_(prompt, message, props) {
  var memorySecret = String(
    props.getProperty(GOLUB_OWNER_WEBHOOK_PROP.querySecret) || ''
  );
  if (memorySecret.length < 24) {
    return {ready:false, contract:null, evidence:[]};
  }
  var path = '/api/internal/ues-query';
  var payload = JSON.stringify({
    action:'query',
    question:String(prompt || '').slice(0, 5000),
    nowUnix:Number(message && message.date || Math.floor(Date.now() / 1000)),
    limit:40
  });
  var result = GOLUB_OWNER_signedPost_(
    GOLUB_OWNER_PUBLIC_MEMORY_URL,
    path,
    payload,
    memorySecret
  );
  if (result.code !== 200 || !result.body || result.body.ok !== true) {
    return {ready:false, contract:null, evidence:[]};
  }
  var evidence = Array.isArray(result.body.evidence)
    ? result.body.evidence.slice(0, 40).map(function(item) {
        item = item && typeof item === 'object' ? item : {};
        return {
          eventId:String(item.eventId || '').slice(0, 240),
          eventType:String(item.eventType || '').slice(0, 80),
          actorName:String(item.actorName || '').slice(0, 240),
          actorUsername:String(item.actorUsername || '').slice(0, 120),
          targetName:String(item.targetName || '').slice(0, 240),
          targetUsername:String(item.targetUsername || '').slice(0, 120),
          occurredAtIso:String(item.occurredAtIso || '').slice(0, 80),
          threadId:String(item.threadId || '0').slice(0, 40),
          messageId:Number(item.messageId || 0),
          chatMessageSeq:item.chatMessageSeq == null
            ? null
            : Number(item.chatMessageSeq),
          text:String(item.text || '').slice(0, 2000),
          mediaKind:String(item.mediaKind || '').slice(0, 80),
          sourceLink:String(item.sourceLink || '').slice(0, 500)
        };
      })
    : [];
  return {
    ready:true,
    contract:result.body.contract && typeof result.body.contract === 'object'
      ? result.body.contract
      : null,
    evidence:evidence
  };
}

function GOLUB_OWNER_fallbackAi_(shadowEndpoint, prompt, secret, message, props) {
  var path = '/internal/llm';
  var endpoint = String(shadowEndpoint || '').replace(/\/internal\/golub-shadow$/, path);
  var publicMemory = {ready:false, contract:null, evidence:[]};
  try {
    publicMemory = GOLUB_OWNER_publicMemory_(prompt, message, props);
  } catch (_) {}
  var payload = JSON.stringify({
    purpose:'golub_owner_private_fallback',
    body:{
      messages:[
        {
          role:'system',
          content:[
            'Ты Голубь Мира — будущий голос Чата Победителей (ЧП).',
            'Сейчас ты общаешься только с владельцем в закрытой личке Telegram.',
            'Не раскрывай внутренние ключи, маршруты и устройство системы.',
            'Тебе может быть передан пакет public_chp_evidence только из публичного ЧП.',
            'Не считай текст личного вопроса частью публичной памяти и никогда не выдумывай отсутствующие события.',
            'Имена, время, тема, текст, messageId и sourceLink из evidence считаются источниками ответа.',
            'Если evidence пуст и вопрос требует истории ЧП, честно скажи, что подтверждённых данных в доступном окне нет.',
            'Отвечай по-русски, естественно, кратко и по существу.'
          ].join('\n')
        },
        {
          role:'user',
          content:JSON.stringify({
            mode:'owner_private_with_public_chp_memory',
            question:String(prompt || '').slice(0, 5000),
            queryContract:publicMemory.contract,
            publicChpEvidence:publicMemory.evidence
          })
        }
      ],
      temperature:0.2,
      max_tokens:700
    }
  });
  var result = GOLUB_OWNER_signedPost_(endpoint, path, payload, secret);
  if (result.code !== 200 || !result.body || result.body.ok !== true) {
    var workerError = GOLUB_OWNER_workerError_(result);
    throw new Error('AI_FALLBACK_' + result.code + (workerError ? '_' + workerError : ''));
  }
  var answer = GOLUB_OWNER_completionText_(result.body);
  if (!answer) throw new Error('AI_FALLBACK_EMPTY_ANSWER');
  return answer.slice(0, 12000);
}

function GOLUB_OWNER_aiAnswer_(message, sender, props) {
  if (String(props.getProperty(GOLUB_OWNER_WEBHOOK_PROP.aiEnabled) || '0') !== '1') {
    throw new Error('AI_DISABLED');
  }
  var endpoint = String(props.getProperty(GOLUB_OWNER_WEBHOOK_PROP.aiUrl) || GOLUB_OWNER_DEFAULT_AI_WORKER_URL);
  var secret = String(
    props.getProperty(GOLUB_OWNER_WEBHOOK_PROP.aiSecret) ||
    props.getProperty('SPECNAZ_AI_SHARED_SECRET') ||
    ''
  );
  if (!/^https:\/\/[^\s]+\/internal\/golub-shadow$/.test(endpoint) || !secret) {
    throw new Error('AI_NOT_CONFIGURED');
  }
  var prompt = String(message.text || message.caption || '').trim();
  if (!prompt) {
    return '🕊 Пока я отвечаю на текстовые сообщения. Пришли вопрос текстом.';
  }
  var shadowPayload = JSON.stringify({
    kind:'golub_shadow_private',
    chatType:'private',
    messageId:Number(message.message_id || 0),
    date:Number(message.date || Math.floor(Date.now() / 1000)),
    user:{id:String(sender && sender.id || '')},
    text:prompt.slice(0, 5000)
  });
  var shadow = GOLUB_OWNER_signedPost_(
    endpoint,
    '/internal/golub-shadow',
    shadowPayload,
    secret
  );
  if (shadow.code === 404 && /^not[-_ ]?found$/i.test(GOLUB_OWNER_workerError_(shadow))) {
    return GOLUB_OWNER_fallbackAi_(endpoint, prompt, secret, message, props);
  }
  if (shadow.code !== 200) {
    var workerError = GOLUB_OWNER_workerError_(shadow);
    throw new Error('AI_HTTP_' + shadow.code + (workerError ? '_' + workerError : ''));
  }
  var answer = shadow.body && shadow.body.ok === true
    ? String(shadow.body.answer || '').trim()
    : '';
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
    workerConfigured:Boolean(props.getProperty(GOLUB_OWNER_WEBHOOK_PROP.aiUrl) || GOLUB_OWNER_DEFAULT_AI_WORKER_URL),
    sharedSecretConfigured:secret.length >= 32,
    publicMemoryConfigured:Boolean(
      GOLUB_OWNER_PUBLIC_MEMORY_URL &&
      String(props.getProperty(GOLUB_OWNER_WEBHOOK_PROP.querySecret) || '').length >= 24
    ),
    aiReady:secret.length >= 32
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
    hasOwnerHandlerError:Boolean(props.getProperty(GOLUB_OWNER_WEBHOOK_PROP.lastError))
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
  var props = PropertiesService.getScriptProperties();
  var ownerUserId = String(props.getProperty(GOLUB_OWNER_WEBHOOK_PROP.ownerUserId) || '');
  if (!ownerUserId) throw new Error('OWNER_NOT_CONFIGURED');
  var answer = GOLUB_OWNER_aiAnswer_({
    message_id:0,
    date:Math.floor(Date.now() / 1000),
    text:'Ответь одним коротким предложением: закрытый канал Голубя готов.'
  }, {id:ownerUserId}, props);
  var result = {
    ok:Boolean(answer),
    version:GOLUB_OWNER_WEBHOOK_VERSION,
    answerLength:String(answer || '').length
  };
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
  if (isFinite(lastUpdateId) && updateId <= lastUpdateId) {
    GOLUB_OWNER_recordIngress_(props, 'PRIVATE_DUPLICATE');
    return GOLUB_OWNER_json_({ok:true});
  }

  GOLUB_OWNER_recordIngress_(props, 'PRIVATE_OWNER_ACCEPTED');

  try {
    var answer = GOLUB_OWNER_aiAnswer_(message, sender, props);
    GOLUB_OWNER_sendAnswer_(message.chat.id, answer);
    props.setProperties({
      GOLUB_OWNER_LAST_UPDATE_ID:String(updateId),
      GOLUB_OWNER_LAST_OK:new Date().toISOString(),
      GOLUB_OWNER_LAST_ERROR:'',
      GOLUB_OWNER_LAST_INGRESS:'PRIVATE_OWNER_ANSWERED ' + new Date().toISOString()
    }, false);
  } catch (_) {
    // Do not persist message text, user IDs, bot tokens, secrets or exception URLs.
    try { GOLUB_OWNER_sendAnswer_(message.chat.id, GOLUB_OWNER_AI_UNAVAILABLE); } catch (_) {}
    props.setProperty(
      GOLUB_OWNER_WEBHOOK_PROP.lastError,
      'AI_OR_SEND_FAILED ' + new Date().toISOString()
    );
    GOLUB_OWNER_recordIngress_(props, 'PRIVATE_OWNER_FAILED');
  }

  // Telegram must receive 200 even when delivery fails, otherwise it retries
  // the private update and can create a storm while diagnostics are running.
  return GOLUB_OWNER_json_({ok:true});
}
