#!/usr/bin/env bash
set -Eeuo pipefail

REPO="Antonsoloway/Specnaz-mini-app"
MARKER="20260824-v061-screen-twitch1"
TMP="$(mktemp -d /tmp/royal-v061-screen-html.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

gh auth status >/dev/null 2>&1 || { echo '❌ GitHub CLI не авторизован' >&2; exit 1; }
gh repo clone "$REPO" "$TMP/repo" -- --depth=1 >/dev/null
python3 - "$TMP/repo/app-v0600.html" "$MARKER" <<'PY'
from pathlib import Path
import re,sys
p=Path(sys.argv[1]); marker=sys.argv[2]
s=p.read_text(encoding='utf-8')
patterns=[
    (r'version-v0600\.js\?v=[^"\s]+',f'version-v0600.js?v={marker}'),
    (r'changelog-v0601\.js\?v=[^"\s]+',f'changelog-v0601.js?v={marker}')
]
for pat,repl in patterns:
    s,n=re.subn(pat,repl,s,count=1)
    if n!=1: raise SystemExit(f'[ERROR] app-v0600 anchor missing: {pat}')
p.write_text(s,encoding='utf-8')
PY
cd "$TMP/repo"
git add app-v0600.html
git diff --check
if ! git diff --cached --quiet; then
  git config user.name "Royal CRM Release"
  git config user.email "royal-crm-sync@users.noreply.github.com"
  git commit -m "Bust v0.6.1 screen twitch runtime cache" >/dev/null
  git push origin HEAD:main
fi
echo "✅ app-v0600 runtime cache marker: $MARKER"
