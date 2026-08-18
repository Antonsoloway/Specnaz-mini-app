#!/usr/bin/env bash
set -euo pipefail

ROOT="${ROYAL_APPS_SCRIPT_DIR:-$HOME/table-chp-1.3}"
REPO_RAW="https://raw.githubusercontent.com/Antonsoloway/Specnaz-mini-app/main"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${ROYAL_BACKUP_DIR:-$HOME/royal-crm-backups/team-status-$STAMP}"

ok(){ printf '\033[32m[OK]\033[0m %s\n' "$*"; }
info(){ printf '\033[36m[INFO]\033[0m %s\n' "$*"; }
fail(){ printf '\033[31m[ERROR]\033[0m %s\n' "$*" >&2; exit 1; }

info "Royal CRM team status installer v0.5.59"
[[ -d "$ROOT" ]] || fail "Apps Script folder not found: $ROOT"
mkdir -p "$BACKUP_DIR"
cd "$ROOT"

for f in 19_MINIAPP_FALLBACK_API.js 25_MINIAPP_UNIFIED_SNAPSHOT.js; do
  [[ -f "$f" ]] || fail "Required live file missing: $f"
  cp -p "$f" "$BACKUP_DIR/$f"
  ok "Backup: $BACKUP_DIR/$f"
done

info "Downloading team status bridge"
curl -fsSL "$REPO_RAW/patches/team-status-v0559/27_MINIAPP_TEAM_STATUS.js" -o 27_MINIAPP_TEAM_STATUS.js
[[ -s 27_MINIAPP_TEAM_STATUS.js ]] || fail "27_MINIAPP_TEAM_STATUS.js download failed"
ok "27_MINIAPP_TEAM_STATUS.js installed"

python3 - "$ROOT" <<'PY'
from pathlib import Path
import sys
root = Path(sys.argv[1])

p25 = root / '25_MINIAPP_UNIFIED_SNAPSHOT.js'
t = p25.read_text(encoding='utf-8')

def replace_once(text, old, new, label):
    count = text.count(old)
    if count == 0 and new in text:
        print(f'[OK] {label}: already applied')
        return text
    if count != 1:
        raise SystemExit(f'[ERROR] {label}: expected 1 match, found {count}')
    print(f'[OK] {label}')
    return text.replace(old, new, 1)

t = replace_once(t,
    "var MINIAPP_UNIFIED_SNAPSHOT_VERSION = '1.2.1';",
    "var MINIAPP_UNIFIED_SNAPSHOT_VERSION = '1.2.2';",
    'Unified Snapshot Writer 1.2.2')
t = replace_once(t,
    "var MINIAPP_UNIFIED_SNAPSHOT_SCHEMA = '1.4.1';",
    "var MINIAPP_UNIFIED_SNAPSHOT_SCHEMA = '1.4.2';",
    'schemaVersion 1.4.2')
old = "    var stable = MINIAPP_buildStableSnapshot_();\n    if (!stable || !Array.isArray(stable.participants) || !Array.isArray(stable.teams)) {"
new = "    var stable = MINIAPP_buildStableSnapshot_();\n    if (typeof MINIAPP_attachTeamStatusesToSnapshot_ !== 'function') {\n      throw new Error('MINIAPP_attachTeamStatusesToSnapshot_ missing');\n    }\n    var teamStatusStats = MINIAPP_attachTeamStatusesToSnapshot_(stable);\n    if (!stable || !Array.isArray(stable.participants) || !Array.isArray(stable.teams)) {"
t = replace_once(t, old, new, 'attach authoritative team statuses')

if 'teamStatusStats: teamStatusStats' not in t:
    needle = '        historySections: sections.length\n      };'
    if needle not in t:
        raise SystemExit('[ERROR] unchanged return diagnostics anchor not found')
    t = t.replace(needle, '        historySections: sections.length,\n        teamStatusStats: teamStatusStats\n      };', 1)
    needle2 = '      historySections: sections.length,\n      github: github'
    if needle2 not in t:
        raise SystemExit('[ERROR] changed return diagnostics anchor not found')
    t = t.replace(needle2, '      historySections: sections.length,\n      teamStatusStats: teamStatusStats,\n      github: github', 1)
    print('[OK] team status diagnostics added')
else:
    print('[OK] team status diagnostics already present')

p25.write_text(t, encoding='utf-8')

p19 = root / '19_MINIAPP_FALLBACK_API.js'
f = p19.read_text(encoding='utf-8')
f = replace_once(f,
    "var MINIAPP_FALLBACK_API_VERSION = '1.2.0';",
    "var MINIAPP_FALLBACK_API_VERSION = '1.2.1';",
    'Fallback API 1.2.1')
old_status = "playerCount:Number(t && t.playerCount || 0) }; }),"
new_status = "playerCount:Number(t && t.playerCount || 0), status:String(t && t.status || '') }; }),"
f = replace_once(f, old_status, new_status, 'preserve team.status in GAS fallback')
p19.write_text(f, encoding='utf-8')
PY

info "Syntax check"
node --check 19_MINIAPP_FALLBACK_API.js
node --check 25_MINIAPP_UNIFIED_SNAPSHOT.js
node --check 27_MINIAPP_TEAM_STATUS.js
ok "JavaScript syntax OK"

info "clasp status BEFORE push"
clasp status
ok "clasp status completed"

info "Pushing live Apps Script"
clasp push
ok "clasp push completed"

info "Synchronizing production mirror back to GitHub"
bash <(curl -fsSL "$REPO_RAW/scripts/sync-live-apps-script-to-github.sh")
ok "apps-script-live mirror synchronized"

printf '\n\033[32m=============================================\033[0m\n'
printf '\033[32m SUCCESS: TEAM STATUS CODE IS LIVE \033[0m\n'
printf '\033[32m=============================================\033[0m\n'
printf 'Backups: %s\n' "$BACKUP_DIR"
printf 'Unified writer: 1.2.2\nSchema: 1.4.2\nFallback API: 1.2.1\n'
printf 'Existing 5-minute trigger will publish team.status into snapshot.json.\n'
printf 'No frontend entrypoint was changed by this installer.\n'
