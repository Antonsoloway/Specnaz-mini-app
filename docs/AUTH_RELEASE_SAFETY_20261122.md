# Mini App startup and release safety — 22 November 2026

## Incident evidence

Owner reported v0.6.17 startup failure: authorization server unavailable.
Live Worker baseline: version 087f3920-d984-49e2-8da2-ed9e47c58f2a,
deployment b365803a-1934-4c2f-83f2-3f71fef2061b (21 November 00:30:50 UTC).
Source baseline: main 5afbb012253a153d6de948575fe7fbffb826b491.
The earlier Specnaz GAS repair did not deploy this Worker.
No live request trace has yet established the cause of this particular screenshot.
Python-client HTTP 1010 is not evidence that Telegram is blocked.

## Reproduced startup defect and candidate repair

The snapshot request cleared its deadline after HTTP headers. A stalled body
could keep the shared in-flight request unresolved indefinitely. Edge-cache
lookup/body/write operations also had no deadline. Four regression scenarios
failed before the repair and pass afterwards: stalled GitHub body with recovery,
stalled cache lookup, stalled cache write, bounded stale fallback.
The repair retains the 1.8-second per-attempt budget through body consumption
and gives each cache operation a 250-ms budget. Freshness and stale limits,
Telegram membership checks and administrator revocation checks are unchanged.
This is a reproduced defect, not a confirmed attribution of the owner screenshot.

## Publication gates

Pages previously deployed without requiring tests. Its publish job now needs:
1. The explicit application contract suite, including snapshot deadlines,
   authentication, membership removal/admin demotion, music, Mayak, teams,
   administrative writes, Specnaz idempotency and webhook durability contracts.
2. The existing runtime/browser workflow, reused without removing its tests.

`node scripts/verify-release.cjs app` passed 329 tests, zero skipped.
Every *.test.js / *.test.mjs file must have exactly one component assignment;
new unassigned tests block publication. The full repository audit remains
available with `node scripts/verify-release.cjs all`.
CRM/bot source changes have their own required workflow job; the six CRM-only
suites are explicit in scripts/release-suites.json, not hidden/quarantined.
Full baseline: 445 tests, 419 pass, 26 fail in CRM/bot suites. These include old
inactive audit rollout fixtures, deletion fixtures, secret-validator fixtures
and ingress resilience assertions. They are not declared green or repaired by
this change. No GAS/bot production code is changed in this candidate.

Old UI tests tied to archived release names now follow the active public HTML
and configured Worker wrapper chain. Behavioral assertions remain intact.

## Rollout and rollback

Do not deploy on local contract results alone: require the same commit's
runtime/browser CI and bundle checks, inspect exact source diff against live
bundle, retain all live bindings and Durable Object namespaces. Keep the
above live Worker version as rollback target. After rollout verify /health,
unauthenticated access denial, and real owner Telegram startup; test member,
nonmember and revoked-admin scenarios without weakening fail-closed policy.
The candidate has not yet been published or accepted in Telegram.
