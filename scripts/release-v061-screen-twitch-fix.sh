#!/usr/bin/env bash
set -Eeuo pipefail
RAW="https://raw.githubusercontent.com/Antonsoloway/Specnaz-mini-app/main/scripts"
bash <(curl -fsSL "$RAW/prepare-v061-screen-twitch-html.sh")
bash <(curl -fsSL "$RAW/publish-v061-screen-twitch-watchdog-fix.sh")
