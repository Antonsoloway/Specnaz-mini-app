# Royal CRM / «Таблица ЧП» — CURRENT STATE

> **Актуально на 18.08.2026.**
> Новый чат обязан сначала прочитать `START_HERE.md`, затем этот файл и последние записи `WORK_HISTORY.md`.
> Фактический runtime / живые Google Sheets / live Apps Script / текущий GitHub имеют приоритет над памятью чатов.

## 1. Обязательный протокол работы

1. Не менять код по памяти.
2. Перед правкой открыть фактический файл и проверить текущую версию/SHA/подключение.
3. Если задача зависит от данных — сверить актуальный `snapshot.json` и/или живую Google Sheets.
4. Если задача относится к Apps Script таблиц — использовать `apps-script-live/` как зеркало последнего `clasp pull` и при необходимости дополнительно сверять live Apps Script.
5. После принятой/проверенной работы обязательно обновить `CURRENT_STATE.md` и `WORK_HISTORY.md`; `RELEASE_RULES.md` обновлять при изменении постоянного инварианта.
6. Если менялся live Apps Script — заново синхронизировать `apps-script-live/`.
7. Если менялась структура таблиц — обновлять `docs/tables/*.md`.

---

## 2. Репозитории и точки входа

### Основной репозиторий
- GitHub: `Antonsoloway/Specnaz-mini-app`
- branch: `main`
- постоянный Mini App entrypoint: `app.html`
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

## 3. Live Apps Script

Полный standalone Apps Script таблиц сохранён в `apps-script-live/`.

На 18.08.2026 подтверждены 28 исходных файлов + `LIVE_MIRROR_MANIFEST.md`. После исправления поиска команды `🗡 BbllllKA` live mirror повторно синхронизирован через Cloud Shell и содержит фактический Unified Snapshot Writer **`1.2.4`** / `searchIndexVersion` **`1.1.3`**.

Ключевые live-файлы:
- `01_CORE_MAIN.js`
- `02_PUBLIC_SYNC_V4.js`
- `04_TELEGRAM_AVATARS.js`
- `05_RELIABLE_WEBHOOK_QUEUE.js`
- `06_Reliable_Edit_Trigger.js`
- `07_FINAL_ROLE_FIX.js`
- `08_TELEGRAM_NAME_LINKS.js`
- `09_OPTIMIZATION_SCHEDULE.js`
- `10_DIAGNOSTICS.js`
- `11_PERFORMANCE_OPTIMIZATION.js`
- Mini App-файлы 12–27
- `appsscript.json`
- `Вспом функции.js`

`27_MINIAPP_TEAM_STATUS.js` передаёт статус команды из живого листа `Команды`, колонка L, в unified snapshot.

После любого live Apps Script push заново выполнять:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Antonsoloway/Specnaz-mini-app/main/scripts/sync-live-apps-script-to-github.sh)
```

Не хранить в GitHub `.clasp.json`, Script Properties, bot tokens, GitHub tokens и Cloudflare secrets.

---

## 4. Живые Google Sheets

### Админская таблица
Название: `Royal_CRM_GOOGLE_ПОИСК_FINAL_FIXED`.

На листе `Команды` колонка **L = `Статус`**. Используемые значения:
- `Активен`
- `На паузе`
- `Неактивен`

Статус команды в Mini App определяется строго по связке **название + игра**.

### Публичная таблица
Название: `🕊️ЧАТ ПОБЕДИТЕЛЕЙ🕊️`.

Публичная таблица получает данные из админской; обратной записи быть не должно.

---

## 5. Текущий frontend

- **Mini App: `v0.5.59`**
- активный физический entrypoint: `app-v0559.html`
- `app.html` и `index.html` ведут на `app-v0559.html`, сохраняя Telegram `search + hash`.

Ключевые активные модули:
- `transport-v0514.js`
- `app.js`
- `team-identity-fix.js`
- `navigation-v0521.js`
- `navigation-card-restore-v0532.js`
- `search-hybrid-v0553.js`
- `search-aliases-v0559.js` — дополнительная клиентская страховка; server snapshot остаётся источником истины для подтверждённых CRM-алиасов
- `media-persistent-cache-v0554.js` — внутренний cache layer `0.5.54.1`
- `self-avatar-priority-v0556.js`
- `navigation-scroll-top-v0558.js`
- `active-teams-v0559.js`
- `active-teams-title-v0559.js`
- `active-teams-v0559.css`
- `changelog-v0559.js`
- `stable-v0559.js`

---

## 6. Активные команды / база спецназа — v0.5.59

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

### Крот
`active-teams-v0559.css` содержит присланное пользователем изображение как встроенный JPEG data-asset `--royal-specnaz-mole-v0559`.

Не возвращать SVG-wrapper, обычный `<img>` или внешний image-loader для этого значка.

### Текст каталога
Золотой заголовок:

**`Команды принимающие участие в базе спецназа`**

Подзаголовок:

`Команды, участвующие в спецназе и(или) регулярно выкладывающие скрины в базе спецназа.`

`На паузе` остаётся без золотой маркировки.

---

## 7. Поиск

Основной модуль: `search-hybrid-v0553.js`.

Архитектура:
- локальный Android-safe поиск остаётся fallback;
- `searchKeys` — дополнительный слой;
- итог = локальное совпадение ИЛИ `searchKeys`;
- без edit-distance/fuzzy-комбинаторики и тяжёлого prewarm;
- `Все / РМ / РК` ограничивает и список, и область поиска, не очищая query.

### `🗡 BbllllKA / Royal Kingdom ↔ вышка`

**Фактическое имя команды:** `🗡 BbllllKA` — после `Bb` идут четыре строчные латинские `l`. Ранее имя было ошибочно прочитано как `BbIIIIKA`; этот вариант не является source identity.

Правильный server-side источник:
- live Apps Script `apps-script-live/25_MINIAPP_UNIFIED_SNAPSHOT.js`;
- `MINIAPP_UNIFIED_SEARCH_ALIASES` содержит `'bbllllka': ['вышка']`;
- Unified Snapshot Writer: **`1.2.4`**;
- `searchIndexVersion`: **`1.1.3`**;
- alias попадает в `team.searchKeys` до публикации snapshot;
- Worker сохраняет `searchKeys` при sanitization.

Фактически подтверждено в `royal-crm-data/snapshot.json`:
- `generatedAt=2026-08-18T20:03:09.308Z` (`23:03:09 UTC+3`);
- `searchIndexVersion=1.1.3`;
- `unifiedSnapshotVersion=1.2.4`;
- объект `🗡 BbllllKA / Royal Kingdom` имеет `searchKeys`, содержащий **`вышка`** и `vyshka`;
- участники этой команды также получили `вышка` в participant `searchKeys`.

Клиентский `search-aliases-v0559.js` исправлен на exact rule `BbllllKA + Royal Kingdom`, нормализация убирает emoji/символы, а при фактической мутации массив snapshot клонируется для сброса WeakMap haystack-кэша. Это только fallback; основной источник — server snapshot.

Контрольные алиасы минимум:
`Has ne dogonyat ↔ нас не догонят`, `XAOC ↔ хаос`, `TOPMO3OB HET ↔ тормозов нет`, `MOLOT POKA ↔ молот рока`, `HEPBbI/HEPBbl B HOPME ↔ нервы в норме`, `Mbl Pycckue ↔ мы русские`, `CKAZKA ↔ сказка`, `BEHOM ↔ веном`, `Aquamarine ↔ аквамарин`, `Da budet swet ↔ да будет свет`, `Mike ↔ майк`, `Xabib ↔ хабиб`, `JoyBand ↔ джойбанд`, `1BY ↔ 1бу`, `BbllllKA (Royal Kingdom) ↔ вышка`.

---

## 8. Snapshot Writer / Apps Script

- Unified Snapshot Writer: **`1.2.4`**
- schemaVersion: `1.4.2`
- searchIndexVersion: **`1.1.3`**
- Fallback API: `1.2.1`
- team status bridge: `1.0.0`
- handler: `MINIAPP_exportUnifiedSnapshotToGitHub`

Snapshot включает participants, teams, роли/игры/команды, спецназ-очки/ранги, историю, `searchKeys`, `team.status`, `dataHash`.

Один штатный writer trigger: `MINIAPP_exportUnifiedSnapshotToGitHub` каждые 5 минут.

### Инсталлятор `scripts/install-vyshka-search-v0559.sh`

- backup;
- `clasp pull` фактического live-кода;
- точечный patch;
- syntax check;
- `clasp status` перед push;
- `clasp push`;
- sync `apps-script-live/`;
- verifier читает большой snapshot через stdin pipe, не через environment variable;
- success допускается только при наличии `🗡 BbllllKA / Royal Kingdom` и `вышка` в её `searchKeys`.

---

## 9. Worker/backend

Frontend Worker origin: `https://royal-crm-miniapp-api.tropical-spoon.workers.dev`.

Repo config:
- `worker/wrangler.toml`
- main: `src/entry-v1110.js`
- wrapper version in repo: `1.11.2`

Критические правила:
- participant identity = raw Telegram ID;
- `/snapshot` не удаляет `searchKeys` / `searchIndexVersion` / `team.status`;
- `team.status` восстанавливается по `team.key` или точной связке `название + игра`.

Repo commit не считать автоматически доказанным production runtime.

---

## 10. Навигация и медиакэш

Навигационный инвариант:
- **вперёд** → новый экран сверху (`scrollY=0`);
- **назад** → точная сохранённая позиция предыдущего экрана.

Медиакэш (`media-persistent-cache-v0554.js`, внутренний version `0.5.54.1`):
- IndexedDB cache-first;
- ключ аватара зависит от стабильного `avatarFileId`;
- **ключ фото команды = нормализованная связка `название команды + игра`**, а не `photoUrl`;
- Google Sheets `lh7-rt.googleusercontent.com/...` URL считается временным source URL: он может меняться при каждом 5-минутном snapshot даже без смены самой картинки и не должен участвовать в identity кэша;
- после получения snapshot выполняется **только disk prewarm** сохранённых фото команд из IndexedDB в `teamMemory`; сетевые фото при этом не предзагружаются;
- при открытии уже кэшированной команды фото берётся из memory/disk до сети;
- кэшированное фото может быть фоново обновлено после 30 минут с последней сетевой загрузки; это не блокирует первоначальный показ;
- новые team-cache записи живут до 45 дней без использования и участвуют в общем лимите примерно 420 записей;
- старые записи, созданные до hotfix и ключованные временным `photoUrl`, не являются стабильными: после этой правки конкретную команду может потребоваться один раз загрузить из сети, после чего следующие открытия/перезапуски используют стабильный ключ;
- не более двух параллельных сетевых загрузок аватаров;
- avatar lazy-loading около viewport;
- собственная ава не должна мигать буквенной заглушкой при rerender.

---

## 11. История изменений / credits

Текущий changelog: `changelog-v0559.js`.

Шапка `Помощь в разработке, тесты` содержит:
- `@sfinks_spb`
- `@O_Chaplygina`
- `@Yanochka_2404`
- `@DmitryRoyal`

Кредиты не повторяются внутри карточек отдельных версий.

---

## 12. Что нельзя случайно откатить

- не терять Telegram `location.hash` при redirects;
- не возвращать `meta refresh` в active entrypoint;
- не использовать name/username как participant identity;
- не удалять `searchKeys` или `team.status` Worker-санитизацией;
- не определять статус команды только по имени без игры;
- не связывать фильтр каталога активных команд с обычной страницей `Команды`;
- не возвращать крота к `<img>`, внешнему JPG или SVG-обёртке;
- источник крота v0.5.59 — встроенный JPEG data-asset;
- не возвращать ошибочное имя `BbIIIIKA`; фактическое имя = `🗡 BbllllKA`;
- server alias `'bbllllka': ['вышка']` должен оставаться в Unified Snapshot Writer;
- **не использовать временный `team.photoUrl` как ключ постоянного кэша фото команды**;
- disk prewarm фото команд не превращать в массовую сетевую предзагрузку;
- не заставлять Back открывать список сверху;
- не удалять `@DmitryRoyal` из credits.

---

## 13. Минимальный smoke-test frontend

1. Launch через `https://t.me/doveofpeace_bot?startapp`.
2. Авторизация не потеряна.
3. Бейдж версии = `v0.5.59`.
4. Обычный поиск и `Все / РМ / РК` работают.
5. `вышка` находит `🗡 BbllllKA` в Royal Kingdom, включая фильтр `РК`.
6. Активные команды имеют золотую рамку.
7. На странице команды крот без серых/зелёных/красных полос.
8. На активных командных карточках справа тот же чистый крот.
9. Тап по правой зоне карточки открывает выбранную команду; крот на странице команды открывает каталог.
10. Заголовок каталога: `Команды принимающие участие в базе спецназа`.
11. В каталоге работают поиск и `Все / РМ / РК`.
12. Открыть команду с фото первый раз после hotfix → допустима одна сетевая загрузка; вернуться назад и открыть ту же команду повторно → фото должно появиться сразу из memory.
13. Полностью закрыть Mini App, открыть снова и открыть уже ранее загруженную команду → фото должно подниматься из IndexedDB/disk prewarm без сетевой задержки.
14. Forward открывает сверху; Back восстанавливает прежнюю позицию.
15. В credits виден `@DmitryRoyal`.

---

## 14. Завершение будущей работы

После принятой правки обязательно обновлять `CURRENT_STATE.md` и добавлять новую верхнюю запись в `WORK_HISTORY.md`. При изменении постоянного инварианта обновлять `RELEASE_RULES.md`.