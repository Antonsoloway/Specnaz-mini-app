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
BACKUP_DIR="$HOME/royal-crm-backups/v061-specnaz-layout2-menu-final-$STAMP"
TMP_ROOT="$(mktemp -d /tmp/royal-v061-layout2-final.XXXXXX)"
TOKEN="$(python3 -c 'import secrets; print(secrets.token_urlsafe(36))')"
TEMP_PARAM="__royal_v061_layout2_menu_verify_final"
MENU_OK=0
ROUTE_INSERTED=0
DEPLOY_ID=""

cleanup_tmp(){ rm -rf "$TMP_ROOT"; }
trap cleanup_tmp EXIT
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
grep -Fq "?cb=$TARGET_MARKER" "$BOT_MENU_FILE" || fail "live menu source не содержит $TARGET_MARKER"
ok "Live source содержит layout2 marker"

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
  '  // TEMP_V061_LAYOUT2_MENU_FINAL: removed immediately after verification.\n'
  f'  if (e && e.parameter && String(e.parameter[{json.dumps(param)}] || "") === {json.dumps(token)}) {{\n'
  '    var menuResult = MINIAPP_setupBotAppMenu();\n'
  '    return ContentService.createTextOutput(JSON.stringify(menuResult)).setMimeType(ContentService.MimeType.JSON);\n'
  '  }\n\n'
)
path.write_text(text.replace(anchor,block,1),encoding='utf-8')
PY
node --check "$CORE_FILE"
ROUTE_INSERTED=1

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
try:
    d=json.load(sys.stdin)
except Exception:
    raise SystemExit(1)
app=str(d.get("appUrl") or "")
menu=str((((d.get("menuButton") or {}).get("web_app") or {}).get("url")) or "")
raise SystemExit(0 if d.get("ok") is True and marker in app and marker in menu else 1)
' "$TARGET_MARKER" <<<"$BODY"; then
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
ROUTE_INSERTED=0
ok "Temporary route removed; existing deployment preserved"

info "SYNC LIVE APPS SCRIPT MIRROR"
bash <(curl -fsSL "$RAW/scripts/sync-live-apps-script-to-github.sh")

[[ "$MENU_OK" == "1" ]] || fail "Menu verification не успела подтвердиться; cleanup выполнен. Сам frontend layout2 остаётся опубликован."

info "RECORD VERIFIED STATE"
DOCS="$TMP_ROOT/docs"
gh repo clone "$REPO" "$DOCS" -- --depth=1 >/dev/null
python3 - "$DOCS/CURRENT_STATE.md" "$DOCS/WORK_HISTORY.md" "$TARGET_MARKER" <<'PY'
from pathlib import Path
import sys
state_path=Path(sys.argv[1]); hist_path=Path(sys.argv[2]); marker=sys.argv[3]
tag='V061_SPECNAZ_ACHIEVEMENT_ALIGN_CONFIRMED_20260823'
state=state_path.read_text(encoding='utf-8')
if tag not in state:
    state += f'''\n\n---\n\n## v0.6.1 Specnaz achievement alignment — 23.08.2026 [{tag}]\n\n- `Герои спецназа`: achievement stack выровнен по правому краю; порядок `Админ → звание → МАЯК`, MAYAK не уезжает влево.\n- Frontend/cache marker = `{marker}`.\n- Telegram bot menu URL подтверждён с `{marker}` корректным JSON verifier.\n- Предыдущие `AssertionError` были ложным отрицательным результатом verification-script: heredoc занимал stdin Python и не давал ему прочитать JSON из curl.\n- Существующий deployment `Таблица ЧП 1.3` сохранён, временный route удалён, live Apps Script mirror синхронизирован.\n- Device smoke визуального выравнивания остаётся acceptance check пользователя.\n'''
    state_path.write_text(state,encoding='utf-8')
hist=hist_path.read_text(encoding='utf-8')
if tag not in hist:
    hist += f'''\n\n---\n\n### 23.08.2026 — выравнивание ачивок героев спецназа [{tag}]\n\n- Исправлен CSS v0.6.1: общий stack admin/rank/MAYAK прижат вправо, future-slot наследует ту же ширину/выравнивание.\n- Release marker `{marker}` опубликован в app entrypoint/runtime.\n- Исправлен сам deployment verifier: старый shell pipeline сочетал pipe с heredoc, поэтому Python получал не JSON ответа, а собственный stdin и всегда завершался ошибкой.\n- Корректная повторная проверка подтвердила bot menu `{marker}`; temporary invoker удалён и live mirror синхронизирован.\n'''
    hist_path.write_text(hist,encoding='utf-8')
PY
cd "$DOCS"
git add CURRENT_STATE.md WORK_HISTORY.md
if ! git diff --cached --quiet; then
  git config user.name "Royal CRM Handoff"
  git config user.email "royal-crm-sync@users.noreply.github.com"
  git commit -m "Confirm v0.6.1 Specnaz achievement alignment" >/dev/null
  git push origin HEAD:main
fi
ok "CURRENT_STATE.md + WORK_HISTORY.md updated"

printf '\n============================================================\n'
printf '✅✅✅ v0.6.1 SPECNAZ LAYOUT2 CONFIRMED ✅✅✅\n'
printf 'Telegram menu cache-bust: %s\n' "$TARGET_MARKER"
printf 'Existing deployment preserved: %s\n' "$EXPECTED_DESC"
printf 'Temporary route removed\n'
printf 'Live Apps Script mirror synced\n'
printf 'CURRENT_STATE.md + WORK_HISTORY.md updated\n'
printf '============================================================\n'
