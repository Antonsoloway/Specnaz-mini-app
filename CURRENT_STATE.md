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
- `app-v0601.html` сохраняет query/hash и передаёт запуск в общий runtime `app-v0600.html` с `releaseBuild=20260824-v061-visual-stability1`;
- `app-v0559.html` / v0.5.59 сохранён как rollback target, но больше не является текущей default-версией;
- bot: `@doveofpeace_bot`.

Текущий release delivery:
- `app.html` → `app-v0601.html`, cache marker **`20260824-v061-visual-stability1`**;
- внешний release номер = **v0.6.1**; общий runtime всё ещё переиспользует `app-v0600.html` и его v0.6-модули;
- `v061-runtime-compat.js` = **`0.6.1-runtime.2`**: защищённый `/snapshot` получает bounded transient retry и один автоматический recovery после исчерпания первой серии;
- `app-v0600.html` принудительно загружает этот runtime bridge с cache-bust `20260823-v061-snapshot-resilience1`;
- `profile-team-link-v061.js` и `changelog-v0601.js` подключены из конечного runtime;
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
- avatars намеренно не грузятся для всех 207 ranking rows, чтобы не делать media prewarm;
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
- production Worker `1.32.1` при отсутствии canonical avatarFileId сначала проверяет авторизованный participant allow-list, затем может использовать private last-known registry/private media cache и только после этого live Telegram fallback;
- private cached avatar bytes и last-known fileId остаются server-side и не раскрываются браузеру;
- live fileId не передаётся в legacy `/avatar?fileId` route, потому что тот специально разрешает только fileId, уже зафиксированные в snapshot;
- Telegram fallback не делает массового prewarm и не раскрывает bot token/fileId браузеру;
- team photo background refresh не чаще ~30 мин;
- без массового сетевого prewarm;
- admin `/admin-team-photo` сначала ищет private SHA-256 media по identity `name + game`, `photoUrl` только fallback;
- пустой `Фото C` в admin UI не является доказательством отсутствия private media.

---

## 8. Worker

Frontend Worker origin: `https://royal-crm-miniapp-api.tropical-spoon.workers.dev`.

Repo config на 23.08.2026:
- `worker/wrangler.toml` → **`src/entry-v1320.js`**;
- `entry-v1320.js` объявляет production wrapper **`1.32.1`**;
- avatar contract: `private-media-cache+last-known+telegram-live`, private last-known registry + private GitHub media fallback;
- wrapper сохраняет базовую auth/snapshot/admin/media реализацию предыдущей цепочки и не меняет существующие admin write policies;
- Cloudflare Builds настроен на GitHub `main`, root path `/worker`; commit в repo ожидаемо запускает deploy, но GitHub commit сам по себе не является runtime-подтверждением;
- `/admin-data` — admin-only private read;
- `/admin-write` — authenticated admin mutation;
- `/admin-team-photo` — protected private media route;
- public `/snapshot`, `/team-photo`, `/contact-by-id`, auth/media routes не должны регрессировать.

`entry-v1320.js` сначала повторно авторизует участника через protected `/snapshot`, затем для missing avatar может прочитать private last-known registry и private cached bytes; если private cache не помогает — использует Telegram fallback. Bot token, private fileId и private media paths не выдаются клиенту.

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
17. Для startup snapshot: краткий сетевой `Failed to fetch`/429/502/503/504 не должен сразу оставлять пользователя на degraded screen; runtime делает bounded retry и один automatic recovery. Если все попытки реально исчерпаны, ограниченный режим остаётся доступен.

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
- live Telegram avatar discovered fileId не должен отправляться через legacy `/avatar?fileId` snapshot allow-list; proxy разрешён только после participant allow-list и остаётся server-side;
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
- admin team metric rankings E/F/H/I/J/K from full private team set;
- v0.6.1 startup snapshot resilience: transient Worker/network errors are retried client-side before degraded mode is treated as final.

После принятой/проверенной правки обязательно обновлять этот файл и добавлять новую верхнюю запись в `WORK_HISTORY.md`.

---

## v0.6.1 music menu recovery — 23.08.2026 [V061_MUSIC_MENU_FINAL2_20260823]

- Participant avatar hotfix подтверждён пользователем на реальном Telegram-устройстве: ранее проблемные фотографии загружаются.
- Frontend music root fix находится в `main`: `app.js` экспортирует protected audio runtime для всей ветки `0.6.x`; active marker = `20260823-v061-music-live3`.
- Live `22_MINIAPP_BOT_APP_MENU.js` направляет bot Web App на `app.html?cb=20260823-v061-music-live3`.
- `clasp run` для этого standalone Apps Script не используется; menu application выполняется через временный tokenized web-app invoker.
- Temporary route удалён после вызова; сохранён существующий deployment `Таблица ЧП 1.3`, новый deployment не создавался.
- Telegram menu verification = **CONFIRMED**.
- После операции live Apps Script повторно синхронизирован в `apps-script-live/`.
- Предыдущий final recovery остановился на небезопасном shell heredoc при записи handoff; эта версия пишет handoff через Python без shell command substitution.

---

## v0.6.1 own-profile team navigation — 23.08.2026 [V061_SELF_PROFILE_TEAM_LINK_20260823]

- `profile-team-link-v061.js` обновлён до `0.6.1-profile-team-link.2`.
- На главной странице membership-плашки в собственной карточке профиля получают безопасный ordinary team route и становятся кликабельными.
- Для team identity передаётся пара `название + игра`, поэтому одинаковые названия в Royal Match / Royal Kingdom не смешиваются.
- Legacy `profile-card-v0523.js` не менялся: rollback v0.5.59 сохранён.
- Release/cache marker = `20260823-v061-self-team-link1`; Telegram menu verification = **CONFIRMED**.
- `changelog-v0601.js` дополнен этой возможностью.
- Изменение frontend-only; Sheets/CRM данные не изменялись. Device smoke перехода из своей карточки остаётся acceptance check пользователя.

---

## Security hardening — 23.08.2026 [SECURITY_SHEETS_WEBHOOK_STAGE_20260823]

- Обе рабочие Google Sheets переведены из `anyone:writer` в Restricted; Drive metadata после изменения показывает только owner permission и `shared=false`.
- Это не меняет runtime-модель: Apps Script deployment `Таблица ЧП 1.3` остаётся `executeAs=USER_DEPLOYING`, поэтому `SpreadsheetApp.openById(...)` продолжает работать от имени владельца.
- Публичный Apps Script web-app endpoint не закрывался: внешний API по-прежнему требует доступ через deployment, а не прямой доступ к Sheets.
- Hardcoded webhook credential удалён из текущего live source и перенесён в Script Properties.
- Начата безопасная staged rotation: новый current secret хранится только в Script Properties/локальном защищённом файле Cloud Shell; прежний secret временно принят как previous, чтобы не остановить действующий ChatKeeper webhook до переключения отправителя.
- Финальный security шаг: заменить secret в ChatKeeper на новый current, затем удалить previous property отдельным финализатором.

---

## Webhook secret rotation finalized — 23.08.2026 [SECURITY_WEBHOOK_ROTATION_FINAL_20260823]

- ChatKeeper sender переведён на новый webhook secret.
- `ROYAL_CRM_WEBHOOK_SECRET_PREVIOUS` удалён из Script Properties; публично раскрытый legacy credential больше не принимается.
- Единственный действующий webhook secret хранится только в Script Properties; в текущем public Apps Script mirror literal credential отсутствует.
- Existing deployment `Таблица ЧП 1.3` сохранён; temporary migration route удалён.

---

## v0.6.1 snapshot startup resilience — 23.08.2026 [V061_SNAPSHOT_RESILIENCE_20260823]

- Повторяющийся startup screen `Данные пока не загрузились / Failed to fetch` локализован в public `/snapshot` path: auth уже мог быть успешным, но transport выполнял snapshot network request только один раз.
- `v061-runtime-compat.js` обновлён до `0.6.1-runtime.2` и оборачивает только Worker `/snapshot`: повторяет transient network failure и HTTP 429/502/503/504 с коротким bounded backoff.
- Если первая серия всё же исчерпана и lifecycle выдаёт `snapshot-error`, выполняется один automatic background `reloadSnapshot()`; успешный `snapshot-ready` сам закрывает degraded startup без обязательного ручного нажатия.
- Auth/admin-write/admin-data/media contracts не менялись; security lockdown Sheets и webhook secret rotation не откатывались.
- `app.html`, `app-v0601.html`, runtime bridge и changelog переведены на cache marker `20260823-v061-snapshot-resilience1`.
- `changelog-v0601.js` дополнен этой правкой; требуется device smoke повторным закрытием/открытием Mini App через Telegram.

---

## v0.6.1 repeated Specnaz history links — 23.08.2026 [V061_HISTORY_LINK_RELIABILITY2_20260823]

- Первый history-link hotfix не принят: device smoke показал, что повторные переходы после возврата из Telegram остаются нестабильными.
- v2 переносит ownership физического Android touch на `window` capture до legacy document click-router; один tap вызывает ровно один `openTelegramLink`, без таймерного повторного deep-link.
- Для touch используется отдельный touchstart/touchend guard; generated click подавляется тем же capture-router, а после возврата dedupe автоматически переармируется.
- Активный frontend/menu marker = `20260823-v061-history-link2`; Telegram menu verification = **CONFIRMED**.
- Кнопка `Связаться` без username ранее подтверждена пользователем как работающая после Worker v1.35.0.
- Production acceptance history-link v2 остаётся device smoke: несколько разных ссылок подряд с возвратом в Mini App.


---

## v0.6.1 participant identity consistency — 23.08.2026 [V061_PARTICIPANT_IDENTITY_20260823]

- Добавлен `participant-identity-v061-v2.js` = `0.6.1-participant-identity.4`.
- Во всех participant surfaces v0.6.1 унифицирована видимая identity: **CRM name → кликабельный @username (если есть) → Telegram display name**.
- Покрыты ordinary participant list, team members, self/profile detail, Specnaz hero/history, directory cards, admin participant list/detail, admin team members и admin participant rankings.
- В ordinary UI raw Telegram ID визуально не раскрывается; admin detail сохраняет ID как защищённое admin-only поле.
- Узкие карточки получили перенос CRM-name и меньший reserved rank strip, чтобы identity не перекрывалась значками звания/ачивок.
- Rollback v0.5.59 не изменён: новый модуль исполняется только при `__ROYAL_BUILD__ === '0.6.1'`.
- Release/cache marker = `20260823-v061-identity2`; Telegram menu verification = **CONFIRMED**.
- Device smoke всех основных participant surfaces остаётся acceptance check пользователя.


- v0.6.1 participant identity consistency: device smoke подтверждён пользователем 23.08.2026 — отображение CRM-имени, @username и Telegram-имени принято.


---

## v0.6.1 Specnaz roomy cards — 23.08.2026 [V061_SPECNAZ_LAYOUT_20260823]

- Добавлен `specnaz-layout-v061.css`, исполняемый только через текущий v0.6.1 entrypoint.
- `Герои спецназа`: карточки используют больше ширины panel; на мобильном имя/achievement strip/@username/Telegram name идут устойчивым вертикальным потоком, score переносится в отдельную grid-строку и карточка растёт по высоте.
- `История спецназа`: список и строки расширены; identity + rank на узких экранах раскладываются в отдельные строки, scoreline умеет переноситься.
- Ничего не должно обрезаться или накладываться; длинные строки используют wrap/overflow-wrap.
- Legacy `specnaz.css` v0.5.59 не изменён.
- Release/cache marker = `20260823-v061-specnaz-layout1`; Telegram menu cache принудительно обновлён через существующий Apps Script deployment `Таблица ЧП 1.3`.
- Device smoke hero/history layout остаётся acceptance check пользователя.


---

## v0.6.1 Specnaz achievement alignment — 23.08.2026 [V061_SPECNAZ_ACHIEVEMENT_ALIGN_CONFIRMED_20260823]

- `Герои спецназа`: achievement stack выровнен по правому краю; порядок `Админ → звание → МАЯК`, MAYAK не уезжает влево.
- Frontend/cache marker = `20260823-v061-specnaz-layout2`.
- Telegram bot menu URL подтверждён с `20260823-v061-specnaz-layout2` корректным JSON verifier.
- Предыдущие `AssertionError` были ложным отрицательным результатом verification-script: heredoc занимал stdin Python и не давал ему прочитать JSON из curl.
- Существующий deployment `Таблица ЧП 1.3` сохранён, временный route удалён, live Apps Script mirror синхронизирован.
- Device smoke визуального выравнивания остаётся acceptance check пользователя.


---

## v0.6.1 Android visual stability — 24.08.2026 [V061_VISUAL_STABILITY_20260824]

- Предыдущее выравнивание achievement stack `Админ → звание → МАЯК` подтверждено пользователем на устройстве.
- По присланной записи зафиксированы два одно-кадровых визуальных провала примерно в 10.87s и 31.49s; интервал около 20.6s. Это не keyframe видео: в момент сбоя WebView кратко показывает placeholder/перекомпоновку изображения и сразу возвращает исходный кадр.
- Найден постоянный legacy rank visibility polling: `rank-system-v0524.js` каждые 1.6s делал `getBoundingClientRect()` для всех `.rank-badge--compact`, плюс такой же scan на scroll/resize. Для v0.6.1 он теперь перехватывается только на время загрузки legacy rank module и не запускается.
- `v061-visual-stability.js` переключает `rank-is-visible` через `IntersectionObserver`; новые динамические карточки подхватываются `MutationObserver` без периодического layout scan. Legacy v0.5.59 исходники не изменены.
- `rank-visual-stability-v061.css`: переливание больше не перемещает широкий pseudo-element за пределы rank badge; блик анимирует background-position внутри clip-mask самой плашки. Crest/wings не обрезаются.
- Frontend/menu marker = `20260824-v061-visual-stability1`; Telegram menu подтверждён. Существующий deployment `Таблица ЧП 1.3` сохранён, temporary invoker удалён, live Apps Script mirror синхронизирован.
- Device acceptance: оставить приложение открытым минимум 45–60 секунд на нескольких страницах и проверить отсутствие периодического twitch; отдельно проверить, что shimmer остаётся внутри плашки звания.


---

## v0.6.1 team photo replacement cache — 24.08.2026 [V061_TEAM_PHOTO_REFRESH_20260824]

- Device test showed that the previous Android visual-stability attempt did not remove the periodic whole-screen twitch; that issue is parked for separate diagnosis and must not be marked resolved.
- A team photo replacement was confirmed committed by admin journal and both private/public snapshots, while the device still rendered the previous image. Root cause: legacy ordinary/admin persistent media caches use stable `team:<name>\n<game>` identity and could reuse the old in-memory/disk blob for up to 30 minutes after photo content changed.
- `team-photo-refresh-v061.js` adds a v0.6.1 content-versioned photo layer. Public photo identity follows current snapshot photo source; admin identity uses the protected photo content version. Successful admin photo writes invalidate the same team+game immediately and refetch the current image without waiting for the legacy refresh window.
- The bridge overrides the active ordinary team-detail loader and admin persistent-team loader while leaving v0.5.59 source files unchanged. Admin list/detail images are re-applied after legacy cache writes so stale memory cannot win the race.
- Frontend/menu marker = `20260824-v061-team-photo-refresh1`. Existing Apps Script deployment `Таблица ЧП 1.3` preserved; temporary verifier removed; live mirror synced.
- Device acceptance pending: replace a team photo with different content and verify the new image appears immediately in admin detail and after reopening the ordinary team card.


---

## v0.6.1 periodic screen twitch — 24.08.2026 [V061_SCREEN_TWITCH_WATCHDOG_FIX_20260824]

- User confirmed the prior team-photo replacement fix: a newly uploaded team photo appears after the cache-identity correction.
- Previous rank/compositor attempt did NOT remove the periodic full-screen twitch on the device; do not describe it as verified.
- Actual interval correlation found in `admin-write-v0600-v3.js`: `scheduleLiveSnapshotRefresh(5000)` starts a permanent watchdog, then `PUBLIC_SNAPSHOT_WATCH_MS=20000` reloads public snapshot every 20s, plus a 1s restart after visibility return. This matches the recorded ~20–25s cadence much more closely than rank shimmer.
- v0.6.1 now loads `v061-background-refresh-guard.js` before `admin-write-v0600-v3.js`; it suppresses only that legacy 5s/20s/visibility watchdog callback. Mutation-specific snapshot polling after real admin writes is preserved.
- Frontend/menu marker = `20260824-v061-screen-twitch1`; Telegram menu confirmed. Existing deployment `Таблица ЧП 1.3` preserved; temporary verifier route removed; live Apps Script mirror synchronized.
- Device acceptance still required: keep several ordinary/admin pages open 60–90s without interaction and confirm that the former periodic twitch no longer occurs.


- 24.08.2026 device acceptance: **CONFIRMED** — пользователь сообщил, что периодическое дёргание экрана после screen-twitch watchdog fix исчезло.


---

## v0.6.1 admin edit UX — 24.08.2026 [V061_ADMIN_EDIT_UX_20260824]

- Existing participant edit form is intentionally minimal: editable = CRM `name` + memberships (team/role/game nickname); Telegram name + Telegram ID remain read-only reference only.
- Existing participant edit no longer shows chat state, @username, date V, specnaz U, screens AB, activity AC/AD; those remain visible in the admin participant detail card and stay bot/system-owned.
- Create-participant flow is unchanged.
- Participant and team edit buttons are moved to the top of their admin detail surfaces; team edit appears before the large team photo so no long scroll is required.
- Frontend/menu marker = `20260824-v061-admin-edit-ux1`; Telegram menu confirmed. Existing deployment `Таблица ЧП 1.3` preserved; temporary route removed; live Apps Script mirror synchronized.
- Device smoke pending: open an existing participant edit and team detail on Telegram and verify the compact form/top buttons.


---

## v0.6.1 admin context integrity — 24.08.2026 [V061_ADMIN_CONTEXT_INTEGRITY_20260824]

- Periodic screen twitch fix is device-confirmed by the user.
- Admin navigation invariant strengthened: any participant/team transition originating from admin list/detail/ranking/roster stays on private admin detail pages. Physical Android pointer taps are captured at window level before legacy ordinary routers; ordinary team router also has an admin-context fallback guard.
- Regression after moving the team edit button upward: admin team photo could remain on castle fallback. `v061-admin-context-integrity.js` now re-arms protected photo loading after admin detail render and performs one authenticated `/admin-team-photo` refetch if the normal media bridge still has no image.
- Frontend/menu marker = `20260824-v061-admin-integrity1`; Telegram menu confirmed. Existing deployment `Таблица ЧП 1.3` preserved, temporary verifier removed, live Apps Script mirror synchronized.
- Device smoke pending: participant → team → participant navigation must remain admin-only and team photos must load with the edit button at the top.


---

## v0.6.1 admin UI controls — 24.08.2026 [V061_ADMIN_UI_CONTROLS_20260824]

- Admin team list mirrors ordinary game colors: Royal Kingdom = red cards, Royal Match = blue cards.
- Separate global «Режим редактирования» control is removed. The admin header exposes permanent «Добавить команду» and «Добавить участника» actions; existing records keep their direct edit entry points.
- Admin search now dismisses the mobile keyboard when pointer focus/scroll gesture leaves the active search field; Enter/Escape also release the field.
- Frontend + Telegram menu marker = `20260824-v061-admin-ui-controls1`. Existing Apps Script deployment `Таблица ЧП 1.3` was preserved and the live Apps Script mirror was synchronized before this handoff finalization.
- The first handoff attempt stopped only at changelog syntax validation because the third inserted JS array item lacked a trailing comma; production/frontend/menu work had already completed. This finalizer repairs only changelog/handoff state and does not redeploy Apps Script.


---

## v0.6.1 admin team media/navigation stability — 24.08.2026 [V061_ADMIN_TEAM_STABILITY_20260824]

- Device report: admin team image could appear and later fall back to the castle; occasionally opening a team immediately triggered its edit modal.
- Added `admin-team-stability-v061.js`. Every successful protected admin team image load is cloned into an independent session blob URL and reused as a fallback if legacy media refresh/cache races fail. This covers admin team-list thumbnails and admin team detail photo.
- Team detail edit control is shielded for 850 ms after a new detail DOM is created, preventing Android compatibility/ghost click from opening edit immediately after the navigation tap.
- Frontend/menu marker = `20260824-v061-admin-team-stability1`; existing deployment `Таблица ЧП 1.3` preserved; temporary menu verifier removed; live Apps Script mirror synchronized.
- Device smoke pending: repeatedly open several team cards, return to list, and verify images remain visible and edit opens only on a deliberate second tap.
