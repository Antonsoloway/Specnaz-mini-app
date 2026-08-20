# Royal CRM / «Таблица ЧП» — CURRENT STATE

> **Актуально на 20.08.2026.**
> Новый чат обязан сначала прочитать `START_HERE.md`, затем этот файл и последние записи `WORK_HISTORY.md`.
> Фактический runtime / живые Google Sheets / live Apps Script / текущий GitHub имеют приоритет над памятью чатов.

## 1. Обязательный протокол работы

1. Не менять код по памяти.
2. Перед правкой открыть фактический файл и проверить текущую версию/SHA/подключение.
3. Если задача зависит от данных — сверить актуальный `snapshot.json`, `admin-snapshot.json` и/или живую Google Sheets.
4. Для Apps Script использовать `apps-script-live/` как зеркало последнего `clasp pull`; после live push заново синхронизировать зеркало.
5. Перед `clasp push` обязательно делать `clasp status` и backup/pull фактического live source.
6. Не создавать новый Apps Script deployment, если задача должна обновить существующий `Таблица ЧП 1.3`.
7. После принятой/проверенной работы обязательно обновить `CURRENT_STATE.md` и `WORK_HISTORY.md`; `RELEASE_RULES.md` — если изменился постоянный инвариант.
8. Если менялась структура Google Sheets — обновлять `docs/tables/*.md`.
9. GitHub commit не равен production-подтверждению backend; runtime проверять отдельно.

---

## 2. Репозитории и точки входа

### Основной репозиторий
- GitHub: `Antonsoloway/Specnaz-mini-app`
- branch: `main`
- постоянный Mini App entrypoint: `app.html`
- стабильный frontend: **`app-v0559.html` / v0.5.59**
- admin preview: **`app-v0600.html` / v0.6.0**
- публичный URL: `https://antonsoloway.github.io/Specnaz-mini-app/app.html`
- Telegram bot: `@doveofpeace_bot`

### Launch routing
- обычный `https://t.me/doveofpeace_bot?startapp` → стабильная **v0.5.59**;
- специальный `startapp=v0600` / `tgWebAppStartParam=v0600` → отдельная **v0.6 preview**;
- обычных пользователей пока не переводить на v0.6 до завершения admin smoke-test.

### Data repo
- `Antonsoloway/royal-crm-data`
- публичный snapshot: `snapshot.json`
- приватный admin snapshot: `admin-snapshot.json`
- Google Sheets / Apps Script — первичный источник CRM-данных.

### Проектная база знаний
- `START_HERE.md`
- `CURRENT_STATE.md`
- `WORK_HISTORY.md`
- `RELEASE_RULES.md`
- `docs/tables/ADMIN_TABLE_STRUCTURE.md`
- `docs/tables/PUBLIC_TABLE_STRUCTURE.md`

---

## 3. Live Apps Script / snapshot

Полный standalone Apps Script таблиц хранится зеркалом в `apps-script-live/`.

### Public snapshot
- Unified Snapshot Writer: **`1.2.4`**
- schemaVersion: `1.4.2`
- searchIndexVersion: **`1.1.3`**
- Fallback API: `1.2.1`
- team status bridge: `27_MINIAPP_TEAM_STATUS.js`
- штатный trigger snapshot: раз в 5 минут.

### v0.6 private admin snapshot / write backend — live

На 20.08.2026 подтверждены:
- `adminData.version = 0.6.0-write.4`;
- участники и команды имеют optimistic `revision`;
- transport записи: **Mini App → Worker → HMAC → Apps Script → Google Sheets**;
- HMAC secret не попадает в браузер/GitHub;
- existing Apps Script deployment **`Таблица ЧП 1.3`** сохранён, новый deployment не создавался;
- server route write.4 подтверждён non-mutating HTTP check;
- team photo capability подтверждена;
- rename cleanup фото подтверждён;
- delete operations в v0.6 отключены.

Ключевые live модули:
- `28_MINIAPP_ADMIN_DATA.js` — private admin read snapshot;
- `29_MINIAPP_ADMIN_WRITE.js` — общие write helpers/validation;
- `30_MINIAPP_ADMIN_WRITE_BACKEND.js` — signed Worker→Apps Script gateway;
- `31_MINIAPP_ADMIN_WRITE_HARDENED.js` — hardened mutations и participant field policy;
- `32_MINIAPP_ADMIN_MEDIA.js`, `33_MINIAPP_ADMIN_WRITE_FINAL.js` — team photo/final write integration.

После любого live Apps Script push синхронизировать factual mirror штатным script. Не хранить в GitHub `.clasp.json`, Script Properties, bot/GitHub tokens и Cloudflare secrets.

---

## 4. Google Sheets и identity

### Админская таблица
`Royal_CRM_GOOGLE_ПОИСК_FINAL_FIXED`.

Основные листы:
- `База участников`;
- `Команды`;
- история/служебные листы из существующей архитектуры.

### Команды
- identity команды = **название + игра**;
- `Команды!L` = статус: `Активен`, `На паузе`, `Неактивен`;
- фото команды хранится штатно в `Команды!C` (CellImage / поддерживаемый существующий формат);
- существующая игра команды является частью identity и не меняется через редактор;
- переименование команды каскадно обновляет все 5 membership-слотов участников в той же игре;
- при переименовании фото/media identity переносится, старый media-key очищается.

### Участники
- identity участника = **raw Telegram ID**;
- Telegram ID существующего участника неизменяем;
- membership slots = 1..5: команда, роль, игровой ник, игра;
- role/team validation должна проходить через существующую final-role архитектуру.

### Public sync
Публичная таблица `🕊️ЧАТ ПОБЕДИТЕЛЕЙ🕊️` получает данные из админской; обратной записи быть не должно.
Строгую validation `02_PUBLIC_SYNC_V4.js` не ослаблять.

Каскадное переименование `Команды!B` остаётся обязательным инвариантом. Полное/неоднозначное переименование без подтверждённого mapping не угадывать.

---

## 5. Текущий frontend

### Стабильная версия
- **v0.5.59** остаётся основной для обычных пользователей.
- `app.html` без preview-параметра ведёт на `app-v0559.html` с сохранением Telegram `search + hash`.

Ключевые стабильные механизмы:
- устойчивый `/auth`: timeout 12 сек + один transient retry;
- `Связаться` через Worker/Голубца для участников без `@username`;
- восстановление contact actions после Back;
- hybrid search + server `searchKeys`;
- `BbllllKA / Royal Kingdom ↔ вышка`;
- active-team gold + каталог базы спецназа + inline JPEG крот;
- persistent avatar/team-photo cache;
- iOS-safe team-photo guard `0.5.59.2`;
- safe disk-record warm `media-persistent-cache-v0554.js 0.5.54.2`.

### v0.6 admin preview
- физический entrypoint: `app-v0600.html`;
- бейдж: `v0.6.0`;
- `admin-v0600.js` / `admin-eligibility-v0600.js` — admin read UI/eligibility;
- `admin-write-gate-v0600.js` — включает write только при подтверждённом final capability snapshot;
- `admin-write-v0600-v3.js` — CRUD UI/transport через Worker;
- `admin-team-photo-v0600.js` — загрузка/сжатие фото команды;
- `admin-participant-edit-policy-v0600.js` — UI policy существующего участника;
- `version-v0600.js` cache-bust: **`20260820-1712`**;
- `app-v0600.html` подключает `version-v0600.js?v=20260820-1712`.

Пользователь фактически открыл v0.6 в Telegram и открыл редактор участника. Полный write smoke после последнего participant-policy ещё не считать завершённым, пока пользователь не сохранит разрешённое тестовое изменение и не подтвердит результат.

---

## 6. v0.6 — права админа и редактор участника

### Кто получает admin mode
Admin read/write доступ разрешать только после серверной проверки Telegram admin status и CRM membership. Нельзя определять админа только по frontend-флагу.

### Existing participant — постоянная policy с 20.08.2026

Админ вручную может менять **только**:
1. `Имя` CRM;
2. пять membership-слотов: `команда / роль / игровой ник` (игра следует существующей slot/team validation).

Админ **НЕ должен вручную менять** системные/ботовые поля существующего участника:
- Telegram ID;
- `Состояние чата`;
- `Имя Telegram`;
- `@username`;
- дата V;
- походы спецназа U;
- скрины AB;
- активность в базе AC;
- активность вне базы AD;
- вычисляемые статус/игры/last change и другие system/formula fields.

Это закрыто в двух слоях:
- frontend `admin-participant-edit-policy-v0600.js` скрывает/блокирует system fields в update-form;
- live Apps Script `31_MINIAPP_ADMIN_WRITE_HARDENED.js` разрешает `requestedChanges` только `name` и `memberships`; попытка прислать другое поле → `PARTICIPANT_FIELD_READ_ONLY` без записи.

**Важно:** UI-only блокировка недостаточна; серверный whitelist обязателен и не должен откатываться.

### Create participant
Текущий UI create-participant технически существует, но policy этого раздела относится к **существующему участнику**. Не расширять create-flow без отдельного согласования бизнес-правил бот-заполнения.

---

## 7. v0.6 — команды и фото

Админский write-flow команд поддерживает:
- создание команды: игра + название + данные, разрешённые текущей формой;
- редактирование существующей команды;
- каскадное переименование membership по `старое имя + игра`;
- загрузку фото с телефона;
- клиентское сжатие перед отправкой;
- серверное сохранение штатного team photo source;
- обновление media identity;
- cleanup старого media-key при rename;
- journal записи ручных изменений;
- optimistic revision, чтобы устаревшая карточка не перезаписала более новое изменение другого админа.

Удаление участников и команд пока отключено.

---

## 8. Worker/backend

Frontend Worker origin: `https://royal-crm-miniapp-api.tropical-spoon.workers.dev`.

Repo config на 20.08.2026:
- `worker/wrangler.toml` → **`src/entry-v1230.js`**;
- final admin-write gate требует private snapshot `write.4`, HMAC transport, photo capability и `renameCleanup=true`;
- `/admin-data` — только для подтверждённого администратора;
- `/admin-write` — authenticated admin mutation route;
- existing `/contact-by-id`, `/snapshot`, media/auth routes не должны регрессировать.

Не возвращать шумный `.github/workflows/worker-smoke.yml`. Runtime проверять напрямую и функционально.

---

## 9. Контакт с участниками

### Есть `@username`
Сохраняется меню `Написать в ЛС` / `Позвать в чате`.

### Нет `@username`
Показывается **`Связаться`**.

Правильная цепочка:
`Mini App → POST /contact-by-id → Worker → @doveofpeace_bot → inline-кнопка «Открыть профиль»`.

Прямой `tg://user?id=...` из Mini App не использовать.

После Back/rerender порядок:
1. `RoyalParticipantCardUX.decorate()`;
2. `RoyalContactByTelegramId.decorate()`.

---

## 10. Поиск / активные команды

### Поиск
- `search-hybrid-v0553.js`;
- local search OR `searchKeys`;
- фильтр `Все / РМ / РК` ограничивает список и область поиска, query не очищает;
- контрольный alias: фактическая `🗡 BbllllKA / Royal Kingdom` находится по `вышка`/`vyshka`;
- не возвращать ошибочное `BbIIIIKA`.

### Активные команды
Источник истины: `team.status` из `Команды!L`.
Для `status === "Активен"`:
- золото на team cards/participant team chips/detail;
- кликабельный крот;
- каталог активных команд с `Все / РМ / РК` и поиском.

Заголовок каталога: **`Команды принимающие участие в базе спецназа`**.
Подзаголовок: `Команды, участвующие в спецназе и(или) регулярно выкладывающие скрины в базе спецназа.`

---

## 11. Медиакэш

### Аватары
- IndexedDB cache-first;
- key = `avatarFileId`;
- lazy loading;
- network concurrency ≤ 2.

### Фото команд
- cache identity = нормализованное **имя команды + игра**;
- временный Google `photoUrl` не использовать как identity;
- safe disk warm хранит record/blob references, object URL создаётся только для открываемой команды;
- сетевой массовый prewarm запрещён;
- iOS не имеет права очищать рабочий `img.src` до готовности replacement;
- не возвращать сломанный fast-path `stable-v0559.js 0.5.59.3`.

---

## 12. Навигация / credits

Навигация:
- forward → `scrollY=0`;
- Back → сохранённая позиция предыдущего экрана.

`Помощь в разработке, тесты`:
- `@sfinks_spb`
- `@O_Chaplygina`
- `@Yanochka_2404`
- `@DmitryRoyal`

---

## 13. Что нельзя откатить

- Telegram `location.hash`/launch params при redirect;
- participant identity = raw Telegram ID;
- team identity = `название + игра`;
- cascade rename всех 5 participant membership slots;
- строгую public validation;
- `searchKeys`, `searchIndexVersion`, `team.status` в Worker/snapshot;
- `BbllllKA ↔ вышка`;
- стабильный team-photo cache identity;
- iOS source-preservation guard;
- `Связаться` только через Worker/Голубца;
- contact actions после Back;
- устойчивый auth timeout/retry;
- credits с `@DmitryRoyal`;
- **v0.6 existing-participant manual write whitelist = только `name` + `memberships`; Telegram/system/counter fields = SERVER READ-ONLY**;
- v0.6 admin write transport = Worker-signed HMAC, не прямой browser→Apps Script;
- v0.6 delete operations остаются выключенными до отдельного решения.

---

## 14. Минимальный smoke-test

### Stable v0.5.59
1. Обычный `startapp` открывает v0.5.59.
2. Авторизация переживает transient backend delay.
3. Поиск/фильтры работают; `вышка` находит `BbllllKA` в РК.
4. Active teams имеют золото/крота.
5. Фото команд не исчезают на iPhone и повторное открытие использует cache.
6. `Связаться` работает и остаётся после Back.
7. Forward открывает сверху, Back возвращает позицию.

### Admin preview v0.6
1. `startapp=v0600` открывает v0.6.0; обычный startapp остаётся v0.5.59.
2. Не-админ не получает admin-data/write.
3. Админ видит admin mode и private data, включая `Вышел`/`Неактивен` согласно admin view.
4. Existing participant editor показывает для ручного изменения только `Имя` + membership slots.
5. Попытка отправить system field напрямую должна получить `PARTICIPANT_FIELD_READ_ONLY` и ничего не изменить.
6. Тестовое разрешённое изменение имени или membership сохраняется, после refresh читается обратно и появляется в admin journal.
7. Team rename каскадно меняет memberships той же игры.
8. Team photo upload отображается после refresh; rename переносит фото и очищает старый media-key.
9. Устаревшая revision не перезаписывает более новое изменение.
10. Удаление отсутствует/запрещено.

---

## 15. Завершение будущей работы

После принятой правки обязательно обновлять этот файл и добавлять новую верхнюю запись в `WORK_HISTORY.md`. При изменении постоянного инварианта обновлять `RELEASE_RULES.md`.
