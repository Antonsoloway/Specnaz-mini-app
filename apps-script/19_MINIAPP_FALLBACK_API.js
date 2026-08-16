/*
 * Royal CRM / Таблица ЧП
 * 19_MINIAPP_FALLBACK_API.js
 * v1.2.0
 * Network fallback API + authenticated Project MAYAK media.
 * Participant/history association is based on Telegram-ID-derived private keys.
 */
var MINIAPP_FALLBACK_API_VERSION = '1.2.0';
var MINIAPP_FALLBACK_IDENTITY_SECRET_PROP = 'MINIAPP_FALLBACK_IDENTITY_SECRET';
var MINIAPP_MAYAK_MEDIA = {
  'leaderboard-players': { fileId: '1qP59gUe5hB7fymTk89RjJ0ks5ahc2r7e', mime: 'image/jpeg' },
  'leaderboard-team': { fileId: '1q-wZDOswV5D8PpqPDIHPo-4sNdwTzJAY', mime: 'image/jpeg' },
  'audio': { fileId: '1I1MYbQYAnKyqGxM2y9TtufslpyYXdFaB', mime: 'audio/mpeg' },
  'video': { fileId: '1MF-I4VUjAshkoVBQ2ay6SZGlRDFgeIxw', mime: 'video/mp4' }
};

function MINIAPP_fallbackMaybeHandle_(e) {
  var action = MINIAPP_value_(e && e.parameter && e.parameter.action);
  var allowed = {
    'fallback-auth': true,
    'fallback-snapshot': true,
    'fallback-avatar': true,
    'fallback-team-photo': true,
    'project-mayak-media': true
  };
  if (!allowed[action]) return null;
  var callback = MINIAPP_callback_(e && e.parameter && e.parameter.callback);
  var data;
  try {
    if (action === 'fallback-auth') data = MINIAPP_fallbackAuth_(e);
    else if (action === 'fallback-snapshot') data = MINIAPP_fallbackSnapshot_(e);
    else if (action === 'fallback-avatar') data = MINIAPP_fallbackAvatar_(e);
    else if (action === 'fallback-team-photo') data = MINIAPP_fallbackTeamPhoto_(e);
    else if (action === 'project-mayak-media') data = MINIAPP_projectMayakMedia_(e);
  } catch (err) {
    console.error('MINIAPP fallback API error:', action, err && err.stack ? err.stack : err);
    data = { ok:false, access:false, error:'FALLBACK_SERVER_ERROR', message:'Резервный сервер временно недоступен.', version:MINIAPP_FALLBACK_API_VERSION };
  }
  return MINIAPP_jsonp_(callback, data);
}

function MINIAPP_projectMayakMedia_(e) {
  var auth = MINIAPP_fallbackAuthorize_(e);
  if (!auth.ok) return auth.result;
  var key = MINIAPP_value_(e && e.parameter && e.parameter.asset);
  var item = MINIAPP_MAYAK_MEDIA[key];
  if (!item) return MINIAPP_fallbackError_('PROJECT_MEDIA_UNKNOWN', 'Файл проекта не найден.');
  var blob = DriveApp.getFileById(item.fileId).getBlob();
  var bytes = blob.getBytes();
  if (!bytes || !bytes.length) return MINIAPP_fallbackError_('PROJECT_MEDIA_EMPTY', 'Файл проекта пуст.');
  return { ok:true, access:true, backend:'google-apps-script', version:MINIAPP_FALLBACK_API_VERSION, mime:String(blob.getContentType() || item.mime || 'application/octet-stream'), base64:Utilities.base64Encode(bytes) };
}

function MINIAPP_fallbackAuth_(e) {
  var auth = MINIAPP_fallbackAuthorize_(e);
  if (!auth.ok) return auth.result;
  var result = auth.result || {};
  var telegramId = MINIAPP_fallbackTelegramIdFromInitData_(MINIAPP_value_(e && e.parameter && e.parameter.initData));
  if (!result.user) result.user = {};
  if (telegramId) result.user.participantKey = MINIAPP_fallbackParticipantKey_(telegramId);
  result.backend = 'google-apps-script';
  result.fallbackVersion = MINIAPP_FALLBACK_API_VERSION;
  return result;
}

function MINIAPP_fallbackSnapshot_(e) {
  var auth = MINIAPP_fallbackAuthorize_(e);
  if (!auth.ok) return auth.result;
  var cfg = MINIAPP_mediaConfig_(PropertiesService.getScriptProperties());
  var snapshot = MINIAPP_mediaLoadSnapshot_(cfg);
  return { ok:true, access:true, backend:'google-apps-script', version:MINIAPP_FALLBACK_API_VERSION, snapshot:MINIAPP_fallbackSafeSnapshot_(snapshot) };
}

function MINIAPP_fallbackAvatar_(e) {
  var auth = MINIAPP_fallbackAuthorize_(e);
  if (!auth.ok) return auth.result;
  var fileId = MINIAPP_value_(e && e.parameter && e.parameter.fileId);
  if (!fileId) return MINIAPP_fallbackError_('AVATAR_FILE_ID_MISSING', 'Аватар не указан.');
  var cfg = MINIAPP_mediaConfig_(PropertiesService.getScriptProperties());
  var snapshot = MINIAPP_mediaLoadSnapshot_(cfg);
  var participants = snapshot && Array.isArray(snapshot.participants) ? snapshot.participants : [];
  var allowed = participants.some(function(p) { return String(p && p.chatState || '').trim() === 'В чате' && String(p && p.avatarFileId || '') === fileId; });
  if (!allowed) return MINIAPP_fallbackError_('AVATAR_NOT_ALLOWED', 'Аватар недоступен.');
  var path = 'media/avatars/' + MINIAPP_mediaSha256Hex_(fileId) + '.bin';
  return MINIAPP_fallbackMediaResult_(cfg, path, 'AVATAR_NOT_CACHED', 'Аватар ещё не закэширован.');
}

function MINIAPP_fallbackTeamPhoto_(e) {
  var auth = MINIAPP_fallbackAuthorize_(e);
  if (!auth.ok) return auth.result;
  var teamName = MINIAPP_value_(e && e.parameter && e.parameter.team);
  if (!teamName) return MINIAPP_fallbackError_('TEAM_MISSING', 'Команда не указана.');
  var cfg = MINIAPP_mediaConfig_(PropertiesService.getScriptProperties());
  var snapshot = MINIAPP_mediaLoadSnapshot_(cfg);
  var teams = snapshot && Array.isArray(snapshot.teams) ? snapshot.teams : [];
  var wanted = MINIAPP_fallbackNormalizeTeam_(teamName);
  var exists = teams.some(function(t) { return MINIAPP_fallbackNormalizeTeam_(t && t.name) === wanted; });
  if (!exists) return MINIAPP_fallbackError_('TEAM_NOT_FOUND', 'Команда не найдена.');
  var path = 'media/teams/' + MINIAPP_mediaSha256Hex_(wanted) + '.bin';
  return MINIAPP_fallbackMediaResult_(cfg, path, 'TEAM_PHOTO_NOT_CACHED', 'Фото команды ещё не закэшировано.');
}

function MINIAPP_fallbackAuthorize_(e) {
  var initData = MINIAPP_value_(e && e.parameter && e.parameter.initData);
  if (!initData) return { ok:false, result:MINIAPP_fallbackError_('INIT_DATA_MISSING', 'Откройте приложение из Telegram.') };
  var authEvent = { parameter:{ action:'auth', initData:initData } };
  var result = MINIAPP_buildAuthResult_(authEvent);
  return { ok:!!(result && result.ok && result.access), result:result };
}

function MINIAPP_fallbackSafeSnapshot_(snapshot) {
  snapshot = snapshot || {};
  var sourceParticipants = Array.isArray(snapshot.participants) ? snapshot.participants.filter(function(p){ return String(p && p.chatState || '').trim() === 'В чате'; }) : [];
  var participants = sourceParticipants.map(function(p){ return {
    participantKey:MINIAPP_fallbackParticipantKey_(p && p.telegramId), name:String(p && p.name || ''), telegramName:String(p && p.telegramName || ''), username:String(p && p.username || ''), avatarFileId:String(p && p.avatarFileId || ''), chatState:String(p && p.chatState || ''), memberships:Array.isArray(p && p.memberships) ? p.memberships : [], specnazTrips:Number(p && p.specnazTrips || 0), specnazRank:String(p && p.specnazRank || 'Новичок')
  }; });
  var history = MINIAPP_fallbackSafeHistory_(snapshot.specnazHistory, sourceParticipants);
  return {
    schemaVersion:String(snapshot.schemaVersion || ''), generatedAt:String(snapshot.generatedAt || ''), dataHash:String(snapshot.dataHash || ''), stats:snapshot.stats || {}, participants:participants,
    teams:(Array.isArray(snapshot.teams) ? snapshot.teams : []).map(function(t){ return { key:String(t && t.key || ''), name:String(t && t.name || ''), game:String(t && t.game || ''), games:Array.isArray(t && t.games) ? t.games : [], photoUrl:String(t && t.photoUrl || ''), memberCount:Number(t && t.memberCount || 0), leaderCount:Number(t && t.leaderCount || 0), assistantCount:Number(t && t.assistantCount || 0), playerCount:Number(t && t.playerCount || 0) }; }),
    specnazHistory:history, specnazHistoryVersion:String(snapshot.specnazHistoryVersion || history.version || '')
  };
}

function MINIAPP_fallbackSafeHistory_(history, participants) {
  history = history || {};
  var sections = Array.isArray(history.sections) ? history.sections : [];
  return { version:String(history.version || ''), updatedAt:String(history.updatedAt || ''), sections:sections.map(function(section){ return { title:String(section && section.title || ''), rows:(Array.isArray(section && section.rows) ? section.rows : []).map(function(row){
    var owner = MINIAPP_fallbackResolveHistoryParticipant_(row, participants);
    var entry = { participantKey:owner ? MINIAPP_fallbackParticipantKey_(owner.telegramId) : '', date:String(row && row.date || ''), name:String(row && row.name || ''), team:String(row && row.team || ''), before:String(row && row.before || ''), after:String(row && row.after || ''), added:String(row && row.added || ''), rank:String(row && row.rank || ''), message:String(row && row.message || '') };
    var rich = MINIAPP_fallbackSafeRich_(row && row.messageRich); if (rich.length) entry.messageRich = rich; return entry;
  }) }; }) };
}

function MINIAPP_fallbackResolveHistoryParticipant_(row, participants) {
  var rawId = String(row && row.telegramId || '').trim();
  if (rawId) { var exact = participants.filter(function(p){ return String(p && p.telegramId || '').trim() === rawId; }); return exact.length === 1 ? exact[0] : null; }
  var rawName = String(row && row.name || ''); var usernames = []; var re = /@\s*([A-Za-z0-9_]{3,})/g; var match;
  while ((match = re.exec(rawName)) !== null) { var username = MINIAPP_fallbackIdentityUsername_(match[1]); if (username) usernames.push(username); }
  if (usernames.length) { var userMatches = participants.filter(function(p){ return usernames.indexOf(MINIAPP_fallbackIdentityUsername_(p && p.username)) !== -1; }); if (userMatches.length === 1) return userMatches[0]; if (userMatches.length > 1) return null; }
  var tokens = rawName.split(',').map(MINIAPP_fallbackIdentityText_).filter(function(v){ return !!v; }); if (!tokens.length) return null;
  var candidates = participants.filter(function(p){ return MINIAPP_fallbackParticipantNames_(p).some(function(name){ return tokens.indexOf(name) !== -1; }); }); if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) { var teamText = MINIAPP_fallbackIdentityText_(row && row.team || ''); if (teamText) { var narrowed = candidates.filter(function(p){ return (Array.isArray(p && p.memberships) ? p.memberships : []).some(function(m){ var team = MINIAPP_fallbackIdentityText_(m && m.team || ''); return team && teamText.indexOf(team) !== -1; }); }); if (narrowed.length === 1) return narrowed[0]; } }
  return null;
}

function MINIAPP_fallbackParticipantNames_(p) { var names=[p && p.name,p && p.telegramName].map(MINIAPP_fallbackIdentityText_).filter(function(v){return !!v;}); return names.filter(function(v,i){return names.indexOf(v)===i;}); }
function MINIAPP_fallbackIdentityUsername_(value) { return String(value || '').trim().replace(/^@+\s*/, '').toLocaleLowerCase('ru-RU'); }
function MINIAPP_fallbackIdentityText_(value) { return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU'); }
function MINIAPP_fallbackParticipantKey_(telegramId) { var id=String(telegramId||'').trim(); if(!id)return ''; var secret=MINIAPP_fallbackIdentitySecret_(); var bytes=Utilities.computeHmacSha256Signature('participant:'+id,secret,Utilities.Charset.UTF_8); return 'p_'+Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g,'').slice(0,24); }
function MINIAPP_fallbackIdentitySecret_() { var props=PropertiesService.getScriptProperties(); var secret=String(props.getProperty(MINIAPP_FALLBACK_IDENTITY_SECRET_PROP)||'').trim(); if(secret)return secret; var lock=LockService.getScriptLock(); lock.waitLock(5000); try { secret=String(props.getProperty(MINIAPP_FALLBACK_IDENTITY_SECRET_PROP)||'').trim(); if(!secret){secret=Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,''); props.setProperty(MINIAPP_FALLBACK_IDENTITY_SECRET_PROP,secret);} return secret; } finally { lock.releaseLock(); } }
function MINIAPP_fallbackTelegramIdFromInitData_(initData) { try { var parts=String(initData||'').split('&'); for(var i=0;i<parts.length;i+=1){var pair=parts[i].split('='); if(decodeURIComponent(pair[0]||'')!=='user')continue; var raw=pair.slice(1).join('='); var user=JSON.parse(decodeURIComponent(raw.replace(/\+/g,'%20'))||'{}'); return String(user&&user.id||'').trim();} } catch(_){} return ''; }
function MINIAPP_fallbackSafeRich_(value) { if(!Array.isArray(value))return []; return value.map(function(segment){var text=String(segment&&segment.text||''); var url=MINIAPP_fallbackSafeUrl_(segment&&segment.url); return url?{text:text,url:url}:{text:text};}).filter(function(segment){return !!segment.text;}); }
function MINIAPP_fallbackSafeUrl_(value) { var url=String(value||'').trim(); return /^(https?:\/\/|tg:\/\/)/i.test(url)?url:''; }

function MINIAPP_fallbackMediaResult_(cfg, path, errorCode, errorMessage) {
  var media = MINIAPP_fallbackReadPrivateMedia_(cfg, path);
  if (!media) return MINIAPP_fallbackError_(errorCode, errorMessage);
  return { ok:true, access:true, backend:'google-apps-script', version:MINIAPP_FALLBACK_API_VERSION, mime:media.mime, base64:media.base64 };
}
function MINIAPP_fallbackReadPrivateMedia_(cfg, path) {
  var url='https://api.github.com/repos/'+cfg.repo+'/contents/'+MINIAPP_mediaEncodePath_(path)+'?ref='+encodeURIComponent(cfg.branch);
  var headers=MINIAPP_mediaGithubHeaders_(cfg); headers.Accept='application/vnd.github.raw+json';
  var response=UrlFetchApp.fetch(url,{method:'get',muteHttpExceptions:true,followRedirects:true,headers:headers});
  if(response.getResponseCode()===404)return null; if(response.getResponseCode()!==200)throw new Error('fallback media HTTP '+response.getResponseCode());
  var bytes=response.getBlob().getBytes(); if(!bytes||!bytes.length)return null; return {mime:MINIAPP_fallbackDetectMime_(bytes),base64:Utilities.base64Encode(bytes)};
}
function MINIAPP_fallbackDetectMime_(bytes) {
  function u(i){var n=Number(bytes[i]||0);return n<0?n+256:n;}
  if(bytes.length>=3&&u(0)===0xff&&u(1)===0xd8&&u(2)===0xff)return'image/jpeg';
  if(bytes.length>=8&&u(0)===0x89&&u(1)===0x50&&u(2)===0x4e&&u(3)===0x47)return'image/png';
  if(bytes.length>=6){var sig=String.fromCharCode(u(0),u(1),u(2),u(3),u(4),u(5));if(sig==='GIF87a'||sig==='GIF89a')return'image/gif';}
  if(bytes.length>=12){var riff=String.fromCharCode(u(0),u(1),u(2),u(3));var webp=String.fromCharCode(u(8),u(9),u(10),u(11));if(riff==='RIFF'&&webp==='WEBP')return'image/webp';}
  return'image/jpeg';
}
function MINIAPP_fallbackNormalizeTeam_(value) { return String(value||'').trim().toLowerCase(); }
function MINIAPP_fallbackError_(code,message) { return {ok:false,access:false,error:code,message:message,version:MINIAPP_FALLBACK_API_VERSION}; }
