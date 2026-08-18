#!/usr/bin/env bash
set -Eeuo pipefail

# Royal CRM / Таблица ЧП
# Pull the CURRENT standalone Apps Script project with clasp and mirror it to GitHub.
# Source of truth: live Apps Script project configured in ~/table-chp-1.3/.clasp.json
# Destination: apps-script-live/
# IMPORTANT: .clasp.json and Script Properties/secrets are NEVER committed.

SRC="${HOME}/table-chp-1.3"
REPO="Antonsoloway/Specnaz-mini-app"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="${HOME}/table-chp-1.3_backup_${STAMP}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

ok() { printf '✅ %s\n' "$*"; }
fail() { printf '❌ %s\n' "$*" >&2; exit 1; }
stage() { printf '\n=== %s ===\n' "$*"; }

stage "PREFLIGHT"
[ -d "$SRC" ] || fail "Папка $SRC не найдена"
[ -f "$SRC/.clasp.json" ] || fail "В $SRC нет .clasp.json — не могу подтвердить Apps Script проект"
command -v clasp >/dev/null 2>&1 || fail "clasp не найден"
command -v gh >/dev/null 2>&1 || fail "gh не найден"
command -v git >/dev/null 2>&1 || fail "git не найден"
gh auth status >/dev/null 2>&1 || fail "GitHub CLI не авторизован"
ok "Инструменты и проект найдены"

stage "BACKUP LOCAL BEFORE PULL"
mkdir -p "$BACKUP"
find "$SRC" -maxdepth 1 -type f \( -name '*.js' -o -name '*.gs' -o -name 'appsscript.json' -o -name '.clasp.json' \) -exec cp -p {} "$BACKUP/" \;
ok "Локальная копия до clasp pull: $BACKUP"

stage "CLASP STATUS"
cd "$SRC"
clasp status || fail "clasp status завершился ошибкой"

stage "CLASP PULL LIVE PROJECT"
clasp pull || fail "clasp pull завершился ошибкой"
ok "Живой Apps Script проект получен"

stage "VERIFY CRITICAL FILES"
required=(
  '01_CORE_MAIN'
  '02_PUBLIC_SYNC_V4'
  '04_TELEGRAM_AVATARS'
  '05_RELIABLE_WEBHOOK_QUEUE'
  '06_Reliable_Edit_Trigger'
  '07_FINAL_ROLE_FIX'
  '08_TELEGRAM_NAME_LINKS'
  '09_OPTIMIZATION_SCHEDULE'
  '10_DIAGNOSTICS'
  '11_PERFORMANCE_OPTIMIZATION'
  'Вспом функции'
)
for stem in "${required[@]}"; do
  if ! find "$SRC" -maxdepth 1 -type f \( -name "${stem}.js" -o -name "${stem}.gs" \) -print -quit | grep -q .; then
    fail "После clasp pull не найден критический файл: $stem (.js/.gs). В GitHub ничего не отправлено."
  fi
done
[ -f "$SRC/appsscript.json" ] || fail "После clasp pull не найден appsscript.json"
ok "Все критические файлы присутствуют"

stage "CLONE GITHUB"
gh repo clone "$REPO" "$TMP/repo" -- --depth=1 >/dev/null || fail "Не удалось клонировать $REPO"
DEST="$TMP/repo/apps-script-live"
rm -rf "$DEST"
mkdir -p "$DEST"

stage "COPY LIVE SOURCE"
find "$SRC" -maxdepth 1 -type f \( -name '*.js' -o -name '*.gs' -o -name 'appsscript.json' \) -exec cp -p {} "$DEST/" \;
# Explicitly ensure clasp metadata is never copied.
rm -f "$DEST/.clasp.json"
COUNT="$(find "$DEST" -maxdepth 1 -type f | wc -l | tr -d ' ')"
[ "$COUNT" -ge 12 ] || fail "Подозрительно мало файлов после копирования: $COUNT"
ok "Скопировано файлов: $COUNT"

stage "WRITE LIVE MIRROR MANIFEST"
{
  echo '# Live Apps Script mirror'
  echo
  echo "> Generated from the live Apps Script project via \`clasp pull\`."
  echo "> Generated at: $(date -Iseconds)"
  echo "> Local source folder: \`~/table-chp-1.3\`"
  echo "> \`.clasp.json\`, Script Properties, bot tokens, GitHub tokens and other secrets are intentionally NOT stored here."
  echo
  echo '## Files and SHA-256'
  echo
  echo '```text'
  (cd "$DEST" && find . -maxdepth 1 -type f ! -name 'LIVE_MIRROR_MANIFEST.md' -printf '%f\n' | LC_ALL=C sort | while IFS= read -r f; do sha256sum "$f"; done)
  echo '```'
} > "$DEST/LIVE_MIRROR_MANIFEST.md"

stage "GIT DIFF"
cd "$TMP/repo"
git add apps-script-live
# Existing Apps Script files may legitimately contain blank lines at EOF.
# Ignore only that legacy condition while keeping all other whitespace checks active.
git -c core.whitespace=-blank-at-eof diff --cached --check || fail "git diff --check нашёл реальную whitespace-ошибку"
if git diff --cached --quiet; then
  ok "Изменений нет — GitHub уже совпадает с живым зеркалом"
  exit 0
fi
git status --short

stage "COMMIT + PUSH"
git config user.name "Royal CRM Sync" >/dev/null
git config user.email "royal-crm-sync@users.noreply.github.com" >/dev/null
git commit -m "Sync live Apps Script project ${STAMP}" >/dev/null || fail "git commit не выполнен"
git push origin HEAD:main || fail "git push завершился ошибкой"
ok "Полный живой Apps Script mirror загружен в apps-script-live/"
printf '\n✅✅✅ ВСЁ ЗАГРУЖЕНО УСПЕШНО ✅✅✅\n'
printf 'GitHub: %s/tree/main/apps-script-live\n' "https://github.com/${REPO}"
