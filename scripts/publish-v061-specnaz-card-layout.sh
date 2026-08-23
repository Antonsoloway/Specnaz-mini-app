#!/usr/bin/env bash
set -Eeuo pipefail

REPO="Antonsoloway/Specnaz-mini-app"
RAW="https://raw.githubusercontent.com/${REPO}/main"
BUILD_MARKER="20260823-v061-specnaz-layout1"
TMP_ROOT="$(mktemp -d /tmp/royal-v061-specnaz-layout.XXXXXX)"
cleanup(){ rm -rf "$TMP_ROOT"; }
trap cleanup EXIT
ok(){ printf '\n✅ %s\n' "$*"; }
fail(){ printf '\n❌ %s\n' "$*" >&2; exit 1; }

for cmd in gh git python3 curl bash; do
  command -v "$cmd" >/dev/null 2>&1 || fail "$cmd не найден"
done
gh auth status >/dev/null 2>&1 || fail "GitHub CLI не авторизован"

printf '\n=== PATCH FRONTEND + CHANGELOG ===\n'
FRONT="$TMP_ROOT/frontend"
gh repo clone "$REPO" "$FRONT" -- --depth=1 >/dev/null
python3 - "$FRONT" "$BUILD_MARKER" <<'PY'
from pathlib import Path
import re, sys
root=Path(sys.argv[1]); marker=sys.argv[2]

app=root/'app-v0600.html'
s=app.read_text(encoding='utf-8')
anchor='<link rel="stylesheet" href="specnaz.css?v=0.5.59" />'
link=f'<link rel="stylesheet" href="specnaz-layout-v061.css?v={marker}" />'
if 'specnaz-layout-v061.css' not in s:
    if anchor not in s: raise SystemExit('[ERROR] specnaz.css anchor missing')
    s=s.replace(anchor, anchor+'\n  '+link, 1)
else:
    s=re.sub(r'<link rel="stylesheet" href="specnaz-layout-v061\.css\?v=[^"]+"\s*/>', link, s, count=1)
s=re.sub(r'changelog-v0601\.js\?v=[^"\s]+', f'changelog-v0601.js?v={marker}', s, count=1)
app.write_text(s,encoding='utf-8')

for name in ('app-v0601.html','app.html'):
    p=root/name
    text=p.read_text(encoding='utf-8')
    text,n=re.subn(r"params\.set\('releaseBuild',\s*'[^']+'\);", f"params.set('releaseBuild', '{marker}');", text, count=1)
    if n != 1: raise SystemExit(f'[ERROR] releaseBuild anchor missing in {name}')
    p.write_text(text,encoding='utf-8')

ch=root/'changelog-v0601.js'
text=ch.read_text(encoding='utf-8')
items=[
  "        'Исправлена вёрстка «Герои спецназа» после добавления полной информации об участнике: карточка использует больше доступной ширины, имя/Telegram-данные/звание больше не накладываются друг на друга, а на узких экранах карточка увеличивается по высоте вместо обрезания.',",
  "        'Карточки «Истории спецназа» также расширены; длинные имя, @username, Telegram-имя, звание, счёт и текст теперь переносятся внутри карточки без наложений и обрезания.',"
]
anchor_line="        'Последующие исправления, которые входят в v0.6.1, будут дописываться в эту карточку истории изменений.'"
for item in items:
    if item.strip(" ,'\n") not in text:
        if anchor_line not in text: raise SystemExit('[ERROR] changelog anchor missing')
        text=text.replace(anchor_line, item+'\n'+anchor_line, 1)
ch.write_text(text,encoding='utf-8')
PY

cd "$FRONT"
git add app-v0600.html app-v0601.html app.html changelog-v0601.js
if ! git diff --cached --quiet; then
  git config user.name "Royal CRM Release"
  git config user.email "royal-crm-sync@users.noreply.github.com"
  git commit -m "Fix v0.6.1 Specnaz card layout" >/dev/null
  git push origin HEAD:main
fi
ok "Frontend + changelog pushed"

printf '\n=== FORCE TELEGRAM MENU CACHE + SYNC LIVE APPS SCRIPT ===\n'
MENU_SCRIPT="$TMP_ROOT/menu-publish.sh"
curl -fsSL "$RAW/scripts/publish-v061-participant-identity.sh" -o "$MENU_SCRIPT"
python3 - "$MENU_SCRIPT" "$BUILD_MARKER" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]); marker=sys.argv[2]
s=p.read_text(encoding='utf-8')
s=s.replace('BUILD_MARKER="20260823-v061-identity2"', f'BUILD_MARKER="{marker}"')
s=s.replace('v061-participant-identity-', 'v061-specnaz-layout-')
s=s.replace('/tmp/royal-v061-identity.', '/tmp/royal-v061-specnaz-layout-menu.')
s=s.replace('__royal_v061_identity_once', '__royal_v061_specnaz_layout_once')
s=s.replace('TEMP_V061_IDENTITY_MENU', 'TEMP_V061_SPECNAZ_LAYOUT_MENU')
p.write_text(s,encoding='utf-8')
PY
bash "$MENU_SCRIPT"

printf '\n=== RECORD CURRENT_STATE + WORK_HISTORY ===\n'
DOCS="$TMP_ROOT/docs"
gh repo clone "$REPO" "$DOCS" -- --depth=1 >/dev/null
python3 - "$DOCS/CURRENT_STATE.md" "$DOCS/WORK_HISTORY.md" "$BUILD_MARKER" <<'PY'
from pathlib import Path
import sys
state_path=Path(sys.argv[1]); hist_path=Path(sys.argv[2]); marker=sys.argv[3]
tag='V061_SPECNAZ_LAYOUT_20260823'
state=state_path.read_text(encoding='utf-8')
if 'V061_PARTICIPANT_IDENTITY_20260823' in state and 'device smoke confirmed' not in state.lower():
    state += '\n\n- v0.6.1 participant identity consistency: device smoke подтверждён пользователем 23.08.2026 — отображение CRM-имени, @username и Telegram-имени принято.\n'
if tag not in state:
    state += f'''\n\n---\n\n## v0.6.1 Specnaz roomy cards — 23.08.2026 [{tag}]\n\n- Добавлен `specnaz-layout-v061.css`, исполняемый только через текущий v0.6.1 entrypoint.\n- `Герои спецназа`: карточки используют больше ширины panel; на мобильном имя/achievement strip/@username/Telegram name идут устойчивым вертикальным потоком, score переносится в отдельную grid-строку и карточка растёт по высоте.\n- `История спецназа`: список и строки расширены; identity + rank на узких экранах раскладываются в отдельные строки, scoreline умеет переноситься.\n- Ничего не должно обрезаться или накладываться; длинные строки используют wrap/overflow-wrap.\n- Legacy `specnaz.css` v0.5.59 не изменён.\n- Release/cache marker = `{marker}`; Telegram menu cache принудительно обновлён через существующий Apps Script deployment `Таблица ЧП 1.3`.\n- Device smoke hero/history layout остаётся acceptance check пользователя.\n'''
    state_path.write_text(state,encoding='utf-8')
hist=hist_path.read_text(encoding='utf-8')
if tag not in hist:
    hist += f'''\n\n---\n\n### 23.08.2026 — расширение карточек героев и истории спецназа [{tag}]\n\n**Запрос:** после добавления полной participant identity убрать наложение имени/звания/Telegram-данных; если контент не помещается, увеличивать карточку. То же применить к истории спецназа и сделать карточки шире.\n\n**Выполнено:**\n- создан v0.6.1-only `specnaz-layout-v061.css`;\n- hero/history lists выходят ближе к краям panel без изменения глобального shell;\n- hero card на телефонах переведён в grid: место + avatar остаются слева, identity получает полноценную ширину, achievement/rank идёт под именем, score — отдельной строкой;\n- history head на телефонах переведён в grid с отдельной строкой rank и переносимыми identity fields;\n- длинные имена, username, Telegram display name, team/message и scoreline не должны обрезаться/накладываться;\n- `app.html` / `app-v0601.html` / runtime CSS cache переведены на `{marker}`;\n- Telegram menu cache обновлён, live Apps Script mirror синхронизирован.\n'''
    hist_path.write_text(hist,encoding='utf-8')
PY
cd "$DOCS"
git add CURRENT_STATE.md WORK_HISTORY.md
if ! git diff --cached --quiet; then
  git config user.name "Royal CRM Handoff"
  git config user.email "royal-crm-sync@users.noreply.github.com"
  git commit -m "Record v0.6.1 Specnaz layout fix" >/dev/null
  git push origin HEAD:main
fi
ok "CURRENT_STATE.md + WORK_HISTORY.md updated"

printf '\n============================================================\n'
printf '✅✅✅ v0.6.1 SPECNAZ LAYOUT READY ✅✅✅\n'
printf 'Telegram menu cache-bust: %s\n' "$BUILD_MARKER"
printf 'Heroes: wider + no overlap\n'
printf 'History: wider + no overlap\n'
printf 'CURRENT_STATE.md + WORK_HISTORY.md updated\n'
printf '============================================================\n'
