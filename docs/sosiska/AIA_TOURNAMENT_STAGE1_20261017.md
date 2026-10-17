# Aia tournament data — Mini App stage 1 (2026-10-17)

## Purpose
Keep the primary Sosiska search, roster, watch and snapshot session unchanged. Use the isolated Aia event Worker exclusively for live team tournament reads. Admin access and API credentials remain server-side.

## Verified upstream
Aia event endpoint `https://specnaz-royal-match-events-stage1.soloway3852.workers.dev/v1/invoke`: `getTournamentGroup` returns a 20-team current group for a selected team; `getTeamTournament` returns verified player UserIds, individual scores, team score, event/group IDs and observation timestamp. An unavailable native `-1` score is represented as null, never zero. Aia's own team was changed to closed Specnaz AI (4314384682); current read-only cloud checks for external tournament group and team players succeeded after that change.

## Mini App implementation
- Authenticated admin route `/admin-agent` accepts `tournamentGroup {teamId}` and `tournamentPlayers {teamId}`, no credentials or event IDs from the browser.
- The backend invokes the separate Aia Worker with `RM_EVENT_API_KEY` (Cloudflare secret, not committed); it does not replace the primary key/session and does not automatically start monitoring.
- Response whitelisting validates event ID, group/team IDs, player IDs, bounds, score values, and the `-1` sentinel. The UI escapes all names.
- A new `Командный турнир` action opens the 20-team group and allows opening personal scores for any team in that group. The group must still match on event and group when player scores are returned.
- Data shows the observation time, **not** verified server freshness. Scores in different observation windows are not silently combined.

## Release boundary
This is **source-only until CI, secret provisioning, browser acceptance and deployment have been verified**. Do not claim visible production availability based only on local tests. Set `RM_EVENT_API_KEY` only on the proper `royal-crm-miniapp-api` Worker account and retain existing `RM_AGENT_API_KEY`. No token should appear in browser JS, GitHub files or logs.

## Next stage — history
The primary Sosiska monitor currently persists team member Level, Crown and HelpCount only. This Mini App stage **does not yet persist Aia scores in manual or scheduled snapshots**. A future additive monitor change must:
1. During both manual and scheduled captures, fetch the selected team's tournament group + verified players from the event sidecar with bounded timeouts, without blocking normal team snapshots if the event reader fails.
2. Store eventId, groupId, observedAt, teamScore, group standings and individual player scores with explicit unavailable markers, plus a validation status.
3. Compare team/player deltas only when previous and current observations have the same eventId, groupId and exact team/player IDs, and both numeric scores are known. Treat decreases, resets, unavailable scores and tournament changes as non-progress.
4. Preserve historical v1 snapshots and do not backfill scores. Update period aggregation / analysis only after the primary agent deployment passes tests and cloud acceptance.

## Verification
Local: new 5 API tests and a browser VM test (existing admin UI suite) pass. Existing API/UI suites also pass. The full repository test invocation has unrelated pre-existing failures and must be reviewed before production release.
## Stage 2 source integration (17 October)
Private agent branch: https://github.com/Antonsoloway/Specnaz-ai/tree/feat/aia-tournament-snapshots-20261017

The primary Sosiska monitor has an additive **optional** Aia event sidecar on every manual and scheduled capture. It stores tournament event/group IDs, team standings, individual scores, unavailable markers and safe per-interval deltas. It does not alter the primary gaming session or old v1 history. The mini-app journal now displays those observations; the full-period view sums only confirmed adjacent increases inside the same event and group, with unknown/restart intervals explicitly excluded. This section supersedes the earlier «Next stage» implementation list, which remains as a historical plan.

**Not deployed:** both Workers still require sidecar secret provisioning, passing CI, canary acceptance and a verified release. No live tournament snapshot history has been claimed.
