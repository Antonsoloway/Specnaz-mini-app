#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${ROYAL_CRM_PROJECT_DIR:-$HOME/table-chp-1.3}"
REPO="Antonsoloway/Specnaz-mini-app"
BRANCH="v0.6-admin-write"
RAW="https://raw.githubusercontent.com/${REPO}/${BRANCH}"
DATA_REPO="Antonsoloway/royal-crm-data"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$HOME/royal-crm-backups/v0600-admin-write-$STAMP"

ok(){ printf '\n✅ %s\n' "$*"; }
info(){ printf '\n[INFO] %s\n' "$*"; }
warn(){ printf '\n[WARN] %s\n' "$*"; }
fail(){ printf '\n❌ %s\n' "$*" >&2; exit 1; }

command -v clasp >/dev/null 2>&1 || fail "clasp не найден"
command -v python3 >/dev/null 2>&1 || fail "python3 не найден"
command -v node >/dev/null 2>&1 || fail "node не найден"
command -v curl >/dev/null 2>&1 || fail "curl не найден"
command -v gh >/dev/null 2>&1 || fail "gh не найден"
gh auth status >/dev/null 2>&1 || fail "GitHub CLI не авторизован"
[[ -d "$PROJECT_DIR" ]] || fail "Apps Script каталог не найден: $PROJECT_DIR"
[[ -f "$PROJECT_DIR/.clasp.json" ]] || fail ".clasp.json не найден в $PROJECT_DIR"

mkdir -p "$BACKUP_DIR/pre-pull" "$BACKUP_DIR/live-before-patch"
cd "$PROJECT_DIR"

info "CLASP VERSION"
clasp --version || true

info "CLASP STATUS BEFORE PULL"
clasp status

for f in \
  12_MINI_APP_API.js \
  28_MINIAPP_ADMIN_DATA.js \
  29_MINIAPP_ADMIN_WRITE.js \
  30_MINIAPP_ADMIN_WRITE_BACKEND.js \
  31_MINIAPP_ADMIN_WRITE_HARDENED.js; do
  [[ ! -f "$f" ]] || cp -p "$f" "$BACKUP_DIR/pre-pull/$f"
done
ok "Pre-pull backup: $BACKUP_DIR/pre-pull"

info "CLASP PULL — получаем ФАКТИЧЕСКИЙ live source"
clasp pull

for f in 12_MINI_APP_API.js 28_MINIAPP_ADMIN_DATA.js; do
  [[ -f "$f" ]] || fail "$f не найден после clasp pull"
  cp -p "$f" "$BACKUP_DIR/live-before-patch/$f"
done
for f in 29_MINIAPP_ADMIN_WRITE.js 30_MINIAPP_ADMIN_WRITE_BACKEND.js 31_MINIAPP_ADMIN_WRITE_HARDENED.js; do
  [[ ! -f "$f" ]] || cp -p "$f" "$BACKUP_DIR/live-before-patch/$f"
done
ok "Factual live backup: $BACKUP_DIR/live-before-patch"

info "Загружаем изолированные write-модули 29 + 30 + 31"
curl -fsSL "$RAW/apps-script-live/29_MINIAPP_ADMIN_WRITE.js" -o 29_MINIAPP_ADMIN_WRITE.js
curl -fsSL "$RAW/apps-script-live/30_MINIAPP_ADMIN_WRITE_BACKEND.js" -o 30_MINIAPP_ADMIN_WRITE_BACKEND.js
curl -fsSL "$RAW/apps-script-live/31_MINIAPP_ADMIN_WRITE_HARDENED.js" -o 31_MINIAPP_ADMIN_WRITE_HARDENED.js

info "Патчим ТОЛЬКО проверенные integration hooks: 12 API POST router + 28 private admin snapshot"
python3 - <<'PY'
from pathlib import Path

api_path = Path('12_MINI_APP_API.js')
admin_path = Path('28_MINIAPP_ADMIN_DATA.js')
api = api_path.read_text(encoding='utf-8')
admin = admin_path.read_text(encoding='utf-8')

# ---- 12_MINI_APP_API.js ---------------------------------------------------
marker = 'MINIAPP_adminWriteBackendMaybeHandle_(e)'
if marker not in api:
    anchor = "function MINIAPP_doPost_(e) {\n  let result;\n"
    if anchor not in api:
        raise SystemExit('[ERROR] 12 doPost anchor missing; refusing blind patch')
    replacement = """function MINIAPP_doPost_(e) {\n  // v0.6 admin write: only signed Worker -> Apps Script POSTs are accepted.\n  if (typeof MINIAPP_adminWriteBackendMaybeHandle_ === 'function') {\n    const adminWriteResponse = MINIAPP_adminWriteBackendMaybeHandle_(e);\n    if (adminWriteResponse) return adminWriteResponse;\n  }\n\n  let result;\n"""
    api = api.replace(anchor, replacement, 1)
    print('[OK] 12_MINI_APP_API.js -> signed admin-write POST hook')
else:
    print('[OK] 12 signed admin-write hook already present')

api = api.replace('Версия 0.2.4', 'Версия 0.2.5', 1)
api = api.replace("const MINIAPP_VERSION = '0.2.4';", "const MINIAPP_VERSION = '0.2.5';", 1)

# IMPORTANT: browser -> Apps Script direct write route is forbidden.
if 'MINIAPP_adminWriteMaybeHandle_(e)' in api:
    raise SystemExit('[ERROR] Direct browser -> Apps Script write hook detected in 12; refusing deployment')

# ---- 28_MINIAPP_ADMIN_DATA.js --------------------------------------------
anchor = "  var participants = MINIAPP_adminReadParticipants_(base);\n  var teams = MINIAPP_adminReadTeams_(ss, teamsSheet);\n"
if anchor not in admin:
    raise SystemExit('[ERROR] 28 participant/team anchor missing; refusing blind patch')

old_revision_blocks = [
"""\n  // v0.6 write layer: optimistic concurrency revisions.\n  if (typeof MINIAPP_adminWriteDecorateRevisions_ === 'function') {\n    MINIAPP_adminWriteDecorateRevisions_(participants, teams);\n  }\n""",
"""\n  // v0.6 write layer adds optimistic concurrency revisions without changing\n  // the read contract when module 29 is absent.\n  if (typeof MINIAPP_adminWriteDecorateRevisions_ === 'function') {\n    MINIAPP_adminWriteDecorateRevisions_(participants, teams);\n  }\n"""
]
for block in old_revision_blocks:
    admin = admin.replace(block, '')

hardened_revision = """\n  // v0.6 hardened write: revisions include every field the admin can edit.\n  if (typeof MINIAPP_adminWriteHardenedDecorateRevisions_ === 'function') {\n    MINIAPP_adminWriteHardenedDecorateRevisions_(participants, teams);\n  }\n"""
if 'MINIAPP_adminWriteHardenedDecorateRevisions_(participants, teams)' not in admin:
    admin = admin.replace(anchor, anchor + hardened_revision, 1)

# Normalize any earlier write metadata block back to a stable anchor.
old_meta_blocks = [
"""    teams: teams,\n    write: typeof MINIAPP_adminWriteAdminMeta_ === 'function'\n      ? MINIAPP_adminWriteAdminMeta_()\n      : { enabled: false, deleteEnabled: false },\n    stats: {\n""",
"""    teams: teams,\n    write: typeof MINIAPP_adminWriteV2AdminMeta_ === 'function'\n      ? MINIAPP_adminWriteV2AdminMeta_()\n      : { enabled: false, deleteEnabled: false },\n    stats: {\n"""
]
for block in old_meta_blocks:
    admin = admin.replace(block, "    teams: teams,\n    stats: {\n")

if 'MINIAPP_adminWriteHardenedMeta_()' not in admin:
    meta_anchor = "    teams: teams,\n    stats: {\n"
    if meta_anchor not in admin:
        raise SystemExit('[ERROR] 28 write metadata anchor missing; refusing blind patch')
    admin = admin.replace(meta_anchor, """    teams: teams,\n    write: typeof MINIAPP_adminWriteHardenedMeta_ === 'function'\n      ? MINIAPP_adminWriteHardenedMeta_()\n      : { enabled: false, deleteEnabled: false, transport: 'disabled' },\n    stats: {\n""", 1)

old_journal_blocks = [
"""    journal: {\n      version: '0.6.0-planned',\n      rows: []\n    }\n""",
"""    journal: typeof MINIAPP_adminWriteJournalData_ === 'function'\n      ? MINIAPP_adminWriteJournalData_()\n      : { version: '0.6.0-read', rows: [] }\n""",
"""    journal: typeof MINIAPP_adminWriteV2JournalData_ === 'function'\n      ? MINIAPP_adminWriteV2JournalData_()\n      : { version: '0.6.0-read', rows: [] }\n"""
]
for block in old_journal_blocks:
    if block in admin:
        admin = admin.replace(block, """    journal: typeof MINIAPP_adminWriteHardenedJournalData_ === 'function'\n      ? MINIAPP_adminWriteHardenedJournalData_()\n      : { version: '0.6.0-read', rows: [] }\n""", 1)
        break
if 'MINIAPP_adminWriteHardenedJournalData_()' not in admin:
    raise SystemExit('[ERROR] 28 journal anchor missing; refusing blind patch')

for old in ('v0.6.0-read.3', 'v0.6.0-write.1', 'v0.6.0-write.2'):
    admin = admin.replace(old, 'v0.6.0-write.3')
admin = admin.replace(
    "var MINIAPP_ADMIN_DATA_VERSION = '0.6.0-write.3';",
    "var MINIAPP_ADMIN_DATA_VERSION = '0.6.0-write.3';"
)

api_path.write_text(api, encoding='utf-8')
admin_path.write_text(admin, encoding='utf-8')
print('[OK] 28_MINIAPP_ADMIN_DATA.js -> hardened revisions + HMAC write metadata + journal')
PY

info "SYNTAX CHECK"
node --check 12_MINI_APP_API.js
node --check 28_MINIAPP_ADMIN_DATA.js
node --check 29_MINIAPP_ADMIN_WRITE.js
node --check 30_MINIAPP_ADMIN_WRITE_BACKEND.js
node --check 31_MINIAPP_ADMIN_WRITE_HARDENED.js
ok "All Apps Script JS syntax checks passed"

info "SECURITY + INVARIANT GUARDS"
grep -q "MINIAPP_adminWriteBackendMaybeHandle_(e)" 12_MINI_APP_API.js || fail "12 signed backend hook missing"
! grep -q "MINIAPP_adminWriteMaybeHandle_(e)" 12_MINI_APP_API.js || fail "Unsafe direct browser write hook found in 12"
grep -q "MINIAPP_adminWriteHardenedDecorateRevisions_" 28_MINIAPP_ADMIN_DATA.js || fail "28 hardened revisions missing"
grep -q "MINIAPP_adminWriteHardenedMeta_" 28_MINIAPP_ADMIN_DATA.js || fail "28 hardened write metadata missing"
grep -q "MINIAPP_adminWriteHardenedJournalData_" 28_MINIAPP_ADMIN_DATA.js || fail "28 hardened journal missing"
grep -q "MINIAPP_adminWriteHardenedDispatch_" 30_MINIAPP_ADMIN_WRITE_BACKEND.js || fail "30 hardened dispatch missing"
grep -q "processManualCounterEdits_" 31_MINIAPP_ADMIN_WRITE_HARDENED.js || fail "31 counter/history invariant missing"
grep -q "sortBaseByChatState_" 31_MINIAPP_ADMIN_WRITE_HARDENED.js || fail "31 base-sort invariant missing"
grep -q "finalRoleCascadeTeamRename_" 31_MINIAPP_ADMIN_WRITE_HARDENED.js || fail "31 team-cascade invariant missing"
ok "Security and Sheets invariant guards passed"

info "CLASP STATUS BEFORE PUSH"
clasp status

info "CLASP PUSH"
clasp push
ok "Apps Script source pushed"

# Keep the SAME versioned web-app deployment / SAME URL.
info "LIST EXISTING DEPLOYMENTS"
DEPLOY_OUTPUT=""
if DEPLOY_OUTPUT="$(clasp list-deployments 2>&1)"; then
  :
elif DEPLOY_OUTPUT="$(clasp deployments 2>&1)"; then
  :
else
  fail "Не удалось получить список Apps Script deployments"
fi
printf '%s\n' "$DEPLOY_OUTPUT"

mapfile -t VERSIONED_IDS < <(
  printf '%s\n' "$DEPLOY_OUTPUT" \
    | grep -E '^[[:space:]]*-[[:space:]]+' \
    | grep -v '@HEAD' \
    | sed -E 's/^[[:space:]]*-[[:space:]]+([^[:space:]]+).*/\1/' \
    | grep -E '^[A-Za-z0-9_-]{20,}$' \
    | sort -u
)

if [[ ${#VERSIONED_IDS[@]} -ne 1 ]]; then
  warn "Безопасный автодеплой остановлен: versioned deployments = ${#VERSIONED_IDS[@]} (ожидался ровно 1)."
  warn "Source уже обновлён, HTTP deployment НЕ менялся. Не создавайте новый deployment; пришлите этот экран."
  exit 23
fi

DEPLOY_ID="${VERSIONED_IDS[0]}"
info "UPDATE EXISTING WEB APP DEPLOYMENT: $DEPLOY_ID"
DEPLOY_DESC="Royal CRM v0.6 hardened admin write ${STAMP}"
if clasp update-deployment "$DEPLOY_ID" --description "$DEPLOY_DESC"; then
  ok "Existing deployment updated with update-deployment"
elif clasp create-deployment --deploymentId "$DEPLOY_ID" --description "$DEPLOY_DESC"; then
  ok "Existing deployment updated with create-deployment --deploymentId"
elif clasp deploy -i "$DEPLOY_ID" -d "$DEPLOY_DESC"; then
  ok "Existing deployment updated with legacy deploy -i"
else
  fail "Не удалось обновить СУЩЕСТВУЮЩИЙ deployment. Новый deployment НЕ создавался."
fi

WEBAPP_URL="https://script.google.com/macros/s/${DEPLOY_ID}/exec"
info "NON-MUTATING HTTP ROUTE CHECK"
ROUTE_OK=0
for i in $(seq 1 6); do
  printf '[INFO] web app route check %s/6\n' "$i"
  # --data performs the original POST. Do NOT force -X POST: Apps Script
  # ContentService redirects the completed response to googleusercontent.
  BODY="$(curl -sS -L --max-time 30 \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    --data 'miniapp=1&action=admin-write&backend=1' \
    "$WEBAPP_URL" || true)"
  if printf '%s' "$BODY" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d.get("error")=="INVALID_REQUEST_ID"; assert str(d.get("version","")).startswith("0.6.0-write.3"); print("[OK] signed hardened admin-write HTTP route is live")' 2>/dev/null; then
    ROUTE_OK=1
    break
  fi
  sleep 5
done
[[ "$ROUTE_OK" == "1" ]] || fail "Deployment обновлён, но hardened admin-write route пока не подтверждён"

info "OPTIONAL NON-MUTATING PREFLIGHT"
if clasp run MINIAPP_adminWritePreflight >"$BACKUP_DIR/preflight.txt" 2>&1; then
  cat "$BACKUP_DIR/preflight.txt"
  ok "Apps Script preflight executed"
else
  warn "clasp run недоступен для этого deployment — HTTP guard уже подтверждён, продолжаем."
fi

info "Синхронизируем factual live Apps Script mirror в WRITE BRANCH, не в production main"
bash <(curl -fsSL "$RAW/scripts/sync-live-apps-script-to-write-branch.sh")
ok "Live Apps Script mirror synced to $BRANCH"

info "Ждём private admin snapshot write.3 от существующего 5-minute trigger"
SNAPSHOT_OK=0
for i in $(seq 1 18); do
  printf '[INFO] admin write snapshot check %s/18\n' "$i"
  if gh api -H 'Accept: application/vnd.github.raw+json' "repos/${DATA_REPO}/contents/admin-snapshot.json?ref=main" 2>/dev/null \
    | python3 -c 'import json,sys; d=json.load(sys.stdin); a=d.get("adminData") or {}; w=a.get("write") or {}; ps=a.get("participants") or []; ts=a.get("teams") or []; assert w.get("enabled") is True; assert w.get("transport")=="worker-signed-hmac"; assert w.get("version")=="0.6.0-write.3"; assert w.get("deleteEnabled") is False; assert w.get("endpoint"); assert ps and ps[0].get("revision"); assert ts and ts[0].get("revision"); print("[OK] hardened admin snapshot:",len(ps),"participants,",len(ts),"teams, revisions=YES, HMAC=YES")' \
    >"$BACKUP_DIR/snapshot-check.txt" 2>/dev/null; then
      cat "$BACKUP_DIR/snapshot-check.txt"
      SNAPSHOT_OK=1
      break
  fi
  sleep 20
done

if [[ "$SNAPSHOT_OK" != "1" ]]; then
  warn "HTTP hardened route подтверждён, но private snapshot write.3 ещё не подтверждён."
  warn "НЕ запускайте установщик повторно. Пришлите этот экран — продолжим с диагностики trigger/snapshot."
fi

printf '\n============================================================\n'
printf '✅✅✅ V0.6 HARDENED ADMIN WRITE BACKEND INSTALLED ✅✅✅\n'
printf 'Backup: %s\n' "$BACKUP_DIR"
printf 'Transport: Mini App -> Worker -> HMAC -> Apps Script -> Sheets\n'
printf 'Web app URL preserved: %s\n' "$WEBAPP_URL"
printf 'Participant identity: Telegram ID IMMUTABLE\n'
printf 'Team identity: name + game\n'
printf 'Counter/history invariant: ENABLED\n'
printf 'В чате/Вышел stable sort invariant: ENABLED\n'
printf 'Delete operations: DISABLED\n'
printf 'Installer changed ZERO participant/team records.\n'
if [[ "$SNAPSHOT_OK" == "1" ]]; then
  printf '✅✅✅ V0.6 HARDENED ADMIN SNAPSHOT IS READY ✅✅✅\n'
fi
printf '============================================================\n'
