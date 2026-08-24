#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${ROYAL_CRM_PROJECT_DIR:-$HOME/table-chp-1.3}"
REPO="Antonsoloway/Specnaz-mini-app"
RAW="https://raw.githubusercontent.com/${REPO}/main"
EXPECTED_DESC="Таблица ЧП 1.3"
MARKER="20260824-v061-admin-ui-controls1"
TAG="V061_ADMIN_UI_CONTROLS_20260824"
CORE_FILE="01_CORE_MAIN.js"
BOT_MENU_FILE="22_MINIAPP_BOT_APP_MENU.js"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$HOME/royal-crm-backups/v061-admin-ui-controls-$STAMP"
TMP_ROOT="$(mktemp -d /tmp/royal-v061-admin-ui-controls.XXXXXX)"
TOKEN="$(python3 -c 'import secrets; print(secrets.token_urlsafe(36))')"
TEMP_PARAM="__royal_v061_admin_ui_controls_menu_once"
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

info "VERIFY FRONTEND BUILD"
CHECK="$TMP_ROOT/check"
gh repo clone "$REPO" "$CHECK" -- --depth=1 >/dev/null
cd "$CHECK"
node --check admin-ui-controls-v061.js
grep -Fq "admin-ui-controls-v061.js?v=$MARKER" app-v0600.html || fail "admin UI controls module is not attached"
grep -Fq "$MARKER" app.html || fail "app.html marker missing"
grep -Fq "$MARKER" app-v0601.html || fail "app-v0601 marker missing"
ok "Frontend $MARKER already published"

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
 '  // TEMP_V061_ADMIN_UI_CONTROLS_MENU: removed immediately after verification.\n'
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

info "UPDATE CHANGELOG + HANDOFF DOCS"
DOCS="$TMP_ROOT/docs"
gh repo clone "$REPO" "$DOCS" -- --depth=1 >/dev/null
python3 - "$DOCS" "$MARKER" "$TAG" <<'PY'
from pathlib import Path
import sys
root=Path(sys.argv[1]); marker=sys.argv[2]; tag=sys.argv[3]

p=root/'changelog-v0601.js'; s=p.read_text(encoding='utf-8')
anchor="        'Последующие исправления, которые входят в v0.6.1, будут дописываться в эту карточку истории изменений.'"
items=[
"        'В админском списке команды снова окрашиваются по игре так же, как в обычном режиме: Royal Kingdom — красные карточки, Royal Match — синие.',",
"        'Кнопка «Режим редактирования» убрана. На её месте постоянно доступны «Добавить команду» и «Добавить участника», а редактирование существующей карточки открывается непосредственно из самой карточки.',",
"        'Поиск в админ-режиме получил поведение клавиатуры как в обычном режиме: при касании или прокрутке вне поля поиска фокус снимается и клавиатура закрывается.'"
]
if anchor in s:
    for item in items:
        if item not in s: s=s.replace(anchor,item+'\n'+anchor,1)
p.write_text(s,encoding='utf-8')

state_path=root/'CURRENT_STATE.md'; state=state_path.read_text(encoding='utf-8')
if tag not in state:
    state += f'''\n\n---\n\n## v0.6.1 admin UI controls — 24.08.2026 [{tag}]\n\n- Admin team list now mirrors ordinary game colors: RK red, RM blue.\n- Separate admin edit-mode switch removed. The header keeps Refresh and provides permanent Add team / Add participant actions; existing records retain direct edit buttons.\n- Admin search keyboard parity added: pointer focus change / scroll gesture away from the active admin search field blurs it, and Enter/Escape also release the keyboard.\n- Frontend marker = `{marker}`; Telegram menu cache marker confirmed through the existing `Таблица ЧП 1.3` deployment. No new deployment created.\n'''
    state_path.write_text(state,encoding='utf-8')

hist_path=root/'WORK_HISTORY.md'; hist=hist_path.read_text(encoding='utf-8')
if tag not in hist:
    hist += f'''\n\n---\n\n### 24.08.2026 — admin team colors / direct create / keyboard [{tag}]\n\n- Implemented user-requested admin UI parity from device screenshots/video.\n- Added `admin-ui-controls-v061.js`: game-colored team cards, permanent create actions in the admin header, direct record edit preservation, and Android/WebView search keyboard dismissal on focus change/gesture.\n- Attached with cache-busted marker `{marker}` and refreshed the Telegram Web App menu through the existing Apps Script deployment.\n'''
    hist_path.write_text(hist,encoding='utf-8')

rules_path=root/'RELEASE_RULES.md'; rules=rules_path.read_text(encoding='utf-8')
rules_to_add=[
'- Admin team list must preserve the same game color language as ordinary mode: Royal Kingdom cards are red and Royal Match cards are blue.',
'- Admin search must release the mobile keyboard when focus/gesture moves away from its search field, matching ordinary-mode keyboard behavior.',
'- Admin create actions are direct: do not reintroduce a separate global «Режим редактирования» switch; keep direct Add team / Add participant actions and per-record edit entry points.'
]
for rule in rules_to_add:
    if rule not in rules: rules += '\n'+rule+'\n'
rules_path.write_text(rules,encoding='utf-8')
PY
cd "$DOCS"
node --check changelog-v0601.js
git add changelog-v0601.js CURRENT_STATE.md WORK_HISTORY.md RELEASE_RULES.md
git diff --check
git config user.name "Royal CRM Handoff"
git config user.email "royal-crm-sync@users.noreply.github.com"
if ! git diff --cached --quiet; then
  git commit -m "Record v0.6.1 admin UI controls" >/dev/null
  git push origin HEAD:main
fi
ok "Changelog and handoff docs updated"

printf '\n============================================================\n'
printf '✅✅✅ v0.6.1 ADMIN UI CONTROLS PUBLISHED ✅✅✅\n'
printf 'RK team cards: red | RM team cards: blue\n'
printf 'Edit-mode switch removed; Add team / Add participant enabled\n'
printf 'Admin search keyboard dismissal enabled\n'
printf 'Telegram menu cache-bust: %s\n' "$MARKER"
printf 'Existing deployment preserved: %s\n' "$EXPECTED_DESC"
printf '============================================================\n'
