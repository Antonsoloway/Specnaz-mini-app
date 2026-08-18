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
- постоянный launch link: `https://t.me/doveofpeace_bot?startapp`

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

На 18.08.2026 подтверждены 28 исходных файлов + `LIVE_MIRROR_MANIFEST.md`. После server-side исправления поиска `BbIIIIKA → вышка` live mirror был заново синхронизирован через Cloud Shell и содержит фактический writer `1.2.3` / search index `1.1.2`.

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

После любого live Apps Script push заново выполнить sync helper:

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

Статус команды в Mini App определяется строго по связке **название + игра**. Нельзя переносить статус между одноимёнными командами Royal Match и Royal Kingdom.

### Публичная таблица

Название: `🕊️ЧАТ ПОБЕДИТЕЛЕЙ🕊️`.

Публичная таблица получает данные из админской; обратной записи быть не должно.

---

## 5. Текущий frontend

- **Mini App: `v0.5.59`**
- активный физический entrypoint: `app-v0559.html`
- `app.html` и `index.html` ведут на `app-v0559.html`, сохраняя Telegram `search + hash`.
- GitHub source обновлён 18.08.2026; после последних UI-hotfix требуется отдельный Telegram Android smoke-test.

Ключевые активные модули:

- `transport-v0514.js`
- `app.js`
- `team-identity-fix.js`
- `navigation-v0521.js`
- `navigation-card-restore-v0532.js`
- `search-hybrid-v0553.js`
- `search-aliases-v0559.js` — legacy/client safety overlay; **не считать источником истины для `вышка`**
- `media-persistent-cache-v0554.js`
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
- справа у активной `.team-card` вместо обычной стрелки расположен тот же крот; он остаётся частью родительской карточки, поэтому тап открывает выбранную команду;
- каталог строится только из команд `Активен`;
- каталог имеет собственный фильтр `Все / РМ / РК` и собственный поиск;
- фильтр/поиск каталога независимы от обычной страницы `Команды`.

### Текущий источник изображения крота

После повторных Android-артефактов **SVG и внешние image-assets больше не используются для крота**.

`active-teams-v0559.css` содержит точный присланный пользователем чистый крот как **встроенный JPEG data-asset** в CSS custom property `--royal-specnaz-mole-v0559`.

Это один и тот же raster-источник для:

- кнопки на странице команды;
- правой зоны активной командной карточки.

Не возвращать SVG-обёртку `assets/specnaz-active-team-clean-v0559.svg` в active CSS и не возвращать обычный `<img>` для этого значка.

### Текст каталога

Верхний золотой заголовок должен быть визуально:

**`Команды принимающие участие в базе спецназа`**

Для гарантированной замены после внутреннего render подключён `active-teams-title-v0559.js`, который следит только за содержимым `#panel` и исправляет заголовок/aria-label кнопки каталога.

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

### `BbIIIIKA / Royal Kingdom ↔ вышка`

Первоначальная клиентская попытка через `search-aliases-v0559.js` оказалась недостаточно надёжной: основной `search-hybrid-v0553.js` кэширует haystack карточек, а поздняя мутация `team.searchKeys` не меняет ссылку snapshot-массивов и поэтому не гарантирует сброс уже построенного WeakMap-кэша.

**Правильный источник алиаса теперь server-side:**

- live Apps Script `apps-script-live/25_MINIAPP_UNIFIED_SNAPSHOT.js`;
- `MINIAPP_UNIFIED_SEARCH_ALIASES` содержит `'bbiiiika': ['вышка']`;
- Unified Snapshot Writer: `1.2.3`;
- `searchIndexVersion`: `1.1.2`;
- алиас попадает в `team.searchKeys` при построении snapshot **до** загрузки данных клиентом;
- Worker обязан сохранить эти `searchKeys` при sanitization.

Точечный client overlay можно оставлять только как дополнительную страховку, но **не использовать вместо server snapshot** для подтверждённых CRM-алиасов.

Контрольные алиасы минимум:

`Has ne dogonyat ↔ нас не догонят`, `XAOC ↔ хаос`, `TOPMO3OB HET ↔ тормозов нет`, `MOLOT POKA ↔ молот рока`, `HEPBbI/HEPBbl B HOPME ↔ нервы в норме`, `Mbl Pycckue ↔ мы русские`, `CKAZKA ↔ сказка`, `BEHOM ↔ веном`, `Aquamarine ↔ аквамарин`, `Da budet swet ↔ да будет свет`, `Mike ↔ майк`, `Xabib ↔ хабиб`, `JoyBand ↔ джойбанд`, `1BY ↔ 1бу`, `BbIIIIKA (Royal Kingdom) ↔ вышка`.

---

## 8. Snapshot Writer / Apps Script

- Unified Snapshot Writer: **`1.2.3`**
- schemaVersion: `1.4.2`
- searchIndexVersion: **`1.1.2`**
- Fallback API: `1.2.1`
- team status bridge: `1.0.0`
- handler: `MINIAPP_exportUnifiedSnapshotToGitHub`

Snapshot включает participants, teams, роли/игры/команды, спецназ-очки/ранги, историю, `searchKeys`, `team.status`, `dataHash`.

Один штатный writer trigger: `MINIAPP_exportUnifiedSnapshotToGitHub` каждые 5 минут.

### Подтверждённый server snapshot после исправления `вышка`

- `generatedAt=2026-08-18T19:33:12.518Z` (`22:33:12` по пользовательскому UTC+3);
- `schemaVersion=1.4.2`;
- `searchIndexVersion=1.1.2`;
- новый `dataHash` опубликован в `royal-crm-data/snapshot.json`;
- live mirror подтверждает server alias `'bbiiiika': ['вышка']` до построения `searchKeys`.

Предыдущий snapshot `19:28:13Z` имел `searchIndexVersion=1.1.1`; это объясняет, почему сразу после `clasp push` пользователь ещё видел старое поведение до следующего 5‑минутного trigger.

### Инсталлятор

`scripts/install-vyshka-search-v0559.sh`:

- делает backup;
- `clasp pull` фактического live-кода перед patch;
- syntax check;
- `clasp status` перед push;
- `clasp push`;
- sync `apps-script-live/`;
- verifier больших `snapshot.json` теперь передаёт JSON в Python через **stdin pipe**, а не environment variable — это устраняет ошибку `/usr/bin/python3: Argument list too long`.

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

Медиакэш:

- IndexedDB cache-first;
- ключ аватара зависит от `avatarFileId`;
- ключ фото команды зависит от `photoUrl`;
- не более двух параллельных сетевых загрузок аватаров;
- lazy-loading около viewport;
- cleanup примерно через 45 дней;
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
- источник крота для v0.5.59 — встроенный JPEG data-asset в `active-teams-v0559.css`;
- не возвращать `BbIIIIKA / Royal Kingdom ↔ вышка` только к позднему client overlay: серверный алиас должен оставаться в Unified Snapshot Writer;
- не заставлять Back открывать список сверху;
- не удалять `@DmitryRoyal` из credits.

---

## 13. Минимальный smoke-test frontend

1. Launch через `https://t.me/doveofpeace_bot?startapp`.
2. Авторизация не потеряна.
3. Бейдж версии = `v0.5.59`.
4. Обычный поиск и `Все / РМ / РК` работают.
5. `вышка` находит `BbIIIIKA` в Royal Kingdom, включая фильтр `РК`.
6. Активные команды имеют золотую рамку.
7. На странице команды крот показывает **точно чистое присланное изображение**, без серых/зелёных/красных полос.
8. На активных командных карточках справа тот же чистый крот.
9. Тап по кроту/правой зоне карточки открывает выбранную команду; крот на странице команды открывает каталог.
10. Заголовок каталога: `Команды принимающие участие в базе спецназа`.
11. В каталоге работают поиск и `Все / РМ / РК`.
12. Forward открывает сверху; Back восстанавливает прежнюю позицию.
13. В credits виден `@DmitryRoyal`.

---

## 14. Завершение будущей работы

После принятой правки обязательно обновлять `CURRENT_STATE.md` и добавлять новую верхнюю запись в `WORK_HISTORY.md`. При изменении постоянного инварианта обновлять `RELEASE_RULES.md`.