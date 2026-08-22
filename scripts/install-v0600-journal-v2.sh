#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

# Royal CRM / «Таблица ЧП» — controlled journal-v2 rollout.
#
# This installer is intentionally fail-closed. It never creates a new
# deployment ID, never changes business rows, and never enables audit v2 until
# a fresh baseline and every service-sheet protection gate have been verified.

readonly ROLLOUT_SCRIPT_VERSION="1.4.0"
readonly ROOT_BASHPID="$BASHPID"
readonly REPO="Antonsoloway/Specnaz-mini-app"
readonly EXPECTED_DESC="Таблица ЧП 1.3"
readonly EXPECTED_AUDIT_SCHEMA="2"
readonly EXPECTED_CHATKEEPER_SECRET_PROPERTY="ROYAL_CRM_CHATKEEPER_WEBHOOK_SECRET"
readonly ROLLBACK_DISABLE_ATTEMPTS="12"
readonly ROLLBACK_DISABLE_RETRY_SECONDS="5"
readonly CLASP_RUN_VISIBILITY_ATTEMPTS="12"
readonly CLASP_RUN_VISIBILITY_RETRY_SECONDS="5"
readonly PROJECT_DIR="${ROYAL_CRM_PROJECT_DIR:-${HOME}/table-chp-1.3}"
readonly BACKUP_ROOT="${ROYAL_CRM_BACKUP_ROOT:-${HOME}/royal-crm-backups}"
readonly SOURCE_SHA="${ROYAL_CRM_SOURCE_SHA:-}"

readonly -a JOURNAL_FILES=(
  01_CORE_MAIN.js
  02_PUBLIC_SYNC_V4.js
  07_FINAL_ROLE_FIX.js
  17_MINIAPP_PERSISTENT_MEDIA.js
  25_MINIAPP_UNIFIED_SNAPSHOT.js
  29_MINIAPP_ADMIN_WRITE.js
  30_MINIAPP_ADMIN_WRITE_BACKEND.js
  31_MINIAPP_ADMIN_WRITE_HARDENED.js
  33_MINIAPP_ADMIN_WRITE_FINAL.js
  34_MINIAPP_AUDIT_V2.js
)
readonly -a JOURNAL_HOOK_FILES=(
  01_CORE_MAIN.js
  02_PUBLIC_SYNC_V4.js
  07_FINAL_ROLE_FIX.js
  17_MINIAPP_PERSISTENT_MEDIA.js
  25_MINIAPP_UNIFIED_SNAPSHOT.js
  29_MINIAPP_ADMIN_WRITE.js
  30_MINIAPP_ADMIN_WRITE_BACKEND.js
  31_MINIAPP_ADMIN_WRITE_HARDENED.js
  33_MINIAPP_ADMIN_WRITE_FINAL.js
)

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR=""
TEMP_DIR=""
RUN_PROJECT=""
SOURCE_DIR=""
DEPLOY_ID=""
DEPLOY_VERSION_BEFORE=""
WEBAPP_URL=""
AUDIT_VERSION=""
WRITE_VERSION=""
STATE_MUTATED=0
IN_ROLLBACK=0
ROLLOUT_COMPLETE=0
STAGE1_PUSH_POSSIBLE=0
STAGE1_DISABLED_CONFIRMED=0
AUDIT_ACTIVATION_POSSIBLE=0
AUDIT_ACTIVATION_CONFIRMED=0
ROLLBACK_DIAGNOSTIC_DIR=""

info() { printf '\n[INFO] %s\n' "$*"; }
ok() { printf '\n✅ %s\n' "$*"; }
warn() { printf '\n[WARN] %s\n' "$*" >&2; }

cleanup() {
  [[ "$BASHPID" == "$ROOT_BASHPID" ]] || return 0
  if [[ -n "${TEMP_DIR:-}" && -d "$TEMP_DIR" ]]; then
    rm -rf -- "$TEMP_DIR"
  fi
}

die() {
  local message="$*"
  printf '\n❌ %s\n' "$message" >&2
  # Nested `(cd ...; command)` blocks inherit functions and traps, but state
  # changes made there cannot reach the parent. Let only the root shell perform
  # rollback; its ERR/`|| die` path will handle the nested failure exactly once.
  if [[ "$BASHPID" != "$ROOT_BASHPID" ]]; then
    exit 1
  fi
  if [[ "$STATE_MUTATED" == "1" && "$IN_ROLLBACK" == "0" && "$ROLLOUT_COMPLETE" == "0" ]]; then
    warn "Начинаю автоматический rollback; служебные audit-листы не удаляются."
    if ! rollback_from_backup "$BACKUP_DIR" automatic; then
      warn "Автоматический rollback завершился не полностью. Не повторяйте rollout."
      warn "Используйте сохранённый каталог: $BACKUP_DIR"
    fi
  fi
  exit 1
}

unexpected_error() {
  local line="$1"
  local code="$2"
  die "Неожиданная ошибка в строке $line (exit $code)."
}

trap cleanup EXIT
trap 'unexpected_error "$LINENO" "$?"' ERR

usage() {
  cat <<'EOF'
Journal v2 rollout (no business-row mutation)

Rollout from an exact commit already merged into main:
  ROYAL_CRM_SOURCE_SHA=<40-char-merged-sha> \
    bash scripts/install-v0600-journal-v2.sh

Explicit rollback from a backup produced by this installer:
  BACKUP=~/royal-crm-backups/v0600-journal-v2-YYYYMMDD-HHMMSS
  ROYAL_CRM_CONFIRM_ROLLBACK=ROLLBACK_JOURNAL_V2 \
    bash "$BACKUP/install-v0600-journal-v2.sh" --rollback "$BACKUP"

Read-only diagnosis of source/deployment restoration:
  bash scripts/install-v0600-journal-v2.sh --diagnose "$BACKUP"

Read-only file-level source mismatch diagnosis (status/path only):
  bash scripts/install-v0600-journal-v2.sh --diagnose-source-diff "$BACKUP"

Optional:
  ROYAL_CRM_PROJECT_DIR     clasp project containing .clasp.json
  ROYAL_CRM_BACKUP_ROOT     backup parent (default: ~/royal-crm-backups)
EOF
}

require_tools() {
  local command_name
  for command_name in clasp curl node python3 gh git tar sha256sum; do
    command -v "$command_name" >/dev/null 2>&1 || die "$command_name не найден"
  done
  [[ -d "$PROJECT_DIR" ]] || die "Apps Script каталог не найден: $PROJECT_DIR"
  [[ -f "$PROJECT_DIR/.clasp.json" ]] || die ".clasp.json не найден: $PROJECT_DIR"
  gh auth status >/dev/null 2>&1 || die "GitHub CLI не авторизован"
}

require_rollback_tools() {
  local command_name
  for command_name in clasp python3; do
    command -v "$command_name" >/dev/null 2>&1 || die "$command_name не найден"
  done
  [[ -d "$PROJECT_DIR" ]] || die "Apps Script каталог не найден: $PROJECT_DIR"
  [[ -f "$PROJECT_DIR/.clasp.json" ]] || die ".clasp.json не найден: $PROJECT_DIR"
}

require_diagnose_tools() {
  local command_name
  for command_name in clasp python3; do
    command -v "$command_name" >/dev/null 2>&1 || die "$command_name не найден"
  done
}

validate_source_sha() {
  [[ "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]] \
    || die "ROYAL_CRM_SOURCE_SHA обязателен и должен быть полным 40-символьным SHA уже объединённого commit."

  local resolved compare_status
  resolved="$(gh api "repos/${REPO}/commits/${SOURCE_SHA}" --jq '.sha')" \
    || die "Commit $SOURCE_SHA не найден в $REPO"
  [[ "$resolved" == "$SOURCE_SHA" ]] || die "GitHub вернул другой commit SHA"

  compare_status="$(gh api "repos/${REPO}/compare/${SOURCE_SHA}...main" --jq '.status')" \
    || die "Не удалось доказать, что $SOURCE_SHA уже находится в main"
  case "$compare_status" in
    identical|ahead) ;;
    *) die "Commit $SOURCE_SHA не является предком main (status=$compare_status). PR head использовать нельзя." ;;
  esac
  ok "Pinned source commit подтверждён в main: $SOURCE_SHA"
}

source_dir_for_project() {
  local project_root="$1"
  local root_dir
  root_dir="$(python3 - "$project_root/.clasp.json" <<'PY'
import json, sys
from pathlib import Path

config = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
print(str(config.get('rootDir') or '.'))
PY
)" || return 1

  python3 - "$project_root" "$root_dir" <<'PY'
import os, sys
base = os.path.realpath(sys.argv[1])
target = os.path.realpath(os.path.join(base, sys.argv[2]))
if target != base and not target.startswith(base + os.sep):
    raise SystemExit('rootDir escapes rollout workspace')
print(target)
PY
}

resolve_source_dir() {
  SOURCE_DIR="$(source_dir_for_project "$RUN_PROJECT")" \
    || die "Не удалось безопасно разрешить rootDir из .clasp.json"
  mkdir -p "$SOURCE_DIR"
}

copy_clasp_config() {
  cp -p "$PROJECT_DIR/.clasp.json" "$RUN_PROJECT/.clasp.json"
  if [[ -f "$PROJECT_DIR/.claspignore" ]]; then
    cp -p "$PROJECT_DIR/.claspignore" "$RUN_PROJECT/.claspignore"
  fi
  resolve_source_dir
}

legacy_source_manifest() {
  local root="$1"
  local output="$2"
  python3 - "$root" "$output" <<'PY'
import hashlib, os, sys
from pathlib import Path

root = Path(sys.argv[1]).resolve()
out = Path(sys.argv[2])
rows = []
for path in root.rglob('*'):
    if not path.is_file():
        continue
    if path.name == 'appsscript.json' or path.suffix in {'.js', '.gs'}:
        rel = path.relative_to(root).as_posix()
        rows.append((rel, hashlib.sha256(path.read_bytes()).hexdigest()))
out.write_text(''.join(f'{digest}  {rel}\n' for rel, digest in sorted(rows)), encoding='utf-8')
PY
}

complete_source_manifest() {
  local root="$1"
  local output="$2"
  python3 - "$root" "$output" <<'PY'
import hashlib, sys
from pathlib import Path

root = Path(sys.argv[1]).resolve()
out = Path(sys.argv[2])
rows = []
for path in root.rglob('*'):
    if not path.is_file():
        continue
    if path.name == 'appsscript.json' or path.suffix in {'.js', '.gs', '.html'}:
        rel = path.relative_to(root).as_posix()
        rows.append((rel, hashlib.sha256(path.read_bytes()).hexdigest()))
out.write_text(''.join(f'{digest}  {rel}\n' for rel, digest in sorted(rows)), encoding='utf-8')
PY
}

# Keep the historical helper contract for rollback code or sourced tooling
# that still expects the pre-1.4 JS/GS-only manifest.
full_source_manifest() {
  legacy_source_manifest "$@"
}

assert_only_allowed_changes() {
  local before="$1"
  local after="$2"
  local allowed_csv="$3"
  local required_csv="${4:-}"
  python3 - "$before" "$after" "$allowed_csv" "$required_csv" <<'PY'
import sys
from pathlib import Path

def load(path):
    rows = {}
    for line in Path(path).read_text(encoding='utf-8').splitlines():
        if not line.strip():
            continue
        digest, rel = line.split('  ', 1)
        rows[rel] = digest
    return rows

before, after = load(sys.argv[1]), load(sys.argv[2])
allowed = {x for x in sys.argv[3].split(',') if x}
required = {x for x in sys.argv[4].split(',') if x}
changed = {name for name in set(before) | set(after) if before.get(name) != after.get(name)}
unexpected = changed - allowed
missing = required - changed
if unexpected:
    raise SystemExit('unexpected changed source files: ' + ', '.join(sorted(unexpected)))
if missing:
    raise SystemExit('required source changes missing: ' + ', '.join(sorted(missing)))
print('[OK] changed source files: ' + (', '.join(sorted(changed)) or '(none)'))
PY
}

write_candidate_backup() {
  local source_root="$1"
  local destination="$2"
  mkdir -p "$destination"
  local file_name
  for file_name in "${JOURNAL_FILES[@]}"; do
    if [[ -f "$source_root/$file_name" ]]; then
      cp -p "$source_root/$file_name" "$destination/$file_name"
    fi
  done
}

download_candidate() {
  local raw="https://raw.githubusercontent.com/${REPO}/${SOURCE_SHA}/apps-script-live"
  local file_name
  mkdir -p "$TEMP_DIR/candidate"
  for file_name in "${JOURNAL_FILES[@]}"; do
    curl -fsSL "$raw/$file_name" -o "$TEMP_DIR/candidate/$file_name" \
      || die "Не удалось получить pinned source: $file_name"
    node --check "$TEMP_DIR/candidate/$file_name" >/dev/null \
      || die "Syntax check не пройден: $file_name"
  done

  AUDIT_VERSION="$(python3 - "$TEMP_DIR/candidate/34_MINIAPP_AUDIT_V2.js" <<'PY'
import re, sys
from pathlib import Path
s = Path(sys.argv[1]).read_text(encoding='utf-8')
m = re.search(r"var MINIAPP_AUDIT_V2_VERSION = '([^']+)';", s)
if not m:
    raise SystemExit('audit version marker missing')
print(m.group(1))
PY
)" || die "AUDIT v2 version marker отсутствует"

  WRITE_VERSION="$(python3 - "$TEMP_DIR/candidate/33_MINIAPP_ADMIN_WRITE_FINAL.js" <<'PY'
import re, sys
from pathlib import Path
s = Path(sys.argv[1]).read_text(encoding='utf-8')
m = re.search(r"var MINIAPP_ADMIN_WRITE_FINAL_VERSION = '([^']+)';", s)
if not m:
    raise SystemExit('write version marker missing')
print(m.group(1))
PY
)" || die "Admin write version marker отсутствует"

  grep -Fq 'function MINIAPP_auditV2Activate()' "$TEMP_DIR/candidate/34_MINIAPP_AUDIT_V2.js" \
    || die "Audit activate gate отсутствует"
  grep -Fq 'function MINIAPP_auditV2Deactivate()' "$TEMP_DIR/candidate/34_MINIAPP_AUDIT_V2.js" \
    || die "Audit deactivate gate отсутствует"
  grep -Fq 'function MINIAPP_auditV2Status()' "$TEMP_DIR/candidate/34_MINIAPP_AUDIT_V2.js" \
    || die "Audit status gate отсутствует"
  grep -Fq 'function MINIAPP_migrateLegacyChatKeeperSecret()' "$TEMP_DIR/candidate/34_MINIAPP_AUDIT_V2.js" \
    || die "ChatKeeper credential migration gate отсутствует"
  grep -Fq 'function MINIAPP_adminWritePreflight()' "$TEMP_DIR/candidate/30_MINIAPP_ADMIN_WRITE_BACKEND.js" \
    || die "Admin preflight отсутствует"
  grep -Fq 'MINIAPP_ADMIN_WRITE_PINNED_ENDPOINT' "$TEMP_DIR/candidate/31_MINIAPP_ADMIN_WRITE_HARDENED.js" \
    || die "Endpoint injection anchor отсутствует"
  python3 - "$TEMP_DIR/candidate/01_CORE_MAIN.js" "$EXPECTED_CHATKEEPER_SECRET_PROPERTY" <<'PY'
import re, sys
from pathlib import Path

source = Path(sys.argv[1]).read_text(encoding='utf-8')
property_name = sys.argv[2]
if property_name not in source:
    raise SystemExit('ChatKeeper Script Property name is absent from candidate file01')
if 'getProperty(CHATKEEPER_WEBHOOK_SECRET_PROPERTY)' not in source:
    raise SystemExit('candidate file01 does not read ChatKeeper credential at runtime')
if not re.search(r'if\s*\(\s*!isValidChatKeeperWebhookSecret_\(data\.secret\)\s*\)', source):
    raise SystemExit('candidate file01 does not fail closed at the webhook gate')
if re.search(r'\b(?:const|let|var)\s+(?:SECRET|WEBHOOK_SECRET|CHATKEEPER_SECRET)\s*=\s*[\'\"]', source):
    raise SystemExit('candidate file01 contains a hardcoded credential declaration')
if re.search(r'\b(?:data\.)?secret\s*!==\s*[\'\"]', source):
    raise SystemExit('candidate file01 compares webhook input to a literal')
PY
  ok "10 pinned source files загружены и проверены (audit=$AUDIT_VERSION, write=$WRITE_VERSION)"
}

inject_exact_endpoint() {
  python3 - "$TEMP_DIR/candidate/31_MINIAPP_ADMIN_WRITE_HARDENED.js" "$WEBAPP_URL" <<'PY'
import json, re, sys
from pathlib import Path

path = Path(sys.argv[1])
endpoint = sys.argv[2]
text = path.read_text(encoding='utf-8')
pattern = re.compile(r'^var MINIAPP_ADMIN_WRITE_PINNED_ENDPOINT = .+;$', re.MULTILINE)
replacement = 'var MINIAPP_ADMIN_WRITE_PINNED_ENDPOINT = ' + json.dumps(endpoint) + ';'
updated, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit('deployment endpoint constant anchor missing or ambiguous')
path.write_text(updated, encoding='utf-8')
PY
  node --check "$TEMP_DIR/candidate/31_MINIAPP_ADMIN_WRITE_HARDENED.js" >/dev/null \
    || die "Endpoint injection нарушил синтаксис file31"
  grep -Fq "$WEBAPP_URL" "$TEMP_DIR/candidate/31_MINIAPP_ADMIN_WRITE_HARDENED.js" \
    || die "Exact deployment endpoint не внедрён"
}

make_inert_audit_stage() {
  cp -p "$TEMP_DIR/candidate/34_MINIAPP_AUDIT_V2.js" "$TEMP_DIR/34-inert.js"
  python3 - "$TEMP_DIR/34-inert.js" "$STAMP" <<'PY'
import re, sys
from pathlib import Path

path = Path(sys.argv[1])
text = path.read_text(encoding='utf-8')
pattern = re.compile(r"^var MINIAPP_AUDIT_V2_ACTIVATION_TOKEN = '[^']+';$", re.MULTILINE)
replacement = "var MINIAPP_AUDIT_V2_ACTIVATION_TOKEN = 'audit-v2:rollout-inert:" + sys.argv[2] + "';"
updated, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit('activation token anchor missing or ambiguous')
path.write_text(updated, encoding='utf-8')
PY
  node --check "$TEMP_DIR/34-inert.js" >/dev/null || die "Inert audit stage syntax invalid"
}

list_deployments_raw() {
  if clasp list-deployments >"$1" 2>&1; then
    return 0
  fi
  clasp deployments >"$1" 2>&1
}

parse_deployments() {
  local raw_file="$1"
  local tsv_file="$2"
  python3 - "$raw_file" "$tsv_file" <<'PY'
import re, sys
from pathlib import Path

raw = Path(sys.argv[1]).read_text(encoding='utf-8', errors='replace')
rows = []
declared_count = None
for line in raw.splitlines():
    if not line.strip():
        continue
    count_match = re.fullmatch(r'Found ([0-9]+) deployments?\.', line.strip())
    if count_match:
        if declared_count is not None:
            raise SystemExit('duplicate deployment count header')
        declared_count = int(count_match.group(1))
        continue
    match = re.match(r'^\s*-\s+([^\s]+)\s+@([^\s]+)(?:\s+-\s+(.*?))?\s*$', line)
    if not match:
        raise SystemExit('unrecognized deployment inventory line')
    deployment_id, version, description = match.groups()
    rows.append((deployment_id, version, description or ''))
if not rows:
    raise SystemExit('no deployments could be parsed')
if declared_count is not None and declared_count != len(rows):
    raise SystemExit('deployment count does not match parsed inventory')
Path(sys.argv[2]).write_text(
    ''.join('\t'.join(row) + '\n' for row in rows), encoding='utf-8'
)
PY
}

capture_deployments() {
  local stem="$1"
  local raw_file="$TEMP_DIR/deployments-${stem}.txt"
  local tsv_file="$TEMP_DIR/deployments-${stem}.tsv"
  list_deployments_raw "$raw_file" || die "Не удалось получить список deployments"
  cat "$raw_file"
  parse_deployments "$raw_file" "$tsv_file" || die "Формат clasp deployments не распознан"
  cut -f1 "$tsv_file" | LC_ALL=C sort -u >"$TEMP_DIR/deployment-ids-${stem}.txt"
}

select_named_deployment() {
  local matches_file="$TEMP_DIR/deployment-matches-before.tsv"
  awk -F '\t' -v expected="$EXPECTED_DESC" '$3 == expected { print }' \
    "$TEMP_DIR/deployments-before.tsv" >"$matches_file"
  local count
  count="$(wc -l <"$matches_file" | tr -d ' ')"
  [[ "$count" == "1" ]] \
    || die "Найдено $count deployment с exact description '$EXPECTED_DESC'; ожидался ровно 1."

  IFS=$'\t' read -r DEPLOY_ID DEPLOY_VERSION_BEFORE _ <"$matches_file"
  [[ "$DEPLOY_ID" =~ ^[A-Za-z0-9_-]{20,}$ ]] || die "Некорректный deployment ID"
  [[ "$DEPLOY_VERSION_BEFORE" =~ ^[0-9]+$ ]] \
    || die "Named deployment должен указывать на numeric version, не @HEAD"
  WEBAPP_URL="https://script.google.com/macros/s/${DEPLOY_ID}/exec"
  ok "Выбран единственный existing deployment: $EXPECTED_DESC @${DEPLOY_VERSION_BEFORE}"
}

assert_same_deployment_set() {
  cmp -s "$TEMP_DIR/deployment-ids-before.txt" "$TEMP_DIR/deployment-ids-after.txt" \
    || die "Набор deployment ID изменился. Новый deployment запрещён."
  local matches_file="$TEMP_DIR/deployment-matches-after.tsv"
  awk -F '\t' -v expected="$EXPECTED_DESC" '$3 == expected { print }' \
    "$TEMP_DIR/deployments-after.tsv" >"$matches_file"
  [[ "$(wc -l <"$matches_file" | tr -d ' ')" == "1" ]] \
    || die "После update exact named deployment больше не уникален"
  local after_id after_version
  IFS=$'\t' read -r after_id after_version _ <"$matches_file"
  [[ "$after_id" == "$DEPLOY_ID" ]] || die "Обновлён другой deployment ID"
  [[ "$after_version" =~ ^[0-9]+$ ]] || die "Новая deployment version не numeric"
  [[ "$after_version" -gt "$DEPLOY_VERSION_BEFORE" ]] \
    || die "Existing deployment не получил новую numeric version"
  ok "Deployment ID сохранён; version ${DEPLOY_VERSION_BEFORE} → ${after_version}; новых ID нет"
}

semantic_assert() {
  local mode="$1"
  local expected_endpoint="${2:-}"
  local output_file="$3"
  python3 - "$mode" "$AUDIT_VERSION" "$EXPECTED_AUDIT_SCHEMA" \
    "$expected_endpoint" "$EXPECTED_CHATKEEPER_SECRET_PROPERTY" "$output_file" <<'PY'
import ast, json, re, sys
from pathlib import Path

mode, audit_version, schema, endpoint, secret_property, output_file = sys.argv[1:7]
raw = Path(output_file).read_text(encoding='utf-8', errors='replace')
raw = re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', raw)
if re.search(r'\b(?:Exception|TypeError|ReferenceError|SyntaxError):', raw):
    raise SystemExit('Apps Script exception in clasp output')

decoder = json.JSONDecoder()
values = []
for pos, char in enumerate(raw):
    if char not in '{[':
        continue
    try:
        value, _ = decoder.raw_decode(raw[pos:])
        values.append(value)
    except Exception:
        pass

# clasp 2.x and clasp 3.x without --json may print Node's util.inspect form:
# `{ ok: true, active: false, version: '...' }`. Parse that restricted data
# notation without executing it. Apps Script results never need functions,
# constructors or other executable syntax here.
def balanced_blocks(text):
    blocks = []
    start = None
    depth = 0
    quote = None
    escape = False
    opening = {'{': '}', '[': ']'}
    stack = []
    for index, char in enumerate(text):
        if quote:
            if escape:
                escape = False
            elif char == '\\':
                escape = True
            elif char == quote:
                quote = None
            continue
        if char in "'\"":
            quote = char
            continue
        if char in opening:
            if not stack:
                start = index
            stack.append(opening[char])
        elif stack and char == stack[-1]:
            stack.pop()
            if not stack and start is not None:
                blocks.append(text[start:index + 1])
                start = None
    return blocks

def inspect_to_literal(block):
    # Quote JavaScript identifier keys, then translate primitive tokens only
    # outside quoted strings.
    block = re.sub(
        r'([,{]\s*)([A-Za-z_$][A-Za-z0-9_$]*)(\s*:)',
        r"\1'\2'\3",
        block
    )
    out = []
    quote = None
    escape = False
    index = 0
    replacements = {'true': 'True', 'false': 'False', 'null': 'None'}
    while index < len(block):
        char = block[index]
        if quote:
            out.append(char)
            if escape:
                escape = False
            elif char == '\\':
                escape = True
            elif char == quote:
                quote = None
            index += 1
            continue
        if char in "'\"":
            quote = char
            out.append(char)
            index += 1
            continue
        matched = False
        for token, replacement in replacements.items():
            if block.startswith(token, index):
                left_ok = index == 0 or not (block[index - 1].isalnum() or block[index - 1] in '_$')
                end = index + len(token)
                right_ok = end == len(block) or not (block[end].isalnum() or block[end] in '_$')
                if left_ok and right_ok:
                    out.append(replacement)
                    index = end
                    matched = True
                    break
        if not matched:
            out.append(char)
            index += 1
    return ''.join(out)

for block in balanced_blocks(raw):
    try:
        value = ast.literal_eval(inspect_to_literal(block))
    except Exception:
        continue
    if isinstance(value, (dict, list)):
        values.append(value)

def walk(value):
    yield value
    if isinstance(value, dict):
        for child in value.values():
            yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)
    elif isinstance(value, str) and value[:1] in '{[':
        try:
            yield from walk(json.loads(value))
        except Exception:
            pass

objects = []
for value in values:
    objects.extend(item for item in walk(value) if isinstance(item, dict))

def candidate(required):
    matches = [item for item in objects if required <= set(item)]
    if not matches:
        raise SystemExit('semantic result not found in clasp output')
    return matches[-1]

def require(condition, message):
    if not condition:
        raise SystemExit(message)

if mode == 'secret-migration':
    data = candidate({'ok', 'configured', 'migrated', 'property',
                      'valueExposed', 'version', 'error'})
    allowed = {'ok', 'configured', 'migrated', 'property',
               'valueExposed', 'version', 'error'}
    require(set(data) <= allowed, 'migration returned non-metadata fields')
    require(data.get('ok') is True, 'credential migration ok != true')
    require(data.get('configured') is True, 'credential property is not configured')
    require(isinstance(data.get('migrated'), bool), 'migration flag is not boolean')
    require(data.get('property') == secret_property, 'credential property name mismatch')
    require(data.get('valueExposed') is False, 'credential value exposure marker is unsafe')
    require(data.get('version') == audit_version, 'credential migration version mismatch')
    require(data.get('error') == '', 'credential migration returned an error')
elif mode == 'deactivate':
    data = candidate({'ok', 'active', 'version'})
    require(data.get('ok') is True, 'deactivate ok != true')
    require(data.get('active') is False, 'deactivate active != false')
    require(data.get('version') == audit_version, 'deactivate version mismatch')
elif mode == 'status-disabled':
    data = candidate({'active', 'version', 'schemaVersion'})
    require(data.get('active') is False, 'audit unexpectedly active')
    require(data.get('version') == audit_version, 'status version mismatch')
    require(int(data.get('schemaVersion') or 0) == int(schema), 'status schema mismatch')
elif mode == 'activate':
    data = candidate({'ok', 'active', 'version'})
    require(data.get('ok') is True and data.get('active') is True, 'activation failed closed')
    require(data.get('version') == audit_version, 'activation version mismatch')
    require(int(data.get('participants') or 0) + int(data.get('teams') or 0) > 0,
            'activation baseline is empty')
    require(data.get('storageSecurityReady') is True, 'activation storage security is not ready')
    for field in ('journalHidden', 'journalProtected', 'indexHidden',
                  'indexProtected', 'baselineHidden', 'baselineProtected'):
        require(data.get(field) is True, 'activation gate failed: ' + field)
elif mode == 'status-active':
    data = candidate({'ok', 'active', 'version', 'schemaVersion'})
    require(data.get('ok') is True and data.get('active') is True, 'active status not healthy')
    require(data.get('version') == audit_version, 'status version mismatch')
    require(int(data.get('schemaVersion') or 0) == int(schema), 'status schema mismatch')
    require(data.get('baselineInitialized') is True, 'baseline is not initialized')
    require(int(data.get('baselineRecords') or 0) > 0, 'baseline records are empty')
    require(data.get('journalPresent') is True and data.get('journalSchemaReady') is True,
            'journal schema is not ready')
    require(data.get('indexPresent') is True, 'audit index is absent')
    # Flat fields are the exact audit.3 contract. Each *Protected boolean is
    # true only when the named sheet protection is non-warning-only and has
    # domain editing disabled.
    require(data.get('storageSecurityReady') is True, 'storage security is not ready')
    for field in ('journalHidden', 'journalProtected', 'indexHidden',
                  'indexProtected', 'baselineHidden', 'baselineProtected'):
        require(data.get(field) is True, 'status gate failed: ' + field)
elif mode == 'admin-preflight':
    data = candidate({'ok', 'issues', 'endpointPinned', 'endpointSource', 'audit'})
    require(data.get('ok') is True, 'admin preflight ok != true')
    require(data.get('issues') == [], 'admin preflight issues are not empty')
    require(data.get('endpointPinned') is True, 'endpoint is not pinned')
    require(data.get('endpointSource') == 'deployment-constant', 'endpoint source is not deployment-constant')
    audit = data.get('audit') or {}
    require(audit.get('version') == audit_version, 'admin preflight audit version mismatch')
    require(int(audit.get('schemaVersion') or 0) == int(schema), 'admin preflight audit schema mismatch')
    nested = audit.get('preflight') or audit.get('status') or {}
    require(nested.get('ok') is True and nested.get('active') is True,
            'admin preflight audit status is not healthy')
    require(nested.get('storageSecurityReady') is True,
            'admin preflight storage security is not ready')
    for field in ('journalHidden', 'journalProtected', 'indexHidden',
                  'indexProtected', 'baselineHidden', 'baselineProtected'):
        require(nested.get(field) is True, 'admin preflight gate failed: ' + field)
    require((nested.get('endpoint') in (None, '', endpoint)), 'unexpected nested endpoint')
elif mode == 'snapshot-export':
    data = candidate({'ok'})
    require(data.get('ok') is True, 'snapshot export ok != true')
else:
    raise SystemExit('unknown semantic assertion mode: ' + mode)
print('[OK] semantic clasp result:', mode)
PY
}

run_clasp_checked() {
  local function_name="$1"
  local mode="$2"
  local expected_endpoint="${3:-}"
  local diagnostic_root output_file semantic_file attempt exit_code semantic_code
  diagnostic_root="${BACKUP_DIR:-$TEMP_DIR}/diagnostics/clasp-run/${function_name}-$(date +%s%N)-${BASHPID}"
  mkdir -p -m 700 "$diagnostic_root"

  # Apps Script HEAD propagation after clasp push is not instantaneous. A
  # function-not-found response, an empty transport response or the previous
  # version's semantic payload must not turn a successful inert push into a
  # false rollback. Every call is bounded and every attempt is retained.
  for attempt in $(seq 1 "$CLASP_RUN_VISIBILITY_ATTEMPTS"); do
    output_file="$diagnostic_root/attempt-${attempt}.txt"
    semantic_file="$diagnostic_root/attempt-${attempt}.semantic.txt"
    printf '[INFO] clasp run %s semantic visibility check %s/%s\n' \
      "$function_name" "$attempt" "$CLASP_RUN_VISIBILITY_ATTEMPTS"

    if clasp run "$function_name" >"$output_file" 2>&1; then
      exit_code=0
    else
      exit_code=$?
    fi
    if semantic_assert "$mode" "$expected_endpoint" "$output_file" \
      >"$semantic_file" 2>&1; then
      semantic_code=0
    else
      semantic_code=$?
    fi
    cat "$output_file"
    if [[ "$exit_code" == "0" && "$semantic_code" == "0" ]]; then
      cat "$semantic_file"
      printf 'CLASP_EXIT_OK=true\nSEMANTIC_OK=true\nATTEMPT=%s\n' "$attempt" \
        >"$diagnostic_root/result.txt"
      return 0
    fi
    if [[ "$attempt" -lt "$CLASP_RUN_VISIBILITY_ATTEMPTS" ]]; then
      sleep "$CLASP_RUN_VISIBILITY_RETRY_SECONDS"
    fi
  done

  printf 'CLASP_EXIT_OK=%s\nSEMANTIC_OK=%s\nATTEMPT=%s\n' \
    "$([[ "$exit_code" == "0" ]] && printf true || printf false)" \
    "$([[ "$semantic_code" == "0" ]] && printf true || printf false)" \
    "$CLASP_RUN_VISIBILITY_ATTEMPTS" >"$diagnostic_root/result.txt"
  die "clasp run $function_name не стал семантически доступен за $CLASP_RUN_VISIBILITY_ATTEMPTS попыток (last exit=$exit_code, semantic=$semantic_code)"
}

check_direct_route() {
  local phase="$1"
  local expected_version="${2:-}"
  local body_file="$TEMP_DIR/route-${phase}.json"
  curl -fsS -L --max-time 30 \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    --data 'miniapp=1&action=admin-write&backend=1' \
    "$WEBAPP_URL" -o "$body_file" \
    || die "Named deployment /exec недоступен ($phase)"
  python3 - "$body_file" "$expected_version" <<'PY'
import json, sys
from pathlib import Path

data = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
if data.get('error') != 'INVALID_REQUEST_ID':
    raise SystemExit('expected INVALID_REQUEST_ID from non-mutating route probe')
if sys.argv[2] and data.get('version') != sys.argv[2]:
    raise SystemExit('route version mismatch')
print('[OK] direct route is non-mutating and bound to expected deployment')
PY
}

update_existing_deployment() {
  # v3 calls an exact-ID redeploy `update-deployment`; some v3 builds expose
  # only its documented create-deployment alias. v2 uses `deploy -i`. Every
  # branch carries the already selected ID, so none can create a new URL.
  if clasp update-deployment "$DEPLOY_ID" --description "$EXPECTED_DESC"; then
    return 0
  fi
  if clasp create-deployment --deploymentId "$DEPLOY_ID" \
    --description "$EXPECTED_DESC"; then
    return 0
  fi
  clasp deploy -i "$DEPLOY_ID" -d "$EXPECTED_DESC"
}

restore_existing_deployment_version() {
  local deployment_id="$1"
  local version="$2"
  if clasp update-deployment "$deployment_id" \
    --versionNumber "$version" --description "$EXPECTED_DESC"; then
    return 0
  fi
  if clasp create-deployment --deploymentId "$deployment_id" \
    --versionNumber "$version" --description "$EXPECTED_DESC"; then
    return 0
  fi
  clasp deploy -i "$deployment_id" -V "$version" -d "$EXPECTED_DESC"
}

write_metadata() {
  local had_34="false"
  [[ -f "$BACKUP_DIR/live-before-candidate/34_MINIAPP_AUDIT_V2.js" ]] && had_34="true"
  python3 - "$BACKUP_DIR/metadata.json" \
    "$DEPLOY_ID" "$DEPLOY_VERSION_BEFORE" "$EXPECTED_DESC" "$SOURCE_SHA" \
    "$PROJECT_DIR" "$had_34" "$AUDIT_VERSION" "$WRITE_VERSION" \
    "$EXPECTED_CHATKEEPER_SECRET_PROPERTY" <<'PY'
import json, sys
from pathlib import Path

path = Path(sys.argv[1])
data = {
    'schema': 2,
    'sourceManifestSchema': 2,
    'deploymentId': sys.argv[2],
    'deploymentVersionBefore': int(sys.argv[3]),
    'deploymentDescription': sys.argv[4],
    'sourceSha': sys.argv[5],
    'projectDir': sys.argv[6],
    'auditFileExistedBefore': sys.argv[7] == 'true',
    'auditVersion': sys.argv[8],
    'writeVersion': sys.argv[9],
    'chatKeeperSecretProperty': sys.argv[10],
    'chatKeeperSecretPropertyPreservedOnRollback': True,
    'rolloutPhase': 'prepared',
    'stage1PushPossible': False,
    'stage1DisabledConfirmed': False,
    'auditActivationPossible': False,
    'auditActivationConfirmed': False,
    'rollbackFiles': [
        '01_CORE_MAIN.js', '02_PUBLIC_SYNC_V4.js', '07_FINAL_ROLE_FIX.js',
        '17_MINIAPP_PERSISTENT_MEDIA.js', '25_MINIAPP_UNIFIED_SNAPSHOT.js',
        '29_MINIAPP_ADMIN_WRITE.js', '30_MINIAPP_ADMIN_WRITE_BACKEND.js',
        '31_MINIAPP_ADMIN_WRITE_HARDENED.js', '33_MINIAPP_ADMIN_WRITE_FINAL.js',
        '34_MINIAPP_AUDIT_V2.js'
    ],
    'serviceSheetsDeletionAllowed': False
}
path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
PY
}

checkpoint_rollout_state() {
  local phase="$1"
  [[ -f "$BACKUP_DIR/metadata.json" ]] || die "Rollback metadata отсутствует для checkpoint"
  python3 - "$BACKUP_DIR/metadata.json" "$phase" \
    "$STAGE1_PUSH_POSSIBLE" "$STAGE1_DISABLED_CONFIRMED" \
    "$AUDIT_ACTIVATION_POSSIBLE" "$AUDIT_ACTIVATION_CONFIRMED" <<'PY'
import json, os, sys
from pathlib import Path

path = Path(sys.argv[1])
phase = sys.argv[2]
allowed = {
    'prepared', 'stage1-push-started', 'stage1-disabled-confirmed',
    'stage2-source-pushed', 'activation-attempted',
    'activation-confirmed', 'deployment-updated', 'complete'
}
if phase not in allowed:
    raise SystemExit('invalid rollout checkpoint phase')
data = json.loads(path.read_text(encoding='utf-8'))
data.update({
    'schema': 2,
    'rolloutPhase': phase,
    'stage1PushPossible': sys.argv[3] == '1',
    'stage1DisabledConfirmed': sys.argv[4] == '1',
    'auditActivationPossible': sys.argv[5] == '1',
    'auditActivationConfirmed': sys.argv[6] == '1'
})
temporary = path.with_name(path.name + '.tmp')
temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
os.chmod(temporary, 0o600)
os.replace(temporary, path)
PY
}

preserve_deployment_inventory() {
  cp -p "$TEMP_DIR/deployments-before.txt" "$BACKUP_DIR/deployments-before.txt"
  cp -p "$TEMP_DIR/deployments-before.tsv" "$BACKUP_DIR/deployments-before.tsv"
  cp -p "$TEMP_DIR/deployment-ids-before.txt" "$BACKUP_DIR/deployment-ids-before.txt"
}

preserve_pinned_installer() {
  local installer_url="https://raw.githubusercontent.com/${REPO}/${SOURCE_SHA}/scripts/install-v0600-journal-v2.sh"
  curl -fsSL "$installer_url" -o "$BACKUP_DIR/install-v0600-journal-v2.sh" \
    || die "Не удалось сохранить pinned installer для rollback"
  bash -n "$BACKUP_DIR/install-v0600-journal-v2.sh" \
    || die "Сохранённый pinned installer не прошёл syntax check"
  chmod 700 "$BACKUP_DIR/install-v0600-journal-v2.sh"
}

load_rollback_metadata() {
  local backup="$1"
  local field="$2"
  python3 - "$backup/metadata.json" "$field" <<'PY'
import json, sys
from pathlib import Path
data = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
value = data[sys.argv[2]]
if isinstance(value, bool):
    print('true' if value else 'false')
else:
    print(value)
PY
}

load_rollback_metadata_optional() {
  local backup="$1"
  local field="$2"
  local fallback="$3"
  python3 - "$backup/metadata.json" "$field" "$fallback" <<'PY'
import json, sys
from pathlib import Path
data = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
value = data.get(sys.argv[2], sys.argv[3])
if isinstance(value, bool):
    print('true' if value else 'false')
else:
    print(value)
PY
}

validate_backup_dir() {
  local backup="$1"
  python3 - "$BACKUP_ROOT" "$backup" <<'PY'
import os, sys
root = os.path.realpath(sys.argv[1])
target = os.path.realpath(sys.argv[2])
if not target.startswith(root + os.sep):
    raise SystemExit('backup directory is outside configured backup root')
if not os.path.basename(target).startswith('v0600-journal-v2-'):
    raise SystemExit('unexpected backup directory name')
print(target)
PY
}

prepare_clean_run_project() {
  RUN_PROJECT="$TEMP_DIR/clasp-project"
  mkdir -p "$RUN_PROJECT"
  copy_clasp_config
  (
    cd "$RUN_PROJECT" || exit 1
    clasp pull || exit 1
  ) || die "Clean clasp pull live project завершился ошибкой"
  resolve_source_dir
}

push_current_source() {
  (
    cd "$RUN_PROJECT" || exit 1
    clasp status || exit 1
    clasp push -f || exit 1
  )
}

restore_exact_journal_files() {
  local backup="$1"
  local had_34="$2"
  local file_name
  for file_name in "${JOURNAL_HOOK_FILES[@]}"; do
    [[ -f "$backup/live-before-candidate/$file_name" ]] \
      || return 1
    cp -p "$backup/live-before-candidate/$file_name" "$SOURCE_DIR/$file_name"
  done
  if [[ "$had_34" == "true" ]]; then
    [[ -f "$backup/live-before-candidate/34_MINIAPP_AUDIT_V2.js" ]] || return 1
    cp -p "$backup/live-before-candidate/34_MINIAPP_AUDIT_V2.js" \
      "$SOURCE_DIR/34_MINIAPP_AUDIT_V2.js"
  else
    rm -f -- "$SOURCE_DIR/34_MINIAPP_AUDIT_V2.js"
  fi
}

prepare_rollback_diagnostics() {
  local backup="$1"
  if [[ -z "$ROLLBACK_DIAGNOSTIC_DIR" ]]; then
    ROLLBACK_DIAGNOSTIC_DIR="$backup/diagnostics/rollback-${STAMP}-$$"
  fi
  mkdir -p -m 700 "$ROLLBACK_DIAGNOSTIC_DIR"
}

confirm_audit_disabled_for_rollback() {
  local backup="$1"
  local attempt deactivate_output deactivate_semantic status_output status_semantic
  local deactivate_exit deactivate_verified status_exit status_verified
  prepare_rollback_diagnostics "$backup" || return 1

  for attempt in $(seq 1 "$ROLLBACK_DISABLE_ATTEMPTS"); do
    deactivate_output="$ROLLBACK_DIAGNOSTIC_DIR/deactivate-${attempt}.txt"
    deactivate_semantic="$ROLLBACK_DIAGNOSTIC_DIR/deactivate-${attempt}.semantic.txt"
    status_output="$ROLLBACK_DIAGNOSTIC_DIR/status-${attempt}.txt"
    status_semantic="$ROLLBACK_DIAGNOSTIC_DIR/status-${attempt}.semantic.txt"
    printf '[INFO] rollback audit-disable check %s/%s\n' \
      "$attempt" "$ROLLBACK_DISABLE_ATTEMPTS"

    if (cd "$RUN_PROJECT" && clasp run MINIAPP_auditV2Deactivate) \
      >"$deactivate_output" 2>&1; then
      deactivate_exit=0
    else
      deactivate_exit=$?
    fi
    if semantic_assert deactivate '' "$deactivate_output" \
      >"$deactivate_semantic" 2>&1; then
      deactivate_verified=0
    else
      deactivate_verified=$?
    fi

    if (cd "$RUN_PROJECT" && clasp run MINIAPP_auditV2Status) \
      >"$status_output" 2>&1; then
      status_exit=0
    else
      status_exit=$?
    fi
    if semantic_assert status-disabled '' "$status_output" \
      >"$status_semantic" 2>&1; then
      status_verified=0
    else
      status_verified=$?
    fi

    cat "$deactivate_output"
    cat "$status_output"
    if [[ "$status_exit" == "0" && "$status_verified" == "0" ]]; then
      {
        printf 'DEACTIVATE_EXIT_OK=%s\n' "$([[ "$deactivate_exit" == "0" ]] && printf true || printf false)"
        printf 'DEACTIVATE_SEMANTIC_OK=%s\n' "$([[ "$deactivate_verified" == "0" ]] && printf true || printf false)"
        printf 'STATUS_DISABLED_CONFIRMED=true\n'
      } >"$ROLLBACK_DIAGNOSTIC_DIR/result.txt"
      ok "Rollback postcondition confirmed: audit active=false"
      return 0
    fi

    if [[ "$attempt" -lt "$ROLLBACK_DISABLE_ATTEMPTS" ]]; then
      sleep "$ROLLBACK_DISABLE_RETRY_SECONDS"
    fi
  done

  {
    printf 'DEACTIVATE_EXIT_OK=%s\n' "$([[ "$deactivate_exit" == "0" ]] && printf true || printf false)"
    printf 'DEACTIVATE_SEMANTIC_OK=%s\n' "$([[ "$deactivate_verified" == "0" ]] && printf true || printf false)"
    printf 'STATUS_DISABLED_CONFIRMED=false\n'
  } >"$ROLLBACK_DIAGNOSTIC_DIR/result.txt"
  return 1
}

rollback_from_backup() {
  local backup="$1"
  local mode="${2:-manual}"
  IN_ROLLBACK=1
  trap - ERR

  [[ -f "$backup/metadata.json" ]] || { warn "Rollback metadata отсутствует"; return 1; }
  [[ -d "$backup/live-before-candidate" ]] || { warn "Live-before backup отсутствует"; return 1; }
  [[ -f "$backup/live-before.sha256" ]] || { warn "Live-before manifest отсутствует"; return 1; }

  local rollback_id rollback_version rollback_desc had_34 rollback_audit_version
  local activation_possible
  rollback_id="$(load_rollback_metadata "$backup" deploymentId)" || return 1
  rollback_version="$(load_rollback_metadata "$backup" deploymentVersionBefore)" || return 1
  rollback_desc="$(load_rollback_metadata "$backup" deploymentDescription)" || return 1
  had_34="$(load_rollback_metadata "$backup" auditFileExistedBefore)" || return 1
  rollback_audit_version="$(load_rollback_metadata "$backup" auditVersion)" || return 1
  # Schema-1 backups predate durable phase checkpoints. Treat their activation
  # state as possible, never as safely skipped.
  activation_possible="$(
    load_rollback_metadata_optional "$backup" auditActivationPossible true
  )" || return 1
  [[ "$rollback_desc" == "$EXPECTED_DESC" ]] || { warn "Rollback description mismatch"; return 1; }
  [[ "$rollback_id" =~ ^[A-Za-z0-9_-]{20,}$ ]] || return 1
  [[ "$rollback_version" =~ ^[0-9]+$ ]] || return 1
  [[ -n "$rollback_audit_version" ]] || return 1
  [[ "$activation_possible" == "true" || "$activation_possible" == "false" ]] || return 1
  AUDIT_VERSION="$rollback_audit_version"

  if [[ -z "${TEMP_DIR:-}" || ! -d "$TEMP_DIR" ]]; then
    TEMP_DIR="$(mktemp -d /tmp/royal-v0600-journal-rollback.XXXXXX)" || return 1
  fi
  local rollback_baseline="$TEMP_DIR/rollback-baseline-full.sha256"
  prepare_comparable_baseline_manifest \
    "$backup" "$rollback_baseline" "$TEMP_DIR/rollback-baseline-project" \
    || { warn "Rollback full source baseline invalid"; return 1; }
  source_manifests_equal_safely \
    "$rollback_baseline" "$rollback_baseline" \
    "$TEMP_DIR/rollback-baseline.validation" \
    || { warn "Rollback source manifest structure invalid"; return 1; }
  if [[ -z "${RUN_PROJECT:-}" || ! -f "$RUN_PROJECT/.clasp.json" ]]; then
    RUN_PROJECT="$TEMP_DIR/clasp-rollback-project"
    mkdir -p "$RUN_PROJECT" || return 1
    cp -p "$PROJECT_DIR/.clasp.json" "$RUN_PROJECT/.clasp.json" || return 1
    [[ ! -f "$PROJECT_DIR/.claspignore" ]] \
      || cp -p "$PROJECT_DIR/.claspignore" "$RUN_PROJECT/.claspignore" || return 1
    resolve_source_dir || return 1
    (cd "$RUN_PROJECT" && clasp pull) || return 1
    resolve_source_dir || return 1
  fi

  prepare_rollback_diagnostics "$backup" || return 1
  info "ROLLBACK: confirm audit v2 disabled (service sheets stay intact)"
  # The ChatKeeper Script Property is deliberately preserved. The previous
  # deployment/source keeps working, and a later retry does not need the
  # already-removed source credential to be reintroduced.
  local deactivate_verified=1
  if [[ "$activation_possible" == "true" ]]; then
    if ! confirm_audit_disabled_for_rollback "$backup"; then
      warn "Audit disable postcondition not confirmed after bounded retries; restore will continue but rollback will remain incomplete"
      deactivate_verified=0
    fi
  else
    # The checkpoint is persisted before Activate is first invoked. Therefore
    # this installer could not have written the active token. A failed/absent
    # Stage-1 function is not evidence of an incomplete rollback.
    printf 'ACTIVATION_POSSIBLE=false\nSTATUS_DISABLED_CONFIRMATION_REQUIRED=false\n' \
      >"$ROLLBACK_DIAGNOSTIC_DIR/result.txt"
    ok "Activation was never attempted; audit-disable call is not required"
  fi

  info "ROLLBACK: restore the same deployment ID to numeric version $rollback_version"
  (cd "$RUN_PROJECT" && restore_existing_deployment_version "$rollback_id" "$rollback_version") \
    || return 1

  info "ROLLBACK: restore exactly ten journal source paths"
  restore_exact_journal_files "$backup" "$had_34" || return 1
  push_current_source || return 1

  info "ROLLBACK: verify factual live source against the saved manifest"
  (
    cd "$RUN_PROJECT" || exit 1
    clasp pull || exit 1
  ) >"$ROLLBACK_DIAGNOSTIC_DIR/live-source-pull.txt" 2>&1 || return 1
  resolve_source_dir || return 1
  complete_source_manifest "$SOURCE_DIR" "$ROLLBACK_DIAGNOSTIC_DIR/live-source.sha256" \
    || return 1
  source_manifests_equal_safely \
    "$rollback_baseline" "$ROLLBACK_DIAGNOSTIC_DIR/live-source.sha256" \
    "$ROLLBACK_DIAGNOSTIC_DIR/live-source.validation" || {
      warn "Factual live source differs from saved live-before manifest"
      return 1
    }

  local rollback_raw="$TEMP_DIR/deployments-rollback.txt"
  local rollback_tsv="$TEMP_DIR/deployments-rollback.tsv"
  local rollback_ids="$TEMP_DIR/deployment-ids-rollback.txt"
  (cd "$RUN_PROJECT" && list_deployments_raw "$rollback_raw") || return 1
  parse_deployments "$rollback_raw" "$rollback_tsv" || return 1
  cut -f1 "$rollback_tsv" | LC_ALL=C sort -u >"$rollback_ids"
  cp -p "$rollback_raw" "$ROLLBACK_DIAGNOSTIC_DIR/deployments.txt"
  cp -p "$rollback_tsv" "$ROLLBACK_DIAGNOSTIC_DIR/deployments.tsv"
  cp -p "$rollback_ids" "$ROLLBACK_DIAGNOSTIC_DIR/deployment-ids.txt"
  [[ -f "$backup/deployment-ids-before.txt" ]] || return 1
  cmp -s "$backup/deployment-ids-before.txt" "$rollback_ids" || {
    warn "Rollback deployment inventory differs from the saved pre-rollout inventory"
    return 1
  }
  python3 - "$rollback_tsv" "$rollback_id" "$rollback_version" "$EXPECTED_DESC" <<'PY'
import sys
from pathlib import Path
rows = [line.split('\t') for line in Path(sys.argv[1]).read_text(encoding='utf-8').splitlines()]
matches = [row for row in rows if len(row) == 3 and row[0] == sys.argv[2] and row[1] == sys.argv[3] and row[2] == sys.argv[4]]
if len(matches) != 1:
    raise SystemExit('rollback deployment verification failed')
print('[OK] same deployment ID restored to previous numeric version')
PY
  if [[ "$deactivate_verified" != "1" ]]; then
    warn "Source/deployment восстановлены, но audit deactivation не подтверждён семантически."
    return 1
  fi
  ok "Rollback завершён. Служебные audit-листы не удалялись. Backup: $backup"
  [[ "$mode" == "automatic" ]] && return 0
  return 0
}

verify_private_snapshot() {
  local snapshot_file="$TEMP_DIR/admin-snapshot.json"
  local attempt
  for attempt in $(seq 1 30); do
    printf '[INFO] private snapshot check %s/30\n' "$attempt"
    if gh api "repos/Antonsoloway/royal-crm-data/contents/admin-snapshot.json" \
      -H 'Accept: application/vnd.github.raw+json' >"$snapshot_file" 2>/dev/null \
      && python3 - "$snapshot_file" "$WEBAPP_URL" "$EXPECTED_AUDIT_SCHEMA" "$WRITE_VERSION" <<'PY'
import json, sys
from pathlib import Path

data = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
admin = data.get('adminData') or {}
write = admin.get('write') or {}
journal = admin.get('journal') or {}
assert write.get('endpoint') == sys.argv[2]
assert write.get('endpointPinned') is True
assert write.get('endpointSource') == 'deployment-constant'
assert int(journal.get('schemaVersion') or 0) == int(sys.argv[3])
assert write.get('version') == sys.argv[4]
assert isinstance(journal.get('rows'), list)
print('[OK] private snapshot confirms write version, pinned endpoint and journal schema v2')
PY
    then
      return 0
    fi
    sleep 12
  done
  die "Private snapshot не подтвердил pinned endpoint + journal schema v2 за полный trigger interval"
}

capture_factual_live_after() {
  info "CAPTURE + VERIFY FACTUAL LIVE SOURCE AFTER ROLLOUT"
  # Keep rollback globals pinned to the original complete clean-pull tree.
  # A live-after verification failure must never make rollback push a partial
  # capture tree and accidentally remove unrelated Apps Script files.
  local after_project="$TEMP_DIR/clasp-live-after"
  local after_source
  mkdir -p "$after_project"
  cp -p "$PROJECT_DIR/.clasp.json" "$after_project/.clasp.json"
  [[ ! -f "$PROJECT_DIR/.claspignore" ]] \
    || cp -p "$PROJECT_DIR/.claspignore" "$after_project/.claspignore"
  after_source="$(source_dir_for_project "$after_project")" \
    || die "Factual live-after rootDir is unsafe"
  mkdir -p "$after_source"
  (
    cd "$after_project" || exit 1
    clasp pull || exit 1
  ) || die "Factual live-after clasp pull failed"
  complete_source_manifest "$after_source" "$BACKUP_DIR/live-after.sha256"
  cmp -s "$TEMP_DIR/stage2.sha256" "$BACKUP_DIR/live-after.sha256" \
    || die "Factual live source differs from the exact reviewed stage2 source"
  tar -czf "$BACKUP_DIR/live-after-full.tgz" -C "$after_project" . \
    || die "Не удалось сохранить factual live-after export"
  write_candidate_backup "$after_source" "$BACKUP_DIR/live-after-candidate"
  ok "Factual live-after export exactly matches reviewed stage2 manifest"

  python3 - "$BACKUP_DIR/handoff.json" "$SOURCE_SHA" "$AUDIT_VERSION" "$WRITE_VERSION" <<'PY'
import json, sys
from pathlib import Path
Path(sys.argv[1]).write_text(json.dumps({
    'schema': 1,
    'sourceSha': sys.argv[2],
    'auditVersion': sys.argv[3],
    'writeVersion': sys.argv[4],
    'liveSourceVerified': True,
    'liveMirrorSyncRequired': True,
    'privateDocsSyncRequired': True
}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
PY
}

prepare_comparable_baseline_manifest() {
  local backup="$1"
  local output="$2"
  local extraction_root="$3"
  local manifest_schema baseline_source

  [[ -f "$backup/metadata.json" && ! -L "$backup/metadata.json" ]] || return 1
  [[ -f "$backup/live-before.sha256" && ! -L "$backup/live-before.sha256" ]] \
    || return 1
  [[ -f "$backup/.clasp.json.rollback" && ! -L "$backup/.clasp.json.rollback" ]] \
    || return 1
  if [[ -e "$backup/.claspignore.rollback" ]]; then
    [[ -f "$backup/.claspignore.rollback" \
      && ! -L "$backup/.claspignore.rollback" ]] || return 1
  fi

  manifest_schema="$(
    load_rollback_metadata_optional "$backup" sourceManifestSchema 1
  )" || return 1
  case "$manifest_schema" in
    2)
      cp -p "$backup/live-before.sha256" "$output" || return 1
      return 0
      ;;
    1) ;;
    *) return 1 ;;
  esac

  [[ -f "$backup/live-before-full.tgz" \
    && ! -L "$backup/live-before-full.tgz" ]] || return 1
  mkdir -m 700 "$extraction_root" || return 1
  python3 - "$backup/live-before-full.tgz" "$extraction_root" \
    2>"${extraction_root}.archive-validation-error.txt" <<'PY' || return 1
import os, re, shutil, sys, tarfile, unicodedata
from pathlib import Path, PurePosixPath

archive = Path(sys.argv[1])
root = Path(sys.argv[2]).resolve()
members_limit = 1000
bytes_limit = 100 * 1024 * 1024
total = 0

with tarfile.open(archive, 'r:gz') as handle:
    safe_members = []
    seen = {}
    for member_index, member in enumerate(handle, start=1):
        if member_index > members_limit:
            raise SystemExit('baseline archive has too many entries')
        raw = member.name
        while raw.startswith('./'):
            raw = raw[2:]
        if raw in {'', '.'}:
            if member.isdir():
                continue
            raise SystemExit('invalid baseline archive root')
        rel = PurePosixPath(raw)
        if (
            rel.is_absolute()
            or '..' in rel.parts
            or rel.as_posix() != raw
            or '\\' in raw
            or len(raw.encode('utf-8')) > 1024
            or any(len(part.encode('utf-8')) > 255 for part in rel.parts)
            or unicodedata.normalize('NFC', raw) != raw
            or any(
                unicodedata.category(char).startswith('C')
                or unicodedata.category(char) in {'Zl', 'Zp'}
                for char in raw
            )
            or re.search(r'AKfy[A-Za-z0-9_-]{12,}', raw)
            or re.search(r'(?<![A-Za-z0-9_-])1[A-Za-z0-9_-]{30,}', raw)
            or re.search(r'[0-9a-fA-F]{40,}', raw)
            or member.issym()
            or member.islnk()
            or member.isdev()
            or member.size < 0
        ):
            raise SystemExit('unsafe baseline archive entry')
        if raw in seen:
            raise SystemExit('duplicate baseline archive entry')
        if any(
            seen.get(parent.as_posix()) == 'file'
            for parent in rel.parents
            if parent != PurePosixPath('.')
        ):
            raise SystemExit('baseline archive path conflicts with a file')
        if member.isfile() and any(name.startswith(raw + '/') for name in seen):
            raise SystemExit('baseline archive file conflicts with a directory')
        seen[raw] = 'dir' if member.isdir() else 'file'
        target = (root / Path(*rel.parts)).resolve()
        if target != root and root not in target.parents:
            raise SystemExit('baseline archive path escapes root')
        total += member.size
        if total > bytes_limit:
            raise SystemExit('baseline archive is too large')
        safe_members.append((member, target))

    for member, target in safe_members:
        if member.isdir():
            target.mkdir(parents=True, exist_ok=True)
            os.chmod(target, 0o700)
            continue
        if not member.isfile():
            raise SystemExit('unsupported baseline archive entry')
        target.parent.mkdir(parents=True, exist_ok=True)
        source = handle.extractfile(member)
        if source is None:
            raise SystemExit('baseline archive file is unreadable')
        with source, target.open('wb') as destination:
            shutil.copyfileobj(source, destination)
        os.chmod(target, 0o600)
PY
  [[ -f "$extraction_root/.clasp.json" \
    && ! -L "$extraction_root/.clasp.json" ]] || return 1
  cmp -s "$backup/.clasp.json.rollback" "$extraction_root/.clasp.json" \
    || return 1
  if [[ -f "$backup/.claspignore.rollback" ]]; then
    [[ -f "$extraction_root/.claspignore" \
      && ! -L "$extraction_root/.claspignore" ]] || return 1
    cmp -s "$backup/.claspignore.rollback" "$extraction_root/.claspignore" \
      || return 1
  else
    [[ ! -e "$extraction_root/.claspignore" ]] || return 1
  fi
  cp -p "$backup/.clasp.json.rollback" "$extraction_root/.clasp.json" || return 1
  if [[ -f "$backup/.claspignore.rollback" ]]; then
    cp -p "$backup/.claspignore.rollback" "$extraction_root/.claspignore" || return 1
  else
    rm -f -- "$extraction_root/.claspignore"
  fi
  baseline_source="$(source_dir_for_project "$extraction_root")" || return 1
  [[ -d "$baseline_source" ]] || return 1
  legacy_source_manifest "$baseline_source" "$extraction_root/legacy-source.sha256" \
    || return 1
  source_manifests_equal_safely \
    "$backup/live-before.sha256" "$extraction_root/legacy-source.sha256" \
    "$extraction_root/legacy-source.validation" \
    || return 1
  rm -f -- "$extraction_root/legacy-source.validation"
  complete_source_manifest "$baseline_source" "$output" || return 1
  source_manifests_equal_safely \
    "$output" "$output" "$extraction_root/full-source.validation" || return 1
  rm -f -- "$extraction_root/full-source.validation"
}

normalize_deployment_inventory() {
  local input="$1"
  local output="$2"
  python3 - "$input" "$output" <<'PY'
import re, sys, unicodedata
from pathlib import Path

rows = []
seen = set()
for line in Path(sys.argv[1]).read_text(encoding='utf-8').splitlines():
    if not line:
        continue
    row = line.split('\t')
    if len(row) != 3:
        raise SystemExit('invalid deployment inventory row')
    deployment_id, version, description = row
    if (
        not re.fullmatch(r'[A-Za-z0-9_-]{20,}', deployment_id)
        or not re.fullmatch(r'(?:[0-9]+|HEAD)', version)
        or deployment_id in seen
        or any(
            unicodedata.category(char).startswith('C')
            or unicodedata.category(char) in {'Zl', 'Zp'}
            for char in description
        )
    ):
        raise SystemExit('invalid deployment inventory row')
    seen.add(deployment_id)
    rows.append((deployment_id, version, description))
if not rows:
    raise SystemExit('empty deployment inventory')
Path(sys.argv[2]).write_text(
    ''.join('\t'.join(row) + '\n' for row in sorted(rows)),
    encoding='utf-8'
)
PY
}

write_safe_source_diff() {
  local before="$1"
  local current="$2"
  local output="$3"
  python3 - "$before" "$current" >"$output" 2>/dev/null <<'PY'
import json, re, sys, unicodedata
from pathlib import Path, PurePosixPath

# File-level output is intentionally limited to the reviewed public/live source
# names. A merely well-formed path may itself contain a credential or private
# identifier, so unknown changed names fail closed without count or file rows.
SAFE_DIFF_PATHS = {
    '01_CORE_MAIN.js',
    '02_PUBLIC_SYNC_V4.js',
    '04_TELEGRAM_AVATARS.js',
    '05_RELIABLE_WEBHOOK_QUEUE.js',
    '06_Reliable_Edit_Trigger.js',
    '07_FINAL_ROLE_FIX.js',
    '08_TELEGRAM_NAME_LINKS.js',
    '09_OPTIMIZATION_SCHEDULE.js',
    '10_DIAGNOSTICS.js',
    '11_PERFORMANCE_OPTIMIZATION.js',
    '12_MINI_APP_API.js',
    '13_MINI_APP_UI.js',
    '14_GITHUB_SNAPSHOT_EXPORT.js',
    '15_MINIAPP_MEDIA_CACHE.js',
    '16_MINIAPP_MEDIA_SMART_SYNC.js',
    '17_MINIAPP_PERSISTENT_MEDIA.js',
    '18_MINIAPP_MENU_CACHE_BUST.js',
    '19_MINIAPP_FALLBACK_API.js',
    '20_MINIAPP_TEAM_IDENTITY_MIGRATION.js',
    '21_MINIAPP_START_WELCOME.js',
    '22_MINIAPP_BOT_APP_MENU.js',
    '23_MINIAPP_PROFILE_STATS.js',
    '24_MINIAPP_SPECNAZ_HISTORY.js',
    '25_MINIAPP_UNIFIED_SNAPSHOT.js',
    '26_MINIAPP_MAYAK_MEDIA_SETUP.js',
    '27_MINIAPP_TEAM_STATUS.js',
    '28_MINIAPP_ADMIN_DATA.js',
    '29_MINIAPP_ADMIN_WRITE.js',
    '30_MINIAPP_ADMIN_WRITE_BACKEND.js',
    '31_MINIAPP_ADMIN_WRITE_HARDENED.js',
    '32_MINIAPP_ADMIN_TEAM_PHOTO.js',
    '33_MINIAPP_ADMIN_WRITE_FINAL.js',
    '34_MINIAPP_AUDIT_V2.js',
    'MiniApp.html',
    'appsscript.json',
    'Вспом функции.js',
}

def load_manifest(path):
    rows = {}
    for line in Path(path).read_text(encoding='utf-8').splitlines():
        if not line:
            continue
        try:
            digest, rel = line.split('  ', 1)
        except ValueError as exc:
            raise SystemExit('invalid source manifest row') from exc
        candidate = PurePosixPath(rel)
        terminal = candidate.name
        if (
            not re.fullmatch(r'[0-9a-f]{64}', digest)
            or candidate.is_absolute()
            or '..' in candidate.parts
            or not rel
            or rel == '.'
            or terminal in {'', '.', '..'}
            or candidate.as_posix() != rel
            or '\\' in rel
            or len(rel.encode('utf-8')) > 1024
            or any(len(part.encode('utf-8')) > 255 for part in candidate.parts)
            or unicodedata.normalize('NFC', rel) != rel
            or any(
                unicodedata.category(char).startswith('C')
                or unicodedata.category(char) in {'Zl', 'Zp'}
                for char in rel
            )
            or re.search(r'AKfy[A-Za-z0-9_-]{12,}', rel)
            or re.search(r'(?<![A-Za-z0-9_-])1[A-Za-z0-9_-]{30,}', rel)
            or re.search(r'[0-9a-fA-F]{40,}', rel)
        ):
            raise SystemExit('invalid source manifest row')
        if rel in rows:
            raise SystemExit('duplicate source manifest path')
        rows[rel] = digest
    if not rows or 'appsscript.json' not in rows:
        raise SystemExit('source manifest missing appsscript.json')
    for rel in rows:
        if rel == 'appsscript.json':
            continue
        if PurePosixPath(rel).suffix not in {'.js', '.gs', '.html'}:
            raise SystemExit('source manifest contains non-source path')
    return rows

before = load_manifest(sys.argv[1])
current = load_manifest(sys.argv[2])
changes = []
for rel in sorted(set(before) | set(current)):
    if rel not in before:
        status = 'ADDED'
    elif rel not in current:
        status = 'REMOVED'
    elif before[rel] != current[rel]:
        status = 'CHANGED'
    else:
        continue
    changes.append({'status': status, 'path': rel})

if any(change['path'] not in SAFE_DIFF_PATHS for change in changes):
    raise SystemExit('changed source path is not approved for terminal output')

print('SOURCE_MATCHES_LIVE_BEFORE=' + ('true' if not changes else 'false'))
print('SOURCE_DETAILS_AVAILABLE=true')
print(f'SOURCE_DIFF_COUNT={len(changes)}')
for change in changes:
    print('SOURCE_DIFF=' + json.dumps(change, ensure_ascii=False, separators=(',', ':')))
PY
}

source_manifests_equal_safely() {
  local before="$1"
  local current="$2"
  local output="$3"
  write_safe_source_diff "$before" "$current" "$output" || return 1
  python3 - "$output" <<'PY'
import sys
from pathlib import Path

expected = [
    'SOURCE_MATCHES_LIVE_BEFORE=true',
    'SOURCE_DETAILS_AVAILABLE=true',
    'SOURCE_DIFF_COUNT=0',
]
actual = Path(sys.argv[1]).read_text(encoding='utf-8').splitlines()
raise SystemExit(0 if actual == expected else 1)
PY
}

diagnose_backup() {
  local backup="$1"
  local diagnosis_project diagnosis_source
  local source_restored=false deployment_set_restored=false named_deployment_restored=false
  local deployment_inventory_restored=false
  local rollback_id rollback_version rollback_desc

  TEMP_DIR="$(mktemp -d /tmp/royal-v0600-journal-diagnose.XXXXXX)" \
    || die "Не удалось создать временный diagnosis каталог"
  diagnosis_project="$TEMP_DIR/clasp-project"
  mkdir -p "$diagnosis_project"

  [[ -f "$backup/metadata.json" && ! -L "$backup/metadata.json" ]] \
    && [[ -f "$backup/.clasp.json.rollback" \
      && ! -L "$backup/.clasp.json.rollback" ]] \
    && [[ -f "$backup/live-before.sha256" \
      && ! -L "$backup/live-before.sha256" ]] \
    && [[ -f "$backup/deployment-ids-before.txt" \
      && ! -L "$backup/deployment-ids-before.txt" ]] \
    && [[ -f "$backup/deployments-before.txt" \
      && ! -L "$backup/deployments-before.txt" ]] \
    && [[ -f "$backup/deployments-before.tsv" \
      && ! -L "$backup/deployments-before.tsv" ]] \
    || die "Backup не содержит полный read-only diagnosis набор"

  prepare_comparable_baseline_manifest \
    "$backup" "$TEMP_DIR/baseline-full.sha256" "$TEMP_DIR/baseline-project" \
    || die "Не удалось доказать полный Apps Script payload baseline"
  parse_deployments \
    "$backup/deployments-before.txt" "$TEMP_DIR/deployments-before.strict.tsv" \
    >/dev/null 2>&1 || die "Saved raw deployment inventory invalid"
  normalize_deployment_inventory \
    "$TEMP_DIR/deployments-before.strict.tsv" \
    "$TEMP_DIR/deployments-before.normalized.tsv" \
    || die "Saved deployment inventory invalid"
  normalize_deployment_inventory \
    "$backup/deployments-before.tsv" \
    "$TEMP_DIR/deployments-before.saved.normalized.tsv" \
    || die "Saved deployment TSV invalid"
  cmp -s "$TEMP_DIR/deployments-before.normalized.tsv" \
    "$TEMP_DIR/deployments-before.saved.normalized.tsv" \
    || die "Saved raw and parsed deployment inventory differ"
  cut -f1 "$TEMP_DIR/deployments-before.strict.tsv" | LC_ALL=C sort -u \
    >"$TEMP_DIR/deployment-ids-before.strict.txt"
  cmp -s "$backup/deployment-ids-before.txt" \
    "$TEMP_DIR/deployment-ids-before.strict.txt" \
    || die "Saved deployment ID inventory invalid"

  rollback_id="$(load_rollback_metadata "$backup" deploymentId)" \
    || die "Diagnosis metadata deploymentId invalid"
  rollback_version="$(load_rollback_metadata "$backup" deploymentVersionBefore)" \
    || die "Diagnosis metadata deploymentVersionBefore invalid"
  rollback_desc="$(load_rollback_metadata "$backup" deploymentDescription)" \
    || die "Diagnosis metadata deploymentDescription invalid"
  [[ "$rollback_id" =~ ^[A-Za-z0-9_-]{20,}$ ]] || die "Diagnosis deployment ID invalid"
  [[ "$rollback_version" =~ ^[0-9]+$ ]] || die "Diagnosis deployment version invalid"
  [[ "$rollback_desc" == "$EXPECTED_DESC" ]] || die "Diagnosis deployment description invalid"

  cp -p "$backup/.clasp.json.rollback" "$diagnosis_project/.clasp.json"
  [[ ! -f "$backup/.claspignore.rollback" ]] \
    || cp -p "$backup/.claspignore.rollback" "$diagnosis_project/.claspignore"
  diagnosis_source="$(source_dir_for_project "$diagnosis_project")" \
    || die "Diagnosis rootDir invalid"
  mkdir -p "$diagnosis_source"

  if (
    cd "$diagnosis_project" || exit 1
    clasp pull
  ) >"$TEMP_DIR/clasp-pull.txt" 2>&1; then
    complete_source_manifest "$diagnosis_source" "$TEMP_DIR/live-current.sha256"
    if source_manifests_equal_safely \
      "$TEMP_DIR/baseline-full.sha256" "$TEMP_DIR/live-current.sha256" \
      "$TEMP_DIR/source-equality.validation"; then
      source_restored=true
    fi
  fi

  if (
    cd "$diagnosis_project" || exit 1
    list_deployments_raw "$TEMP_DIR/deployments-current.txt"
  ) >/dev/null 2>&1 \
    && parse_deployments \
      "$TEMP_DIR/deployments-current.txt" "$TEMP_DIR/deployments-current.tsv" \
      >/dev/null 2>&1; then
    cut -f1 "$TEMP_DIR/deployments-current.tsv" | LC_ALL=C sort -u \
      >"$TEMP_DIR/deployment-ids-current.txt"
    if normalize_deployment_inventory \
      "$TEMP_DIR/deployments-current.tsv" "$TEMP_DIR/deployments-current.normalized.tsv" \
      >/dev/null 2>&1 \
      && cmp -s "$TEMP_DIR/deployments-before.normalized.tsv" \
        "$TEMP_DIR/deployments-current.normalized.tsv"; then
      deployment_inventory_restored=true
    fi
    if cmp -s "$TEMP_DIR/deployment-ids-before.strict.txt" \
      "$TEMP_DIR/deployment-ids-current.txt"; then
      deployment_set_restored=true
    fi
    if python3 - "$TEMP_DIR/deployments-current.tsv" \
      "$rollback_id" "$rollback_version" "$rollback_desc" <<'PY'
import sys
from pathlib import Path
rows = [line.split('\t') for line in Path(sys.argv[1]).read_text(encoding='utf-8').splitlines()]
matches = [
    row for row in rows
    if len(row) == 3 and row[0] == sys.argv[2]
    and row[1] == sys.argv[3] and row[2] == sys.argv[4]
]
raise SystemExit(0 if len(matches) == 1 else 1)
PY
    then
      named_deployment_restored=true
    fi
  fi

  printf 'DIAGNOSE_READ_ONLY=true\n'
  printf 'SOURCE_EQUALS_LIVE_BEFORE=%s\n' "$source_restored"
  printf 'DEPLOYMENT_SET_EQUALS_BEFORE=%s\n' "$deployment_set_restored"
  printf 'NAMED_DEPLOYMENT_EQUALS_BEFORE=%s\n' "$named_deployment_restored"
  printf 'DEPLOYMENT_INVENTORY_EQUALS_BEFORE=%s\n' "$deployment_inventory_restored"
  if [[ "$source_restored" == "true" \
    && "$deployment_set_restored" == "true" \
    && "$named_deployment_restored" == "true" \
    && "$deployment_inventory_restored" == "true" ]]; then
    printf 'SOURCE_AND_DEPLOYMENT_RESTORED=true\n'
  else
    printf 'SOURCE_AND_DEPLOYMENT_RESTORED=false\n'
  fi
  # This mode deliberately never executes Apps Script functions. Therefore it
  # cannot claim a live Script Property postcondition.
  printf 'AUDIT_DISABLED_LIVE_CHECK=false\n'
  printf 'MUTATING_COMMANDS_USED=false\n'
}

diagnose_source_diff() {
  local backup="$1"
  local diagnosis_project diagnosis_source
  local source_pull_succeeded=false

  TEMP_DIR="$(mktemp -d /tmp/royal-v0600-journal-source-diff.XXXXXX)" \
    || die "Не удалось создать временный source-diff каталог"
  diagnosis_project="$TEMP_DIR/clasp-project"
  mkdir -p "$diagnosis_project"

  [[ -f "$backup/.clasp.json.rollback" \
    && ! -L "$backup/.clasp.json.rollback" ]] \
    && [[ -f "$backup/live-before.sha256" \
      && ! -L "$backup/live-before.sha256" ]] \
    && [[ -f "$backup/metadata.json" && ! -L "$backup/metadata.json" ]] \
    || die "Backup не содержит полный read-only source-diff набор"

  prepare_comparable_baseline_manifest \
    "$backup" "$TEMP_DIR/baseline-full.sha256" "$TEMP_DIR/baseline-project" \
    || die "Не удалось доказать полный Apps Script payload baseline"

  cp -p "$backup/.clasp.json.rollback" "$diagnosis_project/.clasp.json"
  [[ ! -f "$backup/.claspignore.rollback" ]] \
    || cp -p "$backup/.claspignore.rollback" "$diagnosis_project/.claspignore"
  diagnosis_source="$(source_dir_for_project "$diagnosis_project")" \
    || die "Source-diff rootDir invalid"
  mkdir -p "$diagnosis_source"

  if (
    cd "$diagnosis_project" || exit 1
    clasp pull
  ) >"$TEMP_DIR/clasp-pull.txt" 2>&1; then
    source_pull_succeeded=true
    complete_source_manifest "$diagnosis_source" "$TEMP_DIR/live-current.sha256"
  fi

  printf 'DIAGNOSE_SOURCE_DIFF_READ_ONLY=true\n'
  printf 'SOURCE_PULL_SUCCEEDED=%s\n' "$source_pull_succeeded"
  if [[ "$source_pull_succeeded" != "true" ]]; then
    printf 'SOURCE_MATCHES_LIVE_BEFORE=false\n'
    printf 'SOURCE_DETAILS_AVAILABLE=false\n'
    printf 'MUTATING_COMMANDS_USED=false\n'
    return 0
  fi

  if write_safe_source_diff \
    "$TEMP_DIR/baseline-full.sha256" "$TEMP_DIR/live-current.sha256" \
    "$TEMP_DIR/source-diff-output.txt"
  then
    cat "$TEMP_DIR/source-diff-output.txt"
  else
    printf 'SOURCE_MATCHES_LIVE_BEFORE=false\n'
    printf 'SOURCE_DETAILS_AVAILABLE=false\n'
  fi
  printf 'MUTATING_COMMANDS_USED=false\n'
}

rollout() {
  require_tools
  validate_source_sha

  mkdir -p -m 700 "$BACKUP_ROOT"
  BACKUP_DIR="$BACKUP_ROOT/v0600-journal-v2-$STAMP"
  mkdir -m 700 "$BACKUP_DIR" || die "Backup directory уже существует или недоступен: $BACKUP_DIR"
  TEMP_DIR="$(mktemp -d /tmp/royal-v0600-journal-v2.XXXXXX)"
  preserve_pinned_installer

  info "BACKUP LOCAL BEFORE PULL"
  tar -czf "$BACKUP_DIR/local-before-pull.tgz" -C "$PROJECT_DIR" . \
    || die "Не удалось создать local-before-pull backup"
  (
    cd "$PROJECT_DIR" || exit 1
    clasp status || exit 1
  ) >"$BACKUP_DIR/clasp-status-before-pull.txt" 2>&1 \
    || die "clasp status before pull завершился ошибкой"
  cat "$BACKUP_DIR/clasp-status-before-pull.txt"

  prepare_clean_run_project
  info "BACKUP FACTUAL LIVE SOURCE"
  tar -czf "$BACKUP_DIR/live-before-full.tgz" -C "$RUN_PROJECT" . \
    || die "Не удалось создать live-before backup"
  write_candidate_backup "$SOURCE_DIR" "$BACKUP_DIR/live-before-candidate"
  complete_source_manifest "$SOURCE_DIR" "$BACKUP_DIR/live-before.sha256"
  cp -p "$RUN_PROJECT/.clasp.json" "$BACKUP_DIR/.clasp.json.rollback"
  [[ ! -f "$RUN_PROJECT/.claspignore" ]] \
    || cp -p "$RUN_PROJECT/.claspignore" "$BACKUP_DIR/.claspignore.rollback"

  local file_name
  for file_name in "${JOURNAL_HOOK_FILES[@]}"; do
    [[ -f "$SOURCE_DIR/$file_name" ]] \
      || die "Live-before source не содержит обязательный файл $file_name"
  done

  download_candidate

  (
    cd "$RUN_PROJECT" || exit 1
    capture_deployments before || exit 1
  ) || die "Pre-rollout deployment inventory failed"
  select_named_deployment
  preserve_deployment_inventory
  inject_exact_endpoint
  make_inert_audit_stage
  write_metadata

  info "NON-MUTATING PRECHECK OF CURRENT NAMED /exec"
  check_direct_route before

  info "STAGE 1/2 — push only an inert file34"
  cp -p "$TEMP_DIR/34-inert.js" "$SOURCE_DIR/34_MINIAPP_AUDIT_V2.js"
  complete_source_manifest "$SOURCE_DIR" "$TEMP_DIR/stage1.sha256"
  assert_only_allowed_changes \
    "$BACKUP_DIR/live-before.sha256" "$TEMP_DIR/stage1.sha256" \
    '34_MINIAPP_AUDIT_V2.js' '34_MINIAPP_AUDIT_V2.js' \
    || die "Stage 1 содержит лишние source changes"
  # A server can commit the push and then lose the client response. Mark the
  # state before the first remote mutation so that ambiguity always rolls back.
  STAGE1_PUSH_POSSIBLE=1
  checkpoint_rollout_state stage1-push-started
  STATE_MUTATED=1
  push_current_source || die "Stage 1 inert audit push не выполнен"
  (
    cd "$RUN_PROJECT" || exit 1
    run_clasp_checked MINIAPP_migrateLegacyChatKeeperSecret secret-migration || exit 1
    run_clasp_checked MINIAPP_auditV2Deactivate deactivate || exit 1
    run_clasp_checked MINIAPP_auditV2Status status-disabled || exit 1
  ) || die "Stage 1 deactivate/status gate failed"
  STAGE1_DISABLED_CONFIRMED=1
  checkpoint_rollout_state stage1-disabled-confirmed

  info "STAGE 2/2 — push exact pinned file34 plus the remaining nine hooks"
  for file_name in "${JOURNAL_FILES[@]}"; do
    cp -p "$TEMP_DIR/candidate/$file_name" "$SOURCE_DIR/$file_name"
  done
  for file_name in "${JOURNAL_FILES[@]}"; do
    node --check "$SOURCE_DIR/$file_name" >/dev/null \
      || die "Final syntax check failed: $file_name"
  done
  complete_source_manifest "$SOURCE_DIR" "$TEMP_DIR/stage2.sha256"
  assert_only_allowed_changes \
    "$BACKUP_DIR/live-before.sha256" "$TEMP_DIR/stage2.sha256" \
    '01_CORE_MAIN.js,02_PUBLIC_SYNC_V4.js,07_FINAL_ROLE_FIX.js,17_MINIAPP_PERSISTENT_MEDIA.js,25_MINIAPP_UNIFIED_SNAPSHOT.js,29_MINIAPP_ADMIN_WRITE.js,30_MINIAPP_ADMIN_WRITE_BACKEND.js,31_MINIAPP_ADMIN_WRITE_HARDENED.js,33_MINIAPP_ADMIN_WRITE_FINAL.js,34_MINIAPP_AUDIT_V2.js' \
    '34_MINIAPP_AUDIT_V2.js' \
    || die "Stage 2 содержит source changes вне exact ten-file allow-list"
  push_current_source || die "Stage 2 source push failed"
  (
    cd "$RUN_PROJECT" || exit 1
    run_clasp_checked MINIAPP_auditV2Status status-disabled || exit 1
  ) || die "Stage 2 disabled precondition gate failed"
  checkpoint_rollout_state stage2-source-pushed

  # Persist the possibility before the remote call. Activate may commit its
  # token and then lose the client response, so every later failure must demand
  # an independently observed active=false postcondition during rollback.
  AUDIT_ACTIVATION_POSSIBLE=1
  checkpoint_rollout_state activation-attempted
  (
    cd "$RUN_PROJECT" || exit 1
    run_clasp_checked MINIAPP_auditV2Activate activate || exit 1
  ) || die "Stage 2 activation gate failed"
  (
    cd "$RUN_PROJECT" || exit 1
    run_clasp_checked MINIAPP_auditV2Status status-active || exit 1
    run_clasp_checked MINIAPP_adminWritePreflight admin-preflight "$WEBAPP_URL" || exit 1
  ) || die "Stage 2 active status/preflight gate failed"
  AUDIT_ACTIVATION_CONFIRMED=1
  checkpoint_rollout_state activation-confirmed

  info "UPDATE THE SAME EXISTING DEPLOYMENT ID ONLY"
  (
    cd "$RUN_PROJECT" || exit 1
    update_existing_deployment || exit 1
    capture_deployments after || exit 1
  ) || die "Existing deployment update failed"
  assert_same_deployment_set
  checkpoint_rollout_state deployment-updated
  check_direct_route after "$WRITE_VERSION"

  info "EXPORT PRIVATE SNAPSHOT — semantic result, not exit code only"
  (
    cd "$RUN_PROJECT" || exit 1
    run_clasp_checked MINIAPP_exportAdminSnapshotToGitHub snapshot-export || exit 1
  ) || die "Private snapshot export semantic gate failed"
  verify_private_snapshot

  capture_factual_live_after
  checkpoint_rollout_state complete
  ROLLOUT_COMPLETE=1
  ok "Apps Script journal v2 rollout подтверждён без изменения business rows"
  printf '\nAudit: %s (schema %s)\n' "$AUDIT_VERSION" "$EXPECTED_AUDIT_SCHEMA"
  printf 'Stable deployment preserved: %s\n' "$EXPECTED_DESC"
  printf 'Deployment ID: %s\n' "$DEPLOY_ID"
  printf 'Pinned source: %s\n' "$SOURCE_SHA"
  printf 'Rollback backup: %s\n' "$BACKUP_DIR"
  printf 'Service sheets: retained, hidden and protected\n'
  printf 'Repository live mirror/docs: PENDING separate reviewed handoff PR\n'
}

main() {
  if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    usage
    exit 0
  fi
  if [[ "${1:-}" == "--diagnose" ]]; then
    [[ "$#" == "2" ]] || die "--diagnose требует ровно один backup directory"
    require_diagnose_tools
    BACKUP_DIR="$(validate_backup_dir "$2")" || die "Небезопасный backup directory"
    diagnose_backup "$BACKUP_DIR"
    exit 0
  fi
  if [[ "${1:-}" == "--diagnose-source-diff" ]]; then
    [[ "$#" == "2" ]] || die "--diagnose-source-diff требует ровно один backup directory"
    require_diagnose_tools
    BACKUP_DIR="$(validate_backup_dir "$2")" || die "Небезопасный backup directory"
    diagnose_source_diff "$BACKUP_DIR"
    exit 0
  fi
  if [[ "${1:-}" == "--rollback" ]]; then
    [[ "$#" == "2" ]] || die "--rollback требует ровно один backup directory"
    [[ "${ROYAL_CRM_CONFIRM_ROLLBACK:-}" == "ROLLBACK_JOURNAL_V2" ]] \
      || die "Для rollback задайте ROYAL_CRM_CONFIRM_ROLLBACK=ROLLBACK_JOURNAL_V2"
    require_rollback_tools
    BACKUP_DIR="$(validate_backup_dir "$2")" || die "Небезопасный backup directory"
    TEMP_DIR="$(mktemp -d /tmp/royal-v0600-journal-rollback.XXXXXX)"
    rollback_from_backup "$BACKUP_DIR" manual || die "Rollback завершился ошибкой"
    exit 0
  fi
  [[ "$#" == "0" ]] || { usage >&2; exit 2; }
  rollout
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
