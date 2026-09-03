/**
 * GOLUB SHADOW PRIVATE v1 — owner-only setup helpers.
 * Secrets remain in Script Properties and are never returned by these methods.
 */

function GOLUB_SHADOW_configureOwnerPrivateV1(workerUrl, sharedSecret, ownerUserId) {
  var url = String(workerUrl || '').trim().replace(/\/+$/, '');
  if (url.indexOf('/internal/golub-shadow') < 0) {
    url += '/internal/golub-shadow';
  }
  var secret = String(sharedSecret || '').trim();
  var owner = String(ownerUserId || GOLUB_SHADOW_DEFAULT_OWNER_ID || '').trim();
  if (!/^https:\/\//i.test(url)) throw new Error('GOLUB_SHADOW_BAD_WORKER_URL');
  if (secret.length < 32) throw new Error('GOLUB_SHADOW_BAD_SHARED_SECRET');
  if (!/^\d+$/.test(owner)) throw new Error('GOLUB_SHADOW_BAD_OWNER_ID');

  var props = PropertiesService.getScriptProperties();
  var ingressSecret = String(props.getProperty('ROYAL_CRM_WEBHOOK_SECRET_CURRENT') || '').trim();
  if (ingressSecret.length < 24) throw new Error('GOLUB_SHADOW_ROYAL_WEBHOOK_SECRET_MISSING');
  if (!String(props.getProperty('TELEGRAM_BOT_TOKEN') || '').trim()) {
    throw new Error('GOLUB_SHADOW_TELEGRAM_TOKEN_MISSING');
  }

  props.setProperties({
    GOLUB_SHADOW_PRIVATE_ENABLED:'1',
    GOLUB_SHADOW_OWNER_USER_ID:owner,
    GOLUB_SHADOW_WORKER_URL:url,
    GOLUB_SHADOW_SHARED_SECRET:secret,
    GOLUB_SHADOW_INGRESS_SECRET:ingressSecret,
    GOLUB_SHADOW_LAST_ERROR:''
  }, false);

  return {
    ok:true,
    status:'GOLUB_SHADOW_CONFIGURED',
    version:GOLUB_SHADOW_VERSION,
    owner_user_id:owner,
    worker_endpoint_configured:true,
    shared_secret_configured:true,
    ingress_secret_reused_from_royal_crm:true,
    telegram_token_configured:true,
    public_webhook_changed:false,
    chp_group_behavior_changed:false
  };
}

function GOLUB_SHADOW_disableOwnerPrivateV1() {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('GOLUB_SHADOW_PRIVATE_ENABLED','0');
  return {ok:true,status:'GOLUB_SHADOW_DISABLED',public_webhook_changed:false,chp_group_behavior_changed:false};
}

function GOLUB_SHADOW_probeWorkerV1(question) {
  var owner = GOLUB_SHADOW_ownerId_();
  var text = String(question || 'Голубь, новенькие заходили сегодня в ЧП?').trim();
  var result = GOLUB_SHADOW_callWorker_({
    source:'clasp_probe',
    event:'golub_shadow_private',
    chatType:'private',
    chatId:owner,
    userId:owner,
    username:'AnSoloway',
    firstName:'Антон',
    lastName:'',
    messageId:'',
    date:Math.floor(Date.now()/1000),
    text:text
  });
  return {
    ok:Boolean(result && result.ok),
    status:'GOLUB_SHADOW_WORKER_PROBE',
    version:String(result && result.version || ''),
    evidence_count:Number(result && result.evidenceCount || 0),
    answer:String(result && result.answer || '').slice(0,3000)
  };
}

function GOLUB_SHADOW_statusV1() {
  var state = GOLUB_SHADOW_check();
  return {
    ok:Boolean(state.enabled && state.worker_configured && state.shared_secret_configured && state.ingress_secret_configured && state.telegram_token_configured),
    status:'GOLUB_SHADOW_STATUS',
    state:state
  };
}

function GOLUB_SHADOW_chatKeeperPayloadTemplateV1() {
  return {
    event:'golub_shadow_private',
    secret:'<использовать существующий ROYAL_CRM webhook secret>',
    tg_id:'%actor_user_id%',
    tg_name:'%actor_username%',
    tg_link:'%actor_loginlink%',
    chat_id:'%actor_user_id%',
    chat_type:'private',
    message:'%message%',
    message_id:'%message_id%',
    datetime:'%datetime%'
  };
}
