#!/usr/bin/env bash
# Run in the authorized Cloud Shell after source CI and deployment approval.
# Usage: script SOURCE_REPO LIVE_CLASP_PROJECT EXISTING_DEPLOYMENT_ID
set -euo pipefail
repo_path=${1:?Source repo required}
project_path=${2:?Existing live clasp project required}
deployment_id=${3:?Existing deployment ID required}
node --check "$repo_path/apps-script/team-live/38_MINIAPP_TEAM_LIVE.js"
backup_path=$(mktemp -d /tmp/team-live-apps-script-backup.XXXXXX)
cd "$project_path"
cp -- *.js *.json "$backup_path/"
clasp pull
# Refuse stale overwrite: only reviewed live baseline files can be replaced.
python3 - "$repo_path" "$project_path" <<'PY'
from pathlib import Path
import hashlib,sys
repo,live=map(Path,sys.argv[1:])
for name in ['25_MINIAPP_UNIFIED_SNAPSHOT.js','28_MINIAPP_ADMIN_DATA.js','29_MINIAPP_ADMIN_WRITE.js','33_MINIAPP_ADMIN_WRITE_FINAL.js']:
    expected=(repo/'apps-script-live'/name).read_bytes()
    actual=(live/name).read_bytes()
    if hashlib.sha256(expected).digest()!=hashlib.sha256(actual).digest():
        raise SystemExit('Fresh live baseline changed: '+name+'. Rebase candidate before deployment.')
PY
for source_path in "$repo_path"/apps-script/team-live/*.js; do
  node --check "$source_path"
  cp -- "$source_path" "$project_path/$(basename "$source_path")"
done
# Review tracked files, preserving live-only bot isolation/watchdog modules.
clasp status
clasp push
clasp version 'RM team ID links and live leadership card'
# Existing deployment only; no new deployment or webhook/menu changes.
clasp deploy -i "$deployment_id" -d 'RM team ID links and live leadership card'
clasp pull
printf 'Installed existing deployment. Backup: %s\n' "$backup_path"
# Sync actual live mirror only after confirmed deployment using the project's
# scripts/sync-live-apps-script-to-github.sh and verify private/public snapshots.
