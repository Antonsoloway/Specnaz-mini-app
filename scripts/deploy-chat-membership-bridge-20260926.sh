#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${ROYAL_CRM_PROJECT_DIR:-$HOME/table-chp-1.3}"
REPO="Antonsoloway/Specnaz-mini-app"
RAW="https://raw.githubusercontent.com/${REPO}/main/apps-script-live"
EXPECTED_DESC="Таблица ЧП 1.3"
CORE_QUEUE="05_RELIABLE_WEBHOOK_QUEUE.js"
INGRESS="36_GOLUB_OWNER_WEBHOOK_INGRESS.js"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$HOME/royal-crm-backups/chat-membership-bridge-$STAMP"
TMP_DIR="$(mktemp -d /tmp/royal-chat-membership-bridge.XXXXXX)"
DEPLOY_ID=""

cleanup(){ rm -rf "$TMP_DIR"; }
trap cleanup EXIT
ok(){ printf '\n✅ %s\n' "$*"; }
info(){ printf '\n=== %s ===\n' "$*"; }
fail(){ printf '\n❌ %s\n' "$*" >&2; exit 1; }

for cmd in clasp curl node grep sed cp mkdir; do
  command -v "$cmd" >/dev/null 2>&1 || fail "$cmd не найден"
done
[[ -d "$PROJECT_DIR" ]] || fail "Apps Script каталог не найден: $PROJECT_DIR"
[[ -f "$PROJECT_DIR/.clasp.json" ]] || fail ".clasp.json не найден: $PROJECT_DIR/.clasp.json"

mkdir -p "$BACKUP_DIR"
cd "$PROJECT_DIR"

info "PULL FACTUAL LIVE APPS SCRIPT"
clasp status
clasp pull
[[ -f "$CORE_QUEUE" ]] || fail "$CORE_QUEUE отсутствует после clasp pull"
[[ -f "$INGRESS" ]] || fail "$INGRESS отсутствует после clasp pull"
cp -p "$CORE_QUEUE" "$BACKUP_DIR/$CORE_QUEUE"
cp -p "$INGRESS" "$BACKUP_DIR/$INGRESS"
ok "Backup: $BACKUP_DIR"

info "FETCH TESTED FIX FROM GITHUB MAIN"
curl -fsSL "$RAW/$CORE_QUEUE" -o "$TMP_DIR/$CORE_QUEUE"
curl -fsSL "$RAW/$INGRESS" -o "$TMP_DIR/$INGRESS"

grep -Fq "GOLUB_OWNER_WEBHOOK_VERSION = '2.9.1'" "$TMP_DIR/$INGRESS" \
  || fail "Ожидаемая версия ingress 2.9.1 не найдена"
grep -Fq "function GOLUB_OWNER_prepareGroupMembershipEvent_" "$TMP_DIR/$INGRESS" \
  || fail "Membership bridge отсутствует"
grep -Fq "GOLUB_OWNER_prepareGroupMembershipEvent_" "$TMP_DIR/$CORE_QUEUE" \
  || fail "Reliable queue hook отсутствует"

node --check "$TMP_DIR/$CORE_QUEUE"
node --check "$TMP_DIR/$INGRESS"
ok "Source guards PASS"

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
ok "Existing deployment selected"

restore_source_only(){
  cp -p "$BACKUP_DIR/$CORE_QUEUE" "$CORE_QUEUE"
  cp -p "$BACKUP_DIR/$INGRESS" "$INGRESS"
}

update_existing_deployment(){
  if clasp update-deployment "$DEPLOY_ID" --description "$EXPECTED_DESC"; then return 0; fi
  if clasp create-deployment --deploymentId "$DEPLOY_ID" --description "$EXPECTED_DESC"; then return 0; fi
  if clasp deploy -i "$DEPLOY_ID" -d "$EXPECTED_DESC"; then return 0; fi
  return 1
}

rollback_live(){
  printf '\n⚠️ ROLLBACK: restoring previous Apps Script source and deployment\n' >&2
  restore_source_only
  clasp push -f >/dev/null
  update_existing_deployment >/dev/null
  printf '✅ Rollback complete\n' >&2
}

info "APPLY ONLY THE TWO FIXED FILES"
cp -p "$TMP_DIR/$CORE_QUEUE" "$CORE_QUEUE"
cp -p "$TMP_DIR/$INGRESS" "$INGRESS"
node --check "$CORE_QUEUE"
node --check "$INGRESS"

info "PUSH SOURCE"
if ! clasp push -f; then
  restore_source_only
  fail "clasp push failed; local source restored, production deployment unchanged"
fi

info "UPDATE EXISTING DEPLOYMENT"
if ! update_existing_deployment; then
  restore_source_only
  clasp push -f >/dev/null || true
  fail "Deployment update failed; previous source restored. Existing production deployment was not replaced."
fi

info "HEALTH CHECK"
HEALTH=""
for attempt in $(seq 1 8); do
  HEALTH="$(curl -sS -L --max-time 35 "$WEBAPP_URL" || true)"
  if printf '%s' "$HEALTH" | grep -Fq "Royal CRM webhook v2.2.6 is alive"; then
    ok "Production health PASS"
    break
  fi
  if [[ "$attempt" == "8" ]]; then
    rollback_live
    printf '%s\n' "$HEALTH" | head -c 1200 >&2 || true
    fail "Health check failed; automatic rollback completed"
  fi
  sleep 4
done

info "VERIFY DEPLOYED SOURCE MARKERS"
clasp pull >/dev/null
grep -Fq "GOLUB_OWNER_WEBHOOK_VERSION = '2.9.1'" "$INGRESS" \
  || { rollback_live; fail "Deployed ingress marker missing; rollback completed"; }
grep -Fq "GOLUB_OWNER_prepareGroupMembershipEvent_" "$CORE_QUEUE" \
  || { rollback_live; fail "Deployed queue hook missing; rollback completed"; }

printf '\n============================================================\n'
printf '✅✅✅ CHAT MEMBERSHIP BRIDGE DEPLOYED ✅✅✅\n'
printf 'Existing deployment preserved: %s\n' "$EXPECTED_DESC"
printf 'Ingress version: 2.9.1\n'
printf 'Changed live files: %s, %s\n' "$CORE_QUEUE" "$INGRESS"
printf 'Setup/upgrade functions: NOT RUN\n'
printf 'Webhook URLs: NOT CHANGED\n'
printf 'Backup: %s\n' "$BACKUP_DIR"
printf '============================================================\n'
