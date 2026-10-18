# RK native player statistics — 18 October 2026

Royal Kingdom build **33931**, `GetProfileRequest` 45 / `GetProfileResponse` 47.

## Root cause

The RK Cloudflare search agent decoded only `GetProfileResponse.PlayerData` and returned `statsAvailable:false` despite the native reply including `ClientStats` and `BackendStats`. The miniapp then forced `stats:{}`. An RK profile displayed the RM league/general panels with dashes and RM-only fields. The native schema and stat enum keys were recovered from the installed game assembly catalog and crosschecked against a saved authentic GetProfileResponse FlatBuffer.

## Verified native field contracts

`ClientStats` is a vector of `ClientStatProgress`: `StatProgressKey` at slot 0, `Value` (int64) at slot 1. Keys:
- 1 FirstTryWin → firstTryWins
- 2 TotalLevelWin → levelWins
- 3 HelpsMade → helpsMade
- 4 HighestWeeklyWin → highestWeeklyWins
- 7 CollectionsCompleted → collectionsCompleted
- 8 DistrictsBuilt → districtsBuilt
- 9 TotalCup → totalCup
- 10 HighestCup → highestCup
- 11 ArenasWon → arenaWins

`BackendStats` is a vector of `BackendStatProgress` with the same field layout. Keys 1–4 map respectively to worldBestRank, worldTop1000, localBestRank and localTop1000. Zero rank is unavailable, rather than rank #0.

The UI now groups actual game stats as *Статистика арены* / *Основная статистика* / *Рейтинг*, instead of reusing the Royal Match stat schema. `HelpReceived`, `SetsCompleted` and `AreasCompleted` do not belong to the verified RK profile and are not fabricated. Current RK Cup is distinct from lifetime total cups. No game inventory, personal chats or game credentials are included in the response.

The RK timeline metric button is **Битва**; RM remains **Турнир / битва**. Existing separated monitoring, live capture and storage are unchanged.

## Release and QA

Source changes in RK game agent repository and miniapp repository. Tests use synthetic native FlatBuffer vectors and game-specific field IDs, including actual fixture-sized values. Build app-v0603.html includes new cache-busters and changelog-v0603.js; v0.6.2 entrypoint is preserved. Check CI, run authorized production deployment, then accept in Telegram WebView.
