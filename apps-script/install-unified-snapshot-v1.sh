#!/usr/bin/env bash
set -euo pipefail

cd ~/table-chp-1.3
mkdir -p ~/table-chp-backups
BACKUP=~/table-chp-backups/table-chp-before-unified-snapshot-$(date +%Y%m%d-%H%M%S).tgz
tar -czf "$BACKUP" .
echo "BACKUP_OK $BACKUP"

clasp status

curl -fSL https://raw.githubusercontent.com/Antonsoloway/Specnaz-mini-app/main/apps-script/25_MINIAPP_UNIFIED_SNAPSHOT.js -o 25_MINIAPP_UNIFIED_SNAPSHOT.js
node --check 25_MINIAPP_UNIFIED_SNAPSHOT.js
grep -q "MINIAPP_UNIFIED_SNAPSHOT_VERSION = '1.0.0'" 25_MINIAPP_UNIFIED_SNAPSHOT.js
grep -q "MINIAPP_exportUnifiedSnapshotToGitHub" 25_MINIAPP_UNIFIED_SNAPSHOT.js
grep -q "MINIAPP_refreshProfileStatsInSnapshot" 25_MINIAPP_UNIFIED_SNAPSHOT.js
grep -q "MINIAPP_refreshSpecnazHistorySnapshot" 25_MINIAPP_UNIFIED_SNAPSHOT.js

echo "UNIFIED_SNAPSHOT_FILE_OK"
clasp status
echo "READY_FOR_CLASP_PUSH"
