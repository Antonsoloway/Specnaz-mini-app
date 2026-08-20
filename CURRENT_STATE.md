# Royal CRM / «Таблица ЧП» — CURRENT STATE

> **Актуально на 20.08.2026.**
> Новый чат обязан сначала прочитать `START_HERE.md`, затем этот файл и последние записи `WORK_HISTORY.md`.
> Фактический runtime / живые Google Sheets / live Apps Script / текущий GitHub имеют приоритет над памятью чатов.

## 1. Обязательный протокол работы

1. Не менять код по памяти: сначала открыть фактический файл/SHA/подключение.
2. Если задача зависит от данных — сверить `snapshot.json`, private `admin-snapshot.json` и/или живую Google Sheets.
3. Для Apps Script использовать `apps-script-live/` как зеркало последнего `clasp pull`; перед `clasp push` обязательны backup/pull и `clasp status`; после push снова синхронизировать live mirror.
4. Не создавать новый Apps Script deployment, если достаточно обновить существующий **`Таблица ЧП 1.3`**.
5. GitHub commit не равен production/runtime-подтверждению.
6. После принятой/проверенной работы обновлять `CURRENT_STATE.md` и `WORK_HISTORY.md`; `RELEASE_RULES.md` — при новом постоянном инварианте.

---

## 2. Репозитории / входы

- основной repo: `Antonsoloway/Specnaz-mini-app`, branch `main`;
- data repo: `Antonsoloway/royal-crm-data`;
- постоянный entrypoint: `app.html`;
- обычный запуск → **`app-v0559.html` / v0.5.59**;
- `startapp=v0600` / `tgWebAppStartParam=v0600` → **`app-v0600.html` / v0.6.0 admin preview**;
- временный cache-forced preview для проверки текущего фикса: `startapp=v0600-2328` → тот же `app-v0600.html`, но с уникальным start parameter;
- обычных пользователей пока не переводить на v0.6;
- bot: `@doveofpeace_bot`.

Текущий preview delivery:
- `version-v0600.js` cache-bust: **`20260820-2328`**;
- `app-v0600.html` → `version-v0600.js?v=20260820-2328`;
- `app.html` previewBuild: **`20260820-2328`**;
- `app.html` принимает `v0600` и временный cache-forced alias `v0600-2328`.

---

## 3. Live Apps Script / admin backend

Подтверждено на 20.08.2026:
- private admin snapshot: `adminData.version = 0.6.0-write.4`;
- optimistic `revision` у participant/team records;
- write transport: **Mini App → Worker → HMAC → Apps Script → Google Sheets**;
- HMAC secret не попадает в браузер/GitHub;
- существующий deployment **`Таблица ЧП 1.3`** сохранён;
- delete operations в v0.6 выключены;
- team photo capability + rename cleanup подтверждались установщиком.

Live modules:
- `28_MINIAPP_ADMIN_DATA.js` — private admin read;
- `29_MINIAPP_ADMIN_WRITE.js` — validation/helpers;
- `30_MINIAPP_ADMIN_WRITE_BACKEND.js` — signed gateway;
- `31_MINIAPP_ADMIN_WRITE_HARDENED.js` — hardened mutations/policies;
- `32_MINIAPP_ADMIN_TEAM_PHOTO.js`, `33_MINIAPP_ADMIN_WRITE_FINAL.js` — team photo/final integration.

Public snapshot:
- Unified Snapshot Writer `1.2.4`;
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

## 5. Стабильная v0.5.59 — не ломать

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

## 6. v0.6 admin preview — frontend

Основные активные модули:
- `admin-v0600.js` / `admin-eligibility-v0600.js`;
- `admin-write-gate-v0600.js`;
- `admin-write-v0600-v3.js`;
- `admin-team-photo-v0600.js`;
- `admin-participant-edit-policy-v0600.js`;
- `admin-search-media-sort-v0600.js` = `0.6.0-admin-search-media-sort.2`;
- `admin-media-cache-v0600-v2.js` = `0.6.0-admin-media-cache.2`;
- `admin-team-detail-v0600.js` = `0.6.0-admin-team-detail.3`;
- **`admin-participant-detail-v0600.js` = `0.6.0-admin-participant-detail.1`**;
- **`admin-participant-nav-guard-v0600.js` = `0.6.0-admin-participant-nav-guard.1`**;
- **`admin-participant-memberships-v0600.js` = `0.6.0-admin-participant-memberships.1`**;
- **`admin-navigation-guard-v0600.js` = `0.6.0-admin-navigation-guard.3`**.

### Admin search / avatars
- поиск по participants/teams должен сохранять deterministic hybrid behavior обычного режима;
- ищет по CRM имени, Telegram имени, `@username`, ID, memberships, игровым никам, ролям, team leader/status/stat fields и доступным `searchKeys`;
- `BbllllKA ↔ вышка` сохранён;
- admin avatars используют один persistent cache с ordinary mode; primary key `avatar:<avatarFileId>`, `avatar:tg-<id>` только fallback/migration.

### Admin participant list/detail — repo ready, smoke pending

В списке участников:
- raw Telegram ID **не показывается визуально**;
- ID остаётся только скрытым техническим identity для search/avatar/editor;
- `@username` показывается при наличии;
- memberships/команды теперь выводятся **отдельными ordinary-style плашками**, через те же `membership-list` / `membership-pill`, что и на обычной странице участников v0.5.59;
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

В `admin-team-detail-v0600.js .3` шесть карточек статистики кликабельны:
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

**Статус frontend:** GitHub `main` фактически на preview delivery **`20260820-2328`**. После пользовательского видео `1000238605.mp4` подтверждён конкретный регресс: tap participant в составе admin team detail открывал ordinary/public participant page с `ДОСТИЖЕНИЯ`. Корень — два legacy ordinary router (`avatar pointerup` + `.team-member click`). В repo исправлено `admin-navigation-guard-v0600.js .3`, добавлен cache-forced start alias `v0600-2328`. Apps Script/Worker/Sheets/data этой правкой не менялись; Cloud Shell не нужен. **Telegram WebView re-smoke build 2328 ещё требуется; production/runtime не объявлять подтверждённым только по commit.**

---

## 7. Медиакэш

Один IndexedDB: **`royal-crm-media-cache / images`**.

- avatar primary key: `avatar:<avatarFileId>`;
- team key: `team:<normalized team>\n<normalized game>`;
- cache-first: memory/disk → network;
- team photo background refresh не чаще ~30 мин;
- без массового сетевого prewarm;
- admin `/admin-team-photo` сначала ищет private SHA-256 media по identity `name + game`, `photoUrl` только fallback;
- пустой `Фото C` в admin UI не является доказательством отсутствия private media.

---

## 8. Worker

Frontend Worker origin: `https://royal-crm-miniapp-api.tropical-spoon.workers.dev`.

Repo config:
- `worker/wrangler.toml` → `src/entry-v1241.js`;
- source version `1.24.1`;
- `/admin-data` — admin-only private read;
- `/admin-write` — authenticated admin mutation;
- `/admin-team-photo` — protected private media route;
- public `/snapshot`, `/team-photo`, `/contact-by-id`, auth/media routes не должны регрессировать.

`entry-v1241.js` source/config лежат в `main`; если production runtime не проверен отдельно, не называть его подтверждённым только из-за GitHub commit.

---

## 9. Credits

`Помощь в разработке, тесты`:
- `@sfinks_spb`
- `@O_Chaplygina`
- `@Yanochka_2404`
- `@DmitryRoyal`

---

## 10. Минимальный smoke v0.6 перед общим релизом

1. Обычный `startapp` остаётся v0.5.59; `startapp=v0600` открывает v0.6. Для принудительно свежей проверки текущего admin-navigation fix использовать `startapp=v0600-2328`.
2. Не-админ не получает admin-data/write.
3. Existing participant editor: только имя + memberships; прямой system-field write отклоняется.
4. Разрешённое test write читается обратно и появляется в журнале; stale revision не перезаписывает новое.
5. Team rename каскадит memberships; team photo upload/rename cleanup работают.
6. Admin avatars/team photos повторно читаются из общего persistent cache.
7. Admin search проверяется по имени/@/ID/role/nickname/team + `вышка`.
8. `Вышел` сравнить с physical order таблицы.
9. Admin participant list: visible ID отсутствует; каждая membership показана отдельной ordinary-style плашкой `команда + роль + игра`; РМ/РК окраска и золото `Активен` совпадают с обычной страницей; tap по summary, аватару и области плашек → именно admin participant detail, не accordion/public profile/team route.
10. Admin participant detail: все private поля, persistent avatar, memberships → team detail, editor; U/AB/AC/AD → rankings descending; tap row → participant; Back state.
11. Admin team detail: фото, D:L, editor, состав, включая минимум одну `Неактивен`; **tap по аватару, имени и свободной области строки участника состава → admin participant detail с private data/editor, не ordinary `ДОСТИЖЕНИЯ`; tap по `@username` остаётся contact action.**
12. Нажать E/F/H/I/J/K и проверить каждый team ranking: all teams, descending, нули внизу, tap team → detail, Back.
13. Проверить Android и iPhone/iPad Telegram WebView.

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
- iOS source-preservation guard;
- `Связаться` только через Worker/Голубца;
- existing-participant server whitelist `name + memberships`;
- Worker-signed HMAC admin write;
- delete off;
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