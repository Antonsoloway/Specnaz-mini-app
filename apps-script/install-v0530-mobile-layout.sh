#!/usr/bin/env bash
set -euo pipefail

cd ~/table-chp-1.3
mkdir -p ~/table-chp-backups
BACKUP=~/table-chp-backups/table-chp-before-v0530-mobile-layout-$(date +%Y%m%d-%H%M%S).tgz
tar -czf "$BACKUP" .
echo "BACKUP_OK $BACKUP"

clasp status

curl -fSL https://raw.githubusercontent.com/Antonsoloway/Specnaz-mini-app/main/apps-script/22_MINIAPP_BOT_APP_MENU.js -o 22_MINIAPP_BOT_APP_MENU.js
node --check 22_MINIAPP_BOT_APP_MENU.js
grep -q "app-v0530.html" 22_MINIAPP_BOT_APP_MENU.js
grep -q "MINIAPP_BOT_APP_MENU_VERSION = '1.0.27'" 22_MINIAPP_BOT_APP_MENU.js

echo "MENU_V0530_OK"
clasp status
clasp push

echo "V0530_MOBILE_LAYOUT_PUSH_OK"
