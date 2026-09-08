/** M3C: private durable outbox for post-send history commits; no Telegram send. */
const GOLUB_COMMIT_OUTBOX_VERSION = '1.0.0';
const GOLUB_COMMIT_PREFIX = 'GOLUB_OWNER_COMMIT_V1_';
const GOLUB_COMMIT_HANDLER = 'GOLUB_OWNER_retryPendingCommits';
const GOLUB_COMMIT_CHUNK_SIZE = 7000;

function GOLUB_OWNER_commitLock_(operation) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('COMMIT_OUTBOX_BUSY');
  try { return operation(); } finally { lock.releaseLock(); }
}

function GOLUB_OWNER_ensureCommitTimer_() {
  return GOLUB_OWNER_commitLock_(function() {
    var found = ScriptApp.getProjectTriggers().some(function(trigger) {
      return trigger.getHandlerFunction() === GOLUB_COMMIT_HANDLER;
    });
    if (!found) ScriptApp.newTrigger(GOLUB_COMMIT_HANDLER).timeBased().everyMinutes(1).create();
  });
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
    if (Number(updateId) <= Number(props.getProperty(GOLUB_OWNER_WEBHOOK_PROP.lastUpdateId) || -1)) {
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
    if (!meta || meta.state !== 'prepared' || !receipt || !receipt.messageId || !receipt.botUserId) {
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

function GOLUB_OWNER_attemptCommit_(key, props) {
  var claim = GOLUB_OWNER_commitLock_(function() {
    var meta = JSON.parse(props.getProperty(key + '_META') || 'null');
    if (!meta) return null;
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

function GOLUB_OWNER_retryPendingCommits() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  var jobs = Object.keys(all).filter(function(key) {
    return key.indexOf(GOLUB_COMMIT_PREFIX) === 0 && /_META$/.test(key);
  }).map(function(key) {
    try { return {key:key.slice(0, -5), meta:JSON.parse(all[key])}; } catch (_) { return null; }
  }).filter(function(job) {
    return job && job.meta.state !== 'prepared' && Number(job.meta.nextAttemptAt || 0) <= Date.now()
      && !(job.meta.state === 'processing' && Number(job.meta.leaseUntil || 0) > Date.now());
  }).sort(function(a,b) { return a.meta.createdAt - b.meta.createdAt; });
  var summary = {version:GOLUB_COMMIT_OUTBOX_VERSION, attempted:0, committed:0, pending:0};
  var started = Date.now();
  for (var i = 0; i < jobs.length && summary.attempted < 3 && Date.now() - started < 120000; i++) {
    summary.attempted += 1;
    try {
      var result = GOLUB_OWNER_attemptCommit_(jobs[i].key, props);
      if (result.committed) summary.committed += 1;
      else if (result.pending) summary.pending += 1;
    } catch (_) { summary.pending += 1; }
  }
  return summary;
}
