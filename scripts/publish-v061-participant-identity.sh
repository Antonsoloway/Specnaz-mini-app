#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${ROYAL_CRM_PROJECT_DIR:-$HOME/table-chp-1.3}"
REPO="Antonsoloway/Specnaz-mini-app"
RAW="https://raw.githubusercontent.com/${REPO}/main"
EXPECTED_DESC="Таблица ЧП 1.3"
BUILD_MARKER="20260823-v061-identity2"
CORE_FILE="01_CORE_MAIN.js"
BOT_MENU_FILE="22_MINIAPP_BOT_APP_MENU.js"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$HOME/royal-crm-backups/v061-participant-identity-$STAMP"
TMP_ROOT="$(mktemp -d /tmp/royal-v061-identity.XXXXXX)"
TOKEN="$(python3 - <<'PY'
import secrets
print(secrets.token_urlsafe(36))
PY
)"
TEMP_PARAM="__royal_v061_identity_once"
MENU_OK=0
MENU_BODY=""

cleanup(){ rm -rf "$TMP_ROOT"; }
trap cleanup EXIT
ok(){ printf '\n✅ %s\n' "$*"; }
info(){ printf '\n=== %s ===\n' "$*"; }
fail(){ printf '\n❌ %s\n' "$*" >&2; exit 1; }

for cmd in clasp python3 node gh git curl; do
  command -v "$cmd" >/dev/null 2>&1 || fail "$cmd не найден"
done
[[ -d "$PROJECT_DIR" ]] || fail "Apps Script каталог не найден: $PROJECT_DIR"
[[ -f "$PROJECT_DIR/.clasp.json" ]] || fail ".clasp.json не найден"
gh auth status >/dev/null 2>&1 || fail "GitHub CLI не авторизован"

mkdir -p "$BACKUP_DIR"
cd "$PROJECT_DIR"

info "PULL FACTUAL LIVE APPS SCRIPT"
clasp status
clasp pull
[[ -f "$CORE_FILE" && -f "$BOT_MENU_FILE" ]] || fail "live Apps Script неполный"
cp -p "$CORE_FILE" "$BACKUP_DIR/$CORE_FILE"
cp -p "$BOT_MENU_FILE" "$BACKUP_DIR/$BOT_MENU_FILE"
ok "Backup: $BACKUP_DIR"

info "UPDATE TELEGRAM MENU CACHE MARKER"
python3 - "$BOT_MENU_FILE" "$BUILD_MARKER" <<'PY'
import re,sys
from pathlib import Path
path=Path(sys.argv[1]); marker=sys.argv[2]
text=path.read_text(encoding='utf-8')
text,n=re.subn(r"var MINIAPP_BOT_APP_MENU_VERSION = '[^']+';","var MINIAPP_BOT_APP_MENU_VERSION = '1.0.39';",text,count=1)
if n != 1: raise SystemExit('[ERROR] menu version anchor missing')
text,n=re.subn(r"var appUrl=MINIAPP_BOT_APP_URL\+'\?cb=[^']+';",f"var appUrl=MINIAPP_BOT_APP_URL+'?cb={marker}';",text,count=1)
if n != 1: raise SystemExit('[ERROR] menu marker anchor missing')
path.write_text(text,encoding='utf-8')
PY
node --check "$BOT_MENU_FILE"
grep -Fq "?cb=$BUILD_MARKER" "$BOT_MENU_FILE" || fail "new menu marker missing"

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
path=Path(sys.argv[1]); param=sys.argv[2]; token=sys.argv[3]
text=path.read_text(encoding='utf-8')
anchor='function doGet(e) {\n'
if text.count(anchor) != 1: raise SystemExit('[ERROR] doGet anchor missing/ambiguous')
block=(
  'function doGet(e) {\n'
  '  // TEMP_V061_IDENTITY_MENU: removed immediately after verification.\n'
  f'  if (e && e.parameter && String(e.parameter[{json.dumps(param)}] || "") === {json.dumps(token)}) {{\n'
  '    var menuResult = MINIAPP_setupBotAppMenu();\n'
  '    return ContentService.createTextOutput(JSON.stringify(menuResult)).setMimeType(ContentService.MimeType.JSON);\n'
  '  }\n\n'
)
path.write_text(text.replace(anchor,block,1),encoding='utf-8')
PY
node --check "$CORE_FILE"

info "PUSH + UPDATE EXISTING DEPLOYMENT"
if clasp push -f; then :; elif clasp push; then :; else fail "clasp push failed"; fi
if clasp update-deployment "$DEPLOY_ID" --description "$EXPECTED_DESC"; then :
elif clasp create-deployment --deploymentId "$DEPLOY_ID" --description "$EXPECTED_DESC"; then :
elif clasp deploy -i "$DEPLOY_ID" -d "$EXPECTED_DESC"; then :
else fail "existing deployment update failed"; fi

info "APPLY + VERIFY TELEGRAM MENU"
for attempt in $(seq 1 15); do
  printf '[INFO] menu verification %s/15\n' "$attempt"
  MENU_BODY="$(curl -sS -L --max-time 35 --get --data-urlencode "$TEMP_PARAM=$TOKEN" "$WEBAPP_URL" || true)"
  if printf '%s' "$MENU_BODY" | python3 -c '
import json,sys
marker=sys.argv[1]
try: d=json.load(sys.stdin)
except Exception: raise SystemExit(1)
app=str(d.get("appUrl") or "")
url=str(((d.get("menuButton") or {}).get("web_app") or {}).get("url") or "")
assert d.get("ok") is True and marker in app and marker in url
' "$BUILD_MARKER"; then
    MENU_OK=1
    break
  fi
  sleep 3
done

info "REMOVE TEMP ROUTE, KEEP NEW MENU SOURCE"
cp -p "$BACKUP_DIR/$CORE_FILE" "$CORE_FILE"
node --check "$CORE_FILE"
if clasp push -f; then :; elif clasp push; then :; else fail "temporary route removal push failed"; fi
if clasp update-deployment "$DEPLOY_ID" --description "$EXPECTED_DESC"; then :
elif clasp create-deployment --deploymentId "$DEPLOY_ID" --description "$EXPECTED_DESC"; then :
elif clasp deploy -i "$DEPLOY_ID" -d "$EXPECTED_DESC"; then :
else fail "deployment update after cleanup failed"; fi
ok "Temporary route removed; '$EXPECTED_DESC' preserved"

info "SYNC FACTUAL LIVE APPS SCRIPT MIRROR"
bash <(curl -fsSL "$RAW/scripts/sync-live-apps-script-to-github.sh")

info "UPDATE CURRENT_STATE + WORK_HISTORY"
DOC_REPO="$TMP_ROOT/docs-repo"
gh repo clone "$REPO" "$DOC_REPO" -- --depth=1 >/dev/null
MENU_STATUS="NOT_CONFIRMED_WITHIN_WINDOW"
[[ "$MENU_OK" == "1" ]] && MENU_STATUS="CONFIRMED"
python3 - "$DOC_REPO/CURRENT_STATE.md" "$DOC_REPO/WORK_HISTORY.md" "$BUILD_MARKER" "$MENU_STATUS" <<'PY'
import sys
from pathlib import Path
state_path=Path(sys.argv[1]); hist_path=Path(sys.argv[2]); marker=sys.argv[3]; status=sys.argv[4]
tag='V061_PARTICIPANT_IDENTITY_20260823'
state=state_path.read_text(encoding='utf-8')
if tag not in state:
    state += f'''\n\n---\n\n## v0.6.1 participant identity consistency — 23.08.2026 [{tag}]\n\n- Добавлен `participant-identity-v061-v2.js` = `0.6.1-participant-identity.2`.\n- Во всех participant surfaces v0.6.1 унифицирована видимая identity: **CRM name → кликабельный @username (если есть) → Telegram display name**.\n- Покрыты ordinary participant list, team members, self/profile detail, Specnaz hero/history, directory cards, admin participant list/detail, admin team members и admin participant rankings.\n- В ordinary UI raw Telegram ID визуально не раскрывается; admin detail сохраняет ID как защищённое admin-only поле.\n- Узкие карточки получили перенос CRM-name и меньший reserved rank strip, чтобы identity не перекрывалась значками звания/ачивок.\n- Rollback v0.5.59 не изменён: новый модуль исполняется только при `__ROYAL_BUILD__ === '0.6.1'`.\n- Release/cache marker = `{marker}`; Telegram menu verification = **{status}**.\n- Device smoke всех основных participant surfaces остаётся acceptance check пользователя.\n'''
    state_path.write_text(state,encoding='utf-8')
hist=hist_path.read_text(encoding='utf-8')
if tag not in hist:
    hist += f'''\n\n---\n\n### 23.08.2026 — единая карточка участника во всём v0.6.1 [{tag}]\n\n**Запрос:** на всех страницах приложения, включая админ-режим, показывать CRM-имя, имя Telegram и Telegram @username/ссылку при наличии.\n\n**Выполнено:**\n- создан v0.6.1-only identity decorator без изменения legacy v0.5.59 renderers;\n- identity достраивается из public snapshot и, для admin-only записей, из cached protected admin snapshot;\n- существующие @username стали единым независимым Telegram action; при наличии реального @username fallback `Связаться` не дублируется;\n- admin list/detail/team member/ranking дополнены теми же identity fields; raw ID остаётся только в admin detail;\n- CSS не даёт rank/achievement strip перекрывать имя на узких Android экранах;\n- `app.html` → `app-v0601.html` → `app-v0600.html` переведены на `{marker}`; Telegram menu verification = `{status}`;\n- changelog v0.6.1 дополнен.\n'''
    hist_path.write_text(hist,encoding='utf-8')
PY
cd "$DOC_REPO"
git add CURRENT_STATE.md WORK_HISTORY.md
if ! git diff --cached --quiet; then
  git config user.name "Royal CRM Handoff"
  git config user.email "royal-crm-sync@users.noreply.github.com"
  git commit -m "Record v0.6.1 participant identity consistency" >/dev/null
  git push origin HEAD:main
fi
ok "CURRENT_STATE.md + WORK_HISTORY.md updated"

if [[ "$MENU_OK" != "1" ]]; then
  printf '\nLast menu response:\n%s\n' "$MENU_BODY" | head -c 1800 >&2 || true
  fail "Telegram menu did not confirm $BUILD_MARKER; cleanup + handoff already completed"
fi

printf '\n============================================================\n'
printf '✅✅✅ v0.6.1 PARTICIPANT IDENTITY READY ✅✅✅\n'
printf 'Telegram menu cache-bust: %s\n' "$BUILD_MARKER"
printf 'Existing deployment preserved: %s\n' "$EXPECTED_DESC"
printf 'Live Apps Script mirror synced\n'
printf 'CURRENT_STATE.md + WORK_HISTORY.md updated\n'
printf '============================================================\n'
