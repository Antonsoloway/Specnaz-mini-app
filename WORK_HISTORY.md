# Royal CRM / «Таблица ЧП» — PUBLIC WORK HISTORY

> Обезличенный журнал технических изменений для публичного репозитория.
> Новые записи добавляются сверху.
> Подробные production evidence, персональные данные, request IDs, data hashes,
> номера строк и before/after payload хранятся только в приватном operational
> handoff и admin journal.

## 2026-08-23 13:38 — v0.6.1: восстановление Telegram-аватаров без snapshot fileId

**Задача:** исправить карточки участников, у которых в Mini App показывалась
буквенная заглушка, хотя в Telegram у пользователя есть фото профиля.

**Диагноз:** свежий snapshot подтверждает, что у части действующих участников
`avatarFileId` пустой. Старый `/avatar?telegramId=...` считал это окончательным
отсутствием аватара и возвращал `AVATAR_NOT_FOUND`, поэтому frontend после
нескольких retry оставлял placeholder. Persistent IndexedDB cache и DOM
карточек сами по себе не были причиной.

**Исправление:**
- добавлен Worker wrapper `entry-v1310.js` / version `1.31.0`;
- штатный avatar route остаётся первым и не меняется для записей с fileId;
- только после authenticated `AVATAR_NOT_FOUND` Worker повторно подтверждает
  участника через разрешённый snapshot и делает on-demand
  `getUserProfilePhotos` через Telegram Bot API;
- выбранный Telegram photo обслуживается через существующий защищённый
  `/avatar?fileId=...` flow; bot token и fileId в браузер не передаются;
- массового avatar prewarm нет, frontend продолжает использовать общий
  persistent cache и прежний network concurrency limit;
- `worker/wrangler.toml` переключён на `src/entry-v1310.js`.

**Коммиты:** `d5b8055` — новый Worker fallback; `a34b6bd` — активный Worker
entrypoint; `2e3b877` — синхронизация `CURRENT_STATE.md` с v0.6.1 и hotfix.

**Проверка:** проблемный класс записей подтверждён на актуальном snapshot;
новый Worker-файл прошёл `node --check`, после commit файлы повторно прочитаны
из GitHub `main`. Если Telegram не отдаёт фото из-за privacy/API, сохраняется
прежний 404/placeholder contract.

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
