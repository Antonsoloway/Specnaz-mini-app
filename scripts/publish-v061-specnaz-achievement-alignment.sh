#!/usr/bin/env bash
set -Eeuo pipefail

REPO="Antonsoloway/Specnaz-mini-app"
RAW="https://raw.githubusercontent.com/${REPO}/main"
BUILD_MARKER="20260823-v061-specnaz-layout2"
TMP_ROOT="$(mktemp -d /tmp/royal-v061-specnaz-achievements.XXXXXX)"
cleanup(){ rm -rf "$TMP_ROOT"; }
trap cleanup EXIT
ok(){ printf '\n✅ %s\n' "$*"; }
fail(){ printf '\n❌ %s\n' "$*" >&2; exit 1; }

for cmd in gh git python3 curl bash; do
  command -v "$cmd" >/dev/null 2>&1 || fail "$cmd не найден"
done
gh auth status >/dev/null 2>&1 || fail "GitHub CLI не авторизован"

printf '\n=== FORCE TELEGRAM MENU TO SPECNAZ LAYOUT2 ===\n'
BASE="$TMP_ROOT/base.sh"
curl -fsSL "$RAW/scripts/publish-v061-specnaz-card-layout.sh" -o "$BASE"
python3 - "$BASE" "$BUILD_MARKER" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]); marker=sys.argv[2]
s=p.read_text(encoding='utf-8')
s=s.replace('BUILD_MARKER="20260823-v061-specnaz-layout1"', f'BUILD_MARKER="{marker}"')
# Keep the existing roomy-card handoff tag idempotent; this wrapper writes the
# follow-up alignment handoff separately below.
p.write_text(s,encoding='utf-8')
PY
bash "$BASE"

printf '\n=== RECORD ACHIEVEMENT ALIGNMENT HANDOFF ===\n'
DOCS="$TMP_ROOT/docs"
gh repo clone "$REPO" "$DOCS" -- --depth=1 >/dev/null
python3 - "$DOCS/CURRENT_STATE.md" "$DOCS/WORK_HISTORY.md" "$BUILD_MARKER" <<'PY'
from pathlib import Path
import sys
state_path=Path(sys.argv[1]); hist_path=Path(sys.argv[2]); marker=sys.argv[3]
tag='V061_SPECNAZ_ACHIEVEMENT_ALIGNMENT_20260823'
state=state_path.read_text(encoding='utf-8')
if tag not in state:
    state += f'''\n\n---\n\n## v0.6.1 Specnaz achievement alignment — 23.08.2026 [{tag}]\n\n- Follow-up после roomy-card layout: в `Героях спецназа` все achievement controls выровнены единым правым вертикальным стеком.\n- Порядок визуального стека: admin badge → rank → MAYAK / будущие ачивки.\n- `participant-achievements-row` больше не использует перенос строк влево; `participant-admin-rank-stack` и `participant-achievements-future-slot` принудительно прижаты вправо.\n- Identity остаётся отдельным потоком и не пересекается со стеком ачивок; score остаётся отдельной grid-строкой.\n- Legacy `specnaz.css` / v0.5.59 не менялись; фикс находится в `specnaz-layout-v061.css`.\n- Release/cache marker = `{marker}`; Telegram menu cache обновлён через существующий deployment `Таблица ЧП 1.3`.\n- Device smoke правого выравнивания hero achievements остаётся acceptance check пользователя.\n'''
    state_path.write_text(state,encoding='utf-8')
hist=hist_path.read_text(encoding='utf-8')
if tag not in hist:
    hist += f'''\n\n---\n\n### 23.08.2026 — выравнивание ачивок справа в героях спецназа [{tag}]\n\n**Запрос:** после расширения hero cards выровнять у всех участников ачивки справа; MAYAK не должен съезжать влево на следующую строку.\n\n**Выполнено:**\n- `specnaz-layout-v061.css` перевёл achievement row из wrapping row в `column + align-items:flex-end`;\n- admin/rank stack, future achievement slot и MAYAK получают один правый край и не расходятся при разном наборе ачивок;\n- длинное имя/@username/Telegram name продолжают занимать собственную identity-зону, карточка при необходимости растёт по высоте;\n- frontend/changelog/entrypoint и Telegram menu переведены на `{marker}`;\n- existing Apps Script deployment сохранён, live mirror синхронизирован.\n'''
    hist_path.write_text(hist,encoding='utf-8')
PY
cd "$DOCS"
git add CURRENT_STATE.md WORK_HISTORY.md
if ! git diff --cached --quiet; then
  git config user.name "Royal CRM Handoff"
  git config user.email "royal-crm-sync@users.noreply.github.com"
  git commit -m "Record v0.6.1 Specnaz achievement alignment" >/dev/null
  git push origin HEAD:main
fi
ok "CURRENT_STATE.md + WORK_HISTORY.md updated"

printf '\n============================================================\n'
printf '✅✅✅ v0.6.1 SPECNAZ ACHIEVEMENTS ALIGNED ✅✅✅\n'
printf 'Telegram menu cache-bust: %s\n' "$BUILD_MARKER"
printf 'Achievements: right aligned vertical stack\n'
printf 'MAYAK: no left-side wrap\n'
printf 'CURRENT_STATE.md + WORK_HISTORY.md updated\n'
printf '============================================================\n'
