# RM team links and live card — 2026-10-14

Owner scope: reuse Sosiska search/combined filters in RM create/edit; store game team ID,
fill editable CRM name, preserve uploaded screenshots and existing Sheets media.
Live card shows leader first, then co-leaders, maximum four total. No monitoring implied.

## Source

- `sosiska-v061.js`: modal picker reuses the exact search/filter/hydration implementation.
  It leaves the underlying CRM editor/photo draft intact and never calls list/watch/history.
- `admin-write-v0600-v3.js`: capability-gated gameTeamId editor and same signed write request.
- `team-live-v061.js/css`: mobile game-style card; original screenshot toggle; CRM members remain below.
  Unknown avatars are not invented, initials/icons are decorative.
- `worker/src/team-live.js`: `/team-live` authorizes with current `/snapshot`, `/admin-team-live`
  with current `/admin-data`; caller chooses CRM name+game, never arbitrary game ID.
  Credentials server-only; getTeamInfo only; 60-second per-team cache/singleflight;
  explicit stale fallback up to 24h if still authorized and still linked.
- `worker/src/entry-v1330.js`: optional RM gameTeamId survives public sanitization.
- `apps-script/team-live/`: deployment candidates, NOT a live mirror until installed.
  Four fresh-source copies (28/29/33/25) + helper 38.
  `Команды!M` source field is text with exact header `ID команды RM`.
  Occupied/header/formula collision fails closed. A:D photo/source and E:L formulas preserved.
  Existing full-row moveRows preserves M. Delete/create rollback clear owned M only.
  Non-empty ID participates in optimistic revision; unlinked teams retain old revision.

## Validation

117 Node tests PASS (103 existing + 14 additions), Worker bundle 334.3KB,
5 real SQLite/alarm/cold-start checks and 32 route-isolation checks PASS.
Live pull hashes of files 28/29/33/25 match source candidates' baseline.
Mobile Chromium fixture PASS at 320/390/768px: no horizontal overflow, maximum four,
picker uses real filters, photo/form draft preserved, Back/rerender restores working
refresh/toggle handlers, revoked access clears the card, zero page errors.
Reviewed 390px screenshot and corrected wrapped crown values; decorative SVG icons
render consistently without relying on emoji fonts. Real Telegram/device smoke pending.
Optional snapshot contract: Unified writer 1.2.8 / schema 1.4.3 / search keys 1.1.3.
Installer: scripts/install-team-live-apps-script.sh checks fresh baseline SHA before
copying candidates and updates an explicitly supplied existing deployment only.

## Publication block

Automatic approval review rejected `git push -u origin sosiska-team-live-20261014`:
implementation authorization was deemed insufficient for public source/documentation
publication. No bypass attempted. Remote branch is absent; main is unchanged by this
work. Explicit owner publication approval is required before pushing this prepared code.
Cloud Shell connection and live baseline read are verified; no live push/deployment
or Sheet data mutation occurred. Source remains locally committed for review.

## Deployment

Pending. Existing Apps Script deployment must be updated in place; preserve all unrelated
live files (including live-only isolation/watchdog files), secrets, bot routes and triggers.
Never overwrite live from an old repo checkout. Publish new worker route before frontend.
No watches, captures or game/session changes are authorized by this feature.


2026-10-14 owner explicitly approved public publication and rollout. Branch published
and PR51 created. Source e0202ca: Sosiska CI38626711844/38626722868 success,
Cloudflare preview Build8c0c7baa-c44b-462c-ba51-2441c612e20f success.
Earlier publication block is resolved. Production rollout is in progress.


## 2026-10-14 — RM ID binding and live leadership cards deployed

Owner explicitly approved publication and rollout. PR51 merged as
08d93956af047bcc8bc75f3430163f523c86e09b; final source5b623c4 had both Sosiska
CI38627102983/38627111014 success, including118 Node tests and37workerd checks.
Mobile fixture320/390/768px PASS; no overflow, max4leader/co-leaders, Back restored,
photo/form draft preserved, revoked-session removal. Real Telegram acceptance remains owner-side.

Existing Apps Script deployment pinned in live private adminData was updated in place
to version117; URL unchanged. Fresh pull before installation matched the reviewed
25/28/29/33baseline; live-only90/99and all unrelated source were preserved.
New38helper and four candidate files installed. M is an optional text source field
with collision/formula guard and header created on first explicit ID write.
No team IDs, watches, captures, bots, webhook URLs or game progress changed by this work.

Live derived data: admin snapshot2026-10-14T19:53:52.013Z advertises
write.gameTeamLink.enabled=true/gameRoyalMatch/version1.0.0; public snapshot
2026-10-14T19:53:34.816Z schema1.4.3/writer1.2.8/search1.1.3.
The successful scheduled refresh supersedes the unsuccessful clasp run attempt,
which returnedNOT_FOUND and was not used as evidence.

Live Worker healthHTTP200/version1.41.0retained. New routes verified by exact
400INVALID_REQUEST(other game),405METHOD_NOT_ALLOWED(POST),204OPTIONS,
401SESSION_MISSING and403ORIGIN_DENIEDresponses. Existing metadata version is
unchanged by this isolated wrapper. Cloudflare management deployment ID was not
read: available OAuth metadata requests returned401/403; no login/secret change attempted.
Frontend app-v0600 actually serves team-live-v061.js/css and the updated picker/editor.
Two redirects preserve Telegram hash and set releaseBuild20261014-v061-team-live1.

Full live mirror synced through the project's normal script as
125e655841d741a38024e1fef96f7cd981454578; both mainCI runs success.
Earlier publication/rollout-pending notes are historical and superseded.


## 2026-10-14 — picker overlay regression fix (source ready)

Owner reported the Find and Bind button appeared dead inside the CRM editor.
Exact cause: the admin modal uses z-index99999; picker backdrop used20000 and
opened underneath it. Earlier browser fixture directly invoked pickTeam without
the real editor backdrop, so it missed the bug. Fix: picker uses100010, blurs the
old active control, and the link button uses the existing admin button styling.
Release marker20261014-v061-team-picker2; no backend, table, bot or agent changes.
118Node testsPASS. Regression browser now uses real editor CSS, modal markup,
window capture routers and Android/iPhone touch handlers; taps the actual button,
checks elementFromPoint owns the visible search, cancels/reopens, filters and binds
while preserving the draft/photo. Publication/runtime evidence follows below.
