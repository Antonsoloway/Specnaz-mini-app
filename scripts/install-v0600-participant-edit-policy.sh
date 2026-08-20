#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${ROYAL_CRM_PROJECT_DIR:-$HOME/table-chp-1.3}"
REPO="Antonsoloway/Specnaz-mini-app"
RAW="https://raw.githubusercontent.com/${REPO}/main"
EXPECTED_DESC="Таблица ЧП 1.3"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$HOME/royal-crm-backups/v0600-participant-policy-$STAMP"

ok(){ printf '\n✅ %s\n' "$*"; }
info(){ printf '\n[INFO] %s\n' "$*"; }
fail(){ printf '\n❌ %s\n' "$*" >&2; exit 1; }

command -v clasp >/dev/null 2>&1 || fail "clasp не найден"
command -v python3 >/dev/null 2>&1 || fail "python3 не найден"
command -v node >/dev/null 2>&1 || fail "node не найден"
command -v curl >/dev/null 2>&1 || fail "curl не найден"
[[ -d "$PROJECT_DIR" ]] || fail "Apps Script каталог не найден: $PROJECT_DIR"
[[ -f "$PROJECT_DIR/.clasp.json" ]] || fail ".clasp.json не найден в $PROJECT_DIR"

mkdir -p "$BACKUP_DIR"
cd "$PROJECT_DIR"

info "CLASP STATUS BEFORE PULL"
clasp status

info "CLASP PULL — берём фактический live source"
clasp pull

FILE="31_MINIAPP_ADMIN_WRITE_HARDENED.js"
[[ -f "$FILE" ]] || fail "$FILE не найден после clasp pull"
cp -p "$FILE" "$BACKUP_DIR/$FILE"
ok "Backup: $BACKUP_DIR/$FILE"

info "PATCH PARTICIPANT UPDATE POLICY"
python3 - <<'PY'
from pathlib import Path

path = Path('31_MINIAPP_ADMIN_WRITE_HARDENED.js')
text = path.read_text(encoding='utf-8')
marker = "PARTICIPANT_BOT_FIELDS_READ_ONLY_V0600"
if marker in text:
    print('[OK] participant policy guard already present')
else:
    old = """  var normalized = MINIAPP_adminWriteHardenedNormalizeParticipantInput_(ctx.ss, ctx.payload.changes || {}, false);\n  if (!normalized.ok) return normalized;\n"""
    if old not in text:
        raise SystemExit('[ERROR] expected participant normalization anchor not found; refusing blind patch')
    new = """  // PARTICIPANT_BOT_FIELDS_READ_ONLY_V0600\n  // Existing participant: admins may manually change only CRM name and the\n  // five membership slots (team / role / in-game nickname). Telegram identity,\n  // Telegram profile fields, counters, date and chat state are bot/system-owned.\n  var requestedChanges = ctx.payload && ctx.payload.changes || {};\n  var allowedManualFields = { name: true, memberships: true };\n  var forbiddenManualFields = Object.keys(requestedChanges).filter(function(key) {\n    return !allowedManualFields[key];\n  });\n  if (forbiddenManualFields.length) {\n    return MINIAPP_adminWriteError_(\n      'PARTICIPANT_FIELD_READ_ONLY',\n      'Telegram-данные, статус, дата и счётчики участника заполняются ботом и недоступны для ручного изменения.'\n    );\n  }\n\n  var normalized = MINIAPP_adminWriteHardenedNormalizeParticipantInput_(ctx.ss, requestedChanges, false);\n  if (!normalized.ok) return normalized;\n"""
    text = text.replace(old, new, 1)
    path.write_text(text, encoding='utf-8')
    print('[OK] participant update policy guard installed')
PY

info "SYNTAX + POLICY CHECK"
node --check "$FILE"
grep -q "PARTICIPANT_BOT_FIELDS_READ_ONLY_V0600" "$FILE" || fail "Policy marker missing"
grep -q "allowedManualFields = { name: true, memberships: true }" "$FILE" || fail "Allowed-field guard missing"
ok "Syntax and policy checks passed"

info "CLASP STATUS BEFORE PUSH"
clasp status

info "CLASP PUSH"
clasp push
ok "Apps Script source pushed"

info "SELECT EXISTING DEPLOYMENT: $EXPECTED_DESC"
DEPLOY_OUTPUT=""
if DEPLOY_OUTPUT="$(clasp list-deployments 2>&1)"; then :
elif DEPLOY_OUTPUT="$(clasp deployments 2>&1)"; then :
else fail "Не удалось получить список deployments"; fi
printf '%s\n' "$DEPLOY_OUTPUT"
mapfile -t MATCHES < <(printf '%s\n' "$DEPLOY_OUTPUT" | grep -F "$EXPECTED_DESC" || true)
[[ ${#MATCHES[@]} -eq 1 ]] || fail "Найдено ${#MATCHES[@]} deployment '$EXPECTED_DESC'; ожидался ровно 1. HTTP deployment не изменён."
LINE="${MATCHES[0]}"
printf '%s\n' "$LINE" | grep -q '@HEAD' && fail "Стабильный deployment неожиданно @HEAD; ничего не меняем"
DEPLOY_ID="$(printf '%s\n' "$LINE" | sed -E 's/^[[:space:]]*-[[:space:]]+([^[:space:]]+).*/\1/')"
[[ "$DEPLOY_ID" =~ ^[A-Za-z0-9_-]{20,}$ ]] || fail "Не удалось извлечь deployment ID"

info "UPDATE EXISTING DEPLOYMENT ONLY"
if clasp update-deployment "$DEPLOY_ID" --description "$EXPECTED_DESC"; then :
elif clasp create-deployment --deploymentId "$DEPLOY_ID" --description "$EXPECTED_DESC"; then :
elif clasp deploy -i "$DEPLOY_ID" -d "$EXPECTED_DESC"; then :
else fail "Не удалось обновить существующий deployment. Новый deployment НЕ создавался."; fi
ok "Existing deployment updated"

WEBAPP_URL="https://script.google.com/macros/s/${DEPLOY_ID}/exec"
info "NON-MUTATING WRITE ROUTE CHECK"
ROUTE_OK=0
for i in $(seq 1 10); do
  printf '[INFO] route check %s/10\n' "$i"
  BODY="$(curl -sS -L --max-time 30 -H 'Content-Type: application/x-www-form-urlencoded' --data 'miniapp=1&action=admin-write&backend=1' "$WEBAPP_URL" || true)"
  if printf '%s' "$BODY" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d.get("error")=="INVALID_REQUEST_ID"; assert d.get("version")=="0.6.0-write.4"; print("[OK] write.4 route live")' 2>/dev/null; then
    ROUTE_OK=1
    break
  fi
  sleep 4
done
[[ "$ROUTE_OK" == "1" ]] || fail "Deployment обновлён, но write.4 route не подтверждён. Не повторяйте команду; пришлите экран."

info "SYNC FACTUAL LIVE MIRROR TO GITHUB MAIN"
bash <(curl -fsSL "$RAW/scripts/sync-live-apps-script-to-github.sh")
ok "Live Apps Script mirror synced"

printf '\n============================================================\n'
printf '✅✅✅ V0.6 PARTICIPANT EDIT POLICY READY ✅✅✅\n'
printf 'Existing participant manual fields: NAME + MEMBERSHIPS ONLY\n'
printf 'Bot/system fields: SERVER-READ-ONLY\n'
printf 'Stable deployment preserved: %s\n' "$EXPECTED_DESC"
printf 'No participant/team record was changed by this installer.\n'
printf '============================================================\n'
