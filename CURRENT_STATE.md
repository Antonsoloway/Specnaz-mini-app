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
- `transport-v0514.js`
- `app.js`
- `team-identity-fix.js`
- `identity-card-ids-v0518.js`
- `navigation-v0521.js`
- `participant-profile-v0523.js`
- `participant-card-ux-v0531.js`
- `navigation-card-restore-v0532.js`
- `search-hybrid-v0553.js`
- `search-aliases-v0559.js`
- `media-persistent-cache-v0554.js` — внутренняя версия `0.5.54.1`
- `self-avatar-priority-v0556.js`
- `navigation-scroll-top-v0558.js`
- `active-teams-v0559.js`
- `active-teams-title-v0559.js`
- `active-teams-v0559.css`
- `contact-by-id-v0559.js` — внутренняя версия **`0.5.59.2`**
- `changelog-v0559.js`
- `stable-v0559.js`

Текущий cache-bust contact module: `contact-by-id-v0559.js?v=20260819-0015`.

---

## 6. Контакт с участниками

### Есть `@username`
Поведение не менялось:
- видна синяя `@username`-ссылка;
- нажатие открывает существующее меню;
- доступны `Написать в ЛС` и `Позвать в чате`.

### Нет `@username`
Показывается синяя кнопка **`Связаться`** на том же месте.

Identity = только **raw Telegram ID**.

Правильная цепочка:

`Mini App → POST /contact-by-id → Worker → @doveofpeace_bot → inline-кнопка «Открыть профиль»`

Подробности:
- Mini App **не запускает `tg://user?id=...` напрямую**;
- frontend отправляет авторизованный `POST /contact-by-id` с target raw Telegram ID;
- Worker определяет requester из session и проверяет requester/target по актуальному snapshot;
- target должен быть текущим участником `В чате` и без `@username`;
- Worker использует `BOT_TOKEN` только серверно;
- Голубец отправляет requester-у в ЛС сообщение с inline-кнопкой `👤 Открыть профиль`, URL = `tg://user?id=<targetId>`;
- после успеха Mini App показывает popup `Ссылка готова` → `Открыть Голубя`;
- если Голубец не может написать requester-у, приложение показывает ошибку;
- privacy/context ограничения Telegram могут не позволить открыть конкретный профиль по ID.

**Не возвращать:** скрытый `<a href="tg://user?id=...">`, `window.location.href = tg://...` или иной прямой ID deep-link из Mini App — этот подход уже проверен на Android и не сработал.

---

## 7. Worker/backend

Frontend Worker origin: `https://royal-crm-miniapp-api.tropical-spoon.workers.dev`.

Repo config:
- `worker/wrangler.toml`
- active repo main: **`src/entry-v1120.js`**
- wrapper version в repo: **`1.12.0`**
- base chain: `entry-v1120.js → entry-v1110.js → ...`

`entry-v1120.js` добавляет:
- `/health` с `contactById: bot-inline-profile-button`;
- `OPTIONS /contact-by-id`;
- авторизованный `POST /contact-by-id`;
- проверку requester/target по raw Telegram ID;
- Bot API `sendMessage` requester-у;
- inline profile button `tg://user?id=<targetId>`;
- понятные ошибки `BOT_CANNOT_MESSAGE_REQUESTER`, `TARGET_NOT_FOUND`, `USERNAME_AVAILABLE` и др.;
- короткий duplicate cooldown.

Секреты остаются только в Cloudflare:
- `BOT_TOKEN`
- `GITHUB_TOKEN`
- `SESSION_SECRET`

### Production proof

`.github/workflows/worker-smoke.yml`:
- читает активный source из `worker/wrangler.toml`;
- извлекает ожидаемый `WRAPPER_VERSION`;
- ждёт эту версию на production `/health`;
- при успехе должен записать `runtime/worker-health.json`.

**На момент этой записи repo/config уже переключены на `1.12.0`, но production runtime не считать подтверждённым, пока нет runtime proof или эквивалентной прямой проверки.**

---

## 8. Активные команды / база спецназа

Источник истины: `team.status` из админской `Команды!L`, опубликованный через Unified Snapshot/Worker.

Для `status === "Активен"`:
- карточка команды на странице `Команды` получает золотую рамку;
- командная плашка на странице `Участники` и в профилях получает золотую рамку;
- на странице команды название золотое и в золотой рамке;
- справа на странице команды расположен кликабельный крот, открывающий каталог активных команд;
- справа у активной `.team-card` расположен тот же крот; тап открывает выбранную команду;
- каталог строится только из команд `Активен`;
- каталог имеет собственный фильтр `Все / РМ / РК` и собственный поиск;
- фильтр/поиск каталога независимы от обычной страницы `Команды`.

Крот: встроенный JPEG data-asset `--royal-specnaz-mole-v0559` в `active-teams-v0559.css`. Не возвращать SVG-wrapper, обычный `<img>` или внешний image-loader.

Заголовок каталога:
**`Команды принимающие участие в базе спецназа`**

Подзаголовок:
`Команды, участвующие в спецназе и(или) регулярно выкладывающие скрины в базе спецназа.`

`На паузе` остаётся без золотой маркировки.

---

## 9. Поиск

Основной модуль: `search-hybrid-v0553.js`.

Архитектура:
- локальный Android-safe поиск остаётся fallback;
- `searchKeys` — дополнительный слой;
- итог = локальное совпадение ИЛИ `searchKeys`;
- без edit-distance/fuzzy-комбинаторики и тяжёлого prewarm;
- `Все / РМ / РК` ограничивает и список, и область поиска, не очищая query.

### `🗡 BbllllKA / Royal Kingdom ↔ вышка`

Фактическое имя: **`🗡 BbllllKA`** — после `Bb` четыре строчные латинские `l`.

Server-side источник:
- `apps-script-live/25_MINIAPP_UNIFIED_SNAPSHOT.js`;
- alias `'bbllllka': ['вышка']`;
- writer `1.2.4`;
- `searchIndexVersion=1.1.3`.

Фактически подтверждено в `royal-crm-data/snapshot.json`: команда и её участники содержат `вышка` / `vyshka` в `searchKeys`.

Не возвращать ошибочное написание `BbIIIIKA`.

---

## 10. Медиакэш

Активный файл: `media-persistent-cache-v0554.js`, внутренняя версия `0.5.54.1`.

### Аватары
- key = стабильный `avatarFileId`;
- IndexedDB cache-first;
- lazy loading около viewport;
- не более двух параллельных сетевых загрузок;
- своя ава получает приоритетное восстановление.

### Фото команд
- key = стабильная связка **нормализованное имя команды + игра**;
- временный Google Sheets `photoUrl` не является cache identity;
- сохранённые team blobs после загрузки CRM поднимаются из IndexedDB в `teamMemory` без сетевого prewarm;
- cached photo показывается сразу;
- примерно после 30 минут допускается неблокирующий background refresh;
- cleanup около 45 дней, общий лимит около 420 изображений.

Не возвращать ключ team cache к временному `photoUrl` и не делать массовый сетевой prewarm.

---

## 11. Навигация

Инвариант:
- **вперёд** → новый экран сверху (`scrollY=0`);
- **назад** → точная сохранённая позиция предыдущего экрана.

Не возвращать ошибочное поведение v0.5.57, где Back тоже отправлял список наверх.

---

## 12. История изменений / credits

Текущий changelog: `changelog-v0559.js`.

Шапка `Помощь в разработке, тесты`:
- `@sfinks_spb`
- `@O_Chaplygina`
- `@Yanochka_2404`
- `@DmitryRoyal`

Кредиты не повторяются внутри карточек отдельных версий.

---

## 13. Что нельзя случайно откатить

- не терять Telegram `location.hash` при redirects;
- не возвращать `meta refresh`;
- participant identity = только raw Telegram ID;
- не удалять `searchKeys`, `searchIndexVersion` или `team.status` Worker-санитизацией;
- team status identity = `название + игра`;
- не связывать фильтр каталога активных команд с обычной страницей `Команды`;
- не возвращать крота к `<img>`/SVG/external asset;
- не возвращать ошибочное имя `BbIIIIKA`;
- server alias `'bbllllka': ['вышка']` должен оставаться в Unified Snapshot Writer;
- не возвращать team-photo cache key к временному Google `photoUrl`;
- не массово скачивать все фото команд на старте;
- если у участника нет `@username`, использовать `Связаться` через Worker → Голубец → inline profile button;
- **не запускать `tg://user?id` напрямую из Mini App**;
- у участника с `@username` не заменять существующее username-меню;
- не заставлять Back открывать список сверху;
- не удалять `@DmitryRoyal` из credits;
- не объявлять Worker production-подтверждённым только по GitHub commit.

---

## 14. Минимальный smoke-test

1. Launch через `https://t.me/doveofpeace_bot?startapp`.
2. Авторизация не потеряна.
3. Бейдж версии = `v0.5.59`.
4. Поиск и `Все / РМ / РК` работают.
5. `вышка` находит `🗡 BbllllKA` в РК.
6. Активные команды имеют золотую маркировку и правильного крота.
7. Каталог активных команд имеет правильный заголовок, поиск и фильтры.
8. Повторное открытие ранее загруженной команды показывает photo cache без прежней задержки.
9. У участника с `@username` работает старое username-меню.
10. У участника без `@username` отображается `Связаться`.
11. Тап `Связаться` → `Отправляю…` → popup `Ссылка готова`; после `Открыть Голубя` в ЛС Голубца есть inline-кнопка `👤 Открыть профиль`.
12. Тап по contact action не открывает внутренний participant profile вместо contact flow.
13. Forward открывает сверху; Back восстанавливает позицию.
14. В credits виден `@DmitryRoyal`.
15. Для backend-задач отдельно сверяется production Worker version.

---

## 15. Завершение будущей работы

После принятой правки обязательно обновлять этот файл и добавлять новую верхнюю запись в `WORK_HISTORY.md`. При изменении постоянного инварианта обновлять `RELEASE_RULES.md`.