#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${ROYAL_CRM_PROJECT_DIR:-$HOME/table-chp-1.3}"
REPO="Antonsoloway/Specnaz-mini-app"
RAW="https://raw.githubusercontent.com/${REPO}/main"
EXPECTED_DESC="Таблица ЧП 1.3"
MARKER="20260824-v061-visual-stability1"
CORE_FILE="01_CORE_MAIN.js"
BOT_MENU_FILE="22_MINIAPP_BOT_APP_MENU.js"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$HOME/royal-crm-backups/v061-visual-stability-$STAMP"
TMP_ROOT="$(mktemp -d /tmp/royal-v061-visual-stability.XXXXXX)"
TOKEN="$(python3 -c 'import secrets; print(secrets.token_urlsafe(36))')"
TEMP_PARAM="__royal_v061_visual_stability_menu_once"
MENU_OK=0

cleanup(){ rm -rf "$TMP_ROOT"; }
trap cleanup EXIT
ok(){ printf '\n✅ %s\n' "$*"; }
info(){ printf '\n=== %s ===\n' "$*"; }
fail(){ printf '\n❌ %s\n' "$*" >&2; exit 1; }

for cmd in clasp python3 node gh git curl; do
  command -v "$cmd" >/dev/null 2>&1 || fail "$cmd не найден"
done
gh auth status >/dev/null 2>&1 || fail "GitHub CLI не авторизован"
[[ -d "$PROJECT_DIR" ]] || fail "Apps Script каталог не найден: $PROJECT_DIR"
[[ -f "$PROJECT_DIR/.clasp.json" ]] || fail ".clasp.json не найден"

info "PATCH + PUBLISH v0.6.1 FRONTEND"
FRONT="$TMP_ROOT/frontend"
gh repo clone "$REPO" "$FRONT" -- --depth=1 >/dev/null
python3 - "$FRONT" "$MARKER" <<'PY'
from pathlib import Path
import re,sys
root=Path(sys.argv[1]); marker=sys.argv[2]
required=['v061-rank-interval-guard.js','v061-visual-stability.js','rank-visual-stability-v061.css']
for name in required:
    if not (root/name).is_file(): raise SystemExit(f'[ERROR] missing {name}')

app=root/'app-v0600.html'
s=app.read_text(encoding='utf-8')
css=f'<link rel="stylesheet" href="rank-visual-stability-v061.css?v={marker}" />'
if 'rank-visual-stability-v061.css' in s:
    s=re.sub(r'<link rel="stylesheet" href="rank-visual-stability-v061\.css\?v=[^"]+"\s*/>',css,s,count=1)
else:
    anchor='<link rel="stylesheet" href="startup-v0600.css?v=20260822-rc1" />'
    if anchor not in s: raise SystemExit('[ERROR] startup css anchor missing')
    s=s.replace(anchor,anchor+'\n  '+css,1)

guard=f'<script src="v061-rank-interval-guard.js?v={marker}"></script>'
rank=f'<script src="rank-system-v0524.js?v={marker}"></script>'
post=f'<script src="v061-visual-stability.js?v={marker}"></script>'
if 'v061-rank-interval-guard.js' not in s:
    pat=r'<script src="rank-system-v0524\.js\?v=[^"]+"></script>'
    replacement=guard+'\n  '+rank+'\n  '+post
    s,n=re.subn(pat,replacement,s,count=1)
    if n!=1: raise SystemExit('[ERROR] rank-system script anchor missing')
else:
    s=re.sub(r'<script src="v061-rank-interval-guard\.js\?v=[^"]+"></script>',guard,s,count=1)
    s=re.sub(r'<script src="rank-system-v0524\.js\?v=[^"]+"></script>',rank,s,count=1)
    if 'v061-visual-stability.js' in s:
        s=re.sub(r'<script src="v061-visual-stability\.js\?v=[^"]+"></script>',post,s,count=1)
    else:
        s=s.replace(rank,rank+'\n  '+post,1)

s=re.sub(r'changelog-v0601\.js\?v=[^"\s]+',f'changelog-v0601.js?v={marker}',s,count=1)
app.write_text(s,encoding='utf-8')

for name in ('app-v0601.html','app.html'):
    p=root/name
    text=p.read_text(encoding='utf-8')
    text,n=re.subn(r"params\.set\('releaseBuild',\s*'[^']+'\);",f"params.set('releaseBuild', '{marker}');",text,count=1)
    if n!=1: raise SystemExit(f'[ERROR] releaseBuild anchor missing in {name}')
    p.write_text(text,encoding='utf-8')

ch=root/'changelog-v0601.js'
text=ch.read_text(encoding='utf-8')
anchor="        'Последующие исправления, которые входят в v0.6.1, будут дописываться в эту карточку истории изменений.'"
items=[
"        'Убрано периодическое дёргание интерфейса на Android Telegram WebView: v0.6.1 больше не запускает глобальный 1,6-секундный layout-polling всех значков звания; видимость анимации отслеживается через IntersectionObserver без постоянных getBoundingClientRect по длинным спискам.',",
"        'Переливание компактных значков звания теперь рисуется только внутри границ самой плашки: световой блик двигается фоном внутри фиксированной маски, а герб и декоративные крылья снаружи остаются видимыми и не обрезаются.',"
]
for item in items:
    needle=item.strip(" ,'\n")
    if needle not in text:
        if anchor not in text: raise SystemExit('[ERROR] changelog anchor missing')
        text=text.replace(anchor,item+'\n'+anchor,1)
ch.write_text(text,encoding='utf-8')
PY

cd "$FRONT"
git add app-v0600.html app-v0601.html app.html changelog-v0601.js
git diff --check
if ! git diff --cached --quiet; then
  git config user.name "Royal CRM Release"
  git config user.email "royal-crm-sync@users.noreply.github.com"
  git commit -m "Fix v0.6.1 periodic visual flicker" >/dev/null
  git push origin HEAD:main
fi
ok "Frontend marker $MARKER pushed"

info "PULL FACTUAL LIVE APPS SCRIPT + BACKUP"
mkdir -p "$BACKUP_DIR"
cd "$PROJECT_DIR"
clasp status
clasp pull
[[ -f "$CORE_FILE" && -f "$BOT_MENU_FILE" ]] || fail "live Apps Script неполный"
cp -p "$CORE_FILE" "$BACKUP_DIR/$CORE_FILE"
cp -p "$BOT_MENU_FILE" "$BACKUP_DIR/$BOT_MENU_FILE"
ok "Backup: $BACKUP_DIR"

info "UPDATE TELEGRAM MENU SOURCE"
python3 - "$BOT_MENU_FILE" "$MARKER" <<'PY'
from pathlib import Path
import re,sys
p=Path(sys.argv[1]); marker=sys.argv[2]
s=p.read_text(encoding='utf-8')
s,n=re.subn(r"var MINIAPP_BOT_APP_MENU_VERSION = '[^']+';","var MINIAPP_BOT_APP_MENU_VERSION = '1.0.40';",s,count=1)
if n!=1: raise SystemExit('[ERROR] menu version anchor missing')
s,n=re.subn(r"var appUrl=MINIAPP_BOT_APP_URL\+'\?cb=[^']+';",f"var appUrl=MINIAPP_BOT_APP_URL+'?cb={marker}';",s,count=1)
if n!=1: raise SystemExit('[ERROR] menu cb anchor missing')
p.write_text(s,encoding='utf-8')
PY
node --check "$BOT_MENU_FILE"
grep -Fq "?cb=$MARKER" "$BOT_MENU_FILE" || fail "new menu marker missing"

info "SELECT EXISTING DEPLOYMENT ONLY"
DEPLOY_OUTPUT=""
if DEPLOY_OUTPUT="$(clasp list-deployments 2>&1)"; then :
elif DEPLOY_OUTPUT="$(clasp deployments 2>&1)"; then :
else fail "Не удалось получить deployments"; fi
mapfile -t MATCHES < <(printf '%s\n' "$DEPLOY_OUTPUT" | grep -F "$EXPECTED_DESC" || true)
[[ ${#MATCHES[@]} -eq 1 ]] || fail "Найдено ${#MATCHES[@]} deployment '$EXPECTED_DESC'; ожидался 1"
LINE="${MATCHES[0]}"
printf '%s\n' "$LINE" | grep -q '@HEAD' && fail "Стабильный deployment неожиданно @HEAD"
DEPLOY_ID="$(printf '%s\n' "$LINE" | sed -E 's/^[[:space:]]*-[[:space:]]+([^[:space:]]+).*/\1/')"
[[ "$DEPLOY_ID" =~ ^[A-Za-z0-9_-]{20,}$ ]] || fail "deployment ID не распознан"
WEBAPP_URL="https://script.google.com/macros/s/${DEPLOY_ID}/exec"

info "INSERT TEMPORARY TOKENIZED MENU INVOKER"
python3 - "$CORE_FILE" "$TEMP_PARAM" "$TOKEN" <<'PY'
import json,sys
from pathlib import Path
p=Path(sys.argv[1]); param=sys.argv[2]; token=sys.argv[3]
s=p.read_text(encoding='utf-8')
anchor='function doGet(e) {\n'
if s.count(anchor)!=1: raise SystemExit('[ERROR] doGet anchor missing/ambiguous')
block=(
 'function doGet(e) {\n'
 '  // TEMP_V061_VISUAL_STABILITY_MENU: removed immediately after verification.\n'
 f'  if (e && e.parameter && String(e.parameter[{json.dumps(param)}] || "") === {json.dumps(token)}) {{\n'
 '    var menuResult = MINIAPP_setupBotAppMenu();\n'
 '    return ContentService.createTextOutput(JSON.stringify(menuResult)).setMimeType(ContentService.MimeType.JSON);\n'
 '  }\n\n'
)
p.write_text(s.replace(anchor,block,1),encoding='utf-8')
PY
node --check "$CORE_FILE"

info "PUSH + UPDATE EXISTING DEPLOYMENT"
if clasp push -f; then :; elif clasp push; then :; else fail "clasp push failed"; fi
if clasp update-deployment "$DEPLOY_ID" --description "$EXPECTED_DESC"; then :
elif clasp create-deployment --deploymentId "$DEPLOY_ID" --description "$EXPECTED_DESC"; then :
elif clasp deploy -i "$DEPLOY_ID" -d "$EXPECTED_DESC"; then :
else fail "existing deployment update failed"; fi

info "WAIT + APPLY/VERIFY TELEGRAM MENU"
sleep 20
for attempt in $(seq 1 30); do
  printf '[INFO] menu verification %02d/30\n' "$attempt"
  BODY="$(curl -sS -L --max-time 40 --get --data-urlencode "$TEMP_PARAM=$TOKEN" "$WEBAPP_URL" || true)"
  if python3 -c '
import json,sys
marker=sys.argv[1]
try: d=json.load(sys.stdin)
except Exception: raise SystemExit(1)
app=str(d.get("appUrl") or "")
menu=str((((d.get("menuButton") or {}).get("web_app") or {}).get("url")) or "")
raise SystemExit(0 if d.get("ok") is True and marker in app and marker in menu else 1)
' "$MARKER" <<<"$BODY"; then
    MENU_OK=1
    ok "Telegram menu confirmed: $MARKER"
    break
  fi
  sleep 5
done

info "REMOVE TEMP ROUTE"
cp -p "$BACKUP_DIR/$CORE_FILE" "$CORE_FILE"
node --check "$CORE_FILE"
if clasp push -f; then :; elif clasp push; then :; else fail "temporary route removal push failed"; fi
if clasp update-deployment "$DEPLOY_ID" --description "$EXPECTED_DESC"; then :
elif clasp create-deployment --deploymentId "$DEPLOY_ID" --description "$EXPECTED_DESC"; then :
elif clasp deploy -i "$DEPLOY_ID" -d "$EXPECTED_DESC"; then :
else fail "deployment update after cleanup failed"; fi
ok "Temporary route removed; existing deployment preserved"

info "SYNC LIVE APPS SCRIPT MIRROR"
bash <(curl -fsSL "$RAW/scripts/sync-live-apps-script-to-github.sh")
[[ "$MENU_OK" == "1" ]] || fail "Telegram menu не успел подтвердить $MARKER; cleanup уже выполнен"

info "UPDATE CURRENT_STATE + WORK_HISTORY"
DOCS="$TMP_ROOT/docs"
gh repo clone "$REPO" "$DOCS" -- --depth=1 >/dev/null
python3 - "$DOCS/CURRENT_STATE.md" "$DOCS/WORK_HISTORY.md" "$MARKER" <<'PY'
from pathlib import Path
import re,sys
state_path=Path(sys.argv[1]); hist_path=Path(sys.argv[2]); marker=sys.argv[3]
tag='V061_VISUAL_STABILITY_20260824'
state=state_path.read_text(encoding='utf-8')
# Keep the summary section factual for the next chat.
state=re.sub(r'(releaseBuild=)[^`;\s]+',lambda m:m.group(1)+marker,state,count=1)
state=re.sub(r'(- `app\.html` → `app-v0601\.html`, cache marker \*\*)`[^`]+`(\*\*;)',lambda m:m.group(1)+'`'+marker+'`'+m.group(2),state,count=1)
if tag not in state:
    state += f'''\n\n---\n\n## v0.6.1 Android visual stability — 24.08.2026 [{tag}]\n\n- Предыдущее выравнивание achievement stack `Админ → звание → МАЯК` подтверждено пользователем на устройстве.\n- По присланной записи зафиксированы два одно-кадровых визуальных провала примерно в 10.87s и 31.49s; интервал около 20.6s. Это не keyframe видео: в момент сбоя WebView кратко показывает placeholder/перекомпоновку изображения и сразу возвращает исходный кадр.\n- Найден постоянный legacy rank visibility polling: `rank-system-v0524.js` каждые 1.6s делал `getBoundingClientRect()` для всех `.rank-badge--compact`, плюс такой же scan на scroll/resize. Для v0.6.1 он теперь перехватывается только на время загрузки legacy rank module и не запускается.\n- `v061-visual-stability.js` переключает `rank-is-visible` через `IntersectionObserver`; новые динамические карточки подхватываются `MutationObserver` без периодического layout scan. Legacy v0.5.59 исходники не изменены.\n- `rank-visual-stability-v061.css`: переливание больше не перемещает широкий pseudo-element за пределы rank badge; блик анимирует background-position внутри clip-mask самой плашки. Crest/wings не обрезаются.\n- Frontend/menu marker = `{marker}`; Telegram menu подтверждён. Существующий deployment `Таблица ЧП 1.3` сохранён, temporary invoker удалён, live Apps Script mirror синхронизирован.\n- Device acceptance: оставить приложение открытым минимум 45–60 секунд на нескольких страницах и проверить отсутствие периодического twitch; отдельно проверить, что shimmer остаётся внутри плашки звания.\n'''
    state_path.write_text(state,encoding='utf-8')
hist=hist_path.read_text(encoding='utf-8')
if tag not in hist:
    hist += f'''\n\n---\n\n### 24.08.2026 — устранение периодического twitch и overflow переливания звания [{tag}]\n\n**Симптом:** на видео интерфейс кратко дёргается по всему Mini App; два эпизода разделены примерно 20.6 сек. Световое переливание rank badge визуально выходит далеко за границы плашки.\n\n**Выполнено:**\n- не меняя rollback v0.5.59, добавлен v0.6.1 boot-guard, который не даёт legacy rank module зарегистрировать 1.6-секундный global geometry poll и его scroll/resize geometry listeners;\n- вместо него установлен `IntersectionObserver`, который активирует анимацию только у реально видимых rank badges и не заставляет длинные списки периодически пересчитывать layout;\n- shimmer переписан с `translateX()` широкого pseudo-element на background-position внутри фиксированной rounded clip-mask; декоративные элементы звания снаружи плашки сохранены;\n- `app.html` / `app-v0601.html` / общий runtime / changelog переведены на `{marker}`;\n- Telegram menu cache-bust применён через существующий `Таблица ЧП 1.3`, temporary route удалён, live Apps Script mirror синхронизирован.\n'''
    hist_path.write_text(hist,encoding='utf-8')
PY
cd "$DOCS"
git add CURRENT_STATE.md WORK_HISTORY.md
if ! git diff --cached --quiet; then
  git config user.name "Royal CRM Handoff"
  git config user.email "royal-crm-sync@users.noreply.github.com"
  git commit -m "Record v0.6.1 visual stability fix" >/dev/null
  git push origin HEAD:main
fi
ok "CURRENT_STATE.md + WORK_HISTORY.md updated"

printf '\n============================================================\n'
printf '✅✅✅ v0.6.1 VISUAL STABILITY PUBLISHED ✅✅✅\n'
printf 'Telegram menu cache-bust: %s\n' "$MARKER"
printf 'Periodic rank geometry poll: DISABLED in v0.6.1\n'
printf 'Rank shimmer: CLIPPED INSIDE BADGE\n'
printf 'Existing deployment preserved: %s\n' "$EXPECTED_DESC"
printf 'CURRENT_STATE.md + WORK_HISTORY.md updated\n'
printf '============================================================\n'
