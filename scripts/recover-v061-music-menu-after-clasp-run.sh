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
BACKUP_DIR="$HOME/royal-crm-backups/v061-music-menu-recovery-$STAMP"
TMP_REPO="$(mktemp -d /tmp/royal-v061-music-recovery.XXXXXX)"
TOKEN="$(python3 - <<'PY'
import secrets
print(secrets.token_urlsafe(36))
PY
)"
TEMP_PARAM="__royal_v061_menu_once"

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

info "ENSURE BOT MENU TARGETS FRESH v0.6.1 BUILD"
python3 - "$BOT_MENU_FILE" "$BUILD_MARKER" <<'PY'
import re
import sys
from pathlib import Path

path = Path(sys.argv[1])
marker = sys.argv[2]
text = path.read_text(encoding='utf-8')
text, count = re.subn(
    r"var MINIAPP_BOT_APP_MENU_VERSION = '[^']+';",
    "var MINIAPP_BOT_APP_MENU_VERSION = '1.0.37';",
    text,
    count=1,
)
if count != 1:
    raise SystemExit('[ERROR] bot menu version anchor missing')
text, count = re.subn(
    r"var appUrl=MINIAPP_BOT_APP_URL\+'\?cb=[^']+';",
    f"var appUrl=MINIAPP_BOT_APP_URL+'?cb={marker}';",
    text,
    count=1,
)
if count != 1:
    raise SystemExit('[ERROR] bot menu cb anchor missing')
path.write_text(text, encoding='utf-8')
print('[OK] bot menu source targets fresh build')
PY
node --check "$BOT_MENU_FILE"
grep -Fq "?cb=$BUILD_MARKER" "$BOT_MENU_FILE" || fail "bot menu cache-bust missing"

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

info "TEMPORARY ONE-TIME WEBAPP INVOKER"
python3 - "$CORE_FILE" "$TEMP_PARAM" "$TOKEN" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
param = sys.argv[2]
token = sys.argv[3]
text = path.read_text(encoding='utf-8')
anchor = 'function doGet(e) {\n'
if text.count(anchor) != 1:
    raise SystemExit('[ERROR] doGet anchor missing/ambiguous')
block = (
    "function doGet(e) {\n"
    "  // TEMP_V061_BOT_MENU_ONCE: deployment-local one-time invoker.\n"
    "  // This block is removed immediately after the request and is never mirrored to GitHub.\n"
    f"  if (e && e.parameter && String(e.parameter[{json.dumps(param)}] || '') === {json.dumps(token)}) {{\n"
    "    var menuResult = MINIAPP_setupBotAppMenu();\n"
    "    return ContentService.createTextOutput(JSON.stringify(menuResult))\n"
    "      .setMimeType(ContentService.MimeType.JSON);\n"
    "  }\n\n"
)
text = text.replace(anchor, block, 1)
path.write_text(text, encoding='utf-8')
print('[OK] temporary one-time invoker inserted locally')
PY
node --check "$CORE_FILE"

info "PUSH TEMP INVOKER + UPDATE EXISTING DEPLOYMENT"
clasp status
if clasp push -f; then :
elif clasp push; then :
else
  cp -p "$BACKUP_DIR/$CORE_FILE" "$CORE_FILE"
  fail "clasp push temporary invoker failed"
fi
if clasp update-deployment "$DEPLOY_ID" --description "$EXPECTED_DESC"; then :
elif clasp create-deployment --deploymentId "$DEPLOY_ID" --description "$EXPECTED_DESC"; then :
elif clasp deploy -i "$DEPLOY_ID" -d "$EXPECTED_DESC"; then :
else
  cp -p "$BACKUP_DIR/$CORE_FILE" "$CORE_FILE"
  fail "temporary deployment update failed"
fi

info "CALL MINIAPP_setupBotAppMenu THROUGH TEMP WEBAPP ROUTE"
MENU_OK=0
MENU_BODY=""
for attempt in $(seq 1 8); do
  printf '[INFO] menu apply check %s/8\n' "$attempt"
  MENU_BODY="$(curl -sS -L --max-time 35 --get --data-urlencode "$TEMP_PARAM=$TOKEN" "$WEBAPP_URL" || true)"
  if printf '%s' "$MENU_BODY" | python3 - "$BUILD_MARKER" <<'PY' 2>/dev/null
import json,sys
marker=sys.argv[1]
d=json.load(sys.stdin)
assert d.get('ok') is True
assert marker in str(d.get('appUrl') or '')
print('[OK] Telegram menu updated')
PY
  then
    MENU_OK=1
    break
  fi
  sleep 4
done

info "REMOVE TEMP INVOKER FROM LIVE SOURCE"
cp -p "$BACKUP_DIR/$CORE_FILE" "$CORE_FILE"
# Keep the desired 22_MINIAPP_BOT_APP_MENU.js change; only the temporary doGet block is restored.
node --check "$CORE_FILE"
node --check "$BOT_MENU_FILE"
if clasp push -f; then :
elif clasp push; then :
else fail "Не удалось удалить temporary invoker из Apps Script source"; fi
if clasp update-deployment "$DEPLOY_ID" --description "$EXPECTED_DESC"; then :
elif clasp create-deployment --deploymentId "$DEPLOY_ID" --description "$EXPECTED_DESC"; then :
elif clasp deploy -i "$DEPLOY_ID" -d "$EXPECTED_DESC"; then :
else fail "Не удалось обновить deployment после удаления temporary invoker"; fi
ok "Temporary route удалён; существующий deployment сохранён"

[[ "$MENU_OK" == "1" ]] || {
  printf '%s\n' "$MENU_BODY" | head -c 1200 >&2 || true
  fail "Telegram menu не подтвердил новый cache-bust; temporary route уже удалён, повторный deployment не нужен"
}

info "SYNC FACTUAL LIVE APPS SCRIPT MIRROR"
bash <(curl -fsSL "$RAW/scripts/sync-live-apps-script-to-github.sh")

info "UPDATE CURRENT_STATE + WORK_HISTORY"
DOC_REPO="$TMP_REPO/docs-repo"
gh repo clone "$REPO" "$DOC_REPO" -- --depth=1 >/dev/null
cd "$DOC_REPO"
STATE_MARKER="V061_MUSIC_MENU_RECOVERY_20260823"
if ! grep -Fq "$STATE_MARKER" CURRENT_STATE.md; then
cat >> CURRENT_STATE.md <<EOF

---

## v0.6.1 music/menu recovery — 23.08.2026 [$STATE_MARKER]

- Пользователь подтвердил в Telegram production: ранее проблемные participant avatars после Apps Script/snapshot исправления загружаются.
- Music root fix находится в `main`: `app.js` экспортирует protected audio runtime для всей ветки `0.6.x`; активные cache markers = `$BUILD_MARKER`.
- Предыдущая попытка применить Telegram menu URL через `clasp run MINIAPP_setupBotAppMenu` остановилась, потому что текущий Apps Script deployment не является Apps Script API executable. Сам source push и обновление deployment до этой ошибки уже были выполнены.
- Recovery применяет `MINIAPP_setupBotAppMenu` через временный одноразовый web-app invoker с runtime-generated token; временный route сразу удаляется вторым push/update и в GitHub не сохраняется.
- Telegram menu URL подтверждён с `?cb=$BUILD_MARKER`.
- Используется только существующий deployment `Таблица ЧП 1.3`; новый deployment не создавался.
- После recovery live Apps Script снова синхронизирован в `apps-script-live/`.
EOF
fi

if ! grep -Fq "$STATE_MARKER" WORK_HISTORY.md; then
cat >> WORK_HISTORY.md <<EOF

---

### 23.08.2026 17:xx +03 — v0.6.1 music menu recovery [$STATE_MARKER]

**Запрос/контекст:** avatars уже подтверждены пользователем как исправленные; музыка продолжала показывать warning. Установщик дошёл до обновления существующего Apps Script deployment, но `clasp run MINIAPP_setupBotAppMenu` завершился `Script function not found / API executable` и поэтому не дошёл до handoff-синхронизации.

**Диагноз:**
- `app.js` root guard уже исправлен на `0.6.x`, `app-v0600.html` использует fresh music/app cache marker `$BUILD_MARKER`;
- private background MP3 остаётся в private data repo и защищённый Worker media route сохранён;
- оставшийся rollout gap — Telegram bot menu URL всё ещё мог держать старый `cb`, а `clasp run` для этого проекта непригоден без отдельного API-executable deployment.

**Recovery:**
- live `22_MINIAPP_BOT_APP_MENU.js` направлен на `?cb=$BUILD_MARKER`;
- `MINIAPP_setupBotAppMenu` выполнен через временный одноразовый web-app route с случайным token;
- temporary route после подтверждения немедленно удалён из live source и deployment повторно обновлён;
- новый Apps Script deployment не создавался;
- `apps-script-live/` повторно синхронизирован;
- `CURRENT_STATE.md` и `WORK_HISTORY.md` обновлены в том же recovery flow.

**Проверка:** Telegram menu API подтвердил fresh app URL. Финальный device smoke музыки выполняется новым запуском Mini App из обновлённой кнопки бота.
EOF
fi

git add CURRENT_STATE.md WORK_HISTORY.md
if ! git diff --cached --quiet; then
  git config user.name "Royal CRM Handoff"
  git config user.email "royal-crm-sync@users.noreply.github.com"
  git commit -m "Record v0.6.1 music menu recovery" >/dev/null
  git push origin HEAD:main
fi
ok "CURRENT_STATE.md + WORK_HISTORY.md updated"

printf '\n============================================================\n'
printf '✅✅✅ v0.6.1 MUSIC MENU RECOVERY COMPLETE ✅✅✅\n'
printf 'Telegram menu cache-bust: %s\n' "$BUILD_MARKER"
printf 'Existing Apps Script deployment preserved: %s\n' "$EXPECTED_DESC"
printf 'Temporary invoker removed\n'
printf 'Live Apps Script mirror synced\n'
printf 'CURRENT_STATE.md + WORK_HISTORY.md updated\n'
printf '============================================================\n'
