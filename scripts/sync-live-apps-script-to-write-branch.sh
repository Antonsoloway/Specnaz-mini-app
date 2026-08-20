#!/usr/bin/env bash
set -Eeuo pipefail

SRC="${ROYAL_CRM_PROJECT_DIR:-$HOME/table-chp-1.3}"
REPO="Antonsoloway/Specnaz-mini-app"
BRANCH="v0.6-admin-write"
STAMP="$(date +%Y%m%d-%H%M%S)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

ok(){ printf '✅ %s\n' "$*"; }
fail(){ printf '❌ %s\n' "$*" >&2; exit 1; }
stage(){ printf '\n=== %s ===\n' "$*"; }

stage "WRITE-BRANCH MIRROR PREFLIGHT"
[[ -d "$SRC" ]] || fail "Папка $SRC не найдена"
[[ -f "$SRC/.clasp.json" ]] || fail "В $SRC нет .clasp.json"
command -v gh >/dev/null 2>&1 || fail "gh не найден"
command -v git >/dev/null 2>&1 || fail "git не найден"
gh auth status >/dev/null 2>&1 || fail "GitHub CLI не авторизован"
ok "Mirror preflight OK"

stage "CLONE WRITE BRANCH"
gh repo clone "$REPO" "$TMP/repo" -- --depth=1 --branch "$BRANCH" >/dev/null \
  || fail "Не удалось клонировать $REPO/$BRANCH"
DEST="$TMP/repo/apps-script-live"
rm -rf "$DEST"
mkdir -p "$DEST"

stage "COPY FACTUAL LOCAL SOURCE AFTER PUSH"
find "$SRC" -maxdepth 1 -type f \( -name '*.js' -o -name '*.gs' -o -name 'appsscript.json' \) -exec cp -p {} "$DEST/" \;
rm -f "$DEST/.clasp.json"
COUNT="$(find "$DEST" -maxdepth 1 -type f | wc -l | tr -d ' ')"
[[ "$COUNT" -ge 15 ]] || fail "Подозрительно мало live-файлов: $COUNT"
for required in 12_MINI_APP_API 28_MINIAPP_ADMIN_DATA 29_MINIAPP_ADMIN_WRITE 30_MINIAPP_ADMIN_WRITE_BACKEND 31_MINIAPP_ADMIN_WRITE_HARDENED; do
  find "$DEST" -maxdepth 1 -type f \( -name "${required}.js" -o -name "${required}.gs" \) -print -quit | grep -q . \
    || fail "В factual mirror отсутствует $required"
done
ok "Copied live files: $COUNT"

stage "WRITE MIRROR MANIFEST"
{
  echo '# Live Apps Script mirror — v0.6 write branch'
  echo
  echo "> Generated from the factual Apps Script project after \`clasp push\`."
  echo "> Generated at: $(date -Iseconds)"
  echo "> Source: \`~/table-chp-1.3\`"
  echo "> Secrets and \`.clasp.json\` are intentionally excluded."
  echo
  echo '## Files and SHA-256'
  echo
  echo '```text'
  (cd "$DEST" && find . -maxdepth 1 -type f ! -name 'LIVE_MIRROR_MANIFEST.md' -printf '%f\n' | LC_ALL=C sort | while IFS= read -r f; do sha256sum "$f"; done)
  echo '```'
} > "$DEST/LIVE_MIRROR_MANIFEST.md"

stage "COMMIT MIRROR TO WRITE BRANCH"
cd "$TMP/repo"
git add apps-script-live
git -c core.whitespace=-blank-at-eof diff --cached --check \
  || fail "git diff --check нашёл whitespace-ошибку"
if git diff --cached --quiet; then
  ok "Write branch already matches factual live Apps Script"
  exit 0
fi
git status --short
git config user.name "Royal CRM Sync" >/dev/null
git config user.email "royal-crm-sync@users.noreply.github.com" >/dev/null
git commit -m "Sync v0.6 live Apps Script ${STAMP}" >/dev/null \
  || fail "git commit не выполнен"
git push origin "HEAD:${BRANCH}" \
  || fail "git push в $BRANCH завершился ошибкой"
ok "Factual live Apps Script mirror synced to $BRANCH"
