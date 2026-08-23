# Royal CRM / «Таблица ЧП» — PUBLIC WORK HISTORY

> Обезличенный журнал технических изменений для публичного репозитория.
> Новые записи добавляются сверху.
> Подробные production evidence, персональные данные, request IDs, data hashes,
> номера строк и before/after payload хранятся только в приватном operational
> handoff и admin journal.

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
