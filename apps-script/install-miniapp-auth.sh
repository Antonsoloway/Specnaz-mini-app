#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$PWD}"
cd "$ROOT"

QUEUE_FILE="05_RELIABLE_WEBHOOK_QUEUE.js"
API_FILE="11_MINI_APP_API.js"
API_URL="https://raw.githubusercontent.com/Antonsoloway/Specnaz-mini-app/main/apps-script/11_MINI_APP_API.gs"

if [[ ! -f "$QUEUE_FILE" ]]; then
  echo "ERROR: $QUEUE_FILE не найден. Запусти скрипт из папки ~/table-chp-1.3"
  exit 1
fi

cp -f "$QUEUE_FILE" "$QUEUE_FILE.before-miniapp.bak"
curl -fsSL "$API_URL" -o "$API_FILE"

python3 - <<'PY'
from pathlib import Path
p = Path('05_RELIABLE_WEBHOOK_QUEUE.js')
s = p.read_text(encoding='utf-8')
needle = 'function doPost(e) {'
marker = "String(e.parameter.miniapp || '') === '1'"
if marker not in s:
    if needle not in s:
        raise SystemExit('ERROR: function doPost(e) { не найден')
    replacement = needle + "\n  // Telegram Mini App API: отдельный маршрут, не попадает в очередь ChatKeeper.\n  if (\n    e && e.parameter &&\n    String(e.parameter.miniapp || '') === '1' &&\n    typeof MINIAPP_doPost_ === 'function'\n  ) {\n    return MINIAPP_doPost_(e);\n  }"
    s = s.replace(needle, replacement, 1)
    p.write_text(s, encoding='utf-8')
    print('OK: doPost дополнен Mini App маршрутом')
else:
    print('OK: Mini App маршрут уже был установлен')
PY

echo
echo "Готово. Создан $API_FILE и безопасно дополнен $QUEUE_FILE"
echo "Резервная копия: $QUEUE_FILE.before-miniapp.bak"
echo
grep -n "Telegram Mini App API\|miniapp ||\|function MINIAPP_doPost_" "$QUEUE_FILE" "$API_FILE" || true
