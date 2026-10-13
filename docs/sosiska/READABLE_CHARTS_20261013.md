# Readable mobile charts and live AI check

Module 0.5.1, release `20261013-v061-sosiska-activity2`.

User requested: omit snapshot players with no activity, larger colorful and understandable charts, close previous player chart when selecting another (confirmed explicitly).

Snapshot view filters by positive Level/Crown/HelpCount growth, retaining joins/leaves separately. Roster and whole-period statistics remain available. Charts use a mobile-sized SVG coordinate system, five labeled grid lines, clock/date axis labels, connected interval steps with colored fill, latest/mean/peak values and expandable observed interval values. Missing intervals are not connected. A colored 24-cell Moscow hourly grid displays values and distinguishes missing observations. Selected player's chart opens inside its own card and scrolls into view; at most one player chart is open.

Running AI UI now says snapshots are loaded and explains phase (reading / analyzing / combining / comparing), since a snapshot counter alone did not show progress through baseline chunks and hierarchical reduction.

Validation: 88 Node tests pass. Chromium at 390px: document width 390px, player and comparison controls functional; screenshots inspected. Main Worker logic unchanged in this UI patch.

Remote Desktop Commander reconnected. Production provider probe using existing server-side `SOSISKA_GROQ_KEYS` pool: 21 configured keys; first probed key returned HTTP 200, finish_reason stop and nonempty content from GPT-OSS 120B. Actual all-watched job `6f0bc656-84c7-45a1-bc1b-b970d89b2f5d` started. Old job `e6fcbd9d-2e0f-4404-8eff-71ed049bf2bc` failed with legacy generic `ANALYSIS_PROVIDER_UNAVAILABLE`, 5 loaded snapshots and no diagnostics, so its exact reason cannot be recovered from that status. New job passed history chunks and entered reduction for all 27 snapshots of FORTUNA with no errors at checkpoint. **Do not equate this checkpoint with completed full-history acceptance.**

Private diagnostics/acceptance checkpoint on remote device: `/home/soloway3852/sosiska-auth-private/ai-check-20261013/status.json`; log `/home/soloway3852/sosiska-auth-private/ai-diagnose-progress.log`; controller `/home/soloway3852/sosiska-auth-private/diagnose-ai-20261013.py`. Controller adds a nonce/TTL protected diagnostic wrapper preserving normal routes and original exports, then restores exact original modules and settings and deletes diagnostic and old transfer secrets in finally. Verify RESTORED_NORMAL_ENTRY and absence of SOSISKA_DIAG_SECRET / SOSISKA_KEY_TRANSFER before declaring cleanup complete. No key values are printed or committed. Do not read private session.json contents into tool output.

If final reduce fails with 413, inspect safe diagnostics and shrink deterministic final period serialization before re-running; do not replace full history with two snapshots. Existing running task can continue autonomously after wrapper cleanup. Level updater stays deferred.
