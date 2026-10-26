# Specnaz visit event recovery and safe deduplication

## Source of truth
A Specnaz visit is an administrator-approved, unique Telegram source message.
The ChatKeeper `event=reputation` event increments the participant's `Спецназ` score by exactly one, writes `История спецназа`, then public sync and the mini-app GitHub snapshot propagate the result. Match by Telegram ID, never by a display name.

## Production incident (2026-10-26)
An incident was found where five approved Telegram messages had no corresponding `reputation` delivery in the Royal CRM webhook log. The direct Telegram `message_reaction` traffic fell through into the legacy CRM webhook path as `stat` / `WRONG_SECRET`. This latter diagnostic **does not establish that a valid reputation webhook failed validation**: the missing reputation payloads were not found.

The verified missing events were restored directly in the private Google Sheets (source history and base scores, plus public history). A subsequent GitHub snapshot verification showed 24 current-period entries instead of 19 and the corrected `specnazTrips` counters. Do not re-apply the historic five corrections on future deployments.

## Guard in source
`findSpecnazHistoryAwardForMessage_` prevents a delayed ChatKeeper webhook from granting a second point for the same Telegram ID + source message link, even when its webhook event key differs from a manual backfill event key. If the source link is missing, pre-existing event-key deduplication continues to apply. Run `node tests/specnaz-source-link-idempotency.test.mjs` before release.

## Unresolved upstream delivery guarantee
This guard solves **double credit**, not the **absence of upstream ChatKeeper delivery**. The permanent no-loss solution requires an authenticated, durable backup stream of Telegram `message_reaction` approvals, an explicit approver allowlist, a reliable message-id to sender Telegram ID association, queue/receipt monitoring, and an idempotent reconciliation job with a grace period for normal ChatKeeper webhooks. Unauthenticated Telegram JSON must never be allowed to award points. Use a separate deployment review: do not silently bypass `WRONG_SECRET` or auto-award from raw untrusted log entries.

Until authenticated fallback is deployed and verified, audit admin-approved source message links against `История спецназа` regularly; restore only independently confirmed missing awards, once per unique Telegram ID and source message. Record before/after scores and verify both public table and live snapshot.

## Release checklist
- Inspect live bound Apps Script HEAD and exact deployed version before uploading; the repository's `apps-script-live` is a mirror, not proof of live deployment.
- Run targeted regression tests and syntax checking.
- Back up live source and note deployed version; avoid changing unrelated Telegram bot routes.
- Deploy/redeploy only after confirming the correct production web-app deployment and its secrets.
- Test fresh reputation award, replay of same payload, replay of same message with different key, unrelated second visit, public mirror, and snapshot counters.
