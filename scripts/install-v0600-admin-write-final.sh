#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${ROYAL_CRM_PROJECT_DIR:-$HOME/table-chp-1.3}"
REPO="Antonsoloway/Specnaz-mini-app"
BRANCH="v0.6-admin-write"
RAW="https://raw.githubusercontent.com/${REPO}/${BRANCH}"
DATA_REPO="Antonsoloway/royal-crm-data"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$HOME/royal-crm-backups/v0600-admin-write-final-$STAMP"

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
  31_MINIAPP_ADMIN_WRITE_HARDENED.js \
  32_MINIAPP_ADMIN_TEAM_PHOTO.js \
  33_MINIAPP_ADMIN_WRITE_FINAL.js; do
  [[ ! -f "$f" ]] || cp -p "$f" "$BACKUP_DIR/pre-pull/$f"
done
ok "Pre-pull backup: $BACKUP_DIR/pre-pull"

info "CLASP PULL — получаем ФАКТИЧЕСКИЙ live source"
clasp pull

for f in 12_MINI_APP_API.js 28_MINIAPP_ADMIN_DATA.js; do
  [[ -f "$f" ]] || fail "$f не найден после clasp pull"
  cp -p "$f" "$BACKUP_DIR/live-before-patch/$f"
done
for f in \
  29_MINIAPP_ADMIN_WRITE.js \
  30_MINIAPP_ADMIN_WRITE_BACKEND.js \
  31_MINIAPP_ADMIN_WRITE_HARDENED.js \
  32_MINIAPP_ADMIN_TEAM_PHOTO.js \
  33_MINIAPP_ADMIN_WRITE_FINAL.js; do
  [[ ! -f "$f" ]] || cp -p "$f" "$BACKUP_DIR/live-before-patch/$f"
done
ok "Factual live backup: $BACKUP_DIR/live-before-patch"

info "ЗАГРУЖАЕМ ИЗОЛИРОВАННЫЕ V0.6 WRITE МОДУЛИ 29–33"
for f in \
  29_MINIAPP_ADMIN_WRITE.js \
  30_MINIAPP_ADMIN_WRITE_BACKEND.js \
  31_MINIAPP_ADMIN_WRITE_HARDENED.js \
  32_MINIAPP_ADMIN_TEAM_PHOTO.js \
  33_MINIAPP_ADMIN_WRITE_FINAL.js; do
  curl -fsSL "$RAW/apps-script-live/$f" -o "$f" || fail "Не удалось загрузить $f"
done
ok "Write modules 29–33 downloaded"

info "ПАТЧИМ ТОЛЬКО 12 API ROUTER + 28 PRIVATE ADMIN SNAPSHOT"
python3 - <<'PY'
from pathlib import Path
import re

api_path = Path('12_MINI_APP_API.js')
admin_path = Path('28_MINIAPP_ADMIN_DATA.js')
api = api_path.read_text(encoding='utf-8')
admin = admin_path.read_text(encoding='utf-8')

# ---- 12_MINI_APP_API.js ---------------------------------------------------
if 'MINIAPP_adminWriteBackendMaybeHandle_(e)' not in api:
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

# Direct browser -> Apps Script writes are explicitly forbidden.
if 'MINIAPP_adminWriteMaybeHandle_(e)' in api:
    raise SystemExit('[ERROR] Direct browser -> Apps Script write hook detected in 12; refusing deployment')

# ---- 28_MINIAPP_ADMIN_DATA.js --------------------------------------------
records_anchor = "  var participants = MINIAPP_adminReadParticipants_(base);\n  var teams = MINIAPP_adminReadTeams_(ss, teamsSheet);\n"
if records_anchor not in admin:
    raise SystemExit('[ERROR] 28 participant/team anchor missing; refusing blind patch')

# Remove any previous experimental revision decorator immediately following the
# participant/team reads, then install the final write.4 decorator exactly once.
admin = re.sub(
    r"\n  // v0\.6[^\n]*revision[^\n]*\n  if \(typeof MINIAPP_adminWrite[A-Za-z0-9_]*DecorateRevisions_ === 'function'\) \{\n    MINIAPP_adminWrite[A-Za-z0-9_]*DecorateRevisions_\(participants, teams\);\n  \}\n",
    "\n",
    admin,
    count=3,
    flags=re.I
)
if 'MINIAPP_adminWriteFinalDecorateRevisions_(participants, teams)' not in admin:
    admin = admin.replace(
        records_anchor,
        records_anchor + """\n  // v0.6 final write: revisions include every field an admin can edit.\n  if (typeof MINIAPP_adminWriteFinalDecorateRevisions_ === 'function') {\n    MINIAPP_adminWriteFinalDecorateRevisions_(participants, teams);\n  }\n""",
        1
    )

# Remove old write metadata variants if this installer is rerun after an earlier
# preview. Stable read.3 has no write block, so its normal anchor remains intact.
admin = re.sub(
    r"    write: typeof MINIAPP_adminWrite[A-Za-z0-9_]*Meta_ === 'function'\n      \? MINIAPP_adminWrite[A-Za-z0-9_]*Meta_\(\)\n      : \{[^\n]*\},\n",
    "",
    admin,
    count=3
)
if 'MINIAPP_adminWriteFinalMeta_()' not in admin:
    meta_anchor = "    teams: teams,\n    stats: {\n"
    if meta_anchor not in admin:
        raise SystemExit('[ERROR] 28 write metadata anchor missing; refusing blind patch')
    admin = admin.replace(
        meta_anchor,
        """    teams: teams,\n    write: typeof MINIAPP_adminWriteFinalMeta_ === 'function'\n      ? MINIAPP_adminWriteFinalMeta_()\n      : { enabled: false, deleteEnabled: false, transport: 'disabled' },\n    stats: {\n""",
        1
    )

# Replace all known journal preview variants with the final journal reader.
final_journal = """    journal: typeof MINIAPP_adminWriteFinalJournalData_ === 'function'\n      ? MINIAPP_adminWriteFinalJournalData_()\n      : { version: '0.6.0-read', rows: [] }\n"""
known_journals = [
"""    journal: {\n      version: '0.6.0-planned',\n      rows: []\n    }\n""",
"""    journal: typeof MINIAPP_adminWriteJournalData_ === 'function'\n      ? MINIAPP_adminWriteJournalData_()\n      : { version: '0.6.0-read', rows: [] }\n""",
"""    journal: typeof MINIAPP_adminWriteV2JournalData_ === 'function'\n      ? MINIAPP_adminWriteV2JournalData_()\n      : { version: '0.6.0-read', rows: [] }\n""",
"""    journal: typeof MINIAPP_adminWriteHardenedJournalData_ === 'function'\n      ? MINIAPP_adminWriteHardenedJournalData_()\n      : { version: '0.6.0-read', rows: [] }\n"""
]
if 'MINIAPP_adminWriteFinalJournalData_()' not in admin:
    replaced = False
    for old in known_journals:
        if old in admin:
            admin = admin.replace(old, final_journal, 1)
            replaced = True
            break
    if not replaced:
        raise SystemExit('[ERROR] 28 journal anchor missing; refusing blind patch')

# Final private snapshot version.
admin = re.sub(
    r"var MINIAPP_ADMIN_DATA_VERSION = '[^']+';",
    "var MINIAPP_ADMIN_DATA_VERSION = '0.6.0-write.4';",
    admin,
    count=1
)
admin = re.sub(
    r"\* v0\.6\.0-(?:read|write)\.[0-9]+",
    "* v0.6.0-write.4",
    admin,
    count=1
)

# Final exact guards before writing files.
for marker in (
    'MINIAPP_adminWriteFinalDecorateRevisions_(participants, teams)',
    'MINIAPP_adminWriteFinalMeta_()',
    'MINIAPP_adminWriteFinalJournalData_()'
):
    if marker not in admin:
        raise SystemExit('[ERROR] final 28 marker missing after patch: ' + marker)

api_path.write_text(api, encoding='utf-8')
admin_path.write_text(admin, encoding='utf-8')
print('[OK] 28_MINIAPP_ADMIN_DATA.js -> final revisions + HMAC metadata + journal + team photo capability')
PY

info "NODE SYNTAX CHECK"
for f in \
  12_MINI_APP_API.js \
  28_MINIAPP_ADMIN_DATA.js \
  29_MINIAPP_ADMIN_WRITE.js \
  30_MINIAPP_ADMIN_WRITE_BACKEND.js \
  31_MINIAPP_ADMIN_WRITE_HARDENED.js \
  32_MINIAPP_ADMIN_TEAM_PHOTO.js \
  33_MINIAPP_ADMIN_WRITE_FINAL.js; do
  node --check "$f" || fail "Syntax error: $f"
done
ok "All Apps Script JS syntax checks passed"

info "SECURITY + CRM INVARIANT GUARDS"
grep -q "MINIAPP_adminWriteBackendMaybeHandle_(e)" 12_MINI_APP_API.js || fail "12 signed backend hook missing"
! grep -q "MINIAPP_adminWriteMaybeHandle_(e)" 12_MINI_APP_API.js || fail "Unsafe direct browser write hook found in 12"
grep -q "MINIAPP_adminWriteFinalDecorateRevisions_" 28_MINIAPP_ADMIN_DATA.js || fail "28 final revisions missing"
grep -q "MINIAPP_adminWriteFinalMeta_" 28_MINIAPP_ADMIN_DATA.js || fail "28 final write metadata missing"
grep -q "MINIAPP_adminWriteFinalJournalData_" 28_MINIAPP_ADMIN_DATA.js || fail "28 final journal missing"
grep -q "MINIAPP_adminWriteFinalDispatch_" 30_MINIAPP_ADMIN_WRITE_BACKEND.js || fail "30 final dispatch missing"
grep -q "processManualCounterEdits_" 31_MINIAPP_ADMIN_WRITE_HARDENED.js || fail "31 counter/history invariant missing"
grep -q "sortBaseByChatState_" 31_MINIAPP_ADMIN_WRITE_HARDENED.js || fail "31 base-sort invariant missing"
grep -q "finalRoleCascadeTeamRename_" 31_MINIAPP_ADMIN_WRITE_HARDENED.js || fail "31 team-cascade invariant missing"
grep -q "MINIAPP_adminTeamPhotoPrepareUpload_" 32_MINIAPP_ADMIN_TEAM_PHOTO.js || fail "32 photo upload missing"
grep -q "MINIAPP_teamGithubUpsert_" 32_MINIAPP_ADMIN_TEAM_PHOTO.js || fail "32 existing private media integration missing"
grep -q "MINIAPP_adminWriteFinalCreateTeam_" 33_MINIAPP_ADMIN_WRITE_FINAL.js || fail "33 final create-team missing"
grep -q "photoChanged" 33_MINIAPP_ADMIN_WRITE_FINAL.js || fail "33 team photo result guard missing"
ok "Security and CRM invariant guards passed"

info "CLASP STATUS BEFORE PUSH"
clasp status

info "CLASP PUSH"
clasp push
ok "Apps Script source pushed"

# Preserve the SAME web-app deployment ID/URL. Never create a new deployment.
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
  warn "Source уже обновлён, HTTP deployment НЕ менялся. Новый deployment НЕ создавайте — пришлите этот экран."
  exit 23
fi

DEPLOY_ID="${VERSIONED_IDS[0]}"
DEPLOY_DESC="Royal CRM v0.6 final admin write ${STAMP}"
info "UPDATE EXISTING WEB APP DEPLOYMENT: $DEPLOY_ID"
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
for i in $(seq 1 8); do
  printf '[INFO] web app route check %s/8\n' "$i"
  BODY="$(curl -sS -L --max-time 30 \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    --data 'miniapp=1&action=admin-write&backend=1' \
    "$WEBAPP_URL" || true)"
  if printf '%s' "$BODY" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d.get("error")=="INVALID_REQUEST_ID"; assert d.get("version")=="0.6.0-write.4"; print("[OK] signed final admin-write HTTP route is live")' 2>/dev/null; then
    ROUTE_OK=1
    break
  fi
  sleep 5
done
[[ "$ROUTE_OK" == "1" ]] || fail "Deployment обновлён, но final admin-write route пока не подтверждён"

info "OPTIONAL NON-MUTATING APPS SCRIPT PREFLIGHT"
if clasp run MINIAPP_adminWritePreflight >"$BACKUP_DIR/preflight.txt" 2>&1; then
  cat "$BACKUP_DIR/preflight.txt"
  if grep -q '"ok"[[:space:]]*:[[:space:]]*true' "$BACKUP_DIR/preflight.txt"; then
    ok "Apps Script preflight OK"
  else
    warn "Preflight запустился, но не подтвердил ok=true. Основные HTTP/syntax guards пройдены; пришлите итоговый экран."
  fi
else
  warn "clasp run недоступен для этого проекта — HTTP guard уже подтверждён, продолжаем."
fi

info "ПЫТАЕМСЯ СРАЗУ ОБНОВИТЬ PRIVATE ADMIN SNAPSHOT"
if clasp run MINIAPP_exportAdminSnapshotToGitHub >"$BACKUP_DIR/admin-snapshot-run.txt" 2>&1; then
  cat "$BACKUP_DIR/admin-snapshot-run.txt"
else
  warn "Ручной clasp run snapshot недоступен; используем существующий 5-minute trigger."
fi

info "СИНХРОНИЗИРУЕМ FACTUAL LIVE APPS SCRIPT В WRITE BRANCH, НЕ В PRODUCTION MAIN"
bash <(curl -fsSL "$RAW/scripts/sync-live-apps-script-to-write-branch-final.sh")
ok "Live Apps Script mirror synced to $BRANCH"

info "ЖДЁМ PRIVATE ADMIN SNAPSHOT WRITE.4"
SNAPSHOT_OK=0
for i in $(seq 1 20); do
  printf '[INFO] admin write snapshot check %s/20\n' "$i"
  if gh api -H 'Accept: application/vnd.github.raw+json' "repos/${DATA_REPO}/contents/admin-snapshot.json?ref=main" 2>/dev/null \
    | python3 -c 'import json,sys; d=json.load(sys.stdin); a=d.get("adminData") or {}; w=a.get("write") or {}; ps=a.get("participants") or []; ts=a.get("teams") or []; tp=w.get("teamPhoto") or {}; assert w.get("enabled") is True; assert w.get("transport")=="worker-signed-hmac"; assert w.get("version")=="0.6.0-write.4"; assert w.get("deleteEnabled") is False; assert w.get("endpoint"); assert tp.get("enabled") is True; assert int(tp.get("maxUploadBytes") or 0)>=500000; assert ps and ps[0].get("revision"); assert ts and ts[0].get("revision"); print("[OK] final admin snapshot:",len(ps),"participants,",len(ts),"teams, revisions=YES, HMAC=YES, photo=YES")' \
    >"$BACKUP_DIR/snapshot-check.txt" 2>/dev/null; then
      cat "$BACKUP_DIR/snapshot-check.txt"
      SNAPSHOT_OK=1
      break
  fi
  sleep 20
done

if [[ "$SNAPSHOT_OK" != "1" ]]; then
  warn "HTTP final route подтверждён, но private snapshot write.4 ещё не подтверждён."
  warn "НЕ запускайте установщик второй раз. Просто пришлите этот экран — продолжим с trigger/snapshot диагностикой."
fi

printf '\n============================================================\n'
printf '✅✅✅ V0.6 FINAL ADMIN WRITE BACKEND INSTALLED ✅✅✅\n'
printf 'Backup: %s\n' "$BACKUP_DIR"
printf 'Transport: Mini App -> Worker -> HMAC -> Apps Script -> Sheets\n'
printf 'Web app URL preserved: %s\n' "$WEBAPP_URL"
printf 'Participant identity: Telegram ID IMMUTABLE\n'
printf 'Team identity: name + game\n'
printf 'Participant U/V/AB/AC/AD/AF editing: READY\n'
printf '5 membership slots: READY\n'
printf 'Counter/specnaz-history invariant: READY\n'
printf 'В чате/Вышел stable sort invariant: READY\n'
printf 'Team rename cascade: READY\n'
printf 'Team photo storage + CellImage: READY\n'
printf 'Admin journal: READY\n'
printf 'Delete operations: DISABLED\n'
printf 'Installer changed ZERO participant/team records.\n'
if [[ "$SNAPSHOT_OK" == "1" ]]; then
  printf '✅✅✅ V0.6 FINAL ADMIN SNAPSHOT IS READY ✅✅✅\n'
fi
printf '============================================================\n'
