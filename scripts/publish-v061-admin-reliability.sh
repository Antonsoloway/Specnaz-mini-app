#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${ROYAL_CRM_PROJECT_DIR:-$HOME/table-chp-1.3}"
REPO="Antonsoloway/Specnaz-mini-app"
RAW="https://raw.githubusercontent.com/${REPO}/main"
EXPECTED_DESC="Таблица ЧП 1.3"
MARKER="20260824-v061-admin-reliability1"
TAG="V061_ADMIN_RELIABILITY_20260824"
CORE_FILE="01_CORE_MAIN.js"
BOT_MENU_FILE="22_MINIAPP_BOT_APP_MENU.js"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$HOME/royal-crm-backups/v061-admin-reliability-$STAMP"
TMP_ROOT="$(mktemp -d /tmp/royal-v061-admin-reliability.XXXXXX)"
TOKEN="$(python3 -c 'import secrets; print(secrets.token_urlsafe(36))')"
TEMP_PARAM="__royal_v061_admin_reliability_menu_once"
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

info "PATCH + VALIDATE FRONTEND BEFORE PRODUCTION"
FRONT="$TMP_ROOT/frontend"
gh repo clone "$REPO" "$FRONT" -- --depth=1 >/dev/null
python3 - "$FRONT" "$MARKER" <<'PY'
from pathlib import Path
import re,sys
root=Path(sys.argv[1]); marker=sys.argv[2]

module=root/'admin-reliability-v061.js'
if not module.exists(): raise SystemExit('[ERROR] admin-reliability-v061.js missing')

p=root/'version-v0600.js'; s=p.read_text(encoding='utf-8')
s,n=re.subn(r"const CACHE = '[^']+';", f"const CACHE = '{marker}';", s, count=1)
if n!=1: raise SystemExit('[ERROR] version cache anchor missing')
p.write_text(s,encoding='utf-8')

p=root/'app-v0600.html'; s=p.read_text(encoding='utf-8')
s=re.sub(r'changelog-v0601\.js\?v=[^"<]+', f'changelog-v0601.js?v={marker}', s, count=1)
s=re.sub(r'version-v0600\.js\?v=[^"<]+', f'version-v0600.js?v={marker}', s, count=1)
s=re.sub(r'admin-team-stability-v061\.js\?v=[^"<]+', f'admin-team-stability-v061.js?v={marker}', s, count=1)
script=f'  <script src="admin-reliability-v061.js?v={marker}"></script>\n'
if 'admin-reliability-v061.js' not in s:
    if '</body>' not in s: raise SystemExit('[ERROR] app-v0600 body anchor missing')
    s=s.replace('</body>',script+'</body>',1)
else:
    s=re.sub(r'admin-reliability-v061\.js\?v=[^"<]+',f'admin-reliability-v061.js?v={marker}',s,count=1)
p.write_text(s,encoding='utf-8')

for name in ('app.html','app-v0601.html'):
    p=root/name; s=p.read_text(encoding='utf-8')
    s,n=re.subn(r"params\.set\('releaseBuild',\s*'[^']+'\);",f"params.set('releaseBuild', '{marker}');",s,count=1)
    if n!=1: raise SystemExit(f'[ERROR] {name} releaseBuild anchor missing')
    p.write_text(s,encoding='utf-8')

p=root/'changelog-v0601.js'; s=p.read_text(encoding='utf-8')
anchor="        'Последующие исправления, которые входят в v0.6.1, будут дописываться в эту карточку истории изменений.'"
items=[
    "        'Загрузка скринов/фото команд в админ-режиме переведена на ограниченную очередь: одновременно выполняются только несколько защищённых запросов, одинаковые запросы объединяются, а приоритет получают карточки около текущего экрана. Массовый запрос всех команд больше не должен перегружать admin-media путь и оставлять часть карточек с замком.',",
    "        'Сохранение в админ-режиме стало устойчивее к кратковременным сетевым сбоям и HTTP 408/425/429/502/503/504: запрос безопасно повторяется с тем же requestId, поэтому потерянный ответ не приводит к повторной мутации.',",
    "        'Значок активной команды («крот») в админской карточке команды теперь обновляется сразу после асинхронной отрисовки страницы, без дополнительного тапа по экрану.',",
]
if anchor not in s: raise SystemExit('[ERROR] changelog anchor missing')
missing=[item for item in items if item not in s]
if missing: s=s.replace(anchor,'\n'.join(missing)+'\n'+anchor,1)
p.write_text(s,encoding='utf-8')
PY

cd "$FRONT"
node --check admin-reliability-v061.js
node --check admin-team-stability-v061.js
node --check version-v0600.js
node --check changelog-v0601.js
grep -Fq "admin-reliability-v061.js?v=$MARKER" app-v0600.html
grep -Fq "version-v0600.js?v=$MARKER" app-v0600.html
grep -Fq "$MARKER" app.html
grep -Fq "$MARKER" app-v0601.html
git add admin-reliability-v061.js version-v0600.js app-v0600.html app-v0601.html app.html changelog-v0601.js
git diff --check
git config user.name "Royal CRM Release"
git config user.email "royal-crm-sync@users.noreply.github.com"
if ! git diff --cached --quiet; then
  git commit -m "Harden v0.6.1 admin media and write reliability" >/dev/null
  git push origin HEAD:main
fi
ok "Frontend $MARKER published and syntax-checked"

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
 '  // TEMP_V061_ADMIN_RELIABILITY_MENU: removed immediately after verification.\n'
 f'  if (e && e.parameter && String(e.parameter[{json.dumps(param)}] || "") === {json.dumps(token)}) {{\n'
 '    var menuResult = MINIAPP_setupBotAppMenu();\n'
 '    return ContentService.createTextOutput(JSON.stringify(menuResult)).setMimeType(ContentService.MimeType.JSON);\n'
 '  }\n\n'
)
p.write_text(s.replace(anchor,block,1),encoding='utf-8')
PY
node --check "$CORE_FILE"

update_deployment(){
  if clasp update-deployment "$DEPLOY_ID" --description "$EXPECTED_DESC"; then return 0; fi
  if clasp create-deployment --deploymentId "$DEPLOY_ID" --description "$EXPECTED_DESC"; then return 0; fi
  clasp deploy -i "$DEPLOY_ID" -d "$EXPECTED_DESC"
}

info "PUSH + UPDATE EXISTING DEPLOYMENT"
if clasp push -f; then :; elif clasp push; then :; else fail "clasp push failed"; fi
update_deployment || fail "existing deployment update failed"

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
update_deployment || fail "deployment update after cleanup failed"
ok "Temporary route removed; existing deployment preserved"

info "SYNC LIVE APPS SCRIPT MIRROR"
bash <(curl -fsSL "$RAW/scripts/sync-live-apps-script-to-github.sh")
[[ "$MENU_OK" == "1" ]] || fail "Telegram menu не успел подтвердить $MARKER; cleanup уже выполнен"

info "UPDATE HANDOFF DOCS"
DOCS="$TMP_ROOT/docs"
gh repo clone "$REPO" "$DOCS" -- --depth=1 >/dev/null
python3 - "$DOCS" "$MARKER" "$TAG" <<'PY'
from pathlib import Path
import sys
root=Path(sys.argv[1]); marker=sys.argv[2]; tag=sys.argv[3]

state=root/'CURRENT_STATE.md'; text=state.read_text(encoding='utf-8')
if tag not in text:
    text += f'''\n\n---\n\n## v0.6.1 admin reliability — 24.08.2026 [{tag}]\n\n- Device reports combined: many admin team screenshots remained on castle fallback, active-team indicator appeared only after a second tap, and admin save could end in `Failed to fetch` after its single transport retry.\n- `admin-reliability-v061.js` now gates `/admin-team-photo` to 3 concurrent requests, coalesces identical requests and dynamically prioritizes team images near the viewport/admin detail. Far-offscreen requests wait instead of flooding the protected admin-data/media chain. Read-only photo requests also get bounded transient retries.\n- Visible admin team images are explicitly re-armed through the existing protected media loader, so a failed first render no longer requires a tap to retry.\n- `/admin-write` transport/edge failures use bounded retries for network plus HTTP 408/425/429/502/503/504. The exact body and requestId are reused, preserving write idempotency and avoiding duplicate mutations.\n- After async admin team detail render, `RoyalActiveTeams.refresh()` is called immediately and once more after a short settle delay, so the active-team mole is present without an extra tap.\n- Frontend/menu marker = `{marker}`; existing deployment `Таблица ЧП 1.3` preserved; temporary verifier removed; live Apps Script mirror synchronized.\n- Device acceptance pending: scroll through team list and verify screenshots load as they approach viewport; open an active team and see mole immediately; perform repeated admin saves without `Failed to fetch`.\n'''
    state.write_text(text,encoding='utf-8')

hist=root/'WORK_HISTORY.md'; text=hist.read_text(encoding='utf-8')
if tag not in text:
    text += f'''\n\n---\n\n### 24.08.2026 — admin media/write/active-team reliability [{tag}]\n\n- Investigated three device issues together because they share async/render/network timing in admin mode.\n- Root media issue: multiple v0.6.1 compatibility layers could request every admin team image at once while `/admin-team-photo` itself performs protected admin authorization and private media reads. Some images therefore lost the first race and only retried after another UI interaction. Added bounded/coalesced viewport-priority queue and protected visible-image rearm.\n- Root write symptom: current write client had only one true transport retry; the video showed that retry message followed by `Failed to fetch`. Added additional same-requestId transport/edge retries without changing server mutation semantics.\n- Root mole symptom: legacy active-team decorator wrapped ordinary synchronous team rendering, but admin team detail renders asynchronously. Added explicit post-render refresh for admin detail.\n- Published marker `{marker}` through the existing Telegram/Apps Script deployment only.\n'''
    hist.write_text(text,encoding='utf-8')

rules=root/'RELEASE_RULES.md'; text=rules.read_text(encoding='utf-8')
rules_to_add=[
    '- Admin team media loading must be bounded and viewport-prioritized. Never fan out protected `/admin-team-photo` requests for the whole team directory at once; identical requests should be coalesced.',
    '- Admin write transport retries must reuse the exact same requestId/body. Transient network and 408/425/429/502/503/504 failures may be retried; permanent auth/validation/conflict responses must not be replayed as new mutations.',
    '- Active-team decoration must run after asynchronous admin team detail rendering; the active-team indicator must not depend on a later tap/input event.'
]
for rule in rules_to_add:
    if rule not in text: text += '\n'+rule+'\n'
rules.write_text(text,encoding='utf-8')
PY
cd "$DOCS"
node --check changelog-v0601.js
git add CURRENT_STATE.md WORK_HISTORY.md RELEASE_RULES.md
git diff --check
git config user.name "Royal CRM Handoff"
git config user.email "royal-crm-sync@users.noreply.github.com"
if ! git diff --cached --quiet; then
  git commit -m "Record v0.6.1 admin reliability" >/dev/null
  git push origin HEAD:main
fi
ok "CURRENT_STATE + WORK_HISTORY + RELEASE_RULES updated"

printf '\n============================================================\n'
printf '✅✅✅ v0.6.1 ADMIN RELIABILITY PUBLISHED ✅✅✅\n'
printf 'Admin team media: bounded + viewport-priority + retries\n'
printf 'Admin writes: same-requestId transient retries\n'
printf 'Active-team mole: immediate post-render refresh\n'
printf 'Telegram menu cache-bust: %s\n' "$MARKER"
printf 'Existing deployment preserved: %s\n' "$EXPECTED_DESC"
printf '============================================================\n'