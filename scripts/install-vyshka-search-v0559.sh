#!/usr/bin/env bash
set -euo pipefail

ROOT="${ROYAL_APPS_SCRIPT_DIR:-$HOME/table-chp-1.3}"
REPO_RAW="https://raw.githubusercontent.com/Antonsoloway/Specnaz-mini-app/main"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${ROYAL_BACKUP_DIR:-$HOME/royal-crm-backups/vyshka-search-$STAMP}"
DATA_REPO="Antonsoloway/royal-crm-data"
DATA_PATH="snapshot.json"

ok(){ printf '\033[32m[OK]\033[0m %s\n' "$*"; }
info(){ printf '\033[36m[INFO]\033[0m %s\n' "$*"; }
warn(){ printf '\033[33m[WARN]\033[0m %s\n' "$*"; }
fail(){ printf '\033[31m[ERROR]\033[0m %s\n' "$*" >&2; exit 1; }

info "Royal CRM live search alias installer: BbllllKA (Royal Kingdom) -> вышка"
[[ -d "$ROOT" ]] || fail "Apps Script folder not found: $ROOT"
mkdir -p "$BACKUP_DIR/pre-pull" "$BACKUP_DIR/live-before-patch"
cd "$ROOT"

[[ -f 25_MINIAPP_UNIFIED_SNAPSHOT.js ]] || fail "25_MINIAPP_UNIFIED_SNAPSHOT.js missing before pull"
cp -p 25_MINIAPP_UNIFIED_SNAPSHOT.js "$BACKUP_DIR/pre-pull/25_MINIAPP_UNIFIED_SNAPSHOT.js"
ok "Pre-pull local backup saved"

info "Current clasp status"
clasp status

info "Pulling FACTUAL live Apps Script before patch"
clasp pull
ok "clasp pull completed"

[[ -f 25_MINIAPP_UNIFIED_SNAPSHOT.js ]] || fail "25_MINIAPP_UNIFIED_SNAPSHOT.js missing after clasp pull"
cp -p 25_MINIAPP_UNIFIED_SNAPSHOT.js "$BACKUP_DIR/live-before-patch/25_MINIAPP_UNIFIED_SNAPSHOT.js"
ok "Live-before-patch backup saved: $BACKUP_DIR/live-before-patch/25_MINIAPP_UNIFIED_SNAPSHOT.js"

python3 - <<'PY'
from pathlib import Path

p = Path('25_MINIAPP_UNIFIED_SNAPSHOT.js')
t = p.read_text(encoding='utf-8')

if "var MINIAPP_UNIFIED_SNAPSHOT_VERSION = '1.2.3';" in t:
    t = t.replace(
        "var MINIAPP_UNIFIED_SNAPSHOT_VERSION = '1.2.3';",
        "var MINIAPP_UNIFIED_SNAPSHOT_VERSION = '1.2.4';",
        1,
    )
elif "var MINIAPP_UNIFIED_SNAPSHOT_VERSION = '1.2.4';" not in t:
    raise SystemExit('[ERROR] Unexpected live Unified Snapshot version; refusing blind patch')

if "var MINIAPP_UNIFIED_SEARCH_INDEX_VERSION = '1.1.2';" in t:
    t = t.replace(
        "var MINIAPP_UNIFIED_SEARCH_INDEX_VERSION = '1.1.2';",
        "var MINIAPP_UNIFIED_SEARCH_INDEX_VERSION = '1.1.3';",
        1,
    )
elif "var MINIAPP_UNIFIED_SEARCH_INDEX_VERSION = '1.1.3';" not in t:
    raise SystemExit('[ERROR] Unexpected live searchIndexVersion; refusing blind patch')

t = t.replace(' * v1.2.3\n', ' * v1.2.4\n', 1)

# Remove the earlier misread alias if present. The factual CRM name is
# "🗡 BbllllKA" (four lowercase L characters after Bb), normalized to bbllllka.
t = t.replace("  'bbiiiika': ['вышка'],\n", '')
t = t.replace("  'bbiiiika': ['вышка']\n", '')

alias_line = "  'bbllllka': ['вышка']"
if alias_line not in t:
    anchors = [
        "  'xabib': ['хабиб']\n};",
        "  'xabib': ['хабиб'],\n};",
    ]
    replaced = False
    for anchor in anchors:
        if anchor in t:
            replacement = "  'xabib': ['хабиб'],\n" + alias_line + "\n};"
            t = t.replace(anchor, replacement, 1)
            replaced = True
            break
    if not replaced:
        raise SystemExit('[ERROR] Search alias map anchor not found; refusing blind patch')
    print('[OK] Added factual server alias bbllllka -> вышка')
else:
    print('[OK] Factual server alias already present')

if "MINIAPP_attachTeamStatusesToSnapshot_" not in t:
    raise SystemExit('[ERROR] Team-status bridge is missing from live writer; refusing push')
if "var MINIAPP_UNIFIED_SNAPSHOT_SCHEMA = '1.4.2';" not in t:
    raise SystemExit('[ERROR] Expected schemaVersion 1.4.2 missing; refusing push')

p.write_text(t, encoding='utf-8')
print('[OK] Unified Snapshot Writer = 1.2.4')
print('[OK] searchIndexVersion = 1.1.3')
print('[OK] schemaVersion preserved = 1.4.2')
PY

info "Syntax check"
node --check 25_MINIAPP_UNIFIED_SNAPSHOT.js
ok "JavaScript syntax OK"

info "Verifying exact patch markers"
grep -F "var MINIAPP_UNIFIED_SNAPSHOT_VERSION = '1.2.4';" 25_MINIAPP_UNIFIED_SNAPSHOT.js >/dev/null
grep -F "var MINIAPP_UNIFIED_SEARCH_INDEX_VERSION = '1.1.3';" 25_MINIAPP_UNIFIED_SNAPSHOT.js >/dev/null
grep -F "'bbllllka': ['вышка']" 25_MINIAPP_UNIFIED_SNAPSHOT.js >/dev/null
if grep -F "'bbiiiika': ['вышка']" 25_MINIAPP_UNIFIED_SNAPSHOT.js >/dev/null; then
  fail "Old misread bbiiiika alias is still present"
fi
grep -F "MINIAPP_attachTeamStatusesToSnapshot_" 25_MINIAPP_UNIFIED_SNAPSHOT.js >/dev/null
ok "Patch markers verified"

info "clasp status BEFORE push"
clasp status
ok "clasp status completed"

info "Pushing corrected live Apps Script"
clasp push
ok "clasp push completed"

info "Synchronizing factual live Apps Script mirror back to GitHub"
bash <(curl -fsSL "$REPO_RAW/scripts/sync-live-apps-script-to-github.sh")
ok "apps-script-live mirror synchronized"

verify_snapshot() {
  command -v gh >/dev/null 2>&1 || return 2
  gh auth status >/dev/null 2>&1 || return 2

  local attempt
  for attempt in $(seq 1 14); do
    info "Waiting for 5-minute snapshot trigger: check $attempt/14"
    if gh api "repos/$DATA_REPO/contents/$DATA_PATH" --jq .content 2>/dev/null \
      | tr -d '\n' \
      | base64 -d 2>/dev/null \
      | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(1)
if str(data.get("searchIndexVersion", "")) != "1.1.3":
    sys.exit(1)
for team in data.get("teams") or []:
    name = "".join(ch.lower() for ch in str(team.get("name") or "") if ch.isalnum())
    games = [str(team.get("game") or "")] + [str(x) for x in (team.get("games") or [])]
    game_text = " ".join(games).lower()
    if name == "bbllllka" and "royal kingdom" in game_text:
        keys = [str(x).strip().lower() for x in (team.get("searchKeys") or [])]
        if "вышка" in keys:
            print("[OK] snapshot confirms: 🗡 BbllllKA / Royal Kingdom contains searchKey \"вышка\"")
            print("[OK] snapshot searchIndexVersion = 1.1.3")
            print("[OK] snapshot unifiedSnapshotVersion = " + str(data.get("unifiedSnapshotVersion", "")))
            sys.exit(0)
sys.exit(1)
'; then
      return 0
    fi
    sleep 25
  done
  return 1
}

if verify_snapshot; then
  printf '\n\033[32m===================================================\033[0m\n'
  printf '\033[32m SUCCESS: VYSHKA SEARCH IS IN LIVE SNAPSHOT \033[0m\n'
  printf '\033[32m===================================================\033[0m\n'
elif [[ $? -eq 2 ]]; then
  warn "gh CLI/auth unavailable; Apps Script push succeeded, snapshot verification skipped"
  printf '\n\033[32m==============================================\033[0m\n'
  printf '\033[32m SUCCESS: VYSHKA SEARCH CODE IS LIVE \033[0m\n'
  printf '\033[32m==============================================\033[0m\n'
  printf 'Wait up to 5 minutes for the existing snapshot trigger.\n'
else
  warn "Apps Script push succeeded but the exact BbllllKA alias was not observed within the polling window"
  printf '\n\033[33m=====================================================\033[0m\n'
  printf '\033[33m PUSH OK; SNAPSHOT CONFIRMATION STILL PENDING \033[0m\n'
  printf '\033[33m=====================================================\033[0m\n'
fi

printf 'Backups: %s\n' "$BACKUP_DIR"
printf 'Unified writer: 1.2.4\nSchema: 1.4.2\nSearch index: 1.1.3\nAlias: BbllllKA / Royal Kingdom -> вышка\n'