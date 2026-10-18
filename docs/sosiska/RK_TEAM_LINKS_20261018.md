# RK team ID links — 18 October 2026

## Implementation

Frontend v0.6.6 uses the selected canonical game to choose the existing Sosiska picker and retains its filters, editor and photo draft. Changing game in a new-team form clears the old ID. Selection prefills the editable name. Existing game remains immutable.

Server reads the authorized current CRM binding before every cache hit. Agent endpoint/key and cache identity include game. RK card uses native Score, MinCup, IsOpen, Cup, own emblem 0–183, star count and the current roster help sum. Only the leader and current co-leaders are shown, leader first, unique, max four. Existing CRM members and screenshot remain available. No monitoring is activated.

Sheet uses existing text M and legacy header `ID команды RM`, scoped by game in A. No header migration or new columns. ID is revision-protected, persists on rename and can be cleared. Candidate changes: `apps-script/team-live/33_MINIAPP_ADMIN_WRITE_FINAL.js` and `38_MINIAPP_TEAM_LIVE.js`. Do not copy the older full candidate directory over live.

## Validation

20 targeted Node tests PASS, complete Sosiska suite 151 PASS before final release metadata. Native RK search/roster projection read from the connected workstation confirms real Score, MinCup, IsOpen, Star and Cup fields. The screenshot reference has multiple same-named teams; none was bound automatically. Browser checks and CI results will be recorded in the PR. Owner performs native Telegram acceptance.

## Rollout

1. Complete CI for the exact reviewed source.
2. In the connected authorized Cloud Shell run `scripts/install-rk-team-links-apps-script.sh SOURCE_REPO LIVE_CLASP_PROJECT EXISTING_DEPLOYMENT_ID`. It backs up/pulls, verifies both live baselines, patches only two reviewed files, syntax-checks, shows clasp status, pushes and updates the existing deployment.
3. Pull and sync the actual live mirror and manifest. Verify metadata games include both RM/RK and a normal protected save.
4. Deploy reviewed Mini App Worker with existing bindings/vars/secrets preserved and publish v0.6.6 via the established main/Pages route after CI PASS. Verify served entry/assets and Telegram authorization hash preservation.
5. Owner: edit RK team, search with filters, bind/save, reopen public/admin card, verify leader/helper order and screenshot toggle.

Current status: source prepared, Cloud Shell offline at preparation; no claim of v0.6.6 live deployment.
