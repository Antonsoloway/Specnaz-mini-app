# Activity, charts, selected comparisons and provider diagnostics

Requested: repair AI analysis; sort snapshot/period players by activity; show team and player activity over time, time-of-day profile, compare selected teams. Production release marker: `20261013-v061-sosiska-activity1`, module 0.5.0.

## Behavior
- Period rank follows selected metric: Level growth, Crown growth or HelpCount growth. Units are never summed to infer completed rounds. Roster retains game-style Level+Crown ordering.
- Snapshot changes rank by positive Level, Crown and HelpCount changes. Members with no counter changes appear afterwards. Flat Level in league is not proof of inactivity.
- Team and player charts display observed interval tempo. Clicking a player opens its own series and 24-hour Moscow-time profile. Hour bins prorate interval gains uniformly, explicitly an estimate rather than exact login/play times. Invalid and reset metrics do not acquire false zero-rate observations.
- Choose 2–5 teams from watched teams or search results. Comparison loads stored history only, finds overlap and uses whole observed intervals within it. Actual coverage/dates and separate Level/Crown rates are shown. A missing/one-point history cannot produce a comparison. AI can analyze exactly selected IDs. Navigation/auth reset clears selected data.
- At most 512 points per series; oldest adjacent intervals merge, preserving totals. Entire merged intervals within common comparison window count; boundary-crossing intervals do not. Hourly profiles and all-period totals retain full history.

## AI remediation and remaining acceptance
Provider previously collapsed 400/401/403/413 into `ANALYSIS_PROVIDER_UNAVAILABLE`, hid detail, and could repeat indefinitely. Now classifications are actionable, diagnostics contain only HTTP status counts (no raw bodies, headers, keys or game data), and retry attempts stop after five errors. Successful steps reset retry counters. Status includes phase, next attempt and retry count.

Chunk size reduced from 16000 to 6000 characters; summary reduction batches reduced from 24000 to 6000; completion limit 2048 with documented GPT-OSS `reasoning_effort: low`. Final deterministic period input omits charts; comparative overall input includes textual reports rather than duplicate statistics. GPT-OSS 120B remains the model, using existing server-side key pool. No bot source, keys, watches or game accounts modified.

**Exact live provider failure remains unverified.** Remote Desktop Commander device was offline during work. Actual Groq requests with deployed secrets cannot be made from this local environment. Do not claim live AI success based on fixture tests. After device returns: inspect sanitized job diagnostics, verify existing SOSISKA_GROQ_KEYS secret and model, run actual full-history acceptance through authorized admin endpoint, and confirm `done` with nonempty reports for both teams. Previous key-transfer cleanup acceptance record is in KEY_POOL_CONNECT_20261013.md; verify temporary secret cleanup. Existing jobs retain stored chunks; a new run after failure creates new smaller chunks. Level updater remains deferred.

## Verification
86 Node tests pass, including activity ranking, resets, hourly totals, bounds, common-period comparison, selected-scope validation and authorization, mobile UI actions, escaped names, finite retries and provider classifications. workerd SQLite/alarms/cold-start full-history check: 5 checks pass. Legacy route/isolation verification: 32 checks pass. These use simulated provider responses, not production credentials.
