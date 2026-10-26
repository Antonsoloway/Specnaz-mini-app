# Incident: Specnaz awards missing from CHP mini-app (2026-10-26)

## Impact and recovery
- Five missing Specnaz awards for 2026-10-24 were verified against approved Telegram source messages and restored exactly once in the Royal CRM admin workbook.
- Restored five +1 counters in `База участников`, five history rows in `История спецназа`, and synchronized the corresponding public workbook.
- Verified mini-app GitHub data snapshot for 2026-10-26 contained all **24** current-period awards and updated participant counters. No need to republish the mini-app frontend.
- **Do not reapply historical +1s** without checking the original Telegram source links and the current counters. Identifiers and private participant details are intentionally omitted from this public document.

## Webhook architecture (do not conflate)
1. ChatKeeper sends structured `activity_base` and `activity_outside` webhooks; both must continue to increment their respective CRM activity counters.
2. ChatKeeper sends separate `reputation` webhooks when moderators approve a Specnaz visit.
3. A separate Telegram relay can send raw Telegram updates to the shared Apps Script ingress. Such raw updates may be classified `stat` and rejected as `WRONG_SECRET`; this alone is **not evidence** that ChatKeeper's secret is wrong.
4. The Apps Script `05_RELIABLE_WEBHOOK_QUEUE.js` saves incoming requests into Script Properties and/or Google Sheets queue, then the minute-trigger processor invokes `01_CORE_MAIN.js` and writes to CRM.
5. The public Google workbook and GitHub private `royal-crm-data/snapshot.json` are downstream consumers, not primary award sources.

## Evidence
- The five missed awards had approved message reactions, yet did not have matching processed `reputation` events in the inspected webhook journal.
- Both successful `reputation` events and temporary `RETRY_LOCKED` results existed nearby. This does **not** prove a particular cause for the five missing outbound requests.
- `WRONG_SECRET/stat` records commonly contained raw Telegram update envelopes, not ChatKeeper `reputation` payloads.
- The queue contains successful `activity_base` and `activity_outside` requests; do not isolate or suppress these.
- An independent, documented durability defect was discovered: if **both** primary queue and emergency property storage fail, immediate fallback could return an application-level `RETRY_LOCKED/ERROR` inside an HTTP-success response, falsely acknowledging an uncommitted request.

## Changes released
- [PR #93](https://github.com/Antonsoloway/Specnaz-mini-app/pull/93): dedupe restored / replayed awards by Telegram ID plus source-message URL, not only the webhook event hash.
- [PR #94](https://github.com/Antonsoloway/Specnaz-mini-app/pull/94): fail closed on transient direct-fallback failures if both durable queues fail.
- **Apps Script deployment** (existing, unchanged deployment ID) moved from immutable version **123** to **124** on 2026-10-26. Existing endpoint and ChatKeeper config were not changed.
- Runtime source was pulled independently at @HEAD and @123 before deployment. Live @123 and GitHub main differed in exactly these two file changes: `01_CORE_MAIN.js` and `05_RELIABLE_WEBHOOK_QUEUE.js`.
- Created version 124, redeployed the existing webapp, then re-pulled @124 and verified 41/41 files against the staged build; only the two approved files differ from @123.
- 18 isolated regression test cases passed: 4 award-idempotency cases and 14 reliable-queue / activity-routing cases. Both `activity_base` and `activity_outside` routing preserved.
- Live GET `/exec` returned 200 with `Royal CRM webhook v2.2.6 is alive` before and after deployment.
- Readback of the queue showed recently successful `activity_outside` events after the incident; a true new award had not yet been observed after deploying @124.

## Remaining unresolved
- **Root cause of those five missing ChatKeeper outbound requests is not proven.** Need ChatKeeper's delivery history for those approval events: target URL, request time, HTTP status, response body, timeout/retry records and any dead-letter queue.
- No claim of guaranteed end-to-end no-loss until a real `reputation` round-trip has been observed on version 124, including the queue, CRM history and updated private snapshot.
- No automatic reward of Telegram reaction-only events has been deployed. Experimental recovery code in an unmerged branch remains disabled and must not be conflated with ChatKeeper activity webhooks.
- The `clasp run getReliableWebhookQueueStatus` invocation did not return a status: Google Apps Script API gave `NOT_FOUND`. Manual read-only Sheet inspection plus deployment inventory and HTTP health worked.
- Monitor backlog `PENDING/RETRY/FAILED`, delivery response rates, and snapshot lag. Only source-verified missed awards should be recovered.

## Rollback and release constraints
- Rollback target: immutable Apps Script version **123** on the **same existing deployment**. Do not create a new production URL or rotate the ChatKeeper secret as part of this fix.
- Save the complete live @123 and @124 manifests before any further deployment. Prior backup stored in ephemeral Shell `/tmp/specnaz-live-audit-20261026`; do not assume it survives a Shell reset.
- Never remove the `activity_base`, `activity_outside`, `screens`, `join`, `leave`, or `reputation` handlers to avoid noisy raw Telegram `stat` events.


## Queue performance follow-up — Apps Script @125 (2026-10-26)

- The admin spreadsheet was inspected through its native metadata and CellData: **20 tabs**, including hidden `Очередь вебхуков` (12 columns), `Обработанные события`, and `Лог активности`. The separate public workbook has 14 tabs and does not consume ChatKeeper webhooks directly. Formulas in base `T` and `W:AA`, live award counters `U`, and activity columns `AC:AD` were inspected; **no spreadsheet cell, formula, row, column, or tab was altered for this update**.
- The legacy once-per-minute processor transferred 9 columns of the entire `Очередь вебхуков` (over 15,000 historical rows) and additionally read 7 columns over the whole queue to recover stale `PROCESSING` rows.
- [PR #95](https://github.com/Antonsoloway/Specnaz-mini-app/pull/95), squash `aa7f1fd7b40d8aff8cbfe30390dc08ba4bdbffbf`: search only exact unfinished statuses `PENDING`, `RETRY`, `PROCESSING` in status column C with server-side Sheets TextFinder. Fetch A:I only for matching rows. Preserve ascending physical row numbers, per-Telegram-ID FIFO and blocked user semantics.
- For stale `PROCESSING`, read only its timestamp in column I; if expired, write `RETRY` to C and the timestamp to I, **without rewriting all C:I**. Existing 30-event batch, time budget, cleanup, retries, locks, emergency persistence, business event classification and incoming webhook path are unchanged.
- Independent tests in Cloud Shell passed: **6 queue-scanning scenarios + 14 durability/fallback tests + 4 award deduplication tests = 24 passing cases**. Cases cover same-user ordering, active/stale processing locks, retries, attempt exhaustion, activity events, empty queues and no whole-sheet scans.
- Before deployment, fresh Apps Script @HEAD and immutable @124 contained the same 41 files. Staged version differed **only** in `05_RELIABLE_WEBHOOK_QUEUE.js`. Pushed the exact files, created immutable version **125**, and updated the **same existing** webapp deployment ID (previously @124) on 2026-10-26.
- After publication: `clasp deployments` confirmed @125, live `/exec` returned HTTP 200 and `Royal CRM webhook v2.2.6 is alive`, immutable @125 was pulled independently and verified **41/41 files equal to the staged release**, **only queue file differs from @124**.
- The live queue's two recently added `stat` rows at Moscow 19:20–19:21 transitioned from `PENDING` to `REJECTED` on the new processor. This shows queue progression after release; it is **not** a proof of a new `reputation` event. Prior manually recovered five award entries still appeared in the admin history, 24 rows in the current period.
- **Rollback:** redeploy immutable @124 to the existing deployment ID, without changing the webapp URL, Secrets or spreadsheet structures.
- **Remaining limitation:** all recovery and prioritization start *after the request reaches Apps Script*. Missing outbound requests or HTTP errors at ChatKeeper still require ChatKeeper delivery logs/retries to diagnose. Avoid any guarantee that zero new awards can be missed upstream.
