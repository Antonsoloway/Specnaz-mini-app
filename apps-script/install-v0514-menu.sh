#!/usr/bin/env bash
set -euo pipefail
cd ~/table-chp-1.3
mkdir -p ~/table-chp-backups

tar -czf ~/table-chp-backups/table-chp-before-v0514-menu-$(date +%Y%m%d-%H%M%S).tgz .

echo '=== PRE STATUS ==='
PRE="$(clasp status)"
printf '%s\n' "$PRE"
printf '%s\n' "$PRE" | grep -q '11_PERFORMANCE_OPTIMIZATION.js'

curl -fSL https://raw.githubusercontent.com/Antonsoloway/Specnaz-mini-app/main/apps-script/22_MINIAPP_BOT_APP_MENU.js -o 22_MINIAPP_BOT_APP_MENU.js
node --check 22_MINIAPP_BOT_APP_MENU.js

echo '=== FINAL STATUS ==='
FINAL="$(clasp status)"
printf '%s\n' "$FINAL"
printf '%s\n' "$FINAL" | grep -q '11_PERFORMANCE_OPTIMIZATION.js'
printf '%s\n' "$FINAL" | grep -q '22_MINIAPP_BOT_APP_MENU.js'

clasp push

echo V0514_MENU_PUSH_OK
