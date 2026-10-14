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
