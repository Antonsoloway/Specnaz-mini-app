#!/usr/bin/env bash
set -Eeuo pipefail

[[ "${ROYAL_CHATKEEPER_SECRET_UPDATED:-}" == "YES" ]] || {
  echo "❌ Сначала обновите secret в ChatKeeper, затем запустите с ROYAL_CHATKEEPER_SECRET_UPDATED=YES" >&2
  exit 1
}

PROJECT_DIR="${ROYAL_CRM_PROJECT_DIR:-$HOME/table-chp-1.3}"
REPO="Antonsoloway/Specnaz-mini-app"
RAW="https://raw.githubusercontent.com/${REPO}/main"
EXPECTED_DESC="Таблица ЧП 1.3"
CORE_FILE="01_CORE_MAIN.js"
CURRENT_PROP="ROYAL_CRM_WEBHOOK_SECRET_CURRENT"
PREVIOUS_PROP="ROYAL_CRM_WEBHOOK_SECRET_PREVIOUS"
FINALIZED_PROP="ROYAL_CRM_WEBHOOK_SECRET_ROTATION_FINALIZED_AT"
NEXT_SECRET_FILE="$HOME/.royal-crm-secrets/chatkeeper-webhook-current-next.txt"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$HOME/royal-crm-backups/security-webhook-finalize-$STAMP"
TMP_ROOT="$(mktemp -d /tmp/royal-security-webhook-finalize.XXXXXX)"
TOKEN="$(python3 - <<'PY'
import secrets
print(secrets.token_urlsafe(36))
PY
)"
TEMP_PARAM="__royal_security_finalize"

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
[[ -f "$CORE_FILE" ]] || fail "$CORE_FILE не найден"
cp -p "$CORE_FILE" "$BACKUP_DIR/$CORE_FILE"

grep -Fq "$CURRENT_PROP" "$CORE_FILE" || fail "Stage migration не найдена: current property reference отсутствует"
grep -Fq "$PREVIOUS_PROP" "$CORE_FILE" || fail "Stage migration не найдена: previous property reference отсутствует"
if grep -Eq "const[[:space:]]+SECRET[[:space:]]*=" "$CORE_FILE"; then fail "Hardcoded SECRET снова появился"; fi

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

info "TEMPORARILY REMOVE PREVIOUS SECRET FROM SCRIPT PROPERTIES"
python3 - "$CORE_FILE" "$TEMP_PARAM" "$TOKEN" "$CURRENT_PROP" "$PREVIOUS_PROP" "$FINALIZED_PROP" <<'PY'
import json, sys
from pathlib import Path
path = Path(sys.argv[1])
param, token, current_prop, previous_prop, finalized_prop = sys.argv[2:7]
text = path.read_text(encoding='utf-8')
anchor = 'function doGet(e) {\n'
if text.count(anchor) != 1:
    raise SystemExit('[ERROR] doGet anchor missing/ambiguous')
block = (
    'function doGet(e) {\n'
    '  // TEMP_SECURITY_WEBHOOK_FINALIZE: removed immediately after rotation finalization.\n'
    f"  if (e && e.parameter && String(e.parameter[{json.dumps(param)}] || '') === {json.dumps(token)}) {{\n"
    '    var props = PropertiesService.getScriptProperties();\n'
    f"    var current = String(props.getProperty({json.dumps(current_prop)}) || '').trim();\n"
    '    if (!current) return ContentService.createTextOutput(JSON.stringify({ok:false,error:\"CURRENT_SECRET_MISSING\"})).setMimeType(ContentService.MimeType.JSON);\n'
    f"    props.deleteProperty({json.dumps(previous_prop)});\n"
    f"    props.setProperty({json.dumps(finalized_prop)}, new Date().toISOString());\n"
    f"    var previousAfter = String(props.getProperty({json.dumps(previous_prop)}) || '');\n"
    '    return ContentService.createTextOutput(JSON.stringify({ok:true,currentConfigured:true,previousRemoved:previousAfter === \"\"}))\n'
    '      .setMimeType(ContentService.MimeType.JSON);\n'
    '  }\n\n'
)
path.write_text(text.replace(anchor, block, 1), encoding='utf-8')
PY
node --check "$CORE_FILE"

if clasp push -f; then :; elif clasp push; then :; else cp -p "$BACKUP_DIR/$CORE_FILE" "$CORE_FILE"; fail "Temporary finalize push failed"; fi
if clasp update-deployment "$DEPLOY_ID" --description "$EXPECTED_DESC"; then :
elif clasp create-deployment --deploymentId "$DEPLOY_ID" --description "$EXPECTED_DESC"; then :
elif clasp deploy -i "$DEPLOY_ID" -d "$EXPECTED_DESC"; then :
else cp -p "$BACKUP_DIR/$CORE_FILE" "$CORE_FILE"; fail "Temporary finalize deployment update failed"; fi

BODY="$(curl -sS -L --max-time 35 --get --data-urlencode "$TEMP_PARAM=$TOKEN" "$WEBAPP_URL")"
printf '%s' "$BODY" | python3 -c '
import json,sys
obj=json.load(sys.stdin)
assert obj.get("ok") is True
assert obj.get("currentConfigured") is True
assert obj.get("previousRemoved") is True
' || fail "Previous secret removal was not confirmed"
ok "Previous secret removed from Script Properties"

info "REMOVE TEMP ROUTE"
cp -p "$BACKUP_DIR/$CORE_FILE" "$CORE_FILE"
node --check "$CORE_FILE"
if clasp push -f; then :; elif clasp push; then :; else fail "Не удалось удалить temporary route"; fi
if clasp update-deployment "$DEPLOY_ID" --description "$EXPECTED_DESC"; then :
elif clasp create-deployment --deploymentId "$DEPLOY_ID" --description "$EXPECTED_DESC"; then :
elif clasp deploy -i "$DEPLOY_ID" -d "$EXPECTED_DESC"; then :
else fail "Не удалось обновить deployment после удаления temporary route"; fi

HEALTH_BODY="$(curl -sS -L --max-time 35 "$WEBAPP_URL" || true)"
printf '%s' "$HEALTH_BODY" | grep -Fq 'is alive' || fail "Apps Script health-check failed after rotation finalization"

info "SYNC FACTUAL LIVE APPS SCRIPT MIRROR"
bash <(curl -fsSL "$RAW/scripts/sync-live-apps-script-to-github.sh")

info "RECORD FINAL SECURITY STATE"
DOC_REPO="$TMP_ROOT/docs-repo"
gh repo clone "$REPO" "$DOC_REPO" -- --depth=1 >/dev/null
python3 - "$DOC_REPO/CURRENT_STATE.md" "$DOC_REPO/WORK_HISTORY.md" <<'PY'
import sys
from pathlib import Path
state_path, history_path = map(Path, sys.argv[1:3])
tag='SECURITY_WEBHOOK_ROTATION_FINAL_20260823'
state=state_path.read_text(encoding='utf-8')
if tag not in state:
    state += f'''\n\n---\n\n## Webhook secret rotation finalized — 23.08.2026 [{tag}]\n\n- ChatKeeper sender переведён на новый webhook secret.\n- `ROYAL_CRM_WEBHOOK_SECRET_PREVIOUS` удалён из Script Properties; публично раскрытый legacy credential больше не принимается.\n- Единственный действующий webhook secret хранится только в Script Properties; в текущем public Apps Script mirror literal credential отсутствует.\n- Existing deployment `Таблица ЧП 1.3` сохранён; temporary migration route удалён.\n'''
    state_path.write_text(state, encoding='utf-8')
history=history_path.read_text(encoding='utf-8')
if tag not in history:
    history += f'''\n\n---\n\n### 23.08.2026 — webhook secret rotation finalized [{tag}]\n\nПосле переключения ChatKeeper на новый secret удалён temporary previous credential из Script Properties. Live Apps Script повторно синхронизирован в GitHub, hardcoded credential в current source отсутствует, существующий deployment сохранён.\n'''
    history_path.write_text(history, encoding='utf-8')
PY
cd "$DOC_REPO"
git add CURRENT_STATE.md WORK_HISTORY.md
if ! git diff --cached --quiet; then
  git config user.name "Royal CRM Security"
  git config user.email "royal-crm-security@users.noreply.github.com"
  git commit -m "Finalize webhook secret rotation" >/dev/null
  git push origin HEAD:main
fi

if [[ -f "$NEXT_SECRET_FILE" ]]; then
  rm -f "$NEXT_SECRET_FILE"
fi

printf '\n============================================================\n'
printf '✅✅✅ WEBHOOK SECRET ROTATION FINALIZED ✅✅✅\n'
printf 'Previous public credential: REVOKED\n'
printf 'Current secret: Script Properties only\n'
printf 'Existing deployment preserved: %s\n' "$EXPECTED_DESC"
printf 'Temporary route removed\n'
printf 'Live Apps Script mirror synced\n'
printf 'CURRENT_STATE.md + WORK_HISTORY.md updated\n'
printf '============================================================\n'
