# Royal CRM / «Таблица ЧП» — CURRENT STATE

> **Актуально на 18.08.2026.**
> Это база текущего состояния проекта. Новый чат обязан сначала прочитать `START_HERE.md`, затем этот файл и последние записи `WORK_HISTORY.md`.
> **Фактический runtime / живые Google Sheets / live Apps Script / текущий GitHub имеют приоритет над памятью чатов.**

## 1. Обязательный протокол работы

1. Не менять код по памяти.
2. Перед правкой открыть фактический файл и проверить текущую версию/SHA/подключение.
3. Если задача зависит от данных — сверить актуальный `snapshot.json` и/или живую Google Sheets.
4. Если задача относится к Apps Script таблиц — использовать `apps-script-live/` как зеркало последнего `clasp pull` и при необходимости дополнительно сверять live Apps Script.
5. После принятой/проверенной работы обязательно обновить:
   - `CURRENT_STATE.md`;
   - `WORK_HISTORY.md`;
   - `RELEASE_RULES.md`, если изменился постоянный инвариант;
   - `docs/tables/*.md`, если изменилась структура таблиц;
   - `apps-script-live/`, если реально менялся live Apps Script.
6. Работа не считается полностью завершённой, пока состояние и история проекта не обновлены.
7. Подробный порядок: `START_HERE.md`.

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
- `snapshot.json` — атомарный подготовленный снимок для Mini App.

### Проектная база знаний

- `START_HERE.md` — обязательная инструкция для новых чатов.
- `CURRENT_STATE.md` — текущее состояние.
- `WORK_HISTORY.md` — фактическая история работ/диагнозов/откатов.
- `RELEASE_RULES.md` — постоянные правила frontend-релизов.
- `docs/tables/ADMIN_TABLE_STRUCTURE.md` — структура живой админской таблицы.
- `docs/tables/PUBLIC_TABLE_STRUCTURE.md` — структура живой публичной таблицы.

---

## 3. Полный live Apps Script mirror

Полный текущий standalone Apps Script таблиц сохранён в `apps-script-live/`.

Зеркало получено через `clasp pull` из рабочей папки Cloud Shell `~/table-chp-1.3`.

На 18.08.2026 подтверждены **28 исходных файлов + `LIVE_MIRROR_MANIFEST.md`**. Последняя синхронизация зеркала: `2026-08-18T18:12:05+00:00`.

Ключевые файлы:

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
- `12_MINI_APP_API.js` … `27_MINIAPP_TEAM_STATUS.js`
- `appsscript.json`
- `Вспом функции.js`

`27_MINIAPP_TEAM_STATUS.js` — bridge статуса команды из живого листа `Команды`, колонка L, в Mini App snapshot.

`apps-script-live/LIVE_MIRROR_MANIFEST.md` содержит SHA-256 каждого файла.

**Не хранятся в GitHub:** `.clasp.json`, Script Properties, bot tokens, GitHub tokens, Cloudflare secrets.

После любого фактического изменения/push live Apps Script заново выполнить:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Antonsoloway/Specnaz-mini-app/main/scripts/sync-live-apps-script-to-github.sh)
```

Скрипт делает backup вне live-папки, `clasp status`, `clasp pull`, проверку критических файлов и только затем обновляет зеркало GitHub.

---

## 4. Живые Google Sheets

### Админская таблица

Название: `Royal_CRM_GOOGLE_ПОИСК_FINAL_FIXED`.

Полная структура зафиксирована в `docs/tables/ADMIN_TABLE_STRUCTURE.md`.

Ключевые листы: `Главная`, `Аватары`, `База участников`, `Команды`, `Рейтинг команд`, `Рейтинг игроков`, `Поиск`, `Карточка команды`, `История спецназа`, `Справочник`, `Инструкция`, `Списки`, `Связи участников`, webhook/activity helper-листы.

Ключевая participant identity: **raw Telegram ID**.

На листе `Команды` колонка **L = `Статус`**. Фактические значения: `Активен`, `На паузе`, `Неактивен`.

Для Mini App статус команды определяется только по связке **название + игра**. Нельзя переносить статус между одноимёнными командами Royal Match и Royal Kingdom.

### Публичная таблица

Название: `🕊️ЧАТ ПОБЕДИТЕЛЕЙ🕊️`.

Полная структура: `docs/tables/PUBLIC_TABLE_STRUCTURE.md`.

Публичная таблица получает данные из админской; обратной записи быть не должно.

---

## 5. Текущий frontend

- **Mini App: `v0.5.59`**
- активный физический entrypoint: `app-v0559.html`
- `app.html` перенаправляет на `app-v0559.html`, сохраняя `search + hash`.
- `index.html` также направлен на `app-v0559.html` и сохраняет Telegram hash.
- GitHub source переключён на v0.5.59 18.08.2026; фактический Telegram smoke-test после последних UI/search-фиксов нужно считать отдельным production-подтверждением.

Ключевые активные модули:

- `transport-v0514.js`
- `app.js`
- `team-identity-fix.js`
- `navigation-v0521.js`
- `navigation-card-restore-v0532.js`
- `search-hybrid-v0553.js`
- `search-aliases-v0559.js`
- `media-persistent-cache-v0554.js`
- `self-avatar-priority-v0556.js`
- `navigation-scroll-top-v0558.js`
- `active-teams-v0559.js`
- `active-teams-v0559.css`
- `changelog-v0559.js`
- `stable-v0559.js`

### Активные команды спецназа — v0.5.59

Источник истины: `team.status` из админской `Команды!L`, опубликованный в unified snapshot.

Для `status === "Активен"`:

- командная карточка на странице `Команды` получает золотую рамку;
- командная плашка на странице `Участники` и в профилях получает золотую рамку;
- на странице команды название золотое и обведено золотой рамкой;
- справа от названия показывается специальный значок из `assets/specnaz-active-team-v0559.jpg`;
- значок выводится как центрированный CSS background кнопки, а не обычный `<img>`, чтобы общий image-loader/кэш не заменял его серой заглушкой;
- нажатие на значок открывает страницу `Команды принимающие участие в спецназе`;
- каталог строится динамически только из команд `Активен`;
- пояснение под заголовком каталога: `Команды, участвующие в спецназе и(или) регулярно выкладывающие скрины в базе спецназа.`;
- каталог имеет собственный фильтр `Все / РМ / РК` и собственную строку поиска `Название команды или игра…`;
- фильтр/поиск каталога независимы от обычной страницы `Команды` и не меняют её состояние;
- поиск каталога использует название, игру и доступные `team.searchKeys`, поле ввода не пересоздаётся на каждой букве.

`На паузе` остаётся без золотой маркировки. Статус не определяется визуально/по названию и не угадывается.

### Навигационный инвариант

**Вперёд:** новый экран всегда открывается сверху (`scrollY=0`).

**Назад:** возвращает на сохранённую позицию предыдущего экрана/списка.

Не возвращать ошибочное поведение v0.5.57, где Back тоже отправлялся наверх.

---

## 6. Поиск

Основной активный файл: `search-hybrid-v0553.js`.

Дополнительный слой подтверждённых точечных алиасов: `search-aliases-v0559.js`.

Архитектура:

- локальная Android-safe логика остаётся независимым fallback;
- `searchKeys` — дополнительный слой;
- итог: **локальный поиск ИЛИ `searchKeys`**;
- server keys не имеют права уменьшать локальные результаты;
- нет edit-distance/fuzzy-комбинаторики/prewarm;
- поле поиска не пересоздаётся во время ввода;
- фильтр `Все / РМ / РК` ограничивает список и область поиска, не очищая запрос;
- точечные подтверждённые алиасы, которые нельзя корректно получить общим pseudo-Cyrillic алгоритмом, могут добавляться клиентским overlay по точной связке `название + игра` без изменения generic search.

`search-aliases-v0559.js` после загрузки snapshot добавляет подтверждённый алиас в `searchKeys` нужной команды и участников этой команды; generic search-код при этом не меняется.

Контрольные алиасы минимум:

`Has ne dogonyat ↔ нас не догонят`, `XAOC ↔ хаос`, `TOPMO3OB HET ↔ тормозов нет`, `MOLOT POKA ↔ молот рока`, `HEPBbI/HEPBbl B HOPME ↔ нервы в норме`, `Mbl Pycckue ↔ мы русские`, `CKAZKA ↔ сказка`, `BEHOM ↔ веном`, `Aquamarine ↔ аквамарин`, `Da budet swet ↔ да будет свет`, `Mike ↔ майк`, `Xabib ↔ хабиб`, `JoyBand ↔ джойбанд`, `1BY ↔ 1бу`, `BbIIIIKA (Royal Kingdom) ↔ вышка`.

---

## 7. Snapshot Writer / Apps Script

Live mirror файл: `apps-script-live/25_MINIAPP_UNIFIED_SNAPSHOT.js`.

Team-status bridge: `apps-script-live/27_MINIAPP_TEAM_STATUS.js`.

Текущие версии:

- Unified Snapshot Writer: `1.2.2`
- schemaVersion: `1.4.2`
- searchIndexVersion: `1.1.1`
- Fallback API: `1.2.1`
- team status bridge: `1.0.0`
- handler: `MINIAPP_exportUnifiedSnapshotToGitHub`

Snapshot включает participants, teams, роли/игры/команды, спецназ-очки/ранги, историю, `searchKeys`, `team.status`, `dataHash`.

Один штатный writer trigger: `MINIAPP_exportUnifiedSnapshotToGitHub` → каждые 5 минут.

Свежий подтверждённый snapshot после установки team-status bridge:

- `generatedAt`: `2026-08-18T18:13:21.854Z`
- `schemaVersion`: `1.4.2`
- `searchIndexVersion`: `1.1.1`
- `unifiedSnapshotVersion`: `1.2.2`
- `⚡️ MOLOT POKA / Royal Kingdom`: `status = Активен`
- контрольные paused-команды: `status = На паузе`

### Ручной запуск

**ФАЙЛ:** `25_MINIAPP_UNIFIED_SNAPSHOT.js`  
**ФУНКЦИЯ:** `MINIAPP_exportUnifiedSnapshotToGitHub()`  
**РЕЗУЛЬТАТ:** актуальный unified `snapshot.json` в data repo.

Если менялся Apps Script: backup → syntax check → `clasp status` → `clasp push` → после подтверждения снова sync `apps-script-live/`.

`clasp run ...` не считать рабочим способом, если проект не настроен API executable.

---

## 8. Worker/backend

Frontend Worker origin: `https://royal-crm-miniapp-api.tropical-spoon.workers.dev`.

Repo config:

- `worker/wrangler.toml`
- worker: `royal-crm-miniapp-api`
- main: `src/entry-v1110.js`
- wrapper version in repo: `1.11.2`
- base: `entry-v1100.js`

Критические правила:

- participant identity = только raw Telegram ID;
- `/snapshot` не удаляет `searchKeys` и `searchIndexVersion`;
- v1.11.2 дополнительно восстанавливает `team.status` из private source snapshot после sanitization;
- статус сопоставляется по `team.key` или точной связке `название + игра`;
- repo-конфиг/commit не равен доказанному production runtime: при backend-задаче отдельно проверять production `/health`, когда инструментально возможно.

GitHub→Cloudflare build для worker ранее настроен с root `/worker` и `npx wrangler deploy`; секреты остаются только в Cloudflare Variables/Secrets.

Repo vars: `FRONTEND_ORIGIN=https://antonsoloway.github.io`, `DATA_REPO=Antonsoloway/royal-crm-data`, `DATA_BRANCH=main`, `DATA_PATH=snapshot.json`.

---

## 9. Изображения и локальный кэш

`media-persistent-cache-v0554.js`:

- IndexedDB `royal-crm-media-cache`;
- cache-first;
- аватар key = актуальный `avatarFileId`;
- team photo key = актуальный `photoUrl`;
- максимум 2 параллельных avatar network load;
- lazy загрузка около viewport;
- cleanup примерно 45 дней;
- лимит примерно 420 изображениями.

`self-avatar-priority-v0556.js`:

- собственная ава восстанавливается приоритетно;
- не ждёт общей очереди;
- уже показанный URL сохраняется в памяти запуска;
- rerender не должен мигать буквенной заглушкой.

---

## 10. История изменений / credits

Текущий changelog: `changelog-v0559.js`.

Шапка `Помощь в разработке, тесты` содержит:

- `@sfinks_spb`
- `@O_Chaplygina`
- `@Yanochka_2404`
- `@DmitryRoyal`

Кредиты не повторяются внутри карточек отдельных версий.

---

## 11. Последние важные релизы

- `v0.5.53` — hybrid search + server `searchKeys` transport/use.
- `v0.5.54` — IndexedDB persistent image cache.
- `v0.5.55` — приоритетная своя ава.
- `v0.5.56` — устранено мигание своей авы.
- `v0.5.57` — первая попытка global top; Back ошибочно наверх.
- `v0.5.58` — forward сверху, Back возвращает прежний `scrollY`.
- `v0.5.59` — статус активных команд спецназа, золотая маркировка, центрированный значок, каталог активных команд с независимыми фильтрами/поиском, подтверждённый алиас `BbIIIIKA (РК) ↔ вышка`; в credits добавлен `@DmitryRoyal`.

Подробные фактические записи и важные диагнозы: `WORK_HISTORY.md`.

---

## 12. Что нельзя случайно откатить

- не возвращать старые smart-search модули в active entrypoint;
- не заменять hybrid search только на `searchKeys`;
- не удалять `searchKeys` Worker-санитизацией;
- не удалять `team.status` Worker-санитизацией;
- не определять активность команды по имени без игры;
- не рендерить спецназ-значок активной команды обычным `<img>`;
- не связывать фильтр каталога активных команд с состоянием фильтра обычной страницы `Команды`;
- не пересоздавать поле поиска каталога при каждой букве;
- не удалять `search-aliases-v0559.js` и точечный алиас `BbIIIIKA / Royal Kingdom ↔ вышка`, пока название команды остаётся таким;
- не использовать name/username как participant identity;
- не делать массовый prewarm изображений/поиска;
- не терять Telegram `location.hash` при redirects;
- не использовать `meta refresh` для active redirect;
- не заставлять Back открывать список сверху;
- не очищать query при `Все / РМ / РК`;
- не повторять credits/boilerplate в каждой карточке changelog;
- не удалять `@DmitryRoyal` из постоянного credits-блока;
- не править Apps Script по старой копии, если можно сверить `apps-script-live/`/live проект;
- не считать GitHub commit автоматически подтверждением production deployment.

---

## 13. Минимальный smoke-test frontend

1. Launch через `https://t.me/doveofpeace_bot?startapp`.
2. Telegram initData/авторизация не потеряны.
3. Android search ввод без лагов/задвоений/пропавших пробелов.
4. `Все / РМ / РК` работают вместе с поиском.
5. Контрольные алиасы находятся, включая `вышка` → `BbIIIIKA` в Royal Kingdom.
6. При фильтре `РК` запрос `вышка` по-прежнему показывает `BbIIIIKA`.
7. Открытие команды из середины списка → команда сверху.
8. `Назад` → прежнее место списка.
9. `Участники → профиль → Назад` сохраняет карточки/ранги/ачивки.
10. Аватары/фото после первого открытия приходят из IndexedDB.
11. Своя ава не мигает после snapshot rerender.
12. Бейдж версии = `v0.5.59`, история открывает v0.5.59 первой.
13. На странице `Команды` активные команды в золотой рамке, paused — без неё.
14. На странице `Участники` плашки активных команд в золотой рамке.
15. `⚡️ MOLOT POKA / РК`: золотое название в рамке + специальный значок справа.
16. Значок активной команды полностью виден и центрирован, без серой заглушки/обрезки.
17. Нажатие на значок открывает `Команды принимающие участие в спецназе` и показывает только `status = Активен`.
18. В каталоге работают `Все / РМ / РК`, счётчик меняется корректно.
19. Поиск каталога ищет по названию/игре и работает совместно с его фильтром, не меняя обычную страницу `Команды`.
20. В credits виден `@DmitryRoyal`.

---

## 14. Обязательное завершение любой будущей работы

После принятого результата следующий чат должен:

- обновить этот `CURRENT_STATE.md`;
- добавить новую верхнюю запись в `WORK_HISTORY.md`;
- обновить `RELEASE_RULES.md`, если изменился инвариант;
- обновить table docs, если изменилась структура Sheets;
- после live Apps Script изменений пересинхронизировать `apps-script-live/`;
- явно записать, что подтверждено: repo / build / push / manual function / production.

Точная инструкция для нового чата находится в `START_HERE.md`.