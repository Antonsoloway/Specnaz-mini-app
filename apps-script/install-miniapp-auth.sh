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

cp -f "$QUEUE_FILE" "$QUEUE_FILE.before-miniapp-transport.bak"
curl -fsSL "$API_URL" -o "$API_FILE"

python3 - <<'PY'
from pathlib import Path
import re

# 1) doPost: отдельный маршрут Mini App, не попадает в очередь ChatKeeper.
p = Path('05_RELIABLE_WEBHOOK_QUEUE.js')
s = p.read_text(encoding='utf-8')
post_marker = "typeof MINIAPP_doPost_ === 'function'"
if post_marker not in s:
    m = re.search(r'function\s+doPost\s*\(\s*e\s*\)\s*\{', s)
    if not m:
        raise SystemExit('ERROR: function doPost(e) не найден')
    insert = "\n  // Telegram Mini App API: отдельный маршрут, не попадает в очередь ChatKeeper.\n  if (\n    e && e.parameter &&\n    String(e.parameter.miniapp || '') === '1' &&\n    typeof MINIAPP_doPost_ === 'function'\n  ) {\n    return MINIAPP_doPost_(e);\n  }\n"
    s = s[:m.end()] + insert + s[m.end():]
    p.write_text(s, encoding='utf-8')
    print('OK: doPost дополнен Mini App маршрутом')
else:
    print('OK: doPost Mini App маршрут уже установлен')

# 2) doGet: нужен только для JSONP-поллинга результата авторизации.
# Ищем существующий doGet во всех рабочих .js, кроме нового API-модуля.
files = [x for x in Path('.').glob('*.js') if x.name != '11_MINI_APP_API.js']
get_target = None
get_match = None
for f in files:
    text = f.read_text(encoding='utf-8')
    m = re.search(r'function\s+doGet\s*\(\s*e\s*\)\s*\{', text)
    if m:
        get_target, get_match = f, m
        break

get_marker = "typeof MINIAPP_doGet_ === 'function'"
if get_target:
    text = get_target.read_text(encoding='utf-8')
    if get_marker not in text:
        backup = get_target.with_name(get_target.name + '.before-miniapp-get.bak')
        backup.write_text(text, encoding='utf-8')
        insert = "\n  // Telegram Mini App API: JSONP polling route.\n  if (\n    e && e.parameter &&\n    String(e.parameter.miniapp || '') === '1' &&\n    typeof MINIAPP_doGet_ === 'function'\n  ) {\n    return MINIAPP_doGet_(e);\n  }\n"
        text = text[:get_match.end()] + insert + text[get_match.end():]
        get_target.write_text(text, encoding='utf-8')
        print(f'OK: doGet дополнен Mini App маршрутом в {get_target.name}')
    else:
        print(f'OK: doGet Mini App маршрут уже установлен в {get_target.name}')
else:
    # Если doGet в проекте не было, добавляем узкий обработчик только для Mini App.
    with Path('05_RELIABLE_WEBHOOK_QUEUE.js').open('a', encoding='utf-8') as fh:
        fh.write("\n\n// Telegram Mini App API: GET используется только для JSONP polling.\n")
        fh.write("function doGet(e) {\n")
        fh.write("  if (e && e.parameter && String(e.parameter.miniapp || '') === '1' && typeof MINIAPP_doGet_ === 'function') {\n")
        fh.write("    return MINIAPP_doGet_(e);\n")
        fh.write("  }\n")
        fh.write("  return ContentService.createTextOutput('OK');\n")
        fh.write("}\n")
    print('OK: создан новый doGet только для Mini App polling')
PY

echo
echo "Готово. Обновлён $API_FILE и добавлен безопасный транспорт Mini App."
echo "Резервная копия webhook: $QUEUE_FILE.before-miniapp-transport.bak"
echo
grep -n "MINIAPP_doPost_\|MINIAPP_doGet_\|function doGet" *.js || true
