#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${ROYAL_CRM_PROJECT_DIR:-$HOME/table-chp-1.3}"
REPO="Antonsoloway/Specnaz-mini-app"
RAW="https://raw.githubusercontent.com/${REPO}/main"
EXPECTED_DESC="Таблица ЧП 1.3"
BUILD_MARKER="20260823-v061-music-live3"
CORE_FILE="01_CORE_MAIN.js"
BOT_MENU_FILE="22_MINIAPP_BOT_APP_MENU.js"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$HOME/royal-crm-backups/v061-music-menu-final-$STAMP"
TMP_REPO="$(mktemp -d /tmp/royal-v061-music-final.XXXXXX)"
TOKEN="$(python3 - <<'PY'
import secrets
print(secrets.token_urlsafe(36))
PY
)"
TEMP_PARAM="__royal_v061_menu_final"
MENU_OK=0
MENU_BODY=""

cleanup(){ rm -rf "$TMP_REPO"; }
trap cleanup EXIT
ok(){ printf '\n✅ %s\n' "$*"; }
info(){ printf '\n=== %s ===\n' "$*"; }
warn(){ printf '\n⚠️ %s\n' "$*" >&2; }
fail(){ printf '\n❌ %s\n' "$*" >&2; exit 1; }

for cmd in clasp python3 node gh git curl; do
  command -v "$cmd" >/dev/null 2>&1 || fail "$cmd не найден"
done
[[ -d "$PROJECT_DIR" ]] || fail "Apps Script каталог не найден: $PROJECT_DIR"
[[ -f "$PROJECT_DIR/.clasp.json" ]] || fail ".clasp.json не найден в $PROJECT_DIR"
gh auth status >/dev/null 2>&1 || fail "GitHub CLI не авторизован"

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

grep -Fq "function MINIAPP_setupBotAppMenu" "$BOT_MENU_FILE" || fail "MINIAPP_setupBotAppMenu отсутствует в live source"
grep -Fq "?cb=$BUILD_MARKER" "$BOT_MENU_FILE" || fail "Live bot-menu source ещё не содержит $BUILD_MARKER"

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
import json, sys
from pathlib import Path
path=Path(sys.argv[1]); param=sys.argv[2]; token=sys.argv[3]
text=path.read_text(encoding='utf-8')
anchor='function doGet(e) {\n'
if text.count(anchor) != 1:
    raise SystemExit('[ERROR] doGet anchor missing/ambiguous')
block=(
    "function doGet(e) {\n"
    "  // TEMP_V061_BOT_MENU_FINAL: removed immediately after verification.\n"
    f"  if (e && e.parameter && String(e.parameter[{json.dumps(param)}] || '') === {json.dumps(token)}) {{\n"
    "    var menuResult = MINIAPP_setupBotAppMenu();\n"
    "    return ContentService.createTextOutput(JSON.stringify(menuResult))\n"
    "      .setMimeType(ContentService.MimeType.JSON);\n"
    "  }\n\n"
)
path.write_text(text.replace(anchor, block, 1), encoding='utf-8')
PY
node --check "$CORE_FILE"

info "PUSH TEMP ROUTE + UPDATE EXISTING DEPLOYMENT"
if clasp push -f; then :; elif clasp push; then :; else cp -p "$BACKUP_DIR/$CORE_FILE" "$CORE_FILE"; fail "Temporary push failed"; fi
if clasp update-deployment "$DEPLOY_ID" --description "$EXPECTED_DESC"; then :
elif clasp create-deployment --deploymentId "$DEPLOY_ID" --description "$EXPECTED_DESC"; then :
elif clasp deploy -i "$DEPLOY_ID" -d "$EXPECTED_DESC"; then :
else cp -p "$BACKUP_DIR/$CORE_FILE" "$CORE_FILE"; fail "Temporary deployment update failed"; fi

info "APPLY TELEGRAM MENU AND WAIT FOR getChatMenuButton PROPAGATION"
for attempt in $(seq 1 15); do
  printf '[INFO] Telegram menu verification %s/15\n' "$attempt"
  MENU_BODY="$(curl -sS -L --max-time 35 --get --data-urlencode "$TEMP_PARAM=$TOKEN" "$WEBAPP_URL" || true)"
  if printf '%s' "$MENU_BODY" | python3 -c '
import json,sys
marker=sys.argv[1]
try: d=json.load(sys.stdin)
except Exception: raise SystemExit(1)
app=str(d.get("appUrl") or "")
menu=d.get("menuButton") or {}
web=menu.get("web_app") or {}
url=str(web.get("url") or "")
assert d.get("ok") is True
assert marker in app
assert marker in url
print("[OK] Telegram getChatMenuButton confirms fresh URL")
' "$BUILD_MARKER"; then
    MENU_OK=1
    break
  fi
  sleep 3
done

info "REMOVE TEMP ROUTE FROM LIVE SOURCE"
cp -p "$BACKUP_DIR/$CORE_FILE" "$CORE_FILE"
node --check "$CORE_FILE"
if clasp push -f; then :; elif clasp push; then :; else fail "Не удалось удалить temporary route из live source"; fi
if clasp update-deployment "$DEPLOY_ID" --description "$EXPECTED_DESC"; then :
elif clasp create-deployment --deploymentId "$DEPLOY_ID" --description "$EXPECTED_DESC"; then :
elif clasp deploy -i "$DEPLOY_ID" -d "$EXPECTED_DESC"; then :
else fail "Не удалось обновить deployment после удаления temporary route"; fi
ok "Temporary route удалён; deployment '$EXPECTED_DESC' сохранён"

info "SYNC FACTUAL LIVE APPS SCRIPT MIRROR"
bash <(curl -fsSL "$RAW/scripts/sync-live-apps-script-to-github.sh")

info "UPDATE CURRENT_STATE + WORK_HISTORY REGARDLESS OF VERIFICATION RESULT"
DOC_REPO="$TMP_REPO/docs-repo"
gh repo clone "$REPO" "$DOC_REPO" -- --depth=1 >/dev/null
cd "$DOC_REPO"
STATE_MARKER="V061_MUSIC_MENU_FINAL_20260823"
if ! grep -Fq "$STATE_MARKER" CURRENT_STATE.md; then
cat >> CURRENT_STATE.md <<EOF

---

## v0.6.1 music menu rollout — 23.08.2026 [$STATE_MARKER]

- Participant avatar hotfix подтверждён пользователем на реальном Telegram-устройстве: ранее проблемные фотографии загружаются.
- Frontend music root fix находится в `main`: protected media runtime экспортируется для всей ветки `0.6.x`; active frontend marker = `$BUILD_MARKER`.
- Live `22_MINIAPP_BOT_APP_MENU.js` version 1.0.37 направляет bot Web App на `app.html?cb=$BUILD_MARKER`.
- `clasp run` для standalone-проекта не используется: проект не развёрнут как Apps Script API executable.
- Для применения menu button использован временный tokenized web-app invoker; после вызова route удалён и существующий deployment `Таблица ЧП 1.3` обновлён повторно. Новый deployment не создавался.
- Telegram menu verification result: $([[ "$MENU_OK" == "1" ]] && echo 'CONFIRMED by getChatMenuButton' || echo 'NOT CONFIRMED; source/deployment applied but getChatMenuButton remained stale during verification window').
- После операции выполнен новый `clasp pull` mirror sync в `apps-script-live/`.
EOF
fi
if ! grep -Fq "$STATE_MARKER" WORK_HISTORY.md; then
cat >> WORK_HISTORY.md <<EOF

---

### 23.08.2026 17:45+03 — v0.6.1 Telegram music menu rollout [$STATE_MARKER]

**Контекст:** аватары подтверждены пользователем как исправленные; музыка всё ещё показывала warning. Предыдущий recovery ошибочно проверял JSON через `python3 -` одновременно с here-doc, поэтому verification всегда падал независимо от ответа API.

**Исправлено в recovery:**
- JSON verification переведён на `python3 -c`, stdin теперь действительно содержит ответ web-app;
- проверяется не только желаемый `appUrl`, но и фактический `menuButton.web_app.url` из `getChatMenuButton`;
- добавлено ожидание Telegram propagation до 15 попыток;
- temporary route удаляется до завершения независимо от результата;
- live mirror и handoff docs синхронизируются даже если Telegram verification не успел подтвердиться.

**Фактический результат:** menu verification = $([[ "$MENU_OK" == "1" ]] && echo 'CONFIRMED' || echo 'NOT_CONFIRMED_WITHIN_WINDOW'). Existing deployment `Таблица ЧП 1.3` preserved; no new deployment created. Final music device smoke remains the acceptance check.
EOF
fi
git add CURRENT_STATE.md WORK_HISTORY.md
if ! git diff --cached --quiet; then
  git config user.name "Royal CRM Handoff"
  git config user.email "royal-crm-sync@users.noreply.github.com"
  git commit -m "Record final v0.6.1 music menu rollout" >/dev/null
  git push origin HEAD:main
fi
ok "CURRENT_STATE.md + WORK_HISTORY.md updated"

if [[ "$MENU_OK" != "1" ]]; then
  printf '\nПоследний ответ Telegram:\n%s\n' "$MENU_BODY" | head -c 1800 >&2 || true
  fail "Telegram getChatMenuButton не подтвердил $BUILD_MARKER за окно ожидания. Код/Apps Script сохранены и handoff обновлён; повторный deployment не нужен."
fi

printf '\n============================================================\n'
printf '✅✅✅ v0.6.1 TELEGRAM MENU CONFIRMED ✅✅✅\n'
printf 'Telegram menu cache-bust: %s\n' "$BUILD_MARKER"
printf 'Existing deployment preserved: %s\n' "$EXPECTED_DESC"
printf 'Temporary route removed\n'
printf 'Live Apps Script mirror synced\n'
printf 'CURRENT_STATE.md + WORK_HISTORY.md updated\n'
printf '============================================================\n'
