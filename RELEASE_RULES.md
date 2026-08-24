# Правила выпуска Royal CRM Mini App

## Обязательное правило истории изменений

Каждая новая версия Mini App выпускается только вместе с записью в разделе «История изменений».

Для версии `vX.Y.Z` одновременно должны быть выполнены все пункты:

1. Создан новый entrypoint `app-vXYZ.html` с номером новой версии.
2. Добавлена отдельная запись истории изменений для `vX.Y.Z` с кратким названием и фактическим списком изменений.
3. Новая запись истории стоит первой, предыдущие версии сохраняются без удаления.
4. Надпись «Текущая версия» и бейдж версии в приложении показывают один и тот же номер `vX.Y.Z`.
5. Новый entrypoint подключает файл истории этой же версии.
6. Старые entrypoint при redirect ОБЯЗАНЫ сохранять `location.hash` целиком; потеря Telegram launch hash ломает `initData` и авторизацию.
7. Для legacy-entrypoint запрещён `meta refresh`; использовать JS `location.replace()` с переносом `search + hash` либо самостоятельный entrypoint.
8. Корневой `index.html` и постоянный `app.html` подчиняются тем же правилам сохранения Telegram launch hash.
9. Перед публикацией проверяется Telegram-авторизация: `Telegram.WebApp.initData` не пустой.
10. Проверяется сценарий `Участники → профиль → Назад`, чтобы карточки/ранги/ачивки не исчезали.
11. Identity участника для внутренних функций = только raw Telegram ID; имя/@ник не используются как идентификатор.
12. Правый блок статусов/достижений участника строится вертикально; `Админ` → ранг → `МАЯК`.
13. Каждая новая ачивка должна переживать повторный render и возврат `Назад`.
14. Плашка версии открывает `window.RoyalChangelog` самой новой загруженной версии.
15. Постоянная Web App-точка входа — `app.html`; при релизе меняется только её целевой `app-vXYZ.html`.
16. После успешной авторизации Mini App обеспечивает право @doveofpeace_bot писать пользователю через `WebApp.requestWriteAccess()`.
17. `write_access_allowed` считается началом личного диалога с Голубем и приводит к приветственному сообщению.
18. Счётчики команды считаются из того же актуального состава, который реально выводится в карточке.
19. В обычном public UI, если источник данных однозначно подтверждает отсутствие фото команды, показывается штатная заглушка без бессмысленного сетевого запроса. В v0.6 admin UI текстовое `Фото C = —` **не является достаточным доказательством отсутствия private media**: сначала разрешён disk/SHA-256 media lookup по identity `команда + игра`.
20. Поиск должен быть быстрым и предсказуемым: без комбинаторных переборов, расстояний опечаток и тяжёлой обработки на каждой букве.
21. Каждый релиз проверяется минимум на Android и iPhone/iPad в Telegram WebView.
22. Длинные списки имеют быстрые кнопки вверх/вниз, не перекрывающие нижнюю навигацию и не сбрасывающие поиск.
23. В шапке истории изменений блок `Помощь в разработке, тесты` содержит `@sfinks_spb`, `@O_Chaplygina`, `@Yanochka_2404`, `@DmitryRoyal`; внутри карточек версий credits не повторяются.
24. Поле поиска не заменяется/перерисовывается во время печати; фильтруются уже отрисованные карточки.
25. Запрещено блокировать `input`, `beforeinput`, `composition*` через `preventDefault()` или `stopImmediatePropagation()`.
26. Старые прямые обработчики поиска можно удалить однократным `cloneNode(true)` после первоначального рендера; дальше поле сохраняется до ухода со страницы.
27. На Android допускается лёгкое чтение `input.value` по таймеру только пока поле в фокусе, без вмешательства в IME.
28. Неоднозначные псевдорусские названия обрабатываются детерминированно; без сотен вариантов и edit-distance.
29. В новом entrypoint загружается только один актуальный поисковый модуль.
30. Запрещён `prewarm` расширенного поискового индекса в основном потоке телефона.
31. На Android отдельно проверяются скорость клавиатуры, ввод, пробелы, стирание и поиск без скрытия клавиатуры.
32. Если карточки фильтруются через `hidden`, CSS обязан гарантировать фактическое скрытие.
33. Unified Snapshot Writer формирует `searchKeys` для каждой команды и каждого участника.
34. `searchKeys` участника включают имя CRM, Telegram-имя, @username, команды, исходные названия, игровые ники, роли и игры; team `searchKeys` включают название, игру, транслитерации, pseudo-read и подтверждённые алиасы.
35. `searchKeys` — дополнительный слой; локальный поиск обязан работать независимо.
36. Итог поиска = `локальный поиск ИЛИ searchKeys`; server keys не уменьшают локальные результаты.
37. Контрольные алиасы: `Has ne dogonyat ↔ нас не догонят`, `XAOC ↔ хаос`, `TOPMO3OB HET ↔ тормозов нет`, `MOLOT POKA ↔ молот рока`, `HEPBbI/HEPBbl B HOPME ↔ нервы в норме`, `Mbl Pycckue ↔ мы русские`, `CKAZKA ↔ сказка`, `BEHOM ↔ веном`, `Aquamarine ↔ аквамарин`, `Da budet swet 5 ↔ да будет свет`, `Mike ↔ майк`, `Xabib ↔ хабиб`, `JoyBand ↔ джойбанд`, `1BY ↔ 1бу`, `BbllllKA (Royal Kingdom) ↔ вышка`.
38. Pseudo-Cyrillic чтение server keys выполняется по словам и только одним детерминированным вариантом.
39. При изменении алгоритма server search keys увеличивается `searchIndexVersion`, изменение входит в `dataHash`.
40. На страницах `Участники` и `Команды` над поиском расположен фильтр `Все / РМ / РК`; переключение не очищает query.
41. Активный game filter ограничивает и список, и область поиска.
42. Клавиатура закрывается при реальном движении пальцем, тапе вне поля или Enter; программный Android viewport scroll не должен снимать фокус.
43. В карточке версии истории перечисляются только фактические нововведения/исправления; credits/boilerplate не повторяются.
44. Для подтверждённого псевдорусского названия, которое generic parser читает неверно, допускается точечный alias.
45. Worker `/snapshot` обязан сохранять `searchKeys` и `searchIndexVersion`.
46. Кэш поискового haystack сбрасывается при смене snapshot object; новые server keys не должны требовать перезапуска приложения.
47. Аватары и фото команд кэшируются в IndexedDB. Avatar primary key = `avatar:<avatarFileId>`. Team-photo key = стабильная identity `team:<нормализованное название команды>\n<нормализованная игра>`; временный Google `photoUrl` запрещён как cache identity.
48. Изображения работают cache-first: локальный кэш → сеть; отказ IndexedDB не ломает изображения.
49. На слабом интернете запрещено массово скачивать все изображения одновременно; avatar network concurrency ≤ 2 в stable flow; v0.6 admin не должен устраивать массовый prewarm.
50. Медиакэш очищает старые записи примерно через 45 дней и ограничивается примерно 420 изображениями.
51. Собственная ава после восстановления из постоянного кэша не должна мигать буквенной заглушкой при rerender.
52. Forward navigation → `scrollY=0`; Back → сохранённая позиция предыдущего экрана.
53. Перед новой работой читать `START_HERE.md`, `CURRENT_STATE.md`, последние `WORK_HISTORY.md`, затем сверять runtime.
54. После принятого результата обновлять `CURRENT_STATE.md` и `WORK_HISTORY.md`; при изменении инварианта — `RELEASE_RULES.md`.
55. После live Apps Script изменения заново синхронизировать `apps-script-live/` через штатный script.
56. При изменении структуры Google Sheets обновлять `docs/tables/ADMIN_TABLE_STRUCTURE.md` и/или `PUBLIC_TABLE_STRUCTURE.md`.
57. Team status берётся только из живой `Команды!L`, проходит через snapshot/Worker; identity = `название + игра`; `Активен` получает золото, `На паузе` — нет.
58. Каталог активных команд имеет собственные `Все / РМ / РК` и поиск, независимые от обычной страницы `Команды`.
59. Крот активной команды не рендерится обычным `<img>` и не использует image-loader; на detail это кнопка каталога, на team-card — часть родительской карточки.
60. Client alias overlay — только страховка; основной стабильный источник подтверждённых alias = server-side `searchKeys` до построения client haystack.
61. Для крота v0.5.59 активный source = inline JPEG data-asset в `active-teams-v0559.css`; SVG-wrapper/внешний JPG не возвращать.
62. Заголовок каталога: **`Команды принимающие участие в базе спецназа`**.
63. Подтверждённые CRM-alias публикуются server-side через Unified Snapshot Writer; при изменении alias делать безопасный `clasp pull → patch → syntax check → clasp status → clasp push`, затем sync live mirror и проверка нового snapshot.
64. Перед точечным alias сверять exact имя из live snapshot/CRM, включая `I/l/1` и emoji.
65. Для фото команд разрешён только disk-only prewarm: уже сохранённые IndexedDB blobs можно поднять в память; сетево скачивать все team photos на старте запрещено. Cached photo показывается сразу, refresh выполняется неблокирующе; текущий interval = 30 минут.
66. Если у участника отсутствует `@username`, на месте username-action показывается **`Связаться`**. Правильная цепочка: Mini App → авторизованный `POST /contact-by-id` → Worker → @doveofpeace_bot → Telegram inline-кнопка `Открыть профиль` по raw Telegram ID. Прямой `tg://user?id=...` из Mini App запрещён как нерабочий подход. Если `@username` есть, сохраняется прежнее username-меню.
67. Авторизация `/auth` не должна падать от кратковременной задержки Worker через жёсткие 5 секунд. В v0.5.59 transport ждёт до 12 секунд и делает один автоматический повтор только для transient timeout/network ошибок; Android `AbortError code 20` нормализуется в `AUTH_TIMEOUT`. Внутренний `BUILD` в `app.js` обязан совпадать с текущей Mini App версией.
68. Не добавлять автоматические GitHub Actions smoke-workflow, которые генерируют failure-письма владельцу на обычных разработческих commits, без отдельной необходимости, проверки workflow и согласования. Worker runtime проверять напрямую по `/health` и/или функциональному smoke-test; GitHub commit сам по себе production-доказательством не является.
69. После любого Back/rerender списка участников post-render decorators обязаны восстанавливать динамические actions. Для карточек участников порядок: сначала `RoyalParticipantCardUX.decorate()`, затем `RoyalContactByTelegramId.decorate()`. Проверять как видимую кнопку `Назад`, так и Telegram native/system Back; `Связаться` не должно исчезать после возврата из профиля или команды.
70. На iPhone/iPad team-photo loader не имеет права очищать уже существующий рабочий `img.src` до готовности replacement из IndexedDB/proxy. iOS WebView может заметно задерживать decode; replacement должен получить время на реальный `load/decode`, а при временной ошибке кэша/прокси приложение сохраняет/возвращает исходный CRM source вместо принудительного `photo-error`/замка. Android-ветку без необходимости не менять.
71. **Не возвращать iOS fast-path из `stable-v0559.js 0.5.59.3`: пакетное создание session object URLs для всех team blobs и синхронная подмена `renderTeamDetail()` на реальном iPhone привели к полному исчезновению фото команд.** Любое новое ускорение iOS сначала делать изолированно, без отключения штатного loader/fallback, и проверять на реальном iPhone до публикации.
72. Безопасное ускорение team-photo cache допускается внутри штатного `media-persistent-cache`: одним readonly-проходом можно заранее сохранить в JS-памяти **IndexedDB record/blob references**, но нельзя заранее создавать `blob:` URL для всех команд, менять DOM, перехватывать `renderTeamDetail` или отключать штатный loader/fallback. Object URL создаётся только для реально открываемой команды; сетевой prewarm запрещён.
73. **Переименование существующей команды в `Команды!B` — каскадная операция.** До public/snapshot sync необходимо обновить все пять membership team-слотов `База участников` по identity `старое название + игра`. Ник, роль и game-columns не менять. Автоматический repair допустим только для однозначного decorative-prefix/emoji drift; полное/неоднозначное переименование без подтверждённого mapping не угадывать. Строгую public validation сохранять.
74. **v0.6 existing-participant write policy:** администратор вручную изменяет только CRM `Имя` и пять membership slots (`команда / роль / игровой ник`). Telegram ID, состояние чата, Telegram name, `@username`, дата V, U/AB/AC/AD и вычисляемые/system поля принадлежат боту/системе и должны быть **SERVER READ-ONLY**. Frontend обязан скрывать/блокировать их, но безопасность обеспечивается серверным whitelist: `updateParticipant` принимает только `name` и `memberships`; любое другое поле отклоняется до записи (`PARTICIPANT_FIELD_READ_ONLY`).
75. **v0.6 admin search:** админ-поиск по участникам и командам не должен деградировать до простого raw lowercase `.includes()`. Он использует deterministic hybrid forms, как обычный поиск: normalize/compact, кириллица↔латиница, human-read, один pseudo-read, confirmed aliases и доступные `searchKeys`. Для admin-only записей local search обязан работать без public snapshot. Поле ввода не перерисовывать на каждую букву и не блокировать IME.
76. **v0.6 admin avatars:** participant identity = raw Telegram ID, но persistent cache primary identity = существующий public `avatarFileId`. Admin и normal mode используют **один IndexedDB `royal-crm-media-cache`** и primary key `avatar:<avatarFileId>`. `avatar:tg-<id>` разрешён только как fallback/migration bridge для admin-only/startup cases; когда `avatarFileId` становится известен, blob мигрируется в primary key. Не заводить второй IndexedDB/отдельный долгоживущий admin avatar cache.
77. **v0.6 `Вышел` ordering:** порядок должен повторять физическую группу `База участников`, где стабильная `sortBaseByChatState_()` держит новые выходы выше старых. В admin UI при фильтре `Вышел` сортировать по source `row` по возрастанию. `AE Дата изменения` не считать датой выхода. После ухода из фильтра восстановить исходный list order; DOM-sort не должен запускать бесконечный MutationObserver/rerender цикл.
78. **v0.6 admin team media:** thumbnail и большая фотография team-detail обязаны использовать тот же IndexedDB `royal-crm-media-cache` и тот же stable key `team:<normalized name>\n<normalized game>`, что ordinary team-photo cache. Admin network fallback идёт через authenticated `/admin-team-photo`; route сначала ищет private `media/teams/<sha256(name+game)>.bin`, и только затем может использовать ephemeral `photoUrl` как compatibility fallback. `photoUrl` не является identity и его пустота не должна блокировать SHA-256 lookup.
79. **v0.6 admin team navigation:** тап по строке команды открывает normal-style team detail (`team-photo-box`, `team-detail-head`, `team-stats`, `team-members-list`) с данными из private admin snapshot, чтобы работали `Активен`, `На паузе` и `Неактивен`. Состав определяется по exact `team + game`. Back должен восстанавливать предыдущий admin list/search/filter/scroll state, а не сбрасывать пользователя на главную или новый пустой список.
80. **v0.6 admin team detail:** detail обязан показывать не только public-style фото/состав, но и полный private блок команды из листа `Команды`: `D лидер/подпись`, `E игроки`, `F общий спецназ`, `G сортировка`, `H скрины`, `I активность в базе`, `J активность вне базы`, `K среднее`, `L статус` и source row. Кнопка `Редактировать команду` должна переиспользовать существующий hardened `admin-write-v0600-v3.js` + photo bridge/optimistic revision; не создавать второй frontend write route. Пока серверный whitelist не расширен отдельно, E:L остаются read-only, а updateTeam меняет только разрешённые поля (`name + leader`, photo через photo bridge).
81. **v0.6 admin team metric rankings:** карточки `E игроки`, `F общий спецназ`, `H скрины`, `I активность в базе`, `J активность вне базы`, `K среднее` на admin team-detail открывают рейтинг **всех private admin teams** по соответствующему numeric field от большего к меньшему. Источник рейтинга = `adminData.teams`, не public snapshot, поэтому `Неактивен` и нулевые значения не отбрасываются. При равенстве tie-break детерминированный по team name/game. Строка рейтинга открывает team-detail этой команды; Back восстанавливает ranking/detail state. Не добавлять thumbnails/массовый media prewarm в список всех команд.
82. **v0.6 admin participant navigation/detail:** в admin participant list raw Telegram ID не показывается визуально; под именем показываются memberships/команды, при этом raw ID сохраняется только как скрытая техническая identity для search/avatar/editor. Тап по participant row не раскрывает `<details>`, а открывает normal-style participant detail из private `adminData.participants`, поэтому работают `В чате`, `Вышел` и другие admin-only записи. Detail показывает все private Sheet-поля участника, memberships кликабельны и открывают admin team-detail. Кнопка `Редактировать участника` переиспользует существующий hardened editor; отдельный write-flow запрещён. Карточки `U спецназ`, `AB скрины`, `AC активность в базе`, `AD активность вне базы` открывают рейтинги всех private admin participants numeric-desc; нули не отбрасываются, ranking rows не должны массово prewarm avatars. Back обязан восстанавливать list/detail/ranking state.
83. **v0.6 admin participant membership visuals:** memberships в admin participant list обязаны использовать тот же ordinary visual contract, что стабильная страница `Участники`: контейнер `membership-list` и отдельные `membership-pill` для каждого membership с `команда + роль + игра`. Существующие decorators `team-game-colors-v0535` и `active-teams-v0559` должны применяться повторно, чтобы РМ/РК окраска и золото `Активен` совпадали с обычным UI. Не возвращать одну объединённую текстовую строку команд. Внутри admin summary эти плашки display-only: tap по их области остаётся tap по participant summary и открывает admin participant detail, не ordinary team/public route.
84. **v0.6 participant delete:** удаление разрешается только если live `База участников!AF` в момент серверной операции точно равно `Вышел`. Клиент обязан показать явное подтверждение, но окончательную защиту обеспечивают Apps Script под `ScriptLock` + optimistic revision. Очищаются только source ranges `A:S`, `U:V`, `AB:AF`; array-formula columns `T` и `W:AA` не очищаются напрямую. После commit обязательны admin journal, stable base sort/formula restore, snapshot refresh и public-sync marker. Для любого другого chat state операция отклоняется.
85. **v0.6 team delete:** удаление разрешается только по exact identity `название + игра`, если live `Команды!L = Неактивен`, live `E = 0` и независимый scan всех пяти membership slots `База участников` по той же identity вернул 0 ссылок. Клиент показывает подтверждение; Apps Script повторяет все проверки под lock и проверяет revision. Очищаются только source cells `A:D`; formula columns `E:L` сохраняются. После commit обязательны admin journal, нормализация порядка, private-media cleanup, snapshot refresh и public-sync marker.
86. **v0.6 admin entry:** после подтверждённой admin eligibility вход `Админ режим` размещается внутри self-profile header справа от identity админа. Исходная grid-плитка скрывается, но остаётся eligibility anchor. Relocation обязан переживать повторные render/Back без дублей и исчезать при потере admin eligibility.
87. **v0.6 delete action visibility:** разрешённая кнопка `Удалить` должна быть видна прямо на private admin detail участника/команды, а не только внутри modal editor. Кнопка видна только при доказанном Worker `permissions.canDelete` и локальном eligibility (`Вышел` либо `Неактивен + 0`). Перед confirm frontend повторно загружает свежую private card/revision; все server guards и журнал остаются обязательными.
88. **v0.6 admin-write endpoint:** private snapshot не имеет права считать `ScriptApp.getService().getUrl()` доказательством production route при нескольких Apps Script deployments. Installer обязан выбрать ровно один существующий deployment `Таблица ЧП 1.3`, проверить его прямым non-mutating POST, внедрить exact `/exec` в deployment configuration до `clasp push` и подтвердить в свежем private snapshot одновременно `endpoint`, `endpointPinned=true`, `endpointSource=deployment-constant`. Script Property разрешён только как совместимый validated override и не может быть единственным rollout-механизмом: `clasp run` способен вернуть Apps Script storage exception с exit code 0. Worker разрешает edit/delete только при полном pinned contract; fallback service URL остаётся диагностическим и всегда read-only.
89. **v0.6 route-specific timeout:** mutation route `/admin-write` не имеет права использовать общий 5-second read timeout; текущий safety window = 60 секунд. `/admin-data`, последовательно выполняющий session/admin checks и private snapshot read, получает 20 секунд; `/auth` — 12 секунд, ordinary public reads — 5 секунд. Transport не повторяет `/admin-data`: bounded retries принадлежат shared admin-data client. Write transport retry допускается только с тем же `requestId`, чтобы server idempotency не создала дубль; timeout сам по себе не считается доказательством отсутствия commit.
90. **v0.6 WRITE_BUSY retry:** Unified/private snapshot и admin mutation могут использовать общий Apps Script ScriptLock только для короткого consistent Sheet capture/commit; GitHub I/O под этим lock запрещён. Явный server `WRITE_BUSY` означает, что mutation не начиналась, поэтому frontend может автоматически повторить операцию только bounded-число раз (сейчас 3: 0.7/1.4/2.5 секунды) и обязательно с тем же `requestId`. Нельзя автоматически повторять validation, stale revision, eligibility/delete conflicts или произвольные HTTP errors. Backend lock wait остаётся коротким (6 секунд); после исчерпания retries выводится исходный безопасный отказ.
91. **v0.6 commit-first snapshots:** успешная create/update/delete операция обязана сначала завершить Sheet mutation, journal и idempotency cache, после чего сразу вернуть success. После app write Worker запускает HMAC-signed direct unified refresh через `ctx.waitUntil()`; installable Sheet edit/change trigger выполняет direct flush в своём execution. One-off clock и recurring five-minute Unified Snapshot остаются durable retry/fallback, а не latency contract. Sheet capture выполняется под коротким `ScriptLock`, GitHub publish — после release и отдельно сериализуется; superseded capture не имеет права затереть более новую mutation. Frontend может немедленно применить только server-returned committed record/delete result; authoritative background payload принимается лишь после появления всех pending requestId в private journal.
92. **Публичная документация без PII:** `CURRENT_STATE.md`, `WORK_HISTORY.md`, changelog и другие публичные handoff-файлы не содержат реальные имена участников/администраторов, Telegram ID, requestId, dataHash, номера строк с персональными записями, exact private endpoint и другие операционные идентификаторы. Использовать обезличенные роли, агрегаты и названия сценариев. Исключение — заранее согласованные публичные credits.
93. **Синхронный handoff:** изменение active frontend build/entrypoint, Worker `main`/version, Apps Script write/snapshot contract, schema или search index считается незавершённым, пока в том же цикле не обновлены `CURRENT_STATE.md` и верх `WORK_HISTORY.md`; при изменении постоянного инварианта одновременно обновляется `RELEASE_RULES.md`.
94. **Repo и production документируются раздельно:** каждый handoff отдельно фиксирует repo target, live Apps Script source mirror и независимо подтверждённый production deployment/runtime. Commit, Pages source update, `clasp push` или mirror sync не подменяют `/health`, capability snapshot и device smoke; неподтверждённую версию запрещено обозначать как production.
95. **v0.6 shared admin read:** все frontend-потребители `/admin-data` используют один memory-only, session-bound, single-flight client. Повторяются только timeout/network и HTTP 502/503/504 с bounded delays; 401/403 не повторяются, очищают защищённый cache/UI и остаются fail-closed. Protected admin routes никогда не уходят в GAS fallback. Detail/editor переиспользуют уже загруженный snapshot; fresh permission gate передаёт тот же payload в write UI без второго read. Pending committed request IDs защищают общий cache от lagging private snapshot до появления journal confirmation.
96. **v0.6 admin audit v2:** любой mutation source-полей `База участников`/`Команды` обязан записать фактические semantic before/after через единый facade либо защищённый baseline reconcile; все текущие Mini App, manual Sheet, ChatKeeper bot и system-maintenance paths должны иметь реальный вызов, а не только экспорт helper. `Админ журнал!A:L` остаётся v1-compatible, v2 занимает `M:Y`; `requestId` продолжает искаться через постоянный dedupe/index и legacy fallback. Journal/index append выполняется только explicit next-row `getRange(...).setValues()` под одним `ScriptLock`, `appendRow()` запрещён для v2; caller с уже удерживаемым lock передаёт `lockAlreadyHeld=true`, вложенный `tryLock` запрещён. Installable triggers активируют v2 только по exact versioned token текущей implementation/schema: `MINIAPP_auditV2Activate()` под lock сначала удаляет прежний token, готовит schema/index и свежий непустой baseline, делает flush, подтверждает hidden + non-warning sheet protection для journal/index/baseline и пишет token последним; stale `1`/old token, failed hide/protect или иная failed activation оставляют backend disabled. При disabled Mini App обязан продолжать legacy A:L, manual/bot/system hooks и duplicate lookup не мутируют audit storage; `Deactivate()` удаляет token. При любом изменении реализации token обязательно увеличивается до source push. Baseline скрыт/защищён, не переписывается на no-diff, не выполняет полный clear/rewrite после child reconcile и не продвигается после failed append; successful child event условно ремонтирует только собственный target. Partial journal/index commit ремонтируется при active outer request lookup только если live target всё ещё имеет сохранённый committed fingerprint; старый duplicate не имеет права откатить/продвинуть baseline поверх более нового source-state. Team rename после сортировки объединяется в один update только при unique same-game + unchanged leader/photo signature; неоднозначность остаётся separate events. Formula-only recalculation и derived/public snapshot publish не считаются отдельными business events; editor берётся только из installable event `e.user`, включая structural onChange, иначе обозначается честно, secret URL и diagnostic metadata не выводятся frontend как пользовательский текст. Любой будущий writer обязан добавить source/actor/target/outcome contract и integration test.
97. **Runtime-only ChatKeeper credential:** webhook credential запрещено хранить literal-значением в публичном source. Runtime file01 читает только named Script Property и при отсутствии/ошибке чтения отклоняет запрос fail-closed. Для безопасного перехода Stage 1 может один раз перенести legacy global в property, пока прежний file01 ещё live, но migration возвращает только metadata и обязана быть семантически подтверждена до Stage 2. Rollback не удаляет property. Уже публичное историческое значение считается раскрытым и ротируется отдельным согласованным изменением ChatKeeper + Script Property только после успешного rollout/smoke и закрытия rollback-окна; значение не допускается в git, CLI-команды, логи, backup metadata или документацию.

## Текущая версия

На 22.08.2026 стабильная версия для обычного запуска: **`v0.5.59`**.
Отдельный admin-preview: **`v0.6.0`** через `startapp=v0600`; не делать его общим entrypoint до завершения admin smoke-test.

Стабильная `v0.5.59` сохраняет:
- статус команды из `Команды!L` через Unified Snapshot/Worker;
- золотую маркировку активных команд;
- inline JPEG-крота на detail/team cards;
- каталог `Команды принимающие участие в базе спецназа` с независимыми фильтрами и поиском;
- server alias `BbllllKA / Royal Kingdom ↔ вышка` через writer `1.2.7`, `searchIndexVersion=1.1.3`;
- каскадное переименование team identity в live Apps Script и pre-snapshot repair однозначного decorative drift;
- постоянный team-photo cache key `команда + игра`;
- safe disk-record warm в `media-persistent-cache-v0554.js 0.5.54.2`;
- iOS-safe team-photo guard `0.5.59.2`; неудачный fast patch `0.5.59.3` откатан;
- кнопку `Связаться` через Worker/Голубца для участников без `@username`;
- восстановление кнопок `Связаться` после Back/rerender;
- устойчивую `/auth`: 12 секунд + один automatic retry;
- credits `@sfinks_spb`, `@O_Chaplygina`, `@Yanochka_2404`, `@DmitryRoyal`.

Admin-preview `v0.6.0` дополнительно использует:
- private admin snapshot `0.6.0-write.5` + optimistic revisions;
- Worker-signed HMAC write transport;
- защищённые admin participant/team mutations;
- team-photo upload + rename cleanup;
- admin journal;
- existing-participant server whitelist `name + memberships`;
- deterministic admin hybrid search + public `searchKeys` when available;
- единую persistent media DB с ordinary mode: avatar primary `avatar:<avatarFileId>`, team `team:<name+game>`;
- ordinary-style отдельные membership pills в admin participant list с теми же RM/RK и active-team decorators;
- normal-style admin participant detail с private fields, team links, hardened editor и U/AB/AC/AD rankings;
- normal-style admin team detail с private participants, полным D:L блоком и кнопкой hardened editor;
- team metric rankings E/F/H/I/J/K по полному private team set;
- `Вышел` ordering по physical source row, newest first;
- production Apps Script/private snapshot = `0.6.0-write.5`;
- live write.5 содержит только два узких destructive flow: participant `AF=Вышел` и team `L=Неактивен + E=0 + refs=0`, с confirm/revision/server recheck/journal и сохранением formula columns;
- frontend candidate build `20260822-1050`: shared admin-data client `.1`, admin read `.4`, write UI `.9`, route-specific 20/60-second admin windows, bounded transient read retry, single-flight cache и background journal-confirmed refresh;
- production Apps Script: atomic membership range write, Sheet commit-first, direct unified snapshot refresh и durable one-off/5-minute fallback без GitHub I/O под `ScriptLock`;
- production Worker `1.28.0` держит endpoint fail-closed и запускает signed snapshot refresh через `ctx.waitUntil()` после committed app write.

Все предыдущие версии сохраняются в истории изменений без удаления.


## Security invariants

- Production Google Sheets MUST remain Restricted: no `anyone` reader/writer permission; Apps Script accesses them as the deploying owner.
- Secrets/tokens/webhook credentials MUST live only in Script Properties, Cloudflare secrets or another private secret store; literal credentials are forbidden in public GitHub source/mirror/docs.


### Mini App background refresh / visual stability

- Do not run a permanent full public/admin snapshot reload watchdog on a fixed short interval inside the Mini App. Background refresh after explicit writes or user actions is allowed; continuous polling that can repaint Telegram WebView must be opt-in and proven visually stable.


### Admin participant editor surface

- Existing participant edit UI must expose only server-writable participant fields (`name` + memberships). Telegram name and Telegram ID may be shown read-only for verification; bot/system fields (chat state, username, dates, specnaz/screens/activity counters) belong in the admin detail card, not the edit form.

- Admin context is sticky: a participant/team navigation that originates from any admin list, detail, ranking, roster, or membership pill must open the corresponding protected admin detail; ordinary/public participant or team routers must never win that transition.

- Moving admin edit controls must not break protected media. Admin team detail must keep/re-arm authenticated team-photo loading after layout/DOM relocation and may use a bounded direct refetch fallback.

- Admin team list must preserve the same game color language as ordinary mode: Royal Kingdom cards are red and Royal Match cards are blue.

- Admin search must release the mobile keyboard when focus/gesture moves away from its search field, matching ordinary-mode keyboard behavior.

- Admin create actions are direct: do not reintroduce a separate global «Режим редактирования» switch; keep direct Add team / Add participant actions and per-record edit entry points.

- Once an authenticated admin team image has loaded successfully, a transient media refresh failure must not replace it with the castle fallback during the same Mini App session.

- Admin team detail edit controls must ignore the navigation compatibility/ghost tap that created the detail page; editing starts only from a deliberate tap after the page transition has settled.
