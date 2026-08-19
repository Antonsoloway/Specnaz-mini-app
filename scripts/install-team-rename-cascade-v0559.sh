#!/usr/bin/env bash
set -euo pipefail

ROOT="${ROYAL_APPS_SCRIPT_DIR:-$HOME/table-chp-1.3}"
REPO_RAW="https://raw.githubusercontent.com/Antonsoloway/Specnaz-mini-app/main"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${ROYAL_BACKUP_DIR:-$HOME/royal-crm-backups/team-rename-cascade-$STAMP}"
DATA_REPO="Antonsoloway/royal-crm-data"
DATA_PATH="snapshot.json"

ok(){ printf '\033[32m[OK]\033[0m %s\n' "$*"; }
info(){ printf '\033[36m[INFO]\033[0m %s\n' "$*"; }
warn(){ printf '\033[33m[WARN]\033[0m %s\n' "$*"; }
fail(){ printf '\033[31m[ERROR]\033[0m %s\n' "$*" >&2; exit 1; }

info "Royal CRM live installer: cascade team renames + repair decorated team names"
[[ -d "$ROOT" ]] || fail "Apps Script folder not found: $ROOT"
command -v clasp >/dev/null 2>&1 || fail "clasp not found"
command -v python3 >/dev/null 2>&1 || fail "python3 not found"
command -v node >/dev/null 2>&1 || fail "node not found"

mkdir -p "$BACKUP_DIR/pre-pull" "$BACKUP_DIR/live-before-patch"
cd "$ROOT"

for f in 07_FINAL_ROLE_FIX.js 25_MINIAPP_UNIFIED_SNAPSHOT.js; do
  [[ -f "$f" ]] || fail "$f missing before pull"
  cp -p "$f" "$BACKUP_DIR/pre-pull/$f"
done
ok "Pre-pull local backups saved"

info "clasp status BEFORE pull"
clasp status

info "Pulling FACTUAL live Apps Script before patch"
clasp pull
ok "clasp pull completed"

for f in 07_FINAL_ROLE_FIX.js 25_MINIAPP_UNIFIED_SNAPSHOT.js; do
  [[ -f "$f" ]] || fail "$f missing after clasp pull"
  cp -p "$f" "$BACKUP_DIR/live-before-patch/$f"
done
ok "Factual live-before-patch backups saved"

python3 - <<'PY'
from pathlib import Path

role_path = Path('07_FINAL_ROLE_FIX.js')
writer_path = Path('25_MINIAPP_UNIFIED_SNAPSHOT.js')
role = role_path.read_text(encoding='utf-8')
writer = writer_path.read_text(encoding='utf-8')

START = 'function finalRoleHandleTeamsSheetEdit_(e) {'
END = 'function finalRoleNormalizeTeamsOrder_(sheet) {'
if START not in role or END not in role:
    raise SystemExit('[ERROR] 07 function anchors missing; refusing blind patch')

new_block = r'''function finalRoleHandleTeamsSheetEdit_(e) {
  const range = e.range;
  const sheet = range.getSheet();
  if (range.getLastRow() < 2) return;

  const firstColumn = range.getColumn();
  const lastColumn = range.getLastColumn();
  if (firstColumn > 2 || lastColumn < 1) return;

  // Для одиночного изменения названия запоминаем старое/новое значение ДО
  // сортировки строк. Это позволяет каскадно заменить название во всех 5
  // слотах «Базы участников» строго в рамках той же игры.
  let renameContext = null;
  if (
    range.getNumRows() === 1 &&
    range.getNumColumns() === 1 &&
    range.getColumn() === 2 &&
    range.getRow() >= 2
  ) {
    const oldTeam = finalRoleStripTeamSuffix_(e.oldValue);
    const newTeam = finalRoleStripTeamSuffix_(
      e.value == null ? range.getDisplayValue() : e.value
    );
    const game = finalRoleCanonicalGame_(
      sheet.getRange(range.getRow(), 1).getDisplayValue(),
      newTeam
    );

    if (
      oldTeam && newTeam && game &&
      finalRoleExactTeamKey_(oldTeam) !== finalRoleExactTeamKey_(newTeam)
    ) {
      renameContext = {
        game: game,
        oldTeam: oldTeam,
        newTeam: newTeam
      };
    }
  }

  const lock = LockService.getScriptLock();
  let mutationStarted = false;

  try {
    if (!lock.tryLock(3000)) return;

    if (typeof beginPublicDataMutation_ === 'function') {
      beginPublicDataMutation_('teams_edit:' + range.getA1Notation());
      mutationStarted = true;
    }

    let renamedMemberships = 0;
    if (renameContext) {
      renamedMemberships = finalRoleCascadeTeamRename_(
        sheet.getParent(),
        renameContext.game,
        renameContext.oldTeam,
        renameContext.newTeam
      );
    }

    // Страховка для уже существующих рассинхронизаций после добавления
    // декоративного префикса/эмодзи (например BUNTARb -> ⚡ BUNTARb).
    // Работает только если в той же игре найден ровно один кандидат.
    const repaired = finalRoleRepairDecoratedTeamMemberships_(
      sheet.getParent(),
      { skipMark: true, source: 'teams_edit' }
    );

    const movedRows = finalRoleNormalizeTeamsOrder_(sheet);
    markPublicSyncPending_(
      'teams_edit:' + range.getA1Notation() +
      ':renamed=' + renamedMemberships +
      ':repaired=' + Number(repaired && repaired.changed || 0) +
      ':moved=' + movedRows
    );
  } finally {
    if (mutationStarted && typeof finishPublicDataMutation_ === 'function') {
      try {
        finishPublicDataMutation_('teams_edit:' + range.getA1Notation());
      } catch (error) {}
    }
    try { lock.releaseLock(); } catch (error) {}
  }
}

/**
 * Каскадное переименование команды в «Базе участников».
 * Identity = старое название + игра. Меняются только 5 team-колонок,
 * роли/ники/игры и остальные данные не трогаются.
 */
function finalRoleCascadeTeamRename_(ss, game, oldTeam, newTeam) {
  const base = ss.getSheetByName(FINALROLE_BASE_SHEET_);
  if (!base) throw new Error('Не найден лист «' + FINALROLE_BASE_SHEET_ + '»');

  const canonicalGame = finalRoleCanonicalGame_(game, '');
  const oldKey = finalRoleExactTeamKey_(oldTeam);
  const cleanNewTeam = finalRoleStripTeamSuffix_(newTeam);
  if (!canonicalGame || !oldKey || !cleanNewTeam) return 0;

  const firstRow = FINALROLE_FIRST_ROW_;
  const lastRow = Math.min(base.getLastRow(), FINALROLE_LAST_ROW_);
  if (lastRow < firstRow) return 0;
  const count = lastRow - firstRow + 1;
  let changed = 0;

  FINALROLE_SLOTS_.forEach(function(slot) {
    const teamValues = base.getRange(firstRow, slot.teamCol, count, 1).getDisplayValues();
    const gameCol = 22 + slot.number; // W:AA = игра 1..5
    const gameValues = base.getRange(firstRow, gameCol, count, 1).getDisplayValues();

    for (let i = 0; i < count; i++) {
      const rawTeam = finalRoleClean_(teamValues[i][0]);
      if (!rawTeam) continue;

      const existingName = finalRoleStripTeamSuffix_(rawTeam);
      if (finalRoleExactTeamKey_(existingName) !== oldKey) continue;

      const membershipGame = finalRoleCanonicalGame_(gameValues[i][0], rawTeam);
      if (membershipGame !== canonicalGame) continue;

      const row = firstRow + i;
      const nextValue = finalRoleFormatMembershipTeam_(cleanNewTeam, rawTeam, canonicalGame);
      if (nextValue === rawTeam) continue;
      base.getRange(row, slot.teamCol).setValue(nextValue);
      changed++;
    }
  });

  if (changed) SpreadsheetApp.flush();
  return changed;
}

/**
 * Безопасно лечит рассинхронизацию, когда в «Командах» к названию только
 * добавили/изменили ведущий декоративный знак/эмодзи, а «База участников»
 * ещё хранит старое название. Автоматическая замена делается только если
 * в той же игре после удаления ведущего декора есть ровно один кандидат.
 */
function finalRoleRepairDecoratedTeamMemberships_(ss, options) {
  options = options || {};
  ss = ss || SpreadsheetApp.openById(FINALROLE_SPREADSHEET_ID_);

  const teamsSheet = ss.getSheetByName(FINALROLE_TEAMS_SHEET_);
  const base = ss.getSheetByName(FINALROLE_BASE_SHEET_);
  if (!teamsSheet || !base) {
    return { changed: 0, checked: 0, reason: 'SHEET_MISSING' };
  }

  const teamLastRow = teamsSheet.getLastRow();
  if (teamLastRow < 2) return { changed: 0, checked: 0, reason: 'NO_TEAMS' };

  const rows = teamsSheet.getRange(2, 1, teamLastRow - 1, 2).getDisplayValues();
  const exact = {};
  const decorated = {};

  rows.forEach(function(row) {
    const game = finalRoleCanonicalGame_(row[0], row[1]);
    const team = finalRoleStripTeamSuffix_(row[1]);
    if (!game || !team) return;

    exact[finalRoleGameTeamKey_(game, team)] = team;
    const decorKey = finalRoleGameDecorKey_(game, team);
    if (!decorated[decorKey]) decorated[decorKey] = [];
    if (decorated[decorKey].indexOf(team) === -1) decorated[decorKey].push(team);
  });

  const firstRow = FINALROLE_FIRST_ROW_;
  const lastRow = Math.min(base.getLastRow(), FINALROLE_LAST_ROW_);
  if (lastRow < firstRow) return { changed: 0, checked: 0, reason: 'NO_BASE_ROWS' };
  const count = lastRow - firstRow + 1;

  let checked = 0;
  let changed = 0;
  const repaired = [];

  FINALROLE_SLOTS_.forEach(function(slot) {
    const teamValues = base.getRange(firstRow, slot.teamCol, count, 1).getDisplayValues();
    const gameCol = 22 + slot.number;
    const gameValues = base.getRange(firstRow, gameCol, count, 1).getDisplayValues();

    for (let i = 0; i < count; i++) {
      const rawTeam = finalRoleClean_(teamValues[i][0]);
      if (!rawTeam) continue;
      checked++;

      const teamName = finalRoleStripTeamSuffix_(rawTeam);
      const game = finalRoleCanonicalGame_(gameValues[i][0], rawTeam);
      if (!game || !teamName) continue;

      if (exact[finalRoleGameTeamKey_(game, teamName)]) continue;

      const candidates = decorated[finalRoleGameDecorKey_(game, teamName)] || [];
      if (candidates.length !== 1) continue;

      const canonicalTeam = candidates[0];
      if (finalRoleExactTeamKey_(canonicalTeam) === finalRoleExactTeamKey_(teamName)) continue;

      const rowNumber = firstRow + i;
      const nextValue = finalRoleFormatMembershipTeam_(canonicalTeam, rawTeam, game);
      base.getRange(rowNumber, slot.teamCol).setValue(nextValue);
      changed++;

      if (repaired.length < 20) {
        repaired.push({
          row: rowNumber,
          slot: slot.number,
          game: game,
          from: rawTeam,
          to: nextValue
        });
      }
    }
  });

  if (changed) {
    SpreadsheetApp.flush();
    if (!options.skipMark && typeof markPublicSyncPending_ === 'function') {
      markPublicSyncPending_(
        'team_name_repair:' + String(options.source || 'manual') + ':changed=' + changed
      );
    }
  }

  return { changed: changed, checked: checked, repaired: repaired };
}

function finalRoleStripTeamSuffix_(value) {
  return finalRoleClean_(value).replace(/\s+—\s+(РМ|РК)$/u, '').trim();
}

function finalRoleCanonicalGame_(value, teamRaw) {
  const text = finalRoleClean_(value).toLocaleLowerCase('ru-RU');
  if (text === 'рм' || text.indexOf('royal match') >= 0) return 'Royal Match';
  if (text === 'рк' || text.indexOf('royal kingdom') >= 0) return 'Royal Kingdom';

  const suffix = finalRoleClean_(teamRaw).match(/\s+—\s+(РМ|РК)$/u);
  if (suffix) return suffix[1] === 'РМ' ? 'Royal Match' : 'Royal Kingdom';
  return '';
}

function finalRoleExactTeamKey_(value) {
  let text = finalRoleStripTeamSuffix_(value);
  try { text = text.normalize('NFKC'); } catch (error) {}
  return text.replace(/\s+/g, ' ').trim().toLocaleLowerCase('ru-RU');
}

function finalRoleDecorTeamKey_(value) {
  return finalRoleExactTeamKey_(value)
    .replace(/^[^0-9a-zа-яё]+/iu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function finalRoleGameTeamKey_(game, team) {
  return finalRoleCanonicalGame_(game, team) + '\n' + finalRoleExactTeamKey_(team);
}

function finalRoleGameDecorKey_(game, team) {
  return finalRoleCanonicalGame_(game, team) + '\n' + finalRoleDecorTeamKey_(team);
}

function finalRoleFormatMembershipTeam_(team, previousRaw, game) {
  const cleanTeam = finalRoleStripTeamSuffix_(team);
  const oldRaw = finalRoleClean_(previousRaw);
  const oldSuffix = oldRaw.match(/\s+—\s+(РМ|РК)$/u);
  if (oldSuffix) return cleanTeam + ' — ' + oldSuffix[1];

  // Если старое значение почему-то было без суффикса, сохраняем этот формат.
  // Игра остаётся в W:AA и не переписывается.
  return cleanTeam;
}

'''

before, rest = role.split(START, 1)
_, after = rest.split(END, 1)
role = before + new_block + END + after

# Unified writer already owns the script lock. Before building the snapshot it
# may safely repair only unambiguous decorative-name drift. This is what heals
# the already-existing BUNTARb -> ⚡ BUNTARb case without waiting for another edit.
old_line = "    var stable = MINIAPP_buildStableSnapshot_();\n"
patch = """    var teamNameRepair = { changed: 0, checked: 0 };\n    if (typeof finalRoleRepairDecoratedTeamMemberships_ === 'function') {\n      teamNameRepair = finalRoleRepairDecoratedTeamMemberships_(null, {\n        source: 'unified_snapshot'\n      }) || teamNameRepair;\n      if (Number(teamNameRepair.changed || 0) > 0) SpreadsheetApp.flush();\n    }\n\n    var stable = MINIAPP_buildStableSnapshot_();\n"""
if 'source: \'unified_snapshot\'' not in writer:
    if old_line not in writer:
        raise SystemExit('[ERROR] Unified writer buildStableSnapshot anchor missing; refusing blind patch')
    writer = writer.replace(old_line, patch, 1)

# No schema/search change: snapshot contract is unchanged.
if "var MINIAPP_UNIFIED_SNAPSHOT_VERSION = '1.2.4';" not in writer:
    raise SystemExit('[ERROR] Expected Unified Snapshot 1.2.4 missing; refusing push')
if "var MINIAPP_UNIFIED_SNAPSHOT_SCHEMA = '1.4.2';" not in writer:
    raise SystemExit('[ERROR] Expected schema 1.4.2 missing; refusing push')
if "var MINIAPP_UNIFIED_SEARCH_INDEX_VERSION = '1.1.3';" not in writer:
    raise SystemExit('[ERROR] Expected search index 1.1.3 missing; refusing push')

role_path.write_text(role, encoding='utf-8')
writer_path.write_text(writer, encoding='utf-8')
print('[OK] 07: future team-name edits cascade into all five participant slots')
print('[OK] 07: safe unique decorative-name repair added')
print('[OK] 25: existing decorative drift repaired before unified snapshot build')
print('[OK] Snapshot schema/search versions preserved')
PY

info "Syntax checks"
node --check 07_FINAL_ROLE_FIX.js
node --check 25_MINIAPP_UNIFIED_SNAPSHOT.js
ok "JavaScript syntax OK"

info "Verifying exact patch markers"
grep -F "function finalRoleCascadeTeamRename_(ss, game, oldTeam, newTeam)" 07_FINAL_ROLE_FIX.js >/dev/null
grep -F "function finalRoleRepairDecoratedTeamMemberships_(ss, options)" 07_FINAL_ROLE_FIX.js >/dev/null
grep -F "source: 'unified_snapshot'" 25_MINIAPP_UNIFIED_SNAPSHOT.js >/dev/null
grep -F "var MINIAPP_UNIFIED_SNAPSHOT_VERSION = '1.2.4';" 25_MINIAPP_UNIFIED_SNAPSHOT.js >/dev/null
grep -F "var MINIAPP_UNIFIED_SNAPSHOT_SCHEMA = '1.4.2';" 25_MINIAPP_UNIFIED_SNAPSHOT.js >/dev/null
grep -F "var MINIAPP_UNIFIED_SEARCH_INDEX_VERSION = '1.1.3';" 25_MINIAPP_UNIFIED_SNAPSHOT.js >/dev/null
ok "Patch markers verified"

info "clasp status BEFORE push"
clasp status
ok "clasp status completed"

info "Pushing corrected live Apps Script"
clasp push
ok "clasp push completed"

info "Synchronizing factual live Apps Script mirror back to GitHub"
bash <(curl -fsSL "$REPO_RAW/scripts/sync-live-apps-script-to-github.sh")
ok "apps-script-live mirror synchronized"

verify_snapshot() {
  command -v gh >/dev/null 2>&1 || return 2
  gh auth status >/dev/null 2>&1 || return 2

  local attempt
  for attempt in $(seq 1 16); do
    info "Waiting for existing 5-minute unified snapshot trigger: check $attempt/16"
    if gh api "repos/$DATA_REPO/contents/$DATA_PATH" --jq .content 2>/dev/null \
      | tr -d '\n' \
      | base64 -d 2>/dev/null \
      | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(1)

def low(v):
    return str(v or "").strip().lower()

target_team = None
for team in data.get("teams") or []:
    name = str(team.get("name") or "").strip()
    game = low(team.get("game"))
    if name == "⚡ BUNTARb" and game == "royal kingdom":
        target_team = team
        break
if target_team is None:
    sys.exit(1)

participant = None
for p in data.get("participants") or []:
    if str(p.get("telegramId") or "") != "7328818801":
        continue
    participant = p
    break
if participant is None:
    sys.exit(1)

ok_membership = False
for m in participant.get("memberships") or []:
    if str(m.get("team") or "").strip() == "⚡ BUNTARb" and low(m.get("game")) == "royal kingdom":
        ok_membership = True
        break
if not ok_membership:
    sys.exit(1)

print("[OK] snapshot confirms team: ⚡ BUNTARb / Royal Kingdom")
print("[OK] snapshot confirms participant 7328818801 membership updated")
print("[OK] generatedAt = " + str(data.get("generatedAt", "")))
print("[OK] unifiedSnapshotVersion = " + str(data.get("unifiedSnapshotVersion", "")))
sys.exit(0)
'; then
      return 0
    fi
    sleep 25
  done
  return 1
}

if verify_snapshot; then
  printf '\n\033[32m===========================================================\033[0m\n'
  printf '\033[32m SUCCESS: TEAM RENAME CASCADE IS LIVE AND BUNTARB REPAIRED \033[0m\n'
  printf '\033[32m===========================================================\033[0m\n'
elif [[ $? -eq 2 ]]; then
  warn "gh CLI/auth unavailable; Apps Script push succeeded, snapshot verification skipped"
  printf '\n\033[32m=============================================\033[0m\n'
  printf '\033[32m SUCCESS: TEAM RENAME CASCADE CODE IS LIVE \033[0m\n'
  printf '\033[32m=============================================\033[0m\n'
  printf 'Wait up to 5 minutes for the existing unified snapshot trigger.\n'
else
  warn "Apps Script push succeeded but ⚡ BUNTARb was not observed in snapshot within the polling window"
  printf '\n\033[33m======================================================\033[0m\n'
  printf '\033[33m PUSH OK; BUNTARB SNAPSHOT CONFIRMATION STILL PENDING \033[0m\n'
  printf '\033[33m======================================================\033[0m\n'
fi

printf 'Backups: %s\n' "$BACKUP_DIR"
printf 'Patched: 07_FINAL_ROLE_FIX.js + 25_MINIAPP_UNIFIED_SNAPSHOT.js\n'
printf 'Snapshot contract preserved: unified 1.2.4 / schema 1.4.2 / search 1.1.3\n'
