#!/usr/bin/env bash
set -euo pipefail

ROOT="${HOME}/table-chp-1.3"
SRC_URL="https://raw.githubusercontent.com/Antonsoloway/Specnaz-mini-app/main/apps-script/14_GITHUB_SNAPSHOT_EXPORT.gs"
TARGET="${ROOT}/14_GITHUB_SNAPSHOT_EXPORT.js"

cd "$ROOT"

for f in 05_RELIABLE_WEBHOOK_QUEUE.js 11_PERFORMANCE_OPTIMIZATION.js 12_MINI_APP_API.js; do
  test -f "$f" || { echo "ERROR: отсутствует $f"; exit 1; }
done

grep -q "RCWQ_VERSION = '2.2.0'" 05_RELIABLE_WEBHOOK_QUEUE.js || {
  echo "ERROR: 05_RELIABLE_WEBHOOK_QUEUE не V2.2.0"; exit 1;
}

grep -q "RC_PERF_VERSION = '1.0.0'" 11_PERFORMANCE_OPTIMIZATION.js || {
  echo "ERROR: 11_PERFORMANCE_OPTIMIZATION не V1.0.0"; exit 1;
}

if [[ -f "$TARGET" ]]; then
  cp "$TARGET" "${TARGET}.before-snapshot-v1.bak"
fi

curl -fsSL "$SRC_URL" -o "$TARGET"
node --check "$TARGET"

TRACKED_COUNT=$(clasp status 2>/dev/null | awk '/Tracked files:/{flag=1;next}/Untracked files:/{flag=0}flag && /^└|^├/{count++}END{print count+0}')

echo ""
echo "✅ SNAPSHOT EXPORT v1.0.0 ПОДГОТОВЛЕН БЕЗ PUSH"
echo "✅ 05 V2.2.0 сохранён"
echo "✅ 11 PERFORMANCE V1.0.0 сохранён"
echo "✅ добавлен 14_GITHUB_SNAPSHOT_EXPORT.js"
echo "Tracked files сейчас: ${TRACKED_COUNT}"
echo ""
echo "ВАЖНО: скрипт НЕ выполнял clasp push."
echo "Сначала проверь clasp status и только потом push."
