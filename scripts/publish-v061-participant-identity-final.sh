#!/usr/bin/env bash
set -Eeuo pipefail
TMP="$(mktemp /tmp/royal-v061-participant-identity-final.XXXXXX.sh)"
trap 'rm -f "$TMP"' EXIT
curl -fsSL https://raw.githubusercontent.com/Antonsoloway/Specnaz-mini-app/main/scripts/publish-v061-participant-identity.sh -o "$TMP"
python3 - "$TMP" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1])
s=p.read_text(encoding='utf-8')
s=s.replace('`participant-identity-v061-v2.js` = `0.6.1-participant-identity.2`','`participant-identity-v061-v2.js` = `0.6.1-participant-identity.4`')
s=s.replace('создан v0.6.1-only identity decorator без изменения legacy v0.5.59 renderers;','создан v0.6.1-only identity decorator `0.6.1-participant-identity.4` без изменения legacy v0.5.59 renderers;')
p.write_text(s,encoding='utf-8')
PY
bash "$TMP"
