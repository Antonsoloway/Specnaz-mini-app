# Royal CRM / «Таблица ЧП» — WORK HISTORY

> Краткий журнал фактически выполненных работ. Новые записи добавляются сверху.
> Здесь фиксируются изменения, проверки, диагнозы и откаты, которые нужны следующему чату.

## 2026-08-19 — v0.5.59: «Связаться» переделано через Голубца и inline-кнопку профиля

**Симптом:** кнопка `Связаться` у участника без `@username` отображалась, но при нажатии визуально ничего не происходило.

**Точная причина:** первая реализация пыталась открыть `tg://user?id=<raw id>` непосредственно из Telegram Mini App WebView через скрытый `<a>`/`location.href`. Такой ID-link не является обычной универсальной клиентской ссылкой. Telegram поддерживает ID-ссылку в контексте Bot API inline links/buttons; прямой запуск из Mini App был неправильной архитектурой.

**Исправлено:**
- прямой `tg://user?id` из `contact-by-id-v0559.js` удалён;
- модуль поднят до внутренней версии **`0.5.59.2`**;
- добавлен Worker wrapper `worker/src/entry-v1120.js`, версия **`1.12.0`**;
- `worker/wrangler.toml` переключён на `src/entry-v1120.js`;
- добавлен защищённый `POST /contact-by-id`;
- requester определяется из session и проверяется по актуальному CRM snapshot;
- target берётся только как raw Telegram ID и проверяется как текущий участник со статусом `В чате` без `@username`;
- Worker использует существующий Cloudflare secret `BOT_TOKEN`; токен не попадает во frontend;
- Голубец отправляет requester-у в ЛС сообщение с Telegram inline-кнопкой **`👤 Открыть профиль`**, URL кнопки = `tg://user?id=<targetId>`;
- после успешной отправки Mini App показывает popup **`Ссылка готова`** → **`Открыть Голубя`**; переход выполняется после явного пользовательского нажатия, поэтому результат не зависит от async-navigation после fetch;
- если бот не может написать requester-у, frontend получает и показывает понятную ошибку;
- добавлен короткий cooldown от двойного нажатия;
- `app-v0559.html` подключает новый frontend с cache-bust `contact-by-id-v0559.js?v=20260819-0015`;
- changelog исправлен: прежнее описание прямого `tg://` больше не считается действующим.

**Backend deployment:** repo/config переключены на Worker `1.12.0`. Cloudflare Builds ранее настроены на GitHub main + `/worker`. Для отделения repo-state от фактического runtime добавлен `.github/workflows/worker-smoke.yml`, который сверяет active wrapper version с production `/health` и при успехе должен сохранить `runtime/worker-health.json`. До появления такого proof или прямой проверки не объявлять production runtime подтверждённым только по commit.

**Нерабочий подход, не возвращать:** прямой скрытый `<a href="tg://user?id=...">` или `window.location.href = tg://...` из Mini App.

**Инвариант:** участник без username → `Mini App → авторизованный Worker → Голубец → Telegram inline-кнопка профиля`. У участника с `@username` остаётся прежнее username-меню.

---

## 2026-08-18 — v0.5.59: кнопка «Связаться» для участников без @username — ПЕРВАЯ НЕРАБОЧАЯ ПОПЫТКА

**Задача:** на странице `Участники` у части людей есть кликабельный `@username`, а у части username отсутствует. Требовалось на том же месте дать способ перейти к человеку через Telegram ID.

**Сверено по фактическому frontend:**
- `identity-card-ids-v0518.js` уже привязывает карточки участников к raw Telegram ID;
- `participant-profile-v0523.js` также хранит raw Telegram ID в detail-profile;
- существующий `usernameButton()` показывает кнопку только при наличии `@username`;
- существующее username-меню `openUserMenu()` оставлено без изменений.

**Что было сделано:**
- добавлен `contact-by-id-v0559.js`;
- если у участника есть `[data-user-menu]`, новая кнопка не добавлялась;
- если `@username` нет, на его обычном месте появлялась синяя кнопка **`Связаться`**;
- кнопка добавлялась в `.person-card`, `.team-member`, participant detail и внутренние directory/hero-карточки при наличии raw Telegram ID;
- ошибочно использовался прямой `tg://user?id=<RAW_TELEGRAM_ID>` через временный скрытый `<a>`.

**Почему заменено:** Android Telegram WebView не открыл такой ID-link, пользователь подтвердил «нажимаешь и ничего не происходит». Актуальная реализация описана верхней записью от 19.08.2026 и использует Worker + bot inline button.

---

## 2026-08-18 — v0.5.59: исправлен постоянный кэш фото команд

**Симптом:** аватарки участников после первого использования появлялись сразу, а фото команд заметно догружались.

**Точная причина:**
- avatar cache key = стабильный `avatarFileId`;
- старый team-photo cache key = `photoUrl`;
- Google Sheets выдаёт для одного и того же изображения новый временный `lh7-rt.googleusercontent.com/...` URL между snapshot;
- поэтому IndexedDB постоянно промахивался по одному и тому же фото команды.

**Исправлено:**
- `media-persistent-cache-v0554.js` внутренняя версия `0.5.54.1`;
- team-photo key = нормализованное `название команды + игра`;
- `photoUrl` остаётся source metadata, но больше не identity;
- после загрузки CRM выполняется только disk-only prewarm сохранённых team blobs в память, без сетевого массового prewarm;
- cached photo показывается сразу; примерно после 30 минут допускается неблокирующий background refresh;
- TTL/cleanup около 45 дней, общий лимит около 420 записей сохранены.

**Инвариант:** не возвращать team-photo cache key к временному `photoUrl` и не вводить массовую сетевую загрузку всех фото на старте.

---

## 2026-08-18 — v0.5.59: `BbllllKA / Royal Kingdom ↔ вышка` подтверждено server-side

**Точная причина прошлых неудач:** фактическое имя команды = **`🗡 BbllllKA`**, а не визуально прочитанное `BbIIIIKA`.

**Исправлено через Cloud Shell / live Apps Script:**
- Unified Snapshot Writer `1.2.4`;
- `searchIndexVersion=1.1.3`;
- server alias `'bbllllka': ['вышка']`;
- ошибочный `'bbiiiika'` удалён;
- после `clasp push` заново синхронизирован `apps-script-live/`;
- новый snapshot фактически содержит `вышка` и `vyshka` в `searchKeys` команды `🗡 BbllllKA / Royal Kingdom` и её участников.

**Инвариант:** перед точечным alias сверять exact identity из живого snapshot, особенно символы `I/l/1`. Стабильный alias должен попадать в server-side `searchKeys` до публикации snapshot.

---

## 2026-08-18 — v0.5.59: активные команды / база спецназа

**Сделано:**
- статус команды берётся из живой админской `Команды!L`;
- identity статуса = `название + игра`;
- `Активен` получает золотую рамку; `На паузе` — обычное оформление;
- справа на странице активной команды — крот, открывающий каталог активных команд;
- справа на активных team cards — тот же крот, карточка остаётся кликабельной;
- крот встроен как inline JPEG data-asset без SVG и без image-loader;
- каталог имеет независимые `Все / РМ / РК` и поиск;
- заголовок каталога: `Команды принимающие участие в базе спецназа`;
- подзаголовок: `Команды, участвующие в спецназе и(или) регулярно выкладывающие скрины в базе спецназа.`

**Apps Script:** `27_MINIAPP_TEAM_STATUS.js`, unified writer `1.2.2+`, schema `1.4.2`; status проходит через snapshot и Worker.

---

## 2026-08-18 — v0.5.58: навигация forward / Back

- переход вперёд на новый экран → `scrollY=0`;
- Back → точное сохранённое место предыдущего экрана;
- не возвращать поведение v0.5.57, где Back также отправлял наверх.

---

## 2026-08-18 — v0.5.54–v0.5.56: медиакэш и своя ава

- IndexedDB cache-first для изображений;
- lazy avatar loading;
- не более 2 параллельных avatar network load;
- собственная ава приоритетно восстанавливается из постоянного кэша;
- устранено мигание буквенной заглушки при rerender.

---

## 2026-08-17 — hybrid search и доставка searchKeys

**Корневая причина старой проблемы:** Worker sanitizer выбрасывал `searchKeys`/`searchIndexVersion`.

**Сделано:**
- Worker wrapper `entry-v1110.js` сохраняет server `searchKeys` после sanitization;
- frontend hybrid search = локальный поиск ИЛИ `searchKeys`;
- без edit-distance/fuzzy-комбинаторики и тяжёлого prewarm.

---

## 2026-08-18 — постоянная база контекста и live mirror

Созданы/поддерживаются:
- `START_HERE.md`;
- `CURRENT_STATE.md`;
- `WORK_HISTORY.md`;
- `RELEASE_RULES.md`;
- `docs/tables/ADMIN_TABLE_STRUCTURE.md`;
- `docs/tables/PUBLIC_TABLE_STRUCTURE.md`;
- полный `apps-script-live/` после `clasp pull`.

**Иерархия источников истины:** runtime/live Sheets/live Apps Script → текущий GitHub → документация → история чатов.

---

## Правила ведения журнала

- Новые записи добавлять сверху.
- Фиксировать только факты, полезные следующему чату.
- Не скрывать неудачные подходы, если их повторение может снова сломать проект.
- Различать `repo updated`, `build succeeded`, `Apps Script pushed`, `manual function run`, `production verified`.
- Не записывать токены, секреты, `.clasp.json`, Script Properties или приватные ключи.