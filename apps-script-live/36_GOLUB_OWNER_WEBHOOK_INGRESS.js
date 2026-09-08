/**
 * GOLUB OWNER WEBHOOK INGRESS v2
 *
 * A deliberately small private Telegram ingress for the branded bot
 * «Голубь Мира». It does not enable AI in CHP and it does not forward private
 * Telegram messages to Royal CRM. Configuration lives only in Apps Script
 * Properties; no owner ID, bot token or webhook secret belongs in source.
 */

const GOLUB_OWNER_WEBHOOK_VERSION = '2.7.0';
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

function GOLUB_OWNER_aiAnswer_(message, sender, props) {
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
    user:{id:String(sender && sender.id || '')},
    text:prompt.slice(0, 5000)
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

  var telegramAttempted = false;
  try {
    // A dedicated minute timer is ensured before the next Telegram send.
    GOLUB_OWNER_ensureCommitTimer_();
    var answer = GOLUB_OWNER_aiAnswer_(message, sender, props);
    var commitJob = GOLUB_OWNER_prepareCommit_(answer, updateId, props);
    if (commitJob && commitJob.duplicate) return GOLUB_OWNER_json_({ok:true});
    telegramAttempted = true;
    var sentReceipt = GOLUB_OWNER_sendAnswer_(message.chat.id, answer);
    var sentAt = new Date().toISOString();
    if (commitJob) GOLUB_OWNER_markCommitSent_(commitJob.key, sentReceipt, props);

    // The user already received this update. Persist dedupe BEFORE the durable
    // commit callback so a storage/commit fault cannot produce a duplicate
    // Telegram answer on any replay path.
    GOLUB_OWNER_recordHandledUpdate_(props, updateId, {
      GOLUB_OWNER_LAST_OK:sentAt,
      GOLUB_OWNER_LAST_ERROR:'',
      GOLUB_OWNER_LAST_INGRESS:'PRIVATE_OWNER_SENT ' + sentAt
    });

    if (answer && answer.commit) {
      try {
        var committed = GOLUB_OWNER_attemptCommit_(commitJob.key, props);
        if (!committed.committed) throw new Error('DURABLE_COMMIT_PENDING');
        props.setProperty(
          GOLUB_OWNER_WEBHOOK_PROP.lastIngress,
          'PRIVATE_OWNER_ANSWERED ' + new Date().toISOString()
        );
      } catch (_) {
        // Exact payload and receipts remain in the durable outbox for the timer.
        props.setProperty(
          GOLUB_OWNER_WEBHOOK_PROP.lastError,
          'DURABLE_COMMIT_RETRY_PENDING ' + new Date().toISOString()
        );
        GOLUB_OWNER_recordIngress_(props, 'PRIVATE_OWNER_COMMIT_FAILED');
      }
    } else {
      GOLUB_OWNER_recordIngress_(props, 'PRIVATE_OWNER_ANSWERED_NO_COMMIT');
    }
  } catch (_) {
    // Do not persist message text, user IDs, bot tokens, secrets or exception URLs.
    // A send response or later property write can fail after delivery. Never
    // add a second/fallback Telegram message once a send has been attempted.
    if (!telegramAttempted) {
      try { GOLUB_OWNER_sendAnswer_(message.chat.id, GOLUB_OWNER_AI_UNAVAILABLE); } catch (_) {}
    }
    GOLUB_OWNER_recordHandledUpdate_(props, updateId, {
      GOLUB_OWNER_LAST_ERROR:'AI_OR_SEND_FAILED ' + new Date().toISOString()
    });
    GOLUB_OWNER_recordIngress_(props, 'PRIVATE_OWNER_FAILED');
  }

  // Telegram must receive 200 even when delivery fails, otherwise it retries
  // the private update and can create a storm while diagnostics are running.
  return GOLUB_OWNER_json_({ok:true});
}
