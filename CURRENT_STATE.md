# Royal CRM / «Таблица ЧП» — CURRENT STATE

> **Актуально на 19.08.2026.**
> Новый чат обязан сначала прочитать `START_HERE.md`, затем этот файл и последние записи `WORK_HISTORY.md`.
> Фактический runtime / живые Google Sheets / live Apps Script / текущий GitHub имеют приоритет над памятью чатов.

## 1. Обязательный протокол работы

1. Не менять код по памяти.
2. Перед правкой открыть фактический файл и проверить текущую версию/SHA/подключение.
3. Если задача зависит от данных — сверить актуальный `snapshot.json` и/или живую Google Sheets.
4. Для Apps Script использовать `apps-script-live/` как зеркало последнего `clasp pull`; после live push заново синхронизировать зеркало.
5. После принятой/проверенной работы обязательно обновить `CURRENT_STATE.md` и `WORK_HISTORY.md`; `RELEASE_RULES.md` — если изменился постоянный инвариант.
6. Если менялась структура Google Sheets — обновлять `docs/tables/*.md`.
7. GitHub commit не равен production-подтверждению backend; runtime проверять отдельно.

---

## 2. Репозитории и точки входа

### Основной репозиторий
- GitHub: `Antonsoloway/Specnaz-mini-app`
- branch: `main`
- постоянный Mini App entrypoint: `app.html`
- активный физический entrypoint: `app-v0559.html`
- публичный URL: `https://antonsoloway.github.io/Specnaz-mini-app/app.html`
- Telegram bot: `@doveofpeace_bot`
- launch link: `https://t.me/doveofpeace_bot?startapp`

### Data repo
- `Antonsoloway/royal-crm-data`
- главный файл: `snapshot.json`
- Google Sheets / Apps Script — первичный источник CRM-данных.

### Проектная база знаний
- `START_HERE.md`
- `CURRENT_STATE.md`
- `WORK_HISTORY.md`
- `RELEASE_RULES.md`
- `docs/tables/ADMIN_TABLE_STRUCTURE.md`
- `docs/tables/PUBLIC_TABLE_STRUCTURE.md`

---

## 3. Live Apps Script / данные

Полный standalone Apps Script таблиц хранится зеркалом в `apps-script-live/`.

Текущее подтверждённое состояние writer:
- Unified Snapshot Writer: **`1.2.4`**
- schemaVersion: `1.4.2`
- searchIndexVersion: **`1.1.3`**
- Fallback API: `1.2.1`
- team status bridge: `27_MINIAPP_TEAM_STATUS.js`, bridge `1.0.0`
- штатный handler: `MINIAPP_exportUnifiedSnapshotToGitHub`
- штатный trigger: раз в 5 минут.

### Каскадное переименование команд — live с 19.08.2026

`apps-script-live/07_FINAL_ROLE_FIX.js` теперь считает изменение существующего `Команды!B` каскадной операцией:
- при одиночном edit названия берутся `e.oldValue`, новое значение и игра **до сортировки**;
- `finalRoleCascadeTeamRename_()` проходит все пять team-слотов `База участников` (`E/H/K/N/Q`);
- совпадение строго по identity **старое название + игра**;
- меняется только team-cell; ник, роль, game-columns и прочие данные не трогаются;
- после этого запускается repair старых декоративных рассинхронизаций и ставится public sync pending.

`apps-script-live/25_MINIAPP_UNIFIED_SNAPSHOT.js` перед построением snapshot дополнительно вызывает `finalRoleRepairDecoratedTeamMemberships_()` как страховку. Автоматический repair разрешён только для однозначного случая: в той же игре после удаления ведущего decorative prefix/emoji найден ровно один кандидат.

Строгую validation `02_PUBLIC_SYNC_V4.js` **не ослаблять**: если membership ссылается на реально отсутствующую/неоднозначную команду, sync должен остановиться и показать источник ошибки. Не угадывать полное переименование без подтверждённого mapping.

После любого live Apps Script push:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Antonsoloway/Specnaz-mini-app/main/scripts/sync-live-apps-script-to-github.sh)
```

Не хранить в GitHub `.clasp.json`, Script Properties, bot tokens, GitHub tokens и Cloudflare secrets.

---

## 4. Живые Google Sheets

### Админская таблица
Название: `Royal_CRM_GOOGLE_ПОИСК_FINAL_FIXED`.

На листе `Команды` колонка **L = `Статус`**. Значения:
- `Активен`
- `На паузе`
- `Неактивен`

Статус команды для Mini App определяется строго по связке **название + игра**.

### Публичная таблица
Название: `🕊️ЧАТ ПОБЕДИТЕЛЕЙ🕊️`.

Публичная таблица получает данные из админской; обратной записи быть не должно.

### Последняя подтверждённая repair/sync-проверка 19.08.2026

Исходный случай: админ изменил `BUNTARb` → `⚡️ BUNTARb` только в `Команды`, из-за чего membership Андрея оставался старым и публичная sync блокировалась.

После live patch:
- snapshot-trigger автоматически исправил **6** старых декоративных рассинхронизаций, включая `BUNTARb → ⚡️ BUNTARb`;
- отдельный старый blocker у Светланы не угадывался автоматически: `Rossia Liger1 — РМ` больше отсутствовал на `Команды`;
- после уточнения пользователя `База участников!E24` исправлена на **`🇷🇺 CCCP ROSSIA 1 — РМ`**;
- public sync от **19.08.2026 21:51:32** завершилась `SYNCED`, без validation errors;
- публичная `Команды` подтверждённо содержит `⚡️ BUNTARb — РК` с Андреем OgAyO;
- публичная `Команды` подтверждённо содержит `🇷🇺 CCCP ROSSIA 1 — РМ` со Светланой `@SvetlanaRusKyzbass`;
- snapshot от `2026-08-19T18:48:33.093Z` содержит у Светланы membership `🇷🇺 CCCP ROSSIA 1 — РМ`.

Старые названия в исторических секциях спецназа не переписывать задним числом: история отражает состояние на дату события.

---

## 5. Текущий frontend

- **Mini App: `v0.5.59`**
- `app.html` и `index.html` ведут на `app-v0559.html`, сохраняя Telegram `search + hash`.

Ключевые активные модули:
- `transport-v0514.js` — внутренняя версия `0.5.14.1`
- `app.js` — `BUILD = 0.5.59`
- `navigation-v0521.js`
- `navigation-card-restore-v0532.js` — внутренняя версия `0.5.32.1`
- `search-hybrid-v0553.js`
- `search-aliases-v0559.js`
- `media-persistent-cache-v0554.js` — внутренняя версия **`0.5.54.2`**, safe disk-record warm
- `contact-by-id-v0559.js` — внутренняя версия `0.5.59.2`
- `active-teams-v0559.js`
- `active-teams-title-v0559.js`
- `stable-v0559.js` — stable patch **`0.5.59.2`**, iOS team-photo guard; broken fast warm `0.5.59.3` rolled back
- `changelog-v0559.js`

Текущие важные cache-bust:
- auth: `transport-v0514.js?v=20260819-0833`, `app.js?v=20260819-0833`
- Back/contact restore: `navigation-card-restore-v0532.js?v=20260819-0848`
- media cache safe warm: `media-persistent-cache-v0554.js?v=20260819-2012`
- iPhone team-photo guard: `stable-v0559.js?v=20260819-2003`
- changelog: `changelog-v0559.js?v=20260819-2012`

### Устойчивая авторизация
- `/auth` timeout = 12 секунд;
- один автоматический retry только для transient timeout/network ошибки;
- Android `AbortError code 20` нормализуется в `AUTH_TIMEOUT`;
- остальные Worker routes сохраняют обычный timeout;
- внутренний build совпадает с v0.5.59.

---

## 6. Контакт с участниками

### Есть `@username`
Сохраняется прежнее меню username: `Написать в ЛС` / `Позвать в чате`.

### Нет `@username`
На том же месте показывается **`Связаться`**.

Identity = только raw Telegram ID.

Правильная цепочка:

`Mini App → POST /contact-by-id → Worker → @doveofpeace_bot → inline-кнопка «Открыть профиль»`

Прямой `tg://user?id=...` из Mini App не использовать: этот вариант уже проверен и не работает стабильно.

После возврата из профиля/команды post-restore порядок обязателен:
1. `RoyalParticipantCardUX.decorate()`;
2. `RoyalContactByTelegramId.decorate()`.

Проверять и видимую кнопку `Назад`, и Telegram native/system Back. Кнопки `Связаться` не должны исчезать после возврата.

---

## 7. Worker/backend

Frontend Worker origin: `https://royal-crm-miniapp-api.tropical-spoon.workers.dev`.

Repo config:
- `worker/wrangler.toml`
- active repo main: `src/entry-v1120.js`
- wrapper version: `1.12.0`

`entry-v1120.js` добавляет `/contact-by-id`, Bot API relay и inline profile button.

Пользователь 19.08.2026 фактически подтвердил, что `Связаться` работает в production.

Автоматический `.github/workflows/worker-smoke.yml` удалён: он создавал ложные/пустые GitHub Actions failure-письма. Worker production проверять напрямую по `/health` и/или функциональному smoke-test.

---

## 8. Активные команды / база спецназа

Источник истины: `team.status` из `Команды!L` через snapshot/Worker.

Для `status === "Активен"`:
- золотая рамка team cards;
- золотая рамка командных плашек участников;
- золотое название на detail;
- кликабельный крот справа;
- каталог строится только из активных команд;
- каталог имеет собственные `Все / РМ / РК` и поиск.

Крот: inline JPEG data-asset в `active-teams-v0559.css`; не возвращать SVG-wrapper/обычный `<img>`.

Заголовок каталога:
**`Команды принимающие участие в базе спецназа`**

Подзаголовок:
`Команды, участвующие в спецназе и(или) регулярно выкладывающие скрины в базе спецназа.`

---

## 9. Поиск

Основной модуль: `search-hybrid-v0553.js`.

Архитектура:
- локальный Android-safe поиск + server `searchKeys`;
- итог = локальный поиск ИЛИ `searchKeys`;
- без fuzzy/edit-distance;
- фильтр `Все / РМ / РК` ограничивает список и поиск, не очищая query.

Подтверждённый alias:
- фактическая команда: `🗡 BbllllKA / Royal Kingdom`;
- server alias: `'bbllllka': ['вышка']`;
- writer `1.2.4`, `searchIndexVersion=1.1.3`;
- свежий snapshot содержит `вышка` и `vyshka` в `searchKeys`.

Не возвращать ошибочное написание `BbIIIIKA`.

---

## 10. Медиакэш

### Аватары
- IndexedDB cache-first;
- key = стабильный `avatarFileId`;
- lazy loading;
- network concurrency ≤ 2;
- собственная ава восстанавливается приоритетно.

### Фото команд — общий путь
- cache key = **нормализованное имя команды + игра**;
- временный Google `photoUrl` не является cache identity;
- cached photo показывается cache-first;
- примерно после 30 минут допускается background refresh;
- cleanup около 45 дней, общий лимит около 420 изображений.

### iPhone / iPad — актуальное состояние 19.08.2026

Первый подтверждённый iOS-дефект: фото команды могло мелькнуть, затем исчезнуть и замениться замком.

Активный stable patch **`0.5.59.2`**:
- не позволяет persistent-loader удалить уже существующий `src` до готовности replacement;
- даёт cached/proxy image до 900 мс на реальный decode/load;
- при ошибке возвращает исходный CRM `src`;
- Android-ветку не меняет.

Неудачная попытка `stable-v0559.js 0.5.59.3` полностью откатана: она заранее создавала object URL для всех team blobs и перехватывала `renderTeamDetail`; на реальном iPhone это привело к полному исчезновению фото. Этот подход не возвращать.

### Текущее безопасное ускорение — media cache `0.5.54.2`

Причина задержки 0,4–0,6 сек на iPhone была в том, что старый `warmTeamCacheFromDisk()` ждал snapshot и затем делал отдельный `idbGet()` для каждой команды. На iOS последовательные IndexedDB-транзакции заметно медленнее Android.

Новая реализация **не подменяет render и не обходит loader**:
- сразу при загрузке `media-persistent-cache-v0554.js` выполняется один readonly `openCursor()` по существующему IndexedDB store;
- в `teamDiskMemory` сохраняются только валидные **записи Blob** команд младше 45 дней;
- во время warm **не создаются `blob:` URL**, не меняется DOM и не запускается сеть;
- при открытии конкретной команды штатный `persistentLoadTeamPhoto()` сначала проверяет свой родной `teamMemory`, затем `teamDiskMemory`;
- если запись уже прогрета, только для этой открываемой команды синхронно создаётся object URL и назначается штатному `<img>`;
- если записи нет, остаётся прежний рабочий путь `idbGet → /team-photo → fallback`;
- background refresh, stable iOS guard `0.5.59.2` и Android-путь сохранены;
- новые/обновлённые team blobs автоматически попадают в `teamDiskMemory` после `idbPut`;
- никакого сетевого prewarm нет.

Диагностика: `window.RoyalPersistentMediaCache.teamDiskEntries` и `teamObjectUrls`.

**Статус проверки:** GitHub `main` обновлён, активный cache-bust установлен. Реальная скорость/стабильность на iPhone должна быть подтверждена пользователем после полного перезапуска Mini App.

Apps Script / Cloud Shell для этого изменения не нужен.

---

## 11. Навигация

Инвариант:
- вперёд → новый экран сверху (`scrollY=0`);
- назад → точная сохранённая позиция предыдущего экрана.

Не возвращать поведение v0.5.57, где Back отправлял список наверх.

---

## 12. История изменений / credits

Текущий changelog: `changelog-v0559.js`.

`Помощь в разработке, тесты`:
- `@sfinks_spb`
- `@O_Chaplygina`
- `@Yanochka_2404`
- `@DmitryRoyal`

---

## 13. Что нельзя откатить

- не терять Telegram `location.hash`;
- participant identity = raw Telegram ID;
- не удалять `searchKeys`, `searchIndexVersion`, `team.status` Worker-санитизацией;
- team status identity = `название + игра`;
- **переименование `Команды!B` обязано каскадно обновлять все пять membership-слотов `База участников` по identity `старое название + игра` до public/snapshot sync**;
- строгую public validation не ослаблять ради старых рассинхронизаций: неоднозначные/полные переименования требуют подтверждённого mapping;
- не возвращать крота к SVG/`<img>`;
- не возвращать ошибочное `BbIIIIKA`;
- не возвращать team-photo cache key к временному `photoUrl`;
- на iOS **не стирать существующий team-photo `src` до готовности replacement source**;
- **не возвращать stable patch `0.5.59.3` / массовое создание session object URL для всех team blobs и перехват `renderTeamDetail`**;
- безопасный disk warm может хранить Blob-records в памяти, но object URL создавать только для реально открываемой команды;
- не превращать disk-only cache warm в сетевой prewarm;
- `Связаться` только через Worker → Голубец → inline button;
- не запускать `tg://user?id` напрямую из Mini App;
- после Back обязательно восстанавливать contact actions;
- `/auth` не возвращать к 5 секундам без retry;
- не добавлять обратно шумный `worker-smoke.yml`;
- Back не должен сбрасывать scroll вверх;
- не удалять `@DmitryRoyal` из credits.

---

## 14. Минимальный smoke-test

1. Launch через `https://t.me/doveofpeace_bot?startapp`.
2. Авторизация переживает краткий transient backend delay.
3. Поиск и `Все / РМ / РК` работают.
4. `вышка` находит `🗡 BbllllKA` в РК.
5. Активные команды имеют золото и правильного крота.
6. Повторное открытие ранее загруженной команды использует photo cache.
7. На iPhone фото команды должно отображаться; не допускается состояние, когда после открытия остаётся только замок.
8. На iPhone фото не должно исчезать после краткого появления; при проблеме replacement остаётся рабочий CRM photo.
9. **На iPhone ранее кэшированная команда должна открывать фото без прежней задержки ~0,4–0,6 сек; проверить несколько команд подряд и после полного перезапуска Mini App.**
10. У участника без `@` есть `Связаться` и оно работает через Голубца.
11. После `Участники → профиль/команда → Назад` кнопки `Связаться` остаются.
12. Forward открывает сверху, Back восстанавливает позицию.
13. После переименования тестовой команды проверить три точки: `Команды`, membership участника и публичную таблицу/snapshot должны иметь одно новое имя.
14. В credits есть `@DmitryRoyal`.

---

## 15. Завершение будущей работы

После принятой правки обязательно обновлять этот файл и добавлять новую верхнюю запись в `WORK_HISTORY.md`. При изменении постоянного инварианта обновлять `RELEASE_RULES.md`.