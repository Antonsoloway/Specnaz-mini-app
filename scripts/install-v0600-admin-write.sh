#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${ROYAL_CRM_PROJECT_DIR:-$HOME/table-chp-1.3}"
REPO="Antonsoloway/Specnaz-mini-app"
BRANCH="v0.6-admin-write"
RAW="https://raw.githubusercontent.com/${REPO}/${BRANCH}"
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
[[ -d "$PROJECT_DIR" ]] || fail "Apps Script каталог не найден: $PROJECT_DIR"
[[ -f "$PROJECT_DIR/.clasp.json" ]] || fail ".clasp.json не найден в $PROJECT_DIR"

mkdir -p "$BACKUP_DIR/pre-pull" "$BACKUP_DIR/live-before-patch"
cd "$PROJECT_DIR"

info "CLASP STATUS BEFORE PULL"
clasp status

for f in 12_MINI_APP_API.js 28_MINIAPP_ADMIN_DATA.js 29_MINIAPP_ADMIN_WRITE.js; do
  [[ ! -f "$f" ]] || cp -p "$f" "$BACKUP_DIR/pre-pull/$f"
done
ok "Pre-pull backup: $BACKUP_DIR/pre-pull"

info "CLASP PULL — получаем фактический live source"
clasp pull

for f in 12_MINI_APP_API.js 28_MINIAPP_ADMIN_DATA.js; do
  [[ -f "$f" ]] || fail "$f не найден после clasp pull"
  cp -p "$f" "$BACKUP_DIR/live-before-patch/$f"
done
[[ ! -f 29_MINIAPP_ADMIN_WRITE.js ]] || cp -p 29_MINIAPP_ADMIN_WRITE.js "$BACKUP_DIR/live-before-patch/29_MINIAPP_ADMIN_WRITE.js"
ok "Factual live backup: $BACKUP_DIR/live-before-patch"

info "Загружаем изолированный write-модуль 29"
curl -fsSL "$RAW/apps-script-live/29_MINIAPP_ADMIN_WRITE.js" -o 29_MINIAPP_ADMIN_WRITE.js

info "Патчим только два проверенных integration hook: 12 API router + 28 admin snapshot"
python3 - <<'PY'
from pathlib import Path

api_path = Path('12_MINI_APP_API.js')
admin_path = Path('28_MINIAPP_ADMIN_DATA.js')
api = api_path.read_text(encoding='utf-8')
admin = admin_path.read_text(encoding='utf-8')

# ---- 12_MINI_APP_API.js ---------------------------------------------------
write_marker = 'MINIAPP_adminWriteMaybeHandle_(e)'
if write_marker not in api:
    anchor = "function MINIAPP_doGet_(e) {\n  const fallbackResponse = MINIAPP_fallbackMaybeHandle_(e);\n"
    if anchor not in api:
        raise SystemExit('[ERROR] 12 API anchor missing; refusing blind patch')
    replacement = """function MINIAPP_doGet_(e) {\n  // v0.6 admin write: isolated protected router before normal auth/poll.\n  if (typeof MINIAPP_adminWriteMaybeHandle_ === 'function') {\n    const adminWriteResponse = MINIAPP_adminWriteMaybeHandle_(e);\n    if (adminWriteResponse) return adminWriteResponse;\n  }\n\n  const fallbackResponse = MINIAPP_fallbackMaybeHandle_(e);\n"""
    api = api.replace(anchor, replacement, 1)
    api = api.replace('Версия 0.2.4', 'Версия 0.2.5', 1)
    api = api.replace("const MINIAPP_VERSION = '0.2.4';", "const MINIAPP_VERSION = '0.2.5';", 1)
    print('[OK] 12_MINI_APP_API.js -> 0.2.5 protected admin-write hook')
else:
    print('[OK] 12 admin-write hook already present')

# ---- 28_MINIAPP_ADMIN_DATA.js --------------------------------------------
decor_marker = 'MINIAPP_adminWriteDecorateRevisions_(participants, teams)'
if decor_marker not in admin:
    anchor = "  var participants = MINIAPP_adminReadParticipants_(base);\n  var teams = MINIAPP_adminReadTeams_(ss, teamsSheet);\n"
    if anchor not in admin:
        raise SystemExit('[ERROR] 28 participant/team anchor missing; refusing blind patch')
    replacement = anchor + """\n  // v0.6 write layer adds optimistic concurrency revisions without changing\n  // the read contract when module 29 is absent.\n  if (typeof MINIAPP_adminWriteDecorateRevisions_ === 'function') {\n    MINIAPP_adminWriteDecorateRevisions_(participants, teams);\n  }\n"""
    admin = admin.replace(anchor, replacement, 1)

meta_marker = 'MINIAPP_adminWriteAdminMeta_'
if meta_marker not in admin:
    anchor = "    teams: teams,\n    stats: {\n"
    if anchor not in admin:
        raise SystemExit('[ERROR] 28 return metadata anchor missing; refusing blind patch')
    replacement = """    teams: teams,\n    write: typeof MINIAPP_adminWriteAdminMeta_ === 'function'\n      ? MINIAPP_adminWriteAdminMeta_()\n      : { enabled: false, deleteEnabled: false },\n    stats: {\n"""
    admin = admin.replace(anchor, replacement, 1)

journal_marker = 'MINIAPP_adminWriteJournalData_'
if journal_marker not in admin:
    old = """    journal: {\n      version: '0.6.0-planned',\n      rows: []\n    }\n"""
    if old not in admin:
        raise SystemExit('[ERROR] 28 journal anchor missing; refusing blind patch')
    new = """    journal: typeof MINIAPP_adminWriteJournalData_ === 'function'\n      ? MINIAPP_adminWriteJournalData_()\n      : { version: '0.6.0-read', rows: [] }\n"""
    admin = admin.replace(old, new, 1)

admin = admin.replace('v0.6.0-read.3', 'v0.6.0-write.1')
admin = admin.replace("var MINIAPP_ADMIN_DATA_VERSION = '0.6.0-read.3';", "var MINIAPP_ADMIN_DATA_VERSION = '0.6.0-write.1';")
print('[OK] 28_MINIAPP_ADMIN_DATA.js -> write metadata + revisions + journal')

api_path.write_text(api, encoding='utf-8')
admin_path.write_text(admin, encoding='utf-8')
PY

info "SYNTAX CHECK"
node --check 12_MINI_APP_API.js
node --check 28_MINIAPP_ADMIN_DATA.js
node --check 29_MINIAPP_ADMIN_WRITE.js
ok "All Apps Script JS syntax checks passed"

info "GUARD CHECKS"
grep -q "MINIAPP_adminWriteMaybeHandle_(e)" 12_MINI_APP_API.js || fail "12 router hook missing"
grep -q "MINIAPP_adminWriteDecorateRevisions_" 28_MINIAPP_ADMIN_DATA.js || fail "28 revision hook missing"
grep -q "MINIAPP_adminWriteJournalData_" 28_MINIAPP_ADMIN_DATA.js || fail "28 journal hook missing"
grep -q "MINIAPP_adminWriteExecute_" 29_MINIAPP_ADMIN_WRITE.js || fail "29 write engine missing"
ok "Integration guards passed"

info "CLASP STATUS BEFORE PUSH"
clasp status

info "CLASP PUSH"
clasp push
ok "Apps Script source pushed"

info "Синхронизируем полный factual live mirror обратно в GitHub main"
bash <(curl -fsSL https://raw.githubusercontent.com/Antonsoloway/Specnaz-mini-app/main/scripts/sync-live-apps-script-to-github.sh)
ok "Live Apps Script mirror synced"

printf '\n============================================================\n'
printf '✅✅✅ V0.6 ADMIN WRITE SOURCE INSTALLED ✅✅✅\n'
printf 'Backup: %s\n' "$BACKUP_DIR"
printf 'Installed: 12 API 0.2.5 + 28 admin data write hooks + 29 write engine\n'
printf 'No participant/team data was changed by this installer.\n'
printf 'IMPORTANT: existing Apps Script web deployment must point to the new source version before UI writes are tested.\n'
printf '============================================================\n'
