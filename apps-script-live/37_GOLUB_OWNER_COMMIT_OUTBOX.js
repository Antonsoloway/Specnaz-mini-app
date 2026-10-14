/** M3C: private durable outbox for post-send history commits; no Telegram send. */
const GOLUB_COMMIT_OUTBOX_VERSION = '1.1.0';
const GOLUB_COMMIT_PREFIX = 'GOLUB_OWNER_COMMIT_V1_';
const GOLUB_COMMIT_HANDLER = 'GOLUB_OWNER_retryPendingCommits';
const GOLUB_COMMIT_CHUNK_SIZE = 7000;
const GOLUB_AI_RETRY_VERSION = '1.0.0';
const GOLUB_AI_RETRY_PREFIX = 'GOLUB_OWNER_AI_RETRY_V1_';
const GOLUB_AI_RETRY_MAX_ATTEMPTS = 30;
const GOLUB_AI_RETRY_STALE_MS = 15 * 60000;
const GOLUB_COMMIT_TIMER_HEARTBEAT_PROP = 'GOLUB_OWNER_COMMIT_TIMER_HEARTBEAT_V1';
const GOLUB_COMMIT_TIMER_STALE_MS = 3 * 60000;
const GOLUB_DELIVERY_PREFIX = 'GOLUB_OWNER_DELIVERY_V1_';

function GOLUB_OWNER_commitLock_(operation) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('COMMIT_OUTBOX_BUSY');
  try { return operation(); } finally { lock.releaseLock(); }
}

function GOLUB_OWNER_commitTimerTriggers_() {
  return ScriptApp.getProjectTriggers().filter(function(trigger) {
    return trigger.getHandlerFunction() === GOLUB_COMMIT_HANDLER;
  });
}

function GOLUB_OWNER_commitTimerHealthy_(props, triggers, now) {
  if (!triggers.length) return false;
  var heartbeat = Number(props.getProperty(GOLUB_COMMIT_TIMER_HEARTBEAT_PROP) || 0);
  return heartbeat > 0 && Math.max(0, now - heartbeat) <= GOLUB_COMMIT_TIMER_STALE_MS;
}

function GOLUB_OWNER_ensureCommitTimer_() {
  // A trigger can remain listed after its executions stop succeeding. Treat the
  // heartbeat, not mere trigger existence, as liveness. Owner-private traffic
  // self-heals a stale/missing timer without exposing an admin endpoint.
  var props = PropertiesService.getScriptProperties();
  var now = Date.now();
  var existing = GOLUB_OWNER_commitTimerTriggers_();
  if (GOLUB_OWNER_commitTimerHealthy_(props, existing, now)) return;
  return GOLUB_OWNER_commitLock_(function() {
    now = Date.now();
    existing = GOLUB_OWNER_commitTimerTriggers_();
    if (GOLUB_OWNER_commitTimerHealthy_(props, existing, now)) return;
    existing.forEach(function(trigger) {
      try { ScriptApp.deleteTrigger(trigger); } catch (_) {}
    });
    ScriptApp.newTrigger(GOLUB_COMMIT_HANDLER).timeBased().everyMinutes(1).create();
    // Seed heartbeat so request bursts do not recreate a just-installed timer.
    // The timer itself refreshes this every execution; if it never runs the
    // heartbeat becomes stale and the next owner message repairs it again.
    props.setProperty(GOLUB_COMMIT_TIMER_HEARTBEAT_PROP, String(now));
  });
}

function GOLUB_OWNER_hasCommitTimer_() {
  return GOLUB_OWNER_commitTimerTriggers_().length > 0;
}

function GOLUB_OWNER_deliveryKey_(updateId) {
  if (!/^\d+$/.test(String(updateId))) throw new Error('COMMIT_UPDATE_ID_INVALID');
  return GOLUB_DELIVERY_PREFIX + String(updateId);
}

function GOLUB_OWNER_deliveryRecord_(props, updateId) {
  var raw = props.getProperty(GOLUB_OWNER_deliveryKey_(updateId));
  if (!raw) return null;
  // A malformed record must not authorize another Telegram send.
  try { return JSON.parse(raw) || {state:'unknown'}; }
  catch (_) { return {state:'unknown'}; }
}

function GOLUB_OWNER_recordDelivery_(props, updateId, receipt, kind) {
  // Per-update record, never a shared read/modify/write cursor. Save a real
  // receipt independently of ScriptLock before touching the legacy outbox META.
  var record = {version:'1.0.0', at:Date.now(), kind:kind,
    state:receipt ? 'confirmed' : 'attempted', receipt:receipt || null};
  props.setProperty(GOLUB_OWNER_deliveryKey_(updateId), JSON.stringify(record));
  return record;
}

function GOLUB_OWNER_commitDigest_(value) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8
  ));
}

function GOLUB_OWNER_recordHandledUpdate_(props, updateId, values) {
  return GOLUB_OWNER_commitLock_(function() {
    values[GOLUB_OWNER_WEBHOOK_PROP.lastUpdateId] = String(Math.max(
      Number(props.getProperty(GOLUB_OWNER_WEBHOOK_PROP.lastUpdateId) || -1), Number(updateId)
    ));
    props.setProperties(values, false);
  });
}

function GOLUB_OWNER_prepareCommit_(answer, updateId, props) {
  if (!answer || !answer.commit) return null;
  if (!/^\d+$/.test(String(updateId))) throw new Error('COMMIT_UPDATE_ID_INVALID');
  var key = GOLUB_COMMIT_PREFIX + String(updateId);
  return GOLUB_OWNER_commitLock_(function() {
    if (GOLUB_OWNER_deliveryRecord_(props, updateId) ||
      Number(updateId) <= Number(props.getProperty(GOLUB_OWNER_WEBHOOK_PROP.lastUpdateId) || -1)) {
      return {key:key, duplicate:true};
    }
    if (props.getProperty(key + '_META')) return {key:key, duplicate:true};
    var raw = JSON.stringify({
      commit:answer.commit,
      answer:String(answer.commitAnswer || answer.plain || '').trim()
    });
    var encoded = Utilities.base64EncodeWebSafe(raw, Utilities.Charset.UTF_8);
    var chunks = Math.ceil(encoded.length / GOLUB_COMMIT_CHUNK_SIZE);
    if (chunks < 1 || chunks > 16) throw new Error('COMMIT_PAYLOAD_SIZE_INVALID');
    var values = {};
    for (var i = 0; i < chunks; i++) values[key + '_PART_' + i] = encoded.slice(i * GOLUB_COMMIT_CHUNK_SIZE, (i + 1) * GOLUB_COMMIT_CHUNK_SIZE);
    // ASCII chunks are private Script Properties, never CRM sheet rows or logs.
    // Write the discovery marker last. A prepared job cannot commit or resend.
    props.setProperties(values, false);
    props.setProperty(key + '_META', JSON.stringify({
      version:GOLUB_COMMIT_OUTBOX_VERSION, updateId:String(updateId), chunks:chunks,
      digest:GOLUB_OWNER_commitDigest_(raw), state:'prepared', sent:null,
      attempts:0, createdAt:Date.now(), nextAttemptAt:0, leaseUntil:0
    }));
    return {key:key, duplicate:false};
  });
}

function GOLUB_OWNER_markCommitSent_(key, receipt, props) {
  return GOLUB_OWNER_commitLock_(function() {
    var meta = JSON.parse(props.getProperty(key + '_META') || 'null');
    if (!meta && receipt &&
      Number(key.slice(GOLUB_COMMIT_PREFIX.length)) <=
      Number(props.getProperty(GOLUB_OWNER_WEBHOOK_PROP.lastUpdateId) || -1)) return;
    if (!meta || !receipt || !receipt.messageId || !receipt.botUserId) {
      throw new Error('COMMIT_SENT_STATE_INVALID');
    }
    // The timer may already have recovered the independently saved receipt.
    if (meta.state !== 'prepared') {
      if (meta.sent && String(meta.sent.messageId) === String(receipt.messageId) &&
        String(meta.sent.botUserId) === String(receipt.botUserId)) return;
      throw new Error('COMMIT_SENT_STATE_INVALID');
    }
    meta.sent = receipt;
    meta.state = 'sent';
    meta.nextAttemptAt = Date.now();
    props.setProperty(key + '_META', JSON.stringify(meta));
  });
}

function GOLUB_OWNER_cleanCommitted_(key, meta, props) {
  // The committed marker survives interrupted cleanup; later ticks need no
  // payload to finish deletion and cannot accidentally retry Telegram.
  for (var i = 0; i < meta.chunks; i++) props.deleteProperty(key + '_PART_' + i);
  props.deleteProperty(key + '_META');
}

function GOLUB_OWNER_readPreparedCommit_(key, meta, props) {
  if (!meta || !meta.chunks) throw new Error('COMMIT_PAYLOAD_INVALID');
  var encoded = '';
  for (var i = 0; i < Number(meta.chunks || 0); i++) {
    var part = props.getProperty(key + '_PART_' + i);
    if (part === null) throw new Error('COMMIT_PAYLOAD_PART_MISSING');
    encoded += part;
  }
  var raw = Utilities.newBlob(Utilities.base64DecodeWebSafe(encoded)).getDataAsString('UTF-8');
  if (GOLUB_OWNER_commitDigest_(raw) !== String(meta.digest || '')) throw new Error('COMMIT_PAYLOAD_DIGEST_MISMATCH');
  var stored = JSON.parse(raw);
  if (!stored || !stored.commit || !String(stored.answer || '').trim()) throw new Error('COMMIT_PAYLOAD_INVALID');
  return stored;
}

function GOLUB_OWNER_attemptCommit_(key, props) {
  var claim = GOLUB_OWNER_commitLock_(function() {
    var meta = JSON.parse(props.getProperty(key + '_META') || 'null');
    if (!meta) return null;
    if (meta.state === 'prepared') {
      var delivery = GOLUB_OWNER_deliveryRecord_(props, meta.updateId);
      if (delivery && delivery.kind === 'answer' && delivery.state === 'confirmed' &&
        delivery.receipt && delivery.receipt.messageId && delivery.receipt.botUserId) {
        meta.sent = delivery.receipt;
        meta.state = 'sent';
        meta.nextAttemptAt = 0;
        props.setProperty(key + '_META', JSON.stringify(meta));
      }
    }
    if (meta.state === 'committed') {
      GOLUB_OWNER_cleanCommitted_(key, meta, props);
      return null;
    }
    if (!meta.sent || meta.state === 'prepared' || meta.nextAttemptAt > Date.now()
      || (meta.state === 'processing' && meta.leaseUntil > Date.now())) return null;
    if (['sent','retry','processing'].indexOf(meta.state) < 0) return null;
    meta.state = 'processing';
    meta.attempts += 1;
    meta.leaseUntil = Date.now() + 30 * 60 * 1000;
    meta.claimId = Utilities.getUuid();
    props.setProperty(key + '_META', JSON.stringify(meta));
    return meta;
  });
  if (!claim) return {ok:true, skipped:true};
  var committed = false;
  try {
    var encoded = '';
    for (var i = 0; i < claim.chunks; i++) {
      var part = props.getProperty(key + '_PART_' + i);
      if (part === null) throw new Error('COMMIT_PAYLOAD_PART_MISSING');
      encoded += part;
    }
    var raw = Utilities.newBlob(Utilities.base64DecodeWebSafe(encoded)).getDataAsString('UTF-8');
    if (GOLUB_OWNER_commitDigest_(raw) !== claim.digest) throw new Error('COMMIT_PAYLOAD_DIGEST_MISMATCH');
    var stored = JSON.parse(raw);
    var result = GOLUB_OWNER_commitAnswer_({commit:stored.commit, commitAnswer:stored.answer}, claim.sent, props);
    if (!result || result.ok !== true || result.committed !== true) throw new Error('COMMIT_ACK_REQUIRED');
    committed = true;
  } catch (_) {
    // Keep the exact payload and receipts until the Worker acknowledges D1.
  }
  return GOLUB_OWNER_commitLock_(function() {
    var meta = JSON.parse(props.getProperty(key + '_META') || 'null');
    if (!meta || meta.claimId !== claim.claimId) return {ok:false, pending:true};
    if (committed) {
      // Advance deduplication before removing the durable delivered marker.
      var cursor = Math.max(Number(props.getProperty(GOLUB_OWNER_WEBHOOK_PROP.lastUpdateId) || -1), Number(meta.updateId));
      props.setProperty(GOLUB_OWNER_WEBHOOK_PROP.lastUpdateId, String(cursor));
      meta.state = 'committed';
      props.setProperty(key + '_META', JSON.stringify(meta));
      try { GOLUB_OWNER_cleanCommitted_(key, meta, props); } catch (_) {}
      return {ok:true, committed:true};
    }
    meta.state = 'retry';
    meta.leaseUntil = 0;
    meta.nextAttemptAt = Date.now() + Math.min(3600000, 60000 * Math.pow(2, Math.min(meta.attempts - 1, 6)));
    props.setProperty(key + '_META', JSON.stringify(meta));
    return {ok:false, pending:true};
  });
}

function GOLUB_OWNER_aiRetryDelay_(retryAfterMs, attempts) {
  var hinted = Math.max(0, Number(retryAfterMs || 0) || 0);
  var backoff = Math.min(300000, 5000 * Math.pow(2, Math.min(Math.max(0, Number(attempts || 1) - 1), 6)));
  return Math.min(300000, Math.max(5000, hinted, backoff));
}

function GOLUB_OWNER_prepareAiRetry_(message, sender, updateId, retryAfterMs, props) {
  if (!/^\d+$/.test(String(updateId))) throw new Error('AI_RETRY_UPDATE_ID_INVALID');
  props = props || PropertiesService.getScriptProperties();
  var key = GOLUB_AI_RETRY_PREFIX + String(updateId);
  var prepared = GOLUB_OWNER_commitLock_(function() {
    if (props.getProperty(key + '_META')) return {key:key, duplicate:true};
    var raw = JSON.stringify({
      updateId:Number(updateId),
      message:GOLUB_OWNER_messageContext_(message, true),
      sender:{id:String(sender && sender.id || ''), is_bot:Boolean(sender && sender.is_bot),
        first_name:String(sender && sender.first_name || ''), last_name:String(sender && sender.last_name || ''),
        username:String(sender && sender.username || '')}
    });
    var encoded = Utilities.base64EncodeWebSafe(raw, Utilities.Charset.UTF_8);
    var chunks = Math.ceil(encoded.length / GOLUB_COMMIT_CHUNK_SIZE);
    if (chunks < 1 || chunks > 16) throw new Error('AI_RETRY_PAYLOAD_SIZE_INVALID');
    var values = {};
    for (var i = 0; i < chunks; i++) values[key + '_PART_' + i] = encoded.slice(i * GOLUB_COMMIT_CHUNK_SIZE, (i + 1) * GOLUB_COMMIT_CHUNK_SIZE);
    props.setProperties(values, false);
    props.setProperty(key + '_META', JSON.stringify({
      version:GOLUB_AI_RETRY_VERSION, updateId:String(updateId), chunks:chunks,
      digest:GOLUB_OWNER_commitDigest_(raw), state:'waiting', attempts:0,
      createdAt:Date.now(), nextAttemptAt:Date.now() + GOLUB_OWNER_aiRetryDelay_(retryAfterMs, 1),
      leaseUntil:0
    }));
    return {key:key, duplicate:false};
  });
  // AI_WAIT must be self-starting. Do not assume a previous durable-commit
  // timer exists: a capacity-only failure can happen before any commit job.
  GOLUB_OWNER_ensureCommitTimer_();
  return prepared;
}

function GOLUB_OWNER_readAiRetry_(key, meta, props) {
  var encoded = '';
  for (var i = 0; i < Number(meta.chunks || 0); i++) {
    var part = props.getProperty(key + '_PART_' + i);
    if (!part) throw new Error('AI_RETRY_PAYLOAD_PART_MISSING');
    encoded += part;
  }
  var raw = Utilities.newBlob(Utilities.base64DecodeWebSafe(encoded)).getDataAsString('UTF-8');
  if (GOLUB_OWNER_commitDigest_(raw) !== String(meta.digest || '')) throw new Error('AI_RETRY_PAYLOAD_DIGEST_MISMATCH');
  var payload = JSON.parse(raw);
  if (!payload || Number(payload.updateId) !== Number(meta.updateId) || !payload.message || !payload.sender) throw new Error('AI_RETRY_PAYLOAD_INVALID');
  return payload;
}

function GOLUB_OWNER_cleanAiRetry_(key, meta, props) {
  for (var i = 0; i < Number(meta.chunks || 0); i++) props.deleteProperty(key + '_PART_' + i);
  props.deleteProperty(key + '_META');
}

function GOLUB_OWNER_updateAiRetry_(key, meta, props, retryAfterMs) {
  meta.state = 'retry';
  meta.leaseUntil = 0;
  meta.nextAttemptAt = Date.now() + GOLUB_OWNER_aiRetryDelay_(retryAfterMs, meta.attempts);
  props.setProperty(key + '_META', JSON.stringify(meta));
}

function GOLUB_OWNER_retryPendingAi_(props) {
  var all = props.getProperties();
  var now = Date.now();
  var expired = 0;
  Object.keys(all).filter(function(key) {
    return key.indexOf(GOLUB_AI_RETRY_PREFIX) === 0 && /_META$/.test(key);
  }).forEach(function(metaKey) {
    var meta = null;
    try { meta = JSON.parse(all[metaKey]); } catch (_) {}
    if (!meta || now - Number(meta.createdAt || 0) <= GOLUB_AI_RETRY_STALE_MS) return;
    try {
      GOLUB_OWNER_cleanAiRetry_(metaKey.slice(0, -5), meta, props);
      expired += 1;
    } catch (_) {}
  });
  if (expired) {
    try { props.setProperty(GOLUB_OWNER_WEBHOOK_PROP.lastIngress,
      'PRIVATE_OWNER_AI_WAIT_EXPIRED ' + expired + ' ' + new Date().toISOString()); } catch (_) {}
  }
  all = props.getProperties();
  var jobs = Object.keys(all).filter(function(key) {
    return key.indexOf(GOLUB_AI_RETRY_PREFIX) === 0 && /_META$/.test(key);
  }).map(function(key) {
    try { return {key:key.slice(0, -5), meta:JSON.parse(all[key])}; } catch (_) { return null; }
  }).filter(function(job) {
    return job && Number(job.meta.nextAttemptAt || 0) <= Date.now()
      && !(job.meta.state === 'processing' && Number(job.meta.leaseUntil || 0) > Date.now());
  }).sort(function(a,b) { return Number(a.meta.createdAt || 0) - Number(b.meta.createdAt || 0); });

  var summary = {version:GOLUB_AI_RETRY_VERSION, attempted:0, answered:0, pending:0, abandoned:0, expired:expired};
  var started = Date.now();
  for (var i = 0; i < jobs.length && summary.attempted < 2 && Date.now() - started < 120000; i++) {
    var job = jobs[i], meta = job.meta, payload = null;
    var claimed = false;
    try {
      GOLUB_OWNER_commitLock_(function() {
        var current = JSON.parse(props.getProperty(job.key + '_META') || 'null');
        if (!current || Number(current.nextAttemptAt || 0) > Date.now()
          || (current.state === 'processing' && Number(current.leaseUntil || 0) > Date.now())) return;
        current.state = 'processing';
        current.attempts = Number(current.attempts || 0) + 1;
        current.leaseUntil = Date.now() + 150000;
        props.setProperty(job.key + '_META', JSON.stringify(current));
        meta = current;
        claimed = true;
      });
      if (!claimed) continue;
      summary.attempted += 1;

      // If any Telegram send was already attempted, never send again from the AI retry queue.
      if (GOLUB_OWNER_deliveryRecord_(props, meta.updateId)) {
        GOLUB_OWNER_cleanAiRetry_(job.key, meta, props);
        continue;
      }

      payload = GOLUB_OWNER_readAiRetry_(job.key, meta, props);
      var answer = GOLUB_OWNER_aiAnswer_(payload.message, payload.sender, props, payload.updateId);
      if (answer && answer.retryableAi === true) {
        GOLUB_OWNER_updateAiRetry_(job.key, meta, props, answer.retryAfterMs);
        summary.pending += 1;
        continue;
      }

      var commitJob = GOLUB_OWNER_prepareCommit_(answer, payload.updateId, props);
      if (commitJob && commitJob.duplicate) {
        var existingDelivery = GOLUB_OWNER_deliveryRecord_(props, payload.updateId);
        var existingKey = GOLUB_COMMIT_PREFIX + String(payload.updateId);
        var existingMeta = null;
        try { existingMeta = JSON.parse(props.getProperty(existingKey + '_META') || 'null'); } catch (_) {}
        if (existingDelivery) {
          GOLUB_OWNER_cleanAiRetry_(job.key, meta, props);
          continue;
        }
        if (existingMeta && existingMeta.state === 'prepared') {
          var stored = GOLUB_OWNER_readPreparedCommit_(existingKey, existingMeta, props);
          answer = {plain:String(stored.answer), html:'', commit:stored.commit, commitAnswer:String(stored.answer)};
          commitJob = {key:existingKey, duplicate:false, recovered:true};
        } else {
          throw new Error('AI_RETRY_COMMIT_STATE_INVALID');
        }
      }

      GOLUB_OWNER_recordDelivery_(props, payload.updateId, null, 'answer');
      var receipt = GOLUB_OWNER_sendAnswer_(payload.message.chat.id, answer);
      var sentAt = new Date().toISOString();
      GOLUB_OWNER_recordDelivery_(props, payload.updateId, receipt, 'answer');
      if (commitJob) GOLUB_OWNER_markCommitSent_(commitJob.key, receipt, props);
      GOLUB_OWNER_recordHandledUpdate_(props, payload.updateId, {
        GOLUB_OWNER_LAST_OK:sentAt,
        GOLUB_OWNER_LAST_ERROR:'',
        GOLUB_OWNER_LAST_INGRESS:'PRIVATE_OWNER_SENT_AFTER_AI_WAIT ' + sentAt
      });
      if (answer && answer.commit && commitJob) {
        try { GOLUB_OWNER_attemptCommit_(commitJob.key, props); } catch (_) {}
      }
      GOLUB_OWNER_cleanAiRetry_(job.key, meta, props);
      GOLUB_OWNER_recordIngress_(props, 'PRIVATE_OWNER_AI_WAIT_ANSWERED');
      summary.answered += 1;
    } catch (error) {
      try {
        var delivery = GOLUB_OWNER_deliveryRecord_(props, meta.updateId);
        if (delivery) {
          GOLUB_OWNER_cleanAiRetry_(job.key, meta, props);
        } else if (Number(meta.attempts || 0) >= GOLUB_AI_RETRY_MAX_ATTEMPTS) {
          // Keep the payload for diagnostics but stop hot-looping; no fake AI answer is sent.
          meta.state = 'paused';
          meta.leaseUntil = 0;
          meta.nextAttemptAt = Date.now() + 3600000;
          props.setProperty(job.key + '_META', JSON.stringify(meta));
          summary.abandoned += 1;
        } else {
          GOLUB_OWNER_updateAiRetry_(job.key, meta, props, 0);
          summary.pending += 1;
        }
        GOLUB_OWNER_saveDiagnostic_(props, 'ai_retry_timer', error, [], Boolean(delivery), Boolean(delivery && delivery.state === 'confirmed'));
      } catch (_) { summary.pending += 1; }
    }
  }
  return summary;
}

function GOLUB_OWNER_retryPendingCommits() {
  var props = PropertiesService.getScriptProperties();
  // First instruction in the timer is a heartbeat. A listed trigger without a
  // fresh heartbeat is treated as dead and replaced by owner-private ingress.
  try { props.setProperty(GOLUB_COMMIT_TIMER_HEARTBEAT_PROP, String(Date.now())); } catch (_) {}
  var aiRetry = GOLUB_OWNER_retryPendingAi_(props);
  var all = props.getProperties();
  var jobs = Object.keys(all).filter(function(key) {
    return key.indexOf(GOLUB_COMMIT_PREFIX) === 0 && /_META$/.test(key);
  }).map(function(key) {
    try { return {key:key.slice(0, -5), meta:JSON.parse(all[key])}; } catch (_) { return null; }
  }).filter(function(job) {
    if (!job) return false;
    var delivery = null;
    try { delivery = JSON.parse(all[GOLUB_DELIVERY_PREFIX + job.meta.updateId] || 'null'); } catch (_) {}
    var recoverable = delivery && delivery.kind === 'answer' && delivery.state === 'confirmed';
    return (job.meta.state !== 'prepared' || recoverable) && Number(job.meta.nextAttemptAt || 0) <= Date.now()
      && !(job.meta.state === 'processing' && Number(job.meta.leaseUntil || 0) > Date.now());
  }).sort(function(a,b) { return a.meta.createdAt - b.meta.createdAt; });
  var summary = {version:GOLUB_COMMIT_OUTBOX_VERSION, attempted:0, committed:0, pending:0, aiRetry:aiRetry};
  var started = Date.now();
  for (var i = 0; i < jobs.length && summary.attempted < 3 && Date.now() - started < 120000; i++) {
    summary.attempted += 1;
    try {
      var result = GOLUB_OWNER_attemptCommit_(jobs[i].key, props);
      if (result.committed) summary.committed += 1;
      else if (result.pending) summary.pending += 1;
    } catch (_) { summary.pending += 1; }
  }
  // Bounded cleanup only after the legacy cursor covers the record, and never
  // while its answer/commit payload is pending. No answer is sent by this timer.
  try {
    GOLUB_OWNER_commitLock_(function() {
      var latest = Number(props.getProperty(GOLUB_OWNER_WEBHOOK_PROP.lastUpdateId) || -1);
      Object.keys(all).filter(function(key) { return key.indexOf(GOLUB_DELIVERY_PREFIX) === 0; })
        .forEach(function(key) {
          var record;
          try { record = JSON.parse(all[key]); } catch (_) { return; }
          if (record && record.version === '1.0.0' &&
            ['attempted','confirmed'].indexOf(record.state) >= 0) {
            latest = Math.max(latest, Number(key.slice(GOLUB_DELIVERY_PREFIX.length)));
          }
        });
      if (isFinite(latest) && latest >= 0) {
        props.setProperty(GOLUB_OWNER_WEBHOOK_PROP.lastUpdateId, String(latest));
      }
    });
    var cursor = Number(props.getProperty(GOLUB_OWNER_WEBHOOK_PROP.lastUpdateId) || -1);
    var removed = 0;
    Object.keys(all).filter(function(key) { return key.indexOf(GOLUB_DELIVERY_PREFIX) === 0; })
      .forEach(function(key) {
        if (removed >= 20) return;
        var id = key.slice(GOLUB_DELIVERY_PREFIX.length);
        var record;
        try { record = JSON.parse(all[key]); } catch (_) { return; }
        if (Number(id) <= cursor && Number(record.at) < Date.now() - 7 * 86400000 &&
          !props.getProperty(GOLUB_COMMIT_PREFIX + id + '_META')) {
          props.deleteProperty(key);
          removed += 1;
        }
      });
  } catch (_) {}
  return summary;
}
