// Specnaz Telegram reaction bridge. Inputs are authenticated by the existing
// Golub/Sites relay query credential before entering the durable CRM queue.
// ChatKeeper requests still use the independent existing CRM secret.
const SNR_CHAT = '-1002109152418';
const SNR_TOPIC = '21213';
const SNR_EMOJI = '🆒';
const SNR_SOURCE_SHEET = '__SPECNAZ_TELEGRAM_SOURCES_V1';

function SNR_prepareTelegram_(e) {
  var raw = GOLUB_OWNER_raw_(e);
  var update = GOLUB_OWNER_safeJson_(raw);
  if (!update || !/^\d+$/.test(String(update.update_id == null ? '' : update.update_id))) return null;
  var message = update.message && typeof update.message === 'object' ? update.message : null;
  var reaction = update.message_reaction && typeof update.message_reaction === 'object'
    ? update.message_reaction : null;
  if (!message && !reaction) return null;
  var chat = (message || reaction).chat || {};
  if (String(chat.id) !== SNR_CHAT || String(chat.type) !== 'supergroup') return null;

  var props = PropertiesService.getScriptProperties();
  var expected = String(props.getProperty(GOLUB_OWNER_WEBHOOK_PROP.querySecret) || '');
  var supplied = String(e && e.parameter && e.parameter[GOLUB_OWNER_WEBHOOK_QUERY_PARAM] || '');
  if (!GOLUB_OWNER_safeEqual_(supplied, expected)) {
    // Never turn unverified arbitrary JSON into a write-capable CRM event.
    return {response:GOLUB_OWNER_json_({ok:false,status:'NATIVE_RELAY_AUTH_REQUIRED'})};
  }
  var crmSecret = String(props.getProperty('ROYAL_CRM_WEBHOOK_SECRET_CURRENT') || '');
  if (!crmSecret) return {response:GOLUB_OWNER_json_({ok:false,status:'CRM_SECRET_NOT_CONFIGURED'})};

  var event = 'specnaz_native_noop';
  if (message && String(message.message_thread_id) === SNR_TOPIC &&
      message.from && message.from.is_bot !== true && Number(message.message_id) > 0) {
    event = 'specnaz_native_message';
  } else if (reaction && Number(reaction.message_id) > 0 &&
      Array.isArray(reaction.new_reaction) &&
      reaction.new_reaction.some(function(r){return r && r.type === 'emoji' && r.emoji === SNR_EMOJI;})) {
    event = 'specnaz_native_reaction';
  }
  var actor = reaction && reaction.user || message && message.from || {};
  var normalized = JSON.stringify({
    secret:crmSecret,event:event,telegram_update_id:String(update.update_id),
    tg_id:String(actor.id == null ? '' : actor.id),
    native:update
  });
  return {event:{
    parameter:e && e.parameter ? e.parameter : {},
    parameters:e && e.parameters ? e.parameters : {},
    postData:{contents:normalized,length:normalized.length,type:'application/json'}
  }};
}

function SNR_sheet_(ss) {
  var sheet = ss.getSheetByName(SNR_SOURCE_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(SNR_SOURCE_SHEET);
    sheet.getRange(1,1,1,8).setValues([[
      'Chat ID','Message ID','Thread ID','Telegram ID','Telegram name',
      'Username','Text','Telegram date'
    ]]);
    sheet.setFrozenRows(1);
    sheet.getRange(1,1,sheet.getMaxRows(),4).setNumberFormat('@');
    sheet.hideSheet();
  }
  return sheet;
}

function SNR_source_(ss, chatId, messageId) {
  var sheet = ss.getSheetByName(SNR_SOURCE_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return null;
  var cells = sheet.getRange(2,2,sheet.getLastRow()-1,1)
    .createTextFinder(String(messageId)).matchEntireCell(true).findAll();
  for (var i=0; i<cells.length; i++) {
    var record = sheet.getRange(cells[i].getRow(),1,1,8).getDisplayValues()[0];
    if (String(record[0]) === String(chatId) &&
        String(record[1]) === String(messageId)) return record;
  }
  return null;
}

function SNR_recordMessage_(ss, message) {
  var from = message.from || {};
  var chatId = String(message.chat && message.chat.id || '');
  var mid = String(message.message_id || '');
  if (chatId !== SNR_CHAT ||
      !/^[1-9]\d*$/.test(mid) || !/^[1-9]\d*$/.test(String(from.id || ''))) {
    return {status:'NATIVE_MESSAGE_IGNORED'};
  }
  if (SNR_source_(ss,chatId,mid)) return {status:'NATIVE_SOURCE_ALREADY_STORED'};
  var sheet = SNR_sheet_(ss);
  sheet.appendRow([
    chatId,mid,String(message.message_thread_id),String(from.id),
    [from.first_name||'',from.last_name||''].join(' ').trim(),
    String(from.username||'').replace(/^@/,''),
    String(message.text || message.caption || '').slice(0,6000),
    Number(message.date || 0)
  ]);
  return {status:'NATIVE_SOURCE_STORED',tg_id:String(from.id)};
}

// A mark on a pre-deployment message can be resolved from the retained raw
// Telegram message in the CRM audit log; scan only after the indexed lookup fails.
function SNR_legacySource_(ss, chatId, messageId) {
  var log = ss.getSheetByName(SHEET_LOG);
  if (!log || log.getLastRow() < 2) return null;
  var matches = log.getRange(2,20,log.getLastRow()-1,1)
    .createTextFinder(String(messageId)).findAll();
  for (var i=0; i<matches.length; i++) {
    var raw = matches[i].getDisplayValue(), parsed;
    try {parsed=JSON.parse(raw);} catch (_) {continue;}
    var msg = parsed && (parsed.message || parsed.native && parsed.native.message);
    if (msg && String(msg.message_id) === String(messageId) &&
        String(msg.chat && msg.chat.id) === String(chatId)) {
      SNR_recordMessage_(ss,msg);
      return SNR_source_(ss,chatId,messageId);
    }
  }
  return null;
}

function SNR_isAdmin_(chatId, userId) {
  var response;
  try { response = tgAvatarApi_('getChatMember',{chat_id:chatId,user_id:Number(userId)}); }
  catch (_) { return null; }
  if (!response || response.ok !== true || !response.result) return null;
  return response.result.status === 'creator' || response.result.status === 'administrator';
}

function SNR_process_(ss,data,eventKey) {
  var event = String(data.event || '');
  var update = data.native || {};
  if (event === 'specnaz_native_noop') return {status:'NATIVE_TELEGRAM_IGNORED'};
  if (event === 'specnaz_native_message') return SNR_recordMessage_(ss,update.message || {});
  if (event !== 'specnaz_native_reaction') return {status:'INVALID_REQUEST'};

  var reaction = update.message_reaction || {};
  var chatId = String(reaction.chat && reaction.chat.id || '');
  var mid = String(reaction.message_id || '');
  var actor = String(reaction.user && reaction.user.id || '');
  // Anonymous admins appear as actor_chat, not as a User.
  var anonymousAdmin = String(reaction.actor_chat && reaction.actor_chat.id || '') === chatId;
  if (chatId !== SNR_CHAT || !/^[1-9]\d*$/.test(mid) ||
      (!/^[1-9]\d*$/.test(actor) && !anonymousAdmin)) {
    return {status:'INVALID_REQUEST'};
  }
  if (!Array.isArray(reaction.new_reaction) ||
      !reaction.new_reaction.some(function(r){return r && r.type==='emoji' && r.emoji===SNR_EMOJI;})) {
    return {status:'NATIVE_TELEGRAM_IGNORED'};
  }

  var isAdmin = anonymousAdmin ? true : SNR_isAdmin_(chatId,actor);
  if (isAdmin === null) return {status:'RETRY_LOCKED',reason:'TELEGRAM_ADMIN_CHECK_PENDING'};
  if (!isAdmin) return {status:'NATIVE_MARKER_NOT_ADMIN'};

  var source = SNR_source_(ss,chatId,mid) || SNR_legacySource_(ss,chatId,mid);
  if (!source) return {status:'RETRY_LOCKED',reason:'SPECNAZ_SOURCE_PENDING'};
  var participantId = String(source[3] || '');
  if (!/^[1-9]\d*$/.test(participantId)) return {status:'RETRY_LOCKED',reason:'SPECNAZ_SOURCE_ID_PENDING'};

  var payload = {
    event:'reputation',
    tg_id:participantId,
    tg_name:String(source[4] || ''),
    tg_link:source[5] ? '@' + String(source[5]) : '',
    reputation:0,real_rating:0,assigned_rep:1,
    datetime:new Date(Number(reaction.date || 0)*1000).toISOString(),
    reply_message:String(source[6]||''),
    reply_message_link:'https://t.me/c/2109152418/'+(source[2] ? String(source[2])+'/' : '')+mid,
    chat_id:chatId
  };
  var player = parsePlayer_(ss,payload,'reputation');
  var result = processWebhook_(ss,player,eventKey);
  if (result.status !== 'REPUTATION_UPDATED' &&
      result.status !== 'REPUTATION_SOURCE_ALREADY_COUNTED') {
    return {status:'RETRY_LOCKED',reason:'SPECNAZ_AWARD_NOT_COMMITTED',innerStatus:result.status};
  }
  return result;
}
