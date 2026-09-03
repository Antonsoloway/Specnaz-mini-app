/**
 * GOLUB OWNER WEBHOOK INGRESS v2
 *
 * A deliberately small private Telegram ingress for the branded bot
 * «Голубь Мира». It does not enable AI in CHP and it does not forward private
 * Telegram messages to Royal CRM. Configuration lives only in Apps Script
 * Properties; no owner ID, bot token or webhook secret belongs in source.
 */

const GOLUB_OWNER_WEBHOOK_VERSION = '2.1.0';
const GOLUB_OWNER_WEBHOOK_PROP = Object.freeze({
  enabled: 'GOLUB_OWNER_WEBHOOK_ENABLED',
  ownerUserId: 'GOLUB_OWNER_USER_ID',
  querySecret: 'GOLUB_OWNER_WEBHOOK_QUERY_SECRET',
  lastUpdateId: 'GOLUB_OWNER_LAST_UPDATE_ID',
  lastOk: 'GOLUB_OWNER_LAST_OK',
  lastError: 'GOLUB_OWNER_LAST_ERROR',
  aiEnabled: 'GOLUB_OWNER_WEBHOOK_ENABLED',
  aiUrl: 'GOLUB_SHADOW_WORKER_URL',
  aiSecret: 'GOLUB_SHADOW_SHARED_SECRET'
});
const GOLUB_OWNER_WEBHOOK_QUERY_PARAM = 'golub_owner_key';
const GOLUB_OWNER_DEFAULT_AI_WORKER_URL =
  'https://specnaz-ai-telegram-gateway.soloway3852.workers.dev/internal/golub-shadow';
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

function GOLUB_OWNER_fallbackAi_(shadowEndpoint, prompt, secret) {
  var path = '/internal/llm';
  var endpoint = String(shadowEndpoint || '').replace(/\/internal\/golub-shadow$/, path);
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
            'Публичная память ЧП ещё подключается: не выдумывай события, людей и факты из чата.',
            'Если вопрос требует истории ЧП, честно скажи, что доступ к общей базе пока разворачивается.',
            'Отвечай по-русски, естественно, кратко и по существу.'
          ].join('\n')
        },
        {role:'user',content:String(prompt || '').slice(0, 5000)}
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
    return GOLUB_OWNER_fallbackAi_(endpoint, prompt, secret);
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
    aiReady:secret.length >= 32
  };
  Logger.log(JSON.stringify(result));
  return result;
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
    return GOLUB_OWNER_json_({ok:true});
  }

  var expectedSecret = props.getProperty(GOLUB_OWNER_WEBHOOK_PROP.querySecret) || '';
  var suppliedSecret = e && e.parameter
    ? String(e.parameter[GOLUB_OWNER_WEBHOOK_QUERY_PARAM] || '')
    : '';
  if (!GOLUB_OWNER_safeEqual_(suppliedSecret, expectedSecret)) {
    return GOLUB_OWNER_json_({ok:true});
  }

  var sender = message.from && typeof message.from === 'object' ? message.from : null;
  var ownerUserId = String(props.getProperty(GOLUB_OWNER_WEBHOOK_PROP.ownerUserId) || '');
  var senderUserId = sender ? String(sender.id == null ? '' : sender.id) : '';
  if (!ownerUserId || senderUserId !== ownerUserId) {
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
