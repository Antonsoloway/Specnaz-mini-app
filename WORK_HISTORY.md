# Royal CRM / «Таблица ЧП» — PUBLIC WORK HISTORY

> Обезличенный журнал технических изменений для публичного репозитория.
> Новые записи добавляются сверху.
> Подробные production evidence, персональные данные, request IDs, data hashes,
> номера строк и before/after payload хранятся только в приватном operational
> handoff и admin journal.

## 2026-08-23 20:14+03 — v0.6.1: snapshot startup resilience

**Симптом:** после успешной Telegram-авторизации периодически появлялся startup
screen `Данные пока не загрузились` с browser network error `Failed to fetch`.
Проблема не была связана с закрытием Google Sheets: auth уже проходил, а сбой
возникал на последующем public `/snapshot` request.

**Корневая причина:** shared `transport-v0514.js` давал `/auth` один transient
retry, но `/snapshot` выполнялся только одной попыткой. Краткий сетевой сбой
между Telegram WebView и Cloudflare Worker сразу переводил startup в degraded.

**Исправление:**
- `v061-runtime-compat.js` обновлён до `0.6.1-runtime.2`;
- только Worker `/snapshot` получает bounded retry с коротким backoff при network
  failure и HTTP 429/502/503/504;
- после исчерпания первой серии lifecycle `snapshot-error` запускает один
  automatic background `reloadSnapshot()`, поэтому успешное восстановление
  закрывает degraded startup без обязательного нажатия `Повторить загрузку`;
- auth/admin write/admin data/media routes этим bridge не меняются;
- `app-v0600.html`, `app-v0601.html`, `app.html` и changelog получили marker
  `20260823-v061-snapshot-resilience1`, чтобы Telegram WebView запросил свежий
  runtime;
- `changelog-v0601.js` дополнен этой правкой.

**Rollout boundary:** frontend опубликован в GitHub main. Device acceptance —
несколько полных закрытий/открытий Mini App через Telegram; если сеть реально
недоступна после всех bounded attempts, ограниченный режим остаётся штатным
fallback.

## 2026-08-23 14:12 — v0.6.1 теперь видна в самом Mini App

**Задача:** сделать номер фактически выпускаемой версии видимым пользователю,
чтобы по самому приложению было понятно, что загружен свежий runtime, а не
старый v0.6.0 UI.

**Исправление:**
- общий runtime `app-v0600.html` теперь объявляет build `0.6.1`;
- стартовая заставка и главный version badge показывают v0.6.1;
- `changelog-v0601.js` подключён прямо из активного runtime с отдельным
  cache-bust и формирует первую карточку истории v0.6.1 поверх сохранённой
  истории v0.6.0 и предыдущих версий;
- `version-v0600.js` переведён в visible guard v0.6.1 и дополнительно загружает
  v0.6.1 changelog/profile-team-link при необходимости;
- `app.html` и `app-v0601.html` получили новый release marker
  `20260823-v061-visible-1`, чтобы Telegram WebView не оставался на старом
  release URL;
- в карточку v0.6.1 добавлены только уже выполненные изменения, включая
  переход профиль → команда и текущую серверную работу по восстановлению
  Telegram-аватаров.

**Проверка:** после записи повторно прочитан `app-v0600.html` из GitHub main:
`__ROYAL_BUILD__=0.6.1`, visible badge `v0.6.1`, подключены
`changelog-v0601.js?v=20260823-v061-visible-1` и
`version-v0600.js?v=20260823-v061-visible-1`.

**Правило дальше:** каждое принятое изменение в рамках v0.6.1 одновременно
добавляется в первую карточку `changelog-v0601.js`; новая версия не считается
видимой пользователю, пока номер в runtime badge и «Текущая версия» истории
не совпадают.

## 2026-08-23 13:38 — v0.6.1: восстановление Telegram-аватаров без snapshot fileId

**Задача:** исправить карточки участников, у которых в Mini App показывалась
буквенная заглушка, хотя в Telegram у пользователя есть фото профиля.

**Диагноз:** свежий snapshot подтверждает, что у части действующих участников
`avatarFileId` пустой. Старый `/avatar?telegramId=...` считал это окончательным
отсутствием аватара и возвращал `AVATAR_NOT_FOUND`, поэтому frontend после
нескольких retry оставлял placeholder. Persistent IndexedDB cache и DOM
карточек сами по себе не были причиной.

**Исправление:**
- добавлен Worker wrapper `entry-v1310.js` / version `1.31.1`;
- штатный avatar route остаётся первым и не меняется для записей с fileId;
- только после authenticated `AVATAR_NOT_FOUND` Worker повторно подтверждает
  участника через разрешённый snapshot и делает on-demand
  `getUserProfilePhotos` через Telegram Bot API;
- после `getFile` Worker сам проксирует image bytes авторизованному клиенту;
  bot token, Telegram file path и discovered fileId в браузер не передаются;
- массового avatar prewarm нет, frontend продолжает использовать общий
  persistent cache и прежний network concurrency limit;
- `worker/wrangler.toml` переключён на `src/entry-v1310.js`.

**Неудачный промежуточный подход:** первая версия wrapper пыталась передать
новый Telegram fileId в legacy `/avatar?fileId=...`. Дополнительная проверка
цепочки показала, что legacy route намеренно разрешает только fileId, уже
присутствующие в snapshot, поэтому новый live fileId получил бы
`AVATAR_NOT_ALLOWED`. До финализации flow исправлен на direct server-side
proxy после той же snapshot participant allow-list.

**Коммиты:** `d5b8055` — первичный Worker wrapper; `a34b6bd` — активный Worker
entrypoint; `647a4c2` — исправленный live-photo proxy; `2ffcd6a` — актуальный
`CURRENT_STATE.md` с v0.6.1 avatar hotfix.

**Проверка:** проблемный класс записей подтверждён на актуальном snapshot;
финальный Worker-файл прошёл `node --check`, цепочка legacy avatar authorization
прочитана до базового handler. Если Telegram не отдаёт фото из-за privacy/API,
сохраняется прежний 404/placeholder contract.

**Граница rollout:** repo обновлён. Cloudflare production `/health` и реальный
Telegram WebView после auto-build в этом чате независимо не подтверждены;
GitHub commit не считается production-доказательством.

## 2026-08-22 09:30 — публичный handoff синхронизирован и обезличен

**Задача:** привести публичную документацию к фактическим версиям frontend,
Worker и Apps Script, не публикуя персональные или операционные идентификаторы.

**Изменено:**
- CURRENT_STATE.md обновлён до preview build 20260821-2350;
- зафиксированы Worker 1.28.0, Unified Snapshot Writer 1.2.7,
  atomic membership write и direct unified refresh;
- RELEASE_RULES.md дополнен правилами public-docs без PII, синхронного
  handoff и раздельного подтверждения repo/production;
- публичный WORK_HISTORY.md заменён краткой обезличенной историей;
- согласованные public credits и технические названия полей не менялись.

**Граница:** Git-история не переписывалась; production, Google Sheets и
приватный data-repo не изменялись. Удаление сведений из старых Git-коммитов
требует отдельного согласованного history-rewrite.

**Проверка:** node --test tests/*.test.js — 28/28 pass;
git diff --check чист.

## 2026-08-22 00:32 — immediate snapshot dispatch подтверждён

**Диагноз:** Apps Script one-off clock задаёт минимальную задержку, но не
гарантирует немедленный запуск. Первый timing smoke фактически дождался
пятиминутного fallback.

**Исправление:**
- Worker 1.28.0 после committed /admin-write запускает отдельный
  HMAC-signed admin-snapshot-refresh через ctx.waitUntil();
- installable Sheet edit/change triggers выполняют direct unified flush;
- one-off clock и recurring trigger сохранены как durable retry/fallback;
- Unified Snapshot Writer обновлён до 1.2.7.

**Проверка:** app write обновил public/private snapshots примерно за
27–35 секунд; ручное изменение Sheet — примерно за 30 секунд. Итоговые
live Sheet, public и private snapshot совпали.

## 2026-08-21 23:16 — последовательные admin-правки защищены от stale snapshot

**Диагноз:** повторно открытая форма могла получить старую revision, пока
private snapshot ещё не подтвердил предыдущий committed request.

**Исправление:** build 20260821-2310 сохраняет optimistic committed payload
авторитетным до подтверждения всех pending operations в private journal.
Отстающий snapshot больше не может вернуть старую карточку между
последовательными правками.

**Проверка:** две последовательные Android-правки без ожидания snapshot
создали отдельные journal operations; live Sheet и последующий private
snapshot сошлись на финальном состоянии.

## 2026-08-21 23:03 — atomic membership write подтверждён

**Диагноз:** прежняя последовательная запись membership cells могла оставить
partial state, если role validation отклоняла одно значение после уже
сохранённых соседних ячеек.

**Исправление:**
- все пять membership slots записываются одним range write;
- role validations временно снимаются только на время операции;
- при ошибке откатываются исходные values и validation rules;
- transient admin-data reads получили bounded retry.

**Проверка:** production smoke создал ровно одну journal operation;
live Sheet и private snapshot подтвердили одно итоговое membership-состояние.

## 2026-08-21 22:03 — admin writes переведены на commit-first

**Диагноз:** mutation ждала GitHub snapshot export после уже выполненной
Sheet-записи, а общий ScriptLock мог удерживаться во время сетевого I/O.
Это создавало ложные transport timeout и WRITE_BUSY.

**Исправление:**
- create/update/delete сначала завершают Sheet mutation, journal и
  idempotency cache;
- ответ возвращает committed result без ожидания snapshot;
- Sheet capture остаётся под коротким ScriptLock;
- GitHub publication выполняется после release и отдельно сериализуется;
- frontend применяет committed result сразу и подтверждает его в фоне.

**Проверка:** installer обновил только существующий Apps Script deployment;
новый deployment и самостоятельные CRM mutations не создавались.

## 2026-08-21 20:24 — admin write endpoint закреплён fail-closed

**Диагноз:** автоматически определённый Apps Script service URL мог указывать
не на фактически используемый deployment. В результате Worker получал HTML/404
вместо ожидаемого JSON.

**Исправление:**
- installer выбирает один существующий deployment и внедряет его точный
  /exec до push;
- private snapshot публикует endpointPinned=true и доказанный source;
- Worker разрешает edit/delete только при полном pinned contract;
- fallback service URL остаётся диагностическим и read-only.

**Проверка:** non-mutating route check вернул ожидаемый write-contract;
данные участников и команд во время repair не менялись.

## 2026-08-21 14:21 — guarded delete write.5 опубликован

Добавлены два узких destructive flow:
- participant delete только при live AF=Вышел;
- team delete только при live L=Неактивен, E=0 и нулевых membership refs.

Обе операции требуют confirm, optimistic revision, повторную server-side
проверку под lock и admin journal. Participant delete сохраняет formula
arrays T и W:AA; team delete сохраняет formula columns E:L.
Реальные удаления при rollout не выполнялись.

## 2026-08-20 — v0.6 admin preview расширен

Последовательно добавлены:
- deterministic hybrid search по private participants/teams;
- единый persistent media cache для normal/admin mode;
- normal-style participant и team detail;
- participant memberships отдельными ordinary-style pills;
- рейтинги participants U/AB/AC/AD и teams E/F/H/I/J/K;
- admin entry внутри self-profile;
- navigation guards, не позволяющие legacy public handlers перехватывать
  переходы из admin context.

Остаётся обязательный Telegram WebView smoke на Android и iPhone/iPad,
особенно для roster navigation, rankings, Back state и media cache.

## 2026-08-19 — стабильная v0.5.59 укреплена

- включено каскадное переименование team identity по пяти membership slots;
- восстановлена публичная синхронизация после validation-safe repair;
- team photos переведены на cache-first с background refresh;
- откатан нестабильный iOS fast-path; сохранён source-preservation guard;
- /auth получил отдельное 12-second окно и один transient retry;
- Связаться для участников без username переведено на Worker/bot flow;
- contact actions восстанавливаются после Back/rerender.

## 2026-08-18 — постоянный медиакэш и стабильная навигация

- IndexedDB cache-first для avatars/team photos;
- avatar network concurrency ограничена;
- своя avatar восстанавливается без мигания placeholder;
- forward navigation открывает новый экран сверху;
- Back восстанавливает прежнюю scroll position;
- активные команды получают source-of-truth status, gold decoration и
  отдельный каталог с фильтрами.

## 2026-08-17 — hybrid search и server search keys

**Корневая причина старой проблемы:** Worker sanitizer выбрасывал
searchKeys и searchIndexVersion.

**Исправление:**
- Worker сохраняет server search keys после sanitization;
- frontend использует локальный поиск ИЛИ searchKeys;
- поиск остаётся deterministic, без edit-distance и тяжёлого prewarm;
- изменение server algorithm требует повышения searchIndexVersion.

## Правила ведения публичного журнала

- Новые записи добавлять сверху.
- Фиксировать причину, изменение, проверку и rollout boundary.
- Различать repo updated, build passed, Apps Script pushed и production verified.
- Не скрывать неудачные подходы, если их повторение опасно.
- Не публиковать реальные имена, Telegram ID/handles, request IDs, data hashes,
  номера персональных строк, exact private endpoint или before/after payload.
- Использовать обезличенные сценарии и агрегаты; согласованные public credits
  остаются в отдельном блоке проекта.

---

### 23.08.2026 17:50+03 — v0.6.1 music menu final recovery [V061_MUSIC_MENU_FINAL2_20260823]

**Контекст:** аватары уже подтверждены как исправленные. Music root fix опубликован, но rollout bot menu требовал отдельной проверки. Предыдущий recovery дошёл до live mirror sync, затем shell интерпретировал backticks внутри unquoted heredoc и открыл интерактивный Python вместо записи handoff.

**Выполнено:**
- повторно проверен live Apps Script и единственный существующий deployment `Таблица ЧП 1.3`;
- `MINIAPP_setupBotAppMenu` вызван через временный tokenized web-app route;
- проверяется фактический `getChatMenuButton.web_app.url` на marker `20260823-v061-music-live3`;
- temporary route удалён вторым push/deployment update;
- `apps-script-live/` синхронизирован после удаления route;
- `CURRENT_STATE.md` и `WORK_HISTORY.md` обновлены безопасно через Python, без shell interpolation.

**Результат проверки Telegram menu:** `CONFIRMED`. Final acceptance музыки — device smoke после полного закрытия Mini App и нового открытия через кнопку бота.

---

### 23.08.2026 18:00+03 — переход из своей карточки в команду [V061_SELF_PROFILE_TEAM_LINK_20260823]

**Запрос:** с главной страницы Mini App из собственной карточки профиля открыть свою команду нажатием на membership-плашку.

**Выполнено:**
- расширен только v0.6.1-модуль `profile-team-link-v061.js`; legacy renderer v0.5.59 не изменён;
- `.self-membership` после рендера получает `data-team` с encoded `[team, game]`, keyboard semantics и touch-friendly behavior;
- существующий ordinary team router и `team-identity-fix.js` сохраняют точную identity `name + game`;
- MutationObserver повторно декорирует профиль после auth/snapshot rerender;
- `app-v0600.html`, `app-v0601.html`, `app.html` и v0.6.1 changelog переведены на marker `20260823-v061-self-team-link1`;
- Telegram bot menu marker применён через временный tokenized web-app invoker и temporary route удалён; verification = `CONFIRMED`;
- live Apps Script mirror синхронизирован после rollout.

**Проверка:** repo/runtime delivery подготовлены; финальный device smoke — на главной нажать плашку своей команды и убедиться, что открылась карточка именно нужной игры.

---

### 23.08.2026 18:40+03 — Sheets lockdown + webhook credential staging [SECURITY_SHEETS_WEBHOOK_STAGE_20260823]

**Выполнено:** обе production-таблицы закрыты от anonymous link access; live Apps Script сохранён на существующем deployment; webhook credential вынесен из публичного кода в Script Properties; включено dual-secret окно ротации без остановки действующих webhook-событий; live mirror после push синхронизирован обратно в GitHub.

**Важно:** новый secret нигде не коммитится и не пишется в handoff. Старый public credential остаётся временно валиден только как `previous` до ручного переключения ChatKeeper, после чего должен быть удалён финализатором.

---

### 23.08.2026 — webhook secret rotation finalized [SECURITY_WEBHOOK_ROTATION_FINAL_20260823]

После переключения ChatKeeper на новый secret удалён temporary previous credential из Script Properties. Live Apps Script повторно синхронизирован в GitHub, hardcoded credential в current source отсутствует, существующий deployment сохранён.

---

### 23.08.2026 — повторные ссылки истории спецназа v2 [V061_HISTORY_LINK_RELIABILITY2_20260823]

**Диагноз:** первая frontend-попытка не прошла device smoke. Старый Specnaz router остаётся document-level click handler, а v1 одновременно использовал pointer/click и delayed повтор `openTelegramLink`, что могло конфликтовать с Telegram chat overlay. Кроме того, frontend-изменение требует нового bot-menu URL, иначе Android WebView может оставить прежний HTML/script cache.

**Исправление:** новый отдельный v0.6.1-модуль получает физический touch на window capture раньше legacy-router, выполняет один native Telegram transition на один tap, не делает timer retry и переармируется после возврата. `app.html`, `app-v0601.html`, runtime script marker и Telegram menu переведены на `20260823-v061-history-link2`.

**Rollout:** existing Apps Script deployment `Таблица ЧП 1.3` сохранён; temporary menu invoker удалён; live Apps Script mirror синхронизирован; Telegram menu verification = `CONFIRMED`.

**Acceptance:** pending повторный Android Telegram smoke по нескольким history links подряд.


---

### 23.08.2026 — единая карточка участника во всём v0.6.1 [V061_PARTICIPANT_IDENTITY_20260823]

**Запрос:** на всех страницах приложения, включая админ-режим, показывать CRM-имя, имя Telegram и Telegram @username/ссылку при наличии.

**Выполнено:**
- создан v0.6.1-only identity decorator `0.6.1-participant-identity.4` без изменения legacy v0.5.59 renderers;
- identity достраивается из public snapshot и, для admin-only записей, из cached protected admin snapshot;
- существующие @username стали единым независимым Telegram action; при наличии реального @username fallback `Связаться` не дублируется;
- admin list/detail/team member/ranking дополнены теми же identity fields; raw ID остаётся только в admin detail;
- CSS не даёт rank/achievement strip перекрывать имя на узких Android экранах;
- `app.html` → `app-v0601.html` → `app-v0600.html` переведены на `20260823-v061-identity2`; Telegram menu verification = `CONFIRMED`;
- changelog v0.6.1 дополнен.


---

### 23.08.2026 — расширение карточек героев и истории спецназа [V061_SPECNAZ_LAYOUT_20260823]

**Запрос:** после добавления полной participant identity убрать наложение имени/звания/Telegram-данных; если контент не помещается, увеличивать карточку. То же применить к истории спецназа и сделать карточки шире.

**Выполнено:**
- создан v0.6.1-only `specnaz-layout-v061.css`;
- hero/history lists выходят ближе к краям panel без изменения глобального shell;
- hero card на телефонах переведён в grid: место + avatar остаются слева, identity получает полноценную ширину, achievement/rank идёт под именем, score — отдельной строкой;
- history head на телефонах переведён в grid с отдельной строкой rank и переносимыми identity fields;
- длинные имена, username, Telegram display name, team/message и scoreline не должны обрезаться/накладываться;
- `app.html` / `app-v0601.html` / runtime CSS cache переведены на `20260823-v061-specnaz-layout1`;
- Telegram menu cache обновлён, live Apps Script mirror синхронизирован.


---

### 23.08.2026 — выравнивание ачивок героев спецназа [V061_SPECNAZ_ACHIEVEMENT_ALIGN_CONFIRMED_20260823]

- Исправлен CSS v0.6.1: общий stack admin/rank/MAYAK прижат вправо, future-slot наследует ту же ширину/выравнивание.
- Release marker `20260823-v061-specnaz-layout2` опубликован в app entrypoint/runtime.
- Исправлен сам deployment verifier: старый shell pipeline сочетал pipe с heredoc, поэтому Python получал не JSON ответа, а собственный stdin и всегда завершался ошибкой.
- Корректная повторная проверка подтвердила bot menu `20260823-v061-specnaz-layout2`; temporary invoker удалён и live mirror синхронизирован.
