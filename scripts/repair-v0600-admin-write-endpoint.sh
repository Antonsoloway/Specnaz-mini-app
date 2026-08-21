#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${ROYAL_CRM_PROJECT_DIR:-$HOME/table-chp-1.3}"
REPO="Antonsoloway/Specnaz-mini-app"
SOURCE_REF="${ROYAL_CRM_SOURCE_REF:-main}"
RAW="https://raw.githubusercontent.com/${REPO}/${SOURCE_REF}"
EXPECTED_DESC="Таблица ЧП 1.3"
WORKER_HEALTH_URL="https://royal-crm-miniapp-api.tropical-spoon.workers.dev/health"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$HOME/royal-crm-backups/v0600-admin-endpoint-$STAMP"
TEMP_DIR="$(mktemp -d /tmp/royal-v0600-admin-endpoint.XXXXXX)"

cleanup(){ rm -rf "$TEMP_DIR"; }
trap cleanup EXIT
ok(){ printf '\n✅ %s\n' "$*"; }
info(){ printf '\n[INFO] %s\n' "$*"; }
warn(){ printf '\n[WARN] %s\n' "$*" >&2; }
fail(){ printf '\n❌ %s\n' "$*" >&2; exit 1; }

for command_name in clasp curl node python3 gh; do
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
    | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d.get("version")=="1.27.0"; assert d.get("adminWriteEndpoint")=="pinned-deployment-config"; print("[OK] Worker 1.27 endpoint gate live")' 2>/dev/null; then
    WORKER_READY=1
    break
  fi
  sleep 5
done
[[ "$WORKER_READY" == "1" ]] || fail "Worker 1.27 ещё не live. Apps Script не изменён; повторите после deployment GitHub main."

mkdir -p "$BACKUP_DIR"
cd "$PROJECT_DIR"

info "CLASP PULL + BACKUP"
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
  30_MINIAPP_ADMIN_WRITE_BACKEND.js
  31_MINIAPP_ADMIN_WRITE_HARDENED.js
)
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
print('[OK] exact deployment endpoint injected into source')
PY
node --check "$TEMP_DIR/31_MINIAPP_ADMIN_WRITE_HARDENED.js"
grep -q "ADMIN_WRITE_ENDPOINT_NOT_PINNED" "$TEMP_DIR/30_MINIAPP_ADMIN_WRITE_BACKEND.js" \
  || fail "endpoint diagnostic marker missing"
grep -Fq "$WEBAPP_URL" "$TEMP_DIR/31_MINIAPP_ADMIN_WRITE_HARDENED.js" \
  || fail "exact endpoint injection missing"
ok "Backup: $BACKUP_DIR"

for file_name in "${FILES[@]}"; do
  cp -p "$TEMP_DIR/$file_name" "$file_name"
done

info "CLASP PUSH"
clasp status
clasp push
ok "Endpoint-safe Apps Script source pushed"

info "UPDATE EXISTING DEPLOYMENT ONLY"
if clasp update-deployment "$DEPLOY_ID" --description "$EXPECTED_DESC"; then :
elif clasp create-deployment --deploymentId "$DEPLOY_ID" --description "$EXPECTED_DESC"; then :
elif clasp deploy -i "$DEPLOY_ID" -d "$EXPECTED_DESC"; then :
else fail "Не удалось обновить существующий deployment. Новый deployment не создавался."; fi
ok "Existing deployment updated"

info "NON-MUTATING DIRECT ROUTE CHECK"
ROUTE_OK=0
for attempt in $(seq 1 10); do
  printf '[INFO] route check %s/10\n' "$attempt"
  BODY="$(curl -sS -L --max-time 30 -H 'Content-Type: application/x-www-form-urlencoded' \
    --data 'miniapp=1&action=admin-write&backend=1' "$WEBAPP_URL" || true)"
  if printf '%s' "$BODY" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d.get("error")=="INVALID_REQUEST_ID"; assert d.get("version")=="0.6.0-write.5"; print("[OK] exact write.5 route live")' 2>/dev/null; then
    ROUTE_OK=1
    break
  fi
  sleep 4
done
[[ "$ROUTE_OK" == "1" ]] || fail "Named deployment route не подтвердился. Не повторяйте команду."

info "REFRESH + VERIFY PRIVATE SNAPSHOT"
EXPORT_OUTPUT="$(clasp run MINIAPP_exportAdminSnapshotToGitHub 2>&1 || true)"
if [[ -n "$EXPORT_OUTPUT" ]]; then
  printf '%s\n' "$EXPORT_OUTPUT"
fi
if [[ "$EXPORT_OUTPUT" != *"Exception:"* && "$EXPORT_OUTPUT" != *"Error:"* ]]; then
  ok "Private snapshot export requested"
else
  warn "clasp run export вернул server/storage error; ждём штатный trigger без повторного deployment"
fi

SNAPSHOT_OK=0
for attempt in $(seq 1 30); do
  printf '[INFO] snapshot check %s/30\n' "$attempt"
  if gh api "repos/Antonsoloway/royal-crm-data/contents/admin-snapshot.json" \
    -H 'Accept: application/vnd.github.raw+json' 2>/dev/null \
    | python3 -c 'import json,sys; d=json.load(sys.stdin); expected=sys.argv[1]; a=d.get("adminData") or {}; w=a.get("write") or {}; assert a.get("version")=="0.6.0-write.5"; assert w.get("endpoint")==expected; assert w.get("endpointPinned") is True; assert w.get("endpointSource")=="deployment-constant"; print("[OK] private snapshot uses exact named deployment")' "$WEBAPP_URL" 2>/dev/null; then
    SNAPSHOT_OK=1
    break
  fi
  sleep 12
done
[[ "$SNAPSHOT_OK" == "1" ]] || fail "Private snapshot не подтвердил exact endpoint за полный trigger interval. Не повторяйте команду."

info "SYNC FACTUAL LIVE MIRROR TO GITHUB MAIN"
bash <(curl -fsSL "$RAW/scripts/sync-live-apps-script-to-github.sh")

printf '\n============================================================\n'
printf '✅✅✅ ADMIN WRITE ENDPOINT REPAIRED ✅✅✅\n'
printf 'Stable deployment: %s\n' "$EXPECTED_DESC"
printf 'Snapshot endpoint: exact installer-pinned deployment\n'
printf 'No participant or team was created, changed or deleted.\n'
printf '============================================================\n'
