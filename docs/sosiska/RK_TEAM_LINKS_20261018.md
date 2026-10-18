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

## Verified publication

Published source merge1168b4e3b111faeb81eba1ee49bb8c63167eabb0, PR78. Main CI39158906368 and Pages39158906442 PASS; Workers Builds58f02fe7-a7bf-4038-a032-a0418759953a PASS. The two Apps Script candidate files matched the fresh live baseline before patching; existing deployment is now version123. Post-deploy clasp pull matches reviewed files; standard full mirror sync67b9c2a updated apps-script-live and its SHA manifest.

Manual Worker versionea2b1479-3870-4b7b-94a2-2e00ec6395a2 retained all18 pre-existing bindings. Main build then published version5bc96f80-1622-4543-9a6f-9582db518e61. Public app/index/entry/changelog/admin editor/Sosiska/card/helper assets (nine files) match source bytes. Worker health200; RK public/admin live routes correctly401 without a session.

152 Sosiska/asset tests,32 admin tests, workerd/isolation and all browser regressions PASS. New real-form fixture runs under all entry CSS at320/390/768. A release test initially expected the previous v0.6.5 target; updated that explicit expectation and added v0.6.6 changelog/entry validation before the successful CI.

An optional Apps Script API execution of admin snapshot refresh returned storage NOT_FOUND; it is not a successful refresh receipt. Web App deployment123 is separately verified by deployment listing and pulled source. No additional CRM writes or invented team binding were used for acceptance. Owner still verifies authenticated save/reopen in native Telegram.

Current status: v0.6.6 published; Telegram behavioral acceptance pending.
