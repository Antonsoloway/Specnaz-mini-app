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

## 3. Live Apps Script

Полный standalone Apps Script таблиц сохранён в `apps-script-live/`.

На 18.08.2026 подтверждены 28 исходных файлов + `LIVE_MIRROR_MANIFEST.md`.

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

Текущий Unified Snapshot Writer: **`1.2.4`**.  
`searchIndexVersion`: **`1.1.3`**.  
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
- `media-persistent-cache-v0554.js` — фактически версия **0.5.54.1**
- `self-avatar-priority-v0556.js`
- `navigation-scroll-top-v0558.js`
- `active-teams-v0559.js`
- `active-teams-title-v0559.js`
- `active-teams-v0559.css`
- `contact-by-id-v0559.js`
- `changelog-v0559.js`
- `stable-v0559.js`

---

## 6. Контакт с участниками

### Участники с `@username`
Поведение не менялось:
- видна синяя `@username`-ссылка;
- нажатие открывает существующее меню;
- доступны `Написать в ЛС` и `Позвать в чате`.

### Участники без `@username`
Активен модуль `contact-by-id-v0559.js`.

Правила:
- если `@username` отсутствует, на его обычном месте показывается синяя кнопка **`Связаться`**;
- identity берётся только из **raw Telegram ID**;
- кнопка появляется в списке `Участники`, составе команды и профиле участника; также модуль умеет декорировать внутренние directory/hero-карточки, если в них есть raw Telegram ID;
- при нажатии используется deep link `tg://user?id=<RAW_TELEGRAM_ID>`;
- deep link запускается непосредственно из пользовательского клика через скрытый `<a>`, а не через `WebApp.openTelegramLink()`, потому что `openTelegramLink()` предназначен для `https://t.me/...`;
- privacy/ограничения Telegram могут не позволить открыть отдельного пользователя по ID; это ограничение Telegram, а не CRM;
- наличие `@username` всегда имеет приоритет: кнопка `Связаться` не добавляется, если уже есть `[data-user-menu]`.

Не использовать имя или `@username` как identity для ID-кнопки.

---

## 7. Активные команды / база спецназа

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

## 8. Поиск

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

Фактически подтверждено в `royal-crm-data/snapshot.json`:
- объект `🗡 BbllllKA / Royal Kingdom` содержит `вышка` и `vyshka` в `searchKeys`;
- участники этой команды также получают этот alias.

Не возвращать ошибочное написание `BbIIIIKA`.

---

## 9. Медиакэш

Активный файл: `media-persistent-cache-v0554.js`, внутренняя версия **`0.5.54.1`**.

### Аватары
- ключ = актуальный `avatarFileId`;
- IndexedDB cache-first;
- не более двух параллельных сетевых загрузок;
- lazy loading около viewport;
- своя ава получает приоритетное восстановление.

### Фото команд
Корневая проблема старой реализации: `photoUrl` из Google Sheets является временным `lh7-rt.googleusercontent.com/...` URL и меняется между snapshot даже при том же изображении. Поэтому старый ключ по `photoUrl` постоянно промахивался.

Текущие правила:
- ключ фото = стабильная связка **нормализованное имя команды + игра**;
- `photoUrl` не является identity кэша;
- уже сохранённые team blobs после загрузки CRM поднимаются из IndexedDB в `teamMemory` без сетевого prewarm;
- при открытии команды сначала показывается memory/disk cache;
- старое сохранённое фото может быть показано сразу, а после ~30 минут выполняется фоноваая проверка/refresh;
- если команда реально сменила фото, новое изображение заменяет cached blob при refresh;
- cleanup примерно через 45 дней, общий лимит около 420 изображений.

Не возвращать ключ team cache к временному `photoUrl`.

---

## 10. Навигация

Инвариант:
- **вперёд** → новый экран сверху (`scrollY=0`);
- **назад** → точная сохранённая позиция предыдущего экрана.

Не возвращать ошибочное поведение v0.5.57, где Back тоже отправлял список наверх.

---

## 11. Worker/backend

Frontend Worker origin: `https://royal-crm-miniapp-api.tropical-spoon.workers.dev`.

Repo config:
- `worker/wrangler.toml`
- main: `src/entry-v1110.js`
- wrapper version в repo: `1.11.2`

Критические правила:
- participant identity = raw Telegram ID;
- `/snapshot` не удаляет `searchKeys`, `searchIndexVersion`, `team.status`;
- `team.status` восстанавливается по `team.key` или точной связке `название + игра`.

Repo commit не считать автоматически доказанным production runtime.

---

## 12. История изменений / credits

Текущий changelog: `changelog-v0559.js`.

Шапка `Помощь в разработке, тесты` содержит:
- `@sfinks_spb`
- `@O_Chaplygina`
- `@Yanochka_2404`
- `@DmitryRoyal`

Кредиты не повторяются внутри карточек отдельных версий.

---

## 13. Что нельзя случайно откатить

- не терять Telegram `location.hash` при redirects;
- не возвращать `meta refresh` в active entrypoint;
- не использовать name/username как participant identity;
- не удалять `searchKeys` или `team.status` Worker-санитизацией;
- не определять статус команды только по имени без игры;
- не связывать фильтр каталога активных команд с обычной страницей `Команды`;
- не возвращать крота к `<img>`, внешнему JPG или SVG-обёртке;
- не возвращать ошибочное имя `BbIIIIKA`;
- server alias `'bbllllka': ['вышка']` должен оставаться в Unified Snapshot Writer;
- не возвращать team-photo cache key к временному Google `photoUrl`;
- не массово скачивать все фото команд при старте;
- если у участника нет `@username`, не оставлять место пустым: использовать `Связаться` по raw Telegram ID;
- у участника с `@username` не заменять существующее username-меню ID-кнопкой;
- не заставлять Back открывать список сверху;
- не удалять `@DmitryRoyal` из credits.

---

## 14. Минимальный smoke-test frontend

1. Launch через `https://t.me/doveofpeace_bot?startapp`.
2. Авторизация не потеряна.
3. Бейдж версии = `v0.5.59`.
4. Обычный поиск и `Все / РМ / РК` работают.
5. `вышка` находит `🗡 BbllllKA` в Royal Kingdom, включая фильтр `РК`.
6. Активные команды имеют золотую рамку.
7. На странице команды крот без артефактов.
8. На активных карточках справа тот же крот.
9. Заголовок каталога: `Команды принимающие участие в базе спецназа`.
10. В каталоге работают поиск и `Все / РМ / РК`.
11. Ранее открытая команда после повторного входа показывает cached photo без прежней сетевой задержки.
12. У участника с `@username` отображается прежняя `@`-кнопка и меню.
13. У участника без `@username` отображается кнопка `Связаться`.
14. Тап по `Связаться` пытается открыть Telegram-профиль через `tg://user?id=<raw id>` и не открывает карточку участника внутри Mini App вместо этого.
15. Forward открывает сверху; Back восстанавливает прежнюю позицию.
16. В credits виден `@DmitryRoyal`.

---

## 15. Завершение будущей работы

После принятой правки обязательно обновлять `CURRENT_STATE.md` и добавлять новую верхнюю запись в `WORK_HISTORY.md`. При изменении постоянного инварианта обновлять `RELEASE_RULES.md`.