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


## ChatKeeper exported journal audit — 2026-10-26

Read-only audit of the user-provided ChatKeeper CSV `Journal_of_ЧАТ_ПОБЕДИТЕЛЕЙ🪖.csv` (CSV file **not** committed, contains participants' personal and message data). Export includes 1,800 journal records, covering 2026-10-19 11:22:41 through 2026-10-26 19:23:56 by recorded journal time.

- Exactly **24** entries are `Установлена реакция на сообщение`, `Сработал триггер`, `Репутация спецназа`: 16 on Oct 24, 4 on Oct 25, 4 on Oct 26. All have unique target Telegram IDs.
- Cross-check against live admin `История спецназа` rows 318–341 confirms **24/24 target Telegram IDs** present, once each; **19** normal `Webhook: reputation` rows and **5** `Manual recovery: approved 🆒 reaction` rows.
- The five historically missing awards had journal trigger records:
  - 2026-10-24 09:39:01, journal record `582188452`
  - 2026-10-24 13:44:46, journal record `582188678`
  - 2026-10-24 16:24:23, journal record `582188809`
  - 2026-10-24 18:21:20, journal record `582188981`
  - 2026-10-24 18:37:56, journal record `582189013`
  (Deliberately omit user identities/Telegram IDs from the public report.) **DO NOT double-award these.**
- **Six separate journal entries show actual trigger execution errors for activity, never for `Репутация спецназа`**:
  - Oct 19, 16:33:57 — `Таблица активность вне базы`: `Stream was closed` (journal `582185629`)
  - Oct 21, 14:17:34 — `Таблица активность вне базы`: `Invalid status: actual:UNKNOWN, expected:OK` (journal `582186633`)
  - Oct 22, 14:26:12 — `Таблица активность вне базы`: same UNKNOWN error (journal `582186966`)
  - Oct 23, 14:42:01 — `Таблица активность в базе`: same UNKNOWN error (journal `582187592`)
  - Oct 24, 14:44:47 — `Таблица активность в базе`: same UNKNOWN error (journal `582188748`)
  - Oct 26, 05:43:05 — `Таблица активность вне базы`: same UNKNOWN error (journal `582190355`)
- All six trigger-error records have initiator and target IDs of `0` and empty message text; they are **not** enough to safely infer which participant should be awarded lost activity.
- Important epistemic boundary: `Сработал триггер` is evidence the *trigger condition ran*, **not** proof of successful outbound HTTP to the GAS deployment. The journal CSV has no recipient URL, HTTP response code/body, request timestamp, request-ID, resend attempts, or delivery receipts. This audit **does not** conclusively locate the original five webhook losses inside ChatKeeper vs transport vs Apps Script.
- Production @125 is already online; do not change it based solely on this CSV. Suggested next investigation: request per-event outgoing HTTP logs/response receipts from ChatKeeper or its support for the five listed journal IDs; also investigate repeated `actual:UNKNOWN` and `Stream was closed` errors on activity triggers.


## Proven CRM ingress evidence for five missed awards — 2026-10-26

The user correctly emphasized that the **admin Google workbook itself** has independent inbound/processing logs. Exhaustive cross-check of the five missing award message IDs against the queue and webhook log, using native Sheet searches and event keys, established:

| Target TG message ID | Queue row | Webhook log row | Queue received (MSK) | Entry/result |
|---|---:|---:|---|---|
| 315354 | 11171 | 10939 | 24.10 09:39:03 | `stat / REJECTED / WRONG_SECRET` |
| 315424 | 11388 | 11161 | 24.10 13:44:48 | `stat / REJECTED / WRONG_SECRET` |
| 315454 | 11512 | 11286 | 24.10 16:24:25 | `stat / REJECTED / WRONG_SECRET` |
| 315467 | 11673 | 11449 | 24.10 18:21:22 | `stat / REJECTED / WRONG_SECRET` |
| 315524 | 11705 | 11481 | 24.10 18:37:57 | `stat / REJECTED / WRONG_SECRET` |

- **Exact event-key match** between queue column F and webhook log column U in all five pairs. All have one processing attempt. Raw T column in the webhook log is a JSON Telegram `update_id/message_reaction` envelope with 🆒 emoji and matching Telegram `message_id`. They have no normalized ChatKeeper `event=reputation`, no player `tg_id` in the queue hints, and no CRM secret. Their `WRONG_SECRET` is expected for this other ingress; **do not mislabel it as a bad ChatKeeper secret**.
- The queued raw reaction event arrived **1–2 seconds** after ChatKeeper's exported journal trigger time. Thus the Telegram reaction reached Apps Script, but in a different, non-awarding event stream.
- Searching all main webhook-log `event` column D from rows 10100–14488 found **25** `reputation` processing *attempts* on Oct 24–26: 19 successful `REPUTATION_UPDATED` plus six transient `RETRY_LOCKED`; **zero** of those 25 used any of the five missed users' Telegram IDs. This matches the 19 normal history awards plus 5 manual restorations.
- Independent evidence of **two separate streams for the same successful trip**: Telegram message `315398` had its raw 🆒 `message_reaction` logged as `stat/WRONG_SECRET` in log row **11113**, but its proper ChatKeeper `reputation` separately logged as `RETRY_LOCKED` row **11112** then `REPUTATION_UPDATED` row **11115**. Therefore a raw Telegram `stat/WRONG_SECRET` is *not* causal proof that the corresponding ChatKeeper webhook was rejected.
- The queue is the earliest normal ChatKeeper receipt point: `05_RELIABLE_WEBHOOK_QUEUE.js/doPost` writes raw body to durable `Очередь вебхуков` before normal `01_CORE_MAIN.js/processWebhookImmediately_` logs to `Лог вебхуков`; `activity_base/activity_outside` processing writes to **separate** `Лог активности`, and `Обработанные события` stores event keys only after business processing.
- Completed `DONE` queue payloads are cleared and cleanup uses a one-day retention, so historical absence from queue alone is not hard proof of non-delivery. The preserved main webhook log *does* show the absence of a correctly parsed `reputation` processing attempt for the five missing IDs.
- **What is proven:** five raw reactions reached the CRM ingress as a separate Telegram stream; none of five resulted in logged legitimate ChatKeeper `reputation` business processing; 19 comparable normalized `reputation` webhooks worked.
- **What remains unknown:** whether ChatKeeper never emitted the normalized webhook, used a different recipient, received non-2xx/timeout, or another pre-log failure occurred. ChatKeeper journal's `Сработал триггер` has no outbound HTTP delivery receipt. Obtain ChatKeeper HTTP delivery diagnostics for its five journal IDs (in preceding section). Until then, do not disable, filter, or alter structured `activity_base`/`activity_outside` or assume the five wrong-secret raw updates were ChatKeeper requests.


## Four-ledger forensic follow-up — 2026-10-26 after ChatKeeper CSV

Explicit read-only audit of four native Sheets tabs confirms there is an observable difference between raw Telegram traffic and **separate** normalized ChatKeeper award requests:

1. **`Лог вебхуков`**, raw request in T, status in B, event in D: each of the five source message IDs has a JSON `message_reaction` with 🆒, classified `stat / WRONG_SECRET`:
   - message `315354`: row **10939**, update `377536126`, 24 Oct 09:39:47
   - message `315424`: row **11161**, update `377536352`, 24 Oct 13:45:54
   - message `315454`: row **11286**, update `377536483`, 24 Oct 16:24:59
   - message `315467`: row **11449**, update `377536656`, 24 Oct 18:22:52
   - message `315524`: row **11481**, update `377536687`, 24 Oct 18:38:45.
   These are separate raw Telegram-relay JSON updates, **not** ChatKeeper's URL-encoded `event=reputation` payloads. `WRONG_SECRET` here does not imply the actual ChatKeeper secret is wrong.
2. **Control events from successful awards** have a separate URL-encoded `event=reputation` entry alongside raw Telegram traffic:
   - message `315368`: successful `REPUTATION_UPDATED` row **10986**, 24 Oct 10:07:21; nearby Telegram `stat` rows 10983, 10985.
   - message `315398`: `RETRY_LOCKED` row **11112**, then successful `REPUTATION_UPDATED` row **11115**, with separate 🆒 raw reaction row 11113.
   - message `315417`: successful `REPUTATION_UPDATED` row **11141**, with separate 🆒 raw reaction row 11142.
   None of the five missing awards has a matching processed `event=reputation` in the relevant admin webhook log section.
3. **`Обработанные события`** contains ordinary successful 24 Oct `reputation / REPUTATION_UPDATED` rows (example 6902, 6928, 6929, 6942, 6954, 6993, 7009, 7036), but not the five restored source awards in that period. It contains normal `activity_base`, `activity_outside` and `screens` as expected.
4. **`Очередь вебхуков`**: a full exact-text search of event column E currently returned 35 `reputation` records, all `DONE` (older September–October entries plus Oct 25–26). The **Oct 24 queue records are absent for both successful and missed awards**, consistent with the configured one-day `DONE` cleanup and therefore **not valid evidence** that Oct 24 requests never entered the queue. Incomplete events `PENDING/RETRY/PROCESSING` and retained `FAILED` were not found as remaining `reputation` rows.
5. **`Лог активности`** contains separate successful structured activity webhooks; `activity_base` and `activity_outside` must not be dropped while troubleshooting raw Telegram `stat`.

Current supported conclusion: the five Telegram reactions certainly reached the shared Apps Script ingress **as raw Telegram updates**; successful comparison awards also arrived as independent normalized ChatKeeper POSTs. For the five missing cases, there is no evidence of a completed normalized ChatKeeper reputation handler. Neither the raw-reaction logs nor the exported ChatKeeper trigger journal establish whether an independent normalized POST was never sent, sent to another URL, received an HTTP error/timeout, accepted but lost before processing, or received false-success prior to the @124 durability fix. Need sender-side HTTP delivery receipts to distinguish.

Do not reinterpret `WRONG_SECRET/stat` as a general ChatKeeper credentials failure. Do not retroactively issue additional awards: all five were recovered and protected by source-message deduplication in Apps Script @124+.
