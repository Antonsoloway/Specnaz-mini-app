#!/usr/bin/env bash
set -euo pipefail

cd ~/table-chp-1.3
mkdir -p ~/table-chp-backups

tar -czf ~/table-chp-backups/table-chp-before-v0518-avatar-click-$(date +%Y%m%d-%H%M%S).tgz .

echo '=== PRE STATUS ==='
PRE_STATUS="$(clasp status)"
printf '%s\n' "$PRE_STATUS"
printf '%s\n' "$PRE_STATUS" | grep -q '11_PERFORMANCE_OPTIMIZATION.js'
printf '%s\n' "$PRE_STATUS" | grep -q '22_MINIAPP_BOT_APP_MENU.js'

curl -fSL https://raw.githubusercontent.com/Antonsoloway/Specnaz-mini-app/main/apps-script/22_MINIAPP_BOT_APP_MENU.js -o 22_MINIAPP_BOT_APP_MENU.js
node --check 22_MINIAPP_BOT_APP_MENU.js
grep -q 'app-v0518.html' 22_MINIAPP_BOT_APP_MENU.js

echo '=== FINAL STATUS ==='
FINAL_STATUS="$(clasp status)"
printf '%s\n' "$FINAL_STATUS"
printf '%s\n' "$FINAL_STATUS" | grep -q '11_PERFORMANCE_OPTIMIZATION.js'
printf '%s\n' "$FINAL_STATUS" | grep -q '22_MINIAPP_BOT_APP_MENU.js'

clasp push

echo V0518_AVATAR_CLICK_PUSH_OK
