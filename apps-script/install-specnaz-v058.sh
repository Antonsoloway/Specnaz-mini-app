#!/usr/bin/env bash
set -euo pipefail

cd ~/table-chp-1.3
mkdir -p ~/table-chp-backups

tar -czf ~/table-chp-backups/table-chp-before-specnaz-v058-$(date +%Y%m%d-%H%M%S).tgz .

echo '=== STATUS BEFORE ==='
BEFORE="$(clasp status)"
printf '%s\n' "$BEFORE"
printf '%s\n' "$BEFORE" | sed -n '/Tracked files:/,/Untracked files:/p' | grep -q '11_PERFORMANCE_OPTIMIZATION.js'

curl -fSL https://raw.githubusercontent.com/Antonsoloway/Specnaz-mini-app/main/apps-script/22_MINIAPP_BOT_APP_MENU.js -o 22_MINIAPP_BOT_APP_MENU.js
curl -fSL https://raw.githubusercontent.com/Antonsoloway/Specnaz-mini-app/main/apps-script/24_MINIAPP_SPECNAZ_HISTORY.js -o 24_MINIAPP_SPECNAZ_HISTORY.js

node --check 22_MINIAPP_BOT_APP_MENU.js
node --check 24_MINIAPP_SPECNAZ_HISTORY.js

echo '=== STATUS AFTER ==='
AFTER="$(clasp status)"
printf '%s\n' "$AFTER"
TRACKED="$(printf '%s\n' "$AFTER" | sed -n '/Tracked files:/,/Untracked files:/p')"
printf '%s\n' "$TRACKED" | grep -q '11_PERFORMANCE_OPTIMIZATION.js'
printf '%s\n' "$TRACKED" | grep -q '22_MINIAPP_BOT_APP_MENU.js'
printf '%s\n' "$TRACKED" | grep -q '24_MINIAPP_SPECNAZ_HISTORY.js'
if printf '%s\n' "$TRACKED" | grep -q '\.bak'; then
  echo 'ERROR: .bak file is tracked; refusing clasp push.' >&2
  exit 1
fi

clasp push

echo 'SPECNAZ_V058_PUSH_OK'
