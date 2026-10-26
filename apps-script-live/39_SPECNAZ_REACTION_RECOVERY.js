/**
 * Fail-closed Specnaz approval reconciliation. The ChatKeeper reputation webhook
 * remains the primary writer; this is an independent, opt-in recovery source.
 *
 * Script Properties (never commit values to the repository):
 *   SPECNAZ_AUDIT_CAPTURE_ENABLED = 1
 *   SPECNAZ_AUDIT_AUTO_RECOVER_ENABLED = 1 (only after read-only audit)
 *   SPECNAZ_AUDIT_CHAT_ID = exact Telegram supergroup ID
 *   SPECNAZ_AUDIT_THREAD_ID = exact Specnaz topic message_thread_id
 *   SPECNAZ_APPROVER_IDS = comma-separated Telegram IDs of approved awarders
 * Existing GOLUB_OWNER_WEBHOOK_QUERY_SECRET and ROYAL_CRM_WEBHOOK_SECRET_CURRENT
 * are required independently. No secret value or approver identity is in code.
 */
const SPECNAZ_AUDIT_SHEET = 'Спецназ аудит подтверждений';
const SPECNAZ_AUDIT_WAIT_MS = 20 * 60 * 1000;
const SPECNAZ_AUDIT_MAX_ROWS = 10000;
const SPECNAZ_AUDIT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const SPECNAZ_AUDIT_HANDLER = 'SPECNAZ_reconcileApprovedReactions';

function SPECNAZ_auditConfig_() {
  const props = PropertiesService.getScriptProperties();
  const csv = String(props.getProperty('SPECNAZ_APPROVER_IDS') || '').split(/[\s,;]+/);
  return {
    props: props,
    capture: props.getProperty('SPECNAZ_AUDIT_CAPTURE_ENABLED') === '1',
    autoRecover: props.getProperty('SPECNAZ_AUDIT_AUTO_RECOVER_ENABLED') === '1',
    chatId: String(props.getProperty('SPECNAZ_AUDIT_CHAT_ID') || ''),
    topicId: String(props.getProperty('SPECNAZ_AUDIT_THREAD_ID') || ''),
    approvers: csv.filter(function(id) { return /^[1-9]\d+$/.test(id); })
  };
}

function SPECNAZ_hasCool_(reactions) {
  return Array.isArray(reactions) && reactions.some(function(item) {
    return item && item.type === 'emoji' && item.emoji === '🆒';
  });
}

function SPECNAZ_parseTelegramAudit_(data, cfg) {
  if (!data || !/^\d+$/.test(String(data.update_id == null ? '' : data.update_id))) return null;
  if (!cfg || !cfg.chatId || !cfg.topicId || !cfg.approvers.length) return null;
  const message = data.edited_message || data.message;
  if (message && message.chat && String(message.chat.id) === cfg.chatId &&
      String(message.message_thread_id || '') === cfg.topicId) {
    const sender = message.from || {};
    if (!/^[1-9]\d+$/.test(String(sender.id || '')) || sender.is_bot === true) return null;
    const messageId = String(message.message_id || '');
    if (!/^[1-9]\d+$/.test(messageId)) return null;
    const name = [sender.first_name || '', sender.last_name || ''].join(' ').trim();
    return ['MESSAGE', String(data.update_id), Number(message.date || 0),
      cfg.chatId, messageId, String(sender.id), String(sender.username || ''),
      name, String(message.text || message.caption || '').slice(0, 3000), '', '', ''];
  }
  const reaction = data.message_reaction;
  if (!reaction || !reaction.chat || String(reaction.chat.id) !== cfg.chatId) return null;
  const actor = reaction.user || {};
  if (cfg.approvers.indexOf(String(actor.id || '')) < 0 || actor.is_bot === true) return null;
  const oldCool = SPECNAZ_hasCool_(reaction.old_reaction);
  const newCool = SPECNAZ_hasCool_(reaction.new_reaction);
  if (oldCool === newCool) return null;
  const messageId = String(reaction.message_id || '');
  if (!/^[1-9]\d+$/.test(messageId)) return null;
  return ['REACTION', String(data.update_id), Number(reaction.date || 0),
    cfg.chatId, messageId, '', '', '', '', String(actor.id), newCool ? 'ADD' : 'REMOVE', ''];
}

function SPECNAZ_auditSheet_(ss) {
  let sheet = ss.getSheetByName(SPECNAZ_AUDIT_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(SPECNAZ_AUDIT_SHEET);
    sheet.appendRow(['Тип', 'Telegram update ID', 'Unix date', 'Chat ID',
      'Message ID', 'Sender TG ID', 'Username', 'Имя', 'Сообщение',
      'Approver TG ID', 'Реакция', 'Результат']);
    sheet.setFrozenRows(1);
    sheet.getRange('B:G').setNumberFormat('@');
    sheet.getRange('J:J').setNumberFormat('@');
  }
  return sheet;
}

/**
 * Runs BEFORE normal doPost handlers, but only on approved relay traffic.
 * If the query secret does not match, the event falls through to existing
 * reject/audit routes; it is NEVER trusted or credited.
 */
function SPECNAZ_captureTrustedTelegramAudit_(e) {
  const cfg = SPECNAZ_auditConfig_();
  if (!cfg.capture) return null;
  if (typeof GOLUB_OWNER_safeJson_ !== 'function' ||
      typeof GOLUB_OWNER_raw_ !== 'function' ||
      typeof GOLUB_OWNER_safeEqual_ !== 'function') return null;

  const data = GOLUB_OWNER_safeJson_(GOLUB_OWNER_raw_(e));
  const row = SPECNAZ_parseTelegramAudit_(data, cfg);
  if (!row) return null;

  const expected = String(cfg.props.getProperty('GOLUB_OWNER_WEBHOOK_QUERY_SECRET') || '');
  const actual = e && e.parameter ? String(e.parameter.golub_owner_key || '') : '';
  if (!expected || !GOLUB_OWNER_safeEqual_(actual, expected)) return null;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error('SPECNAZ_AUDIT_CAPTURE_LOCK_TIMEOUT');
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    SPECNAZ_auditSheet_(ss).appendRow(row);
  } finally {
    lock.releaseLock();
  }
  return GOLUB_OWNER_json_({ok:true,specnazAudit:'DURABLY_CAPTURED'});
}

function SPECNAZ_collectAuditCandidates_(events, nowMs, cfg) {
  const sources = {};
  const votes = {};
  const seenUpdateIds = {};
  events.forEach(function(row, index) {
    const type = String(row[0] || '');
    const updateId = String(row[1] || '');
    const dateMs = Number(row[2] || 0) * 1000;
    const chatId = String(row[3] || '');
    const msgId = String(row[4] || '');
    if (!updateId || !/^\d+$/.test(msgId) || !Number.isFinite(dateMs) ||
        dateMs <= 0 || dateMs > nowMs + 300000 ||
        nowMs - dateMs > SPECNAZ_AUDIT_MAX_AGE_MS ||
        chatId !== cfg.chatId || seenUpdateIds[updateId]) return;
    seenUpdateIds[updateId] = true;
    const key = chatId + ':' + msgId;
    if (type === 'MESSAGE') {
      if (/^[1-9]\d+$/.test(String(row[5] || ''))) {
        if (!sources[key] || Number(sources[key].updateId) <= Number(updateId)) {
          sources[key] = {
            updateId:updateId, messageId:msgId, telegramId:String(row[5]),
            username:String(row[6] || ''), name:String(row[7] || ''),
            message:String(row[8] || ''), dateMs:dateMs
          };
        }
      }
      return;
    }
    if (type !== 'REACTION') return;
    const actor = String(row[9] || '');
    if (cfg.approvers.indexOf(actor) < 0) return;
    const voteKey = key + ':' + actor;
    if (!votes[voteKey] || Number(votes[voteKey].updateId) <= Number(updateId)) {
      votes[voteKey] = { key:key, updateId:updateId, dateMs:dateMs,
        active:String(row[10] || '') === 'ADD', rowIndex:index };
    }
  });
  const chosen = {};
  Object.keys(votes).forEach(function(k) {
    const vote = votes[k];
    if (!vote.active) return;
    if (!chosen[vote.key] || chosen[vote.key].dateMs < vote.dateMs) {
      chosen[vote.key] = vote;
    }
  });
  return Object.keys(chosen).map(function(k) {
    return {vote:chosen[k], source:sources[k] || null, key:k};
  });
}

function SPECNAZ_auditMessageLink_(cfg, messageId) {
  const chat = cfg.chatId.replace(/^-100/, '');
  if (!/^\d+$/.test(chat)) throw new Error('SPECNAZ_INVALID_CHAT_ID');
  return 'https://t.me/c/' + chat + '/' + cfg.topicId + '/' + messageId;
}

function SPECNAZ_reconcileApprovedReactions() {
  const cfg = SPECNAZ_auditConfig_();
  if (!cfg.capture || !cfg.chatId || !cfg.topicId || !cfg.approvers.length) {
    return {status:'DISABLED_OR_NOT_CONFIGURED'};
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return {status:'BUSY'};
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = SPECNAZ_auditSheet_(ss);
    const last = sheet.getLastRow();
    const count = Math.min(Math.max(0, last - 1), SPECNAZ_AUDIT_MAX_ROWS);
    const data = count ? sheet.getRange(last - count + 1, 1, count, 12).getValues() : [];
    const now = Date.now();
    const candidates = SPECNAZ_collectAuditCandidates_(data, now, cfg);
    const history = ss.getSheetByName(SHEET_HISTORY);
    const historyLast = history ? getHistoryLastContentRow_(history) : 1;
    const historyValues = historyLast > 1
      ? history.getRange(2, 1, historyLast - 1, HISTORY_WIDTH).getDisplayValues() : [];
    const awarded = {};
    historyValues.forEach(function(row) {
      const id = normalizeTgId_(row[HISTORY_COL_TG_ID - 1]);
      const link = normalizeSpecnazMessageLink_(row[HISTORY_COL_MESSAGE_LINK - 1]);
      if (id && link) awarded[id + '|' + link] = true;
    });
    const base = ss.getSheetByName(SHEET_BASE);
    const registered = {};
    if (base && base.getLastRow() >= 2) {
      base.getRange(2, COL_TG_ID, base.getLastRow() - 1, 1)
        .getDisplayValues().forEach(function(row) { if (row[0]) registered[String(row[0])] = true; });
    }

    const summary = {status:cfg.autoRecover?'ACTIVE':'DRY_RUN',
      approvals:candidates.length, alreadyCounted:0, pending:0,
      missingSource:0, unregistered:0, recoverable:0, recovered:0,
      retried:0, errors:0, truncated:last - 1 > SPECNAZ_AUDIT_MAX_ROWS};
    const crmSecret = cfg.autoRecover
      ? String(cfg.props.getProperty('ROYAL_CRM_WEBHOOK_SECRET_CURRENT') || '') : '';
    if (cfg.autoRecover && !crmSecret) throw new Error('SPECNAZ_CRM_SECRET_MISSING');

    candidates.forEach(function(item) {
      const source = item.source;
      if (!source) { summary.missingSource++; return; }
      if (!registered[source.telegramId]) { summary.unregistered++; return; }
      const link = SPECNAZ_auditMessageLink_(cfg, source.messageId);
      const identity = source.telegramId + '|' + link;
      if (awarded[identity]) { summary.alreadyCounted++; return; }
      if (now - item.vote.dateMs < SPECNAZ_AUDIT_WAIT_MS) {
        summary.pending++;
        return;
      }
      summary.recoverable++;
      if (!cfg.autoRecover) return;
      const payload = {
        secret:crmSecret, event:'reputation', tg_id:source.telegramId,
        tg_name:source.name || source.username || source.telegramId,
        tg_link:source.username ? '@' + source.username : '',
        assigned_rep:1, reputation_delta:1,
        datetime:new Date(source.dateMs).toISOString(),
        chat_id:cfg.chatId,
        reply_message_link:link,
        reply_message:source.message,
        source:'trusted_telegram_approved_reaction_recovery'
      };
      try {
        // This calls the EXISTING CRM writer. It retains the same processed-event
        // log, history, public-sync flags and anti-duplicate link guard.
        const response = processWebhookImmediately_({
          postData:{contents:JSON.stringify(payload), type:'application/json'}
        });
        const body = typeof RCWQ_readHandlerResult_ === 'function'
          ? RCWQ_readHandlerResult_(response)
          : JSON.parse(response.getContent());
        const status = String((body && body.status) || '');
        if (status === 'REPUTATION_UPDATED') {
          awarded[identity] = true;
          summary.recovered++;
        } else if (status === 'DUPLICATE_IGNORED' ||
                   status === 'REPUTATION_SOURCE_ALREADY_COUNTED') {
          awarded[identity] = true;
          summary.alreadyCounted++;
        } else if (status === 'RETRY_LOCKED' || status === 'ERROR') {
          summary.retried++;
        } else {
          summary.errors++;
        }
      } catch (err) {
        summary.errors++;
      }
    });

    cfg.props.setProperty('SPECNAZ_AUDIT_LAST_CHECK',
      JSON.stringify({at:new Date(now).toISOString(), result:summary}));
    return summary;
  } finally {
    lock.releaseLock();
  }
}

function SPECNAZ_installApprovalReconciliationTrigger() {
  const cfg = SPECNAZ_auditConfig_();
  if (!cfg.capture || !cfg.chatId || !cfg.topicId || !cfg.approvers.length) {
    throw new Error('SPECNAZ_AUDIT_CONFIGURATION_INCOMPLETE');
  }
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === SPECNAZ_AUDIT_HANDLER) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger(SPECNAZ_AUDIT_HANDLER).timeBased().everyMinutes(5).create();
  return {installed:true, autoRecover:cfg.autoRecover};
}
