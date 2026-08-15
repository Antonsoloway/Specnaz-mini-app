#!/usr/bin/env bash
set -euo pipefail

cd ~/table-chp-1.3
mkdir -p ~/table-chp-backups

tar -czf ~/table-chp-backups/table-chp-before-v0517-telegram-id-only-$(date +%Y%m%d-%H%M%S).tgz .

echo '=== PRE STATUS ==='
PRE_STATUS="$(clasp status)"
printf '%s\n' "$PRE_STATUS"
printf '%s\n' "$PRE_STATUS" | grep -q '11_PERFORMANCE_OPTIMIZATION.js'
printf '%s\n' "$PRE_STATUS" | grep -q '22_MINIAPP_BOT_APP_MENU.js'
printf '%s\n' "$PRE_STATUS" | grep -q '24_MINIAPP_SPECNAZ_HISTORY.js'

curl -fSL https://raw.githubusercontent.com/Antonsoloway/Specnaz-mini-app/main/apps-script/22_MINIAPP_BOT_APP_MENU.js -o 22_MINIAPP_BOT_APP_MENU.js
curl -fSL https://raw.githubusercontent.com/Antonsoloway/Specnaz-mini-app/main/apps-script/24_MINIAPP_SPECNAZ_HISTORY.js -o 24_MINIAPP_SPECNAZ_HISTORY.js

node --check 22_MINIAPP_BOT_APP_MENU.js
node --check 24_MINIAPP_SPECNAZ_HISTORY.js

grep -q 'app-v0517.html' 22_MINIAPP_BOT_APP_MENU.js
grep -q "MINIAPP_SPECNAZ_HISTORY_VERSION = '1.3.0'" 24_MINIAPP_SPECNAZ_HISTORY.js
grep -q 'MINIAPP_SPECNAZ_HISTORY_ID_COLUMN = 12' 24_MINIAPP_SPECNAZ_HISTORY.js
if grep -q 'Строка базы.*->' 24_MINIAPP_SPECNAZ_HISTORY.js; then
  echo 'ERROR: base-row identity mapping still present'
  exit 1
fi

echo '=== FINAL STATUS ==='
FINAL_STATUS="$(clasp status)"
printf '%s\n' "$FINAL_STATUS"
printf '%s\n' "$FINAL_STATUS" | grep -q '11_PERFORMANCE_OPTIMIZATION.js'
printf '%s\n' "$FINAL_STATUS" | grep -q '22_MINIAPP_BOT_APP_MENU.js'
printf '%s\n' "$FINAL_STATUS" | grep -q '24_MINIAPP_SPECNAZ_HISTORY.js'

clasp push

echo V0517_TELEGRAM_ID_ONLY_PUSH_OK
