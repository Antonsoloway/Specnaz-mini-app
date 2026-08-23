#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${ROYAL_CRM_PROJECT_DIR:-$HOME/table-chp-1.3}"
REPO="Antonsoloway/Specnaz-mini-app"
RAW="https://raw.githubusercontent.com/${REPO}/main"
EXPECTED_DESC="Таблица ЧП 1.3"
TARGET_FILE="14_GITHUB_SNAPSHOT_EXPORT.js"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$HOME/royal-crm-backups/v061-avatar-music-$STAMP"
TMP_REPO="$(mktemp -d /tmp/royal-v061-repair.XXXXXX)"
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

cd "$PROJECT_DIR"
mkdir -p "$BACKUP_DIR"

info "CLASP STATUS + PULL ФАКТИЧЕСКОГО LIVE PROJECT"
clasp status
clasp pull
[[ -f "$TARGET_FILE" ]] || fail "$TARGET_FILE не найден после clasp pull"
cp -p "$TARGET_FILE" "$BACKUP_DIR/$TARGET_FILE"
ok "Backup: $BACKUP_DIR/$TARGET_FILE"

info "ВЫБОР СУЩЕСТВУЮЩЕГО DEPLOYMENT"
DEPLOY_OUTPUT=""
if DEPLOY_OUTPUT="$(clasp list-deployments 2>&1)"; then :
elif DEPLOY_OUTPUT="$(clasp deployments 2>&1)"; then :
else fail "Не удалось получить deployments"; fi
printf '%s\n' "$DEPLOY_OUTPUT"
mapfile -t MATCHES < <(printf '%s\n' "$DEPLOY_OUTPUT" | grep -F "$EXPECTED_DESC" || true)
[[ ${#MATCHES[@]} -eq 1 ]] || fail "Найдено ${#MATCHES[@]} deployment '$EXPECTED_DESC'; ожидался ровно 1. Новый deployment не создаётся."
LINE="${MATCHES[0]}"
printf '%s\n' "$LINE" | grep -q '@HEAD' && fail "Стабильный deployment неожиданно @HEAD; остановлено"
DEPLOY_ID="$(printf '%s\n' "$LINE" | sed -E 's/^[[:space:]]*-[[:space:]]+([^[:space:]]+).*/\1/')"
[[ "$DEPLOY_ID" =~ ^[A-Za-z0-9_-]{20,}$ ]] || fail "Не удалось извлечь deployment ID"

info "PATCH LIVE APPS SCRIPT AVATAR SNAPSHOT"
python3 - "$TARGET_FILE" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
text = path.read_text(encoding='utf-8')

version_old = "const MINIAPP_SNAPSHOT_VERSION = '1.2.0';"
version_new = "const MINIAPP_SNAPSHOT_VERSION = '1.2.1';"
if version_new not in text:
    if text.count(version_old) != 1:
        raise SystemExit('[ERROR] snapshot version 1.2.0 anchor missing/ambiguous')
    text = text.replace(version_old, version_new, 1)

old = "      if (status && status !== 'OK') return;"
new = "      // ERROR is non-destructive in 04_TELEGRAM_AVATARS: the previous known file_id is retained.\n      // Export that last-known file_id so Mini App can keep showing the cached/known avatar.\n      // NO_PHOTO and unknown statuses remain excluded.\n      if (status && status !== 'OK' && status !== 'ERROR') return;"
if new not in text:
    if text.count(old) != 1:
        raise SystemExit('[ERROR] avatar status filter anchor missing/ambiguous')
    text = text.replace(old, new, 1)

path.write_text(text, encoding='utf-8')
print('[OK] snapshot 1.2.1 + last-known ERROR avatar export applied')
PY

node --check "$TARGET_FILE"
grep -Fq "const MINIAPP_SNAPSHOT_VERSION = '1.2.1';" "$TARGET_FILE" || fail "version bump missing"
grep -Fq "status !== 'OK' && status !== 'ERROR'" "$TARGET_FILE" || fail "ERROR last-known policy missing"
ok "Apps Script patch проверен"

info "CLASP STATUS BEFORE PUSH"
clasp status

info "CLASP PUSH"
if clasp push -f; then :
elif clasp push; then :
else fail "clasp push завершился ошибкой"; fi
ok "Apps Script source pushed"

info "UPDATE EXISTING DEPLOYMENT ONLY"
if clasp update-deployment "$DEPLOY_ID" --description "$EXPECTED_DESC"; then :
elif clasp create-deployment --deploymentId "$DEPLOY_ID" --description "$EXPECTED_DESC"; then :
elif clasp deploy -i "$DEPLOY_ID" -d "$EXPECTED_DESC"; then :
else fail "Не удалось обновить существующий deployment. Новый deployment не создавался."; fi
ok "Deployment '$EXPECTED_DESC' обновлён"

info "REFRESH UNIFIED SNAPSHOT"
EXPORT_OUTPUT="$(clasp run MINIAPP_exportUnifiedSnapshotToGitHub 2>&1 || true)"
[[ -z "$EXPORT_OUTPUT" ]] || printf '%s\n' "$EXPORT_OUTPUT"
if [[ "$EXPORT_OUTPUT" == *"Exception:"* || "$EXPORT_OUTPUT" == *"Error:"* ]]; then
  warn "Немедленный clasp run не подтвердился; штатный unified trigger обновит snapshot. Повторный push не нужен."
else
  ok "Unified snapshot refresh requested"
fi

info "PATCH v0.6.1 FRONTEND: MUSIC RUNTIME + AVATAR CACHE BUST"
gh repo clone "$REPO" "$TMP_REPO/repo" -- --depth=1 >/dev/null
cd "$TMP_REPO/repo"
python3 - <<'PY'
from pathlib import Path

# The visible 0.6.1 release changed BUILD from 0.6.0 to 0.6.1, while app.js
# still exposed RoyalAppV0600 only for the exact old value. That made the
# protected audio loader disappear and music ended in the warning/error state.
app = Path('app.js')
text = app.read_text(encoding='utf-8')
old = "if (BUILD === '0.6.0') {"
new = "if (/^0\\.6\\./.test(BUILD)) {"
if new not in text:
    if text.count(old) != 1:
        raise SystemExit('[ERROR] app.js v0.6 runtime API guard anchor missing/ambiguous')
    text = text.replace(old, new, 1)
app.write_text(text, encoding='utf-8')

html = Path('app-v0600.html')
text = html.read_text(encoding='utf-8')
replacements = {
    'app.js?v=20260823-scroll-gesture-hotfix5': 'app.js?v=20260823-v061-runtime-repair1',
    'identity-card-ids-v0518.js?v=0.5.59': 'identity-card-ids-v0518.js?v=20260823-v061-avatar-loader2',
    'changelog-v0601.js?v=20260823-v061-visible-1': 'changelog-v0601.js?v=20260823-v061-runtime-repair1',
}
for old, new in replacements.items():
    if new in text:
        continue
    if text.count(old) != 1:
        raise SystemExit(f'[ERROR] app-v0600 cache anchor missing/ambiguous: {old}')
    text = text.replace(old, new, 1)
html.write_text(text, encoding='utf-8')

for filename in ('app.html', 'app-v0601.html'):
    path = Path(filename)
    text = path.read_text(encoding='utf-8')
    old = '20260823-v061-visible-1'
    new = '20260823-v061-runtime-repair1'
    if new not in text:
        if old not in text:
            raise SystemExit(f'[ERROR] releaseBuild anchor missing in {filename}')
        text = text.replace(old, new)
    path.write_text(text, encoding='utf-8')

changelog = Path('changelog-v0601.js')
text = changelog.read_text(encoding='utf-8')
needle = "        'Последующие исправления, которые входят в v0.6.1, будут дописываться в эту карточку истории изменений.'"
items = [
    "        'Исправлена музыка после перехода на v0.6.1: защищённый runtime API аудио теперь активен для всей ветки 0.6.x, поэтому приватный фон снова загружается с сохранённой настройкой участника.',",
    "        'Исправлена причина пропадающих аватаров при временной ошибке Telegram: Apps Script snapshot теперь сохраняет последний известный avatar file_id для записей ERROR, но по-прежнему не экспортирует NO_PHOTO.',",
    "        'Для карточек без avatarFileId принудительно обновлён frontend-loader, чтобы Telegram WebView не использовал старый закэшированный JS.',",
]
if items[0] not in text:
    if needle not in text:
        raise SystemExit('[ERROR] changelog insertion anchor missing')
    text = text.replace(needle, '\n'.join(items) + '\n' + needle, 1)
changelog.write_text(text, encoding='utf-8')
PY

node --check app.js
node --check changelog-v0601.js
node --check identity-card-ids-v0518.js
git -c core.whitespace=-blank-at-eof diff --check
git add app.js app-v0600.html app.html app-v0601.html changelog-v0601.js
if ! git diff --cached --quiet; then
  git config user.name "Royal CRM v0.6.1 Repair"
  git config user.email "royal-crm-sync@users.noreply.github.com"
  git commit -m "Fix v0.6.1 music runtime and avatar delivery" >/dev/null
  git push origin HEAD:main
  ok "Frontend v0.6.1 repair pushed"
else
  ok "Frontend repair already present"
fi

info "SYNC FACTUAL LIVE APPS SCRIPT MIRROR BACK TO GITHUB"
cd "$PROJECT_DIR"
bash <(curl -fsSL "$RAW/scripts/sync-live-apps-script-to-github.sh")

printf '\n============================================================\n'
printf '✅✅✅ v0.6.1 AVATAR + MUSIC REPAIR INSTALLED ✅✅✅\n'
printf 'Apps Script snapshot version: 1.2.1\n'
printf 'Last-known avatar file_id survives transient ERROR status.\n'
printf 'NO_PHOTO remains excluded.\n'
printf 'Frontend 0.6.x protected audio runtime restored.\n'
printf 'Avatar loader and app.js cache markers refreshed.\n'
printf 'Existing deployment preserved: %s\n' "$EXPECTED_DESC"
printf 'Live Apps Script mirror synced back to GitHub.\n'
printf '============================================================\n'
