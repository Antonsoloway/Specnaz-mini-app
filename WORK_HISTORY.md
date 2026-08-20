# Royal CRM / «Таблица ЧП» — WORK HISTORY

> Краткий журнал фактически выполненных работ. Новые записи добавляются сверху.
> Здесь фиксируются изменения, проверки, диагнозы и откаты, которые нужны следующему чату.

## 2026-08-20 21:05 — v0.6 preview: рейтинги команд по E/F/H/I/J/K

**Запрос пользователя:** на admin team-detail каждая из шести карточек `Игроков`, `Общий спецназ`, `Скрины`, `Активность в базе`, `Активность вне базы`, `Среднее` должна открывать рейтинг всех команд от большего значения к меньшему.

**Фактическая сверка перед правкой:**
- `admin-team-detail-v0600.js .2` уже получает полный private `adminData.teams` через защищённый `/admin-data`;
- team record содержит нужные numeric fields: `players`, `specnazTrips`, `screens`, `activityBase`, `activityOutside`, `average`;
- отдельный API/backend для рейтинга не нужен и не создавался;
- в рейтинге должны участвовать именно все private admin teams, поэтому источник нельзя заменять public snapshot.

**Что изменено:**
- `admin-team-detail-v0600.js` → **`0.6.0-admin-team-detail.3`**;
- шесть карточек E/F/H/I/J/K заменены на touch/button controls с `data-admin-team-ranking-metric`;
- добавлен единый `TEAM_METRICS` mapping:
  - E → `players`;
  - F → `specnazTrips`;
  - H → `screens`;
  - I → `activityBase`;
  - J → `activityOutside`;
  - K → `average`;
- рейтинг строится из того же private `adminData.teams`;
- numeric sort = descending; tie-break = team name, затем game;
- нули/пустые numeric значения не отбрасываются и остаются внизу, поэтому список действительно включает все команды;
- row рейтинга показывает место, название, игру, статус и значение выбранной метрики;
- исходная команда подсвечивается;
- tap по строке рейтинга открывает её admin team-detail;
- Back использует существующий `RoyalNav` capture, чтобы вернуться на предыдущий detail/ranking/list state;
- thumbnails в ranking намеренно не добавлены: 128 строк не должны инициировать массовый media/network prewarm.

**Доставка preview:**
- `version-v0600.js` cache-bust → **`20260820-2105`**;
- `app-v0600.html` → `version-v0600.js?v=20260820-2105`;
- `app.html` previewBuild → **`20260820-2105`**;
- stable v0.5.59 не менялся.

**Backend / Sheets:** Apps Script, Worker API и Google Sheets не менялись. Новых write routes нет. Cloud Shell не нужен. Ни одна CRM-запись этой правкой не изменялась.

**Статус:** repo/frontend ready, Telegram smoke pending. Проверить на реальной команде: нажать все 6 карточек E/F/H/I/J/K; убедиться, что рейтинг идёт сверху вниз по значению, присутствуют все команды включая нули/неактивные, tap по команде открывает detail, Back возвращает рейтинг/исходную страницу.

---

## 2026-08-20 20:49 — v0.6 preview: полный admin team-detail + кнопка существующего редактора

**Запрос пользователя:** на странице команды в админ-режиме должны быть видны все счётчики/поля команды из админской таблицы — общий спецназ, активность в базе/вне базы, среднее и т.д.; на этой же странице нужна кнопка редактирования команды с возможностью менять название и фото.

**Фактическая сверка:**
- `admin-team-detail-v0600.js .1` показывал только normal-style фото, название/игру, 3 счётчика состава и участников;
- private admin team record уже содержит `leader`, `players`, `specnazTrips`, `sort`, `screens`, `activityBase`, `activityOutside`, `average`, `status`, `row`, `revision`;
- действующий `admin-write-v0600-v3.js` уже содержит защищённый team editor и optimistic revision;
- `admin-team-photo-v0600.js` уже декорирует эту же форму выбором/сжатием фото и добавляет photo payload в `updateTeam`;
- live hardened `updateTeam` разрешает `name + leader`; photo обрабатывается отдельным photo/final backend; E:L текущим write-flow не перезаписываются.

**Что изменено в frontend `main`:**
- `admin-team-detail-v0600.js` → **`0.6.0-admin-team-detail.2`**;
- normal-style верх страницы сохранён: большое фото, название/игра, `участников / лидеров / помощников`, затем состав;
- добавлен защищённый блок `Данные админской таблицы` с полями:
  - `Лидер / подпись D`;
  - `Игроков E`;
  - `Общий спецназ F`;
  - `Сортировка G`;
  - `Скрины H`;
  - `Активность в базе I`;
  - `Активность вне базы J`;
  - `Среднее K`;
  - `Статус L`;
  - physical source row;
- добавлена кнопка **`✏️ Редактировать команду`**;
- отдельный write route/редактор НЕ создавался: detail оборачивается в `data-admin-team` с скрытой identity-разметкой, поэтому existing `admin-write-v0600-v3.js` сам открывает уже проверенную форму;
- форма сохраняет название/лидера через Worker-signed HMAC write и фото через `admin-team-photo-v0600.js`;
- E:L остаются read-only на этом этапе; `Статус L` показывается, но его write-whitelist не расширялся скрытно.

**Доставка preview:**
- `version-v0600.js` cache-bust → **`20260820-2049`**;
- `app-v0600.html` → `version-v0600.js?v=20260820-2049`;
- `app.html` previewBuild → **`20260820-2049`**;
- стабильный v0.5.59 не менялся.

**Backend/Sheets:** Apps Script и Google Sheets этой правкой не менялись; Cloud Shell не нужен; никаких team/participant данных не записывалось.

**Статус:** repo/frontend ready, Telegram smoke pending. Проверить на реальной команде: виден полный D:L блок; фото/состав не регрессировали; `Редактировать команду` открывает существующую форму с названием/лидером/фото; кнопка `Назад` возвращает в прежний admin список.

---

## 2026-08-20 20:24 — v0.6 preview: persistent media v2 + обычноподобная страница команды в админ-режиме

**Запрос пользователя:** в admin mode аватарки не должны заново грузиться при каждом входе; в списке команд нужны фото; при нажатии на команду нужно открывать такую же страницу, как в обычном режиме — большое фото и состав участников.

**Что выяснилось после предыдущих попыток:**
- admin avatars действительно отображались, но старый bridge мог выбирать `avatar:tg-<id>` раньше public snapshot, тогда как обычный режим хранит `avatar:<avatarFileId>`; из-за разных ключей повторный вход мог снова уходить в сеть;
- одновременно существовали два admin avatar path: `admin-search-media-sort` вызывал общий `setupAvatarLoading()`, а отдельный avatar bridge запускал второй проход;
- admin team thumbnail раньше вообще не запрашивался, если в DOM поле `Фото C` показывало `—`;
- подготовленный `/admin-team-photo` не был достаточным: он требовал `photoUrl` до SHA-256 media lookup; для CellImage/private media это неверно;
- обычный `/team-photo` опирается на public snapshot, поэтому не может обслужить все admin-only `Неактивен` команды;
- обычный `renderTeamDetail()` также не подходит напрямую для admin-only teams, потому что public snapshot их не содержит.

**Frontend исправлен в `main`:**
- добавлен `admin-media-cache-v0600-v2.js` → **`0.6.0-admin-media-cache.2`**;
- это единственный admin media-layer, загружаемый новым `version-v0600.js`; старый `admin-media-cache-v0600.js` больше не является active loader;
- один IndexedDB с обычным режимом: `royal-crm-media-cache / images`;
- avatar primary key = `avatar:<avatarFileId>`; `avatar:tg-<id>` — только fallback/migration bridge;
- admin v2 ждёт public snapshot перед выбором primary key; если найден старый tg-key и позже известен `avatarFileId`, blob мигрирует в primary key;
- после network load `idbPut()` awaited, чтобы быстрое закрытие WebView не оставляло фото только в памяти;
- team key = тот же `team:<normalized name>\n<normalized game>`, что обычный team-photo cache;
- team thumbnail теперь пытается загрузить фото независимо от текстового `Фото C`;
- admin team network route = `/admin-team-photo`, disk-first остаётся приоритетом; background refresh не чаще 30 минут;
- добавлен `admin-team-detail-v0600.js` → **`0.6.0-admin-team-detail.1`**;
- тап по `[data-admin-team] > summary` открывает обычноподобный detail: большой `team-photo-box`, `team-detail-head`, `team-stats`, `team-members-list`;
- состав строится из private admin participants по exact team + game, поэтому inactive team data не теряются;
- member avatars на detail идут через тот же admin persistent media v2;
- Back state сохраняется через `RoyalNav` с временным hidden rich-marker, чтобы вернуться к прежнему admin DOM/search/filter/scroll state.

**Worker исправлен в repo:**
- добавлен `worker/src/entry-v1241.js` → **1.24.1**;
- `worker/wrangler.toml` переключён на `src/entry-v1241.js`;
- `/admin-team-photo` повторно авторизует пользователя через защищённый `/admin-data`;
- команда ищется в private admin snapshot по `name + game`;
- сначала читается `media/teams/<sha256(normalized name + game)>.bin`;
- только если private media отсутствует, разрешён compatibility fallback на `photoUrl`;
- отсутствие/пустота ephemeral `photoUrl` больше не блокирует SHA-256 lookup;
- public `/team-photo`, `/snapshot`, `/contact-by-id`, admin-write chain остаются унаследованными из `entry-v1230.js`.

**Доставка preview:**
- `version-v0600.js` cache-bust → **`20260820-2024`**;
- `app-v0600.html` → `version-v0600.js?v=20260820-2024`;
- `app.html` previewBuild → **`20260820-2024`**;
- стабильный `app-v0559.html` не менялся.

**Apps Script / Sheets:** не менялись; Cloud Shell не нужен; данные участников/команд этой правкой не изменялись.

**Статус:** frontend + Worker source/config **repo updated**. В этой сессии прямой health-check Worker не состоялся из-за DNS ограничения среды, поэтому `Worker 1.24.1 production verified` пока НЕ записывать. Нужен Telegram smoke после Cloudflare auto-deploy: открыть admin `Команды`, проверить thumbnail, открыть команду → большое фото + состав, Back, затем повторно открыть ту же команду/участников и убедиться, что фото приходят из disk cache без повторной задержки. Отдельно проверить одну `Неактивен` команду.

---

## 2026-08-20 19:05 — v0.6 preview: admin hybrid search, аватарки и порядок «Вышел»

**Запрос пользователя:** в админ-режиме поиск должен работать так же полно, как на обычных страницах; у участников должны отображаться аватарки; фильтр `Вышел` должен повторять порядок админской таблицы — недавно вышедшие сверху, давно вышедшие снизу.

**Сверка фактической архитектуры:**
- старый `admin-v0600.js` использовал только простой lowercase `.includes()` по сырому `data-admin-search`;
- обычный поиск использует deterministic hybrid search: normalize/compact, кириллица↔латиница, human-read, один pseudo-read, confirmed aliases и `searchKeys`;
- public `snapshot.json` содержит `avatarFileId` по raw Telegram ID, включая записи со статусом `Вышел`;
- `База участников!AE` — `Дата изменения`, а не отдельная дата выхода;
- live `sortBaseByChatState_()` сортирует группы стабильно: новый `Вышел` приходит из верхней группы `В чате` и после сортировки оказывается выше ранее вышедших. Поэтому порядок группы `Вышел` в таблице кодируется **физическим row order**, а не AE.

**Что добавлено в frontend `main`:**
- новый `admin-search-media-sort-v0600.js` → **`0.6.0-admin-search-media-sort.2`**;
- `version-v0600.js` загружает enhancement, cache-bust **`20260820-1908`**;
- `app-v0600.html` подключает `version-v0600.js?v=20260820-1908`;
- стабильный `app-v0559.html` / обычный startapp не менялись.

**Admin search:**
- поиск по участникам/командам использует те же deterministic forms, что обычный hybrid search;
- поиск учитывает CRM имя, Telegram имя, `@username`, Telegram ID, команды, роли, игровые ники, игры, а для команд — лидер/статус/видимые admin поля;
- если запись присутствует в public snapshot, её штатные `searchKeys` добавляются к admin haystack;
- admin-only записи всё равно получают local normalized/translit/pseudo/alias haystack;
- confirmed alias `BbllllKA ↔ вышка` сохранён;
- IME/input не блокируется и поле поиска не перерисовывается на каждую букву.

**Аватарки:**
- participant identity для декоратора = raw Telegram ID;
- соответствующий public participant даёт `avatarFileId`;
- используется существующий `.person-avatar` + `setupAvatarLoading()` и прежний avatar cache/proxy path;
- отдельная сеть/новый формат аватаров для admin mode не вводились;
- если `avatarFileId` нет — буквенный fallback.

**Порядок `Вышел`:**
- при активном фильтре `Вышел` participant records сортируются по physical `row` базы **по возрастанию**;
- это повторяет текущую физическую группу `Вышел` админской таблицы: свежие выходы выше старых;
- AE `Дата изменения` намеренно не используется как дата выхода;
- при возврате `Вышел → Все` восстанавливается исходный admin-list order.

**Защита от UI-loop:** первая внутренняя версия DOM sorter могла повторно будить `MutationObserver` при каждом append. До пользовательского smoke-test это исправлено в `.2`: DOM переставляется только если порядок реально отличается; observer игнорирует простое перемещение уже существующего `.royal-admin-record`.

**Backend/Sheets:** не менялись. Cloud Shell и новое Apps Script deployment для этой задачи не нужны; ни одной записи участника/команды не изменено.

**Статус:** GitHub `main` обновлён. Реальный Telegram smoke-test нового слоя ещё не подтверждён пользователем. Проверить: аватарки; `нас не догонят`; `вышка`; поиск по имени/@/ID/нику/роли; порядок нескольких `Вышел` против физической таблицы; затем `Вышел → Все` без зависаний.

---

## 2026-08-20 18:51 — v0.6 preview: existing participant editor ограничен именем + membership

**Уточнение пользователя после открытия v0.6 editor в Telegram:** поля `Имя Telegram`, `@username`, дата V, походы спецназа U, скрины AB, активность AC/AD, состояние чата и Telegram ID заполняются ботом/системой и администратор не должен менять их вручную. Из верхней части карточки участника вручную меняется только CRM `Имя`; ниже остаются пять слотов `команда / роль / игровой ник`.

**Проблема в первой реализации v0.6:** `admin-write-v0600-v3.js` показывал и собирал вместе с разрешёнными полями также Telegram/profile/counter/system поля. Простое скрытие интерфейса было бы недостаточно, потому что запрос можно сформировать вручную.

**Исправлено в frontend `main`:**
- добавлен `admin-participant-edit-policy-v0600.js` (`0.6.0-participant-policy.1`);
- для `data-write-mode="update"` скрываются/блокируются `telegramId`, `chatState`, `telegramName`, `username`, `date`, `specnaz`, `screens`, `activityBase`, `activityOutside`;
- остаются доступными `name` и блок пяти membership slots;
- `version-v0600.js` загружает policy module;
- cache-bust v0.6 поднят до `20260820-1712`;
- `app-v0600.html` подключает `version-v0600.js?v=20260820-1712`.

**Исправлено на сервере:**
- live `apps-script-live/31_MINIAPP_ADMIN_WRITE_HARDENED.js` получил whitelist `allowedManualFields = { name, memberships }` для `updateParticipant`;
- любая попытка передать другое поле существующего участника возвращает `PARTICIPANT_FIELD_READ_ONLY` до записи в Sheets;
- Telegram/system/counter поля считаются server read-only;
- UI-блокировка является только удобством; источником безопасности является server whitelist.

**Установка через Cloud Shell подтверждена пользователем:**
- Apps Script source pushed;
- factual live mirror синхронизирован обратно в `apps-script-live/`;
- финал установщика: **`V0.6 PARTICIPANT EDIT POLICY READY`**;
- `Existing participant manual fields: NAME + MEMBERSHIPS`;
- `Bot/system fields: SERVER-READ-ONLY`;
- стабильный deployment **`Таблица ЧП 1.3`** сохранён;
- установщик не изменил ни одной participant/team записи.

**Фактическая сверка после установки:** в `main/apps-script-live/31_MINIAPP_ADMIN_WRITE_HARDENED.js` присутствует `PARTICIPANT_BOT_FIELDS_READ_ONLY_V0600` и server whitelist. Private `admin-snapshot.json` продолжает публиковаться как `adminData.version = 0.6.0-write.4` с optimistic revisions.

**Инвариант:** для существующего участника v0.6 админ вручную изменяет только CRM `Имя` и membership slots. Telegram ID, Telegram name/username, chat state, date и U/AB/AC/AD — bot/system owned и должны быть запрещены сервером, а не только скрыты UI.

**Статус smoke-test:** пользователь открыл v0.6 preview и редактор участника. Финальное тестовое сохранение разрешённого изменения после установки policy ещё предстоит; обычный запуск пользователей остаётся на v0.5.59.

---

## 2026-08-19 21:52 — v0.5.59: каскадное переименование команд и восстановлена публичная синхронизация

**Симптом:** админ изменил название команды `BUNTARb` на `⚡️ BUNTARb` на листе `Команды`, но изменение не появилось в Mini App и публичной таблице.

**Точная причина:** название команды было изменено только в `Команды!B`, а связанные командные слоты участников в `База участников` сохранили старое имя. Unified Snapshot строит командные membership из `База участников`, а публичная синхронизация строго валидирует связку `название + игра` против листа `Команды`. Поэтому snapshot продолжал видеть старое имя, а публичная синхронизация получала `VALIDATION_FAILED`.

**Исправлено в live Apps Script через Cloud Shell:**
- `07_FINAL_ROLE_FIX.js` дополнен каскадным переименованием команды;
- одиночное изменение `Команды!B` теперь использует `e.oldValue`, новое имя и игру до сортировки;
- `finalRoleCascadeTeamRename_()` проходит все 5 team-слотов `База участников` (`E/H/K/N/Q`) и меняет только совпадения по **старое название + та же игра**;
- ники, роли, игры и остальные поля не изменяются;
- `finalRoleRepairDecoratedTeamMemberships_()` лечит уже существующие рассинхронизации, когда к названию был добавлен ведущий декоративный знак/emoji и в той же игре есть ровно один однозначный кандидат;
- `25_MINIAPP_UNIFIED_SNAPSHOT.js` перед построением snapshot вызывает этот repair как страховку;
- после repair ставится public sync pending;
- live mirror после `clasp push` синхронизирован в `apps-script-live/`.

**Фактический repair:** snapshot-trigger исправил 6 старых декоративных рассинхронизаций, включая `BUNTARb → ⚡️ BUNTARb`. Свежий snapshot от `2026-08-19T18:38:20.921Z` уже содержал у Андрея OgAyO `⚡️ BUNTARb — РК` и отдельную команду `⚡️ BUNTARb`.

**Почему публичка всё ещё не синхронизировалась сразу:** после автоматического repair остался один независимый старый blocker — у Светланы (`@SvetlanaRusKyzbass`, строка 24) membership `Rossia Liger1 — РМ`, хотя такой команды на листе `Команды` уже не было. Публичная валидация правильно продолжала блокировать запись.

**Уточнение пользователя:** правильное текущее название команды Светланы — `🇷🇺 CCCP ROSSIA 1`.

**Исправление данных:** напрямую в админской `База участников!E24` записано `🇷🇺 CCCP ROSSIA 1 — РМ`; роль `Лидер` и `Игра 1 = Royal Match` сохранены.

**Production verification:**
- публичная синхронизация `19.08.2026 21:51:32` завершилась со статусом **`SYNCED`**, без validation errors;
- публичная `Команды` содержит `⚡️ BUNTARb — РК | Андрей OgAyO - помощник`;
- публичная `Команды` содержит `🇷🇺 CCCP ROSSIA 1 — РМ | @SvetlanaRusKyzbass - лидер`;
- следующий snapshot (`2026-08-19T18:48:33.093Z`) содержит у Светланы membership `🇷🇺 CCCP ROSSIA 1 — РМ`.

**Важно:** строгую validation публичной синхронизации НЕ ослаблять. Она правильно выявила старую неконсистентную связь. При неоднозначном полном переименовании нельзя угадывать новую команду автоматически; нужен подтверждённый mapping или ручное исправление источника.

**Инвариант:** переименование существующей команды на `Команды!B` — это каскадная операция. До public/snapshot sync все пять membership-слотов участников должны быть приведены к новому имени строго по identity `старое название + игра`.

**Примечание:** финальная строка установщика `BUNTARb was not observed` была ложным отрицанием его smoke-check: фактический snapshot уже содержал `⚡️ BUNTARb`. Runtime проверять по данным, а не по одной строке установщика.

---

## 2026-08-19 20:12 — v0.5.59: безопасное ускорение кэшированных фото команд

**Задача:** после отката сломанного `stable-v0559.js 0.5.59.3` снова ускорить открытие фото команд на iPhone, но не рисковать самим отображением.

**Исходный подтверждённый симптом:** на iPhone кэшированное фото появлялось примерно через 0,4–0,6 сек после уже открывшегося detail; на Android — практически сразу.

**Причина задержки:** старый `media-persistent-cache-v0554.js 0.5.54.1` начинал disk warm только после snapshot и выполнял отдельный `idbGet()` для каждой команды. На iOS последовательные IndexedDB-транзакции заметно медленнее.

**Что изменено:**
- `media-persistent-cache-v0554.js` → **`0.5.54.2`**;
- добавлен внутренний `teamDiskMemory`, который хранит только валидные IndexedDB **record/blob references**, а не заранее созданные object URLs;
- при загрузке media module сразу запускается один readonly `openCursor()` по существующему store;
- сеть во время warm не используется;
- DOM во время warm не меняется;
- `renderTeamDetail()` не перехватывается и не заменяется;
- штатный `persistentLoadTeamPhoto()` теперь проверяет: `teamMemory → teamDiskMemory → обычный idbGet → network/fallback`;
- object URL создаётся только для реально открываемой команды;
- `idbPut`/`idbTouch` поддерживают актуальность `teamDiskMemory` для новых/обновлённых фото;
- background refresh и cleanup сохранены;
- iOS guard остаётся прежним рабочим `stable-v0559.js 0.5.59.2`;
- Android-ветка не менялась отдельным патчем;
- cache-bust: `media-persistent-cache-v0554.js?v=20260819-2012`, changelog `20260819-2012`.

**Чем отличается от сломанного `0.5.59.3`:** новый вариант не создаёт object URLs для всех фото, не подменяет render, не ставит bypass-marker и не отключает штатный loader/fallback.

**Deployment status:** GitHub `main` обновлён. Apps Script / Cloud Shell не нужны.

**Проверка:** структура и активные подключения сверены в GitHub. Контейнерная попытка `node --check` через raw GitHub не состоялась из-за отсутствия DNS в локальном контейнере, поэтому окончательная реальная проверка — полный перезапуск Mini App на iPhone и несколько кэшированных команд подряд.

**Критерий принятия:** реальные фото не исчезают/не превращаются в замок и ранее кэшированные команды открываются заметно быстрее прежних 0,4–0,6 сек.

---

## 2026-08-19 — v0.5.59: откат сломанного iOS fast team-photo patch 0.5.59.3

**Симптом после ускорения:** пользователь прислал новое видео с iPhone. После установки `stable-v0559.js` patch `0.5.59.3` реальные фото команд перестали появляться вообще: detail открывался, но в зоне фото оставался замок/fallback у разных команд.

**Подтверждено по видео `1000238554.mp4`:** открыты несколько разных команд (`XAOC`, `Has ne dogonyat`, `MOLOT POKA`), и у всех вместо реального фото остаётся замок. Это тяжёлый регресс, появившийся сразу после fast-path.

**Решение:**
- fast-path `0.5.59.3` полностью удалён;
- `stable-v0559.js` возвращён к последнему рабочему **`0.5.59.2`**;
- сохранён только предыдущий iOS guard: не стирать рабочий CRM `src` до готовности replacement и fallback обратно на CRM source;
- `app-v0559.html` получил новый cache-bust `stable-v0559.js?v=20260819-2003`;
- changelog fast-path удалён, чтобы история текущей версии не утверждала, что откатанный механизм активен;
- Apps Script / Cloud Shell не требуются.

**Не возвращать:** пакетное создание session object URLs для всех team blobs и синхронную подмену `renderTeamDetail()` из patch `0.5.59.3` без отдельной изолированной проверки на реальном iPhone. На тестовом устройстве этот подход полностью убрал фото команд.

---

## 2026-08-19 — v0.5.59: ускорение кэшированных фото команд на iPhone — НЕУДАЧНАЯ ПОПЫТКА, ОТКАТАНА

**Задача:** сравнить два пользовательских видео — первое iPhone, второе Android — и добиться на iPhone такого же почти мгновенного появления уже кэшированного фото команды.

**Подтверждено по видео до попытки:**
- iPhone: после тапа detail команды уже открыт, но фото появляется примерно через **0,4–0,6 сек**;
- Android: фото видно практически в первом кадре открывшейся карточки.

**Что было сделано в неудачном patch `0.5.59.3`:**
- пакетное readonly-чтение media store (`getAll`, cursor fallback);
- создание session object URLs для team blobs;
- preload конкретной команды на `pointerdown`;
- синхронная подмена фото после `renderTeamDetail()`.

**Почему не оставлено:** на реальном iPhone после этого все team photos перестали отображаться и оставался только fallback/замок. Patch полностью откатан в следующей записи выше.

---

## 2026-08-19 — v0.5.59: iPhone — фото команды мелькало и исчезало

**Симптом:** на iPhone часть команд открывалась без фото; у некоторых фото было видно долю секунды сразу после входа, затем оно исчезало и оставался замок-заглушка. Пользователь прислал видео.

**Подтверждено по видео:** интерфейс detail открывается нормально, затем зона фото остаётся пустой/переходит на fallback. Проблема воспроизводится именно на team photo, аватарки участников ведут себя стабильнее.

**Точная причина в коде:**
- `renderTeamDetail()` сначала создаёт `<img class="team-photo" src="<CRM photoUrl>">`, то есть рабочий исходный source уже присутствует;
- затем `media-persistent-cache-v0554.js → persistentLoadTeamPhoto()` перед чтением IndexedDB выполняет `img.removeAttribute('src')`;
- только после удаления source начинается асинхронный `idbGet()`/`/team-photo` fetch;
- на Android пауза обычно незаметна, на iOS Telegram WebView становится виден flash; если cache/proxy load задерживается/ошибается, остаётся `photo-error`/замок.

**Исправлено:**
- `stable-v0559.js` поднят до stable patch **`0.5.59.2`**;
- добавлен iOS-only team-photo guard;
- на iPhone/iPad guard временно блокирует только попытку `removeAttribute('src')` у текущего team-photo во время синхронного префикса native async loader;
- уже показанный CRM source остаётся на экране, пока IndexedDB/proxy готовит replacement;
- после native load cached/proxy image получает до **900 мс** на реальный `load/decode`;
- если replacement source не загрузился, возвращается исходный CRM `src`, а не замок;
- если изображение реально видно, `photo-error` снимается;
- Android-ветка не изменена.

**Инвариант:** на iOS нельзя очищать рабочий team-photo `src` до того, как replacement из IndexedDB/proxy реально готов и декодирован. При временной ошибке кэша предпочтителен уже рабочий CRM source, а не принудительный fallback.

---

## 2026-08-19 — v0.5.59: кнопки «Связаться» больше не пропадают после «Назад»

**Симптом:** в списке `Участники` кнопки `Связаться` у людей без `@username` были видны при первом открытии. После перехода в профиль/команду и возврата `Назад` список восстанавливался без этих кнопок.

**Подтверждено по видео:** до перехода contact-actions присутствуют; после возврата они исчезали.

**Причина:** `navigation-card-restore-v0532.js` после rerender запускал только `RoyalParticipantCardUX.decorate()`. Этот декоратор мог заменить DOM карточек уже после того, как `contact-by-id-v0559.js` добавил кнопки.

**Исправлено:**
- `navigation-card-restore-v0532.js` → `0.5.32.1`;
- post-restore порядок: сначала `RoyalParticipantCardUX.decorate()`, затем `RoyalContactByTelegramId.decorate()`;
- декораторы повторяются на следующих animation frames;
- обработан и видимый `Назад`, и Telegram native/system Back;
- cache-bust `navigation-card-restore-v0532.js?v=20260819-0848`.

---

## 2026-08-19 — удалён шумный GitHub Actions worker-smoke workflow

**Симптом:** владелец получал письма `Run failed: .github/workflows/worker-smoke.yml` / `No jobs were run` во время обычной разработки.

**Сделано:**
- `.github/workflows/worker-smoke.yml` удалён commit `df61533043f167a773391c61c337cf65ad0a3b2a`;
- Worker production проверяется напрямую по `/health` и/или функциональному smoke-test;
- обычная frontend-разработка больше не должна генерировать такие GitHub Actions failure-письма.

---

## 2026-08-19 — v0.5.59: исправлен редкий AbortError `20` при входе

**Симптом:** иногда показывалось `Не удалось войти / 20 · build=0.5.0`, после повторного открытия вход проходил.

**Причина:** общий timeout 5 секунд на `/auth`; Android WebView после `AbortController.abort()` отдавал numeric code `20`; внутренний BUILD был старым.

**Исправлено:**
- `transport-v0514.js` → `0.5.14.1`;
- `/auth` timeout = 12 секунд;
- один automatic retry для transient timeout/network failure;
- code 20 нормализуется в `AUTH_TIMEOUT`;
- `app.js BUILD = 0.5.59`.

---

## 2026-08-19 — v0.5.59: «Связаться» переделано через Голубца

**Первая попытка была неверной:** прямой `tg://user?id=<id>` из Mini App на Android не открывался.

**Актуальная реализация:**
- frontend показывает `Связаться` у участника без `@username`;
- `POST /contact-by-id` → Worker `1.12.0`;
- requester и target проверяются по raw Telegram ID;
- Голубец отправляет requester-у сообщение с Telegram inline-кнопкой `👤 Открыть профиль`;
- Mini App показывает `Ссылка готова` → `Открыть Голубя`;
- пользователь подтвердил production flow: **«Связаться заработало»**.

**Не возвращать:** прямой `tg://user?id` из Mini App.

---

## 2026-08-18 — v0.5.59: постоянный кэш фото команд

**Симптом:** аватарки после первого использования появлялись сразу, фото команд заметно догружались.

**Причина:** старый key фото = временный Google `photoUrl`; один и тот же снимок получал новый URL между snapshot.

**Исправлено:**
- team-photo key = стабильное `название команды + игра`;
- `photoUrl` остаётся source metadata, но не identity;
- сохранённые team blobs поднимаются из IndexedDB без массового сетевого prewarm;
- cached photo показывается сразу; background refresh примерно после 30 минут;
- TTL/cleanup около 45 дней, общий лимит около 420 записей.

---

## 2026-08-18 — v0.5.59: `BbllllKA / Royal Kingdom ↔ вышка`

**Причина прошлых неудач:** фактическое имя команды = `🗡 BbllllKA`, а не ошибочно прочитанное `BbIIIIKA`.

**Исправлено через Cloud Shell / live Apps Script:**
- Unified Snapshot Writer `1.2.4`;
- `searchIndexVersion=1.1.3`;
- server alias `'bbllllka': ['вышка']`;
- ошибочный alias удалён;
- свежий snapshot содержит `вышка` / `vyshka` в `searchKeys` команды и её участников.

**Инвариант:** exact identity сверять по live snapshot, особенно `I/l/1` и emoji.

---

## 2026-08-18 — v0.5.59: активные команды / база спецназа

**Сделано:**
- status берётся из живой админской `Команды!L`;
- identity статуса = `название + игра`;
- `Активен` получает золото; `На паузе` — обычное оформление;
- крот справа на detail и активных team cards;
- крот встроен как inline JPEG data-asset без SVG/image-loader;
- каталог имеет независимые `Все / РМ / РК` и поиск;
- заголовок: `Команды принимающие участие в базе спецназа`;
- подзаголовок: `Команды, участвующие в спецназе и(или) регулярно выкладывающие скрины в базе спецназа.`

---

## 2026-08-18 — v0.5.58: навигация forward / Back

- переход вперёд → `scrollY=0`;
- Back → сохранённое место предыдущего экрана;
- не возвращать поведение v0.5.57, где Back отправлял список наверх.

---

## 2026-08-18 — v0.5.54–v0.5.56: медиакэш и своя ава

- IndexedDB cache-first для изображений;
- lazy avatar loading;
- не более 2 параллельных avatar network load;
- собственная ава приоритетно восстанавливается;
- устранено мигание буквенной заглушки при rerender.

---

## 2026-08-17 — hybrid search и доставка searchKeys

**Корневая причина старой проблемы:** Worker sanitizer выбрасывал `searchKeys`/`searchIndexVersion`.

**Сделано:**
- Worker wrapper сохраняет server `searchKeys` после sanitization;
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