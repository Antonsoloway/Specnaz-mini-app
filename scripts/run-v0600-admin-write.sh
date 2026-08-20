#!/usr/bin/env bash
set -Eeuo pipefail

RAW_INSTALLER="https://raw.githubusercontent.com/Antonsoloway/Specnaz-mini-app/v0.6-admin-write/scripts/install-v0600-admin-write.sh"
TMP="$(mktemp /tmp/royal-v0600-admin-write.XXXXXX.sh)"
cleanup(){ rm -f "$TMP"; }
trap cleanup EXIT

printf '[INFO] Downloading v0.6 hardened admin-write installer...\n'
curl -fsSL "$RAW_INSTALLER" -o "$TMP"

printf '[INFO] BASH SYNTAX PREFLIGHT\n'
bash -n "$TMP"
printf '✅ INSTALLER SYNTAX OK\n'

bash "$TMP"
