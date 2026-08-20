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
- обычных пользователей пока не переводить на v0.6;
- bot: `@doveofpeace_bot`.

Текущий preview delivery:
- `version-v0600.js` cache-bust: **`20260820-2105`**;
- `app-v0600.html` → `version-v0600.js?v=20260820-2105`;
- `app.html` previewBuild: **`20260820-2105`**.

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
- `32_MINIAPP_ADMIN_MEDIA.js`, `33_MINIAPP_ADMIN_WRITE_FINAL.js` — team photo/final integration.

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
- **`admin-team-detail-v0600.js` = `0.6.0-admin-team-detail.3`**.

### Admin search / avatars
- поиск по participants/teams должен сохранять deterministic hybrid behavior обычного режима;
- ищет по CRM имени, Telegram имени, `@username`, ID, memberships, игровым никам, ролям, team leader/status/stat fields и доступным `searchKeys`;
- `BbllllKA ↔ вышка` сохранён;
- admin avatars используют один persistent cache с ordinary mode; primary key `avatar:<avatarFileId>`, `avatar:tg-<id>` только fallback/migration.

### Admin team list/detail
- список команд включает `Активен`, `На паузе`, `Неактивен` из private admin snapshot;
- tap по команде открывает normal-style detail: большое фото, название/игра, participants/leaders/helpers, полный состав;
- detail дополнительно показывает private поля `D:L`: лидер/подпись, игроков, общий спецназ, сортировка, скрины, активность в базе, активность вне базы, среднее, статус + source row;
- кнопка **`✏️ Редактировать команду`** использует существующий hardened editor, второй write-flow не создаётся;
- текущий team write: `name + leader`; photo — через photo module; E:L пока read-only, статус L пока только просмотр;
- large photo и thumbnail используют один team key `team:<normalized name>\n<normalized game>`.

### Admin team metric rankings — repo ready, smoke pending

В `admin-team-detail-v0600.js .3` шесть карточек статистики стали кликабельными:
- `Игроков E` → ranking by `players`;
- `Общий спецназ F` → `specnazTrips`;
- `Скрины H` → `screens`;
- `Активность в базе I` → `activityBase`;
- `Активность вне базы J` → `activityOutside`;
- `Среднее K` → `average`.

Поведение рейтинга:
- источник = **тот же private `adminData.teams`**, без нового backend/API;
- входят все admin-команды, включая `Неактивен` и нулевые значения;
- сортировка numeric descending, tie-break = team name/game;
- отображаются место, команда, игра, статус и значение выбранной метрики;
- команда, из которой открыт рейтинг, подсвечивается;
- tap по строке рейтинга открывает admin team-detail этой команды;
- ranking intentionally не грузит 128 thumbnails, чтобы не создавать массовый media/network prewarm;
- Back должен возвращать предыдущий detail/list state через существующий `RoyalNav` capture.

**Статус:** GitHub `main` обновлён, Apps Script/Sheets не менялись, Cloud Shell не нужен. Нужен Telegram smoke: открыть MOLOT POKA → нажать каждую из E/F/H/I/J/K → проверить descending order, все команды, переход по строке и Back.

---

## 7. Медиакэш

Один IndexedDB: **`royal-crm-media-cache / images`**.

- avatar primary key: `avatar:<avatarFileId>`;
- team key: `team:<normalized team>\n<normalized game>`;
- cache-first: memory/disk → network;
- team photo background refresh не чаще ~30 мин;
- без массового сетевого prewarm;
- admin `/admin-team-photo` должен сначала искать private SHA-256 media по identity `name + game`, а `photoUrl` использовать только fallback;
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

1. Обычный `startapp` остаётся v0.5.59; `startapp=v0600` открывает v0.6.
2. Не-админ не получает admin-data/write.
3. Existing participant editor: только имя + memberships; прямой system-field write отклоняется.
4. Разрешённое test write читается обратно и появляется в журнале; stale revision не перезаписывает новое.
5. Team rename каскадит memberships; team photo upload/rename cleanup работают.
6. Admin avatars/team photos повторно читаются из общего persistent cache.
7. Admin search проверяется по имени/@/ID/role/nickname/team + `вышка`.
8. `Вышел` сравнить с physical order таблицы.
9. Admin team detail: фото, D:L, editor, состав, включая минимум одну `Неактивен`.
10. **Нажать E/F/H/I/J/K и проверить каждый ranking: all teams, descending numeric order, нули внизу, tap team → detail, Back → ranking/detail state.**
11. Проверить Android и iPhone/iPad Telegram WebView.

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
- admin team detail from private snapshot including inactive;
- admin team metric rankings E/F/H/I/J/K from full private team set.

После принятой/проверенной правки обязательно обновлять этот файл и добавлять новую верхнюю запись в `WORK_HISTORY.md`.
