#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${ROYAL_CRM_PROJECT_DIR:-$HOME/table-chp-1.3}"
REPO="Antonsoloway/Specnaz-mini-app"
RAW="https://raw.githubusercontent.com/${REPO}/main"
EXPECTED_DESC="Таблица ЧП 1.3"
BUILD_MARKER="20260823-v061-history-link2"
MODULE="history-link-reliability-v061-v2.js"
CORE_FILE="01_CORE_MAIN.js"
BOT_MENU_FILE="22_MINIAPP_BOT_APP_MENU.js"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$HOME/royal-crm-backups/v061-history-link2-$STAMP"
TMP_ROOT="$(mktemp -d /tmp/royal-v061-history-link2.XXXXXX)"
TOKEN="$(python3 - <<'PY'
import secrets
print(secrets.token_urlsafe(36))
PY
)"
TEMP_PARAM="__royal_v061_history_link_once"
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
gh auth status >/dev/null 2>&1 || fail "GitHub CLI не авторизован"
[[ -d "$PROJECT_DIR" ]] || fail "Apps Script каталог не найден: $PROJECT_DIR"
[[ -f "$PROJECT_DIR/.clasp.json" ]] || fail ".clasp.json не найден в $PROJECT_DIR"

info "PUBLISH FRONTEND v0.6.1 HISTORY LINK V2"
FRONT_REPO="$TMP_ROOT/front-repo"
gh repo clone "$REPO" "$FRONT_REPO" -- --depth=1 >/dev/null
python3 - "$FRONT_REPO" "$BUILD_MARKER" "$MODULE" <<'PY'
import re, sys
from pathlib import Path
root=Path(sys.argv[1]); marker=sys.argv[2]; module=sys.argv[3]

app=root/'app-v0600.html'
text=app.read_text(encoding='utf-8')
pattern=r'<script src="history-link-reliability-v061(?:-v2)?\.js\?v=[^"]+"></script>'
replacement=f'<script src="{module}?v={marker}"></script>'
text2,count=re.subn(pattern,replacement,text,count=1)
if count==0:
    anchor='<script src="specnaz-v0523.js?v=0.5.59"></script>'
    if anchor not in text:
        raise SystemExit('[ERROR] specnaz script anchor missing')
    text2=text.replace(anchor,anchor+'\n  '+replacement,1)
text2=re.sub(r'<script src="changelog-v0601\.js\?v=[^"]+"></script>',f'<script src="changelog-v0601.js?v={marker}"></script>',text2,count=1)
app.write_text(text2,encoding='utf-8')

for name in ('app-v0601.html','app.html'):
    p=root/name
    s=p.read_text(encoding='utf-8')
    s,n=re.subn(r"params\.set\('releaseBuild',\s*'[^']+'\);",f"params.set('releaseBuild', '{marker}');",s,count=1)
    if n!=1: raise SystemExit(f'[ERROR] releaseBuild anchor missing in {name}')
    p.write_text(s,encoding='utf-8')

ch=root/'changelog-v0601.js'
s=ch.read_text(encoding='utf-8')
entry="        'Исправлены повторные переходы по ссылкам в истории спецназа на Android Telegram: v0.6.1 перехватывает физический touch на window до legacy click-router, выполняет ровно один native Telegram-переход на касание и после возврата сразу разрешает следующий переход без конфликтующих повторных deep-link вызовов.',\n"
if 'физический touch на window' not in s:
    anchor="        'Последующие исправления, которые входят в v0.6.1, будут дописываться в эту карточку истории изменений.'"
    if anchor not in s: raise SystemExit('[ERROR] changelog anchor missing')
    s=s.replace(anchor,entry+anchor,1)
ch.write_text(s,encoding='utf-8')
PY
cd "$FRONT_REPO"
node --check "$MODULE"
node --check changelog-v0601.js
git add app.html app-v0601.html app-v0600.html changelog-v0601.js "$MODULE"
if ! git diff --cached --quiet; then
  git config user.name "Royal CRM Release"
  git config user.email "royal-crm-release@users.noreply.github.com"
  git commit -m "fix v0.6.1 repeated Specnaz history links" >/dev/null
  git push origin HEAD:main
fi
ok "Frontend опубликован с marker $BUILD_MARKER"

mkdir -p "$BACKUP_DIR"
cd "$PROJECT_DIR"
info "PULL FACTUAL LIVE APPS SCRIPT"
clasp status
clasp pull
[[ -f "$CORE_FILE" ]] || fail "$CORE_FILE не найден после clasp pull"
[[ -f "$BOT_MENU_FILE" ]] || fail "$BOT_MENU_FILE не найден после clasp pull"
cp -p "$CORE_FILE" "$BACKUP_DIR/$CORE_FILE"
cp -p "$BOT_MENU_FILE" "$BACKUP_DIR/$BOT_MENU_FILE"
ok "Backup: $BACKUP_DIR"

grep -Fq "function MINIAPP_setupBotAppMenu" "$BOT_MENU_FILE" || fail "MINIAPP_setupBotAppMenu отсутствует"

info "UPDATE TELEGRAM MENU CACHE MARKER"
python3 - "$BOT_MENU_FILE" "$BUILD_MARKER" <<'PY'
import re,sys
from pathlib import Path
p=Path(sys.argv[1]); marker=sys.argv[2]; s=p.read_text(encoding='utf-8')
s,n=re.subn(r"var MINIAPP_BOT_APP_MENU_VERSION = '[^']+';","var MINIAPP_BOT_APP_MENU_VERSION = '1.0.39';",s,count=1)
if n!=1: raise SystemExit('[ERROR] menu version anchor missing')
s,n=re.subn(r"var appUrl=MINIAPP_BOT_APP_URL\+'\?cb=[^']+';",f"var appUrl=MINIAPP_BOT_APP_URL+'?cb={marker}';",s,count=1)
if n!=1: raise SystemExit('[ERROR] menu cache marker anchor missing')
p.write_text(s,encoding='utf-8')
PY
node --check "$BOT_MENU_FILE"
grep -Fq "?cb=$BUILD_MARKER" "$BOT_MENU_FILE" || fail "menu marker missing"

info "SELECT EXISTING DEPLOYMENT ONLY"
DEPLOY_OUTPUT=""
if DEPLOY_OUTPUT="$(clasp list-deployments 2>&1)"; then :
elif DEPLOY_OUTPUT="$(clasp deployments 2>&1)"; then :
else fail "Не удалось получить deployments"; fi
printf '%s\n' "$DEPLOY_OUTPUT"
mapfile -t MATCHES < <(printf '%s\n' "$DEPLOY_OUTPUT" | grep -F "$EXPECTED_DESC" || true)
[[ ${#MATCHES[@]} -eq 1 ]] || fail "Найдено ${#MATCHES[@]} deployment '$EXPECTED_DESC'; ожидался ровно 1"
LINE="${MATCHES[0]}"
printf '%s\n' "$LINE" | grep -q '@HEAD' && fail "Стабильный deployment неожиданно @HEAD"
DEPLOY_ID="$(printf '%s\n' "$LINE" | sed -E 's/^[[:space:]]*-[[:space:]]+([^[:space:]]+).*/\1/')"
[[ "$DEPLOY_ID" =~ ^[A-Za-z0-9_-]{20,}$ ]] || fail "Не удалось извлечь deployment ID"
WEBAPP_URL="https://script.google.com/macros/s/${DEPLOY_ID}/exec"

info "INSERT TEMPORARY ONE-TIME MENU INVOKER"
python3 - "$CORE_FILE" "$TEMP_PARAM" "$TOKEN" <<'PY'
import json,sys
from pathlib import Path
p=Path(sys.argv[1]); param=sys.argv[2]; token=sys.argv[3]; s=p.read_text(encoding='utf-8')
anchor='function doGet(e) {\n'
if s.count(anchor)!=1: raise SystemExit('[ERROR] doGet anchor missing/ambiguous')
block=("function doGet(e) {\n"
       "  // TEMP_V061_HISTORY_LINK_MENU: removed immediately after verification.\n"
       f"  if (e && e.parameter && String(e.parameter[{json.dumps(param)}] || '') === {json.dumps(token)}) {{\n"
       "    var menuResult = MINIAPP_setupBotAppMenu();\n"
       "    return ContentService.createTextOutput(JSON.stringify(menuResult))\n"
       "      .setMimeType(ContentService.MimeType.JSON);\n"
       "  }\n\n")
p.write_text(s.replace(anchor,block,1),encoding='utf-8')
PY
node --check "$CORE_FILE"

info "PUSH TEMP ROUTE + UPDATE EXISTING DEPLOYMENT"
if clasp push -f; then :; elif clasp push; then :; else cp -p "$BACKUP_DIR/$CORE_FILE" "$CORE_FILE"; fail "Temporary push failed"; fi
if clasp update-deployment "$DEPLOY_ID" --description "$EXPECTED_DESC"; then :
elif clasp create-deployment --deploymentId "$DEPLOY_ID" --description "$EXPECTED_DESC"; then :
elif clasp deploy -i "$DEPLOY_ID" -d "$EXPECTED_DESC"; then :
else cp -p "$BACKUP_DIR/$CORE_FILE" "$CORE_FILE"; fail "Temporary deployment update failed"; fi

info "APPLY TELEGRAM MENU + VERIFY"
for attempt in $(seq 1 15); do
  printf '[INFO] Telegram menu verification %s/15\n' "$attempt"
  MENU_BODY="$(curl -sS -L --max-time 35 --get --data-urlencode "$TEMP_PARAM=$TOKEN" "$WEBAPP_URL" || true)"
  if printf '%s' "$MENU_BODY" | python3 -c '
import json,sys
marker=sys.argv[1]
try: d=json.load(sys.stdin)
except Exception: raise SystemExit(1)
app=str(d.get("appUrl") or "")
url=str(((d.get("menuButton") or {}).get("web_app") or {}).get("url") or "")
assert d.get("ok") is True
assert marker in app
assert marker in url
print("[OK] Telegram menu confirms fresh URL")
' "$BUILD_MARKER"; then MENU_OK=1; break; fi
  sleep 3
done

info "REMOVE TEMP ROUTE"
cp -p "$BACKUP_DIR/$CORE_FILE" "$CORE_FILE"
node --check "$CORE_FILE"
if clasp push -f; then :; elif clasp push; then :; else fail "Не удалось удалить temporary route"; fi
if clasp update-deployment "$DEPLOY_ID" --description "$EXPECTED_DESC"; then :
elif clasp create-deployment --deploymentId "$DEPLOY_ID" --description "$EXPECTED_DESC"; then :
elif clasp deploy -i "$DEPLOY_ID" -d "$EXPECTED_DESC"; then :
else fail "Не удалось обновить deployment после удаления temporary route"; fi
ok "Temporary route удалён; deployment '$EXPECTED_DESC' сохранён"

info "SYNC FACTUAL LIVE APPS SCRIPT MIRROR"
bash <(curl -fsSL "$RAW/scripts/sync-live-apps-script-to-github.sh")

info "RECORD CURRENT_STATE + WORK_HISTORY"
DOC_REPO="$TMP_ROOT/docs-repo"
gh repo clone "$REPO" "$DOC_REPO" -- --depth=1 >/dev/null
MENU_STATUS="NOT_CONFIRMED_WITHIN_WINDOW"; [[ "$MENU_OK" == "1" ]] && MENU_STATUS="CONFIRMED"
python3 - "$DOC_REPO/CURRENT_STATE.md" "$DOC_REPO/WORK_HISTORY.md" "$BUILD_MARKER" "$MENU_STATUS" <<'PY'
import sys
from pathlib import Path
state_path=Path(sys.argv[1]); history_path=Path(sys.argv[2]); marker=sys.argv[3]; status=sys.argv[4]
tag='V061_HISTORY_LINK_RELIABILITY2_20260823'
state=state_path.read_text(encoding='utf-8')
state=state.replace('releaseBuild=20260823-v061-snapshot-resilience1',f'releaseBuild={marker}')
state=state.replace('cache marker **`20260823-v061-snapshot-resilience1`**',f'cache marker **`{marker}`**')
if tag not in state:
    state += f'''\n\n---\n\n## v0.6.1 repeated Specnaz history links — 23.08.2026 [{tag}]\n\n- Первый history-link hotfix не принят: device smoke показал, что повторные переходы после возврата из Telegram остаются нестабильными.\n- v2 переносит ownership физического Android touch на `window` capture до legacy document click-router; один tap вызывает ровно один `openTelegramLink`, без таймерного повторного deep-link.\n- Для touch используется отдельный touchstart/touchend guard; generated click подавляется тем же capture-router, а после возврата dedupe автоматически переармируется.\n- Активный frontend/menu marker = `{marker}`; Telegram menu verification = **{status}**.\n- Кнопка `Связаться` без username ранее подтверждена пользователем как работающая после Worker v1.35.0.\n- Production acceptance history-link v2 остаётся device smoke: несколько разных ссылок подряд с возвратом в Mini App.\n'''
state_path.write_text(state,encoding='utf-8')
history=history_path.read_text(encoding='utf-8')
if tag not in history:
    history += f'''\n\n---\n\n### 23.08.2026 — повторные ссылки истории спецназа v2 [{tag}]\n\n**Диагноз:** первая frontend-попытка не прошла device smoke. Старый Specnaz router остаётся document-level click handler, а v1 одновременно использовал pointer/click и delayed повтор `openTelegramLink`, что могло конфликтовать с Telegram chat overlay. Кроме того, frontend-изменение требует нового bot-menu URL, иначе Android WebView может оставить прежний HTML/script cache.\n\n**Исправление:** новый отдельный v0.6.1-модуль получает физический touch на window capture раньше legacy-router, выполняет один native Telegram transition на один tap, не делает timer retry и переармируется после возврата. `app.html`, `app-v0601.html`, runtime script marker и Telegram menu переведены на `{marker}`.\n\n**Rollout:** existing Apps Script deployment `Таблица ЧП 1.3` сохранён; temporary menu invoker удалён; live Apps Script mirror синхронизирован; Telegram menu verification = `{status}`.\n\n**Acceptance:** pending повторный Android Telegram smoke по нескольким history links подряд.\n'''
history_path.write_text(history,encoding='utf-8')
PY
cd "$DOC_REPO"
git add CURRENT_STATE.md WORK_HISTORY.md
git config user.name "Royal CRM Handoff"
git config user.email "royal-crm-sync@users.noreply.github.com"
if ! git diff --cached --quiet; then
  git commit -m "record v0.6.1 history link v2 rollout" >/dev/null
  git push origin HEAD:main
fi
ok "CURRENT_STATE.md + WORK_HISTORY.md updated"

if [[ "$MENU_OK" != "1" ]]; then
  printf '\nПоследний ответ Telegram:\n%s\n' "$MENU_BODY" | head -c 1800 >&2 || true
  fail "Telegram menu не подтвердил $BUILD_MARKER. Temporary route удалён и handoff сохранён."
fi

printf '\n============================================================\n'
printf '✅✅✅ v0.6.1 HISTORY LINK V2 PUBLISHED ✅✅✅\n'
printf 'Telegram menu cache-bust: %s\n' "$BUILD_MARKER"
printf 'Existing deployment preserved: %s\n' "$EXPECTED_DESC"
printf 'Temporary route removed\n'
printf 'Live Apps Script mirror synced\n'
printf 'CURRENT_STATE.md + WORK_HISTORY.md updated\n'
printf '============================================================\n'
