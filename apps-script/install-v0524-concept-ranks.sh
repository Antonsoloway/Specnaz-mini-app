#!/usr/bin/env bash
set -euo pipefail

cd ~/table-chp-1.3
mkdir -p ~/table-chp-backups
BACKUP=~/table-chp-backups/table-chp-before-v0524-concept-ranks-$(date +%Y%m%d-%H%M%S).tgz
tar -czf "$BACKUP" .
echo "BACKUP_OK $BACKUP"

clasp status

curl -fSL https://raw.githubusercontent.com/Antonsoloway/Specnaz-mini-app/main/apps-script/22_MINIAPP_BOT_APP_MENU.js -o 22_MINIAPP_BOT_APP_MENU.js
node --check 22_MINIAPP_BOT_APP_MENU.js
grep -q "app-v0524.html" 22_MINIAPP_BOT_APP_MENU.js
grep -q "MINIAPP_BOT_APP_MENU_VERSION = '1.0.21'" 22_MINIAPP_BOT_APP_MENU.js

echo "MENU_V0524_OK"
clasp status
clasp push

echo "V0524_CONCEPT_RANKS_PUSH_OK"
