#!/usr/bin/env bash
set -Eeuo pipefail

RAW_INSTALLER="https://raw.githubusercontent.com/Antonsoloway/Specnaz-mini-app/v0.6-admin-write/scripts/install-v0600-admin-write.sh"
TMP="$(mktemp /tmp/royal-v0600-admin-write.XXXXXX.sh)"
cleanup(){ rm -f "$TMP"; }
trap cleanup EXIT

printf '[INFO] Downloading v0.6 admin-write installer...\n'
curl -fsSL "$RAW_INSTALLER" -o "$TMP"

# Apps Script ContentService normally redirects to the generated content URL.
# --data already makes the first request POST; do not force POST on the redirect.
python3 - "$TMP" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
s = p.read_text(encoding='utf-8')
old = "curl -sS -L --max-time 30 -X POST \\\n"
new = "curl -sS -L --max-time 30 \\\n"
if old not in s:
    raise SystemExit('[ERROR] Expected route-check curl anchor not found; installer changed unexpectedly')
p.write_text(s.replace(old, new, 1), encoding='utf-8')
PY

printf '[INFO] BASH SYNTAX PREFLIGHT\n'
bash -n "$TMP"
printf '✅ INSTALLER SYNTAX OK\n'

bash "$TMP"
