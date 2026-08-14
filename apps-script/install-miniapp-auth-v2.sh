#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$PWD}"
cd "$ROOT"

CORE_FILE="01_CORE_MAIN.js"
QUEUE_FILE="05_RELIABLE_WEBHOOK_QUEUE.js"
PERF_FILE="11_PERFORMANCE_OPTIMIZATION.js"
API_FILE="12_MINI_APP_API.js"
API_URL="https://raw.githubusercontent.com/Antonsoloway/Specnaz-mini-app/main/apps-script/12_MINI_APP_API.gs"

for f in "$CORE_FILE" "$QUEUE_FILE" "$PERF_FILE"; do
  if [[ ! -f "$f" ]]; then
    echo "ERROR: $f не найден. Ничего не изменено."
    exit 1
  fi
done

if ! grep -q "const CRM_VERSION = '2.2.6'" "$CORE_FILE"; then
  echo "ERROR: 01_CORE_MAIN не похож на проверенную CRM 2.2.6. Ничего не изменено."
  exit 1
fi

if ! grep -q "const RCWQ_VERSION = '2.2.0'" "$QUEUE_FILE" || \
   ! grep -q "insertDataOption=OVERWRITE" "$QUEUE_FILE" || \
   ! grep -q "RCWQ_BUFFER_LOW_WATER_ROWS = 500" "$QUEUE_FILE"; then
  echo "ERROR: 05_RELIABLE_WEBHOOK_QUEUE не похож на проверенный V2.2 BUFFER HOTFIX. Ничего не изменено."
  exit 1
fi

if ! grep -q "RC_PERF_VERSION = '1.0.0'" "$PERF_FILE"; then
  echo "ERROR: 11_PERFORMANCE_OPTIMIZATION не похож на проверенную V1.0.0. Ничего не изменено."
  exit 1
fi

if [[ -f "11_MINI_APP_API.js" ]]; then
  echo "ERROR: найден старый 11_MINI_APP_API.js. Удали/вынеси его перед установкой. Ничего не изменено."
  exit 1
fi

cp -f "$CORE_FILE" "$CORE_FILE.before-miniapp-v2.bak"
cp -f "$QUEUE_FILE" "$QUEUE_FILE.before-miniapp-v2.bak"
curl -fsSL "$API_URL" -o "$API_FILE"

python3 - <<'PY'
from pathlib import Path

# 01: сохраняем существующий глобальный doGet и добавляем только Mini App ветку.
p = Path('01_CORE_MAIN.js')
s = p.read_text(encoding='utf-8')
marker = "String(e.parameter.miniapp || '') === '1'"
old = """function doGet() {\n  return ContentService\n    .createTextOutput('Royal CRM webhook v' + CRM_VERSION + ' is alive')\n    .setMimeType(ContentService.MimeType.TEXT);\n}"""
new = """function doGet(e) {\n  // Telegram Mini App API: только polling-ветка; обычный health-check сохранён.\n  if (\n    e && e.parameter &&\n    String(e.parameter.miniapp || '') === '1' &&\n    typeof MINIAPP_doGet_ === 'function'\n  ) {\n    return MINIAPP_doGet_(e);\n  }\n\n  return ContentService\n    .createTextOutput('Royal CRM webhook v' + CRM_VERSION + ' is alive')\n    .setMimeType(ContentService.MimeType.TEXT);\n}"""
if "typeof MINIAPP_doGet_ === 'function'" not in s:
    if old not in s:
        raise SystemExit('ERROR: точный штатный doGet в 01_CORE_MAIN не найден; 01 не изменён')
    s = s.replace(old, new, 1)
    p.write_text(s, encoding='utf-8')
    print('OK: 01 doGet дополнен только Mini App polling-веткой')
else:
    print('OK: Mini App GET-маршрут уже установлен')

# 05: сохраняем очередь V2.2 целиком и добавляем только ранний Mini App POST-маршрут.
p = Path('05_RELIABLE_WEBHOOK_QUEUE.js')
s = p.read_text(encoding='utf-8')
needle = "function doPost(e) {\n  const raw = RCWQ_getRawPostBody_(e);"
replacement = """function doPost(e) {\n  // Telegram Mini App API: отдельный маршрут, НЕ попадает в очередь ChatKeeper.\n  if (\n    e && e.parameter &&\n    String(e.parameter.miniapp || '') === '1' &&\n    typeof MINIAPP_doPost_ === 'function'\n  ) {\n    return MINIAPP_doPost_(e);\n  }\n\n  const raw = RCWQ_getRawPostBody_(e);"""
if "typeof MINIAPP_doPost_ === 'function'" not in s:
    if needle not in s:
        raise SystemExit('ERROR: точный штатный doPost V2.2 в 05 не найден; 05 не изменён')
    s = s.replace(needle, replacement, 1)
    p.write_text(s, encoding='utf-8')
    print('OK: 05 doPost дополнен только ранней Mini App веткой')
else:
    print('OK: Mini App POST-маршрут уже установлен')
PY

# Синтаксис всех отправляемых JS.
for f in *.js; do
  node --check "$f" >/dev/null
 done

# Жёсткие гарантии после патча.
GET_COUNT=$(grep -RhoE '^function doGet\s*\(' -- *.js | wc -l | tr -d ' ')
POST_COUNT=$(grep -RhoE '^function doPost\s*\(' -- *.js | wc -l | tr -d ' ')
if [[ "$GET_COUNT" != "1" ]]; then
  echo "ERROR: глобальных doGet найдено $GET_COUNT вместо 1. НИЧЕГО НЕ PUSH." >&2
  exit 1
fi
if [[ "$POST_COUNT" != "1" ]]; then
  echo "ERROR: глобальных doPost найдено $POST_COUNT вместо 1. НИЧЕГО НЕ PUSH." >&2
  exit 1
fi

if ! grep -q "RC_PERF_VERSION = '1.0.0'" "$PERF_FILE"; then
  echo "ERROR: файл 11 изменился. НИЧЕГО НЕ PUSH." >&2
  exit 1
fi

if ! grep -q "insertDataOption=OVERWRITE" "$QUEUE_FILE" || ! grep -q "RCWQ_BUFFER_GROW_ROWS = 2500" "$QUEUE_FILE"; then
  echo "ERROR: признаки BUFFER HOTFIX в 05 потеряны. НИЧЕГО НЕ PUSH." >&2
  exit 1
fi

echo
echo "✅ MINI APP v0.2.1 ПОДГОТОВЛЕН БЕЗ PUSH"
echo "✅ 11_PERFORMANCE_OPTIMIZATION сохранён"
echo "✅ 05 остаётся V2.2 BUFFER HOTFIX"
echo "✅ глобальный doGet: $GET_COUNT; глобальный doPost: $POST_COUNT"
echo "✅ новый модуль: $API_FILE"
echo
echo "Изменения 01:"
diff -u "$CORE_FILE.before-miniapp-v2.bak" "$CORE_FILE" || true
echo
echo "Изменения 05:"
diff -u "$QUEUE_FILE.before-miniapp-v2.bak" "$QUEUE_FILE" || true
echo
echo "ВАЖНО: скрипт НЕ выполнял clasp push. Сначала проверь diff выше."
