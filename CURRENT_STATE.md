# Royal CRM / «Таблица ЧП» — CURRENT STATE

> **Статус на 18.08.2026.**
> Этот файл — краткий технический handoff для нового чата/разработчика.
> **GitHub и фактические файлы имеют приоритет над памятью чата.** Перед любым изменением сначала сверять этот файл, затем открывать реальные файлы, которые будут затронуты.

## 1. Главное правило работы

1. Не менять код «по памяти» или только по описанию из старого чата.
2. Перед правкой открыть актуальный файл в GitHub и проверить его текущий SHA/содержимое.
3. Для существующего файла: сначала `fetch_file`, затем `update_file` с актуальным SHA.
4. Для нового файла использовать `create_file`.
5. После frontend-релиза проверить, что `app.html` ведёт на новый физический `app-vXYZ.html` и сохраняет `search + hash`.
6. После Apps Script-изменений: `clasp status` **до** `clasp push`.
7. После каждого принятого релиза обновлять этот `CURRENT_STATE.md`.
8. `RELEASE_RULES.md` содержит подробные правила релизов; если он расходится с фактическим runtime, сначала сверить текущий entrypoint и этот файл, затем исправить документацию.

---

## 2. Репозитории и точки входа

### Основной код

- GitHub: `Antonsoloway/Specnaz-mini-app`
- Основная ветка: `main`
- Постоянная Mini App точка входа: `app.html`
- Публичная URL: `https://antonsoloway.github.io/Specnaz-mini-app/app.html`
- Telegram bot: `@doveofpeace_bot`
- Постоянный запуск Mini App: `https://t.me/doveofpeace_bot?startapp`

### Данные

- GitHub data repo: `Antonsoloway/royal-crm-data`
- Основной файл данных: `snapshot.json`
- Google Sheets / Apps Script остаются первичным источником CRM-данных.
- `snapshot.json` — подготовленный атомарный снимок для Mini App.

---

## 3. Текущая версия frontend

### Активная версия

- **Mini App: `v0.5.58`**
- Физический entrypoint: `app-v0558.html`
- `app.html` сейчас перенаправляет на `app-v0558.html` с сохранением `window.location.search` и `window.location.hash`.
- Последняя подтверждённая GitHub Pages сборка v0.5.58: build `1157767246`, status `built`, commit `2976e87af03935758e8d1c8aa8e043722905e6c8`.

### Ключевые активные frontend-модули в `app-v0558.html`

- `transport-v0514.js` — транспорт к Worker / GAS fallback.
- `app.js` — базовый UI и основные render-функции.
- `navigation-v0521.js` — стек внутренней навигации и сохранение предыдущего `scrollY`.
- `navigation-card-restore-v0532.js` — восстановление оформления карточек после Back.
- `search-hybrid-v0553.js` — текущий поисковый модуль.
- `media-persistent-cache-v0554.js` — постоянный IndexedDB-кэш изображений.
- `self-avatar-priority-v0556.js` — приоритетная своя ава + устранение мигания заглушки.
- `navigation-scroll-top-v0558.js` — текущая логика прокрутки вперед/назад.
- `changelog-v0558.js` — текущая запись истории.
- `stable-v0558.js` — версия/стабилизационный guard.

### Текущее обязательное поведение прокрутки

**ВПЕРЁД:** любой новый экран открывается сверху (`scrollY = 0`).

**НАЗАД:** возвращает на сохранённую позицию предыдущего экрана/списка.

Пример:

`Команды (пролистали вниз) → команда` = карточка команды открывается сверху.

`Команда → Назад` = список команд возвращается ровно к прежнему месту.

**Важно:** это поведение v0.5.58. Старое правило v0.5.57 «Назад тоже наверх» больше не является актуальным.

---

## 4. Поиск — текущая архитектура

Активный файл: `search-hybrid-v0553.js`.

Поиск — **гибридный**:

1. Рабочая локальная Android-safe логика остаётся независимым fallback.
2. Серверные `searchKeys` — дополнительный слой, а не замена локального поиска.
3. Итоговое совпадение должно быть: `локальный поиск ИЛИ searchKeys`.
4. `searchKeys` не имеют права уменьшать результаты старого поиска.
5. Никакого edit-distance, fuzzy-опечаток, сотен комбинаций или тяжёлого `prewarm` на телефоне.
6. Поле поиска не должно пересоздаваться во время набора.
7. На Android разрешено лёгкое чтение `input.value` во время фокуса без вмешательства в IME.

### Фильтр игры

На страницах **Участники** и **Команды**:

- `Все` — по умолчанию.
- `РМ` — только Royal Match.
- `РК` — только Royal Kingdom.

При активном фильтре поиск работает только в выбранной игре. Переключение фильтра не очищает запрос.

### Контрольные алиасы поиска

Должны работать минимум:

- `Has ne dogonyat` ↔ `нас не догонят`
- `XAOC` ↔ `хаос`
- `TOPMO3OB HET` ↔ `тормозов нет`
- `MOLOT POKA` ↔ `молот рока`
- `HEPBbI B HOPME` / `HEPBbl B HOPME` ↔ `нервы в норме`
- `Mbl Pycckue` ↔ `мы русские`
- `CKAZKA` ↔ `сказка`
- `BEHOM` ↔ `веном`
- `Aquamarine` ↔ `аквамарин`
- `Da budet swet` ↔ `да будет свет`
- `Mike` ↔ `майк`
- `Xabib` ↔ `хабиб`
- `JoyBand` ↔ `джойбанд`
- `1BY` ↔ `1бу`

---

## 5. Snapshot / Apps Script

Активный файл в GitHub:

`apps-script/25_MINIAPP_UNIFIED_SNAPSHOT.js`

Текущие версии:

- Unified Snapshot Writer: **`1.2.1`**
- schemaVersion: **`1.4.1`**
- searchIndexVersion: **`1.1.1`**
- handler: **`MINIAPP_exportUnifiedSnapshotToGitHub`**

Файл формирует единый `snapshot.json`:

- participants
- teams
- роли/игры/команды
- спецназ-очки и ранги
- история спецназа
- `searchKeys`
- `dataHash`

### Синхронизация

`MINIAPP_installUnifiedSnapshotTrigger_()` удаляет старые snapshot-writer triggers и создаёт один trigger:

`MINIAPP_exportUnifiedSnapshotToGitHub` → **каждые 5 минут**.

Последний фактически прочитанный `royal-crm-data/snapshot.json` на момент создания этого файла:

- `generatedAt`: `2026-08-18T03:38:16.470Z`
- `schemaVersion`: `1.4.1`
- `searchIndexVersion`: `1.1.1`

Это подтверждает, что текущий Unified Snapshot Writer/trigger реально пишет актуальный формат в data repo.

### Если нужно вручную пересобрать snapshot

**ФАЙЛ Apps Script:** `25_MINIAPP_UNIFIED_SNAPSHOT.js`

**ФУНКЦИЯ:** `MINIAPP_exportUnifiedSnapshotToGitHub()`

Если менялся сам Apps Script-файл, локальная рабочая папка Cloud Shell: `~/table-chp-1.3`.

Порядок: backup → скачать актуальный GitHub-файл → syntax check → `clasp status` → `clasp push` → вручную запустить нужную функцию в Apps Script UI.

`clasp run MINIAPP_exportUnifiedSnapshotToGitHub` не считать рабочим способом, если Apps Script проект не настроен как API executable.

---

## 6. Worker / backend

Frontend использует Worker origin:

`https://royal-crm-miniapp-api.tropical-spoon.workers.dev`

Конфигурация:

- `worker/wrangler.toml`
- Worker name: `royal-crm-miniapp-api`
- current main: `src/entry-v1110.js`
- current wrapper version в файле: **`1.11.1`**
- базируется поверх `entry-v1100.js`

### Критические правила backend

- Identity участника: **только raw Telegram ID**.
- Имя / username / HMAC не использовать как идентификатор участника.
- `/snapshot` обязан передавать `searchKeys`; не удалять их при sanitization.
- `entry-v1110.js` добавляет/сохраняет deterministic pseudo-Cyrillic aliases для поиска.
- `/health` в `entry-v1110.js` заявляет `participantIdentity: telegramId-only` и `snapshotSearchKeys: preserved+deterministic-pseudo`.

### Worker vars в репозитории

- `FRONTEND_ORIGIN = https://antonsoloway.github.io`
- `DATA_REPO = Antonsoloway/royal-crm-data`
- `DATA_BRANCH = main`
- `DATA_PATH = snapshot.json`
- `TELEGRAM_CHAT_ID = -1002109152418`

Secrets (`BOT_TOKEN`, `GITHUB_TOKEN`, `SESSION_SECRET`) находятся только в Cloudflare Variables/Secrets и не должны попадать в GitHub.

Cloudflare Builds настроен из GitHub `main`, root `/worker`. Перед изменением backend желательно отдельно проверить production `/health`, а не считать repo-конфиг доказательством фактического деплоя.

---

## 7. Изображения и локальный кэш

Активный постоянный кэш: `media-persistent-cache-v0554.js`.

Поведение:

- IndexedDB database: `royal-crm-media-cache`.
- Cache-first: локальная копия → сеть.
- Аватар привязан к актуальному `avatarFileId`.
- Фото команды привязано к актуальному `photoUrl`.
- Максимум **2** параллельных загрузки аватаров.
- Аватары загружаются лениво рядом с видимой областью, а не все сразу.
- Очистка старых записей: примерно **45 дней**.
- Лимит: примерно **420 изображений**.

Своя аватарка дополнительно обслуживается `self-avatar-priority-v0556.js`:

- восстанавливается приоритетно;
- не должна ждать общей очереди;
- уже показанный URL сохраняется в памяти текущего запуска;
- при повторном render не должна мигать буквой-заглушкой.

---

## 8. Навигация

Базовый стек: `navigation-v0521.js`.

Он сохраняет состояние предыдущего экрана, включая `scrollY`, query поиска и HTML/тип страницы.

Дополнение v0.5.58: `navigation-scroll-top-v0558.js`.

**Не делать:** снова оборачивать `RoyalNav.back()` принудительным `scrollTo(0,0)`.

**Правильно:** вперед → top, назад → сохранённый `scrollY` через `RoyalNav`.

---

## 9. Последние важные релизы

- **v0.5.53** — hybrid search + нормальная доставка/использование searchKeys.
- **v0.5.54** — постоянный IndexedDB-кэш аватаров и фото команд.
- **v0.5.55** — приоритетная загрузка собственной авы.
- **v0.5.56** — убрано мигание буквенной заглушки своей авы при rerender.
- **v0.5.57** — первая попытка глобального scroll-to-top; Back ошибочно тоже отправлялся вверх.
- **v0.5.58** — исправлено: forward всегда сверху, Back восстанавливает прежнее место.

---

## 10. Известные документационные расхождения

На момент создания `CURRENT_STATE.md` файл `RELEASE_RULES.md` ещё содержит блок текущей версии `v0.5.57` и старое правило, где Back тоже отправляется вверх.

**Фактический runtime уже v0.5.58.** Для навигации считать актуальным правило из этого файла:

> Новый экран → сверху. Назад → точное прежнее место.

При следующем изменении `RELEASE_RULES.md` это расхождение нужно убрать.

---

## 11. Что нельзя случайно откатить

- Не возвращать старые `smart-search-v0540/v0541/v0542` в активный entrypoint.
- Не заменять hybrid search только на `searchKeys`.
- Не удалять `searchKeys` в Worker `/snapshot`.
- Не использовать name/username как participant identity.
- Не делать массовый prewarm изображений или поиска на Android.
- Не терять Telegram `location.hash` при редиректе `app.html/index.html`.
- Не возвращать `meta refresh` для entrypoint redirects.
- Не заставлять Back открывать список сверху.
- Не сбрасывать поисковый запрос при переключении `Все / РМ / РК`.
- Не добавлять в каждую карточку changelog повторяющиеся кредиты помощников.

---

## 12. Проверка перед следующим релизом

Минимальный smoke-test:

1. Открыть через `https://t.me/doveofpeace_bot?startapp`.
2. Авторизация проходит, Telegram initData не потерян.
3. Участники: ввод на Android без лагов/задвоений/пропавших пробелов.
4. Команды: фильтры `Все / РМ / РК` работают вместе с поиском.
5. Контрольные поисковые алиасы находятся.
6. Открыть команду из середины/низа списка → команда сверху.
7. Нажать `Назад` → список вернулся на прежнее место.
8. `Участники → профиль → Назад` сохраняет карточки/ранги/ачивки.
9. Аватары/фото после первого открытия приходят из IndexedDB-кэша.
10. Своя ава не мигает буквенной заглушкой после прихода snapshot.
11. Бейдж версии и History показывают одну и ту же актуальную версию.

---

## 13. Инструкция для нового ChatGPT-чата

Достаточно написать:

> **Продолжаем Royal CRM / «Таблица ЧП». Сначала прочитай `CURRENT_STATE.md`, затем открой фактические файлы GitHub, которые относятся к задаче. GitHub — источник истины. Не предлагай и не выполняй изменения по памяти, пока не сверишь текущий код.**

Если `CURRENT_STATE.md` и код расходятся, **код/фактический deployment проверяются первыми**, после чего `CURRENT_STATE.md` обновляется.
