#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${ROYAL_CRM_PROJECT_DIR:-$HOME/table-chp-1.3}"
REPO="Antonsoloway/Specnaz-mini-app"
BRANCH="v0.6-admin-write"
RAW="https://raw.githubusercontent.com/${REPO}/${BRANCH}"
DATA_REPO="Antonsoloway/royal-crm-data"
EXPECTED_DESC="Таблица ЧП 1.3"
STAMP="$(date +%Y%m%d-%H%M%S)"

ok(){ printf '\n✅ %s\n' "$*"; }
info(){ printf '\n[INFO] %s\n' "$*"; }
warn(){ printf '\n[WARN] %s\n' "$*"; }
fail(){ printf '\n❌ %s\n' "$*" >&2; exit 1; }

command -v clasp >/dev/null 2>&1 || fail "clasp не найден"
command -v gh >/dev/null 2>&1 || fail "gh не найден"
command -v curl >/dev/null 2>&1 || fail "curl не найден"
command -v python3 >/dev/null 2>&1 || fail "python3 не найден"
gh auth status >/dev/null 2>&1 || fail "GitHub CLI не авторизован"
[[ -d "$PROJECT_DIR" ]] || fail "Apps Script каталог не найден: $PROJECT_DIR"
[[ -f "$PROJECT_DIR/.clasp.json" ]] || fail ".clasp.json не найден в $PROJECT_DIR"
cd "$PROJECT_DIR"

info "CLASP STATUS — source уже был pushed; ничего повторно не меняем"
clasp status

info "ИЩЕМ РОВНО ОДИН СТАБИЛЬНЫЙ DEPLOYMENT: $EXPECTED_DESC"
DEPLOY_OUTPUT=""
if DEPLOY_OUTPUT="$(clasp list-deployments 2>&1)"; then
  :
elif DEPLOY_OUTPUT="$(clasp deployments 2>&1)"; then
  :
else
  fail "Не удалось получить список Apps Script deployments"
fi
printf '%s\n' "$DEPLOY_OUTPUT"

mapfile -t MATCHES < <(printf '%s\n' "$DEPLOY_OUTPUT" | grep -F "$EXPECTED_DESC" || true)
[[ ${#MATCHES[@]} -eq 1 ]] || fail "Найдено ${#MATCHES[@]} deployment с точным названием '$EXPECTED_DESC'; ожидался ровно 1. Ничего не изменено."
LINE="${MATCHES[0]}"
printf '[INFO] selected: %s\n' "$LINE"
printf '%s\n' "$LINE" | grep -q '@HEAD' && fail "Строка '$EXPECTED_DESC' неожиданно указывает на HEAD. Ничего не изменено."
DEPLOY_ID="$(printf '%s\n' "$LINE" | sed -E 's/^[[:space:]]*-[[:space:]]+([^[:space:]]+).*/\1/')"
[[ "$DEPLOY_ID" =~ ^[A-Za-z0-9_-]{20,}$ ]] || fail "Не удалось безопасно извлечь deployment ID"

info "ОБНОВЛЯЕМ ТОЛЬКО СУЩЕСТВУЮЩИЙ DEPLOYMENT $EXPECTED_DESC"
DESC="$EXPECTED_DESC"
if clasp update-deployment "$DEPLOY_ID" --description "$DESC"; then
  ok "Existing deployment updated with update-deployment"
elif clasp create-deployment --deploymentId "$DEPLOY_ID" --description "$DESC"; then
  ok "Existing deployment updated with create-deployment --deploymentId"
elif clasp deploy -i "$DEPLOY_ID" -d "$DESC"; then
  ok "Existing deployment updated with legacy deploy -i"
else
  fail "Не удалось обновить существующий deployment. Новый deployment НЕ создавался."
fi

WEBAPP_URL="https://script.google.com/macros/s/${DEPLOY_ID}/exec"
info "NON-MUTATING HTTP CHECK — write.4 router"
ROUTE_OK=0
for i in $(seq 1 10); do
  printf '[INFO] route check %s/10\n' "$i"
  BODY="$(curl -sS -L --max-time 30 \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    --data 'miniapp=1&action=admin-write&backend=1' \
    "$WEBAPP_URL" || true)"
  if printf '%s' "$BODY" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d.get("error")=="INVALID_REQUEST_ID"; assert d.get("version")=="0.6.0-write.4"; print("[OK] write.4 HTTP route live")' 2>/dev/null; then
    ROUTE_OK=1
    break
  fi
  sleep 5
done
[[ "$ROUTE_OK" == "1" ]] || fail "Существующий deployment обновлён, но write.4 HTTP route пока не подтверждён. Не повторяйте команду — пришлите экран."

info "ПЫТАЕМСЯ ОБНОВИТЬ PRIVATE ADMIN SNAPSHOT СРАЗУ"
if clasp run MINIAPP_exportAdminSnapshotToGitHub >/tmp/royal-v0600-admin-snapshot-run.txt 2>&1; then
  cat /tmp/royal-v0600-admin-snapshot-run.txt
else
  warn "clasp run недоступен — это не ошибка; ждём штатный 5-minute trigger."
fi

info "ЖДЁМ WRITE.4 SNAPSHOT + PHOTO + RENAME CLEANUP + REVISIONS"
SNAPSHOT_OK=0
for i in $(seq 1 24); do
  printf '[INFO] snapshot check %s/24\n' "$i"
  if gh api -H 'Accept: application/vnd.github.raw+json' "repos/${DATA_REPO}/contents/admin-snapshot.json?ref=main" 2>/dev/null \
    | python3 -c 'import json,sys; d=json.load(sys.stdin); a=d.get("adminData") or {}; w=a.get("write") or {}; p=w.get("teamPhoto") or {}; ps=a.get("participants") or []; ts=a.get("teams") or []; ops=set(w.get("operations") or []); assert w.get("enabled") is True; assert w.get("version")=="0.6.0-write.4"; assert w.get("transport")=="worker-signed-hmac"; assert w.get("deleteEnabled") is False; assert p.get("enabled") is True; assert p.get("renameCleanup") is True; assert int(p.get("maxUploadBytes") or 0)>=500000; assert {"updateParticipant","createParticipant","updateTeam","createTeam"}.issubset(ops); assert ps and ps[0].get("revision"); assert ts and ts[0].get("revision"); print("[OK] final snapshot:",len(ps),"participants,",len(ts),"teams; HMAC=YES; PHOTO=YES; RENAME_CLEANUP=YES; REVISIONS=YES")' 2>/dev/null; then
    SNAPSHOT_OK=1
    break
  fi
  sleep 15
done
[[ "$SNAPSHOT_OK" == "1" ]] || fail "write.4 route live, но private admin snapshot ещё не подтверждён. Не повторяйте установку — пришлите экран."

info "СИНХРОНИЗИРУЕМ ФАКТИЧЕСКИЙ LIVE APPS SCRIPT В WRITE-BRANCH"
bash <(curl -fsSL "$RAW/scripts/sync-live-apps-script-to-write-branch-final.sh")
ok "Factual live Apps Script mirror synced to $BRANCH"

printf '\n============================================================\n'
printf '✅✅✅ V0.6 WRITE.4 BACKEND READY ✅✅✅\n'
printf 'Stable Apps Script deployment preserved: %s\n' "$EXPECTED_DESC"
printf 'Web app URL preserved: %s\n' "$WEBAPP_URL"
printf 'HTTP write.4 route: CONFIRMED\n'
printf 'Admin snapshot: HMAC / photo / rename cleanup / revisions = CONFIRMED\n'
printf 'Other versioned deployments: UNTOUCHED\n'
printf 'No participant/team record was changed by these checks.\n'
printf '============================================================\n'
