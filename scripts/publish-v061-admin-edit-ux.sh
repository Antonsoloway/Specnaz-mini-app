#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${ROYAL_CRM_PROJECT_DIR:-$HOME/table-chp-1.3}"
REPO="Antonsoloway/Specnaz-mini-app"
RAW="https://raw.githubusercontent.com/${REPO}/main"
EXPECTED_DESC="Таблица ЧП 1.3"
MARKER="20260824-v061-admin-edit-ux1"
CORE_FILE="01_CORE_MAIN.js"
BOT_MENU_FILE="22_MINIAPP_BOT_APP_MENU.js"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$HOME/royal-crm-backups/v061-admin-edit-ux-$STAMP"
TMP_ROOT="$(mktemp -d /tmp/royal-v061-admin-edit-ux.XXXXXX)"
TOKEN="$(python3 -c 'import secrets; print(secrets.token_urlsafe(36))')"
TEMP_PARAM="__royal_v061_admin_edit_ux_menu_once"
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

info "VERIFY FRONTEND + UPDATE v0.6.1 CHANGELOG"
FRONT="$TMP_ROOT/frontend"
gh repo clone "$REPO" "$FRONT" -- --depth=1 >/dev/null
python3 - "$FRONT" "$MARKER" <<'PY'
from pathlib import Path
import sys
root=Path(sys.argv[1]); marker=sys.argv[2]
for name in ['admin-edit-ux-v061.js','version-v0600.js','app-v0600.html','app-v0601.html','app.html','changelog-v0601.js']:
    if not (root/name).is_file(): raise SystemExit(f'[ERROR] missing {name}')

module=(root/'admin-edit-ux-v061.js').read_text(encoding='utf-8')
for needle in [
    "['chatState','username','date','specnaz','screens','activityBase','activityOutside']",
    "Имя Telegram · справочно",
    "Telegram ID · справочно",
    "royal-admin-edit-top-v061"
]:
    if needle not in module: raise SystemExit(f'[ERROR] admin edit module missing {needle}')

version=(root/'version-v0600.js').read_text(encoding='utf-8')
if marker not in version or 'loadV061AdminEditUx' not in version:
    raise SystemExit('[ERROR] version-v0600.js missing new admin edit UX loader/marker')
for name in ('app-v0600.html','app-v0601.html','app.html'):
    if marker not in (root/name).read_text(encoding='utf-8'):
        raise SystemExit(f'[ERROR] {name} missing {marker}')

ch=root/'changelog-v0601.js'
text=ch.read_text(encoding='utf-8')
anchor="        'Последующие исправления, которые входят в v0.6.1, будут дописываться в эту карточку истории изменений.'"
items=[
"        'Админ-редактор существующего участника очищен от системных и автоматически заполняемых полей: дата, спецназ, скрины, активности, состояние чата и @username больше не занимают форму. В форме остаются изменяемое имя CRM и команды/роли/игровые ники; имя Telegram и Telegram ID показываются только как read-only справка.',",
"        'Кнопки «Редактировать участника» и «Редактировать команду» перенесены вверх карточек админ-режима, чтобы для начала редактирования не приходилось прокручивать длинную карточку до конца.',",
"        'Периодическое дёргание экрана после отключения 20-секундного фонового snapshot-watchdog подтверждено пользователем как исправленное на устройстве.',"
]
for item in reversed(items):
    key=item.strip(" ,'\n")
    if key not in text:
        if anchor not in text: raise SystemExit('[ERROR] changelog anchor missing')
        text=text.replace(anchor,item+'\n'+anchor,1)
ch.write_text(text,encoding='utf-8')
PY

cd "$FRONT"
git add changelog-v0601.js
git diff --check
if ! git diff --cached --quiet; then
  git config user.name "Royal CRM Release"
  git config user.email "royal-crm-sync@users.noreply.github.com"
  git commit -m "Record v0.6.1 admin edit UX cleanup" >/dev/null
  git push origin HEAD:main
fi
ok "Frontend $MARKER ready"

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
s,n=re.subn(r"var MINIAPP_BOT_APP_MENU_VERSION = '[^']+';","var MINIAPP_BOT_APP_MENU_VERSION = '1.0.43';",s,count=1)
if n!=1: raise SystemExit('[ERROR] menu version anchor missing')
s,n=re.subn(r"var appUrl=MINIAPP_BOT_APP_URL\+'\?cb=[^']+';",f"var appUrl=MINIAPP_BOT_APP_URL+'?cb={marker}';",s,count=1)
if n!=1: raise SystemExit('[ERROR] menu cb anchor missing')
p.write_text(s,encoding='utf-8')
PY
node --check "$BOT_MENU_FILE"
grep -Fq "?cb=$MARKER" "$BOT_MENU_FILE" || fail "new menu marker missing"

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
 '  // TEMP_V061_ADMIN_EDIT_UX_MENU: removed immediately after verification.\n'
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
sleep 20
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
python3 - "$DOCS/CURRENT_STATE.md" "$DOCS/WORK_HISTORY.md" "$DOCS/RELEASE_RULES.md" "$MARKER" <<'PY'
from pathlib import Path
import sys
state_path=Path(sys.argv[1]); hist_path=Path(sys.argv[2]); rules_path=Path(sys.argv[3]); marker=sys.argv[4]
tag='V061_ADMIN_EDIT_UX_20260824'
state=state_path.read_text(encoding='utf-8')
if 'V061_SCREEN_TWITCH_WATCHDOG_FIX_20260824' in state and 'device acceptance: CONFIRMED' not in state.lower():
    state += '\n\n- 24.08.2026 device acceptance: **CONFIRMED** — пользователь сообщил, что периодическое дёргание экрана после screen-twitch watchdog fix исчезло.\n'
if tag not in state:
    state += f'''\n\n---\n\n## v0.6.1 admin edit UX — 24.08.2026 [{tag}]\n\n- Existing participant edit form is intentionally minimal: editable = CRM `name` + memberships (team/role/game nickname); Telegram name + Telegram ID remain read-only reference only.\n- Existing participant edit no longer shows chat state, @username, date V, specnaz U, screens AB, activity AC/AD; those remain visible in the admin participant detail card and stay bot/system-owned.\n- Create-participant flow is unchanged.\n- Participant and team edit buttons are moved to the top of their admin detail surfaces; team edit appears before the large team photo so no long scroll is required.\n- Frontend/menu marker = `{marker}`; Telegram menu confirmed. Existing deployment `Таблица ЧП 1.3` preserved; temporary route removed; live Apps Script mirror synchronized.\n- Device smoke pending: open an existing participant edit and team detail on Telegram and verify the compact form/top buttons.\n'''
    state_path.write_text(state,encoding='utf-8')
hist=hist_path.read_text(encoding='utf-8')
if tag not in hist:
    hist += f'''\n\n---\n\n### 24.08.2026 — admin edit form cleanup + top edit actions [{tag}]\n\n- User requested removal of system-generated participant fields from edit mode.\n- Added `admin-edit-ux-v061.js`: update-participant modal removes chatState/username/date/specnaz/screens/activity fields, preserves editable CRM name + membership slots, and keeps Telegram name/ID read-only for visual verification.\n- Same module moves participant/team edit actions to the top of detail cards, including above the large team photo.\n- Create participant form remains untouched.\n- Screen twitch fix from the preceding release was confirmed working on device by the user.\n- Marker `{marker}` published/verified; existing Apps Script deployment retained; live mirror resynced.\n'''
    hist_path.write_text(hist,encoding='utf-8')
rules=rules_path.read_text(encoding='utf-8')
rule='- Existing participant edit UI must expose only server-writable participant fields (`name` + memberships). Telegram name and Telegram ID may be shown read-only for verification; bot/system fields (chat state, username, dates, specnaz/screens/activity counters) belong in the admin detail card, not the edit form.'
if rule not in rules:
    rules += '\n\n### Admin participant editor surface\n\n'+rule+'\n'
    rules_path.write_text(rules,encoding='utf-8')
PY
cd "$DOCS"
git add CURRENT_STATE.md WORK_HISTORY.md RELEASE_RULES.md
git diff --check
if ! git diff --cached --quiet; then
  git config user.name "Royal CRM Handoff"
  git config user.email "royal-crm-sync@users.noreply.github.com"
  git commit -m "Record v0.6.1 admin edit UX" >/dev/null
  git push origin HEAD:main
fi
ok "CURRENT_STATE.md + WORK_HISTORY.md + RELEASE_RULES.md updated"

printf '\n============================================================\n'
printf '✅✅✅ v0.6.1 ADMIN EDIT UX PUBLISHED ✅✅✅\n'
printf 'Telegram menu cache-bust: %s\n' "$MARKER"
printf 'Existing deployment preserved: %s\n' "$EXPECTED_DESC"
printf 'Participant update form minimized\n'
printf 'Participant/team edit buttons moved to top\n'
printf 'Temporary route removed\n'
printf 'Live Apps Script mirror synced\n'
printf 'Handoff docs updated\n'
printf '============================================================\n'
