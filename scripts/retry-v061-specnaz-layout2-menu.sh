#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${ROYAL_CRM_PROJECT_DIR:-$HOME/table-chp-1.3}"
REPO="Antonsoloway/Specnaz-mini-app"
RAW="https://raw.githubusercontent.com/${REPO}/main"
EXPECTED_DESC="Таблица ЧП 1.3"
TARGET_MARKER="20260823-v061-specnaz-layout2"
CORE_FILE="01_CORE_MAIN.js"
BOT_MENU_FILE="22_MINIAPP_BOT_APP_MENU.js"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$HOME/royal-crm-backups/v061-specnaz-layout2-menu-$STAMP"
TMP_ROOT="$(mktemp -d /tmp/royal-v061-layout2-menu.XXXXXX)"
TOKEN="$(python3 - <<'PY'
import secrets
print(secrets.token_urlsafe(36))
PY
)"
TEMP_PARAM="__royal_v061_layout2_menu_once"
MENU_OK=0

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
grep -Fq "?cb=$TARGET_MARKER" "$BOT_MENU_FILE" || fail "live menu source ещё не содержит $TARGET_MARKER"
ok "Live menu source уже содержит layout2 marker"

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
if text.count(anchor) != 1:
    raise SystemExit('[ERROR] doGet anchor missing/ambiguous')
block=(
  'function doGet(e) {\n'
  '  // TEMP_V061_LAYOUT2_MENU: removed immediately after verification.\n'
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

# Apps Script web-app versions can need noticeable propagation time. The previous
# publication failed because verification kept seeing the preceding layout1 code.
info "WAIT FOR DEPLOYMENT PROPAGATION"
sleep 25

info "APPLY + VERIFY TELEGRAM MENU"
for attempt in $(seq 1 36); do
  printf '[INFO] menu verification %02d/36\n' "$attempt"
  BODY="$(curl -sS -L --max-time 40 --get --data-urlencode "$TEMP_PARAM=$TOKEN" "$WEBAPP_URL" || true)"
  if printf '%s' "$BODY" | python3 - "$TARGET_MARKER" <<'PY'
import json,sys
marker=sys.argv[1]
try:
    d=json.load(sys.stdin)
except Exception:
    raise SystemExit(1)
app=str(d.get('appUrl') or '')
menu=str((((d.get('menuButton') or {}).get('web_app') or {}).get('url')) or '')
if d.get('ok') is True and marker in app and marker in menu:
    raise SystemExit(0)
raise SystemExit(1)
PY
  then
    MENU_OK=1
    ok "Telegram menu confirmed: $TARGET_MARKER"
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

if [[ "$MENU_OK" != "1" ]]; then
  fail "Telegram menu всё ещё не подтвердил $TARGET_MARKER; temporary route уже удалён, deployment сохранён"
fi

info "RECORD VERIFIED MENU STATE"
DOCS="$TMP_ROOT/docs"
gh repo clone "$REPO" "$DOCS" -- --depth=1 >/dev/null
python3 - "$DOCS/CURRENT_STATE.md" "$DOCS/WORK_HISTORY.md" "$TARGET_MARKER" <<'PY'
from pathlib import Path
import sys
state_path=Path(sys.argv[1]); hist_path=Path(sys.argv[2]); marker=sys.argv[3]
tag='V061_SPECNAZ_ACHIEVEMENT_ALIGN_MENU_CONFIRMED_20260823'
state=state_path.read_text(encoding='utf-8')
if tag not in state:
    state += f'''\n\n---\n\n## v0.6.1 Specnaz achievement alignment delivery — 23.08.2026 [{tag}]\n\n- Frontend marker `{marker}` опубликован: геройский achievement stack выровнен справа как `Админ → звание → МАЯК`; MAYAK больше не должен уходить влево относительно rank/admin badges.\n- Предыдущая попытка menu verification видела старый `layout1` во время Apps Script propagation; source при этом был сохранён корректно.\n- Повторная tokenized verification дождалась propagation и подтвердила Telegram menu URL с `{marker}`.\n- Использован только существующий deployment `Таблица ЧП 1.3`; temporary route удалён; live Apps Script mirror синхронизирован.\n- Device smoke визуального выравнивания остаётся acceptance check пользователя.\n'''
    state_path.write_text(state,encoding='utf-8')
hist=hist_path.read_text(encoding='utf-8')
if tag not in hist:
    hist += f'''\n\n---\n\n### 23.08.2026 — подтверждена доставка выравнивания ачивок спецназа [{tag}]\n\n- Исправление frontend уже находилось в GitHub, но первый menu invoker 15 раз видел предыдущий Apps Script deployment code и завершился с `Telegram menu did not confirm ...`; cleanup и handoff при этом были выполнены.\n- Выполнен отдельный propagation-safe retry без повторной правки frontend: source `22_MINIAPP_BOT_APP_MENU.js` проверен на `{marker}`, существующий deployment обновлён, после ожидания Telegram menu подтверждён с новым marker.\n- Temporary token route удалён, Apps Script mirror повторно синхронизирован.\n'''
    hist_path.write_text(hist,encoding='utf-8')
PY
cd "$DOCS"
git add CURRENT_STATE.md WORK_HISTORY.md
if ! git diff --cached --quiet; then
  git config user.name "Royal CRM Handoff"
  git config user.email "royal-crm-sync@users.noreply.github.com"
  git commit -m "Confirm v0.6.1 Specnaz layout2 menu delivery" >/dev/null
  git push origin HEAD:main
fi
ok "CURRENT_STATE.md + WORK_HISTORY.md updated"

printf '\n============================================================\n'
printf '✅✅✅ v0.6.1 SPECNAZ LAYOUT2 MENU CONFIRMED ✅✅✅\n'
printf 'Telegram menu cache-bust: %s\n' "$TARGET_MARKER"
printf 'Existing deployment preserved: %s\n' "$EXPECTED_DESC"
printf 'Temporary route removed\n'
printf 'Live Apps Script mirror synced\n'
printf 'CURRENT_STATE.md + WORK_HISTORY.md updated\n'
printf '============================================================\n'
