#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${ROYAL_CRM_PROJECT_DIR:-$HOME/table-chp-1.3}"
REPO="Antonsoloway/Specnaz-mini-app"
RAW="https://raw.githubusercontent.com/${REPO}/main"
EXPECTED_DESC="Таблица ЧП 1.3"
CORE_FILE="01_CORE_MAIN.js"
CURRENT_PROP="ROYAL_CRM_WEBHOOK_SECRET_CURRENT"
PREVIOUS_PROP="ROYAL_CRM_WEBHOOK_SECRET_PREVIOUS"
ROTATION_PROP="ROYAL_CRM_WEBHOOK_SECRET_ROTATION_STARTED_AT"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$HOME/royal-crm-backups/security-webhook-stage-$STAMP"
SECRET_DIR="$HOME/.royal-crm-secrets"
NEXT_SECRET_FILE="$SECRET_DIR/chatkeeper-webhook-current-next.txt"
TMP_ROOT="$(mktemp -d /tmp/royal-security-webhook.XXXXXX)"
TOKEN="$(python3 - <<'PY'
import secrets
print(secrets.token_urlsafe(36))
PY
)"
TEMP_PARAM="__royal_security_stage"

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

mkdir -p "$BACKUP_DIR" "$SECRET_DIR"
chmod 700 "$SECRET_DIR"
cd "$PROJECT_DIR"

info "PULL FACTUAL LIVE APPS SCRIPT"
clasp status
clasp pull
[[ -f "$CORE_FILE" ]] || fail "$CORE_FILE не найден после clasp pull"
cp -p "$CORE_FILE" "$BACKUP_DIR/$CORE_FILE"
ok "Backup: $BACKUP_DIR"

OLD_SECRET_FILE="$TMP_ROOT/old-secret"
NEW_SECRET_FILE="$TMP_ROOT/new-secret"
python3 - "$CORE_FILE" "$OLD_SECRET_FILE" <<'PY'
import re, sys
from pathlib import Path
src = Path(sys.argv[1]).read_text(encoding='utf-8')
m = re.search(r"\bconst\s+SECRET\s*=\s*(['\"])(.*?)\1\s*;", src)
if not m:
    raise SystemExit('[ERROR] hardcoded SECRET not found; source may already be migrated')
secret = m.group(2)
if len(secret) < 8:
    raise SystemExit('[ERROR] extracted secret is unexpectedly short')
Path(sys.argv[2]).write_text(secret, encoding='utf-8')
PY
chmod 600 "$OLD_SECRET_FILE"
python3 - "$NEW_SECRET_FILE" <<'PY'
import secrets, sys
from pathlib import Path
Path(sys.argv[1]).write_text(secrets.token_urlsafe(48), encoding='utf-8')
PY
chmod 600 "$NEW_SECRET_FILE"
cp "$NEW_SECRET_FILE" "$NEXT_SECRET_FILE"
chmod 600 "$NEXT_SECRET_FILE"
ok "Новый webhook secret создан локально и НЕ публикуется"

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

info "TEMPORARILY MIGRATE SECRET VALUES INTO SCRIPT PROPERTIES"
python3 - "$CORE_FILE" "$TEMP_PARAM" "$TOKEN" "$OLD_SECRET_FILE" "$NEW_SECRET_FILE" "$CURRENT_PROP" "$PREVIOUS_PROP" "$ROTATION_PROP" <<'PY'
import json, sys
from pathlib import Path
path = Path(sys.argv[1])
param, token = sys.argv[2], sys.argv[3]
old = Path(sys.argv[4]).read_text(encoding='utf-8')
new = Path(sys.argv[5]).read_text(encoding='utf-8')
current_prop, previous_prop, rotation_prop = sys.argv[6:9]
text = path.read_text(encoding='utf-8')
anchor = 'function doGet(e) {\n'
if text.count(anchor) != 1:
    raise SystemExit('[ERROR] doGet anchor missing/ambiguous')
block = (
    'function doGet(e) {\n'
    '  // TEMP_SECURITY_WEBHOOK_STAGE: removed immediately after property migration.\n'
    f"  if (e && e.parameter && String(e.parameter[{json.dumps(param)}] || '') === {json.dumps(token)}) {{\n"
    '    var props = PropertiesService.getScriptProperties();\n'
    '    props.setProperties({\n'
    f"      {json.dumps(current_prop)}: {json.dumps(new)},\n"
    f"      {json.dumps(previous_prop)}: {json.dumps(old)},\n"
    f"      {json.dumps(rotation_prop)}: new Date().toISOString()\n"
    '    }, false);\n'
    '    return ContentService.createTextOutput(JSON.stringify({ok:true,currentConfigured:true,previousConfigured:true}))\n'
    '      .setMimeType(ContentService.MimeType.JSON);\n'
    '  }\n\n'
)
path.write_text(text.replace(anchor, block, 1), encoding='utf-8')
PY
node --check "$CORE_FILE"

if clasp push -f; then :; elif clasp push; then :; else cp -p "$BACKUP_DIR/$CORE_FILE" "$CORE_FILE"; fail "Temporary push failed"; fi
if clasp update-deployment "$DEPLOY_ID" --description "$EXPECTED_DESC"; then :
elif clasp create-deployment --deploymentId "$DEPLOY_ID" --description "$EXPECTED_DESC"; then :
elif clasp deploy -i "$DEPLOY_ID" -d "$EXPECTED_DESC"; then :
else cp -p "$BACKUP_DIR/$CORE_FILE" "$CORE_FILE"; fail "Temporary deployment update failed"; fi

MIGRATION_BODY="$(curl -sS -L --max-time 35 --get --data-urlencode "$TEMP_PARAM=$TOKEN" "$WEBAPP_URL")"
printf '%s' "$MIGRATION_BODY" | python3 -c '
import json,sys
obj=json.load(sys.stdin)
assert obj.get("ok") is True
assert obj.get("currentConfigured") is True
assert obj.get("previousConfigured") is True
' || fail "Script Properties migration was not confirmed"
ok "Script Properties configured without printing either secret"

info "REMOVE HARDCODED SECRET AND ENABLE DUAL-SECRET ROTATION WINDOW"
cp -p "$BACKUP_DIR/$CORE_FILE" "$CORE_FILE"
python3 - "$CORE_FILE" "$OLD_SECRET_FILE" "$NEW_SECRET_FILE" "$CURRENT_PROP" "$PREVIOUS_PROP" <<'PY'
import re, sys
from pathlib import Path
path = Path(sys.argv[1])
old = Path(sys.argv[2]).read_text(encoding='utf-8')
new = Path(sys.argv[3]).read_text(encoding='utf-8')
current_prop, previous_prop = sys.argv[4:6]
text = path.read_text(encoding='utf-8')
pattern = r"\bconst\s+SECRET\s*=\s*(['\"])(.*?)\1\s*;"
replacement = (
    "const ROYAL_CRM_WEBHOOK_SECRET_CURRENT_PROP = '" + current_prop + "';\n"
    "const ROYAL_CRM_WEBHOOK_SECRET_PREVIOUS_PROP = '" + previous_prop + "';"
)
text, n = re.subn(pattern, replacement, text, count=1)
if n != 1:
    raise SystemExit('[ERROR] SECRET declaration replacement failed')
helper_anchor = 'function doGet(e) {\n'
helpers = r'''function royalWebhookSecretSafeEqual_(left, right) {
  left = String(left || '');
  right = String(right || '');
  if (!left || !right) return false;
  var max = Math.max(left.length, right.length);
  var diff = left.length ^ right.length;
  for (var i = 0; i < max; i += 1) {
    diff |= left.charCodeAt(i % left.length) ^ right.charCodeAt(i % right.length);
  }
  return diff === 0;
}

function royalWebhookSecretMatch_(candidate) {
  var props = PropertiesService.getScriptProperties();
  var current = String(props.getProperty(ROYAL_CRM_WEBHOOK_SECRET_CURRENT_PROP) || '').trim();
  var previous = String(props.getProperty(ROYAL_CRM_WEBHOOK_SECRET_PREVIOUS_PROP) || '').trim();
  var value = String(candidate || '').trim();
  if (royalWebhookSecretSafeEqual_(value, current)) return 'current';
  if (royalWebhookSecretSafeEqual_(value, previous)) return 'previous';
  return '';
}

'''
if text.count(helper_anchor) != 1:
    raise SystemExit('[ERROR] doGet anchor missing/ambiguous in final source')
text = text.replace(helper_anchor, helpers + helper_anchor, 1)
old_check = "    if (clean_(data.secret) !== SECRET) {"
new_check = "    const webhookSecretSlot = royalWebhookSecretMatch_(data.secret);\n    if (!webhookSecretSlot) {"
if text.count(old_check) != 1:
    raise SystemExit('[ERROR] webhook secret check anchor missing/ambiguous')
text = text.replace(old_check, new_check, 1)
if old in text or new in text:
    raise SystemExit('[ERROR] secret literal remained in final source')
if re.search(pattern, text):
    raise SystemExit('[ERROR] hardcoded SECRET declaration remained')
path.write_text(text, encoding='utf-8')
PY
node --check "$CORE_FILE"

grep -Fq "$CURRENT_PROP" "$CORE_FILE" || fail "current secret property reference missing"
grep -Fq "$PREVIOUS_PROP" "$CORE_FILE" || fail "previous secret property reference missing"
if grep -Eq "const[[:space:]]+SECRET[[:space:]]*=" "$CORE_FILE"; then fail "hardcoded SECRET still present"; fi

if clasp push -f; then :; elif clasp push; then :; else fail "Final secret-hardening push failed"; fi
if clasp update-deployment "$DEPLOY_ID" --description "$EXPECTED_DESC"; then :
elif clasp create-deployment --deploymentId "$DEPLOY_ID" --description "$EXPECTED_DESC"; then :
elif clasp deploy -i "$DEPLOY_ID" -d "$EXPECTED_DESC"; then :
else fail "Final deployment update failed"; fi

HEALTH_BODY="$(curl -sS -L --max-time 35 "$WEBAPP_URL" || true)"
printf '%s' "$HEALTH_BODY" | grep -Fq 'is alive' || fail "Apps Script health-check failed after hardening"
ok "Existing deployment remains alive"

info "SYNC FACTUAL LIVE APPS SCRIPT MIRROR"
bash <(curl -fsSL "$RAW/scripts/sync-live-apps-script-to-github.sh")

info "RECORD SECURITY STATE"
DOC_REPO="$TMP_ROOT/docs-repo"
gh repo clone "$REPO" "$DOC_REPO" -- --depth=1 >/dev/null
python3 - "$DOC_REPO/CURRENT_STATE.md" "$DOC_REPO/WORK_HISTORY.md" "$DOC_REPO/RELEASE_RULES.md" <<'PY'
import sys
from pathlib import Path
state_path, history_path, rules_path = map(Path, sys.argv[1:4])
tag='SECURITY_SHEETS_WEBHOOK_STAGE_20260823'
state=state_path.read_text(encoding='utf-8')
if tag not in state:
    state += f'''\n\n---\n\n## Security hardening — 23.08.2026 [{tag}]\n\n- Обе рабочие Google Sheets переведены из `anyone:writer` в Restricted; Drive metadata после изменения показывает только owner permission и `shared=false`.\n- Это не меняет runtime-модель: Apps Script deployment `Таблица ЧП 1.3` остаётся `executeAs=USER_DEPLOYING`, поэтому `SpreadsheetApp.openById(...)` продолжает работать от имени владельца.\n- Публичный Apps Script web-app endpoint не закрывался: внешний API по-прежнему требует доступ через deployment, а не прямой доступ к Sheets.\n- Hardcoded webhook credential удалён из текущего live source и перенесён в Script Properties.\n- Начата безопасная staged rotation: новый current secret хранится только в Script Properties/локальном защищённом файле Cloud Shell; прежний secret временно принят как previous, чтобы не остановить действующий ChatKeeper webhook до переключения отправителя.\n- Финальный security шаг: заменить secret в ChatKeeper на новый current, затем удалить previous property отдельным финализатором.\n'''
    state_path.write_text(state, encoding='utf-8')
history=history_path.read_text(encoding='utf-8')
if tag not in history:
    history += f'''\n\n---\n\n### 23.08.2026 18:40+03 — Sheets lockdown + webhook credential staging [{tag}]\n\n**Выполнено:** обе production-таблицы закрыты от anonymous link access; live Apps Script сохранён на существующем deployment; webhook credential вынесен из публичного кода в Script Properties; включено dual-secret окно ротации без остановки действующих webhook-событий; live mirror после push синхронизирован обратно в GitHub.\n\n**Важно:** новый secret нигде не коммитится и не пишется в handoff. Старый public credential остаётся временно валиден только как `previous` до ручного переключения ChatKeeper, после чего должен быть удалён финализатором.\n'''
    history_path.write_text(history, encoding='utf-8')
rules=rules_path.read_text(encoding='utf-8')
rule='- Production Google Sheets MUST remain Restricted: no `anyone` reader/writer permission; Apps Script accesses them as the deploying owner.'
secret_rule='- Secrets/tokens/webhook credentials MUST live only in Script Properties, Cloudflare secrets or another private secret store; literal credentials are forbidden in public GitHub source/mirror/docs.'
if rule not in rules:
    rules += '\n\n## Security invariants\n\n' + rule + '\n' + secret_rule + '\n'
elif secret_rule not in rules:
    rules += '\n' + secret_rule + '\n'
rules_path.write_text(rules, encoding='utf-8')
PY
cd "$DOC_REPO"
git add CURRENT_STATE.md WORK_HISTORY.md RELEASE_RULES.md
if ! git diff --cached --quiet; then
  git config user.name "Royal CRM Security"
  git config user.email "royal-crm-security@users.noreply.github.com"
  git commit -m "Record Sheets lockdown and webhook secret staging" >/dev/null
  git push origin HEAD:main
fi
ok "CURRENT_STATE.md + WORK_HISTORY.md + RELEASE_RULES.md updated"

printf '\n============================================================\n'
printf '✅✅✅ SECURITY STAGE COMPLETE ✅✅✅\n'
printf 'Sheets: Restricted (verified before rollout)\n'
printf 'Existing deployment preserved: %s\n' "$EXPECTED_DESC"
printf 'Hardcoded webhook secret removed from current live source\n'
printf 'New ChatKeeper secret stored ONLY at:\n  %s\n' "$NEXT_SECRET_FILE"
printf 'Old secret remains accepted only as temporary previous value\n'
printf 'Next step: update ChatKeeper secret, then run rotation finalizer\n'
printf '============================================================\n'
