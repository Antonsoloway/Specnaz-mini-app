#!/usr/bin/env bash
set -Eeuo pipefail

RAW_INSTALLER="https://raw.githubusercontent.com/Antonsoloway/Specnaz-mini-app/v0.6-admin-write/scripts/install-v0600-admin-write-final.sh"
TMP="$(mktemp /tmp/royal-v0600-admin-write-final.XXXXXX.sh)"
cleanup(){ rm -f "$TMP"; }
trap cleanup EXIT

printf '[INFO] Downloading v0.6 FINAL admin-write installer...\n'
curl -fsSL "$RAW_INSTALLER" -o "$TMP"

printf '[INFO] BASH SYNTAX PREFLIGHT\n'
bash -n "$TMP"
printf '✅ FINAL INSTALLER SYNTAX OK\n'

bash "$TMP"
