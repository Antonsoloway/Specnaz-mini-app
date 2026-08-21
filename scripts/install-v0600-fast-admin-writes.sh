#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${ROYAL_CRM_PROJECT_DIR:-$HOME/table-chp-1.3}"
REPO="Antonsoloway/Specnaz-mini-app"
SOURCE_REF="${ROYAL_CRM_SOURCE_REF:-main}"
RAW="https://raw.githubusercontent.com/${REPO}/${SOURCE_REF}"
EXPECTED_DESC="Таблица ЧП 1.3"
WORKER_HEALTH_URL="https://royal-crm-miniapp-api.tropical-spoon.workers.dev/health"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$HOME/royal-crm-backups/v0600-fast-admin-writes-$STAMP"
TEMP_DIR="$(mktemp -d /tmp/royal-v0600-fast-writes.XXXXXX)"

cleanup(){ rm -rf "$TEMP_DIR"; }
trap cleanup EXIT
ok(){ printf '\n✅ %s\n' "$*"; }
info(){ printf '\n[INFO] %s\n' "$*"; }
warn(){ printf '\n[WARN] %s\n' "$*" >&2; }
fail(){ printf '\n❌ %s\n' "$*" >&2; exit 1; }

for command_name in clasp curl node python3 gh git; do
  command -v "$command_name" >/dev/null 2>&1 || fail "$command_name не найден"
done
[[ -d "$PROJECT_DIR" ]] || fail "Apps Script каталог не найден: $PROJECT_DIR"
[[ -f "$PROJECT_DIR/.clasp.json" ]] || fail ".clasp.json не найден в $PROJECT_DIR"
gh auth status >/dev/null 2>&1 || fail "GitHub CLI не авторизован"

info "ROLLOUT GUARD — WORKER 1.27"
WORKER_READY=0
for attempt in $(seq 1 12); do
  printf '[INFO] worker check %s/12\n' "$attempt"
  if curl -fsS --max-time 20 "$WORKER_HEALTH_URL" \
    | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d.get("version")=="1.27.0"; assert d.get("adminWriteEndpoint")=="pinned-deployment-config"; print("[OK] Worker 1.27 live")' 2>/dev/null; then
    WORKER_READY=1
    break
  fi
  sleep 5
done
[[ "$WORKER_READY" == "1" ]] || fail "Worker 1.27 ещё не live. Apps Script не изменён."

mkdir -p "$BACKUP_DIR"
cd "$PROJECT_DIR"

info "CLASP STATUS + PULL LIVE SOURCE"
clasp status
clasp pull

info "SELECT ONE EXISTING DEPLOYMENT: $EXPECTED_DESC"
DEPLOY_OUTPUT=""
if DEPLOY_OUTPUT="$(clasp list-deployments 2>&1)"; then :
elif DEPLOY_OUTPUT="$(clasp deployments 2>&1)"; then :
else fail "Не удалось получить список deployments"; fi
printf '%s\n' "$DEPLOY_OUTPUT"
mapfile -t MATCHES < <(printf '%s\n' "$DEPLOY_OUTPUT" | grep -F "$EXPECTED_DESC" || true)
[[ ${#MATCHES[@]} -eq 1 ]] || fail "Найдено ${#MATCHES[@]} deployment '$EXPECTED_DESC'; ожидался ровно 1. Новый deployment не создан."
LINE="${MATCHES[0]}"
printf '%s\n' "$LINE" | grep -q '@HEAD' && fail "Стабильный deployment неожиданно @HEAD; ничего не меняем"
DEPLOY_ID="$(printf '%s\n' "$LINE" | sed -E 's/^[[:space:]]*-[[:space:]]+([^[:space:]]+).*/\1/')"
[[ "$DEPLOY_ID" =~ ^[A-Za-z0-9_-]{20,}$ ]] || fail "Не удалось извлечь deployment ID"
WEBAPP_URL="https://script.google.com/macros/s/${DEPLOY_ID}/exec"

FILES=(
  25_MINIAPP_UNIFIED_SNAPSHOT.js
  28_MINIAPP_ADMIN_DATA.js
  29_MINIAPP_ADMIN_WRITE.js
  30_MINIAPP_ADMIN_WRITE_BACKEND.js
  31_MINIAPP_ADMIN_WRITE_HARDENED.js
  33_MINIAPP_ADMIN_WRITE_FINAL.js
)

info "BACKUP + DOWNLOAD VETTED MODULES"
for file_name in "${FILES[@]}"; do
  [[ -f "$file_name" ]] || fail "$file_name не найден после clasp pull"
  cp -p "$file_name" "$BACKUP_DIR/$file_name"
  curl -fsSL "$RAW/apps-script-live/$file_name" -o "$TEMP_DIR/$file_name"
  node --check "$TEMP_DIR/$file_name"
done

python3 - "$TEMP_DIR/31_MINIAPP_ADMIN_WRITE_HARDENED.js" "$WEBAPP_URL" <<'PY'
import json
import re
import sys
from pathlib import Path

path = Path(sys.argv[1])
endpoint = sys.argv[2]
text = path.read_text(encoding='utf-8')
pattern = re.compile(r'^var MINIAPP_ADMIN_WRITE_PINNED_ENDPOINT = .+;$', re.MULTILINE)
replacement = 'var MINIAPP_ADMIN_WRITE_PINNED_ENDPOINT = ' + json.dumps(endpoint) + ';'
updated, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit('[ERROR] deployment endpoint constant anchor missing')
path.write_text(updated, encoding='utf-8')
print('[OK] exact existing deployment injected')
PY

node --check "$TEMP_DIR/31_MINIAPP_ADMIN_WRITE_HARDENED.js"
grep -q "MINIAPP_flushQueuedAdminSnapshot" "$TEMP_DIR/28_MINIAPP_ADMIN_DATA.js" || fail "private snapshot queue missing"
grep -q "response: 'commit-first'" "$TEMP_DIR/28_MINIAPP_ADMIN_DATA.js" || fail "commit-first response marker missing"
grep -q "MINIAPP_queueAdminSnapshotRefresh_('admin-write-commit')" "$TEMP_DIR/29_MINIAPP_ADMIN_WRITE.js" || fail "admin write queue hook missing"
grep -q "tryLock(6000)" "$TEMP_DIR/30_MINIAPP_ADMIN_WRITE_BACKEND.js" || fail "short write-lock policy missing"
grep -q "sourceLock: 'sheet-capture-only'" "$TEMP_DIR/33_MINIAPP_ADMIN_WRITE_FINAL.js" || fail "snapshot capability marker missing"
grep -Fq "$WEBAPP_URL" "$TEMP_DIR/31_MINIAPP_ADMIN_WRITE_HARDENED.js" || fail "exact endpoint injection missing"
ok "Backup: $BACKUP_DIR"

for file_name in "${FILES[@]}"; do
  cp -p "$TEMP_DIR/$file_name" "$file_name"
done

info "CLASP STATUS BEFORE PUSH"
clasp status

info "CLASP PUSH"
if clasp push -f; then :
elif clasp push; then :
else fail "clasp push завершился ошибкой"; fi
ok "Commit-first Apps Script source pushed"

info "UPDATE EXISTING DEPLOYMENT ONLY"
if clasp update-deployment "$DEPLOY_ID" --description "$EXPECTED_DESC"; then :
elif clasp create-deployment --deploymentId "$DEPLOY_ID" --description "$EXPECTED_DESC"; then :
elif clasp deploy -i "$DEPLOY_ID" -d "$EXPECTED_DESC"; then :
else fail "Не удалось обновить существующий deployment. Новый deployment не создавался."; fi
ok "Existing deployment updated"

info "NON-MUTATING WRITE ROUTE CHECK"
ROUTE_OK=0
for attempt in $(seq 1 10); do
  printf '[INFO] route check %s/10\n' "$attempt"
  BODY="$(curl -sS -L --max-time 30 -H 'Content-Type: application/x-www-form-urlencoded' \
    --data 'miniapp=1&action=admin-write&backend=1' "$WEBAPP_URL" || true)"
  if printf '%s' "$BODY" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d.get("error")=="INVALID_REQUEST_ID"; assert d.get("version")=="0.6.0-write.5"; print("[OK] write.5 route live")' 2>/dev/null; then
    ROUTE_OK=1
    break
  fi
  sleep 4
done
[[ "$ROUTE_OK" == "1" ]] || fail "Deployment обновлён, но write.5 route не подтверждён. Не повторяйте установку."

info "REFRESH PRIVATE SNAPSHOT (NO CRM MUTATION)"
EXPORT_OUTPUT="$(clasp run MINIAPP_exportAdminSnapshotToGitHub 2>&1 || true)"
if [[ -n "$EXPORT_OUTPUT" ]]; then printf '%s\n' "$EXPORT_OUTPUT"; fi
if [[ "$EXPORT_OUTPUT" != *"Exception:"* && "$EXPORT_OUTPUT" != *"Error:"* ]]; then
  ok "Private snapshot refresh requested"
else
  warn "clasp run вернул server/storage error; ждём штатный five-minute fallback"
fi

info "VERIFY COMMIT-FIRST PRIVATE CONTRACT"
SNAPSHOT_OK=0
for attempt in $(seq 1 30); do
  printf '[INFO] snapshot check %s/30\n' "$attempt"
  if gh api "repos/Antonsoloway/royal-crm-data/contents/admin-snapshot.json" \
    -H 'Accept: application/vnd.github.raw+json' 2>/dev/null \
    | python3 -c 'import json,sys; d=json.load(sys.stdin); expected=sys.argv[1]; a=d.get("adminData") or {}; w=a.get("write") or {}; s=w.get("snapshotRefresh") or {}; assert a.get("version")=="0.6.0-write.5"; assert w.get("endpoint")==expected; assert w.get("endpointPinned") is True; assert s.get("mode")=="queued-private-trigger"; assert s.get("response")=="commit-first"; assert s.get("sourceLock")=="sheet-capture-only"; print("[OK] commit-first snapshot contract live")' "$WEBAPP_URL" 2>/dev/null; then
    SNAPSHOT_OK=1
    break
  fi
  sleep 12
done
[[ "$SNAPSHOT_OK" == "1" ]] || fail "write route live, но private snapshot ещё не подтвердил commit-first contract. Не повторяйте команду."

info "SYNC FACTUAL LIVE MIRROR TO GITHUB MAIN"
bash <(curl -fsSL "$RAW/scripts/sync-live-apps-script-to-github.sh")
ok "Live Apps Script mirror synced"

printf '\n============================================================\n'
printf '✅✅✅ FAST ADMIN EDITING READY ✅✅✅\n'
printf 'Sheet commit: immediate response\n'
printf 'Private snapshot: background queue\n'
printf 'Recurring snapshot: releases ScriptLock before GitHub I/O\n'
printf 'Write lock wait: 6 seconds with idempotent UI retry\n'
printf 'Stable deployment preserved: %s\n' "$EXPECTED_DESC"
printf 'No participant or team was created, changed or deleted.\n'
printf '============================================================\n'
