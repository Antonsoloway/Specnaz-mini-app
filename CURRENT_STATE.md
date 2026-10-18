## 18.10.2026 — Sosiska RM/RK: source prepared, not deployed

Royal CRM Sosiska: dedicated RM and RK admin tabs with isolated routing, native RK search/rosters, Cloudflare-hosted RK monitoring + snapshots, battle score projections, full-period UI, comparison, history, signed export and independently scoped AI jobs. RK Cup is labelled cups rather than RM crowns; missing opponent personal battle scores remain unavailable; RM calendar is never assumed for RK. Profiled agent tests 137 PASS. Existing miniapp Cloudflare account (0dd3beb...) is inaccessible under current separate RK Wrangler login (62c513...); RK read-only probe from workstation timed out. Main/live production unchanged; keys and migration not configured, Telegram acceptance pending. See docs/sosiska/RM_RK_SPLIT_20261018.md.

## 16.10.2026 — диагностика карточки агента, опубликовано

На главной админской карточке Сосиски добавлены текущий игровой уровень и онлайн/офлайн/занят. Зелёный статус требует отдельного свежего Ping к игровому серверу; health с настроенными ключами не считается доказательством связи. Индикатор обновляется раз в минуту только на видимом главном экране, последняя подтверждённая цифра уровня сохраняется при потере связи. Предусмотрен общий data-agent-id для будущих агентов, новый RK-агент не создавался. Авторизация и ключ остаются серверными. Release marker20261016-v061-agent-status1. Публикация подтверждена: PR67 merged, все CI/Pages/Worker Builds SUCCESS; семь живых файлов совпали с исходниками. Подробности — docs/sosiska/AGENT_STATUS_20261016.md.

## 12.10.2026 — изоляция Сосиски от действующего ЧП

Требование владельца: Сосиска — отдельный админский модуль, сохранять действующие функции приложения. Добавлен tests/verify-sosiska-isolation-workerd.mjs и шаги в Sosiska module CI: собираются entry-v1410 (текущий API) и entry-v1420 (обёртка модуля), в настоящем workerd сравниваются статусы/все заголовки/байт-в-байт тела30запросов GET/POST/OPTIONS по10существующим маршрутам. Дополнительно успешные GET/snapshot и GET/admin-data с подписанной тестовой сессией и фиктивными CRM/Telegram/GitHub responses сравниваются без различий. Всего32checksPASS,8fixtureCalls,liveNetworkCalls0. Проверка не покрывает все успешные write/media-сценарии и не заменяет Telegram acceptance. Production код этой сессией не изменялся.

Повторно54NodetestsPASS и5workerd checks SQLite alarms/cold-start/full historyPASS; исходный код неизменён. Существующий live ЧП healthHTTP200/version1.41.0 подтверждён ранее, frontend пока без Сосиски. OAuth доступ к management API остаётся недоступным. Cloud Browser предложил защищённый вход; выбран Google, но вход отклонён с видимым «Неправильный пароль». Секреты не прочитаны/не записаны, новые credentials не создавались. Требуется ручное завершение входа в Cloudflare Dashboard; не запускать новые device codes вслепую.

Все изменения только tests/CI/checkpoints в рабочей ветке, main/frontend/Workers/secrets/Apps Script/watches/history не менялись. RemoteCI проверить на кодовом коммите этой записи.


## 12.10.2026 МСК — Сосиска: вся история всех отслеживаемых команд

Уточнение владельца заменило анализ последних двух снимков на полную историю всех отслеживаемых команд и динамику изменений. Реализованы persistent SQLite DO jobs + alarms, чтение всех страниц до baseline, проверка полного охвата, многоэтапный GPT-анализ, итог каждой команды/сравнение всех команд и точная числовая динамика по всем снимкам. 54 Node tests и 5 workerd/SQLite/cold-start checks PASS, bundle ~307.5 KB. Исправлен несовместимый Workers redirect:error на manual. Код в PR #40, production не менялся. Commander/Cloud Shell проверен: OAuth обновлён, HTTP 200; единственный доступный Cloudflare account содержит только bot gateway и cloud Royal Match agent, существующего Worker ЧП нет. Rollout всё ещё требует доступа к его аккаунту и серверных credentials. Актуальная передача: docs/sosiska/RESUME_20261012.md.


## 11.10.2026 — Агент «Сосиска»: модуль ЧП, development stage1

Реализация в отдельной ветке `sosiska-miniapp-stage1-20261011`; production/main не изменены. Админский экран, серверная проверка доступа, гибридный поиск, карточки и состав, история/дельты, ручные снимки и управление интервалом, GPT-анализ последних двух снимков реализованы. 22 новых теста и 22 существующих admin/transport теста PASS; bundle ~290 KB. Живое подключение не выполнено: текущий Cloudflare OAuth видит только аккаунт облачного агента, а Worker ЧП отсутствует среди доступных Workers. Для rollout нужны доступ к существующему `royal-crm-miniapp-api`, приватный RM_AGENT_API_KEY и SOSISKA_GROQ_KEY. Мониторинг автоматически не включался; уровень/прогресс и боты не менялись. Передача: `docs/sosiska/RESUME_20261011.md`. Ограничения: картинки эмблем ещё не сопоставлены, выбор произвольного периода анализа не реализован; полный исторический набор тестов содержит устаревшие fixtures, не объявлен зелёным.

## 2026-09-12 — Owner ingress resilience installed; behavioral acceptance pending

Owner's completed recovery report confirms the existing Apps Script deployment uses ingress 2.9.0 and outbox 1.1.0; the deployment URL is preserved. Recovery found the release already active, so another deployment switch and version creation were unnecessary. Full live mirror synchronization succeeded.

GitHub main at mirror commit 0f5bc050bfc4d9757262905f50694295c28236d2 contains ingress and outbox files exactly matching the reviewed source. Production installation evidence comes from the owner's verified deployment report; the mirror is a separate source confirmation.

This supersedes the earlier source-prepared status. Telegram behavioral acceptance remains pending. The earlier immediate readback mismatch is no longer a deployment blocker; its precise cause has not been established. Do not repeat installation. Next verification is the owner's natural Telegram questions and, if needed, the protected ingress diagnostics.

Only checkpoint documentation changes in this follow-up. No source, permissions, data, frontend release, model calls or outgoing messages were changed or generated here.

## 2026-09-12 — Owner ingress resilience 2.9.0, source prepared

Source changes remove the redundant global lock when the commit timer is already installed. The error handler keeps fixed primary/secondary error codes and always contains secondary failures. Per-update delivery markers are independent of the shared cursor; confirmed Telegram receipts allow the commit timer to recover prepared payloads after a post-send metadata lock failure. Attempted or ambiguous sends are never automatically resent or treated as confirmed memory. Outbox 1.1.0 remains commit-only.

Eleven offline tests passed: lock contention, secondary error containment, replay during send, exact-answer commit recovery, ambiguous send, secret omission, property outage and owner/group isolation. These tests do not establish end-to-end bot acceptance. The primary cause of the earlier live AI failures remains unconfirmed.

Publication is source only until the deployment checkpoint is recorded. Existing stable Apps Script deployment must be updated in place; no new webhook, model probe or permission expansion. Frontend, Sheet schema and shared Worker unchanged. Detailed operational evidence remains in the private runtime repository.

# Royal CRM / «Таблица ЧП» — CURRENT STATE

## 2026-09-08 — M3D complete owner request transport, source ready

Owner ingress 2.8.0 carries Telegram sender profile, update/message identifiers,
text/caption, topic and timestamp, exact reply with its sender and quote, and
media descriptors into the shared Worker TurnFrame. It does not inject memory
or authorization flags. Worker D1 supplies governed dialogue and shared memory.
M3C post-send outbox and byte-exact answer commit remain in use.

Source publication is not Apps Script deployment. The paired private M3D
runner releases the Worker and this pinned overlay in authenticated Cloud Shell.
No webhook change, public speaking, synthetic Telegram message or functional
acceptance is claimed by this source checkpoint.


> **Актуально на 05.09.2026.**
> Новый чат обязан сначала прочитать `START_HERE.md`, затем этот файл и последние записи `WORK_HISTORY.md`.
> Фактический runtime / живые Google Sheets / live Apps Script / текущий GitHub имеют приоритет над памятью чатов.

## 1. Обязательный протокол работы

1. Не менять код по памяти: сначала открыть фактический файл/SHA/подключение.
2. Если задача зависит от данных — сверить `snapshot.json`, private `admin-snapshot.json` и/или живую Google Sheets.
3. Для Apps Script использовать `apps-script-live/` как зеркало последнего `clasp pull`; перед `clasp push` обязательны backup/pull и `clasp status`; после push снова синхронизировать live mirror.
4. Не создавать новый Apps Script deployment, если достаточно обновить существующий **`Таблица ЧП 1.3`**.
5. GitHub commit не равен production/runtime-подтверждению.
6. После принятой/проверенной работы обновлять `CURRENT_STATE.md` и `WORK_HISTORY.md`; `RELEASE_RULES.md` — при новом постоянном инварианте.
7. Публичные handoff-файлы не должны содержать реальные Telegram ID, имена участников, requestId, dataHash, номера персональных строк или exact private endpoint; использовать обезличенные сценарии и агрегаты. Согласованные публичные credits сохраняются.

### Golub narrative delivery 2.5.0 — source ready, rollout pending — 05.09.2026

- Production still uses owner ingress 2.4.0 until the guarded shared rollout completes; no live version claim is made from the repository update alone.
- Source 2.5.0 accepts the signed rich-answer envelope from Universal Query and sends safe Telegram HTML so source URLs appear only behind natural clickable phrases, with link previews disabled.
- Only validated `t.me` anchors are allowed. Any other markup or visible URL is stripped and sent as clean plain text.
- This changes only owner-private answer presentation. Owner-only access, public-CHP-only memory, the stable Tables 1.3 deployment, ChatKeeper/Royal CRM routing, webhook configuration and public CHP speech remain unchanged.

### Golub owner-only AI + public CHP memory interface — 03.09.2026

- The same stable `Таблица ЧП 1.3` web-app deployment is now version 103. Its deployment ID and `/exec` URL did not change.
- Telegram enters through the signed relay. A fresh owner DM completed the full Telegram → relay → Apps Script → AI → Telegram cycle; the recorded ingress and successful send timestamps match.
- `36_GOLUB_OWNER_WEBHOOK_INGRESS.gs` is version 2.4.0. The fixed acknowledgement is gone: only the configured owner receives an AI answer in private chat.
- The private fallback now calls a signed Universal Query Contract endpoint before the AI provider. Only canonical public CHP evidence is returned; the owner's private question is not written to the public event store.
- The public CHP database has bounded live/backfill sequence lanes, durable checkpoints, participant identities and a signed query executor. Historical `observer_updates` transfer is the remaining data-loading step; an empty evidence window produces an honest empty result.
- Public/group AI replies remain disabled. Group traffic still falls through to the pre-existing Tables 1.3 / ChatKeeper / Royal CRM path.
- Telegram verification after version 103: relay URL still matches, pending updates `0`, no delivery error, `max_connections=10`, and the approved update allow-list is unchanged.
- ChatKeeper remains only the branded-bot integration. Existing ChatKeeper/Royal CRM and Mini App routes were not changed.
- Owner identity, bot token, webhook/query secrets and AI shared secret remain only in protected properties/environment variables.

---

## 2. Репозитории / входы

- основной repo: `Antonsoloway/Specnaz-mini-app`, branch `main`;
- data repo: `Antonsoloway/royal-crm-data`;
- постоянный entrypoint: `app.html`;
- обычный запуск → **`app-v0601.html` / release v0.6.1**;
- `app-v0601.html` сохраняет query/hash и передаёт запуск в общий runtime `app-v0600.html` с `releaseBuild=20260824-v061-visual-stability1`;
- `app-v0559.html` / v0.5.59 сохранён как rollback target, но больше не является текущей default-версией;
- bot: `@doveofpeace_bot`.

Текущий release delivery:
- `app.html` → `app-v0601.html`, cache marker **`20260824-v061-visual-stability1`**;
- внешний release номер = **v0.6.1**; общий runtime всё ещё переиспользует `app-v0600.html` и его v0.6-модули;
- `v061-runtime-compat.js` = **`0.6.1-runtime.2`**: защищённый `/snapshot` получает bounded transient retry и один автоматический recovery после исчерпания первой серии;
- `app-v0600.html` принудительно загружает этот runtime bridge с cache-bust `20260823-v061-snapshot-resilience1`;
- `profile-team-link-v061.js` и `changelog-v0601.js` подключены из конечного runtime;
- launch `search + hash` сохраняется на обоих redirect-этапах, Telegram initData теряться не должен;
- GitHub commit и release entrypoint не считаются доказательством Cloudflare/runtime deploy без отдельной проверки.

---

## 3. Live Apps Script / admin backend

Подтверждено production-записями и свежими snapshot на 22–23.08.2026:
- private admin snapshot contract: `adminData.version = 0.6.0-write.5`; публичный snapshot 23.08 содержит 207 participants;
- advertised write endpoint закреплён: `endpointPinned=true`, `endpointSource=deployment-constant`; используется существующий deployment **`Таблица ЧП 1.3`**;
- optimistic `revision` у participant/team records;
- write transport: **Mini App → Worker → HMAC → Apps Script → Google Sheets**;
- HMAC secret не попадает в браузер/GitHub;
- `deleteParticipant` и `deleteTeam` включены в production write.5;
- team photo capability + rename cleanup подтверждены;
- membership write работает атомарно: один range write, validation-safe role update и rollback исходных values/rules при ошибке.

Production write.5 policy:
- `deleteParticipant` только если фактический `База участников!AF = Вышел`;
- `deleteTeam` только если фактические `Команды!L = Неактивен`, `E = 0` и повторный scan всех пяти live membership slots вернул 0 ссылок;
- participant delete очищает только source ranges `A:S`, `U:V`, `AB:AF`, сохраняя formula arrays `T` и `W:AA`;
- team delete очищает только source `A:D`, сохраняя formula columns `E:L`;
- обе операции используют optimistic revision, ScriptLock, admin journal и обязательное подтверждение в Mini App;
- installer сохранил и обновил только существующий deployment `Таблица ЧП 1.3`; новый deployment не создавался.

Fast-write / snapshot refresh — production confirmed:
- все шесть create/update/delete operations используют commit-first contract: Sheet mutation + journal + idempotency cache завершаются под коротким `ScriptLock`, затем сервер сразу возвращает committed result;
- frontend сохраняет optimistic committed payload до появления всех pending operations в private journal, поэтому отстающий snapshot не может вернуть старую revision между последовательными правками;
- Worker `1.28.0+` после committed app write запускает отдельный HMAC-signed `admin-snapshot-refresh` через `ctx.waitUntil()`;
- installable Sheet edit/change triggers напрямую выполняют тот же unified public/private flush;
- Sheet capture выполняется под коротким `ScriptLock`, GitHub publication — после release и под отдельной сериализацией; stale capture не может затереть более свежий;
- one-off clock и штатный 5-minute trigger остаются durable retry/fallback, а не latency contract;
- production smoke подтвердил атомарные последовательные participant edits и обновление app/manual snapshots примерно за десятки секунд без ожидания пятиминутного fallback;
- обе destructive операции всё ещё требуют отдельного device smoke только на безопасных тестовых записях.

Live modules:
- `28_MINIAPP_ADMIN_DATA.js` — private admin read;
- `29_MINIAPP_ADMIN_WRITE.js` — validation/helpers;
- `30_MINIAPP_ADMIN_WRITE_BACKEND.js` — signed gateway;
- `31_MINIAPP_ADMIN_WRITE_HARDENED.js` — hardened mutations/policies + exact deployment endpoint resolver/pin;
- `32_MINIAPP_ADMIN_TEAM_PHOTO.js`, `33_MINIAPP_ADMIN_WRITE_FINAL.js` — team photo/final integration.

Public snapshot:
- Unified Snapshot Writer `1.2.7`;
- schema `1.4.2`;
- searchIndexVersion `1.1.3`;
- штатный trigger примерно раз в 5 минут.

---

## 4. Google Sheets / identity

Главные листы: `База участников`, `Команды`.

### Команды
- identity = **название + игра**;
- `Команды!L` = `Активен / На паузе / Неактивен`;
- фото — штатный source `Команды!C` + private team media;
- переименование `Команды!B` — каскадная операция: обновить все 5 membership team-slots той же игры;
- игра существующей команды — часть identity и через текущий editor не меняется;
- поля team record в private snapshot включают `leader`, `players`, `specnazTrips`, `sort`, `screens`, `activityBase`, `activityOutside`, `average`, `status`, `row`, `revision`.

### Участники
- identity = **raw Telegram ID**;
- существующий Telegram ID неизменяем;
- 5 membership slots: игра / команда / роль / игровой ник;
- private participant record: `row`, `telegramId`, `name`, `telegramName`, `username`, `memberships`, `status`, `specnaz`, `date`, `screens`, `activityBase`, `activityOutside`, `lastChange`, `chatState`, `revision`;
- существующий участник v0.6 вручную: **только CRM `name` + memberships**;
- Telegram name, `@username`, chat state, date, U/AB/AC/AD и остальные bot/system fields = **SERVER READ-ONLY**; попытка ручной записи → `PARTICIPANT_FIELD_READ_ONLY`.

### `Вышел`
- `AE` — не дата выхода;
- правильный порядок `Вышел` повторяет physical row order стабильной группы в `База участников`;
- в admin UI: свежие выходы сверху, старые ниже, сортировка по source row ascending.

Строгую публичную validation `02_PUBLIC_SYNC_V4.js` не ослаблять.

---

## 5. Rollback v0.5.59 — не ломать

- auth: 12 сек + один transient retry; Android code 20 → `AUTH_TIMEOUT`;
- `Связаться` для участников без `@username` только через Worker/Голубца, не через прямой `tg://user?id`;
- contact actions восстанавливаются после Back/rerender;
- hybrid search + server `searchKeys`;
- exact alias `BbllllKA / Royal Kingdom ↔ вышка`;
- active-team gold + кликабельный крот + каталог базы спецназа;
- один persistent IndexedDB cache для avatars/team photos;
- iOS-safe team-photo guard `0.5.59.2`;
- не возвращать сломанный fast-path `0.5.59.3`;
- forward → top, Back → сохранённая позиция.

---

## 6. v0.6 / v0.6.1 frontend

Основные активные модули общего v0.6 runtime:
- `admin-v0600.js` = `0.6.0-read.3` / `admin-eligibility-v0600.js`;
- `admin-entry-relocation-v0600.js` = `0.6.0-admin-entry-relocation.2`;
- `admin-write-gate-v0600.js` = `0.6.0-write.5-gate.1`;
- `admin-write-v0600-v3.js` = `0.6.0-write.5-ui.8`;
- `admin-team-photo-v0600.js`;
- `admin-participant-edit-policy-v0600.js`;
- `admin-search-media-sort-v0600.js` = `0.6.0-admin-search-media-sort.2`;
- `admin-media-cache-v0600-v2.js` = `0.6.0-admin-media-cache.2`;
- `admin-team-detail-v0600.js` = `0.6.0-admin-team-detail.4`;
- **`admin-participant-detail-v0600.js` = `0.6.0-admin-participant-detail.2`**;
- **`admin-participant-nav-guard-v0600.js` = `0.6.0-admin-participant-nav-guard.1`**;
- **`admin-participant-memberships-v0600.js` = `0.6.0-admin-participant-memberships.2`**;
- **`admin-navigation-guard-v0600.js` = `0.6.0-admin-navigation-guard.3`**.

### Admin search / avatars
- поиск по participants/teams должен сохранять deterministic hybrid behavior обычного режима;
- ищет по CRM имени, Telegram имени, `@username`, ID, memberships, игровым никам, ролям, team leader/status/stat fields и доступным `searchKeys`;
- `BbllllKA ↔ вышка` сохранён;
- admin avatars используют один persistent cache с ordinary mode; primary key `avatar:<avatarFileId>`, `avatar:tg-<id>` — fallback/migration для записей без snapshot fileId.

### Admin participant list/detail — repo ready, smoke pending

В списке участников:
- raw Telegram ID **не показывается визуально**;
- ID остаётся только скрытым техническим identity для search/avatar/editor;
- `@username` показывается при наличии;
- memberships/команды теперь выводятся **отдельными ordinary-style плашками**, через те же `membership-list` / `membership-pill`, что и на обычной странице участников;
- каждая плашка показывает `команда + роль + игра`; несколько membership → несколько отдельных плашек;
- существующие `team-game-colors-v0535.js` и `active-teams-v0559.js` повторно декорируют эти же плашки: сохраняются цвета РМ/РК и золотая рамка для `Активен` по source-of-truth team status;
- старая единая текстовая строка команд в admin summary скрыта;
- плашки внутри admin summary display-only (`pointer-events:none`), поэтому весь summary остаётся единым navigation target и tap по карточке/плашке не уводит в ordinary/public route;
- tap по карточке больше не раскрывает старый `<details>` с техническими полями — открывает отдельный normal-style participant detail;
- `admin-participant-nav-guard-v0600.js` отключает pointer-events у ordinary avatar subtree внутри admin summary, чтобы тап по аватару не успевал открыть public participant profile раньше admin detail; весь summary остаётся единым navigation target.

Admin participant detail:
- источник = private `adminData.participants`, поэтому работает для `В чате`, `Вышел` и других admin-only записей;
- шапка использует обычный participant visual language: persistent avatar, имя, username/contact, rank visual когда public participant/rank доступен;
- показываются memberships с ролью, игровым ником и игрой;
- команда в membership кликабельна → `RoyalAdminTeamDetailV0600.open(name, game)`;
- полный admin block показывает row, CRM name, Telegram name, `@username`, raw Telegram ID, status T, date V, lastChange AE, chatState AF;
- числовые карточки: `Спецназ U`, `Скрины AB`, `Активность в базе AC`, `Активность вне базы AD`;
- кнопка **`✏️ Редактировать участника`** переиспользует существующий hardened editor; второго write-flow нет;
- server whitelist не расширен: edit по-прежнему только `name + memberships`.

Participant metric rankings:
- U → `specnaz`;
- AB → `screens`;
- AC → `activityBase`;
- AD → `activityOutside`;
- источник = полный private `adminData.participants`;
- сортировка numeric descending, нули остаются внизу, tie-break по display name/Telegram ID;
- row показывает место, имя, chat/status, первые memberships и выбранное значение;
- текущий участник подсвечивается;
- tap по строке рейтинга → admin participant detail;
- avatars намеренно не грузятся для всех 207 ranking rows, чтобы не делать media prewarm;
- Back использует существующий `RoyalNav` capture.

### Admin team list/detail
- список команд включает `Активен`, `На паузе`, `Неактивен` из private admin snapshot;
- tap по команде открывает normal-style detail: большое фото, название/игра, participants/leaders/helpers, полный состав;
- detail дополнительно показывает private поля `D:L`: лидер/подпись, игроков, общий спецназ, сортировка, скрины, активность в базе, активность вне базы, среднее, статус + source row;
- кнопка **`✏️ Редактировать команду`** использует существующий hardened editor, второй write-flow не создаётся;
- текущий team write: `name + leader`; photo — через photo module; E:L пока read-only, статус L пока только просмотр;
- large photo и thumbnail используют один team key `team:<normalized name>\n<normalized game>`;
- участники внутри `Состав команды` остаются визуально ordinary-style, но **любая навигация из admin team detail должна оставаться admin**;
- подтверждённый legacy-конфликт ordinary mode: `participant-profile-v0523.js` открывает public participant profile по avatar `pointerdown/pointerup`, а `participant-card-ux-v0531.js` открывает public profile по click всей `.team-member`;
- `admin-navigation-guard-v0600.js .3` перехватывает admin roster `pointerdown/pointerup` на `window` capture до document-level ordinary router, а click всей строки также маршрутизирует в `RoyalAdminParticipantDetailV0600.open(rawTelegramId)`;
- дополнительно ordinary `RoyalOpenParticipantByTelegramId` обёрнут защитой: при видимом admin context participant переход не должен открыть public detail;
- `@username` / `data-user-menu` остаётся самостоятельным contact action и не маршрутизируется в participant detail;
- Telegram WebView повторная проверка этого конкретного пути после build `2328` ещё pending.

### Admin team metric rankings — repo ready, smoke pending

В `admin-team-detail-v0600.js .4` шесть карточек статистики кликабельны:
- `Игроков E` → `players`;
- `Общий спецназ F` → `specnazTrips`;
- `Скрины H` → `screens`;
- `Активность в базе I` → `activityBase`;
- `Активность вне базы J` → `activityOutside`;
- `Среднее K` → `average`.

Поведение рейтинга:
- источник = private `adminData.teams`, без нового backend/API;
- входят все admin-команды, включая `Неактивен` и нулевые значения;
- numeric descending, tie-break = team name/game;
- место, команда, игра, статус, значение;
- исходная команда подсвечивается;
- tap по строке → admin team-detail;
- без 128 thumbnails/network prewarm;
- Back → предыдущий detail/list state.

### Admin entry + guarded deletion — live build 1435 / write.5

- плитка `Админ режим` больше не занимает место в основном grid: после подтверждения admin eligibility она скрывается, а кнопка переносится внутрь `#selfProfileCard .self-profile-head`, справа от имени/username;
- relocation переживает повторный render self-profile через `MutationObserver`; если eligibility исчезла, перенесённая кнопка удаляется;
- delete-кнопка участника видна прямо на admin participant detail только при `chatState = Вышел`;
- delete-кнопка команды видна прямо на admin team detail только при `status = Неактивен` и `players = 0`;
- перед direct delete frontend повторно загружает свежую private card/revision; кнопки в modal editor также сохранены;
- перед каждой операцией Telegram `showConfirm`/browser confirm задаёт явный вопрос `Точно хотите удалить...`;
- frontend-условия не являются защитой: Apps Script повторно читает live Sheet под lock и отклоняет операцию при изменившемся status/count/revision;
- после успеха private snapshot обновляется, cache сбрасывается, удалённая запись исчезает из admin list/table;
- свежий private snapshot: 207 participants, 129 admin teams; `Вышел` = 16; `Неактивен` = 26, из них E=0 = 25; одна неактивная команда с ненулевым E остаётся заблокированной.

**Статус frontend:** default release entrypoint = **v0.6.1**. Общий runtime переиспользует v0.6.0 shell/modules; atomic membership backend и immediate unified refresh подтверждены предыдущим production-smoke. Guarded deletes, admin roster navigation и полный Android/iOS smoke остаются отдельными проверками.

---

## 7. Медиакэш

Один IndexedDB: **`royal-crm-media-cache / images`**.

- avatar primary key: `avatar:<avatarFileId>`;
- если snapshot не содержит `avatarFileId`, client использует стабильный fallback key `avatar:tg-<id>`;
- team key: `team:<normalized team>\n<normalized game>`;
- cache-first: memory/disk → network;
- avatar network concurrency остаётся ≤ 2 в persistent flow;
- production Worker `1.32.1` при отсутствии canonical avatarFileId сначала проверяет авторизованный participant allow-list, затем может использовать private last-known registry/private media cache и только после этого live Telegram fallback;
- private cached avatar bytes и last-known fileId остаются server-side и не раскрываются браузеру;
- live fileId не передаётся в legacy `/avatar?fileId` route, потому что тот специально разрешает только fileId, уже зафиксированные в snapshot;
- Telegram fallback не делает массового prewarm и не раскрывает bot token/fileId браузеру;
- team photo background refresh не чаще ~30 мин;
- без массового сетевого prewarm;
- admin `/admin-team-photo` сначала ищет private SHA-256 media по identity `name + game`, `photoUrl` только fallback;
- пустой `Фото C` в admin UI не является доказательством отсутствия private media.

---

## 8. Worker

Frontend Worker origin: `https://royal-crm-miniapp-api.tropical-spoon.workers.dev`.

Repo config на 23.08.2026:
- `worker/wrangler.toml` → **`src/entry-v1320.js`**;
- `entry-v1320.js` объявляет production wrapper **`1.32.1`**;
- avatar contract: `private-media-cache+last-known+telegram-live`, private last-known registry + private GitHub media fallback;
- wrapper сохраняет базовую auth/snapshot/admin/media реализацию предыдущей цепочки и не меняет существующие admin write policies;
- Cloudflare Builds настроен на GitHub `main`, root path `/worker`; commit в repo ожидаемо запускает deploy, но GitHub commit сам по себе не является runtime-подтверждением;
- `/admin-data` — admin-only private read;
- `/admin-write` — authenticated admin mutation;
- `/admin-team-photo` — protected private media route;
- public `/snapshot`, `/team-photo`, `/contact-by-id`, auth/media routes не должны регрессировать.

`entry-v1320.js` сначала повторно авторизует участника через protected `/snapshot`, затем для missing avatar может прочитать private last-known registry и private cached bytes; если private cache не помогает — использует Telegram fallback. Bot token, private fileId и private media paths не выдаются клиенту.

---

## 9. Credits

`Помощь в разработке, тесты`:
- `@sfinks_spb`
- `@O_Chaplygina`
- `@Yanochka_2404`
- `@DmitryRoyal`

---

## 10. Минимальный smoke текущего v0.6.1

1. Обычный `app.html` открывает `app-v0601.html`, затем общий v0.6 runtime с сохранением Telegram query/hash; v0.5.59 остаётся rollback target.
2. Не-админ не получает admin-data/write.
3. Existing participant editor: только имя + memberships; прямой system-field write отклоняется.
4. CreateTeam с фото, atomic participant memberships, последовательные edits и background snapshot convergence подтверждены. Повторить smoke на обезличенных тестовых данных и проверить, что committed UI не перезаписывается stale snapshot.
5. Team rename каскадит memberships; team photo upload/rename cleanup работают.
6. Admin avatars/team photos повторно читаются из общего persistent cache. Для записи без snapshot `avatarFileId`, но с доступным Telegram profile photo, после reload должна появиться фотография и сохраниться под `avatar:tg-<id>` до появления canonical fileId.
7. Admin search проверяется по имени/@/ID/role/nickname/team + `вышка`.
8. `Вышел` сравнить с physical order таблицы.
9. Admin participant list: visible ID отсутствует; каждая membership показана отдельной ordinary-style плашкой `команда + роль + игра`; РМ/РК окраска и золото `Активен` совпадают с обычной страницей; tap по summary, аватару и области плашек → именно admin participant detail, не accordion/public profile/team route.
10. Admin participant detail: все private поля, persistent avatar, memberships → team detail, editor; U/AB/AC/AD → rankings descending; tap row → participant; Back state.
11. Admin team detail: фото, D:L, editor, состав, включая минимум одну `Неактивен`; **tap по аватару, имени и свободной области строки участника состава → admin participant detail с private data/editor, не ordinary `ДОСТИЖЕНИЯ`; tap по `@username` остаётся contact action.**
12. Нажать E/F/H/I/J/K и проверить каждый team ranking: all teams, descending, нули внизу, tap team → detail, Back.
13. На главной admin-кнопка находится справа от имени админа в self-profile; старая grid-плитка отсутствует; после Back/rerender кнопка остаётся одна и открывает admin mode.
14. Участник не `Вышел`: delete-кнопки нет и прямой `deleteParticipant` отклоняется. `Вышел`: отмена confirm ничего не меняет; подтверждение очищает source-поля, запись исчезает из admin list, formula arrays T/W:AA остаются.
15. Команда `Активен`/`На паузе`, `Неактивен` с E>0 или с фактической membership-ссылкой: delete запрещён. Только `Неактивен` + E=0 + refs=0 после confirm очищает A:D и исчезает из admin list; E:L formulas остаются.
16. Проверить Android и iPhone/iPad Telegram WebView.
17. Для startup snapshot: краткий сетевой `Failed to fetch`/429/502/503/504 не должен сразу оставлять пользователя на degraded screen; runtime делает bounded retry и один automatic recovery. Если все попытки реально исчерпаны, ограниченный режим остаётся доступен.

---

## 11. Что нельзя откатить

- launch `search + hash`/Telegram initData;
- raw Telegram ID participant identity;
- team identity `название + игра`;
- cascade rename 5 membership slots;
- strict public validation;
- `searchKeys`/`searchIndexVersion`;
- `BbllllKA ↔ вышка`;
- one persistent media cache identities;
- avatar canonical cache identity `avatar:<avatarFileId>` + `avatar:tg-<id>` fallback для временно отсутствующего fileId;
- authenticated live Telegram avatar fallback не должен обходить snapshot membership/auth и не должен превращаться в массовый prewarm;
- live Telegram avatar discovered fileId не должен отправляться через legacy `/avatar?fileId` snapshot allow-list; proxy разрешён только после participant allow-list и остаётся server-side;
- iOS source-preservation guard;
- `Связаться` только через Worker/Голубца;
- existing-participant server whitelist `name + memberships`;
- membership write atomic: один range write, validation-safe role update и rollback исходных values/rules;
- Worker-signed HMAC admin write;
- committed app write запускает Worker-signed direct unified snapshot refresh; manual Sheet edit использует installable-trigger direct flush; one-off clock и 5-minute trigger остаются fallback;
- destructive writes server-gated: participant только `AF=Вышел`; team только `L=Неактивен`, `E=0` и live membership refs=0; optimistic revision + confirm + journal обязательны;
- exited physical-row ordering;
- admin hybrid search;
- admin participant list without visible Telegram ID;
- admin participant list memberships use ordinary `membership-list` / `membership-pill` visuals with existing RM/RK and active-team decorators; не возвращать одну текстовую строку команд;
- admin participant summary/avatar/membership area navigation must resolve to admin participant detail before ordinary public-profile/team handlers;
- **admin team roster participant navigation must resolve to admin participant detail before legacy ordinary avatar-pointer and `.team-member` click routers; `@username` remains an independent action;**
- admin participant detail from private snapshot + U/AB/AC/AD rankings;
- admin team detail from private snapshot including inactive;
- admin team metric rankings E/F/H/I/J/K from full private team set;
- v0.6.1 startup snapshot resilience: transient Worker/network errors are retried client-side before degraded mode is treated as final.

После принятой/проверенной правки обязательно обновлять этот файл и добавлять новую верхнюю запись в `WORK_HISTORY.md`.

---

## v0.6.1 music menu recovery — 23.08.2026 [V061_MUSIC_MENU_FINAL2_20260823]

- Participant avatar hotfix подтверждён пользователем на реальном Telegram-устройстве: ранее проблемные фотографии загружаются.
- Frontend music root fix находится в `main`: `app.js` экспортирует protected audio runtime для всей ветки `0.6.x`; active marker = `20260823-v061-music-live3`.
- Live `22_MINIAPP_BOT_APP_MENU.js` направляет bot Web App на `app.html?cb=20260823-v061-music-live3`.
- `clasp run` для этого standalone Apps Script не используется; menu application выполняется через временный tokenized web-app invoker.
- Temporary route удалён после вызова; сохранён существующий deployment `Таблица ЧП 1.3`, новый deployment не создавался.
- Telegram menu verification = **CONFIRMED**.
- После операции live Apps Script повторно синхронизирован в `apps-script-live/`.
- Предыдущий final recovery остановился на небезопасном shell heredoc при записи handoff; эта версия пишет handoff через Python без shell command substitution.

---

## v0.6.1 own-profile team navigation — 23.08.2026 [V061_SELF_PROFILE_TEAM_LINK_20260823]

- `profile-team-link-v061.js` обновлён до `0.6.1-profile-team-link.2`.
- На главной странице membership-плашки в собственной карточке профиля получают безопасный ordinary team route и становятся кликабельными.
- Для team identity передаётся пара `название + игра`, поэтому одинаковые названия в Royal Match / Royal Kingdom не смешиваются.
- Legacy `profile-card-v0523.js` не менялся: rollback v0.5.59 сохранён.
- Release/cache marker = `20260823-v061-self-team-link1`; Telegram menu verification = **CONFIRMED**.
- `changelog-v0601.js` дополнен этой возможностью.
- Изменение frontend-only; Sheets/CRM данные не изменялись. Device smoke перехода из своей карточки остаётся acceptance check пользователя.

---

## Security hardening — 23.08.2026 [SECURITY_SHEETS_WEBHOOK_STAGE_20260823]

- Обе рабочие Google Sheets переведены из `anyone:writer` в Restricted; Drive metadata после изменения показывает только owner permission и `shared=false`.
- Это не меняет runtime-модель: Apps Script deployment `Таблица ЧП 1.3` остаётся `executeAs=USER_DEPLOYING`, поэтому `SpreadsheetApp.openById(...)` продолжает работать от имени владельца.
- Публичный Apps Script web-app endpoint не закрывался: внешний API по-прежнему требует доступ через deployment, а не прямой доступ к Sheets.
- Hardcoded webhook credential удалён из текущего live source и перенесён в Script Properties.
- Начата безопасная staged rotation: новый current secret хранится только в Script Properties/локальном защищённом файле Cloud Shell; прежний secret временно принят как previous, чтобы не остановить действующий ChatKeeper webhook до переключения отправителя.
- Финальный security шаг: заменить secret в ChatKeeper на новый current, затем удалить previous property отдельным финализатором.

---

## Webhook secret rotation finalized — 23.08.2026 [SECURITY_WEBHOOK_ROTATION_FINAL_20260823]

- ChatKeeper sender переведён на новый webhook secret.
- `ROYAL_CRM_WEBHOOK_SECRET_PREVIOUS` удалён из Script Properties; публично раскрытый legacy credential больше не принимается.
- Единственный действующий webhook secret хранится только в Script Properties; в текущем public Apps Script mirror literal credential отсутствует.
- Existing deployment `Таблица ЧП 1.3` сохранён; temporary migration route удалён.

---

## v0.6.1 snapshot startup resilience — 23.08.2026 [V061_SNAPSHOT_RESILIENCE_20260823]

- Повторяющийся startup screen `Данные пока не загрузились / Failed to fetch` локализован в public `/snapshot` path: auth уже мог быть успешным, но transport выполнял snapshot network request только один раз.
- `v061-runtime-compat.js` обновлён до `0.6.1-runtime.2` и оборачивает только Worker `/snapshot`: повторяет transient network failure и HTTP 429/502/503/504 с коротким bounded backoff.
- Если первая серия всё же исчерпана и lifecycle выдаёт `snapshot-error`, выполняется один automatic background `reloadSnapshot()`; успешный `snapshot-ready` сам закрывает degraded startup без обязательного ручного нажатия.
- Auth/admin-write/admin-data/media contracts не менялись; security lockdown Sheets и webhook secret rotation не откатывались.
- `app.html`, `app-v0601.html`, runtime bridge и changelog переведены на cache marker `20260823-v061-snapshot-resilience1`.
- `changelog-v0601.js` дополнен этой правкой; требуется device smoke повторным закрытием/открытием Mini App через Telegram.

---

## v0.6.1 repeated Specnaz history links — 23.08.2026 [V061_HISTORY_LINK_RELIABILITY2_20260823]

- Первый history-link hotfix не принят: device smoke показал, что повторные переходы после возврата из Telegram остаются нестабильными.
- v2 переносит ownership физического Android touch на `window` capture до legacy document click-router; один tap вызывает ровно один `openTelegramLink`, без таймерного повторного deep-link.
- Для touch используется отдельный touchstart/touchend guard; generated click подавляется тем же capture-router, а после возврата dedupe автоматически переармируется.
- Активный frontend/menu marker = `20260823-v061-history-link2`; Telegram menu verification = **CONFIRMED**.
- Кнопка `Связаться` без username ранее подтверждена пользователем как работающая после Worker v1.35.0.
- Production acceptance history-link v2 остаётся device smoke: несколько разных ссылок подряд с возвратом в Mini App.


---

## v0.6.1 participant identity consistency — 23.08.2026 [V061_PARTICIPANT_IDENTITY_20260823]

- Добавлен `participant-identity-v061-v2.js` = `0.6.1-participant-identity.4`.
- Во всех participant surfaces v0.6.1 унифицирована видимая identity: **CRM name → кликабельный @username (если есть) → Telegram display name**.
- Покрыты ordinary participant list, team members, self/profile detail, Specnaz hero/history, directory cards, admin participant list/detail, admin team members и admin participant rankings.
- В ordinary UI raw Telegram ID визуально не раскрывается; admin detail сохраняет ID как защищённое admin-only поле.
- Узкие карточки получили перенос CRM-name и меньший reserved rank strip, чтобы identity не перекрывалась значками звания/ачивок.
- Rollback v0.5.59 не изменён: новый модуль исполняется только при `__ROYAL_BUILD__ === '0.6.1'`.
- Release/cache marker = `20260823-v061-identity2`; Telegram menu verification = **CONFIRMED**.
- Device smoke всех основных participant surfaces остаётся acceptance check пользователя.


- v0.6.1 participant identity consistency: device smoke подтверждён пользователем 23.08.2026 — отображение CRM-имени, @username и Telegram-имени принято.


---

## v0.6.1 Specnaz roomy cards — 23.08.2026 [V061_SPECNAZ_LAYOUT_20260823]

- Добавлен `specnaz-layout-v061.css`, исполняемый только через текущий v0.6.1 entrypoint.
- `Герои спецназа`: карточки используют больше ширины panel; на мобильном имя/achievement strip/@username/Telegram name идут устойчивым вертикальным потоком, score переносится в отдельную grid-строку и карточка растёт по высоте.
- `История спецназа`: список и строки расширены; identity + rank на узких экранах раскладываются в отдельные строки, scoreline умеет переноситься.
- Ничего не должно обрезаться или накладываться; длинные строки используют wrap/overflow-wrap.
- Legacy `specnaz.css` v0.5.59 не изменён.
- Release/cache marker = `20260823-v061-specnaz-layout1`; Telegram menu cache принудительно обновлён через существующий Apps Script deployment `Таблица ЧП 1.3`.
- Device smoke hero/history layout остаётся acceptance check пользователя.


---

## v0.6.1 Specnaz achievement alignment — 23.08.2026 [V061_SPECNAZ_ACHIEVEMENT_ALIGN_CONFIRMED_20260823]

- `Герои спецназа`: achievement stack выровнен по правому краю; порядок `Админ → звание → МАЯК`, MAYAK не уезжает влево.
- Frontend/cache marker = `20260823-v061-specnaz-layout2`.
- Telegram bot menu URL подтверждён с `20260823-v061-specnaz-layout2` корректным JSON verifier.
- Предыдущие `AssertionError` были ложным отрицательным результатом verification-script: heredoc занимал stdin Python и не давал ему прочитать JSON из curl.
- Существующий deployment `Таблица ЧП 1.3` сохранён, временный route удалён, live Apps Script mirror синхронизирован.
- Device smoke визуального выравнивания остаётся acceptance check пользователя.


---

## v0.6.1 Android visual stability — 24.08.2026 [V061_VISUAL_STABILITY_20260824]

- Предыдущее выравнивание achievement stack `Админ → звание → МАЯК` подтверждено пользователем на устройстве.
- По присланной записи зафиксированы два одно-кадровых визуальных провала примерно в 10.87s и 31.49s; интервал около 20.6s. Это не keyframe видео: в момент сбоя WebView кратко показывает placeholder/перекомпоновку изображения и сразу возвращает исходный кадр.
- Найден постоянный legacy rank visibility polling: `rank-system-v0524.js` каждые 1.6s делал `getBoundingClientRect()` для всех `.rank-badge--compact`, плюс такой же scan на scroll/resize. Для v0.6.1 он теперь перехватывается только на время загрузки legacy rank module и не запускается.
- `v061-visual-stability.js` переключает `rank-is-visible` через `IntersectionObserver`; новые динамические карточки подхватываются `MutationObserver` без периодического layout scan. Legacy v0.5.59 исходники не изменены.
- `rank-visual-stability-v061.css`: переливание больше не перемещает широкий pseudo-element за пределы rank badge; блик анимирует background-position внутри clip-mask самой плашки. Crest/wings не обрезаются.
- Frontend/menu marker = `20260824-v061-visual-stability1`; Telegram menu подтверждён. Существующий deployment `Таблица ЧП 1.3` сохранён, temporary invoker удалён, live Apps Script mirror синхронизирован.
- Device acceptance: оставить приложение открытым минимум 45–60 секунд на нескольких страницах и проверить отсутствие периодического twitch; отдельно проверить, что shimmer остаётся внутри плашки звания.


---

## v0.6.1 team photo replacement cache — 24.08.2026 [V061_TEAM_PHOTO_REFRESH_20260824]

- Device test showed that the previous Android visual-stability attempt did not remove the periodic whole-screen twitch; that issue is parked for separate diagnosis and must not be marked resolved.
- A team photo replacement was confirmed committed by admin journal and both private/public snapshots, while the device still rendered the previous image. Root cause: legacy ordinary/admin persistent media caches use stable `team:<name>\n<game>` identity and could reuse the old in-memory/disk blob for up to 30 minutes after photo content changed.
- `team-photo-refresh-v061.js` adds a v0.6.1 content-versioned photo layer. Public photo identity follows current snapshot photo source; admin identity uses the protected photo content version. Successful admin photo writes invalidate the same team+game immediately and refetch the current image without waiting for the legacy refresh window.
- The bridge overrides the active ordinary team-detail loader and admin persistent-team loader while leaving v0.5.59 source files unchanged. Admin list/detail images are re-applied after legacy cache writes so stale memory cannot win the race.
- Frontend/menu marker = `20260824-v061-team-photo-refresh1`. Existing Apps Script deployment `Таблица ЧП 1.3` preserved; temporary verifier removed; live mirror synced.
- Device acceptance pending: replace a team photo with different content and verify the new image appears immediately in admin detail and after reopening the ordinary team card.


---

## v0.6.1 periodic screen twitch — 24.08.2026 [V061_SCREEN_TWITCH_WATCHDOG_FIX_20260824]

- User confirmed the prior team-photo replacement fix: a newly uploaded team photo appears after the cache-identity correction.
- Previous rank/compositor attempt did NOT remove the periodic full-screen twitch on the device; do not describe it as verified.
- Actual interval correlation found in `admin-write-v0600-v3.js`: `scheduleLiveSnapshotRefresh(5000)` starts a permanent watchdog, then `PUBLIC_SNAPSHOT_WATCH_MS=20000` reloads public snapshot every 20s, plus a 1s restart after visibility return. This matches the recorded ~20–25s cadence much more closely than rank shimmer.
- v0.6.1 now loads `v061-background-refresh-guard.js` before `admin-write-v0600-v3.js`; it suppresses only that legacy 5s/20s/visibility watchdog callback. Mutation-specific snapshot polling after real admin writes is preserved.
- Frontend/menu marker = `20260824-v061-screen-twitch1`; Telegram menu confirmed. Existing deployment `Таблица ЧП 1.3` preserved; temporary verifier route removed; live Apps Script mirror synchronized.
- Device acceptance still required: keep several ordinary/admin pages open 60–90s without interaction and confirm that the former periodic twitch no longer occurs.


- 24.08.2026 device acceptance: **CONFIRMED** — пользователь сообщил, что периодическое дёргание экрана после screen-twitch watchdog fix исчезло.


---

## v0.6.1 admin edit UX — 24.08.2026 [V061_ADMIN_EDIT_UX_20260824]

- Existing participant edit form is intentionally minimal: editable = CRM `name` + memberships (team/role/game nickname); Telegram name + Telegram ID remain read-only reference only.
- Existing participant edit no longer shows chat state, @username, date V, specnaz U, screens AB, activity AC/AD; those remain visible in the admin participant detail card and stay bot/system-owned.
- Create-participant flow is unchanged.
- Participant and team edit buttons are moved to the top of their admin detail surfaces; team edit appears before the large team photo so no long scroll is required.
- Frontend/menu marker = `20260824-v061-admin-edit-ux1`; Telegram menu confirmed. Existing deployment `Таблица ЧП 1.3` preserved; temporary route removed; live Apps Script mirror synchronized.
- Device smoke pending: open an existing participant edit and team detail on Telegram and verify the compact form/top buttons.


---

## v0.6.1 admin context integrity — 24.08.2026 [V061_ADMIN_CONTEXT_INTEGRITY_20260824]

- Periodic screen twitch fix is device-confirmed by the user.
- Admin navigation invariant strengthened: any participant/team transition originating from admin list/detail/ranking/roster stays on private admin detail pages. Physical Android pointer taps are captured at window level before legacy ordinary routers; ordinary team router also has an admin-context fallback guard.
- Regression after moving the team edit button upward: admin team photo could remain on castle fallback. `v061-admin-context-integrity.js` now re-arms protected photo loading after admin detail render and performs one authenticated `/admin-team-photo` refetch if the normal media bridge still has no image.
- Frontend/menu marker = `20260824-v061-admin-integrity1`; Telegram menu confirmed. Existing deployment `Таблица ЧП 1.3` preserved, temporary verifier removed, live Apps Script mirror synchronized.
- Device smoke pending: participant → team → participant navigation must remain admin-only and team photos must load with the edit button at the top.


---

## v0.6.1 admin UI controls — 24.08.2026 [V061_ADMIN_UI_CONTROLS_20260824]

- Admin team list mirrors ordinary game colors: Royal Kingdom = red cards, Royal Match = blue cards.
- Separate global «Режим редактирования» control is removed. The admin header exposes permanent «Добавить команду» and «Добавить участника» actions; existing records keep their direct edit entry points.
- Admin search now dismisses the mobile keyboard when pointer focus/scroll gesture leaves the active search field; Enter/Escape also release the field.
- Frontend + Telegram menu marker = `20260824-v061-admin-ui-controls1`. Existing Apps Script deployment `Таблица ЧП 1.3` was preserved and the live Apps Script mirror was synchronized before this handoff finalization.
- The first handoff attempt stopped only at changelog syntax validation because the third inserted JS array item lacked a trailing comma; production/frontend/menu work had already completed. This finalizer repairs only changelog/handoff state and does not redeploy Apps Script.


---

## v0.6.1 admin team media/navigation stability — 24.08.2026 [V061_ADMIN_TEAM_STABILITY_20260824]

- Device report: admin team image could appear and later fall back to the castle; occasionally opening a team immediately triggered its edit modal.
- Added `admin-team-stability-v061.js`. Every successful protected admin team image load is cloned into an independent session blob URL and reused as a fallback if legacy media refresh/cache races fail. This covers admin team-list thumbnails and admin team detail photo.
- Team detail edit control is shielded for 850 ms after a new detail DOM is created, preventing Android compatibility/ghost click from opening edit immediately after the navigation tap.
- Frontend/menu marker = `20260824-v061-admin-team-stability1`; existing deployment `Таблица ЧП 1.3` preserved; temporary menu verifier removed; live Apps Script mirror synchronized.
- Device smoke pending: repeatedly open several team cards, return to list, and verify images remain visible and edit opens only on a deliberate second tap.


---

## v0.6.1 admin reliability — 24.08.2026 [V061_ADMIN_RELIABILITY_20260824]

- Device reports combined: many admin team screenshots remained on castle fallback, active-team indicator appeared only after a second tap, and admin save could end in `Failed to fetch` after its single transport retry.
- `admin-reliability-v061.js` now gates `/admin-team-photo` to 3 concurrent requests, coalesces identical requests and dynamically prioritizes team images near the viewport/admin detail. Far-offscreen requests wait instead of flooding the protected admin-data/media chain. Read-only photo requests also get bounded transient retries.
- Visible admin team images are explicitly re-armed through the existing protected media loader, so a failed first render no longer requires a tap to retry.
- `/admin-write` transport/edge failures use bounded retries for network plus HTTP 408/425/429/502/503/504. The exact body and requestId are reused, preserving write idempotency and avoiding duplicate mutations.
- After async admin team detail render, `RoyalActiveTeams.refresh()` is called immediately and once more after a short settle delay, so the active-team mole is present without an extra tap.
- Frontend/menu marker = `20260824-v061-admin-reliability1`; existing deployment `Таблица ЧП 1.3` preserved; temporary verifier removed; live Apps Script mirror synchronized.
- Device acceptance pending: scroll through team list and verify screenshots load as they approach viewport; open an active team and see mole immediately; perform repeated admin saves without `Failed to fetch`.


---

## v0.6.1 music track replacement — 24.08.2026 [V061_CALLOUSED_STRINGS_ORIGINAL_MP3_20260824]

- MIDI-derived Calloused Strings render removed from playlist storage.
- Private track 06 replaced by the user-supplied original MP3 after metadata/artwork removal and loudness normalization to the existing background set.
- Random 6-track playlist behavior and asset identity remain unchanged.

## 26.09.2026 — Telegram membership service-event bridge

- Root cause confirmed from live webhook log for Marina (Telegram ID 7734222503): the raw Telegram `new_chat_member/new_chat_members` update reached the Apps Script endpoint but fell through into the ChatKeeper/Royal CRM route and was rejected as `WRONG_SECRET`.
- Fix prepared in `apps-script-live`:
  - authenticated group `new_chat_member/new_chat_members` -> existing Royal CRM `event=join`;
  - authenticated group `left_chat_member` -> existing Royal CRM `event=leave`;
  - normal group messages, owner-private Golub traffic, Mini App and existing ChatKeeper payloads keep their previous routes unchanged;
  - bridge requires the existing Golub relay query secret before constructing a CRM event;
  - normalized membership events continue through the existing reliable webhook queue, event-key dedupe, core join/leave handler, sorting and logs.
- Regression coverage added in `tests/golub-ingress-resilience.test.mjs`.
- Live data repair performed separately in the admin sheet: Marina row 191, column AF `Состояние чата` set to `В чате` based on the confirmed join service-event.
- Deployment rule: update the EXISTING Apps Script web deployment only; do not change webhook URLs and do not run setup/upgrade functions.



### Изоляция — remote CI подтверждён

Source cd58e56b100034129eaa70bca615317aeca9e1bf: обе Sosiska module workflows38206103451(push) и38206107288(PR) завершеныsuccess. В CI включены54Nodetests,5SQLite/cold-startchecks и новая32-case проверка сохранения существующих маршрутов. Продолжаем после ручного входа Google/Cloudflare; ни deployment, ни secret update не выполнены.


## Передача другому чату — 12.10.2026

Актуальная полная передача: docs/sosiska/HANDOFF_20261012.md. Работать через актуальное Cloud Shell соединение Commander; не повторять неудачные BrowserSSO/device-login попытки. Интеграция не развёрнута, production не изменён.


## 12.10.2026 — доступ восстановлен, исходная интеграция

OAuth согласован на два пространства того же логина, включая Tropical Spoon. Settings/deployments royal-crm-miniapp-api доступны. Productionдоrollout versioned267420-350c-4c10-9d5a-7c9d21e368b4; vars/secrets/settings/deploymentbackup приватно сохранены вCloudShell. В конфигурацию добавлен явный account_id существующегоWorker иkeep_vars=true. Причина pendingmigration upload установлена по Wrangler source: versions upload не применяет DurableObjectmigration; нуженdeploy. Builds logs API отдельно не разрешён текущими OAuth scopes.

Приложение не переносится. План прежний: отдельный/admin-agent внутри существующегоMiniAppWorker, adminэкран в существующемЧП. Для интеграции подготовлен дополнительный server-onlykey в изолированном игровомагенте с сохранением прежнего ключа. SourceSpecnaz-ai b42c719abb953e58541c58eb1b948e713ea84beb, isolatedCI38209491964success. Рабочая веткаsosiska-isolated-runtime-20261012 содержит только эту credentialправку,3tests иCItrigger. Сессию/уровень/историю/боты она не меняет. Пока запись не подтверждаетdeploy. Groqkey дляанализа ещё не установлен; не объявлятьИИготовым без его проверки.


## 12.10.2026 — backend rollout подтверждён; frontend готовится

Доступ восстановлен выбором Tropical Spoon при device OAuth. Existing MiniApp source a4a6cadf89933c9d3b94d878246e378eabca5f16 имеет оба CI success (38209716035/38209719296). В существующем royal-crm-miniapp-api выполнен deploy и первая SQLite migration sosiska-analysis-v1. Version после deploy 6390a57f-81d0-44b5-870f-793301a36aa2; последующий secret update мог создать новую version, смотреть deployments. Резервные settings/deployments до изменения сохранены приватно в Cloud Shell; rollback version ed267420-350c-4c10-9d5a-7c9d21e368b4. Добавлен серверный RM_AGENT_API_KEY; старые BOT_TOKEN/GITHUB_TOKEN/SESSION_SECRET и vars сохранены.

Live проверки: прежний /health HTTP200/version1.41.0; /admin-agent неверная session401, чужой Origin403, OPTIONS204. Это не живой admin acceptance. Изолированный агент source b42c719abb953e58541c58eb1b948e713ea84beb/CI38209491964success,122Node testsPASS: поддержка дополнительного RM_MINIAPP_API_KEY с сохранением прежнего ключа. Version после deploy cd3f7263-a5c1-4db5-a39e-16e60b8be25d, затем secret update. Новый ключ и ключ фасада переданы приватно, не опубликованы. Live health sessionConfigured=true, automatic-verified-service; Mamonovo2candidates, list0watches. Уровень, identity, league, бот Worker и Apps Script не менялись; captures не создавались.

Frontend: отдельный модуль в существующем app-v0600, marker20261012-v061-sosiska1, история изменений дополнена; version0.6.1 сохранена по существующей схеме добавлений. Новые tests проверяют query/hash на двух Telegram redirect этапах и сохранение истории. Публиковать после нового CI. Commander перестал отвечать после backend rollout; commit/push через него не подтверждён. Доставка frontend продолжается GitHub connector с optimistic branch lease; не повторять неизвестный shell push вслепую.

SOSISKA_GROQ_KEY отсутствует. Анализ не объявлять подключённым; требуется ключ провайдера, затем private provider probe и реальная история выбранных владельцем команд. Картинки эмблем и Telegram device smoke остаются ограничениями. Этот раздел заменяет старые формулировки о недоступном Worker и отсутствии backend deployment.


## 12.10.2026 — модуль опубликован в действующем ЧП

PR #40 слит в main, merge 266098191b29140f3bca1ed99d24839f62bd3b87. Source 9eb296ce4edc76b9971c6df6eb7323d8af2560a2: Sosiska CI 38210642939 success; Cloudflare preview Build 4b66bd3f-4601-49ff-9c61-75c773a075c8 success. Публичный app.html фактически открывает app-v0600.html?releaseBuild=20261012-v061-sosiska1; DOM содержит sosiska-v061.css/js. В обычном браузере без Telegram initData показан штатный отказ авторизации; админскую кнопку без настоящей Telegram session не проверяли.

Backend rollout и приватные server credentials подтверждены в предыдущем разделе. Commander после rollout перестал отвечать; два запроса read_process_output/start_process завершились timeout. Frontend commit/push через Shell не подтверждён; GitHub connector доставил source через expected-head lease, затем зелёный CI и merge. Не выполнять force push из оставшегося Cloud Shell checkout: он может содержать незакоммиченные аналогичные правки и старый branch head.

ИИ-анализ НЕ подключён: SOSISKA_GROQ_KEY отсутствует. Для завершения нужен Secret SOSISKA_GROQ_KEY в существующем royal-crm-miniapp-api, проверка провайдера и анализ настоящей уже сохранённой истории. Не создавать watches/captures автоматически ради теста. Owner Telegram smoke: закрыть/повторно открыть ЧП через Голубя Мира, проверить админскую кнопку, поиск/состав/историю, остальные страницы/навигацию; обычный пользователь не должен иметь доступ.

Исторические handoff-утверждения «production не изменён» и «модуль не опубликован» относятся к этапам до rollout; актуально это состояние. Боты и Apps Script не менялись, приложение не переносилось.


## 2026-10-12 — Sosiska combined search filters

See docs/sosiska/SEARCH_FILTERS_20261012.md. Inclusive minimum team points, leader substring, member/entry level/crown ranges and open/closed filters; hydrates all candidates, explicitly reports unchecked data, supports stop/reset and filtered pagination. 63 tests and CI38278637377 PASS. Frontend-only update; autonomous level updater remains deferred.


## 2026-10-13 — Sosiska roster/period usability

See docs/sosiska/USABILITY_PERIOD_20261013.md. Sorted mobile cards, no raw JSON, distinct full-period/roster/journal views, streaming full-history rates per player with reset/join/leave handling. Missing SOSISKA_GROQ_KEY confirmed; AI is not live configured. Crown-to-round conversion remains unproven, no invented formula. 71 tests and real two-team history check passed. Level updater still deferred.


## 2026-10-14 — RM ID / live team card, source prepared

Owner requested RM-only ID binding through Sosiska search/filters, editable autofilled name,
existing screenshot preservation, and only leader/co-leaders (maximum four). Implemented
in branch sosiska-team-live-20261014. See docs/team-live/IMPLEMENTATION_20261014.md.
117 Node tests and 37 workerd checks PASS. Fresh live Apps Script hashes match baseline.
Apps Script candidates in apps-script/team-live are not the live mirror; rollout pending.
No monitoring automatically starts. Original CRM participants remain below the game card.


### RM team live — validation and publication checkpoint

117 Node tests PASS; 37 Worker checks PASS; mobile browser fixtures at 320/390/768px
PASS (no overflow, Back restore, revocation, screenshot toggle, picker draft preservation).
Source candidate unified snapshot contract 1.2.8/schema1.4.3, search1.1.3.
Automatic approval review rejected public git push because implementation authorization
was deemed insufficient for public code/docs publication. Remote branch remains absent;
no workaround attempted. Waiting for explicit owner publication approval. No production
deploy or data change. Live-only Apps Script modules must be preserved during rollout.


## 2026-10-14 — RM ID binding and live leadership cards deployed

Owner explicitly approved publication and rollout. PR51 merged as
08d93956af047bcc8bc75f3430163f523c86e09b; final source5b623c4 had both Sosiska
CI38627102983/38627111014 success, including118 Node tests and37workerd checks.
Mobile fixture320/390/768px PASS; no overflow, max4leader/co-leaders, Back restored,
photo/form draft preserved, revoked-session removal. Real Telegram acceptance remains owner-side.

Existing Apps Script deployment pinned in live private adminData was updated in place
to version117; URL unchanged. Fresh pull before installation matched the reviewed
25/28/29/33baseline; live-only90/99and all unrelated source were preserved.
New38helper and four candidate files installed. M is an optional text source field
with collision/formula guard and header created on first explicit ID write.
No team IDs, watches, captures, bots, webhook URLs or game progress changed by this work.

Live derived data: admin snapshot2026-10-14T19:53:52.013Z advertises
write.gameTeamLink.enabled=true/gameRoyalMatch/version1.0.0; public snapshot
2026-10-14T19:53:34.816Z schema1.4.3/writer1.2.8/search1.1.3.
The successful scheduled refresh supersedes the unsuccessful clasp run attempt,
which returnedNOT_FOUND and was not used as evidence.

Live Worker healthHTTP200/version1.41.0retained. New routes verified by exact
400INVALID_REQUEST(other game),405METHOD_NOT_ALLOWED(POST),204OPTIONS,
401SESSION_MISSING and403ORIGIN_DENIEDresponses. Existing metadata version is
unchanged by this isolated wrapper. Cloudflare management deployment ID was not
read: available OAuth metadata requests returned401/403; no login/secret change attempted.
Frontend app-v0600 actually serves team-live-v061.js/css and the updated picker/editor.
Two redirects preserve Telegram hash and set releaseBuild20261014-v061-team-live1.

Full live mirror synced through the project's normal script as
125e655841d741a38024e1fef96f7cd981454578; both mainCI runs success.
Earlier publication/rollout-pending notes are historical and superseded.


## 2026-10-14 — picker overlay regression fix (source ready)

Owner reported the Find and Bind button appeared dead inside the CRM editor.
Exact cause: the admin modal uses z-index99999; picker backdrop used20000 and
opened underneath it. Earlier browser fixture directly invoked pickTeam without
the real editor backdrop, so it missed the bug. Fix: picker uses100010, blurs the
old active control, and the link button uses the existing admin button styling.
Release marker20261014-v061-team-picker2; no backend, table, bot or agent changes.
118Node testsPASS. Regression browser now uses real editor CSS, modal markup,
window capture routers and Android/iPhone touch handlers; taps the actual button,
checks elementFromPoint owns the visible search, cancels/reopens, filters and binds
while preserving the draft/photo. Publication/runtime evidence follows below.


### Picker regression — published and verified

Source3be776c: both CI38629178787/38629187735 success; Cloudflare preview
Build7fbbc643-3f9a-44a6-83d3-325f2a93242a success. PR52 merged.
The actual-modal browser test fails with old z-index20000 at the Android
elementFromPoint assertion and passes after the fix with Android/iPhone UA
touch handlers, cancellation/reopen, filtering and binding. No page errors.
This closes the earlier fixture coverage gap. Real Telegram recheck belongs to owner.
Frontend release marker20261014-v061-team-picker2. Backend, Sheets and agent unchanged.


## 2026-10-14 — 176 Royal Match emblems (source ready)

Owner supplied the full catalogue in screenshots 2893/2895–2902; IDs0–175 mapped
left-to-right/top-to-bottom. Original transparent WebP artwork, shared emblem
module, Sosiska names/legends/profiles and linked public/admin CRM names added.
Team-live exposes validated logo; profile exposes teamLogo. Zero preserved,
unknown IDs and RK excluded. Bounded viewport loading (two requests), shared
pending reads; auth/session clearing and unlink/rebind guard. No Sheet, watch,
agent progress, bot or secret changes. See docs/team-emblems/IMPLEMENTATION_20261014.md.
122 Node tests and37 real-workerd checks PASS; mobile320/390/768 and actual
Android/iPhone picker fixtures PASS. Publication/runtime evidence pending.


### RM emblems — published and live verification

PR53 merged at001d1e990f8ffb1f99f6e8c2a8818154f453c76a. Final code631f5ad:
CI38637836810/38637844651 PASS, including mobile browser fixtures. Main
CI38637975200 and Pages38637973709 PASS. Workers Build856e60dc-9279-43c3-9469-229ecdab6122
PASS; reported Worker Version934037cc-d3d4-4061-aa36-49a0537da090.
Live GitHub Pages app.html/app-v0600.html and emblem JS/CSS, team-live/Sosiska JS,
and images0/98/136/175 all HTTP200 and byte-identical to reviewed source.
Release marker20261014-v061-emblems1. Live Worker health200/version1.41.0
retained; anonymous RM read401SESSION_MISSING, RK400INVALID_REQUEST. Real
getTeamInfo4298767235 returned integer Logo136; the public projection accepts
Logo and TeamLogo. Protected native Telegram linked-card acceptance remains
owner-side. No source-team IDs, watches, Sheet data, bot settings or secrets changed.
Earlier source-ready/pending notes are historical and superseded.


## 2026-10-15 — RM card/editor regression repair (source ready)

Owner screenshots2905/2907/2908 showed narrow name/description columns, network
errors and repeated loading blocks hiding the admin editor. Root cause: the
live decorator assumed its host was immediately before the photo; dynamically
loaded admin-edit-ux moved the edit button to that position on every mutation.
Both observers remounted/moved indefinitely. Exact original pair reproduced29
card hosts in450ms. A WeakMap photo-to-host association and parent-level
single-host lookup no longer depend on adjacency; editor anchor is the live
card when present. Existing cloned/Back cards reacquire handlers without remount.

Second cause: transport gave team-live/admin-team-live the ordinary5-second
window and incorrectly tried unsupported GAS fallback. Both game routes now
have60seconds, no GAS fallback; shared GET reads retry once only for transient
network/timeout/HTTP failures. No retries for auth, validation or identity errors.
Existing ordinary/auth/admin write timeouts are unchanged. Failure has a human
message, stops the loading placeholder and exposes saved photo; prior successful
data is retained during a failed refresh.

Description spans full width; leadership uses full-width name row plus three
metrics below. Ochki mne/Nurochka/JluceH0K fit one line at320px. Original photos
and names untouched. Cache marker20261015-v061-card-repair1; dynamic edit-loader
cache refreshed. Frontend only; no backend/Sheet/watch/bot/secret changes.

124 Node tests PASS. Existing mobile card/picker fixtures PASS. New regression
uses ALL current entry CSS and actual transport, emblem, edit-UX and photo-form
modules at320/390/768px: single host, editor name/ID/file input preserved,6second
response plus network retry, error/screenshot recovery and refresh PASS, zero
overflow/page errors. Original observer pair fails the single-host assertion.
Publication and native Telegram acceptance pending.


### Card repair — primary rollout and missing-emblem guard

PR54 merged9250ee4d000f8c1870298a5c15a2c75842a88446. Final primary
sourceef34d20: CI38640079051/38640126251 PASS; main38640263757 and
Pages38640262516 PASS. Root-cause regression reproduces29hosts before fix,
then one stable host with actual dynamic edit-UX, photo-form and all entry CSS.
Final narrow follow-up: absent/unknown emblem keeps the team title wide instead
of leaving it in the icon column. Added an explicit no-logo layout assertion
at320/390/768 and refreshed cache marker20261015-v061-card-repair2. Same
124Node checks and mobile response/retry/editor fixtures apply. Final publication
verification follows; native Telegram acceptance remains owner-side.


### 15.10.2026 — final card repair published and verified

PR55 source ec12e88f1f5d36e741da8a31d84d883f441dcfb1 passed PR CI38640508561 and merged as 4dad9db717758ba5e67ffa19000a914e1d74e8e4. Main CI38682392058 PASS (all Node, workerd/isolation and three browser fixtures); Pages38682391614 build/deploy PASS. Public app.html, app-v0600.html, version-v0600.js, team-live-v061.js/css, team-emblems-v061.js, transport-v0514.js and admin-edit-ux-v061.js returned HTTP200 and matched reviewed merge source byte-for-byte. Entry marker confirmed20261015-v061-card-repair2. Missing-emblem title guard is live. No additional backend change in this follow-up. Native Telegram/device acceptance remains pending owner verification; automated browser checks do not claim native Telegram verification.


## 15.10.2026 — RM cards: persistent saved data and background refresh

Owner requested instant last-data rendering when reopening a linked team, followed
by a background fetch and retention on network failure. Previously data survived
only inside the same mounted card; recreating it showed the loading placeholder.
team-live-v061.js now keeps up to100 successful cards per authenticated owner/mode
in localStorage with a memory fallback. Identity includes game, CRM name and game
team ID. No session token is persisted. Cache is shown only behind current session
and current CRM binding; public/admin/users/changed IDs are isolated. Access denial
clears saved data. Each open still revalidates over the existing protected route.
Saved timestamp remains visible while updating and on transient failure. A stale
server response cannot replace a newer saved timestamp. Storage denial/corruption
is nonfatal; unlink removes the card. No polling or backend/Sheet changes.

124Node checks PASS. Browser regressions PASS:320/390/768 layouts, editor/picker,
emblems, plus actual page restart with a new session for the same user, immediate
cache paint before unresolved fetch, background replacement, failed-refresh
retention, user/mode/ID isolation,403/revocation purge, broken/disabled storage and
unlink. New cache fixture is in the full CI workflow. Release marker
20261015-v061-card-cache1. Publication/CI and native Telegram acceptance pending.


### Persistent card cache — verified rollout

PR56 source1806054667d7a227b42b92b54f3d88bc6ba6301b passed full PR CI38683261775, merged586a652e78a85952c3ecfbc9d850e74988b0679e. Main CI38683406683 and Pages build/deploy38683406124 PASS. Public app.html, app-v0601.html, app-v0600.html, team-live-v061.js, version-v0600.js and changelog-v061-latest.js returned HTTP200 and matched reviewed source byte-for-byte. Marker20261015-v061-card-cache1 is live. The new cache regression fails on the previous card source at the immediate reopened-card assertion and passes with the fix. Native Telegram/device acceptance remains owner-side; browser page-restart verification is complete. Earlier publication-pending notes are superseded.


## 15.10.2026 — emoji from the RM emblem in the team-name editor

Owner requested automatic emoji prefix from the numeric game emblem, including
Logo136 => Russia => 🇷🇺 FORTUNA. Added explicit catalogue0–175 mapping in the
existing emblem module, with correct country flags (England distinct from UK),
shared emoji for most colour variants and nearest pictograms where Unicode has
no exact equivalent. No team-name/person-specific rules. Unknown IDs add nothing.
Picker composes the editable name before ordinary Save. An existing linked RM
editor without an emoji gets a protected metadata read (shared/coalesced cache);
only the untouched matching name/ID/game/session/form can be updated. Manual
emoji/name edits survive, no duplicated prefix, no RK reads or mass renames.
No automatic database write: owner reviews the field then uses normal Save.
Leader/photo draft/ID and current card cache remain intact.

125Node checks PASS. New browser fixture covers existing editor, Russia prefix,
slow-response typing/ID races, RK, picker and unknown IDs. Actual Android/iPhone
picker fixture now asserts prefixed selection. Other card/cache/emblem fixtures
PASS. Full CI/publication pending; native Telegram acceptance remains owner-side.
Release marker20261015-v061-emblem-emoji1.


### Emoji rollout and owner correction: no separating space

PR57 merged9a6ac1fb1bf7cbdaa01d4d76654c57fed7855b7e after PR CI38684610520 PASS. Main CI38684751635 and Pages38684751554 PASS. Seven public entry/module/changelog files matched reviewed source byte-for-byte. Owner then explicitly clarified: no space between emoji and name, exactly 🇷🇺FORTUNA. This supersedes the earlier spaced example. Auto-prefill now joins prefix directly to name and removes spacing after an existing leading emoji when initializing an untouched linked editor; manual symbol and internal name spacing remain intact. Tests cover new/existing prefix, repeated bind and internal name spaces. Marker20261015-v061-emblem-emoji2; full follow-up CI/publication pending.


### Emoji no-space format — verified final rollout

PR58 source5e373f5a13477a552adff5b0ccae20adc2aaf7c3 passed full PR CI38685163651; merged20a476318dada49230b350f712a7ef41fd9b0d8f. Main CI38685327283 and Pages build/deploy38685326817 PASS. Public app.html, app-v0601.html, app-v0600.html, team-live-v061.js, team-emblems-v061.js, version-v0600.js and changelog-v061-latest.js returned HTTP200 and matched reviewed source byte-for-byte. Final marker20261015-v061-emblem-emoji2 is live. Final owner format is 🇷🇺FORTUNA with zero separating spaces; internal team-name spaces remain. Existing linked-editor draft normalization and repeated picker selection are covered. No automatic CRM writes; normal Save persists the edited name. Native Telegram/device acceptance remains owner-side. Earlier follow-up-publication-pending note is superseded.


## 15.10.2026 — hide name emoji only beside a loaded linked emblem

Owner confirmed emoji prefill works in Telegram, then reported duplicate emoji +
shield in participant membership pills and CRM team headings (2912/2913). Owner
clarified the condition: only linked teams with an obtained avatar suppress the
name prefix; unlinked teams retain their original emoji name.

The shared emblem renderer now wraps only a leading emoji in a display span.
CSS hides that span only after the actual image load succeeds. Raw textContent,
datasets, full CRM names, editor values, routing and stored Sheet/cache data are
unchanged. Public/admin team headings, membership pills, shared Sosiska names and
live-card titles use this rule. Pending, unknown, failed images and unlinked/RK
teams retain the prefix; image failure, unlink and auth clearing restore it.
No extra game queries, polling or backend changes. Marker20261015-v061-emblem-display1.

125Node checks and six browser fixtures PASS locally. New actual-image regression
covers delayed/successful/broken images, public/admin headings, membership pills,
Sosiska helper/live title, unlinked/RK/unknown fallback, unlink/revocation restore
and unchanged textContent/data-team identity. Existing320/390/768 layouts, editor,
picker, card cache and prefix tests PASS. Full CI/publication pending; native
Telegram acceptance of this display adjustment remains owner-side.


### Conditional emblem/emoji display — verified rollout

PR59 source92304daeaaff5dbf861ceebd5a6194eb64723eb9 passed full PR CI38686868912, merged4f0c091d507aeeb4d0421bb01b2e21172358d844. Main CI38687027724 and Pages build/deploy38687027395 PASS. Eight public entry/module/CSS/changelog files returned HTTP200 and matched reviewed source byte-for-byte. Final marker20261015-v061-emblem-display1 is live. Only linked teams with a successfully loaded actual emblem suppress the display prefix; raw names, editor values, routing and unlinked/failure fallbacks retain the emoji. All six browser fixtures and125Node checks PASS. No backend/data mutation. Native Telegram acceptance of this display change remains owner-side; previous emoji-prefill acceptance was confirmed by owner. Earlier publication-pending note is superseded.


## 15.10.2026 — Sosiska all-time newcomers and departed players

Owner requested «Выбывшие»/«Новенькие» controls for every membership change over
all stored observation history, and red/green roster marking. Existing adjacent-
snapshot joins/exits already used UserId but had no dedicated UI/date event log.
The streaming accumulator now optionally records membership intervals, baseline
identity, first/last observation and latest known member fields. Full-history
frontend opts in; default server/AI statistics payload remains unchanged, with
a regression guarding against membership-event payload inflation. No D1 migration,
new writes/watch jobs, external provider, Apps Script or bot change.

Buttons show unique player counts after complete pagination; each list retains
all observed entries/exits and interval dates, including newcomers who later left
and players who returned. Baseline-only members are not newcomers; same-name
players remain separate by UserId. Current newcomers/returnees are green; absent
historical members appear separately in red without inflating current roster
counts. Historical player click opens recorded activity, not a current-roster
profile lookup. Current live membership determines present/absent UI status.
Date labels explicitly mean changes observed between checks, not exact departure
times; left vs excluded is not inferred. Partial/gapped history is marked as such.
A manual capture refreshes team+period, preserving the chosen roster/history tab.

127Node checks PASS. New browser regression at320/390/768 with all actual entry
CSS covers multi-page history, joins/exits/returns, same names, baseline, red/green
roster, historical drilldown, reopen without duplicates, empty/gapped history and
zero overflow. Full CI/publication pending; native Telegram acceptance owner-side.
Marker20261015-v061-membership1; current version0.6.1 patch.


### Sosiska membership history — verified rollout

PR60 final source92dd83ea480ee2645b82818a441206dd6ce9ac0f (initial d05ad12 plus Russian caption polish) passed PR CI38741642724, mergedceb7b3918df74f268383287b246a0405e8a61a5b. Main CI38741868046 and Pages build/deploy38741867219 PASS. All127Node tests,37workerd/isolation checks and seven browser fixtures PASS. Eight public entry/Sosiska/bundle/CSS/version/changelog files returned HTTP200 and matched reviewed source byte-for-byte. Marker20261015-v061-membership1 is live. Mobile320/390/768 fixture includes capture-refresh with selected membership tab retained; screenshot visually reviewed for readable green return/new and red departed cards. Existing data/history are reused, no new watch activated. Shared membership detail is opt-in; existing backend AI statistics remain unchanged by default. Native Telegram acceptance remains owner-side. Earlier publication-pending note is superseded.


## 15.10.2026 — Sequential admin save repair

Owner video2921 shows Save waiting at least94 seconds. Reproduced frontend stale
snapshot race: a GET started before a successful rename overwrote the committed
name/revision, breaking later saves until reload. Shared client and writer now
guard commit generations, including late consumers of an old in-flight GET.
Known successful rename aliases and local participant memberships follow the new
team name; authoritative server revisions/conflict checks remain mandatory.
Complete returned records commit immediately even without queue metadata.
Unchanged team edits send no write. Removed permanent20s snapshot watchdog;
startup/focus refresh and bounded post-write confirmation remain.

A delayed acknowledgement gets one bounded same-requestId receipt probe using
the existing Apps Script deduplication protocol. Frozen photo/payload are identical;
ambiguous explicit retry keeps the original ID, and changed payload is blocked
until that result is resolved. Form controls are locked during submission, and a
late result cannot close/update another editor. Permanent errors are not replayed.

128Node checks and new actual-module browser fixture PASS; old writer FAILS the
same stale-response reproduction. Fixture includes sequential rename/save,
local membership aliases, no-op, missing queue metadata, lost receipt and frozen
photo. CI now runs eight browser fixtures. Existing legacy admin-delete harness
fails3 tests identically on baseline because it expects12 team columns instead
of13; no Apps Script changes are part of this patch. Full CI/publication pending.
Marker20261015-v061-admin-save1; dynamic writer/photo cache keys explicitly bumped.

Actual Apps Script latency remains unmeasured: Cloud Shell device is offline.
Do not claim server waiting or every save duration solved. No live GAS/Sheets
mutation or backend deployment. Native Telegram acceptance remains owner-side.


### Sequential admin saves — verified frontend rollout and server follow-up

PR61 source1de188d668867568d6e4e0884efc6f0f8db1bc6e passed full PR CI38747435272 and merged2183933a9dca7338df34983dc33745e4ed99bf95. Main CI38747719484 and Pages build/deploy38747720846 PASS:128Node tests,37workerd/isolation checks and eight browser fixtures. All eight public entry/admin-client/writer/photo/version/changelog files returned successfully and matched reviewed source byte-for-byte (one transient URL failure succeeded on retry). Marker20261015-v061-admin-save1 is live. Native Telegram save duration/acceptance is still owner-side.

Cloud Shell reconnected during rollout. Backed up local Apps Script source, ran clasp status then clasp pull (41 files), and verified SHA-256 of live files07/29/30/32/33 matches the existing repository mirror. No live source or deployment change. Exact execution latency remains unmeasured: processes API returned403 insufficient authentication scopes; clasp logs reports no configured GCP project; read-only preflight invocation did not establish execution and returned storage NOT_FOUND through stderr despite CLI exit0. No permission expansion or synthetic CRM mutation. Earlier offline-only explanation is superseded by these observed access limitations. Frontend stale-state failure is reproduced/fixed; do not claim the entire Google latency issue solved.


## 15.10.2026 — Admin photo write conflicts and membership read cost

Owner reports approximately30-second saves after the previous improvement;
screenshot also shows TEAM_PHOTO_STORE_FAILED. Exact message originates in
file32 while storing bytes in private GitHub media, before CRM source mutation.
Fresh clasp status/pull confirms files32/33 equal the reviewed baseline.
A temporary random-token, expiring diagnostic on the existing pinned deployment
measured GitHub repository GET380ms, media directory GET1242ms and Sheet read532ms;
a second probe created/deleted an isolated temporary media file (HTTP201/200,
2203ms). Current token has push permission and primary quota remaining4723.
These probes do not prove the earlier failure was a409 or rule out transient
secondary limits; no actual team or membership was changed by diagnostics.

Source fix: media upsert compares real Git blob SHA and skips identical content;
409 and SHA-related422 conflicts re-read SHA and retry identical bytes, at most
three PUT attempts. Auth, rate limits and other failures are never blindly retried.
Rename cascade and decorated membership repair each read E:AA once instead of
ten slot-specific calls. Only the same matching source cells are written; game,
ambiguity, suffix, journal/revision/locking and photo-first semantics are retained.
Eight focused regressions PASS, including signed byte hashing, no-op media,
immutable conflict retries, bounded/permanent failures and all-five-slot isolation.
Full CI and actual server rollout are verified below. Exact end-to-end latency improvement
is unmeasured; do not claim every30-second wait or photo failure solved.
Marker20261015-v061-admin-media2. Temporary diagnostic source/route must be
removed before final deployment; live mirror and publication checkpoint required.


### Admin media save speed — verified live rollout

PR62 sourcef5a2a473bfa6134fc64fe478c1ce692ae277a847 passed full PR CI38780079496,
mergedd73fd24595c59eda067cc55d239f8de018f21824. Main CI38780473710 and Pages
38780473578 PASS:136Node checks,37workerd/isolation checks, eight browser
fixtures. All eight public entry/admin-client/writer/photo/version/changelog
files match reviewed source byte-for-byte. Marker20261015-v061-admin-media2 live.

After CI PASS, installed only reviewed files07/17 into the existing pinned Apps
Script deployment, preserving all other live modules and deployment URL. Live
isolated media validation: first write1127ms, identical bytes283ms with
unchanged=true (no PUT), cleanup confirmed. Live membership read comparison:
ten existing slot requests3748ms, one E:AA request452ms; reconstructed all-five-
slot values were identical. These are individual-stage measurements, not a full
Telegram save or proof that the owner's earlier failure was a409.

Temporary random-token/expiring diagnostic core branch and file91 were removed
before final deployment121. Fresh pull verifies no temporary route/file remains
and the two reviewed source SHA-256 values match runtime. Existing diagnostic90,
webhooks, bot source, source data and user photos retained. Only isolated private
media probe files were created and removed; no synthetic CRM team writes.
Standard sync-live-apps-script-to-github.sh then succeeded: mirror commit
a894eb1 updates only LIVE_MIRROR_MANIFEST.md; files07/17 already equal deployed
source. Previous publication/rollout-pending note is superseded. Native Telegram
end-to-end duration and photo acceptance remain owner-side.

Additional legacy snapshot/endpoint harness:10/11 passed; one unchanged test
still asserts entry-v1290 although current Wrangler already uses entry-v1420.
This baseline test drift is unrelated to this patch and outside the required CI.


## 15.10.2026 — Readable Sosiska reports and compact hourly profile

Owner screenshots show raw Markdown tables/English field names, wrapped clock
labels/rates and a long expanded full-period roster. Frontend now escapes model
HTML and renders a small Markdown subset (headings, emphasis, lists); old tables
become collapsed labelled row cards. Full-period player roster is collapsed by
default, with per-team open state retained through metric/player rerenders.
Opening a historical player's activity expands the roster automatically. Hourly
buttons have bounded50px height, no shared button margins/padding, one common
unit label and unbroken clock/rate text. Hour click/details and missing-vs-zero
semantics remain intact. Single-team duplicate report text is omitted; differing
legacy per-team report is available in a disclosure.

Only final AI calls receive a readable Russian report contract: four short
sections, at most five key players, Russian terminology, no field dump/tables,
explicit Moscow period boundaries and source-over-summary precedence. Internal
chunks retain raw UserId for correct identity. Final single-team overview reuses
the report grounded in verified period statistics instead of another rewrite.
Comparison still includes every selected team; model/keys/providers unchanged.
Existing stored prose is never silently rewritten or translated. A new analysis
run is required for the new language contract. Prompt instructions reduce but
do not prove absence of hallucinations; no real-provider acceptance claimed.

138Node checks PASS. New browser fixture with all real entry CSS at320/390/768
verifies50-player default collapse/state,24compact cells, one-line clock/rates,
no horizontal overflow, hour drilldown, safe HTML escaping and old/new report
rendering. Membership fixture PASS; chart/history fixture result recorded in
rollout checkpoint. Both hourly and clean new-report screenshots reviewed.
Verified rollout recorded below; marker20261015-v061-readable-analysis1.
No Apps Script, CRM source data, bot prompt, watch activation or game changes.


### Readable Sosiska analysis — verified publication

PR63 final source68e8f2aadc3d1bb025248e92a8b515926299e8b1 (initial760160a)
passed PR CI38783830515 and mergedcf877359bdd01eed48bb15ba04d7fe7bab53b078.
Initial CI caught a fixture waiting on the old DOM during report refresh; fixed
the wait to require the new text and completed render, without production changes.
Main CI38784113024 and Pages38784110122 PASS:138Node tests,37workerd/isolation
checks and nine browser fixtures. Both additional801-snapshot chart/history
fixtures also PASS (zoom/pan/keyboard/pinch/player isolation). All eight public
entry/Sosiska/bundle/CSS/version/changelog files match reviewed source bytes.
Marker20261015-v061-readable-analysis1 is live.

Worker publication independently confirmed by production Cloudflare Workers
Builds check116591812617 for the exact merge SHA:success, build
bf72353b-1593-49c1-a700-9fb6bda97597, Version ID
19e6402c-51f1-40bd-b088-a017f326122e (completed18:16UTC).
Health returns200/legacy1.41.0 with a browser User-Agent and frontend Origin;
health remains delegated to the existing wrapper and is not the release marker.
Python's default User-Agent received Cloudflare1010, not an application failure.

Manual pinned-source deploy was started after CI PASS, then Commander stopped
responding; its process2970 result and active-version/binding comparison were
not recovered. Before deployment, all13bindings and active version
bf57982d-f513-456c-837e-6899dbcf1ba7 were backed up privately. The manual
source68e8 and merged source have identical runtime code; production Workers
Builds success and its version above supersede the earlier unconfirmed-rollout
note. Do not blindly redeploy on resume; inspect /tmp/readable-worker-* receipts
and current management version if needed. No secret values copied into docs.

Final model instruction applies on a NEW analysis run. Existing stored prose
retains its facts/text and gets safe layout only. No real-provider or native
Telegram semantic acceptance is claimed; owner should rerun the analysis to
review the new Russian report. No new watches, game state, CRM writes, Apps
Script deployment or bot prompt changes in this task.

### RM missing emblem repair15.10.2026
15 tracked empty WebPs restored from original supplied catalogue screenshots.
Emblem image URLs now include version20261015-emblem-repair1. Existing valid
assets unchanged. CI enforces complete RIFF/WebP files and real browser decode
of every catalogue image; no backend or CRM data change.

### One-line team directory titles15.10.2026
Directory title occupies full card width above screenshot/active-team badge.
Names from owner screenshots fit one line at320/390/768. Extreme-length names
use ellipsis with unchanged raw CRM identity. New full-CSS browser regression
included in CI. Release marker20261015-v061-team-title1.

### Bounded team-card refresh15.10.2026
Marker20261015-v061-team-load1. Whole frontend live-card/helper reads bounded45s;
slow status10s; backend current CRM auth/body15s + game/body25s. Pending reads
release on timeout, late answers cannot overwrite fresh cache, saved cards stay
visible and refresh recovers. Busy session gets separate429 explanation without
immediate replay. Agent source confirms snapshots/cards serialize on one session;
actual FORTUNA capture overlap is unverified (no connected Commander devices).
142Node tests and new loading plus existing cache/card/emblem browser tests PASS.
