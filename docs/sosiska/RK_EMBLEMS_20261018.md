## Correction19.10.2026

The initial screenshot-order mapping below was incorrect for60 IDs. The184 screenshots are valid images but their menu position is not the server ID. The original33931 TeamLogoCatalog configsArray and native GetLogoById(0x264d208) prove that server IDs124–179 are flags (Russia140), and180–183 are butterfly/wizard additions displayed before flags. `native-order-33931.json` records the original array index, visualOrder and sprite names; catalog.json records provenance and image SHA256. Asset files and editor emojis are now reindexed to native IDs. All56 flags and4 additions change;0–123 remain unchanged. No CRM identities or raw protocol IDs are rewritten.

# RK team emblem catalogue (Royal Kingdom build 33931)

Game-specific zero-based original picture IDs **0–183** from user-supplied screenshots 2988.jpg, 2989.jpg, 2990.jpg, 2991.jpg, 2993.jpg, 2995.jpg, 2996.jpg, 2997.jpg (four columns; six rows per page except last four-row page).

Assets: `assets/rk-emblems/{id}.webp`, metadata `assets/rk-emblems/catalog.json`. The miniature images are copied from the original supplied archive without regenerating or replacing the actual game emblems. Unrelated RM catalogue `assets/rm-emblems/` is untouched.

Frontend-only in Sosiska's admin RK panel, uses numeric `TeamLogo` from the native game backend. Does not infer IDs from names and does not use RM emblems as a fallback. A missing ID displays just the team label. The module is loaded ahead of Sosiska in the new versioned `app-v0604.html` entrypoint (legacy `app-v0603.html` remains unchanged).

Tests: all 184 files and RIFF size validation; zero and last IDs; unknown/out-of-range values; safe escaping; RK vs RM isolation; module load order; preserved Telegram launch params/hash.

Release: run `node --test tests/verify-rk-emblems.mjs tests/sosiska-release.test.mjs` and full Sosiska CI; then merge after PASS. GitHub Pages auto-deploys static assets. No Cloudflare Worker changes required.
