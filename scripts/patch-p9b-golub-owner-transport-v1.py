#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "apps-script-live/36_GOLUB_OWNER_WEBHOOK_INGRESS.js"
text = PATH.read_text(encoding="utf-8")


def replace_once(old, new):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"expected exactly one match, got {count}: {old[:180]!r}")
    text = text.replace(old, new)


def remove_between(start, end):
    global text
    a = text.find(start)
    b = text.find(end, a + len(start))
    if a < 0 or b < 0:
        raise SystemExit(f"markers not found: {start!r} -> {end!r}")
    text = text[:a] + text[b:]


def replace_between(start, end, replacement):
    global text
    a = text.find(start)
    b = text.find(end, a + len(start))
    if a < 0 or b < 0:
        raise SystemExit(f"markers not found: {start!r} -> {end!r}")
    text = text[:a] + replacement + text[b:]


replace_once("const GOLUB_OWNER_WEBHOOK_VERSION = '2.5.0';", "const GOLUB_OWNER_WEBHOOK_VERSION = '2.6.0';")
replace_once(
    "  aiEnabled: 'GOLUB_OWNER_WEBHOOK_ENABLED',\n  aiUrl: 'GOLUB_SHADOW_WORKER_URL',\n  aiSecret: 'GOLUB_SHADOW_SHARED_SECRET'",
    "  aiEnabled: 'GOLUB_OWNER_WEBHOOK_ENABLED',\n  unifiedUrl: 'GOLUB_OWNER_UNIFIED_WORKER_URL',\n  aiUrl: 'GOLUB_SHADOW_WORKER_URL',\n  aiSecret: 'GOLUB_SHADOW_SHARED_SECRET'",
)
replace_once(
    "const GOLUB_OWNER_PUBLIC_MEMORY_URL =\n  'https://golub-chp-gateway.soloway3852.chatgpt.site/api/internal/ues-query';\nconst GOLUB_OWNER_DEFAULT_AI_WORKER_URL =\n  'https://specnaz-ai-telegram-gateway.soloway3852.workers.dev/internal/golub-shadow';",
    "const GOLUB_OWNER_DEFAULT_AI_WORKER_URL =\n  'https://specnaz-ai-telegram-gateway.soloway3852.workers.dev/internal/golub-owner';",
)

# Delete old provider-completion parser. Transport now accepts only the shared
# runtime answer contract.
remove_between("function GOLUB_OWNER_completionText_(body) {", "function GOLUB_OWNER_cleanPlain_(value) {")

# Delete public-memory prefetch and the embedded /internal/llm fallback brain.
# P9B has one intelligence path: the Worker unified runtime.
remove_between("function GOLUB_OWNER_publicMemory_(prompt, message, props) {", "function GOLUB_OWNER_aiAnswer_(message, sender, props) {")

new_ai = r'''function GOLUB_OWNER_workerEndpoint_(props, path) {
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

'''
replace_between("function GOLUB_OWNER_aiAnswer_(message, sender, props) {", "function GOLUB_OWNER_sendAnswer_(chatId, answer) {", new_ai)

new_send = r'''function GOLUB_OWNER_sendReceipt_(data) {
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
    if (!firstReceipt) firstReceipt = GOLUB_OWNER_sendReceipt_(sent);
    rest = rest.slice(chunk.length).trim();
  }
  return firstReceipt;
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

'''
replace_between("function GOLUB_OWNER_sendAnswer_(chatId, answer) {", "function GOLUB_OWNER_aiBridgeStatus() {", new_send)

new_status = r'''function GOLUB_OWNER_aiBridgeStatus() {
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
    legacyBrainFallback:false,
    publicChpSpeaking:false,
    aiReady:secret.length >= 32
  };
  Logger.log(JSON.stringify(result));
  return result;
}

'''
replace_between("function GOLUB_OWNER_aiBridgeStatus() {", "function GOLUB_OWNER_webhookDiagnostic() {", new_status)

new_probe = r'''function GOLUB_OWNER_probeAiBridge() {
  // P9B durable answer calls write inbound/provenance by design. A synthetic
  // probe must therefore remain configuration-only; real verification is done
  // with a real owner Telegram update during the guarded live gate.
  var result = GOLUB_OWNER_aiBridgeStatus();
  result.syntheticAiRequest = false;
  result.syntheticDurableWrite = false;
  Logger.log(JSON.stringify(result));
  return result;
}

'''
replace_between("function GOLUB_OWNER_probeAiBridge() {", "/**\n * Called before all existing POST routing.", new_probe)

old_handler = r'''  try {
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
'''
new_handler = r'''  try {
    var answer = GOLUB_OWNER_aiAnswer_(message, sender, props);
    var sentReceipt = GOLUB_OWNER_sendAnswer_(message.chat.id, answer);
    var sentAt = new Date().toISOString();

    // The user already received this update. Persist dedupe BEFORE the durable
    // commit callback so a storage/commit fault cannot produce a duplicate
    // Telegram answer on any replay path.
    props.setProperties({
      GOLUB_OWNER_LAST_UPDATE_ID:String(updateId),
      GOLUB_OWNER_LAST_OK:sentAt,
      GOLUB_OWNER_LAST_ERROR:'',
      GOLUB_OWNER_LAST_INGRESS:'PRIVATE_OWNER_SENT ' + sentAt
    }, false);

    if (answer && answer.commit) {
      try {
        GOLUB_OWNER_commitAnswer_(answer, sentReceipt, props);
        props.setProperty(
          GOLUB_OWNER_WEBHOOK_PROP.lastIngress,
          'PRIVATE_OWNER_ANSWERED ' + new Date().toISOString()
        );
      } catch (_) {
        // Never send a second/fallback answer after Telegram delivery. Record a
        // safe degraded durable status only; the next live gate can repair it.
        props.setProperty(
          GOLUB_OWNER_WEBHOOK_PROP.lastError,
          'DURABLE_COMMIT_FAILED ' + new Date().toISOString()
        );
        GOLUB_OWNER_recordIngress_(props, 'PRIVATE_OWNER_COMMIT_FAILED');
      }
    } else {
      GOLUB_OWNER_recordIngress_(props, 'PRIVATE_OWNER_ANSWERED_NO_COMMIT');
    }
  } catch (_) {
    // Do not persist message text, user IDs, bot tokens, secrets or exception URLs.
    try { GOLUB_OWNER_sendAnswer_(message.chat.id, GOLUB_OWNER_AI_UNAVAILABLE); } catch (_) {}
    props.setProperties({
      GOLUB_OWNER_LAST_UPDATE_ID:String(updateId),
      GOLUB_OWNER_LAST_ERROR:'AI_OR_SEND_FAILED ' + new Date().toISOString()
    }, false);
    GOLUB_OWNER_recordIngress_(props, 'PRIVATE_OWNER_FAILED');
  }
'''
replace_once(old_handler, new_handler)

PATH.write_text(text, encoding="utf-8")
print("P9B_GOLUB_TRANSPORT_PATCH_APPLIED=1")
