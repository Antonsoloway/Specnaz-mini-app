# Royal CRM / «Таблица ЧП» — CURRENT STATE

> **Актуально на 23.08.2026.**
> Новый чат обязан сначала прочитать `START_HERE.md`, затем этот файл и последние записи `WORK_HISTORY.md`.
> Фактический runtime / живые Google Sheets / live Apps Script / текущий GitHub имеют приоритет над памятью чатов.

## 1. Обязательный протокол работы

1. Не менять код по памяти: сначала открыть фактический файл/SHA/подключение.
2. Если задача зависит от данных — сверить `snapshot.json`, private `admin-snapshot.json` и/или живую Google Sheets.
3. Для Apps Script использовать `apps-script-live/` как зеркало последнего `clasp pull`; перед `clasp push` обязательны backup/pull и `clasp status`; после push снова синхронизировать live mirror.
4. Не создавать новый Apps Script deployment, если достаточно обновить существующий **`Таблица ЧП 1.3`**.
5. GitHub commit не равен production/runtime-подтверждению.
6. После принятой/проверенной работы обновлять `CURRENT_STATE.md` и `WORK_HISTORY.md`; `RELEASE_RULES.md` — при новом постоянном инварианте.
7. Публичные handoff-файлы не должны содержать реальные Telegram ID, имена участников, requestId, dataHash, номера персональных строк или exact private endpoint; использовать обезличенные сценарии и агрегаты. Согласованные публичные credits сохраняются.

---

## 2. Репозитории / входы

- основной repo: `Antonsoloway/Specnaz-mini-app`, branch `main`;
- data repo: `Antonsoloway/royal-crm-data`;
- постоянный entrypoint: `app.html`;
- обычный запуск → **`app-v0601.html` / release v0.6.1**;
- `app-v0601.html` сохраняет query/hash и передаёт запуск в общий runtime `app-v0600.html` с `releaseBuild=20260823-v061-entry`;
- `app-v0559.html` / v0.5.59 сохранён как rollback target, но больше не является текущей default-версией;
- bot: `@doveofpeace_bot`.

Текущий release delivery:
- `app.html` → `app-v0601.html`, cache marker **`20260823-v061-entry`**;
- внешний release номер = **v0.6.1**; общий runtime всё ещё переиспользует `app-v0600.html` и его v0.6-модули;
- в repo присутствуют `profile-team-link-v061.js` и `changelog-v0601.js`; перед утверждением, что они активны в runtime, проверять их фактическое подключение из конечного entrypoint;
- `app-v0600.html` на 23.08 использует актуальные startup/music/transport/scroll hotfix cache-busts;
- launch `search + hash` сохраняется на обоих redirect-этапах, Telegram initData теряться не должен;
- GitHub commit и release entrypoint не считаются доказательством Cloudflare/runtime deploy без отдельной проверки.

---

## 3. Live Apps Script / admin backend

Подтверждено production-записями и свежими snapshot на 22–23.08.2026:
- private admin snapshot contract: `adminData.version = 0.6.0-write.5`; публичный snapshot 23.08 содержит 207 participants;
- advertised write endpoint закреплён: `endpointPinned=true`, `endpointSource=deployment-constant`; используется существующий deployment **`Таблица ЧП 1.3`**;
- optimistic `revision` у participant/team records;
- write transport: **Mini App → Worker → HMAC → Apps Script → Google Sheets**;
- HMAC secret не попадает в браузер/GitHub;
- `deleteParticipant` и `deleteTeam` включены в production write.5;
- team photo capability + rename cleanup подтверждены;
- membership write работает атомарно: один range write, validation-safe role update и rollback исходных values/rules при ошибке.

Production write.5 policy:
- `deleteParticipant` только если фактический `База участников!AF = Вышел`;
- `deleteTeam` только если фактические `Команды!L = Неактивен`, `E = 0` и повторный scan всех пяти live membership slots вернул 0 ссылок;
- participant delete очищает только source ranges `A:S`, `U:V`, `AB:AF`, сохраняя formula arrays `T` и `W:AA`;
- team delete очищает только source `A:D`, сохраняя formula columns `E:L`;
- обе операции используют optimistic revision, ScriptLock, admin journal и обязательное подтверждение в Mini App;
- installer сохранил и обновил только существующий deployment `Таблица ЧП 1.3`; новый deployment не создавался.

Fast-write / snapshot refresh — production confirmed:
- все шесть create/update/delete operations используют commit-first contract: Sheet mutation + journal + idempotency cache завершаются под коротким `ScriptLock`, затем сервер сразу возвращает committed result;
- frontend сохраняет optimistic committed payload до появления всех pending operations в private journal, поэтому отстающий snapshot не может вернуть старую revision между последовательными правками;
- Worker `1.28.0+` после committed app write запускает отдельный HMAC-signed `admin-snapshot-refresh` через `ctx.waitUntil()`;
- installable Sheet edit/change triggers напрямую выполняют тот же unified public/private flush;
- Sheet capture выполняется под коротким `ScriptLock`, GitHub publication — после release и под отдельной сериализацией; stale capture не может затереть более свежий;
- one-off clock и штатный 5-minute trigger остаются durable retry/fallback, а не latency contract;
- production smoke подтвердил атомарные последовательные participant edits и обновление app/manual snapshots примерно за десятки секунд без ожидания пятиминутного fallback;
- обе destructive операции всё ещё требуют отдельного device smoke только на безопасных тестовых записях.

Live modules:
- `28_MINIAPP_ADMIN_DATA.js` — private admin read;
- `29_MINIAPP_ADMIN_WRITE.js` — validation/helpers;
- `30_MINIAPP_ADMIN_WRITE_BACKEND.js` — signed gateway;
- `31_MINIAPP_ADMIN_WRITE_HARDENED.js` — hardened mutations/policies + exact deployment endpoint resolver/pin;
- `32_MINIAPP_ADMIN_TEAM_PHOTO.js`, `33_MINIAPP_ADMIN_WRITE_FINAL.js` — team photo/final integration.

Public snapshot:
- Unified Snapshot Writer `1.2.7`;
- schema `1.4.2`;
- searchIndexVersion `1.1.3`;
- штатный trigger примерно раз в 5 минут.

---

## 4. Google Sheets / identity

Главные листы: `База участников`, `Команды`.

### Команды
- identity = **название + игра**;
- `Команды!L` = `Активен / На паузе / Неактивен`;
- фото — штатный source `Команды!C` + private team media;
- переименование `Команды!B` — каскадная операция: обновить все 5 membership team-slots той же игры;
- игра существующей команды — часть identity и через текущий editor не меняется;
- поля team record в private snapshot включают `leader`, `players`, `specnazTrips`, `sort`, `screens`, `activityBase`, `activityOutside`, `average`, `status`, `row`, `revision`.

### Участники
- identity = **raw Telegram ID**;
- существующий Telegram ID неизменяем;
- 5 membership slots: игра / команда / роль / игровой ник;
- private participant record: `row`, `telegramId`, `name`, `telegramName`, `username`, `memberships`, `status`, `specnaz`, `date`, `screens`, `activityBase`, `activityOutside`, `lastChange`, `chatState`, `revision`;
- существующий участник v0.6 вручную: **только CRM `name` + memberships**;
- Telegram name, `@username`, chat state, date, U/AB/AC/AD и остальные bot/system fields = **SERVER READ-ONLY**; попытка ручной записи → `PARTICIPANT_FIELD_READ_ONLY`.

### `Вышел`
- `AE` — не дата выхода;
- правильный порядок `Вышел` повторяет physical row order стабильной группы в `База участников`;
- в admin UI: свежие выходы сверху, старые ниже, сортировка по source row ascending.

Строгую публичную validation `02_PUBLIC_SYNC_V4.js` не ослаблять.

---

## 5. Rollback v0.5.59 — не ломать

- auth: 12 сек + один transient retry; Android code 20 → `AUTH_TIMEOUT`;
- `Связаться` для участников без `@username` только через Worker/Голубца, не через прямой `tg://user?id`;
- contact actions восстанавливаются после Back/rerender;
- hybrid search + server `searchKeys`;
- exact alias `BbllllKA / Royal Kingdom ↔ вышка`;
- active-team gold + кликабельный крот + каталог базы спецназа;
- один persistent IndexedDB cache для avatars/team photos;
- iOS-safe team-photo guard `0.5.59.2`;
- не возвращать сломанный fast-path `0.5.59.3`;
- forward → top, Back → сохранённая позиция.

---

## 6. v0.6 / v0.6.1 frontend

Основные активные модули общего v0.6 runtime:
- `admin-v0600.js` = `0.6.0-read.3` / `admin-eligibility-v0600.js`;
- `admin-entry-relocation-v0600.js` = `0.6.0-admin-entry-relocation.2`;
- `admin-write-gate-v0600.js` = `0.6.0-write.5-gate.1`;
- `admin-write-v0600-v3.js` = `0.6.0-write.5-ui.8`;
- `admin-team-photo-v0600.js`;
- `admin-participant-edit-policy-v0600.js`;
- `admin-search-media-sort-v0600.js` = `0.6.0-admin-search-media-sort.2`;
- `admin-media-cache-v0600-v2.js` = `0.6.0-admin-media-cache.2`;
- `admin-team-detail-v0600.js` = `0.6.0-admin-team-detail.4`;
- **`admin-participant-detail-v0600.js` = `0.6.0-admin-participant-detail.2`**;
- **`admin-participant-nav-guard-v0600.js` = `0.6.0-admin-participant-nav-guard.1`**;
- **`admin-participant-memberships-v0600.js` = `0.6.0-admin-participant-memberships.2`**;
- **`admin-navigation-guard-v0600.js` = `0.6.0-admin-navigation-guard.3`**.

### Admin search / avatars
- поиск по participants/teams должен сохранять deterministic hybrid behavior обычного режима;
- ищет по CRM имени, Telegram имени, `@username`, ID, memberships, игровым никам, ролям, team leader/status/stat fields и доступным `searchKeys`;
- `BbllllKA ↔ вышка` сохранён;
- admin avatars используют один persistent cache с ordinary mode; primary key `avatar:<avatarFileId>`, `avatar:tg-<id>` — fallback/migration для записей без snapshot fileId.

### Admin participant list/detail — repo ready, smoke pending

В списке участников:
- raw Telegram ID **не показывается визуально**;
- ID остаётся только скрытым техническим identity для search/avatar/editor;
- `@username` показывается при наличии;
- memberships/команды теперь выводятся **отдельными ordinary-style плашками**, через те же `membership-list` / `membership-pill`, что и на обычной странице участников;
- каждая плашка показывает `команда + роль + игра`; несколько membership → несколько отдельных плашек;
- существующие `team-game-colors-v0535.js` и `active-teams-v0559.js` повторно декорируют эти же плашки: сохраняются цвета РМ/РК и золотая рамка для `Активен` по source-of-truth team status;
- старая единая текстовая строка команд в admin summary скрыта;
- плашки внутри admin summary display-only (`pointer-events:none`), поэтому весь summary остаётся единым navigation target и tap по карточке/плашке не уводит в ordinary/public route;
- tap по карточке больше не раскрывает старый `<details>` с техническими полями — открывает отдельный normal-style participant detail;
- `admin-participant-nav-guard-v0600.js` отключает pointer-events у ordinary avatar subtree внутри admin summary, чтобы тап по аватару не успевал открыть public participant profile раньше admin detail; весь summary остаётся единым navigation target.

Admin participant detail:
- источник = private `adminData.participants`, поэтому работает для `В чате`, `Вышел` и других admin-only записей;
- шапка использует обычный participant visual language: persistent avatar, имя, username/contact, rank visual когда public participant/rank доступен;
- показываются memberships с ролью, игровым ником и игрой;
- команда в membership кликабельна → `RoyalAdminTeamDetailV0600.open(name, game)`;
- полный admin block показывает row, CRM name, Telegram name, `@username`, raw Telegram ID, status T, date V, lastChange AE, chatState AF;
- числовые карточки: `Спецназ U`, `Скрины AB`, `Активность в базе AC`, `Активность вне базы AD`;
- кнопка **`✏️ Редактировать участника`** переиспользует существующий hardened editor; второго write-flow нет;
- server whitelist не расширен: edit по-прежнему только `name + memberships`.

Participant metric rankings:
- U → `specnaz`;
- AB → `screens`;
- AC → `activityBase`;
- AD → `activityOutside`;
- источник = полный private `adminData.participants`;
- сортировка numeric descending, нули остаются внизу, tie-break по display name/Telegram ID;
- row показывает место, имя, chat/status, первые memberships и выбранное значение;
- текущий участник подсвечивается;
- tap по строке рейтинга → admin participant detail;
- avatars намеренно не грузятся для всех ranking rows, чтобы не делать media prewarm;
- Back использует существующий `RoyalNav` capture.

### Admin team list/detail
- список команд включает `Активен`, `На паузе`, `Неактивен` из private admin snapshot;
- tap по команде открывает normal-style detail: большое фото, название/игра, participants/leaders/helpers, полный состав;
- detail дополнительно показывает private поля `D:L`: лидер/подпись, игроков, общий спецназ, сортировка, скрины, активность в базе, активность вне базы, среднее, статус + source row;
- кнопка **`✏️ Редактировать команду`** использует существующий hardened editor, второй write-flow не создаётся;
- текущий team write: `name + leader`; photo — через photo module; E:L пока read-only, статус L пока только просмотр;
- large photo и thumbnail используют один team key `team:<normalized name>\n<normalized game>`;
- участники внутри `Состав команды` остаются визуально ordinary-style, но **любая навигация из admin team detail должна оставаться admin**;
- подтверждённый legacy-конфликт ordinary mode: `participant-profile-v0523.js` открывает public participant profile по avatar `pointerdown/pointerup`, а `participant-card-ux-v0531.js` открывает public profile по click всей `.team-member`;
- `admin-navigation-guard-v0600.js .3` перехватывает admin roster `pointerdown/pointerup` на `window` capture до document-level ordinary router, а click всей строки также маршрутизирует в `RoyalAdminParticipantDetailV0600.open(rawTelegramId)`;
- дополнительно ordinary `RoyalOpenParticipantByTelegramId` обёрнут защитой: при видимом admin context participant переход не должен открыть public detail;
- `@username` / `data-user-menu` остаётся самостоятельным contact action и не маршрутизируется в participant detail;
- Telegram WebView повторная проверка этого конкретного пути после build `2328` ещё pending.

### Admin team metric rankings — repo ready, smoke pending

В `admin-team-detail-v0600.js .4` шесть карточек статистики кликабельны:
- `Игроков E` → `players`;
- `Общий спецназ F` → `specnazTrips`;
- `Скрины H` → `screens`;
- `Активность в базе I` → `activityBase`;
- `Активность вне базы J` → `activityOutside`;
- `Среднее K` → `average`.

Поведение рейтинга:
- источник = private `adminData.teams`, без нового backend/API;
- входят все admin-команды, включая `Неактивен` и нулевые значения;
- numeric descending, tie-break = team name/game;
- место, команда, игра, статус, значение;
- исходная команда подсвечивается;
- tap по строке → admin team-detail;
- без 128 thumbnails/network prewarm;
- Back → предыдущий detail/list state.

### Admin entry + guarded deletion — live build 1435 / write.5

- плитка `Админ режим` больше не занимает место в основном grid: после подтверждения admin eligibility она скрывается, а кнопка переносится внутрь `#selfProfileCard .self-profile-head`, справа от имени/username;
- relocation переживает повторный render self-profile через `MutationObserver`; если eligibility исчезла, перенесённая кнопка удаляется;
- delete-кнопка участника видна прямо на admin participant detail только при `chatState = Вышел`;
- delete-кнопка команды видна прямо на admin team detail только при `status = Неактивен` и `players = 0`;
- перед direct delete frontend повторно загружает свежую private card/revision; кнопки в modal editor также сохранены;
- перед каждой операцией Telegram `showConfirm`/browser confirm задаёт явный вопрос `Точно хотите удалить...`;
- frontend-условия не являются защитой: Apps Script повторно читает live Sheet под lock и отклоняет операцию при изменившемся status/count/revision;
- после успеха private snapshot обновляется, cache сбрасывается, удалённая запись исчезает из admin list/table;
- свежий private snapshot: 207 participants, 129 admin teams; `Вышел` = 16; `Неактивен` = 26, из них E=0 = 25; одна неактивная команда с ненулевым E остаётся заблокированной.

**Статус frontend:** default release entrypoint = **v0.6.1**. Общий runtime переиспользует v0.6.0 shell/modules; atomic membership backend и immediate unified refresh подтверждены предыдущим production-smoke. Guarded deletes, admin roster navigation и полный Android/iOS smoke остаются отдельными проверками.

---

## 7. Медиакэш

Один IndexedDB: **`royal-crm-media-cache / images`**.

- avatar primary key: `avatar:<avatarFileId>`;
- если snapshot не содержит `avatarFileId`, client использует стабильный fallback key `avatar:tg-<id>`;
- team key: `team:<normalized team>\n<normalized game>`;
- cache-first: memory/disk → network;
- avatar network concurrency остаётся ≤ 2 в persistent flow;
- с Worker `1.31.0` отсутствие `avatarFileId` у участника `В чате` больше не означает немедленный буквенный placeholder: после authenticated 404 Worker делает узкий on-demand `getUserProfilePhotos`, выбирает наибольший размер и отдаёт изображение через существующий защищённый `/avatar?fileId=...` flow;
- Telegram fallback не делает массового prewarm и не раскрывает bot token/fileId браузеру;
- team photo background refresh не чаще ~30 мин;
- без массового сетевого prewarm;
- admin `/admin-team-photo` сначала ищет private SHA-256 media по identity `name + game`, `photoUrl` только fallback;
- пустой `Фото C` в admin UI не является доказательством отсутствия private media.

---

## 8. Worker

Frontend Worker origin: `https://royal-crm-miniapp-api.tropical-spoon.workers.dev`.

Repo config на 23.08.2026:
- `worker/wrangler.toml` → **`src/entry-v1310.js`**;
- `entry-v1310.js` объявляет Worker **`1.31.0`** и `avatarFallback=telegram-getUserProfilePhotos`;
- commits hotfix: `d5b8055` (новый wrapper) и `a34b6bd` (переключение wrangler main);
- Cloudflare Builds настроен на GitHub `main`, root path `/worker`; commit в repo ожидаемо запускает deploy, но GitHub commit сам по себе не является runtime-подтверждением;
- последняя независимо подтверждённая в документации production-цепочка до этого hotfix сохраняла signed background snapshot refresh и pinned deployment guard;
- `/admin-data` — admin-only private read;
- `/admin-write` — authenticated admin mutation;
- `/admin-team-photo` — protected private media route;
- public `/snapshot`, `/team-photo`, `/contact-by-id`, auth/media routes не должны регрессировать.

`entry-v1310.js` оборачивает текущий `entry-v1290.js` и не заменяет существующую auth/media реализацию. Live-avatar fallback запускается только после штатного authenticated `AVATAR_NOT_FOUND`, повторно подтверждает присутствие участника в разрешённом snapshot и лишь затем обращается к Telegram Bot API. Если Telegram не отдаёт фото или privacy не позволяет его получить, сохраняется прежний 404/placeholder contract.

---

## 9. Credits

`Помощь в разработке, тесты`:
- `@sfinks_spb`
- `@O_Chaplygina`
- `@Yanochka_2404`
- `@DmitryRoyal`

---

## 10. Минимальный smoke текущего v0.6.1

1. Обычный `app.html` открывает `app-v0601.html`, затем общий v0.6 runtime с сохранением Telegram query/hash; v0.5.59 остаётся rollback target.
2. Не-админ не получает admin-data/write.
3. Existing participant editor: только имя + memberships; прямой system-field write отклоняется.
4. CreateTeam с фото, atomic participant memberships, последовательные edits и background snapshot convergence подтверждены. Повторить smoke на обезличенных тестовых данных и проверить, что committed UI не перезаписывается stale snapshot.
5. Team rename каскадит memberships; team photo upload/rename cleanup работают.
6. Admin avatars/team photos повторно читаются из общего persistent cache. Для записи без snapshot `avatarFileId`, но с доступным Telegram profile photo, после reload должна появиться фотография и сохраниться под `avatar:tg-<id>` до появления canonical fileId.
7. Admin search проверяется по имени/@/ID/role/nickname/team + `вышка`.
8. `Вышел` сравнить с physical order таблицы.
9. Admin participant list: visible ID отсутствует; каждая membership показана отдельной ordinary-style плашкой `команда + роль + игра`; РМ/РК окраска и золото `Активен` совпадают с обычной страницей; tap по summary, аватару и области плашек → именно admin participant detail, не accordion/public profile/team route.
10. Admin participant detail: все private поля, persistent avatar, memberships → team detail, editor; U/AB/AC/AD → rankings descending; tap row → participant; Back state.
11. Admin team detail: фото, D:L, editor, состав, включая минимум одну `Неактивен`; **tap по аватару, имени и свободной области строки участника состава → admin participant detail с private data/editor, не ordinary `ДОСТИЖЕНИЯ`; tap по `@username` остаётся contact action.**
12. Нажать E/F/H/I/J/K и проверить каждый team ranking: all teams, descending, нули внизу, tap team → detail, Back.
13. На главной admin-кнопка находится справа от имени админа в self-profile; старая grid-плитка отсутствует; после Back/rerender кнопка остаётся одна и открывает admin mode.
14. Участник не `Вышел`: delete-кнопки нет и прямой `deleteParticipant` отклоняется. `Вышел`: отмена confirm ничего не меняет; подтверждение очищает source-поля, запись исчезает из admin list, formula arrays T/W:AA остаются.
15. Команда `Активен`/`На паузе`, `Неактивен` с E>0 или с фактической membership-ссылкой: delete запрещён. Только `Неактивен` + E=0 + refs=0 после confirm очищает A:D и исчезает из admin list; E:L formulas остаются.
16. Проверить Android и iPhone/iPad Telegram WebView.

---

## 11. Что нельзя откатить

- launch `search + hash`/Telegram initData;
- raw Telegram ID participant identity;
- team identity `название + игра`;
- cascade rename 5 membership slots;
- strict public validation;
- `searchKeys`/`searchIndexVersion`;
- `BbllllKA ↔ вышка`;
- one persistent media cache identities;
- avatar canonical cache identity `avatar:<avatarFileId>` + `avatar:tg-<id>` fallback для временно отсутствующего fileId;
- authenticated live Telegram avatar fallback не должен обходить snapshot membership/auth и не должен превращаться в массовый prewarm;
- iOS source-preservation guard;
- `Связаться` только через Worker/Голубца;
- existing-participant server whitelist `name + memberships`;
- membership write atomic: один range write, validation-safe role update и rollback исходных values/rules;
- Worker-signed HMAC admin write;
- committed app write запускает Worker-signed direct unified snapshot refresh; manual Sheet edit использует installable-trigger direct flush; one-off clock и 5-minute trigger остаются fallback;
- destructive writes server-gated: participant только `AF=Вышел`; team только `L=Неактивен`, `E=0` и live membership refs=0; optimistic revision + confirm + journal обязательны;
- exited physical-row ordering;
- admin hybrid search;
- admin participant list without visible Telegram ID;
- admin participant list memberships use ordinary `membership-list` / `membership-pill` visuals with existing RM/RK and active-team decorators; не возвращать одну текстовую строку команд;
- admin participant summary/avatar/membership area navigation must resolve to admin participant detail before ordinary public-profile/team handlers;
- **admin team roster participant navigation must resolve to admin participant detail before legacy ordinary avatar-pointer and `.team-member` click routers; `@username` remains an independent action;**
- admin participant detail from private snapshot + U/AB/AC/AD rankings;
- admin team detail from private snapshot including inactive;
- admin team metric rankings E/F/H/I/J/K from full private team set.

После принятой/проверенной правки обязательно обновлять этот файл и добавлять новую верхнюю запись в `WORK_HISTORY.md`.