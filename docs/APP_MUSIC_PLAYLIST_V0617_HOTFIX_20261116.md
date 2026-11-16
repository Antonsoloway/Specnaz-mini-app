# Mini App ЧП — музыка, hotfix 16.11.2026

Production source: GitHub main `4eef5d6`, Mini App v0.6.17. Public page verified HTTP 200 and includes the old cached music playlist reference.

## Reproduced cause
`music-playlist-v061.js` aborted with exact equality `window.__ROYAL_BUILD__ === '0.6.1'`. In current `app-v0617.html` the build is `0.6.17`, so the six-track playlist never initialized. This regression dates back to bumping builds after 0.6.1, not necessarily the last single commit.

## Patch
- Compatible guard `/^0\.6\.\d+$/` for the 0.6 family, preserving older 0.5.x behavior.
- Cache-bust asset URL in v0.6.17 HTML to avoid stale Telegram WebView JS.
- No change to protected-media access, tokens, volume, startup, preferences, API, mini-app content, admin or music provider.

## Tests
- New script `tests/music-playlist-build-compat.test.mjs` verifies v0.6.1/0.6.15/0.6.16/0.6.17 initialize; v0.5.59/1.0.0 do not; six tracks, wiring, cache-bust. PASS.
- Existing `startup-music-v0600.test.js`: 30/31 PASS; one outdated assertion expects v0.6.0 at the old entrypoint.
- `worker-background-music-v0600.test.js`: 2/3 PASS; one outdated assertion expects Worker main v1.29 instead of deployed v1.43.
- All six private audio sources exist in the authoritative private data repo (one base plus tracks 02–06).
- Actual signed-in Telegram playback still needs a client-side check; browser WebView autoplay may require a user gesture.

Keep the music repair independent from Specnaz Telegram/GAS changes. If needed, rollback only the HTML playlist URL and guard source to GitHub main `4eef5d6`.
