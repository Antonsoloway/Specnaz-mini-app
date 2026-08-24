#!/usr/bin/env bash
set -Eeuo pipefail

REPO="Antonsoloway/Specnaz-mini-app"
MARKER="20260824-v061-admin-ui-controls1"
TAG="V061_ADMIN_UI_CONTROLS_20260824"
TMP_ROOT="$(mktemp -d /tmp/royal-v061-admin-ui-handoff.XXXXXX)"
cleanup(){ rm -rf "$TMP_ROOT"; }
trap cleanup EXIT
ok(){ printf '\n✅ %s\n' "$*"; }
fail(){ printf '\n❌ %s\n' "$*" >&2; exit 1; }

for cmd in gh git python3 node; do
  command -v "$cmd" >/dev/null 2>&1 || fail "$cmd не найден"
done
gh auth status >/dev/null 2>&1 || fail "GitHub CLI не авторизован"

DIR="$TMP_ROOT/repo"
gh repo clone "$REPO" "$DIR" -- --depth=1 >/dev/null
cd "$DIR"

grep -Fq "$MARKER" app.html || fail "app.html ещё не на $MARKER"
grep -Fq "$MARKER" app-v0601.html || fail "app-v0601.html ещё не на $MARKER"
grep -Fq "admin-ui-controls-v061.js?v=$MARKER" app-v0600.html || fail "admin-ui-controls module не подключён"
node --check admin-ui-controls-v061.js
node --check changelog-v0601.js

python3 - "$MARKER" "$TAG" <<'PY'
from pathlib import Path
import sys
marker,tag=sys.argv[1:3]

# Changelog: every inserted JS array item MUST end with a comma because the
# permanent anchor remains the final array item.
p=Path('changelog-v0601.js')
s=p.read_text(encoding='utf-8')
anchor="        'Последующие исправления, которые входят в v0.6.1, будут дописываться в эту карточку истории изменений.'"
items=[
    "        'В админском списке команды снова окрашиваются по игре так же, как в обычном режиме: Royal Kingdom — красные карточки, Royal Match — синие.',",
    "        'Кнопка «Режим редактирования» убрана. На её месте постоянно доступны «Добавить команду» и «Добавить участника», а редактирование существующей карточки открывается непосредственно из самой карточки.',",
    "        'Поиск в админ-режиме получил поведение клавиатуры как в обычном режиме: при касании или прокрутке вне поля поиска фокус снимается и клавиатура закрывается.',",
]
if anchor not in s:
    raise SystemExit('[ERROR] changelog anchor missing')
missing=[item for item in items if item not in s]
if missing:
    s=s.replace(anchor,'\n'.join(missing)+'\n'+anchor,1)
p.write_text(s,encoding='utf-8')

state=Path('CURRENT_STATE.md')
text=state.read_text(encoding='utf-8')
if tag not in text:
    text += f'''\n\n---\n\n## v0.6.1 admin UI controls — 24.08.2026 [{tag}]\n\n- Admin team list mirrors ordinary game colors: Royal Kingdom = red cards, Royal Match = blue cards.\n- Separate global «Режим редактирования» control is removed. The admin header exposes permanent «Добавить команду» and «Добавить участника» actions; existing records keep their direct edit entry points.\n- Admin search now dismisses the mobile keyboard when pointer focus/scroll gesture leaves the active search field; Enter/Escape also release the field.\n- Frontend + Telegram menu marker = `{marker}`. Existing Apps Script deployment `Таблица ЧП 1.3` was preserved and the live Apps Script mirror was synchronized before this handoff finalization.\n- The first handoff attempt stopped only at changelog syntax validation because the third inserted JS array item lacked a trailing comma; production/frontend/menu work had already completed. This finalizer repairs only changelog/handoff state and does not redeploy Apps Script.\n'''
    state.write_text(text,encoding='utf-8')

hist=Path('WORK_HISTORY.md')
text=hist.read_text(encoding='utf-8')
if tag not in text:
    text += f'''\n\n---\n\n### 24.08.2026 — admin team colors / direct create / keyboard [{tag}]\n\n- Device request: color admin team cards by game (RK red / RM blue), remove global edit-mode button in favor of direct create actions, and make admin search keyboard dismissal match ordinary mode.\n- Added `admin-ui-controls-v061.js` and published marker `{marker}`. Telegram menu update and existing Apps Script deployment update completed; live mirror sync completed.\n- Initial release script then failed during `node --check changelog-v0601.js`: its generated third changelog item missed the comma before the permanent final history item. No production rollback was needed.\n- Added safe handoff finalizer; changelog is syntax-checked before commit and CURRENT_STATE / WORK_HISTORY / RELEASE_RULES are completed without touching production deployment.\n'''
    hist.write_text(text,encoding='utf-8')

rules=Path('RELEASE_RULES.md')
text=rules.read_text(encoding='utf-8')
rules_to_add=[
    '- Admin team list must preserve the same game color language as ordinary mode: Royal Kingdom cards are red and Royal Match cards are blue.',
    '- Admin search must release the mobile keyboard when focus/gesture moves away from its search field, matching ordinary-mode keyboard behavior.',
    '- Admin create actions are direct: do not reintroduce a separate global «Режим редактирования» switch; keep direct Add team / Add participant actions and per-record edit entry points.',
]
for rule in rules_to_add:
    if rule not in text:
        text += '\n'+rule+'\n'
rules.write_text(text,encoding='utf-8')
PY

node --check changelog-v0601.js
git add changelog-v0601.js CURRENT_STATE.md WORK_HISTORY.md RELEASE_RULES.md
git diff --check

git config user.name "Royal CRM Handoff"
git config user.email "royal-crm-sync@users.noreply.github.com"
if ! git diff --cached --quiet; then
  git commit -m "Finalize v0.6.1 admin UI controls handoff" >/dev/null
  git push origin HEAD:main
fi

ok "v0.6.1 admin UI controls handoff finalized; production deployment was not touched"
printf 'Marker: %s\n' "$MARKER"
