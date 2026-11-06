# База битв — админский раздел Mini App v0.6.15

Дата разработки: 06.11.2026  
Статус: опубликовано в production 06.11.2026; live проверки закрытых API пройдены. Финальная приёмка реальной Telegram admin-сессией ещё ожидается.

## Назначение и границы данных

В Royal CRM Mini App добавлен раздел «База битв». Кнопка и API доступны только администраторам Telegram-чата. Обычные участники не получают ни пункт меню, ни данные через прямой запрос.

D1 остаётся единственным источником истины. Используются существующие таблицы:

- competition_screens_v1 — распознанные скриншоты и классификация события;
- competition_teams_v1 — строки команд, места, очки и роль зелёной команды/соперников;
- competition_sources_v1 — исходные Telegram-сообщения, авторы, подписи, темы и ссылки;
- competition_topic_links_v1 — связи с архивными темами.

На момент разработки D1 содержала 2 916 экранов, 11 484 строки команд, 2 933 источника и 21 связь с темами. В поисковый индекс попадают записи со статусами parsed/review, кроме owner-epic-archive-v1. Отдельный архив эпичных битв и owner-only Sosiska events/brackets/help metrics в общий админский раздел не экспортируются.

Дата в фильтре и карточке означает дату публикации сообщения в Telegram. Дата самой битвы часто не установлена; она не вычисляется и не угадывается. Отдельные скриншоты не объединяются в одну битву без подтверждённой связи.

## Архитектура

### D1 → Gateway → KV

Gateway route: GET /api/internal/competition-index.

Новый Gateway wrapper: src/entry-competition-index-v1.js. Он сохраняет основной Worker entry-media-enrichment-v1.js, queue, scheduled и UnifiedConversationCoordinatorV1.

Индекс строится запросом к существующей D1. Команды и источники агрегируются в JSON, поисковые варианты названий формируются через teamNameSearchKeysV2. Поля сохраняют исходную идентичность команд, роль зелёной строки, игру, тип события, стадию, очки и Telegram provenance.

Для индекса создан отдельный KV namespace COMPETITION_INDEX_CACHE. После успешного D1 batch в persistCompetitionV1 записывается dirty marker. Gateway перестраивает индекс при dirty marker, но не чаще одного раза за 30 минут; обычный fallback TTL — 60 минут. Старый снимок при ошибке D1 может быть отдан до 7 дней с явным stale=true. Это не копия в Google Sheets и не второй источник истины.

Проверочный полный SQL build прочитал 28 259 D1 rows. При предельном обновлении раз в 30 минут это около 1,36 млн прочитанных строк в сутки; фактическая частота ниже, если нет новых записей и ручных запросов. Это оценка нагрузки индекса, а не показание общего суточного потребления аккаунта.

### Авторизация

1. В app-v0615.html кнопка имеет data-admin-only="battle-base" и скрывается, если role.isChatAdmin !== true.
2. app.js повторно запрещает открытие страницы без админской роли.
3. Mini App Worker GET /admin-battle-base проверяет Origin и вызывает authorizeAdmin для действующей подписанной сессии и актуального статуса Telegram admin.
4. Gateway перед чтением/возвратом индекса вызывает Mini App Worker GET /verify-admin-session с тем же signed bearer session. Это не доверяет Telegram ID из заголовка и не требует дополнительного общего секрета.
5. Gateway удаляет owner-epic-archive-v1 из общей выдачи; Mini App API дополнительно исключает resultClass=epic.

### Кэширование и нагрузка

- Gateway KV: глобальный индекс на 7 дней хранения, freshness TTL 60 минут;
- dirty refresh: не чаще раза в 30 минут;
- Mini App Worker isolate cache: 5 минут;
- поиск, фильтры и пагинация не вызывают D1;
- ручная кнопка «Обновить базу» запрашивает проверку/обновление индекса, но не обходит 30-минутный предел;
- при недоступности D1 возвращается ограниченный stale snapshot, если он существует.

## Возможности интерфейса

- поиск по исходному названию команды, сопернику и сохранённым вариантам чтения названия;
- Royal Match / Royal Kingdom;
- битва / турнир;
- завершённый / промежуточный результат;
- распознано / требует проверки / все;
- дата публикации с/по;
- минимальное количество очков зелёной команды;
- таблица всех видимых команд, места и очки;
- автор, подпись, тема и безопасная ссылка на исходное Telegram-сообщение;
- постраничная загрузка по 20 результатов.

HTML-текст API экранируется перед отображением. Ссылки открываются только для HTTPS t.me/telegram.me. Неизвестные даты, названия и очки остаются неизвестными, а не подменяются догадками.

## Файлы реализации

### Mini App
- app-v0615.html — новый entrypoint и кнопка «База битв»;
- app.html / index.html — переключены на app-v0615.html с сохранением query/hash;
- app.js — admin-only routing и requestAdminBattleBase;
- battle-base-v0615.js / battle-base-v0615.css — интерфейс и фильтры;
- changelog-v0615.js — запись версии 0.6.15;
- worker/src/entry-v1430.js — Worker wrapper;
- worker/src/battle-base-api-v1.js — серверный API, фильтрация и кэш;
- worker/package.json — ESM scope для Worker unit tests;
- tests/battle-base-api-v1.test.mjs — API/filter/cache/auth unit tests;
- tests/verify-battle-base-workerd.mjs — Miniflare/workerd проверка с Telegram/Gateway mock;
- .github/workflows/sosiska.yml — включены новые unit, syntax и workerd checks.

### Gateway
- src/competition-index-api-v1.js — D1 index build, KV cache, session verification;
- src/entry-competition-index-v1.js — production wrapper;
- src/competition-results-v1.js — dirty marker после успешной записи результатов;
- tests/competition-index-api-v1.test.mjs — build, session verification, cache, cooldown и owner-only exclusion;
- wrangler.jsonc — main entry, COMPETITION_INDEX_CACHE binding и COMPETITION_ADMIN_VERIFY_URL.

## Проверки

Целевые проверки:
- Gateway competition-index unit tests;
- Mini App battle-base API unit tests;
- Miniflare test: valid admin passes, non-admin denied, CORS allowlist, opponent search, no Gateway call for non-admin;
- esbuild bundle of entry-v1430;
- Wrangler deploy --dry-run for both Workers.

Полный legacy node --test по всему Mini App также запускается, но в нём есть старые несвязанные с этим разделом проверки других подсистем. В отчёте релиза отдельно фиксируются только целевые результаты и любые оставшиеся CI failures.


### Live production D1 index build — 2026-11-06 16:07 UTC

Ran the exact deployed buildCompetitionIndexV1 builder against the production Cloudflare D1 database (one D1 API query; no write). Result: ok=true, partial=false, 2,776 standard competition records, 11,435 team rows, 2,014 final and 754 intermediate results, 92 review records; RM 2,213 / RK 560; 0 epic records; 0 malformed results; 28,144 D1 rows read; serialized index size 7,092,492 bytes. Search-key spot checks: JoyBand 42 matches, Avengers 4. Latest Telegram publication timestamp in index: 2026-11-06T15:34:28Z.

Important distinction: this validates the live D1-to-index builder and current source data. It does not itself write the production KV cache. The first request authenticated with a real Telegram admin session to the deployed Gateway endpoint will perform the KV refresh. The actual Telegram admin-session UI acceptance remains pending.
