# Detailed player profiles from roster clicks

The user supplied an in-game Profile screen and clarified that tapping a roster member should open this detailed profile. The implementation opens a dedicated card, shows join month/year and level, separates current counters from lifetime statistics, and includes exactly the nine displayed statistics: total crowns, highest crowns, league wins, first-try wins, helps made, helps received, areas completed, seasonal collections completed and seasonal sets completed. Missing statistics display — rather than a fabricated zero. Native avatar artwork is not mapped; a neutral silhouette is used.

## Protocol evidence

Recovered from the user-supplied Royal+Match_38911_APKPure.xapk, metadata version 31. Metadata SHA256: 5b2fd6c818a2357b64bf22a6312f4ab93c69f6e8b63f9196e0456b6cc953c960; armeabi-v7a libil2cpp SHA256: f9dd05c3aebc56e144d9a15920db8f4738b9108bc2f101a27717f94bfdf0d30e. Original binaries are not committed.

- RequestType.GetProfileRequest = 56; ResponseType.GetProfileResponse = 57.
- GetProfileRequest: UserId (int64), single slot.
- GetProfileResponse: Profile table, Stats vector of StatProgress. It has no inner Status field. The existing outer package Status/session/SyncId/type checks remain mandatory.
- Profile slots: ProfileSetting, Name, JoinDate (int64), Level (int32), Crown (int32), TeamId (int64), TeamName, TeamLogo (int32), DeprecatedIsGold (bool), HasSpecialNameStyle (bool).
- StatProgress slots: Id (StatType int32), Value (int64).
- StatType mapping: 2 FirstTryWins; 3 HelpsMade; 4 HelpsReceived; 5 AreasCompleted; 8 HighestCrown; 9 TotalCrown; 10 LeagueWins; 30 SCCSetsCompleted; 31 SCCCollectionsCompleted.

These are the generated getter/Create/Add method field order and primitive types. Request/response enums come from byte-valued metadata field defaults. StatType values use metadata version-31 compressed signed int32 (zigzag) defaults. GetStatRequest 54 is for the service account itself and must not be used to fetch another player's profile.

The native Profile table does not echo the target UserId. RequestedUserId in the agent result is explicitly request correlation added after the serialized request and validated response, not an independently echoed game identity. The existing package UserId verifies the service session and is not the target player.

## Checks and rollout

32 local tests pass: existing UI/release, four native profile regressions, three profile facade regressions, two UI profile regressions. Official FlatBuffers Python fixture verifies independent response decoding, exact int64 statistics, and all existing response gates. Chromium 390px checks nine values, join month/year, zero vs missing, close and second-player selection, long names, width and no JS errors. Mobile image inspected, SVG icons used for reliable rendering.

The agent adds getProfile to the existing serialized read-only pipeline; no game account/session, monitor schedule, capture, secret or storage migration is changed. The mini-app facade forwards only the selected UserId. All profile requests are explicit member clicks.

Rollout order: isolated agent code using preserved live bindings/settings/network flag and existing RM_SESSION namespace -> one live profile read -> mini-app Worker/frontend -> authenticated profile acceptance. CI is required before rollout. Do not deploy wrangler.jsonc as-is: its RM_NETWORK_ENABLED=0 default is for tests; preserve the live setting and all credentials. No native code, APK, private authentication state or credentials belong in git. Live acceptance and deployment evidence must be recorded separately; fixture completion does not prove a real profile read.
