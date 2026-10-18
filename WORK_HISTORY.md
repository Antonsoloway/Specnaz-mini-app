## 18.10.2026 — v0.6.9 RK list emblems prepared

Owner reported missing RK icon replacement in directory rows. Shared visible-only CRM decorator now supports both games, game-scoped logo cache, public/admin lists, membership links, profiles and rankings. Original names/routes stay intact; loaded images alone suppress prefixes. Unlink/access revocation removes stale images. Publication pending CI.

## 18.10.2026 — v0.6.8 published: emblem then name, RK emoji parity

Owner rejected the title above the emblem. Both RM/RK now put the emblem first and the full title to its right in the same row. Places/stars follow below; help remains hidden. Browser regression checks both games, title geometry and complete one-line names at320/390/768. Recovered RM rules from PR57/58/59 and prior conversation: no separator, retain manual emoji/internal spaces, Save required, suppress prefix only beside a loaded emblem. Applied to the independent 184-ID RK catalogue, picker and existing linked editor with the same race/draft guards. Browser checks include actual save payload and image success/error fallback. PR80 merged as d61909270392a0e42de7ba87fe6cc8ca1b63b35c; reviewed source6e4030b. Both source CI39161978169/39161981645 PASS (153 Node/asset tests,32 admin tests, workerd/isolation and complete browser regressions). Pages39162139242 PASS; eight public files byte-match reviewed source, including entrypoint and both changed RK emblem modules. Main CI39162139307 still running at documentation time. No Apps Script/Worker source changes. Telegram owner acceptance remains to be confirmed.

## 18.10.2026 — v0.6.7 published: no help, complete one-line titles

Owner confirmed the RK linked card works. Team cards now hide weekly team help and leader/co-leader help in both RM/RK. Player rows contain crowns/cups and level. Complete names render on a full-width single line, measured to fit by font size without truncation or ellipsis. Raw CRM text stays intact; fit runs after render/width/font/emblem changes, and disconnected card observers are released. Owner examples MICKEY KINGDOM and FGHBBBJNCDTHBCF plus20 wide characters pass at320/390/768 under complete app CSS. PR79 mergedc7b73a83cd3d12702d21de101f2f2c8b3db14863. Source CI39160679353/39160677135 PASS (152Node,32admin,workerd/isolation/all browser checks), Pages39160862987 PASS. Seven public files match reviewed source. Main CI39160863033: in_progress at documentation time. Apps Script/Worker source and observation/profile/history data unchanged.

## 18.10.2026 — v0.6.6 RK team links published

Owner confirmed RK player statistics after signed-int64 agent fix 982241a (Specnaz-ai#121). Mini App v0.6.6 is now live: RM/RK game-scoped picker/filters, text gameTeamId persistence, separate agents/credentials/caches, RK native Score/cups/emblem/conditions, leader then current co-leaders (max four), original screenshot and CRM membership retained. PR78 merged as 1168b4e3b111faeb81eba1ee49bb8c63167eabb0. 152 Sosiska/asset tests, 32 admin tests, workerd/isolation and all browser regressions PASS; main CI39158906368, Pages39158906442 and Workers Builds58f02fe7-a7bf-4038-a032-a0418759953a PASS. Existing Apps Script deployment updated to version123 after fresh two-file baseline verification; full live mirror synced as67b9c2a. Worker manually published as ea2b1479-3870-4b7b-94a2-2e00ec6395a2, then the successful main build published current5bc96f80-1622-4543-9a6f-9582db518e61. All18 bindings retained. Nine public files match reviewed release bytes; health200, both RK live routes require authorization401. Native Telegram save/card acceptance remains with owner; no real CRM team was bound automatically. See docs/sosiska/RK_TEAM_LINKS_20261018.md.

## 18.10.2026 — Sosiska RM/RK: source prepared, not deployed

Royal CRM Sosiska: dedicated RM and RK admin tabs with isolated routing, native RK search/rosters, Cloudflare-hosted RK monitoring + snapshots, battle score projections, full-period UI, comparison, history, signed export and independently scoped AI jobs. RK Cup is labelled cups rather than RM crowns; missing opponent personal battle scores remain unavailable; RM calendar is never assumed for RK. Profiled agent tests 137 PASS. Existing miniapp Cloudflare account (0dd3beb...) is inaccessible under current separate RK Wrangler login (62c513...); RK read-only probe from workstation timed out. Main/live production unchanged; keys and migration not configured, Telegram acceptance pending. See docs/sosiska/RM_RK_SPLIT_20261018.md.

## 2026-10-16 — Agent tile self-diagnostics published

The admin home card now shows a server-verified game level and short-lived online/offline/busy state. A fresh game Ping is required for green; configured health alone is insufficient. Card reads stop outside the visible home view, expire after90 seconds, preserve the last known level on failure, and clear on session/access changes. The generic card/status projection supports future agents without adding placeholders. Credentials remain behind the existing admin authorization. CI/Pages/Worker Builds passed; the deployed agent independently confirmed online and level14800. Source validation and live publication are tracked in docs/sosiska/AGENT_STATUS_20261016.md.

## 2026-09-12 — Owner ingress resilience installed; behavioral acceptance pending

Owner's completed recovery report confirms the existing Apps Script deployment uses ingress 2.9.0 and outbox 1.1.0; the deployment URL is preserved. Recovery found the release already active, so another deployment switch and version creation were unnecessary. Full live mirror synchronization succeeded.

GitHub main at mirror commit 0f5bc050bfc4d9757262905f50694295c28236d2 contains ingress and outbox files exactly matching the reviewed source. Production installation evidence comes from the owner's verified deployment report; the mirror is a separate source confirmation.

This supersedes the earlier source-prepared status. Telegram behavioral acceptance remains pending. The earlier immediate readback mismatch is no longer a deployment blocker; its precise cause has not been established. Do not repeat installation. Next verification is the owner's natural Telegram questions and, if needed, the protected ingress diagnostics.

Only checkpoint documentation changes in this follow-up. No source, permissions, data, frontend release, model calls or outgoing messages were changed or generated here.

## 2026-09-12 — Owner ingress resilience 2.9.0, source prepared

Source changes remove the redundant global lock when the commit timer is already installed. The error handler keeps fixed primary/secondary error codes and always contains secondary failures. Per-update delivery markers are independent of the shared cursor; confirmed Telegram receipts allow the commit timer to recover prepared payloads after a post-send metadata lock failure. Attempted or ambiguous sends are never automatically resent or treated as confirmed memory. Outbox 1.1.0 remains commit-only.

Eleven offline tests passed: lock contention, secondary error containment, replay during send, exact-answer commit recovery, ambiguous send, secret omission, property outage and owner/group isolation. These tests do not establish end-to-end bot acceptance. The primary cause of the earlier live AI failures remains unconfirmed.

Publication is source only until the deployment checkpoint is recorded. Existing stable Apps Script deployment must be updated in place; no new webhook, model probe or permission expansion. Frontend, Sheet schema and shared Worker unchanged. Detailed operational evidence remains in the private runtime repository.

# Royal CRM / «Таблица ЧП» — PUBLIC WORK HISTORY

> Обезличенный журнал технических изменений для публичного репозитория.
> Новые записи добавляются сверху.
> Подробные production evidence, персональные данные, request IDs, data hashes,
> номера строк и before/after payload хранятся только в приватном operational
> handoff и admin journal.

## 2026-09-08 — Golub post-send commit retry prepared

- The private unified-runtime rollout already deployed the reviewed 2.6.0 owner transport. The older 2.5.0 note below is historical; this source update does not claim that 2.7.0 is live.
- New `37_GOLUB_OWNER_COMMIT_OUTBOX.js` retains the exact answer and commit envelope in private Script Properties before delivery, then records Telegram receipts. A dedicated minute trigger retries only the signed history-commit callback after a failed acknowledgement; it never sends Telegram or generates another answer.
- Retry processing uses bounded batches, leases and backoff. Records are removed only after the shared Worker acknowledges the durable assistant-history write. Stored assistant output remains ineligible for factual learning; shared-memory permissions are unchanged.
- Prepared records without a saved delivery receipt are retained for diagnosis and are not automatically committed or resent. This handles commit failures after a recorded send; it does not claim a transaction spanning Telegram and Script Properties.
- The trigger is installed idempotently on the next authenticated owner message, before sending its answer. Existing stable deployment is updated with live pull/backup and `clasp status`; functional acceptance belongs to the owner.
- Combined Apps Script compilation and one offline failed-commit/retry check passed. Source publication is complete only after this commit; live release is tracked separately in the private runtime project.

## 2026-09-05 — Golub hidden Telegram citations prepared

- Owner ingress source advanced from 2.4.0 to 2.5.0 for the pending shared narrative rollout.
- The signed AI response can now contain a separate Telegram HTML envelope. Only validated Telegram message anchors are retained; users see natural clickable phrases instead of raw URLs, and link previews are disabled.
- Malformed markup or a visible URL cannot pass through the rich sender and is reduced to clean plain text.
- Owner-only, public-memory-only, stable-deployment, webhook, ChatKeeper/Royal CRM and public-speech boundaries are unchanged. Production remains on the prior ingress until the guarded rollout succeeds.

## 2026-09-03 — Golub private AI connected to public-only CHP memory interface

- Existing `Таблица ЧП 1.3` deployment advanced in place from version 102 to 103; the deployment ID and webhook-facing URL are unchanged.
- `36_GOLUB_OWNER_WEBHOOK_INGRESS.gs` advanced to v2.4.0.
- The owner-only private path now executes a signed public-CHP query before its provider fallback and passes only bounded canonical evidence to the model.
- The query contract fixes `realm=chp` and the authoritative CHP chat ID in server code. Private/admin realms cannot be requested by the Telegram message.
- The owner's private question is used only to compile the query and is not stored in the public D1 event ledger.
- A live bridge probe returned a non-empty AI answer; sanitized status confirmed that the public-memory signature configuration is present.
- Telegram webhook verification after deployment showed zero pending updates and no delivery error.
- Public CHP AI speaking, ChatKeeper routing, Royal CRM queueing and Mini App behavior remain disabled/unchanged by this update.

## 2026-09-03 — Golub owner-only Telegram webhook installed

С явного разрешения владельца установлен отдельный private ingress для Golub:

- существующее active web-app deployment version 93 обновлено на version 94 без создания нового deployment и без изменения стабильного URL;
- `doPost` сначала распознаёт прямой raw Telegram update, а затем оставляет прежние Mini App и ChatKeeper/Royal CRM маршруты без изменений;
- только личное сообщение настроенного владельца получает фиксированное подтверждение транспорта; group/non-owner/invalid-key updates молча подтверждаются HTTP 200 и не попадают в CRM queue;
- owner identity, bot token и случайный query key хранятся только в Script Properties;
- очередь Telegram успела вырасти с диагностических 180 до 193 updates; `drop_pending_updates=true` очистил её до подтверждённого нуля;
- Telegram ограничен `allowed_updates=[message]`, `max_connections=1`;
- active ChatKeeper deployment version 33 и соседний version 38 не изменены;
- одноразовый installer удалён после успешного `setWebhook` + `getWebhookInfo` verification;
- Golub AI и ответы в публичном ЧП не включались; repository-only shadow file 35 не развёртывался.

Permanent source: `36_GOLUB_OWNER_WEBHOOK_INGRESS.gs` плюс ранний owner-only branch в `05_RELIABLE_WEBHOOK_QUEUE.gs`. Публичная история не содержит Telegram ID, bot token, query key или exact webhook URL.

**End-to-end acceptance:** владелец отправил новое личное сообщение уже после установки webhook и получил фиксированное подтверждение в ту же минуту. Скриншот проверен, но не публиковался, поскольку содержит private-chat context. Цепочка Telegram → deployment version 94 → owner-only gate → Telegram `sendMessage` подтверждена. Более ранний probe до установки остался без ответа, как и ожидалось.

## 2026-09-03 — Golub webhook / private-DM diagnostic

**Проверено в live production без изменения развертываний:**

- токен Голубя в standalone Apps Script `Таблица ЧП 1.3` работает, Bot API identity подтверждена;
- Telegram webhook для Голубя сейчас не установлен (`getWebhookInfo.url` пустой);
- Telegram сообщает 180 ожидающих обновлений;
- ChatKeeper продолжает отправлять свои события в active version-33 web-app deployment, но это отдельный transport и не доставка raw Telegram updates;
- owner-only DM probe не появился ни в Royal webhook log, ни в reliable queue;
- live Apps Script содержит файлы 01–34, repository-only shadow file 35 не опубликован и `doPost` не патчен.

Временная read-only диагностическая функция удалена сразу после выполнения. Пустой bound Apps Script-проект, автоматически созданный Google во время перехода из таблицы, удалён с явного разрешения владельца. Production deployments, webhook и Script Properties не менялись.

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


---

### 24.08.2026 — устранение периодического twitch и overflow переливания звания [V061_VISUAL_STABILITY_20260824]

**Симптом:** на видео интерфейс кратко дёргается по всему Mini App; два эпизода разделены примерно 20.6 сек. Световое переливание rank badge визуально выходит далеко за границы плашки.

**Выполнено:**
- не меняя rollback v0.5.59, добавлен v0.6.1 boot-guard, который не даёт legacy rank module зарегистрировать 1.6-секундный global geometry poll и его scroll/resize geometry listeners;
- вместо него установлен `IntersectionObserver`, который активирует анимацию только у реально видимых rank badges и не заставляет длинные списки периодически пересчитывать layout;
- shimmer переписан с `translateX()` широкого pseudo-element на background-position внутри фиксированной rounded clip-mask; декоративные элементы звания снаружи плашки сохранены;
- `app.html` / `app-v0601.html` / общий runtime / changelog переведены на `20260824-v061-visual-stability1`;
- Telegram menu cache-bust применён через существующий `Таблица ЧП 1.3`, temporary route удалён, live Apps Script mirror синхронизирован.


---

### 24.08.2026 — immediate team-photo replacement [V061_TEAM_PHOTO_REFRESH_20260824]

- Backend/photo storage was not the failure: the replacement write reached the journal and fresh private/public snapshots.
- Fixed the client stale-photo path caused by 30-minute stable-key memory/IndexedDB reuse after replacing content for the same team+game.
- Added `team-photo-refresh-v061.js`; photo content version now participates in v0.6.1 cache identity and successful admin photo writes force immediate reload.
- Release marker `20260824-v061-team-photo-refresh1` published; Telegram menu confirmed; existing `Таблица ЧП 1.3` deployment preserved and live mirror synced.
- Periodic Android screen twitch remains unresolved and is intentionally deferred.


---

### 24.08.2026 — second screen-twitch diagnosis/fix [V061_SCREEN_TWITCH_WATCHDOG_FIX_20260824]

- Device feedback rejected the first rank-polling hypothesis: twitch remained unchanged.
- Traced a separate always-on `admin-write` live snapshot watchdog: first 5s, then every 20s, with public `/snapshot` reload even when data did not change.
- Added `v061-background-refresh-guard.js`, loaded before admin-write, which identifies the exact watchdog callback by source (`refreshPublicSnapshotOnce` + `refreshVisibleAdminSnapshot` + `scheduleLiveSnapshotRefresh`) and suppresses only those timers.
- Write correctness preserved: `refreshPublicSnapshotAfterMutation()` uses independent Promise timers and remains active after committed participant/team changes.
- Cache/menu marker `20260824-v061-screen-twitch1` published and verified; stable Apps Script deployment retained; live mirror resynced.


---

### 24.08.2026 — admin edit form cleanup + top edit actions [V061_ADMIN_EDIT_UX_20260824]

- User requested removal of system-generated participant fields from edit mode.
- Added `admin-edit-ux-v061.js`: update-participant modal removes chatState/username/date/specnaz/screens/activity fields, preserves editable CRM name + membership slots, and keeps Telegram name/ID read-only for visual verification.
- Same module moves participant/team edit actions to the top of detail cards, including above the large team photo.
- Create participant form remains untouched.
- Screen twitch fix from the preceding release was confirmed working on device by the user.
- Marker `20260824-v061-admin-edit-ux1` published/verified; existing Apps Script deployment retained; live mirror resynced.


---

### 24.08.2026 — admin navigation + team photo regression [V061_ADMIN_CONTEXT_INTEGRITY_20260824]

- User reported two regressions after admin edit UX: participant team link could open ordinary team detail, and admin team photos could stay on fallback.
- Added a v0.6.1 admin-context integrity layer that owns pointer/click routing before legacy public handlers and routes participant/team transitions exclusively through `RoyalAdminParticipantDetailV0600` / `RoyalAdminTeamDetailV0600` while an admin surface is active.
- Added protected team-photo recovery on admin team detail after DOM/button relocation; normal cache bridge is tried first, then a single authenticated direct refetch if necessary.
- Published cache/menu marker `20260824-v061-admin-integrity1`; existing Apps Script deployment retained; live mirror resynced. Device acceptance pending.


---

### 24.08.2026 — admin team colors / direct create / keyboard [V061_ADMIN_UI_CONTROLS_20260824]

- Device request: color admin team cards by game (RK red / RM blue), remove global edit-mode button in favor of direct create actions, and make admin search keyboard dismissal match ordinary mode.
- Added `admin-ui-controls-v061.js` and published marker `20260824-v061-admin-ui-controls1`. Telegram menu update and existing Apps Script deployment update completed; live mirror sync completed.
- Initial release script then failed during `node --check changelog-v0601.js`: its generated third changelog item missed the comma before the permanent final history item. No production rollback was needed.
- Added safe handoff finalizer; changelog is syntax-checked before commit and CURRENT_STATE / WORK_HISTORY / RELEASE_RULES are completed without touching production deployment.


---

### 24.08.2026 — admin team images + ghost edit tap [V061_ADMIN_TEAM_STABILITY_20260824]

- Investigated intermittent admin team image fallback and accidental immediate edit modal.
- Root interaction: multiple media layers may replace/revoke transient blob URLs while the admin DOM is being re-rendered; Android can also emit a compatibility click after the pointer navigation has already replaced the team-list DOM with team detail.
- Added a durable session image fallback keyed by team+game and an 850 ms edit-button navigation shield.
- Published marker `20260824-v061-admin-team-stability1` and refreshed Telegram menu through the existing Apps Script deployment only.


---

### 24.08.2026 — admin media/write/active-team reliability [V061_ADMIN_RELIABILITY_20260824]

- Investigated three device issues together because they share async/render/network timing in admin mode.
- Root media issue: multiple v0.6.1 compatibility layers could request every admin team image at once while `/admin-team-photo` itself performs protected admin authorization and private media reads. Some images therefore lost the first race and only retried after another UI interaction. Added bounded/coalesced viewport-priority queue and protected visible-image rearm.
- Root write symptom: current write client had only one true transport retry; the video showed that retry message followed by `Failed to fetch`. Added additional same-requestId transport/edge retries without changing server mutation semantics.
- Root mole symptom: legacy active-team decorator wrapped ordinary synchronous team rendering, but admin team detail renders asynchronously. Added explicit post-render refresh for admin detail.
- Published marker `20260824-v061-admin-reliability1` through the existing Telegram/Apps Script deployment only.


---

### 24.08.2026 — original Calloused Strings MP3 [V061_CALLOUSED_STRINGS_ORIGINAL_MP3_20260824]

- Replaced only private `track-06.mp3`; no playlist routing or user music preference behavior changed.
- Source MP3 was normalized to the existing set and exported without embedded tags/artwork.

### 26.09.2026 — fixed lost chat membership status for raw Telegram service-events

Live evidence:
- Marina join update `377511441` contained `new_chat_member/new_chat_members` for Telegram ID `7734222503`.
- The old route logged the update as `WRONG_SECRET` / `stat`, so `case 'join'` in the CRM core never executed and AF remained blank.
- Control event for Roman Lazutkin had arrived through the canonical ChatKeeper contract as `event=join` and produced `PLAYER_JOINED`, confirming the CRM join logic itself was healthy.

Code change:
- `36_GOLUB_OWNER_WEBHOOK_INGRESS.js` v2.9.1 now prepares a narrow authenticated membership bridge for Telegram group join/leave service-events.
- `05_RELIABLE_WEBHOOK_QUEUE.js` consumes only the bridge result and passes the normalized payload into the pre-existing reliable queue.
- No direct writes to participant state were added in code.
- Existing ChatKeeper payloads were regression-tested byte-for-byte unchanged; ordinary supergroup messages are not reclassified; wrong relay secrets are consumed before CRM.
- Live admin sheet row for Marina was repaired to `В чате` after confirming the original join event.


## 11.10.2026 — Агент «Сосиска»: модуль ЧП, development stage1

Реализация в отдельной ветке `sosiska-miniapp-stage1-20261011`; production/main не изменены. Админский экран, серверная проверка доступа, гибридный поиск, карточки и состав, история/дельты, ручные снимки и управление интервалом, GPT-анализ последних двух снимков реализованы. 22 новых теста и 22 существующих admin/transport теста PASS; bundle ~290 KB. Живое подключение не выполнено: текущий Cloudflare OAuth видит только аккаунт облачного агента, а Worker ЧП отсутствует среди доступных Workers. Для rollout нужны доступ к существующему `royal-crm-miniapp-api`, приватный RM_AGENT_API_KEY и SOSISKA_GROQ_KEY. Мониторинг автоматически не включался; уровень/прогресс и боты не менялись. Передача: `docs/sosiska/RESUME_20261011.md`. Ограничения: картинки эмблем ещё не сопоставлены, выбор произвольного периода анализа не реализован; полный исторический набор тестов содержит устаревшие fixtures, не объявлен зелёным.


## 12.10.2026 МСК — Сосиска: вся история всех отслеживаемых команд

Уточнение владельца заменило анализ последних двух снимков на полную историю всех отслеживаемых команд и динамику изменений. Реализованы persistent SQLite DO jobs + alarms, чтение всех страниц до baseline, проверка полного охвата, многоэтапный GPT-анализ, итог каждой команды/сравнение всех команд и точная числовая динамика по всем снимкам. 54 Node tests и 5 workerd/SQLite/cold-start checks PASS, bundle ~307.5 KB. Исправлен несовместимый Workers redirect:error на manual. Код в PR #40, production не менялся. Commander/Cloud Shell проверен: OAuth обновлён, HTTP 200; единственный доступный Cloudflare account содержит только bot gateway и cloud Royal Match agent, существующего Worker ЧП нет. Rollout всё ещё требует доступа к его аккаунту и серверных credentials. Актуальная передача: docs/sosiska/RESUME_20261012.md.



## 12.10.2026 — изоляция Сосиски от действующего ЧП

Требование владельца: Сосиска — отдельный админский модуль, сохранять действующие функции приложения. Добавлен tests/verify-sosiska-isolation-workerd.mjs и шаги в Sosiska module CI: собираются entry-v1410 (текущий API) и entry-v1420 (обёртка модуля), в настоящем workerd сравниваются статусы/все заголовки/байт-в-байт тела30запросов GET/POST/OPTIONS по10существующим маршрутам. Дополнительно успешные GET/snapshot и GET/admin-data с подписанной тестовой сессией и фиктивными CRM/Telegram/GitHub responses сравниваются без различий. Всего32checksPASS,8fixtureCalls,liveNetworkCalls0. Проверка не покрывает все успешные write/media-сценарии и не заменяет Telegram acceptance. Production код этой сессией не изменялся.

Повторно54NodetestsPASS и5workerd checks SQLite alarms/cold-start/full historyPASS; исходный код неизменён. Существующий live ЧП healthHTTP200/version1.41.0 подтверждён ранее, frontend пока без Сосиски. OAuth доступ к management API остаётся недоступным. Cloud Browser предложил защищённый вход; выбран Google, но вход отклонён с видимым «Неправильный пароль». Секреты не прочитаны/не записаны, новые credentials не создавались. Требуется ручное завершение входа в Cloudflare Dashboard; не запускать новые device codes вслепую.

Все изменения только tests/CI/checkpoints в рабочей ветке, main/frontend/Workers/secrets/Apps Script/watches/history не менялись. RemoteCI проверить на кодовом коммите этой записи.



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

## 15.10.2026 — Restore missing RM emblem assets

Owner search screenshots show missing logos74 and151 while logo1 loads.
Repository inspection found15 zero-byte tracked WebPs:4,11,18,46,53,74,81,
102,109,123,130,137,151,158,165. Restored exact numbered shields with the
existing extraction script from owner's original catalogue screenshots;
nonempty existing files retained byte-for-byte. No game reads, CRM writes,
worker, media or monitoring changes. Added versioned image URLs to bypass
cached broken responses, refreshed entrypoint asset markers and changelog.
Prior test only checked file existence; now checks nonempty/full RIFF/WebP
containers. Browser fixture additionally decodes all176 catalogue images and
asserts dimensions160x176. Regression rejects old empty74; all176 files pass
Pillow decode;106 Sosiska node tests pass. Initial local browser executable was empty; alternate existing Chromium
passed all176 image decodes and mobile widths320/390/768.32 admin tests pass.
Publication is blocked by automatic approval review requiring explicit user
authorization for GitHub push; no remote mutation was performed.

## 15.10.2026 — One-line directory team names

Owner screenshots show RM/RK names wrapping between a58px screenshot and
active-team badge. Directory cards now use a full-width one-line title row;
existing screenshot and active-team badge occupy the rows below. Long names
retain full raw text/CRM identity and show visual ellipsis only when necessary.
Existing admin summary nowrap stays intact. Inline emoji fallback prevents a
prefix-only line before/without a loaded emblem. Scope is directory cards,
not team detail/report/member names; no data mutation or backend change.
Full CSS/browser fixture (including injected screenshot-preview styles) covers
all owner example names and RM/RK/linked/unlinked/active/inactive cases at
widths320/390/768. Owner names fit without clipping; extreme-length names
ellipsis; no horizontal overflow. Prior CSS fails the regression. Emblem
conditional-display and full176-image browser fixtures pass;106 Node tests
pass. New title fixture included in CI; entrypoint markers/changelog updated.

## 15.10.2026 — Bounded team-card updates during session congestion

Owner reported every live team card stuck on update and suggested a simultaneous
FORTUNA snapshot. Agent source on feat/sosiska-export-20261014 confirms monitor
capture and getTeamInfo use the same serialized game session. Actual concurrent
capture at the reported time is unverified: Commander has no connected devices,
so authenticated agent status/logs unavailable. Public facade health200; protected
routes correctly401 without credentials. Previous main CI/Pages/Workers Builds
all PASS; no evidence that title CSS caused this request issue.

Confirmed wait defect: shared frontend helper allowed two60s attempts, used only
AbortController (including after headers) and the card's own abort signal was
not connected to the shared helper. A signal-ignoring request/body could retain
pending and directory slots indefinitely. Whole helper/card reads now race a45s
deadline including JSON/retry. Timeout releases singleflight, aborts best-effort,
and late fetch/JSON cannot clear or overwrite a later success. Status changes
after10s; successful saved card survives failure; no-data fallback shows saved
screenshot; refresh is enabled after completion. Busy agent gets a bounded429
TEAM_LIVE_BUSY signal, no immediate replay; authorized server cache stays usable.
Worker bounds CRM response/body15s and agent response/body25s, preserving current
access/binding validation and serialized game ownership. No agent/schedule change.

New Node tests cover ignored abort, stalled body, late response/cache poisoning,
CRM auth timeout and busy/stale behavior. New browser fixture covers public/admin,
stuck native fetch and body, independent helper/standalone card timeouts, cached
reopen, late403/JSON, busy no-replay and retry recovery. Old helper fails to settle
under the regression; fixed runner passes.142Node tests and loading/cache/card/
emblem browser fixtures PASS locally. New browser scenario included in full CI.
No actual game API read claimed without authenticated access.
