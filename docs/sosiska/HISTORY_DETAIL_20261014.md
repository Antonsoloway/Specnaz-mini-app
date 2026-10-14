# Sosiska history detail, 2026-10-14

Watch intervals accept 5–10080 minutes throughout UI, facade and native monitor; existing intervals and default 60 minutes are preserved. Five-minute sampling produces 288 snapshots per day per team. No new watches or captures are triggered during rollout.

Each player hour cell opens an MSK calendar-day table for the selected metric. Counter deltas use the same uniform allocation as the aggregate grid. Null/reset and missing observations remain unknown. Partial hours display actual covered minutes. Changing player or metric closes the detail.

Team export uses inclusive MSK calendar dates, converted to a half-open UTC range. An authorized admin mints a purpose-scoped HMAC capability valid 10 minutes using the existing SESSION_SECRET. The download contains only one exact team and range; game/session credentials are never embedded. Native Telegram downloadFile is supported, with an HTTPS attachment fallback. Export streams immutable descending records from a pinned head, reads at most 20 records per pull and does not invoke the game. The preceding snapshot is clearly outside records, for boundary context. Missing records/team mismatch/invalid times abort the stream; complete:true appears only on success. No truncation limit or additional storage/binding is introduced.

Validation: 139 native tests, 81 Sosiska tests, 22 existing admin tests; CI also checks actual workerd facade compatibility and native worker. Existing reset protections and hourly estimation apply.

Mobile Chromium acceptance at width 390: 801 snapshots, zoom/pan/pinch, selected hour day table, metric close/reset, date selection, signed URL preparation and native downloadFile invocation all passed without page errors or overflow.
