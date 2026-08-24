#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${ROYAL_CRM_PROJECT_DIR:-$HOME/table-chp-1.3}"
REPO="Antonsoloway/Specnaz-mini-app"
DATA_REPO="Antonsoloway/royal-crm-data"
RAW="https://raw.githubusercontent.com/${REPO}/main"
EXPECTED_DESC="Таблица ЧП 1.3"
CORE_FILE="01_CORE_MAIN.js"
SETUP_FILE="35_MINIAPP_V061_REPLACE_TRACK06.js"
DRIVE_ID="1-iiR4U5_PcMCZhba1QLtEn9EY0Xb9TQb"
TARGET_PATH="media/app/v0600/music/track-06.mp3"
EXPECTED_BYTES="3229151"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$HOME/royal-crm-backups/v061-track06-replace-$STAMP"
TMP_ROOT="$(mktemp -d /tmp/royal-v061-track06-replace.XXXXXX)"
TOKEN="$(python3 -c 'import secrets; print(secrets.token_urlsafe(36))')"
TEMP_PARAM="__royal_v061_track06_replace_once"

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

info "PULL FACTUAL LIVE APPS SCRIPT + BACKUP"
mkdir -p "$BACKUP_DIR"
cd "$PROJECT_DIR"
clasp status
clasp pull
[[ -f "$CORE_FILE" ]] || fail "live Apps Script неполный"
cp -p "$CORE_FILE" "$BACKUP_DIR/$CORE_FILE"
[[ ! -e "$SETUP_FILE" ]] || cp -p "$SETUP_FILE" "$BACKUP_DIR/$SETUP_FILE"
ok "Backup: $BACKUP_DIR"

info "PREPARE ONE-TRACK PRIVATE REPLACEMENT"
cat > "$SETUP_FILE" <<JS
/* TEMP: replace v0.6.1 track-06 with processed original MP3. Removed after sync. */
function MINIAPP_v061ReplaceTrack06_() {
  if (typeof MINIAPP_mediaConfig_ !== 'function') throw new Error('media config helper missing');
  var cfg = MINIAPP_mediaConfig_(PropertiesService.getScriptProperties());
  var file = DriveApp.getFileById('$DRIVE_ID');
  var blob = file.getBlob().setName('track-06.mp3').setContentType('audio/mpeg');
  var bytes = blob.getBytes();
  if (!bytes || !bytes.length) throw new Error('track-06 is empty');
  if (bytes.length !== $EXPECTED_BYTES) throw new Error('unexpected processed track-06 size: ' + bytes.length);
  if (typeof MINIAPP_teamGithubUpsert_ === 'function') {
    MINIAPP_teamGithubUpsert_(cfg, '$TARGET_PATH', blob, 'replace v0.6.1 Calloused Strings with original MP3');
  } else if (typeof MINIAPP_mediaGithubCreate_ === 'function') {
    MINIAPP_mediaGithubCreate_(cfg, '$TARGET_PATH', blob, 'replace v0.6.1 Calloused Strings with original MP3');
  } else {
    throw new Error('private media GitHub helper missing');
  }
  return { ok:true, path:'$TARGET_PATH', bytes:bytes.length };
}
JS
node --check "$SETUP_FILE"

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

info "INSERT TEMPORARY TOKENIZED REPLACEMENT ROUTE"
python3 - "$CORE_FILE" "$TEMP_PARAM" "$TOKEN" <<'PY'
import json,sys
from pathlib import Path
p=Path(sys.argv[1]); param=sys.argv[2]; token=sys.argv[3]
s=p.read_text(encoding='utf-8')
anchor='function doGet(e) {\n'
if s.count(anchor)!=1: raise SystemExit('[ERROR] doGet anchor missing/ambiguous')
block=(
 'function doGet(e) {\n'
 '  // TEMP_V061_TRACK06_REPLACE: removed immediately after verification.\n'
 f'  if (e && e.parameter && String(e.parameter[{json.dumps(param)}] || "") === {json.dumps(token)}) {{\n'
 '    var result = MINIAPP_v061ReplaceTrack06_();\n'
 '    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);\n'
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

info "PUSH TEMP ROUTE + UPDATE EXISTING DEPLOYMENT"
if clasp push -f; then :; elif clasp push; then :; else fail "clasp push failed"; fi
update_deployment || fail "existing deployment update failed"
sleep 15

info "REPLACE PRIVATE TRACK-06"
BODY="$(curl -sS -L --max-time 180 --get --data-urlencode "$TEMP_PARAM=$TOKEN" "$WEBAPP_URL")"
python3 - "$EXPECTED_BYTES" <<'PY' <<<"$BODY"
import json,sys
d=json.load(sys.stdin)
expected=int(sys.argv[1])
if d.get('ok') is not True or int(d.get('bytes') or 0) != expected:
    raise SystemExit('[ERROR] track-06 replacement not confirmed')
print('TRACK06_REPLACED=1')
PY

info "VERIFY PRIVATE TRACK"
SIZE="$(gh api "repos/$DATA_REPO/contents/$TARGET_PATH" --jq '.size')"
[[ "$SIZE" == "$EXPECTED_BYTES" ]] || fail "private track-06 size mismatch: $SIZE"
ok "Private track-06 replaced ($SIZE bytes)"

info "REMOVE TEMP ROUTE + SETUP FILE"
cp -p "$BACKUP_DIR/$CORE_FILE" "$CORE_FILE"
rm -f "$SETUP_FILE"
node --check "$CORE_FILE"
if clasp push -f; then :; elif clasp push; then :; else fail "cleanup push failed"; fi
update_deployment || fail "deployment cleanup update failed"
ok "Temporary route removed; existing deployment preserved"

info "SYNC LIVE APPS SCRIPT MIRROR"
bash <(curl -fsSL "$RAW/scripts/sync-live-apps-script-to-github.sh")

info "RECORD HANDOFF"
DOCS="$TMP_ROOT/docs"
gh repo clone "$REPO" "$DOCS" -- --depth=1 >/dev/null
python3 - "$DOCS" <<'PY'
from pathlib import Path
import sys
root=Path(sys.argv[1])
marker='V061_CALLOUSED_STRINGS_ORIGINAL_MP3_20260824'
state=root/'CURRENT_STATE.md'
text=state.read_text(encoding='utf-8')
if marker not in text:
    text += f'''\n\n---\n\n## v0.6.1 music track replacement — 24.08.2026 [{marker}]\n\n- MIDI-derived `Calloused Strings` render removed from playlist storage.\n- Track 06 replaced by the user-supplied original MP3 after metadata/artwork removal and loudness normalization to the existing background-music set.\n- Playlist identity and random 6-track behavior are unchanged; only private track-06 bytes changed.\n- Existing Apps Script deployment `Таблица ЧП 1.3` preserved; temporary sync route removed.\n'''
    state.write_text(text,encoding='utf-8')
hist=root/'WORK_HISTORY.md'
text=hist.read_text(encoding='utf-8')
if marker not in text:
    text += f'''\n\n---\n\n### 24.08.2026 — original MP3 replaces MIDI-derived Calloused Strings [{marker}]\n\n- Reprocessed the supplied MP3 to 44.1 kHz stereo / 128 kbps, removed embedded tags and artwork, and matched the existing music-set loudness.\n- Replaced only private `track-06.mp3`; playlist routing and shuffle logic were not changed.\n'''
    hist.write_text(text,encoding='utf-8')
PY
cd "$DOCS"
git add CURRENT_STATE.md WORK_HISTORY.md
git diff --check
git config user.name "Royal CRM Release"
git config user.email "royal-crm-sync@users.noreply.github.com"
if ! git diff --cached --quiet; then
  git commit -m "Record original Calloused Strings MP3 replacement" >/dev/null
  git push origin HEAD:main
fi

ok "Calloused Strings: original MP3 is now track-06; MIDI-derived render removed"
