#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${ROYAL_CRM_PROJECT_DIR:-$HOME/table-chp-1.3}"
REPO="Antonsoloway/Specnaz-mini-app"
RAW="https://raw.githubusercontent.com/${REPO}/main"
EXPECTED_DESC="Таблица ЧП 1.3"
MARKER="20260824-v061-admin-integrity1"
TAG="V061_ADMIN_CONTEXT_INTEGRITY_20260824"
CORE_FILE="01_CORE_MAIN.js"
BOT_MENU_FILE="22_MINIAPP_BOT_APP_MENU.js"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$HOME/royal-crm-backups/v061-admin-integrity-$STAMP"
TMP_ROOT="$(mktemp -d /tmp/royal-v061-admin-integrity.XXXXXX)"
TOKEN="$(python3 -c 'import secrets; print(secrets.token_urlsafe(36))')"
TEMP_PARAM="__royal_v061_admin_integrity_menu_once"
MENU_OK=0

cleanup(){ rm -rf "$TMP_ROOT"; }
trap cleanup EXIT
ok(){ printf '\n✅ %s\n' "$*"; }
info(){ printf '\n=== %s ===\n' "$*"; }
fail(){ printf '\n❌ %s\n' "$*" >&2; exit 1; }

for cmd in clasp python3 node gh git curl; do
  command -v "$cmd" >/dev/null 2>&1 || fail "$cmd не найден"
done
gh auth status >/dev/null 2>&1 || fail "GitHub CLI не авторизован"
[[ -d "$PROJECT_DIR" ]] || fail "Apps Script каталог не найден: $PROJECT_DIR"
[[ -f "$PROJECT_DIR/.clasp.json" ]] || fail ".clasp.json не найден"

info "PATCH FRONTEND: ADMIN CONTEXT + TEAM PHOTO RECOVERY"
FRONT="$TMP_ROOT/frontend"
gh repo clone "$REPO" "$FRONT" -- --depth=1 >/dev/null
python3 - "$FRONT" "$MARKER" <<'PY'
from pathlib import Path
import re,sys
root=Path(sys.argv[1]); marker=sys.argv[2]

module=r'''/* Royal CRM Mini App v0.6.1 — admin context integrity + admin team photo recovery */
(() => {
  'use strict';
  if (String(window.__ROYAL_BUILD__ || '') !== '0.6.1') return;
  if (window.__ROYAL_ADMIN_CONTEXT_INTEGRITY_V061__) return;

  const VERSION = '0.6.1-admin-context-integrity.1';
  const ADMIN_SURFACE = [
    '.royal-admin-screen',
    '.royal-admin-participant-detail',
    '.royal-admin-team-detail-shell',
    '.royal-admin-participant-ranking-shell',
    '.royal-admin-team-ranking-shell',
    '[data-admin-participant="1"]',
    '[data-admin-team="1"]'
  ].join(',');
  const TEAM_TARGET = [
    '[data-admin-participant-team="1"]',
    '[data-admin-route-team="1"]',
    '[data-admin-ranking-team="1"]',
    '.royal-admin-participant-detail .participant-profile-membership'
  ].join(',');
  let press = null;
  let suppressClickUntil = 0;
  let lastRouteKey = '';
  let lastRouteAt = 0;
  const photoUrls = new WeakMap();

  const clean = value => String(value == null ? '' : value).trim();
  function id(value) {
    const match = clean(value).replace(/\.0$/, '').match(/\d{5,20}/);
    return match ? match[0] : '';
  }
  function game(value) {
    const raw = clean(value);
    const low = raw.toLocaleLowerCase('ru-RU');
    if (low === 'рм' || low.includes('royal match')) return 'Royal Match';
    if (low === 'рк' || low.includes('royal kingdom')) return 'Royal Kingdom';
    return raw;
  }
  function adminVisible(origin=null) {
    return !!origin?.closest?.(ADMIN_SURFACE) || !!document.querySelector(ADMIN_SURFACE);
  }
  function stop(event, prevent=true) {
    if (!event) return;
    if (prevent) event.preventDefault();
    event.stopImmediatePropagation();
  }
  function dedupe(key) {
    const now=Date.now();
    if (lastRouteKey === key && now-lastRouteAt < 420) return true;
    lastRouteKey=key; lastRouteAt=now; return false;
  }
  function teamRef(node) {
    if (!node) return null;
    let name=clean(node.dataset?.teamName);
    let teamGame=game(node.dataset?.teamGame);
    if (!name) name=clean(node.querySelector?.('b')?.textContent);
    if (!teamGame) {
      const meta=clean(node.querySelector?.('small')?.textContent);
      const tail=meta.includes('·') ? meta.split('·').pop() : meta;
      teamGame=game(tail);
    }
    return name ? {name,game:teamGame} : null;
  }
  function openAdminTeam(ref,event) {
    if (!ref?.name || !ref?.game || !window.RoyalAdminTeamDetailV0600?.open) return false;
    const key=`team:${ref.game}:${ref.name}`;
    stop(event);
    if (!dedupe(key)) window.RoyalAdminTeamDetailV0600.open(ref.name,ref.game);
    return true;
  }
  function openAdminParticipant(pid,event) {
    pid=id(pid);
    if (!pid || !window.RoyalAdminParticipantDetailV0600?.open) return false;
    const key=`participant:${pid}`;
    stop(event);
    if (!dedupe(key)) window.RoyalAdminParticipantDetailV0600.open(pid);
    return true;
  }
  function explicitTeamTarget(target) {
    return target?.closest?.(TEAM_TARGET) || null;
  }
  function participantTarget(target) {
    const ranking=target?.closest?.('[data-admin-ranking-participant="1"]');
    if (ranking) return id(ranking.dataset.telegramId);
    const member=target?.closest?.('.royal-admin-team-detail-shell .team-member[data-telegram-id]');
    if (member && !target?.closest?.('a,[data-user-menu],.username-link')) return id(member.dataset.telegramId);
    const summary=target?.closest?.('[data-admin-participant="1"] > summary');
    if (summary && !target?.closest?.('button,a,input,select,textarea')) {
      const record=summary.closest('[data-admin-participant="1"]');
      return id(record?.dataset?.adminParticipantId || record?.dataset?.telegramId);
    }
    return '';
  }
  function route(target,event) {
    if (!target || !adminVisible(target)) return false;
    const teamNode=explicitTeamTarget(target);
    if (teamNode) {
      const ref=teamRef(teamNode);
      if (ref?.name && ref?.game) return openAdminTeam(ref,event);
    }
    const pid=participantTarget(target);
    if (pid) return openAdminParticipant(pid,event);
    return false;
  }

  // Own the physical Android tap at window capture, before ordinary document routers.
  window.addEventListener('pointerdown', event => {
    if (!adminVisible(event.target)) { press=null; return; }
    const teamNode=explicitTeamTarget(event.target);
    const pid=participantTarget(event.target);
    if (!teamNode && !pid) { press=null; return; }
    press={
      pointerId:event.pointerId,
      target:teamNode || event.target,
      x:Number(event.clientX||0), y:Number(event.clientY||0), at:Date.now()
    };
    // Do not preventDefault here: preserve scroll cancellation semantics.
    event.stopImmediatePropagation();
  }, true);

  window.addEventListener('pointerup', event => {
    const saved=press; press=null;
    if (!saved || saved.pointerId !== event.pointerId) return;
    const dx=Number(event.clientX||0)-saved.x;
    const dy=Number(event.clientY||0)-saved.y;
    if ((dx*dx+dy*dy)>196 || Date.now()-saved.at>900) { event.stopImmediatePropagation(); return; }
    if (route(event.target,event) || route(saved.target,event)) suppressClickUntil=Date.now()+750;
  }, true);
  window.addEventListener('pointercancel',()=>{press=null;},true);

  window.addEventListener('click', event => {
    if (Date.now() < suppressClickUntil && adminVisible(event.target)) {
      const teamNode=explicitTeamTarget(event.target);
      const pid=participantTarget(event.target);
      if (teamNode || pid) { stop(event); return; }
    }
    route(event.target,event);
  }, true);

  function patchOrdinaryTeamRouter() {
    const host=window.RoyalTeamDetail;
    const ordinary=host?.open;
    if (typeof ordinary !== 'function' || ordinary.__royalAdminContextProtected) return;
    const guarded=function(name,teamGame,...rest) {
      if (adminVisible() && window.RoyalAdminTeamDetailV0600?.open) {
        const ref={name:clean(name),game:game(teamGame)};
        if (ref.name && ref.game) {
          if (!dedupe(`team:${ref.game}:${ref.name}`)) window.RoyalAdminTeamDetailV0600.open(ref.name,ref.game);
          return true;
        }
      }
      return ordinary.call(this,name,teamGame,...rest);
    };
    guarded.__royalAdminContextProtected=true;
    guarded.__royalOrdinaryOpen=ordinary;
    host.open=guarded;
  }

  async function directAdminTeamPhoto(img) {
    if (!img?.isConnected) return false;
    const name=clean(img.dataset.teamName);
    const teamGame=game(img.dataset.teamGame);
    let token=''; let api='';
    try { token=clean(typeof sessionToken !== 'undefined' ? sessionToken : ''); } catch (_) {}
    try { api=clean(typeof API_URL !== 'undefined' ? API_URL : ''); } catch (_) {}
    if (!name || !teamGame || !token || !api) return false;
    const url=new URL(`${api}/admin-team-photo`);
    url.searchParams.set('team',name); url.searchParams.set('game',teamGame);
    const response=await fetch(url.toString(),{
      method:'GET',mode:'cors',cache:'no-store',headers:{Authorization:`Bearer ${token}`}
    });
    if (!response.ok) throw new Error(`ADMIN_TEAM_PHOTO_HTTP_${response.status}`);
    const blob=await response.blob();
    if (!(blob instanceof Blob) || !blob.size || !String(blob.type||'').startsWith('image/')) throw new Error('ADMIN_TEAM_PHOTO_INVALID');
    const objectUrl=URL.createObjectURL(blob);
    const previous=photoUrls.get(img);
    photoUrls.set(img,objectUrl);
    img.addEventListener('load',()=>{
      img.closest('.team-photo-box')?.classList.remove('photo-error');
      if (previous && previous!==objectUrl) { try{URL.revokeObjectURL(previous);}catch(_){} }
    },{once:true});
    img.src=objectUrl;
    return true;
  }

  function recoverPhoto(img) {
    if (!img?.isConnected || img.dataset.v061AdminIntegrityPhoto === VERSION) return;
    img.dataset.v061AdminIntegrityPhoto=VERSION;
    try { window.RoyalTeamPhotoRefreshV061?.refreshVisible?.(); } catch (_) {}
    try { window.RoyalAdminPersistentMediaV0600?.loadTeam?.(img)?.catch?.(()=>{}); } catch (_) {}
    window.setTimeout(async()=>{
      if (!img.isConnected) return;
      const box=img.closest('.team-photo-box');
      if (Number(img.naturalWidth||0)>0 && !box?.classList.contains('photo-error')) return;
      try { await directAdminTeamPhoto(img); }
      catch (_) {
        try { window.RoyalTeamPhotoRefreshV061?.refreshVisible?.(); } catch (_) {}
      }
    },320);
  }
  function recoverVisiblePhotos(root=document) {
    const images=[];
    if (root?.matches?.('.royal-admin-team-detail-shell img.team-photo[data-admin-media-kind="team"]')) images.push(root);
    root?.querySelectorAll?.('.royal-admin-team-detail-shell img.team-photo[data-admin-media-kind="team"]')?.forEach(img=>images.push(img));
    images.forEach(recoverPhoto);
  }

  let scheduled=0;
  function scheduleIntegrity() {
    if (scheduled) return;
    scheduled=window.setTimeout(()=>{
      scheduled=0;
      patchOrdinaryTeamRouter();
      recoverVisiblePhotos(document);
    },0);
  }
  const observer=new MutationObserver(records=>{
    for (const record of records) {
      for (const node of record.addedNodes||[]) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.(ADMIN_SURFACE) || node.querySelector?.(ADMIN_SURFACE) ||
            node.matches?.('.team-photo,[data-admin-participant-team="1"],[data-admin-route-team="1"]') ||
            node.querySelector?.('.team-photo,[data-admin-participant-team="1"],[data-admin-route-team="1"]')) {
          scheduleIntegrity(); return;
        }
      }
    }
  });
  observer.observe(document.body,{childList:true,subtree:true});
  [0,120,450,1200,2500].forEach(delay=>window.setTimeout(scheduleIntegrity,delay));
  window.addEventListener('pageshow',scheduleIntegrity);

  window.__ROYAL_ADMIN_CONTEXT_INTEGRITY_V061__={version:VERSION,recoverPhotos:()=>recoverVisiblePhotos(document)};
})();
'''
(root/'v061-admin-context-integrity.js').write_text(module,encoding='utf-8')

# version loader cache marker
p=root/'version-v0600.js'; s=p.read_text(encoding='utf-8')
s,n=re.subn(r"const CACHE = '[^']+';",f"const CACHE = '{marker}';",s,count=1)
if n!=1: raise SystemExit('[ERROR] version cache anchor missing')
p.write_text(s,encoding='utf-8')

# runtime HTML: bust current v0.6.1 modules and attach invariant layer last.
p=root/'app-v0600.html'; s=p.read_text(encoding='utf-8')
s=re.sub(r'changelog-v0601\.js\?v=[^"<]+',f'changelog-v0601.js?v={marker}',s,count=1)
s=re.sub(r'version-v0600\.js\?v=[^"<]+',f'version-v0600.js?v={marker}',s,count=1)
script=f'  <script src="v061-admin-context-integrity.js?v={marker}"></script>\n'
if 'v061-admin-context-integrity.js' not in s:
    if '</body>' not in s: raise SystemExit('[ERROR] app-v0600 body anchor missing')
    s=s.replace('</body>',script+'</body>',1)
else:
    s=re.sub(r'v061-admin-context-integrity\.js\?v=[^"<]+',f'v061-admin-context-integrity.js?v={marker}',s,count=1)
p.write_text(s,encoding='utf-8')

for name in ('app.html','app-v0601.html'):
    p=root/name; s=p.read_text(encoding='utf-8')
    s,n=re.subn(r"params\.set\('releaseBuild',\s*'[^']+'\);",f"params.set('releaseBuild', '{marker}');",s,count=1)
    if n!=1: raise SystemExit(f'[ERROR] {name} releaseBuild anchor missing')
    p.write_text(s,encoding='utf-8')

# Changelog entries.
p=root/'changelog-v0601.js'; s=p.read_text(encoding='utf-8')
anchor="        'Последующие исправления, которые входят в v0.6.1, будут дописываться в эту карточку истории изменений.'"
items=[
"        'Админ-навигация сделана замкнутой: любой переход участник ↔ команда, а также переходы из админских рейтингов и составов команд остаются в защищённом админ-режиме; ordinary/public router больше не может перехватить такой переход.',",
"        'После переноса кнопки редактирования команды наверх восстановлена загрузка фотографий в админской карточке: при отрисовке выполняется защищённое восстановление team photo, а при необходимости — прямой authenticated refetch без ожидания старого медиакэша.',"
]
if anchor not in s: raise SystemExit('[ERROR] changelog anchor missing')
for item in items:
    if item not in s: s=s.replace(anchor,item+'\n'+anchor,1)
p.write_text(s,encoding='utf-8')
PY

cd "$FRONT"
for f in v061-admin-context-integrity.js version-v0600.js changelog-v0601.js; do node --check "$f"; done
grep -Fq "$MARKER" app.html
grep -Fq "$MARKER" app-v0601.html
grep -Fq "v061-admin-context-integrity.js?v=$MARKER" app-v0600.html
git add v061-admin-context-integrity.js version-v0600.js app-v0600.html app-v0601.html app.html changelog-v0601.js
git diff --check
git config user.name "Royal CRM Release"
git config user.email "royal-crm-sync@users.noreply.github.com"
if ! git diff --cached --quiet; then
  git commit -m "Keep admin navigation private and recover team photos" >/dev/null
  git push origin HEAD:main
fi
ok "Frontend $MARKER pushed"

info "PULL FACTUAL LIVE APPS SCRIPT + BACKUP"
mkdir -p "$BACKUP_DIR"
cd "$PROJECT_DIR"
clasp status
clasp pull
[[ -f "$CORE_FILE" && -f "$BOT_MENU_FILE" ]] || fail "live Apps Script неполный"
cp -p "$CORE_FILE" "$BACKUP_DIR/$CORE_FILE"
cp -p "$BOT_MENU_FILE" "$BACKUP_DIR/$BOT_MENU_FILE"
ok "Backup: $BACKUP_DIR"

info "UPDATE TELEGRAM MENU SOURCE"
python3 - "$BOT_MENU_FILE" "$MARKER" <<'PY'
from pathlib import Path
import re,sys
p=Path(sys.argv[1]); marker=sys.argv[2]
s=p.read_text(encoding='utf-8')
m=re.search(r"var MINIAPP_BOT_APP_MENU_VERSION = '(\d+)\.(\d+)\.(\d+)';",s)
if not m: raise SystemExit('[ERROR] menu version anchor missing')
version=f"{m.group(1)}.{m.group(2)}.{int(m.group(3))+1}"
s=s[:m.start()]+f"var MINIAPP_BOT_APP_MENU_VERSION = '{version}';"+s[m.end():]
s,n=re.subn(r"var appUrl=MINIAPP_BOT_APP_URL\+'\?cb=[^']+';",f"var appUrl=MINIAPP_BOT_APP_URL+'?cb={marker}';",s,count=1)
if n!=1: raise SystemExit('[ERROR] menu cb anchor missing')
p.write_text(s,encoding='utf-8')
PY
node --check "$BOT_MENU_FILE"
grep -Fq "?cb=$MARKER" "$BOT_MENU_FILE" || fail "menu marker missing"

info "SELECT EXISTING DEPLOYMENT ONLY"
DEPLOY_OUTPUT=""
if DEPLOY_OUTPUT="$(clasp list-deployments 2>&1)"; then :
elif DEPLOY_OUTPUT="$(clasp deployments 2>&1)"; then :
else fail "Не удалось получить deployments"; fi
mapfile -t MATCHES < <(printf '%s\n' "$DEPLOY_OUTPUT" | grep -F "$EXPECTED_DESC" || true)
[[ ${#MATCHES[@]} -eq 1 ]] || fail "Найдено ${#MATCHES[@]} deployment '$EXPECTED_DESC'; ожидался 1"
LINE="${MATCHES[0]}"
printf '%s\n' "$LINE" | grep -q '@HEAD' && fail "Стабильный deployment неожиданно @HEAD"
DEPLOY_ID="$(printf '%s\n' "$LINE" | sed -E 's/^[[:space:]]*-[[:space:]]+([^[:space:]]+).*/\1/')"
[[ "$DEPLOY_ID" =~ ^[A-Za-z0-9_-]{20,}$ ]] || fail "deployment ID не распознан"
WEBAPP_URL="https://script.google.com/macros/s/${DEPLOY_ID}/exec"

info "INSERT TEMPORARY TOKENIZED MENU INVOKER"
python3 - "$CORE_FILE" "$TEMP_PARAM" "$TOKEN" <<'PY'
import json,sys
from pathlib import Path
p=Path(sys.argv[1]); param=sys.argv[2]; token=sys.argv[3]
s=p.read_text(encoding='utf-8')
anchor='function doGet(e) {\n'
if s.count(anchor)!=1: raise SystemExit('[ERROR] doGet anchor missing/ambiguous')
block=(
 'function doGet(e) {\n'
 '  // TEMP_V061_ADMIN_INTEGRITY_MENU: removed immediately after verification.\n'
 f'  if (e && e.parameter && String(e.parameter[{json.dumps(param)}] || "") === {json.dumps(token)}) {{\n'
 '    var menuResult = MINIAPP_setupBotAppMenu();\n'
 '    return ContentService.createTextOutput(JSON.stringify(menuResult)).setMimeType(ContentService.MimeType.JSON);\n'
 '  }\n\n'
)
p.write_text(s.replace(anchor,block,1),encoding='utf-8')
PY
node --check "$CORE_FILE"

info "PUSH + UPDATE EXISTING DEPLOYMENT"
if clasp push -f; then :; elif clasp push; then :; else fail "clasp push failed"; fi
if clasp update-deployment "$DEPLOY_ID" --description "$EXPECTED_DESC"; then :
elif clasp create-deployment --deploymentId "$DEPLOY_ID" --description "$EXPECTED_DESC"; then :
elif clasp deploy -i "$DEPLOY_ID" -d "$EXPECTED_DESC"; then :
else fail "existing deployment update failed"; fi

info "WAIT + APPLY/VERIFY TELEGRAM MENU"
sleep 18
for attempt in $(seq 1 30); do
  printf '[INFO] menu verification %02d/30\n' "$attempt"
  BODY="$(curl -sS -L --max-time 40 --get --data-urlencode "$TEMP_PARAM=$TOKEN" "$WEBAPP_URL" || true)"
  if python3 -c '
import json,sys
marker=sys.argv[1]
try: d=json.load(sys.stdin)
except Exception: raise SystemExit(1)
app=str(d.get("appUrl") or "")
menu=str((((d.get("menuButton") or {}).get("web_app") or {}).get("url")) or "")
raise SystemExit(0 if d.get("ok") is True and marker in app and marker in menu else 1)
' "$MARKER" <<<"$BODY"; then
    MENU_OK=1
    ok "Telegram menu confirmed: $MARKER"
    break
  fi
  sleep 5
done

info "REMOVE TEMP ROUTE"
cp -p "$BACKUP_DIR/$CORE_FILE" "$CORE_FILE"
node --check "$CORE_FILE"
if clasp push -f; then :; elif clasp push; then :; else fail "temporary route removal push failed"; fi
if clasp update-deployment "$DEPLOY_ID" --description "$EXPECTED_DESC"; then :
elif clasp create-deployment --deploymentId "$DEPLOY_ID" --description "$EXPECTED_DESC"; then :
elif clasp deploy -i "$DEPLOY_ID" -d "$EXPECTED_DESC"; then :
else fail "deployment update after cleanup failed"; fi
ok "Temporary route removed; existing deployment preserved"

info "SYNC LIVE APPS SCRIPT MIRROR"
bash <(curl -fsSL "$RAW/scripts/sync-live-apps-script-to-github.sh")
[[ "$MENU_OK" == "1" ]] || fail "Telegram menu не успел подтвердить $MARKER; cleanup уже выполнен"

info "UPDATE CURRENT_STATE + WORK_HISTORY + RELEASE_RULES"
DOCS="$TMP_ROOT/docs"
gh repo clone "$REPO" "$DOCS" -- --depth=1 >/dev/null
python3 - "$DOCS/CURRENT_STATE.md" "$DOCS/WORK_HISTORY.md" "$DOCS/RELEASE_RULES.md" "$MARKER" "$TAG" <<'PY'
from pathlib import Path
import sys
state_path,hist_path,rules_path=map(Path,sys.argv[1:4]); marker=sys.argv[4]; tag=sys.argv[5]
state=state_path.read_text(encoding='utf-8')
if tag not in state:
    state += f'''\n\n---\n\n## v0.6.1 admin context integrity — 24.08.2026 [{tag}]\n\n- Periodic screen twitch fix is device-confirmed by the user.\n- Admin navigation invariant strengthened: any participant/team transition originating from admin list/detail/ranking/roster stays on private admin detail pages. Physical Android pointer taps are captured at window level before legacy ordinary routers; ordinary team router also has an admin-context fallback guard.\n- Regression after moving the team edit button upward: admin team photo could remain on castle fallback. `v061-admin-context-integrity.js` now re-arms protected photo loading after admin detail render and performs one authenticated `/admin-team-photo` refetch if the normal media bridge still has no image.\n- Frontend/menu marker = `{marker}`; Telegram menu confirmed. Existing deployment `Таблица ЧП 1.3` preserved, temporary verifier removed, live Apps Script mirror synchronized.\n- Device smoke pending: participant → team → participant navigation must remain admin-only and team photos must load with the edit button at the top.\n'''
    state_path.write_text(state,encoding='utf-8')
hist=hist_path.read_text(encoding='utf-8')
if tag not in hist:
    hist += f'''\n\n---\n\n### 24.08.2026 — admin navigation + team photo regression [{tag}]\n\n- User reported two regressions after admin edit UX: participant team link could open ordinary team detail, and admin team photos could stay on fallback.\n- Added a v0.6.1 admin-context integrity layer that owns pointer/click routing before legacy public handlers and routes participant/team transitions exclusively through `RoyalAdminParticipantDetailV0600` / `RoyalAdminTeamDetailV0600` while an admin surface is active.\n- Added protected team-photo recovery on admin team detail after DOM/button relocation; normal cache bridge is tried first, then a single authenticated direct refetch if necessary.\n- Published cache/menu marker `{marker}`; existing Apps Script deployment retained; live mirror resynced. Device acceptance pending.\n'''
    hist_path.write_text(hist,encoding='utf-8')
rules=rules_path.read_text(encoding='utf-8')
rules_to_add=[
'- Admin context is sticky: a participant/team navigation that originates from any admin list, detail, ranking, roster, or membership pill must open the corresponding protected admin detail; ordinary/public participant or team routers must never win that transition.',
'- Moving admin edit controls must not break protected media. Admin team detail must keep/re-arm authenticated team-photo loading after layout/DOM relocation and may use a bounded direct refetch fallback.'
]
for rule in rules_to_add:
    if rule not in rules:
        rules += '\n'+rule+'\n'
rules_path.write_text(rules,encoding='utf-8')
PY
cd "$DOCS"
git add CURRENT_STATE.md WORK_HISTORY.md RELEASE_RULES.md
git diff --check
git config user.name "Royal CRM Handoff"
git config user.email "royal-crm-sync@users.noreply.github.com"
if ! git diff --cached --quiet; then
  git commit -m "Record v0.6.1 admin context integrity" >/dev/null
  git push origin HEAD:main
fi
ok "Handoff docs updated"

printf '\n============================================================\n'
printf '✅✅✅ v0.6.1 ADMIN CONTEXT INTEGRITY PUBLISHED ✅✅✅\n'
printf 'Telegram menu cache-bust: %s\n' "$MARKER"
printf 'Admin participant/team navigation stays protected\n'
printf 'Admin team photo recovery enabled\n'
printf 'Existing deployment preserved: %s\n' "$EXPECTED_DESC"
printf 'Temporary route removed\n'
printf 'Live Apps Script mirror synced\n'
printf 'CURRENT_STATE + WORK_HISTORY + RELEASE_RULES updated\n'
printf '============================================================\n'
