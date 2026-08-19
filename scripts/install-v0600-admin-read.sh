#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${ROYAL_CRM_PROJECT_DIR:-$HOME/table-chp-1.3}"
REPO="Antonsoloway/Specnaz-mini-app"
BRANCH="v0.6-admin"
RAW="https://raw.githubusercontent.com/${REPO}/${BRANCH}"
DATA_REPO="Antonsoloway/royal-crm-data"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$HOME/royal-crm-backups/v0600-admin-read-$STAMP"

ok(){ printf '\n✅ %s\n' "$*"; }
info(){ printf '\n[INFO] %s\n' "$*"; }
warn(){ printf '\n[WARN] %s\n' "$*"; }
fail(){ printf '\n❌ %s\n' "$*" >&2; exit 1; }

command -v clasp >/dev/null 2>&1 || fail "clasp не найден"
command -v python3 >/dev/null 2>&1 || fail "python3 не найден"
command -v curl >/dev/null 2>&1 || fail "curl не найден"
[[ -d "$PROJECT_DIR" ]] || fail "Apps Script каталог не найден: $PROJECT_DIR"
[[ -f "$PROJECT_DIR/.clasp.json" ]] || fail ".clasp.json не найден в $PROJECT_DIR"

mkdir -p "$BACKUP_DIR"
cd "$PROJECT_DIR"

info "CLASP STATUS BEFORE PULL"
clasp status

info "CLASP PULL — получаем фактический live source"
clasp pull

[[ -f 25_MINIAPP_UNIFIED_SNAPSHOT.js ]] || fail "25_MINIAPP_UNIFIED_SNAPSHOT.js не найден после clasp pull"
cp 25_MINIAPP_UNIFIED_SNAPSHOT.js "$BACKUP_DIR/25_MINIAPP_UNIFIED_SNAPSHOT.js"
[[ ! -f 28_MINIAPP_ADMIN_DATA.js ]] || cp 28_MINIAPP_ADMIN_DATA.js "$BACKUP_DIR/28_MINIAPP_ADMIN_DATA.js"
ok "Backup: $BACKUP_DIR"

info "Загружаем v0.6 admin snapshot module"
curl -fsSL "$RAW/apps-script-live/28_MINIAPP_ADMIN_DATA.js" -o 28_MINIAPP_ADMIN_DATA.js

info "Подключаем admin snapshot к существующему 5-minute Unified Snapshot trigger"
python3 - <<'PY'
from pathlib import Path
p = Path('25_MINIAPP_UNIFIED_SNAPSHOT.js')
s = p.read_text(encoding='utf-8')
marker = 'MINIAPP_exportAdminSnapshotUnlocked_(props, repo, token, branch)'
if marker not in s:
    expected = "    var searchStats = MINIAPP_unifiedAttachSearchKeys_(stable);\n"
    if expected not in s:
        raise SystemExit('PATCH ERROR: searchStats anchor not found; live file differs from expected architecture')
    hook = expected + """

    // v1.2.5 / Mini App v0.6: build a separate PRIVATE admin snapshot using
    // the same existing 5-minute trigger. Failure here must never break the
    // stable participant snapshot used by v0.5.59.
    var adminSnapshotResult = { ok: false, skipped: true, reason: 'ADMIN_EXPORTER_MISSING' };
    if (typeof MINIAPP_exportAdminSnapshotUnlocked_ === 'function') {
      try {
        adminSnapshotResult = MINIAPP_exportAdminSnapshotUnlocked_(props, repo, token, branch);
      } catch (adminSnapshotError) {
        adminSnapshotResult = {
          ok: false,
          error: String(adminSnapshotError && adminSnapshotError.message ? adminSnapshotError.message : adminSnapshotError || 'UNKNOWN')
        };
        console.error('MINIAPP admin snapshot export failed', adminSnapshotResult.error);
      }
    }
"""
    s = s.replace(expected, hook, 1)
    s = s.replace(' * v1.2.4\n', ' * v1.2.5\n', 1)
    s = s.replace("var MINIAPP_UNIFIED_SNAPSHOT_VERSION = '1.2.4';", "var MINIAPP_UNIFIED_SNAPSHOT_VERSION = '1.2.5';", 1)
    p.write_text(s, encoding='utf-8')
    print('[OK] 25_MINIAPP_UNIFIED_SNAPSHOT.js patched to 1.2.5 admin bridge')
else:
    print('[OK] admin bridge already present; no duplicate patch')
PY

info "SYNTAX CHECK"
node --check 25_MINIAPP_UNIFIED_SNAPSHOT.js
node --check 28_MINIAPP_ADMIN_DATA.js
ok "JS syntax OK"

info "CLASP STATUS BEFORE PUSH"
clasp status

info "CLASP PUSH"
clasp push
ok "Apps Script source pushed"

info "Синхронизируем полный live mirror обратно в GitHub main"
bash <(curl -fsSL https://raw.githubusercontent.com/Antonsoloway/Specnaz-mini-app/main/scripts/sync-live-apps-script-to-github.sh)

info "Ждём существующий 5-minute trigger и появление private admin-snapshot.json"
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  for i in $(seq 1 18); do
    printf '[INFO] admin snapshot check %s/18\n' "$i"
    if gh api -H 'Accept: application/vnd.github.raw+json' "repos/${DATA_REPO}/contents/admin-snapshot.json?ref=main" 2>/dev/null \
      | python3 -c 'import json,sys; d=json.load(sys.stdin); a=d.get("adminData") or {}; assert d.get("schemaVersion")=="0.6.0-admin.1"; assert isinstance(a.get("participants"),list) and isinstance(a.get("teams"),list); print("[OK] admin-snapshot:",len(a["participants"]),"participants,",len(a["teams"]),"teams")' \
      >/tmp/royal-admin-snapshot-check.txt 2>/dev/null; then
        cat /tmp/royal-admin-snapshot-check.txt
        printf '\n✅✅✅ V0.6 ADMIN READ DATA IS LIVE ✅✅✅\n'
        printf 'Existing 5-minute trigger now maintains admin-snapshot.json; no second trigger installed.\n'
        exit 0
    fi
    sleep 20
  done
  warn "Apps Script push успешен, но admin-snapshot.json ещё не подтверждён за 6 минут. Не запускайте setup повторно — сначала проверьте executions существующего MINIAPP_exportUnifiedSnapshotToGitHub."
else
  warn "gh CLI не авторизован; runtime snapshot check пропущен. Apps Script push выполнен."
fi

printf '\n============================================================\n'
printf 'V0.6 ADMIN READ SOURCE INSTALLED; RUNTIME SNAPSHOT CHECK PENDING\n'
printf 'Backup: %s\n' "$BACKUP_DIR"
printf 'Patched: 25_MINIAPP_UNIFIED_SNAPSHOT.js + 28_MINIAPP_ADMIN_DATA.js\n'
printf '============================================================\n'
