#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$PWD}"
cd "$ROOT"

CORE_FILE="01_CORE_MAIN.js"
QUEUE_FILE="05_RELIABLE_WEBHOOK_QUEUE.js"
PERF_FILE="11_PERFORMANCE_OPTIMIZATION.js"
API_FILE="12_MINI_APP_API.js"
UI_FILE="13_MINI_APP_UI.js"
HTML_FILE="MiniApp.html"
BASE_URL="https://raw.githubusercontent.com/Antonsoloway/Specnaz-mini-app/main/apps-script"

for f in "$CORE_FILE" "$QUEUE_FILE" "$PERF_FILE" "$API_FILE"; do
  [[ -f "$f" ]] || { echo "ERROR: $f не найден. Ничего не изменено."; exit 1; }
done

if ! grep -q "const CRM_VERSION = '2.2.6'" "$CORE_FILE"; then
  echo "ERROR: 01_CORE_MAIN не похож на проверенную CRM 2.2.6. Ничего не изменено."
  exit 1
fi
if ! grep -q "const RCWQ_VERSION = '2.2.0'" "$QUEUE_FILE" || ! grep -q "insertDataOption=OVERWRITE" "$QUEUE_FILE"; then
  echo "ERROR: 05_RELIABLE_WEBHOOK_QUEUE не похож на V2.2 BUFFER HOTFIX. Ничего не изменено."
  exit 1
fi
if ! grep -q "RC_PERF_VERSION = '1.0.0'" "$PERF_FILE"; then
  echo "ERROR: 11_PERFORMANCE_OPTIMIZATION не похож на V1.0.0. Ничего не изменено."
  exit 1
fi
if ! grep -q "const MINIAPP_VERSION = '0.2.4'" "$API_FILE"; then
  echo "ERROR: 12_MINI_APP_API не похож на v0.2.4. Ничего не изменено."
  exit 1
fi

cp -f "$CORE_FILE" "$CORE_FILE.before-miniapp-ui-v3.bak"
curl -fsSL "$BASE_URL/13_MINI_APP_UI.gs" -o "$UI_FILE"
curl -fsSL "$BASE_URL/MiniApp.html" -o "$HTML_FILE"

python3 - <<'PY'
from pathlib import Path
p = Path('01_CORE_MAIN.js')
s = p.read_text(encoding='utf-8')
branch = "String(e.parameter.miniappui || '') === '1'"
if branch in s:
    print('OK: Mini App UI маршрут уже установлен')
else:
    needle = 'function doGet(e) {\n'
    if needle not in s:
        raise SystemExit('ERROR: function doGet(e) в 01 не найден; 01 не изменён')
    insert = """function doGet(e) {\n  // Telegram Mini App UI: HtmlService на том же Apps Script, без CORS/JSONP.\n  if (\n    e && e.parameter &&\n    String(e.parameter.miniappui || '') === '1' &&\n    typeof MINIAPP_renderUi_ === 'function'\n  ) {\n    return MINIAPP_renderUi_();\n  }\n\n"""
    s = s.replace(needle, insert, 1)
    p.write_text(s, encoding='utf-8')
    print('OK: 01 doGet дополнен Mini App UI маршрутом')
PY

for f in *.js; do node --check "$f" >/dev/null; done

GET_COUNT=$(grep -RhoE '^function doGet\s*\(' -- *.js | wc -l | tr -d ' ')
POST_COUNT=$(grep -RhoE '^function doPost\s*\(' -- *.js | wc -l | tr -d ' ')
[[ "$GET_COUNT" == "1" ]] || { echo "ERROR: глобальных doGet $GET_COUNT вместо 1. НИЧЕГО НЕ PUSH."; exit 1; }
[[ "$POST_COUNT" == "1" ]] || { echo "ERROR: глобальных doPost $POST_COUNT вместо 1. НИЧЕГО НЕ PUSH."; exit 1; }

grep -q "const RC_PERF_VERSION = '1.0.0'" "$PERF_FILE" || { echo "ERROR: 11 изменился. НИЧЕГО НЕ PUSH."; exit 1; }
grep -q "insertDataOption=OVERWRITE" "$QUEUE_FILE" || { echo "ERROR: 05 BUFFER HOTFIX потерян. НИЧЕГО НЕ PUSH."; exit 1; }
grep -q "const MINIAPP_VERSION = '0.2.4'" "$API_FILE" || { echo "ERROR: 12 изменился неожиданно. НИЧЕГО НЕ PUSH."; exit 1; }
grep -q "function MINIAPP_auth(initData)" "$UI_FILE" || { echo "ERROR: 13 UI bridge некорректен. НИЧЕГО НЕ PUSH."; exit 1; }
grep -q "google.script.run" "$HTML_FILE" || { echo "ERROR: MiniApp.html некорректен. НИЧЕГО НЕ PUSH."; exit 1; }

echo
echo "✅ MINI APP UI v0.3.0 ПОДГОТОВЛЕН БЕЗ PUSH"
echo "✅ 05 V2.2 BUFFER HOTFIX сохранён"
echo "✅ 11 PERFORMANCE сохранён"
echo "✅ 12 API v0.2.4 сохранён"
echo "✅ глобальный doGet: $GET_COUNT; doPost: $POST_COUNT"
echo "✅ добавлены: $UI_FILE и $HTML_FILE"
echo
echo "Изменения 01:"
diff -u "$CORE_FILE.before-miniapp-ui-v3.bak" "$CORE_FILE" || true
echo
echo "ВАЖНО: скрипт НЕ выполнял clasp push."
