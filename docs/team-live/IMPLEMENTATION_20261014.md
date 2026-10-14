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
Mobile browser and deployment evidence recorded below when available.

## Deployment

Pending. Existing Apps Script deployment must be updated in place; preserve all unrelated
live files (including live-only isolation/watchdog files), secrets, bot routes and triggers.
Never overwrite live from an old repo checkout. Publish new worker route before frontend.
No watches, captures or game/session changes are authorized by this feature.
