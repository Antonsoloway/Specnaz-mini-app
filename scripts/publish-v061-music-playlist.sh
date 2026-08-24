#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${ROYAL_CRM_PROJECT_DIR:-$HOME/table-chp-1.3}"
REPO="Antonsoloway/Specnaz-mini-app"
DATA_REPO="Antonsoloway/royal-crm-data"
RAW="https://raw.githubusercontent.com/${REPO}/main"
EXPECTED_DESC="Таблица ЧП 1.3"
MARKER="20260824-v061-music-playlist1"
CORE_FILE="01_CORE_MAIN.js"
BOT_MENU_FILE="22_MINIAPP_BOT_APP_MENU.js"
SETUP_FILE="35_MINIAPP_V061_MUSIC_PLAYLIST_SETUP.js"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$HOME/royal-crm-backups/v061-music-playlist-$STAMP"
TMP_ROOT="$(mktemp -d /tmp/royal-v061-music-playlist.XXXXXX)"
TOKEN="$(python3 -c 'import secrets; print(secrets.token_urlsafe(36))')"
TEMP_PARAM="__royal_v061_music_playlist_once"

cleanup(){ rm -rf "$TMP_ROOT"; }
trap cleanup EXIT
ok(){ printf '\n✅ %s\n' "$*"; }
info(){ printf '\n=== %s ===\n' "$*"; }
fail(){ printf '\n❌ %s\n' "$*" >&2; exit 1; }

for cmd in clasp python3 node gh git curl; do
  command -v "$cmd" >/dev/null 2>&1 || fail "$cmd не найден"
done
gh auth status >/dev/null 2>&1 || fail "GitHub CLI не авторизован"
[[ -d "$PROJECT_DIR" && -f "$PROJECT_DIR/.clasp.json" ]] || fail "Apps Script каталог не найден: $PROJECT_DIR"

info "VERIFY FRONTEND + WORKER"
FRONT="$TMP_ROOT/frontend"
gh repo clone "$REPO" "$FRONT" -- --depth=1 >/dev/null
cd "$FRONT"
node --check music-playlist-v061.js
node --check version-v0600.js
node --check worker/src/entry-v1390.js
grep -Fq "music-playlist-v061.js?v=$MARKER" app-v0600.html || fail "playlist script marker missing"
grep -Fq "releaseBuild', '$MARKER'" app.html || fail "app marker missing"
grep -Fq 'main = "src/entry-v1390.js"' worker/wrangler.toml || fail "Worker 1.39 not selected"
ok "Frontend/Worker playlist build ready"

info "PULL FACTUAL LIVE APPS SCRIPT + BACKUP"
mkdir -p "$BACKUP_DIR"
cd "$PROJECT_DIR"
clasp status
clasp pull
[[ -f "$CORE_FILE" && -f "$BOT_MENU_FILE" ]] || fail "live Apps Script неполный"
cp -p "$CORE_FILE" "$BACKUP_DIR/$CORE_FILE"
cp -p "$BOT_MENU_FILE" "$BACKUP_DIR/$BOT_MENU_FILE"
[[ ! -e "$SETUP_FILE" ]] || cp -p "$SETUP_FILE" "$BACKUP_DIR/$SETUP_FILE"
ok "Backup: $BACKUP_DIR"

info "PREPARE PRIVATE MUSIC SYNC"
cat > "$SETUP_FILE" <<'JS'
/* TEMP v0.6.1 music playlist sync. Removed after successful private upload. */
var MINIAPP_V061_MUSIC_PLAYLIST_FILES = [
  { driveId:'1kKlAxl17pSkY6EbAdbBnJ42Nu6oPpZNf', path:'media/app/v0600/music/track-02.mp3' },
  { driveId:'160dXoKeDTe74y5HlkEhaAfBcqr2cp_9X', path:'media/app/v0600/music/track-03.mp3' },
  { driveId:'1hfl5UBVWBJ8ld_TYYLe6RgXOzdcI4oo9', path:'media/app/v0600/music/track-04.mp3' },
  { driveId:'1X0fsQjyHwvVpbT42O7QKRbz-afj3jhQe', path:'media/app/v0600/music/track-05.mp3' },
  { driveId:'1-iiR4U5_PcMCZhba1QLtEn9EY0Xb9TQb', path:'media/app/v0600/music/track-06.mp3' }
];

function MINIAPP_v061SyncMusicPlaylist_() {
  if (typeof MINIAPP_mediaConfig_ !== 'function') throw new Error('media config helper missing');
  var cfg = MINIAPP_mediaConfig_(PropertiesService.getScriptProperties());
  var output = [];
  MINIAPP_V061_MUSIC_PLAYLIST_FILES.forEach(function(item, index) {
    var file = DriveApp.getFileById(item.driveId);
    var blob = file.getBlob().setName('track-' + ('0' + (index + 2)).slice(-2) + '.mp3');
    var bytes = blob.getBytes();
    if (!bytes || !bytes.length) throw new Error('empty music file ' + (index + 2));
    if (String(blob.getContentType() || '').toLowerCase().indexOf('audio') !== 0) {
      blob.setContentType('audio/mpeg');
    }
    if (typeof MINIAPP_teamGithubUpsert_ === 'function') {
      MINIAPP_teamGithubUpsert_(cfg, item.path, blob, 'v0.6.1 private music track ' + (index + 2));
    } else if (typeof MINIAPP_mediaGithubCreate_ === 'function') {
      MINIAPP_mediaGithubCreate_(cfg, item.path, blob, 'v0.6.1 private music track ' + (index + 2));
    } else {
      throw new Error('private media GitHub helper missing');
    }
    output.push({ path:item.path, bytes:bytes.length });
  });
  return { ok:true, tracks:output };
}
JS
node --check "$SETUP_FILE"

info "UPDATE TELEGRAM MENU SOURCE"
python3 - "$BOT_MENU_FILE" "$MARKER" <<'PY'
from pathlib import Path
import re,sys
p=Path(sys.argv[1]); marker=sys.argv[2]
s=p.read_text(encoding='utf-8')
m=re.search(r"var MINIAPP_BOT_APP_MENU_VERSION = '(\d+)\.(\d+)\.(\d+)';",s)
if not m: raise SystemExit('[ERROR] menu version anchor missing')
version=f"{m.group(1)}.{m.group(2)}.{int(m.group(3))+1}"
s=s[:m.start()]+f"var MINIAPP_BOT_APP_MENU_VERSION = '{version}';"+s[m.end():]
s,n=re.subn(r"var appUrl=MINIAPP_BOT_APP_URL\+'\?cb=[^']+';",f"var appUrl=MINIAPP_BOT_APP_URL+'?cb={marker}';",s,count=1)
if n!=1: raise SystemExit('[ERROR] menu cb anchor missing')
p.write_text(s,encoding='utf-8')
PY
node --check "$BOT_MENU_FILE"

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

info "INSERT ONE-TIME PRIVATE SYNC ROUTE"
python3 - "$CORE_FILE" "$TEMP_PARAM" "$TOKEN" <<'PY'
import json,sys
from pathlib import Path
p=Path(sys.argv[1]); param=sys.argv[2]; token=sys.argv[3]
s=p.read_text(encoding='utf-8')
anchor='function doGet(e) {\n'
if s.count(anchor)!=1: raise SystemExit('[ERROR] doGet anchor missing/ambiguous')
block=(
 'function doGet(e) {\n'
 '  // TEMP_V061_MUSIC_PLAYLIST_SYNC: removed immediately after verification.\n'
 f'  if (e && e.parameter && String(e.parameter[{json.dumps(param)}] || "") === {json.dumps(token)}) {{\n'
 '    var mediaResult = MINIAPP_v061SyncMusicPlaylist_();\n'
 '    var menuResult = MINIAPP_setupBotAppMenu();\n'
 '    return ContentService.createTextOutput(JSON.stringify({ok:true, media:mediaResult, menu:menuResult})).setMimeType(ContentService.MimeType.JSON);\n'
 '  }\n\n'
)
p.write_text(s.replace(anchor,block,1),encoding='utf-8')
PY
node --check "$CORE_FILE"

update_deployment(){
  if clasp update-deployment "$DEPLOY_ID" --description "$EXPECTED_DESC"; then return 0; fi
  if clasp create-deployment --deploymentId "$DEPLOY_ID" --description "$EXPECTED_DESC"; then return 0; fi
  clasp deploy -i "$DEPLOY_ID" -d "$EXPECTED_DESC"
}

info "PUSH TEMP SYNC + UPDATE EXISTING DEPLOYMENT"
if clasp push -f; then :; elif clasp push; then :; else fail "clasp push failed"; fi
update_deployment || fail "existing deployment update failed"
sleep 15

info "COPY 5 PROCESSED TRACKS TO PRIVATE REPOSITORY"
BODY="$(curl -sS -L --max-time 330 --get --data-urlencode "$TEMP_PARAM=$TOKEN" "$WEBAPP_URL")"
BODY_FILE="$TMP_ROOT/music-sync-result.json"
printf '%s' "$BODY" > "$BODY_FILE"
python3 - "$MARKER" "$BODY_FILE" <<'PY'
import json,sys
try: d=json.load(open(sys.argv[2],encoding='utf-8'))
except Exception: raise SystemExit('[ERROR] Apps Script sync returned invalid JSON')
tracks=((d.get('media') or {}).get('tracks') or [])
menu=((d.get('menu') or {}).get('appUrl') or '')
if d.get('ok') is not True or (d.get('media') or {}).get('ok') is not True or len(tracks)!=5:
    raise SystemExit('[ERROR] private music sync did not confirm five tracks')
if sys.argv[1] not in str(menu):
    raise SystemExit('[ERROR] Telegram menu marker not confirmed')
print('SYNCED_TRACKS=5')
PY

info "VERIFY PRIVATE FILES"
for n in 02 03 04 05 06; do
  path="media/app/v0600/music/track-$n.mp3"
  size="$(gh api "repos/$DATA_REPO/contents/$path" --jq '.size')"
  [[ "$size" =~ ^[0-9]+$ && "$size" -gt 100000 ]] || fail "private $path invalid"
  printf '[OK] %s (%s bytes)\n' "$path" "$size"
done

info "REMOVE TEMP ROUTE + DRIVE-ID SETUP FROM LIVE APPS SCRIPT"
cp -p "$BACKUP_DIR/$CORE_FILE" "$CORE_FILE"
rm -f "$SETUP_FILE"
node --check "$CORE_FILE"
if clasp push -f; then :; elif clasp push; then :; else fail "cleanup push failed"; fi
update_deployment || fail "deployment cleanup update failed"
ok "Temporary sync route removed; existing deployment preserved"

info "SYNC LIVE APPS SCRIPT MIRROR"
bash <(curl -fsSL "$RAW/scripts/sync-live-apps-script-to-github.sh")

info "WAIT FOR WORKER 1.39"
for attempt in $(seq 1 24); do
  VERSION="$(curl -fsSL --max-time 15 'https://royal-crm-miniapp-api.tropical-spoon.workers.dev/health' | python3 -c 'import json,sys; print(json.load(sys.stdin).get("version", ""))' 2>/dev/null || true)"
  [[ "$VERSION" == "1.39.0" ]] && { ok "Worker 1.39.0 confirmed"; break; }
  [[ "$attempt" == "24" ]] && fail "Worker 1.39.0 не подтвердился вовремя"
  sleep 5
done

ok "v0.6.1 music playlist published: 6 random private tracks"
