# Authorization network failure / same-backend relay — 22 November 2026

Owner screenshot23:25 Moscow: NETWORK_ERROR after fresh launch.
PC Node and real Chromium receive signed-data validation errors with correct
CORS from the live Worker. The complete app entry with an isolated fixture
user/snapshot reaches auth-ready and welcome. No user credentials were used.
Current253 participant records have no invalid membership arrays/null entries.
These checks do not identify the phone's exact DNS/TLS/CORS failure.

## Recovery design

Keep the primary API. On an actual fetch/timeout failure during auth, the one
existing retry uses royal-crm-api-relay.pages.dev. It has a fixed Cloudflare
service binding CRM_API -> royal-crm-miniapp-api in the same account. It stores
no data/secrets and delegates every authentication/role decision to the original
Worker. HTTP401/403/503 responses are never rerouted. Once the relay answers,
subsequent authenticated requests use that same route, including private media
and administrative reads/writes. Uncertain writes are never replayed.

The relay streams status/body and preserves Origin, Authorization and payload;
it cannot select another destination from a query. Missing binding fails503.
No GAS fallback or membership/signature policy change is introduced.

Also distinguish a post-auth rendering exception (AUTH_RENDER_FAILED) from a
transport error. NETWORK_ERROR must not label successful auth followed by a UI
exception. The previous broad catch permitted this ambiguity.

## Validation / rollout

Application suite includes transport-failure fallback, HTTP-denial no-fallback,
no uncertain-write replay, fixed service destination, authorization/body/status
preservation and fail-closed missing binding. Full runtime/browser CI remains
required before release. Then deploy the relay first, verify its binding and
public health/auth denial/CORS, force primary network failure in a complete
browser fixture against the real relay, and only then publish the client.
Real phone acceptance remains required; do not claim success from PC health.
Rollback: revert the client transport/cache-bust commit; the primary Worker and
its19bindings/3DO namespaces are not changed by this release.
