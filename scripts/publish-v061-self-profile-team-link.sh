#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${ROYAL_CRM_PROJECT_DIR:-$HOME/table-chp-1.3}"
REPO="Antonsoloway/Specnaz-mini-app"
RAW="https://raw.githubusercontent.com/${REPO}/main"
EXPECTED_DESC="Таблица ЧП 1.3"
BUILD_MARKER="20260823-v061-self-team-link1"
CORE_FILE="01_CORE_MAIN.js"
BOT_MENU_FILE="22_MINIAPP_BOT_APP_MENU.js"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$HOME/royal-crm-backups/v061-self-team-link-$STAMP"
TMP_ROOT="$(mktemp -d /tmp/royal-v061-self-team-link.XXXXXX)"
TOKEN="$(python3 - <<'PY'
import secrets
print(secrets.token_urlsafe(36))
PY
)"
TEMP_PARAM="__royal_v061_self_team_once"
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

info "UPDATE BOT MENU SOURCE CACHE MARKER"
python3 - "$BOT_MENU_FILE" "$BUILD_MARKER" <<'PY'
import re, sys
from pathlib import Path
path = Path(sys.argv[1])
marker = sys.argv[2]
text = path.read_text(encoding='utf-8')
text, count = re.subn(
    r"var MINIAPP_BOT_APP_MENU_VERSION = '[^']+';",
    "var MINIAPP_BOT_APP_MENU_VERSION = '1.0.38';",
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
    raise SystemExit('[ERROR] bot menu cache marker anchor missing')
path.write_text(text, encoding='utf-8')
PY
node --check "$BOT_MENU_FILE"
grep -Fq "?cb=$BUILD_MARKER" "$BOT_MENU_FILE" || fail "new bot menu marker missing"

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
path = Path(sys.argv[1])
param = sys.argv[2]
token = sys.argv[3]
text = path.read_text(encoding='utf-8')
anchor = 'function doGet(e) {\n'
if text.count(anchor) != 1:
    raise SystemExit('[ERROR] doGet anchor missing/ambiguous')
block = (
    "function doGet(e) {\n"
    "  // TEMP_V061_SELF_TEAM_MENU: removed immediately after verification.\n"
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

info "APPLY TELEGRAM MENU + VERIFY getChatMenuButton"
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

info "UPDATE CURRENT_STATE + WORK_HISTORY"
DOC_REPO="$TMP_ROOT/docs-repo"
gh repo clone "$REPO" "$DOC_REPO" -- --depth=1 >/dev/null
MENU_STATUS="NOT_CONFIRMED_WITHIN_WINDOW"
[[ "$MENU_OK" == "1" ]] && MENU_STATUS="CONFIRMED"
python3 - "$DOC_REPO/CURRENT_STATE.md" "$DOC_REPO/WORK_HISTORY.md" "$BUILD_MARKER" "$MENU_STATUS" <<'PY'
import sys
from pathlib import Path
state_path = Path(sys.argv[1])
history_path = Path(sys.argv[2])
marker = sys.argv[3]
menu_status = sys.argv[4]
tag = 'V061_SELF_PROFILE_TEAM_LINK_20260823'
state = state_path.read_text(encoding='utf-8')
if tag not in state:
    state += f'''\n\n---\n\n## v0.6.1 own-profile team navigation — 23.08.2026 [{tag}]\n\n- `profile-team-link-v061.js` обновлён до `0.6.1-profile-team-link.2`.\n- На главной странице membership-плашки в собственной карточке профиля получают безопасный ordinary team route и становятся кликабельными.\n- Для team identity передаётся пара `название + игра`, поэтому одинаковые названия в Royal Match / Royal Kingdom не смешиваются.\n- Legacy `profile-card-v0523.js` не менялся: rollback v0.5.59 сохранён.\n- Release/cache marker = `{marker}`; Telegram menu verification = **{menu_status}**.\n- `changelog-v0601.js` дополнен этой возможностью.\n- Изменение frontend-only; Sheets/CRM данные не изменялись. Device smoke перехода из своей карточки остаётся acceptance check пользователя.\n'''
    state_path.write_text(state, encoding='utf-8')
history = history_path.read_text(encoding='utf-8')
if tag not in history:
    history += f'''\n\n---\n\n### 23.08.2026 18:00+03 — переход из своей карточки в команду [{tag}]\n\n**Запрос:** с главной страницы Mini App из собственной карточки профиля открыть свою команду нажатием на membership-плашку.\n\n**Выполнено:**\n- расширен только v0.6.1-модуль `profile-team-link-v061.js`; legacy renderer v0.5.59 не изменён;\n- `.self-membership` после рендера получает `data-team` с encoded `[team, game]`, keyboard semantics и touch-friendly behavior;\n- существующий ordinary team router и `team-identity-fix.js` сохраняют точную identity `name + game`;\n- MutationObserver повторно декорирует профиль после auth/snapshot rerender;\n- `app-v0600.html`, `app-v0601.html`, `app.html` и v0.6.1 changelog переведены на marker `{marker}`;\n- Telegram bot menu marker применён через временный tokenized web-app invoker и temporary route удалён; verification = `{menu_status}`;\n- live Apps Script mirror синхронизирован после rollout.\n\n**Проверка:** repo/runtime delivery подготовлены; финальный device smoke — на главной нажать плашку своей команды и убедиться, что открылась карточка именно нужной игры.\n'''
    history_path.write_text(history, encoding='utf-8')
PY
cd "$DOC_REPO"
git add CURRENT_STATE.md WORK_HISTORY.md
if ! git diff --cached --quiet; then
  git config user.name "Royal CRM Handoff"
  git config user.email "royal-crm-sync@users.noreply.github.com"
  git commit -m "Record v0.6.1 own-profile team navigation" >/dev/null
  git push origin HEAD:main
fi
ok "CURRENT_STATE.md + WORK_HISTORY.md updated"

if [[ "$MENU_OK" != "1" ]]; then
  printf '\nПоследний ответ Telegram:\n%s\n' "$MENU_BODY" | head -c 1800 >&2 || true
  fail "Telegram menu не подтвердил $BUILD_MARKER за окно ожидания. Temporary route удалён, live mirror и handoff сохранены."
fi

printf '\n============================================================\n'
printf '✅✅✅ v0.6.1 SELF PROFILE → TEAM READY ✅✅✅\n'
printf 'Telegram menu cache-bust: %s\n' "$BUILD_MARKER"
printf 'Existing deployment preserved: %s\n' "$EXPECTED_DESC"
printf 'Temporary route removed\n'
printf 'Live Apps Script mirror synced\n'
printf 'CURRENT_STATE.md + WORK_HISTORY.md updated\n'
printf '============================================================\n'
