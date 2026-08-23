#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${ROYAL_CRM_PROJECT_DIR:-$HOME/table-chp-1.3}"
REPO="Antonsoloway/Specnaz-mini-app"
RAW="https://raw.githubusercontent.com/${REPO}/main"
EXPECTED_DESC="Таблица ЧП 1.3"
MARKER="20260824-v061-screen-twitch1"
CORE_FILE="01_CORE_MAIN.js"
BOT_MENU_FILE="22_MINIAPP_BOT_APP_MENU.js"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$HOME/royal-crm-backups/v061-screen-twitch-$STAMP"
TMP_ROOT="$(mktemp -d /tmp/royal-v061-screen-twitch.XXXXXX)"
TOKEN="$(python3 -c 'import secrets; print(secrets.token_urlsafe(36))')"
TEMP_PARAM="__royal_v061_screen_twitch_menu_once"
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

info "VERIFY + RECORD FRONTEND HOTFIX"
FRONT="$TMP_ROOT/frontend"
gh repo clone "$REPO" "$FRONT" -- --depth=1 >/dev/null
python3 - "$FRONT" "$MARKER" <<'PY'
from pathlib import Path
import sys
root=Path(sys.argv[1]); marker=sys.argv[2]
required=['v061-background-refresh-guard.js','version-v0600.js','app.html','app-v0601.html','changelog-v0601.js']
for name in required:
    if not (root/name).is_file(): raise SystemExit(f'[ERROR] missing {name}')

version=(root/'version-v0600.js').read_text(encoding='utf-8')
if marker not in version or 'loadV061BackgroundRefreshGuard' not in version:
    raise SystemExit('[ERROR] version-v0600.js does not load screen-twitch guard')
for name in ('app.html','app-v0601.html'):
    if marker not in (root/name).read_text(encoding='utf-8'):
        raise SystemExit(f'[ERROR] {name} missing {marker}')
guard=(root/'v061-background-refresh-guard.js').read_text(encoding='utf-8')
for needle in ('refreshPublicSnapshotOnce','refreshVisibleAdminSnapshot','scheduleLiveSnapshotRefresh'):
    if needle not in guard: raise SystemExit(f'[ERROR] guard missing {needle}')

ch=root/'changelog-v0601.js'
text=ch.read_text(encoding='utf-8')
old="        'Убрано периодическое дёргание интерфейса на Android Telegram WebView: v0.6.1 больше не запускает глобальный 1,6-секундный layout-polling всех значков звания; видимость анимации отслеживается через IntersectionObserver без постоянных getBoundingClientRect по длинным спискам.',"
replacement="        'Предыдущая попытка убрать периодическое дёргание через отключение legacy rank layout-polling не устранила основной дефект на устройстве; эта оптимизация оставлена, но больше не считается причиной/исправлением twitch.',"
if old in text:
    text=text.replace(old,replacement,1)
new="        'Найдена фактическая периодическая нагрузка, совпадающая с видео по интервалу: admin-write runtime запускал скрытый refresh общего snapshot сначала через 5 секунд, затем каждые 20 секунд и ещё раз после возврата приложения в foreground. В v0.6.1 постоянный watchdog отключён; post-mutation polling после реальных админских записей сохранён, поэтому изменения по-прежнему подтягиваются без постоянного фонового repaint.',"
anchor="        'Последующие исправления, которые входят в v0.6.1, будут дописываться в эту карточку истории изменений.'"
if 'фактическая периодическая нагрузка' not in text:
    if anchor not in text: raise SystemExit('[ERROR] changelog anchor missing')
    text=text.replace(anchor,new+'\n'+anchor,1)
ch.write_text(text,encoding='utf-8')
PY

cd "$FRONT"
git add changelog-v0601.js
git diff --check
if ! git diff --cached --quiet; then
  git config user.name "Royal CRM Release"
  git config user.email "royal-crm-sync@users.noreply.github.com"
  git commit -m "Record actual v0.6.1 screen twitch cause" >/dev/null
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
s,n=re.subn(r"var MINIAPP_BOT_APP_MENU_VERSION = '[^']+';","var MINIAPP_BOT_APP_MENU_VERSION = '1.0.42';",s,count=1)
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
 '  // TEMP_V061_SCREEN_TWITCH_MENU: removed immediately after verification.\n'
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
tag='V061_SCREEN_TWITCH_WATCHDOG_FIX_20260824'
state=state_path.read_text(encoding='utf-8')
if tag not in state:
    state += f'''\n\n---\n\n## v0.6.1 periodic screen twitch — 24.08.2026 [{tag}]\n\n- User confirmed the prior team-photo replacement fix: a newly uploaded team photo appears after the cache-identity correction.\n- Previous rank/compositor attempt did NOT remove the periodic full-screen twitch on the device; do not describe it as verified.\n- Actual interval correlation found in `admin-write-v0600-v3.js`: `scheduleLiveSnapshotRefresh(5000)` starts a permanent watchdog, then `PUBLIC_SNAPSHOT_WATCH_MS=20000` reloads public snapshot every 20s, plus a 1s restart after visibility return. This matches the recorded ~20–25s cadence much more closely than rank shimmer.\n- v0.6.1 now loads `v061-background-refresh-guard.js` before `admin-write-v0600-v3.js`; it suppresses only that legacy 5s/20s/visibility watchdog callback. Mutation-specific snapshot polling after real admin writes is preserved.\n- Frontend/menu marker = `{marker}`; Telegram menu confirmed. Existing deployment `Таблица ЧП 1.3` preserved; temporary verifier route removed; live Apps Script mirror synchronized.\n- Device acceptance still required: keep several ordinary/admin pages open 60–90s without interaction and confirm that the former periodic twitch no longer occurs.\n'''
    state_path.write_text(state,encoding='utf-8')
hist=hist_path.read_text(encoding='utf-8')
if tag not in hist:
    hist += f'''\n\n---\n\n### 24.08.2026 — second screen-twitch diagnosis/fix [{tag}]\n\n- Device feedback rejected the first rank-polling hypothesis: twitch remained unchanged.\n- Traced a separate always-on `admin-write` live snapshot watchdog: first 5s, then every 20s, with public `/snapshot` reload even when data did not change.\n- Added `v061-background-refresh-guard.js`, loaded before admin-write, which identifies the exact watchdog callback by source (`refreshPublicSnapshotOnce` + `refreshVisibleAdminSnapshot` + `scheduleLiveSnapshotRefresh`) and suppresses only those timers.\n- Write correctness preserved: `refreshPublicSnapshotAfterMutation()` uses independent Promise timers and remains active after committed participant/team changes.\n- Cache/menu marker `{marker}` published and verified; stable Apps Script deployment retained; live mirror resynced.\n'''
    hist_path.write_text(hist,encoding='utf-8')
rules=rules_path.read_text(encoding='utf-8')
rule='- Do not run a permanent full public/admin snapshot reload watchdog on a fixed short interval inside the Mini App. Background refresh after explicit writes or user actions is allowed; continuous polling that can repaint Telegram WebView must be opt-in and proven visually stable.'
if rule not in rules:
    rules += '\n\n### Mini App background refresh / visual stability\n\n'+rule+'\n'
    rules_path.write_text(rules,encoding='utf-8')
PY
cd "$DOCS"
git add CURRENT_STATE.md WORK_HISTORY.md RELEASE_RULES.md
git diff --check
if ! git diff --cached --quiet; then
  git config user.name "Royal CRM Handoff"
  git config user.email "royal-crm-sync@users.noreply.github.com"
  git commit -m "Record v0.6.1 screen twitch watchdog fix" >/dev/null
  git push origin HEAD:main
fi
ok "CURRENT_STATE.md + WORK_HISTORY.md + RELEASE_RULES.md updated"

printf '\n============================================================\n'
printf '✅✅✅ v0.6.1 SCREEN TWITCH WATCHDOG FIX PUBLISHED ✅✅✅\n'
printf 'Telegram menu cache-bust: %s\n' "$MARKER"
printf 'Existing deployment preserved: %s\n' "$EXPECTED_DESC"
printf 'Permanent 20s snapshot watchdog suppressed\n'
printf 'Post-mutation refresh preserved\n'
printf 'Temporary route removed\n'
printf 'Live Apps Script mirror synced\n'
printf 'Handoff docs updated\n'
printf '============================================================\n'
