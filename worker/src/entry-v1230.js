import currentWorker from './entry-v1220.js';

const WRAPPER_VERSION = '1.23.2-dev';
const TEAM_MEDIA_PREFIX = 'media/teams/';
const FINAL_WRITE_VERSION = '0.6.0-write.4';
const TEAM_PHOTO_SOURCE_PREFIX = 'ROYAL_CRM_TEAM_PHOTO_SOURCE_V1';
const TEAM_PHOTO_MAX_FUTURE_SEC = 20 * 60;
const TEAM_PHOTO_CLOCK_SKEW_SEC = 30;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/health' && request.method === 'GET') {
      const base = await currentWorker.fetch(request, env, ctx);
      const headers = new Headers(base.headers);
      headers.set('Content-Type', 'application/json; charset=utf-8');
      headers.set('Cache-Control', 'no-store');
      headers.delete('Content-Length');
      headers.delete('ETag');
      return new Response(JSON.stringify({
        ok: true,
        service: 'royal-crm-miniapp-api',
        version: WRAPPER_VERSION,
        adminWrite: 'worker-signed-hmac-final-write4',
        teamPhotoBridge: 'expiring-hmac-private-github'
      }), { status: 200, headers });
    }

    // Keep v0.6 edit controls disabled until the private admin snapshot proves
    // the FINAL Apps Script backend + team photo capability are both live.
    if (url.pathname === '/admin-data' && request.method === 'GET') {
      return handleFinalAdminData(request, env, ctx);
    }

    // Google Sheets CellImage cannot attach the Mini App bearer session.
    // Apps Script therefore gives it a short-lived URL signed with the same
    // server secret used by the Worker->Apps Script write transport.
    if (url.pathname === '/team-photo-source' && request.method === 'GET') {
      return handleSignedTeamPhotoSource(env, url);
    }

    return currentWorker.fetch(request, env, ctx);
  }
};

async function handleFinalAdminData(request, env, ctx) {
  const base = await currentWorker.fetch(request, env, ctx);
  if (!base.ok) return base;

  let data;
  try { data = await base.clone().json(); }
  catch { return base; }
  if (!data?.ok || !data?.adminData) return base;

  const write = data.adminData.write || {};
  const teamPhoto = write.teamPhoto || {};
  const operations = Array.isArray(write.operations) ? write.operations : [];
  const ready = Boolean(
    data.permissions?.isAdmin === true &&
    write.enabled === true &&
    write.version === FINAL_WRITE_VERSION &&
    write.transport === 'worker-signed-hmac' &&
    write.deleteEnabled === false &&
    teamPhoto.enabled === true &&
    Number(teamPhoto.maxUploadBytes || 0) >= 500000 &&
    operations.includes('updateParticipant') &&
    operations.includes('createParticipant') &&
    operations.includes('updateTeam') &&
    operations.includes('createTeam')
  );

  data.version = WRAPPER_VERSION;
  data.permissions = {
    ...(data.permissions || {}),
    canEdit: ready,
    phase: ready ? 'write-preview-final' : 'read-only-waiting-write4'
  };

  const headers = new Headers(base.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.delete('Content-Length');
  headers.delete('ETag');
  return new Response(JSON.stringify(data), { status:200, headers });
}

async function handleSignedTeamPhotoSource(env, url) {
  const key = String(url.searchParams.get('key') || '').trim().toLowerCase();
  const version = String(url.searchParams.get('v') || '').trim().toLowerCase();
  const expiresText = String(url.searchParams.get('exp') || '').trim();
  const signature = String(url.searchParams.get('sig') || '').trim().toLowerCase();

  if (!/^[0-9a-f]{64}$/.test(key) ||
      !/^[0-9a-f]{64}$/.test(version) ||
      !/^\d{10,13}$/.test(expiresText) ||
      !/^[0-9a-f]{64}$/.test(signature)) {
    return sourceError('Not found',404);
  }

  const now = Math.floor(Date.now()/1000);
  const expires = Number(expiresText);
  if (!Number.isFinite(expires) ||
      expires < now - TEAM_PHOTO_CLOCK_SKEW_SEC ||
      expires > now + TEAM_PHOTO_MAX_FUTURE_SEC) {
    return sourceError('Expired',403);
  }

  const botToken = String(env.BOT_TOKEN || '').trim();
  if (!botToken) return sourceError('Unavailable',503);

  const canonical = [
    TEAM_PHOTO_SOURCE_PREFIX,
    key,
    version,
    expiresText
  ].join('\n');
  const expected = await hmacSha256Hex(botToken,canonical);
  if (!constantTimeEqual(expected,signature)) {
    return sourceError('Forbidden',403);
  }

  const repo = String(env.DATA_REPO || '').trim();
  const branch = String(env.DATA_BRANCH || 'main').trim();
  const token = String(env.GITHUB_TOKEN || '').trim();
  if (!repo || !token) return sourceError('Unavailable',503);

  const path = `${TEAM_MEDIA_PREFIX}${key}.bin`;
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  let github;
  try {
    github = await fetch(
      `https://api.github.com/repos/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`,
      {
        method:'GET',
        headers:{
          Authorization:`Bearer ${token}`,
          Accept:'application/vnd.github.raw+json',
          'X-GitHub-Api-Version':'2022-11-28',
          'User-Agent':'Royal-CRM-Team-Photo-Source'
        },
        cache:'no-store'
      }
    );
  } catch (error) {
    console.warn('signed team photo GitHub fetch failed',error?.message || 'unknown');
    return sourceError('Unavailable',502);
  }

  if (github.status === 404) return sourceError('Not found',404);
  if (!github.ok) return sourceError('Unavailable',502);

  const bytes = new Uint8Array(await github.arrayBuffer());
  if (!bytes.length || bytes.length > 8*1024*1024) return sourceError('Invalid image',415);
  const contentHash = await sha256Hex(bytes);
  if (!constantTimeEqual(contentHash,version)) return sourceError('Version mismatch',409);
  const contentType = detectImageType(bytes);
  if (!contentType) return sourceError('Invalid image',415);

  const headers = new Headers();
  headers.set('Content-Type',contentType);
  headers.set('Cache-Control','no-store');
  headers.set('X-Content-Type-Options','nosniff');
  headers.set('Cross-Origin-Resource-Policy','cross-origin');
  return new Response(bytes,{status:200,headers});
}

function sourceError(text,status) {
  return new Response(text,{
    status,
    headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
  });
}

async function hmacSha256Hex(secret,text) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(secret || '')),
    {name:'HMAC',hash:'SHA-256'},
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(String(text || ''))
  );
  return bytesToHex(new Uint8Array(signature));
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256',bytes);
  return bytesToHex(new Uint8Array(digest));
}

function bytesToHex(bytes) {
  return [...bytes].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

function constantTimeEqual(a,b) {
  a=String(a || '');
  b=String(b || '');
  if (a.length !== b.length) return false;
  let diff=0;
  for (let i=0;i<a.length;i+=1) diff |= a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}

function detectImageType(bytes) {
  if (bytes.length>=3 && bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff) return 'image/jpeg';
  if (bytes.length>=8 && bytes[0]===0x89 && bytes[1]===0x50 && bytes[2]===0x4e && bytes[3]===0x47 && bytes[4]===0x0d && bytes[5]===0x0a && bytes[6]===0x1a && bytes[7]===0x0a) return 'image/png';
  if (bytes.length>=6) {
    const signature=String.fromCharCode(...bytes.subarray(0,6));
    if (signature==='GIF87a' || signature==='GIF89a') return 'image/gif';
  }
  if (bytes.length>=12) {
    const riff=String.fromCharCode(...bytes.subarray(0,4));
    const webp=String.fromCharCode(...bytes.subarray(8,12));
    if (riff==='RIFF' && webp==='WEBP') return 'image/webp';
  }
  return '';
}
