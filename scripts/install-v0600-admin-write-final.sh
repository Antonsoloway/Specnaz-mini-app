#!/usr/bin/env bash
set -Eeuo pipefail

# Immutable vetted installer body from the branch state immediately before the
# final photo-cleanup guard work. That body downloads modules 29–33 from the
# CURRENT v0.6-admin-write branch, so it installs the latest write.4/photo.3
# implementation while the orchestration logic itself cannot drift accidentally.
VETTED_COMMIT="9dbd9dedde0621b8ade5ef3127da0cac62a821b0"
VETTED_URL="https://raw.githubusercontent.com/Antonsoloway/Specnaz-mini-app/${VETTED_COMMIT}/scripts/install-v0600-admin-write-final.sh"
TMP="$(mktemp /tmp/royal-v0600-vetted-installer.XXXXXX.sh)"
cleanup(){ rm -f "$TMP"; }
trap cleanup EXIT

printf '[INFO] Loading immutable vetted v0.6 installer body: %s\n' "$VETTED_COMMIT"
curl -fsSL "$VETTED_URL" -o "$TMP"
bash -n "$TMP"
printf '✅ VETTED INSTALLER BODY SYNTAX OK\n'

bash "$TMP"
