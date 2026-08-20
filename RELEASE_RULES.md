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

## Текущая версия

На 20.08.2026 стабильная версия для обычного запуска: **`v0.5.59`**.
Отдельный admin-preview: **`v0.6.0`** через `startapp=v0600`; не делать его общим entrypoint до завершения admin smoke-test.

Стабильная `v0.5.59` сохраняет:
- статус команды из `Команды!L` через Unified Snapshot/Worker;
- золотую маркировку активных команд;
- inline JPEG-крота на detail/team cards;
- каталог `Команды принимающие участие в базе спецназа` с независимыми фильтрами и поиском;
- server alias `BbllllKA / Royal Kingdom ↔ вышка` через writer `1.2.4`, `searchIndexVersion=1.1.3`;
- каскадное переименование team identity в live Apps Script и pre-snapshot repair однозначного decorative drift;
- постоянный team-photo cache key `команда + игра`;
- safe disk-record warm в `media-persistent-cache-v0554.js 0.5.54.2`;
- iOS-safe team-photo guard `0.5.59.2`; неудачный fast patch `0.5.59.3` откатан;
- кнопку `Связаться` через Worker/Голубца для участников без `@username`;
- восстановление кнопок `Связаться` после Back/rerender;
- устойчивую `/auth`: 12 секунд + один automatic retry;
- credits `@sfinks_spb`, `@O_Chaplygina`, `@Yanochka_2404`, `@DmitryRoyal`.

Admin-preview `v0.6.0` дополнительно использует:
- private admin snapshot `0.6.0-write.4` + optimistic revisions;
- Worker-signed HMAC write transport;
- защищённые admin participant/team mutations;
- team-photo upload + rename cleanup;
- admin journal;
- existing-participant server whitelist `name + memberships`;
- deterministic admin hybrid search + public `searchKeys` when available;
- единую persistent media DB с ordinary mode: avatar primary `avatar:<avatarFileId>`, team `team:<name+game>`;
- normal-style admin team detail с private participants, полным D:L блоком и кнопкой hardened editor;
- `Вышел` ordering по physical source row, newest first;
- delete operations выключены.

Все предыдущие версии сохраняются в истории изменений без удаления.