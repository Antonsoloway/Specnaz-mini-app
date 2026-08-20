#!/usr/bin/env bash
set -Eeuo pipefail

RAW_INSTALLER="https://raw.githubusercontent.com/Antonsoloway/Specnaz-mini-app/v0.6-admin-write/scripts/install-v0600-admin-write-final.sh"
DATA_REPO="Antonsoloway/royal-crm-data"
TMP="$(mktemp /tmp/royal-v0600-admin-write-final.XXXXXX.sh)"
cleanup(){ rm -f "$TMP"; }
trap cleanup EXIT

printf '[INFO] Royal CRM v0.6 FINAL write.4 installer\n'
printf '[INFO] This runner does not mutate participant/team rows during installation checks.\n'
printf '[INFO] Downloading v0.6 FINAL admin-write installer...\n'
curl -fsSL "$RAW_INSTALLER" -o "$TMP"

printf '[INFO] BASH SYNTAX PREFLIGHT\n'
bash -n "$TMP"
printf '✅ FINAL INSTALLER SYNTAX OK\n'

bash "$TMP"

printf '\n[INFO] FINAL CAPABILITY CHECK: write.4 + HMAC + photo + rename cleanup\n'
FINAL_OK=0
for i in $(seq 1 12); do
  printf '[INFO] final capability check %s/12\n' "$i"
  if gh api -H 'Accept: application/vnd.github.raw+json' "repos/${DATA_REPO}/contents/admin-snapshot.json?ref=main" 2>/dev/null \
    | python3 -c 'import json,sys; d=json.load(sys.stdin); a=d.get("adminData") or {}; w=a.get("write") or {}; p=w.get("teamPhoto") or {}; ps=a.get("participants") or []; ts=a.get("teams") or []; ops=set(w.get("operations") or []); assert w.get("enabled") is True; assert w.get("version")=="0.6.0-write.4"; assert w.get("transport")=="worker-signed-hmac"; assert w.get("deleteEnabled") is False; assert p.get("enabled") is True; assert p.get("renameCleanup") is True; assert int(p.get("maxUploadBytes") or 0)>=500000; assert {"updateParticipant","createParticipant","updateTeam","createTeam"}.issubset(ops); assert ps and ps[0].get("revision"); assert ts and ts[0].get("revision"); print("[OK] FINAL SNAPSHOT:",len(ps),"participants,",len(ts),"teams; HMAC=YES; PHOTO=YES; RENAME_CLEANUP=YES")'; then
    FINAL_OK=1
    break
  fi
  sleep 10
done

if [[ "$FINAL_OK" != "1" ]]; then
  printf '\n❌ FINAL CAPABILITY CHECK FAILED\n' >&2
  printf 'Не запускайте установку повторно. Пришлите этот экран — source/deployment уже могли обновиться, нужна только диагностика snapshot.\n' >&2
  exit 24
fi

printf '\n============================================================\n'
printf '✅✅✅ V0.6 WRITE.4 FULL BACKEND READY ✅✅✅\n'
printf 'Admin snapshot: write.4 / HMAC / photo / rename cleanup / revisions = CONFIRMED\n'
printf 'No participant or team was changed by the installation checks.\n'
printf 'Next step: merge preview branch and verify Worker + app-v0600 as admin.\n'
printf '============================================================\n'
