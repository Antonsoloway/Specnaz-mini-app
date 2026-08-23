#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${ROYAL_CRM_PROJECT_DIR:-$HOME/table-chp-1.3}"
REPO="Antonsoloway/Specnaz-mini-app"
RAW="https://raw.githubusercontent.com/${REPO}/main"
EXPECTED_DESC="Таблица ЧП 1.3"
STAMP="$(date +%Y%m%d-%H%M%S)"
BUILD_MARKER="20260823-v061-music-live3"
BOT_MENU_FILE="22_MINIAPP_BOT_APP_MENU.js"
BACKUP_DIR="$HOME/royal-crm-backups/v061-music-menu-$STAMP"
TMP_REPO="$(mktemp -d /tmp/royal-v061-music-menu.XXXXXX)"
trap 'rm -rf "$TMP_REPO"' EXIT

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
[[ -f "$BOT_MENU_FILE" ]] || fail "$BOT_MENU_FILE не найден после clasp pull"
cp -p "$BOT_MENU_FILE" "$BACKUP_DIR/$BOT_MENU_FILE"
ok "Backup Apps Script: $BACKUP_DIR/$BOT_MENU_FILE"

info "PATCH FRONTEND ROOT MUSIC GUARD + CACHE MARKERS"
gh repo clone "$REPO" "$TMP_REPO/repo" -- --depth=1 >/dev/null
cd "$TMP_REPO/repo"
python3 - "$BUILD_MARKER" <<'PY'
import re
import sys
from pathlib import Path

marker = sys.argv[1]

app = Path('app.js')
text = app.read_text(encoding='utf-8')
old = "if (BUILD === '0.6.0') {"
new = "if (/^0\\.6\\./.test(BUILD)) {"
if new not in text:
    if text.count(old) != 1:
        raise SystemExit('[ERROR] app.js v0.6 runtime guard anchor missing/ambiguous')
    text = text.replace(old, new, 1)
app.write_text(text, encoding='utf-8')

html = Path('app-v0600.html')
text = html.read_text(encoding='utf-8')
patterns = [
    (r'music-v0600\.js\?v=[^\"]+', f'music-v0600.js?v={marker}'),
    (r'app\.js\?v=[^\"]+', f'app.js?v={marker}'),
    (r'v061-runtime-compat\.js\?v=[^\"]+', f'v061-runtime-compat.js?v={marker}'),
    (r'changelog-v0601\.js\?v=[^\"]+', f'changelog-v0601.js?v={marker}'),
    (r'version-v0600\.js\?v=[^\"]+', f'version-v0600.js?v={marker}'),
]
for pattern, replacement in patterns:
    updated, count = re.subn(pattern, replacement, text, count=1)
    if count != 1:
        raise SystemExit(f'[ERROR] app-v0600 marker anchor missing: {pattern}')
    text = updated
html.write_text(text, encoding='utf-8')

for filename in ('app.html', 'app-v0601.html'):
    path = Path(filename)
    text = path.read_text(encoding='utf-8')
    updated, count = re.subn(
        r"params\.set\('releaseBuild', '[^']+'\);",
        f"params.set('releaseBuild', '{marker}');",
        text,
        count=1,
    )
    if count != 1:
        raise SystemExit(f'[ERROR] releaseBuild anchor missing: {filename}')
    path.write_text(updated, encoding='utf-8')

changelog = Path('changelog-v0601.js')
text = changelog.read_text(encoding='utf-8')
needle = "        'Последующие исправления, которые входят в v0.6.1, будут дописываться в эту карточку истории изменений.'"
entry = "        'Музыка v0.6.1 окончательно переведена на общий runtime 0.6.x: app.js больше не отключает защищённый audio API из-за точного сравнения с 0.6.0; одновременно обновлён Telegram menu cache-bust для принудительной загрузки свежей сборки.',\n"
if entry.strip() not in text:
    if needle not in text:
        raise SystemExit('[ERROR] changelog insertion anchor missing')
    text = text.replace(needle, entry + needle, 1)
changelog.write_text(text, encoding='utf-8')
PY

node --check app.js
node --check changelog-v0601.js
node --check v061-runtime-compat.js
git -c core.whitespace=-blank-at-eof diff --check
git add app.js app-v0600.html app-v0601.html app.html changelog-v0601.js
if ! git diff --cached --quiet; then
  git config user.name "Royal CRM v0.6.1 Music Repair"
  git config user.email "royal-crm-sync@users.noreply.github.com"
  git commit -m "Fix v0.6.1 music runtime and force fresh Telegram build" >/dev/null
  git push origin HEAD:main
  ok "Frontend music root fix pushed"
else
  ok "Frontend music root fix already present"
fi

info "PATCH LIVE BOT MENU CACHE-BUST"
cd "$PROJECT_DIR"
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
print('[OK] Telegram bot menu URL cache-bust updated')
PY

node --check "$BOT_MENU_FILE"
grep -Fq "?cb=$BUILD_MARKER" "$BOT_MENU_FILE" || fail "bot menu marker missing"

info "SELECT EXISTING APPS SCRIPT DEPLOYMENT"
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

info "CLASP STATUS BEFORE PUSH"
clasp status

info "PUSH LIVE APPS SCRIPT"
if clasp push -f; then :
elif clasp push; then :
else fail "clasp push завершился ошибкой"; fi
ok "Apps Script source pushed"

info "UPDATE EXISTING DEPLOYMENT ONLY"
if clasp update-deployment "$DEPLOY_ID" --description "$EXPECTED_DESC"; then :
elif clasp create-deployment --deploymentId "$DEPLOY_ID" --description "$EXPECTED_DESC"; then :
elif clasp deploy -i "$DEPLOY_ID" -d "$EXPECTED_DESC"; then :
else fail "Не удалось обновить существующий deployment; новый deployment не создавался"; fi
ok "Deployment '$EXPECTED_DESC' updated"

info "APPLY + VERIFY TELEGRAM MENU URL"
MENU_OUTPUT="$(clasp run MINIAPP_setupBotAppMenu 2>&1 || true)"
printf '%s\n' "$MENU_OUTPUT"
printf '%s' "$MENU_OUTPUT" | grep -Fq "$BUILD_MARKER" || fail "MINIAPP_setupBotAppMenu не подтвердил новый cache-bust"
ok "Telegram menu URL updated to fresh v0.6.1 build"

info "SYNC FACTUAL LIVE APPS SCRIPT MIRROR"
bash <(curl -fsSL "$RAW/scripts/sync-live-apps-script-to-github.sh")

info "APPEND PROJECT HANDOFF: CURRENT_STATE + WORK_HISTORY"
DOC_REPO="$TMP_REPO/docs-repo"
gh repo clone "$REPO" "$DOC_REPO" -- --depth=1 >/dev/null
cd "$DOC_REPO"
cat >> CURRENT_STATE.md <<EOF

---

## v0.6.1 hotfix — 23.08.2026, music + avatar delivery

- Пользователь подтвердил в Telegram production, что проблемные participant avatars после Apps Script/snapshot hotfix снова загружаются.
- Live Apps Script сохраняет last-known avatar file_id при transient ERROR и unified snapshot уже публикует его; NO_PHOTO по-прежнему не используется как фотография.
- Причина текущей ошибки музыки после перехода на v0.6.1: `app.js` экспортировал `RoyalAppV0600` только при точном `BUILD === '0.6.0'`, поэтому build 0.6.1 терял защищённый audio loader.
- Root fix: runtime API теперь активен для всей ветки `0.6.x`; `app-v0600.html` получил новые cache-bust markers `$BUILD_MARKER`.
- Telegram bot menu URL также переведён на `?cb=$BUILD_MARKER`, чтобы новый запуск Mini App не переиспользовал старый WebView/HTML cache.
- Использован только существующий Apps Script deployment `Таблица ЧП 1.3`; новый deployment не создавался.
- После Apps Script push live mirror повторно синхронизирован в `apps-script-live/`.
EOF

cat >> WORK_HISTORY.md <<EOF

---

### 23.08.2026 17:xx +03 — v0.6.1 avatar confirmation + music runtime root fix

**Запрос:** после avatar hotfix фотографии появились, но кнопка фоновой музыки оставалась в состоянии ошибки; пользователь отдельно напомнил всегда обновлять `CURRENT_STATE.md` и `WORK_HISTORY.md`.

**Факты/диагноз:**
- свежий production snapshot подтвердил восстановленные last-known `avatarFileId` у ранее проблемных карточек;
- private background MP3 существует в data repo и Worker route остаётся доступным через защищённый `/project-mayak-media`;
- корневая frontend-причина музыки найдена в `app.js`: runtime export был ограничен точным `BUILD === '0.6.0'`, тогда как текущий visible build = `0.6.1`;
- Telegram menu URL продолжал использовать старый `cb`, поэтому даже после GitHub hotfix WebView мог повторно поднимать старые HTML/JS subresources.

**Изменено:**
- `app.js`: protected runtime export расширен на всю ветку `0.6.x`;
- `app-v0600.html`, `app-v0601.html`, `app.html`: cache/release markers → `$BUILD_MARKER`;
- `changelog-v0601.js`: зафиксирован фактический music/runtime/cache fix;
- live `22_MINIAPP_BOT_APP_MENU.js`: menu cache-bust обновлён, `MINIAPP_setupBotAppMenu` применён;
- существующий deployment `Таблица ЧП 1.3` обновлён без создания нового;
- `apps-script-live/` заново синхронизирован после push.

**Проверка:** avatar fix подтверждён пользователем в Telegram. Music fix требует один новый запуск Mini App через обновлённую кнопку бота; GitHub commit сам по себе не считается runtime smoke.
EOF

git add CURRENT_STATE.md WORK_HISTORY.md
if ! git diff --cached --quiet; then
  git config user.name "Royal CRM Handoff"
  git config user.email "royal-crm-sync@users.noreply.github.com"
  git commit -m "Record v0.6.1 music runtime hotfix in handoff" >/dev/null
  git push origin HEAD:main
  ok "CURRENT_STATE.md + WORK_HISTORY.md updated"
fi

printf '\n============================================================\n'
printf '✅✅✅ v0.6.1 MUSIC ROOT FIX INSTALLED ✅✅✅\n'
printf 'Frontend runtime: 0.6.x compatible\n'
printf 'Telegram menu cache-bust: %s\n' "$BUILD_MARKER"
printf 'Existing Apps Script deployment preserved: %s\n' "$EXPECTED_DESC"
printf 'Live Apps Script mirror synced\n'
printf 'CURRENT_STATE.md and WORK_HISTORY.md updated\n'
printf '============================================================\n'
