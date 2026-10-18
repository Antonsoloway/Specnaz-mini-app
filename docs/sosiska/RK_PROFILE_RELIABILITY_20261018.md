# RK player profile reliability, 18 Oct 2026

Diagnosis: from six native game API player profile calls on the authenticated AHTOXA worker, three succeeded with the entire 33931 schema (12 ClientStats + four BackendStats); other calls produced connection reset/HTTP 503. Frontend correctly displayed a retry button but lost all stats because no live response arrived. A Cloud Shell POST 403 with Cloudflare code 1010 is an edge security rejection specific to that test client, not the game API's profile response.

Royal Kingdom search agent patch: on getProfile, two attempts only, six-second gap only on transient upstream transport errors; no retry of malformed or identity-mismatched replies. Up to 128 normalized public profile records cached in memory for 15 minutes; if upstream fails after retry, previously verified records up to two hours old may be returned with cacheStatus=stale and original observedAt. No extra credential storage. Session state and RM agent unchanged.

Miniapp v0.6.5: RK admin profile endpoint carries actual observedAt and cacheStatus into UI. Warns prominently when displaying cached/stale stats rather than claiming freshness. RM behavior unchanged. Tests cover network recovery, invalid data, stale/expired records, bounds, exact timestamp, Telegram release redirect, and legacy v0.6.4 unchanged.

For publish: RK agent CI first, miniapp CI, then RK Worker deploy and miniapp Worker deploy, GitHub Pages. Telegram acceptance remains user-controlled.
