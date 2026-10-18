#!/usr/bin/env bash
set -euo pipefail
repo_path=${1:?Source repo required}
project_path=${2:?Existing live clasp project required}
deployment_id=${3:?Existing deployment ID required}
backup_path=$(mktemp -d /tmp/rk-team-links-backup.XXXXXX)
cd "$project_path"
cp -- *.js *.json "$backup_path/"
clasp pull
python3 - "$repo_path" "$project_path" <<'VERIFY'
from pathlib import Path
import hashlib,sys
repo,live=map(Path,sys.argv[1:])
for name in ['33_MINIAPP_ADMIN_WRITE_FINAL.js','38_MINIAPP_TEAM_LIVE.js']:
    if (repo/'apps-script-live'/name).read_bytes() != (live/name).read_bytes():
        raise SystemExit('Fresh live baseline changed: '+name+'. Rebase candidate before deployment.')
VERIFY
for name in 33_MINIAPP_ADMIN_WRITE_FINAL.js 38_MINIAPP_TEAM_LIVE.js; do
  node --check "$repo_path/apps-script/team-live/$name"
  cp -- "$repo_path/apps-script/team-live/$name" "$project_path/$name"
done
clasp status
clasp push
clasp version 'RM/RK game-scoped team ID links'
clasp deploy -i "$deployment_id" -d 'RM/RK game-scoped team ID links'
clasp pull
printf 'Existing deployment updated. Backup: %s\n' "$backup_path"
