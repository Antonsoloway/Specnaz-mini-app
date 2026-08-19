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
- `media-persistent-cache-v0554.js` — внутренняя версия `0.5.54.1`
- `contact-by-id-v0559.js` — внутренняя версия `0.5.59.2`
- `active-teams-v0559.js`
- `active-teams-title-v0559.js`
- `stable-v0559.js` — stable patch **`0.5.59.3`**, iOS team-photo guard + fast IndexedDB warm
- `changelog-v0559.js`

Текущие важные cache-bust:
- auth: `transport-v0514.js?v=20260819-0833`, `app.js?v=20260819-0833`
- Back/contact restore: `navigation-card-restore-v0532.js?v=20260819-0848`
- iPhone team-photo fast cache: `stable-v0559.js?v=20260819-1845`
- changelog: `changelog-v0559.js?v=20260819-1845`

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
- disk-only prewarm сохранённых фото;
- cached photo показывается сразу;
- примерно после 30 минут допускается background refresh;
- cleanup около 45 дней, общий лимит около 420 изображений.

### iPhone / iPad — исправления 19.08.2026

По первому пользовательскому видео подтверждён симптом: при открытии detail фото команды могло мелькнуть, затем исчезнуть и замениться замком.

Причина: `persistentLoadTeamPhoto()` выполняет `img.removeAttribute('src')` **до** асинхронного `idbGet()`/proxy fetch. На iOS Telegram WebView это создаёт заметный flash.

Guard из stable patch `0.5.59.2` сохранён:
- не позволяет удалить уже существующий `src` до готовности replacement;
- даёт cached/proxy image до 900 мс на реальный decode/load;
- при ошибке возвращает исходный CRM `src`;
- Android-ветку не меняет.

Сравнение двух видео (iPhone vs Android) показало второй дефект производительности: на iPhone detail уже открыт, но кэшированное фото появляется примерно через **0,4–0,6 сек**, тогда как на Android оно видно практически в первом кадре detail.

Причина задержки: старый `warmTeamCacheFromDisk()` последовательно делал `idbGet()` для каждой команды и ещё `idbTouch()` для каждого найденного фото. На iOS IndexedDB эта цепочка заметно медленнее, поэтому нужная команда часто открывалась раньше, чем её blob был поднят в session memory.

Stable patch **`0.5.59.3`** добавляет iOS-only fast path:
- сразу при загрузке JS запускается **одно пакетное readonly-чтение** локального media store (`getAll`, cursor fallback);
- все сохранённые `kind=team` blobs младше 45 дней получают session object URL в `iosTeamPhotoMemory` без сетевых запросов и без массовых `idbTouch`;
- на `pointerdown` по `[data-team]` конкретная команда дополнительно прогревается точечным IndexedDB `get`, если общий warm ещё не завершён;
- после `renderTeamDetail()` уже прогретый object URL назначается синхронно с `loading=eager`, `decoding=sync`, `fetchPriority=high`;
- обычный медленный team-photo loader не переходит повторно в async path, если iOS fast-memory source уже назначен;
- если быстрый cached source ошибся, marker снимается и включается штатный loader/fallback;
- **никакого сетевого prewarm нет**; Android-ветка не изменена.

Публичная диагностика: `window.RoyalIosTeamPhotoFastCache` (`version`, `warm()`, `preload()`, `size`).

Это frontend fix; Apps Script / Cloud Shell для него не нужен.

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
- не возвращать крота к SVG/`<img>`;
- не возвращать ошибочное `BbIIIIKA`;
- не возвращать team-photo cache key к временному `photoUrl`;
- на iOS **не стирать существующий team-photo `src` до готовности replacement source**;
- на iOS не возвращать последовательный per-team disk warm как единственный путь перед первым открытием: сохранённые team blobs должны пакетно подниматься в session memory заранее;
- не превращать iOS fast warm в сетевой prewarm;
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
7. На iPhone фото команды не исчезает после краткого появления; при проблеме replacement остаётся рабочий CRM photo.
8. **На iPhone ранее кэшированная команда должна открывать фото практически вместе с detail, без видимой паузы ~0,5 сек; сравнивать с Android на одной и той же кэшированной команде.**
9. У участника без `@` есть `Связаться` и оно работает через Голубца.
10. После `Участники → профиль/команда → Назад` кнопки `Связаться` остаются.
11. Forward открывает сверху, Back восстанавливает позицию.
12. В credits есть `@DmitryRoyal`.

---

## 15. Завершение будущей работы

После принятой правки обязательно обновлять этот файл и добавлять новую верхнюю запись в `WORK_HISTORY.md`. При изменении постоянного инварианта обновлять `RELEASE_RULES.md`.