# Royal Match emblems — 14 October 2026

Owner-supplied catalogue: 176 emblems, zero-based IDs 0–175, four columns read
left-to-right then top-to-bottom. Source pages: 2893 (0–19), 2895 (20–39),
2896 (40–59), 2897 (60–79), 2898 (80–99), 2899 (100–119), 2900 (120–139),
2901 (140–159), 2902 (160–175). Transparent 160×176 WebP shields retain original
art and gold/orange frame. The extraction script accepts original screenshots;
assets/rm-emblems/catalog.json records source row and column for every ID.

Logo from decoded game team/search, TeamLogo from game profile. Real read-only
getTeamInfo for4298767235 returned integer Logo136 (Russian flag), HTTP200.
Projection accepts both decoded logo fields without dropping zero. Zero is a
valid ID; null/invalid/out-of-catalogue values render no invented emblem. Images
are local static assets, never arbitrary upstream URLs. Editable CRM names do
not affect ID-to-art mapping. RK and unbound CRM teams cannot inherit an RM logo.

- Sosiska: search/picker, team heading, watched/selected teams, comparison,
  graph legends and interval headings, analysis headings, player profile team.
- CRM: public/admin linked-team lists, active-team catalogue, team details,
  membership links and admin team rankings, preserving text identities and media.
- Public/admin team-live projections now expose validated numeric logo; profile
  projection exposes teamLogo. No Sheets schema/source changes.
- Authenticated existing team-live reads only. IntersectionObserver prioritizes
  visible names, two concurrent loads, shared pending requests, bounded in-memory
  caches, no scheduled polling. Card refresh/open still reaches the backend's
  CRM permission gate. Metadata reuse does not trigger whole-directory prewarming.
- Cache/UI cleared on auth/revocation/session change. Unlink/rebind cannot retain
  an old image. Images have empty alt and aria-hidden, preserving textContent
  used by existing identity/routing/search code.

Validation: 122 Node tests; 5 real-workerd history/alarm checks and 32 existing-route
isolation checks. Mobile Chromium fixtures 320/390/768 passed for zero/final IDs,
RK exclusion, text preservation, lazy loading/concurrency, unlink, revocation and
no overflow/page errors. Real-modal picker fixture passed Android/iPhone UA touch,
filters/binding/cancel/reopen and preserved photo/form draft. Native Telegram
owner acceptance remains pending. Publication and production rollout pending.


### RM emblems — published and live verification

PR53 merged at001d1e990f8ffb1f99f6e8c2a8818154f453c76a. Final code631f5ad:
CI38637836810/38637844651 PASS, including mobile browser fixtures. Main
CI38637975200 and Pages38637973709 PASS. Workers Build856e60dc-9279-43c3-9469-229ecdab6122
PASS; reported Worker Version934037cc-d3d4-4061-aa36-49a0537da090.
Live GitHub Pages app.html/app-v0600.html and emblem JS/CSS, team-live/Sosiska JS,
and images0/98/136/175 all HTTP200 and byte-identical to reviewed source.
Release marker20261014-v061-emblems1. Live Worker health200/version1.41.0
retained; anonymous RM read401SESSION_MISSING, RK400INVALID_REQUEST. Real
getTeamInfo4298767235 returned integer Logo136; the public projection accepts
Logo and TeamLogo. Protected native Telegram linked-card acceptance remains
owner-side. No source-team IDs, watches, Sheet data, bot settings or secrets changed.
Earlier source-ready/pending notes are historical and superseded.
