# Спецназ: потеря отметок в темах битв — 22.11.2026

Причина подтверждена по live Google Sheets и exact GAS v127: SNR_recordMessage_ и SNR_legacySource_ разрешали источник только из topic 21213, а SNR_process_ также отклонял другие темы. Администраторы ставят 🆒 в отдельных темах битв 277073 и 267777. События приходят и остаются в durable RETRY с SPECNAZ_SOURCE_PENDING: до 511 повторов одного сообщения. Это не потеря при отображении фронтендом.

За 21–22 ноября первоначально 26 начислений. Найдены четыре источника с админской отметкой без записи: 325739, 325945, 326200, 326266. Другие зависшие реакции уже покрыты ChatKeeper; их нельзя начислять повторно.

Кандидат: patches/specnaz-cross-topic-20261122/39_SPECNAZ_NATIVE_REACTIONS.js. Единственный модуль поверх exact v127 (42 файла); действующие membership/admin исправления v127 сохранены. Основная тема индексируется как прежде; при отметке админа legacy lookup разрешает исходник из любой темы того же доверенного чата и сохраняет фактический thread ID в ссылке. Signed relay, current getChatMember admin check и processWebhook_ source-link dedup сохраняются.

Проверки: новый тест tests/specnaz-cross-topic-20261122.cjs воспроизводит RETRY_LOCKED на immutable v127 (RED), проходит на кандидате (GREEN); покрывает исходный сырой audit, две разные темы, доверенный чат/relay, отказ неадмину, повтор без начисления, отсутствующий источник. Синтаксис всех SERVER_JS exact candidate PASS. Старые source-link guard 4, fallback 14, queue optimization 6 PASS. Старый отдельный chatkeeper-webhook-secret.test.js падает на неизменённых файлах checkout (отсутствующая ожидаемая декларация и чужой worker/src/sosiska-api.js); полный CI НЕ PASS. Эти файлы не входят в GAS release.

Immutable backup v127 и exact candidate/receipt находятся в приватной temp/crm-specnaz-20261122; секреты в git не копировать. Rollback: вернуть существующий deployment на v127, не откатывая начисления.

Статус публикации и live восстановления: ещё проверить и дополнить фактическими результатами.

## Дополнение: задержка записи

На живой очереди v128 восстановлены Агнесса 325739 (20:02 МСК, 5→6) и Женёк 326266 (20:05 МСК, 3→4). Ещё две записи и синхронизация проверяются. При добавлении новой строки recordSpecnazHistory_ вызывал ensureHistoryStructure_, который каждый раз менял ширины всех столбцов и форматирование всего тела истории. Подготовлен точечный fast path: прочитать одну строку заголовков; если все 16 колонок соответствуют схеме, добавлять и форматировать только новую строку. Если схема нарушена — существующий полный repair. Setup/maintenance остаются прежними. Это оптимизация подтверждённой лишней работы; точные замеры длительности функции до/после отсутствуют.

Новый тест specnaz-history-fastpath-20261122.cjs: корректная схема — 1 header read, 0 bulk writes; нарушенная/узкая схема — полный repair; PASS. Полный production core хранится только в закрытом временном readback; в Git — минимальный unified diff и helper без приватных данных.

## Live восстановление и экспорт

Основная история A429:P432: Агнесса 325739 5→6; Женёк 326266 3→4; Елена/UMKA 325945 0→1; Артём/Möwe 326200 6→7. Все четыре счётчика U проверены. Все девять зависших native reaction завершены DONE; пять уже учтённых источников не начислены второй раз. История за текущий период выросла с 26 до 30.

v129 успешно опубликована, exact immutable readback совпал; HTTP /exec 200. В зеркале ЧП сначала появились 3/4 новых источника, но snapshot.json продолжал показывать 26 (generatedAt 16:35 UTC). Прямой git fetch подтвердил, что это не кеш коннектора. В core webhook отсутствовала постановка MINIAPP_queueUnifiedSnapshotRefresh_, используемая админскими изменениями.

Добавлен безопасный hook в конце processReliableWebhookQueue: проверяет последний содержательный row истории и ставит существующий атомарный public/admin экспорт. Cursor SNR_HISTORY_SNAPSHOT_CURSOR_V1 не создаёт новый token на каждом обычном сообщении; продвигается только после успешного scheduled=true, ошибка расписания повторяется на следующем проходе. Никаких начислений, Telegram sends, новых HTTP endpoints или GitHub I/O в webhook не добавлено. Первый запуск восстановит экспорт текущих 30 записей. Новая регрессия: initial recovery, once-per-revision, new append, scheduling failure retry, missing helper/history PASS. Публикация v130 и live readback очереди экспорта ещё проверяются.

## Подтверждённый итог текущих данных

GAS v130 опубликован; exact immutable readback PASS, все новые tests и синтаксис SERVER_JS PASS. Зеркало ЧП A409:P412 содержит те же четыре источника, основной Sheet A429:P432; native queue DONE. Полный repository CI по-прежнему не объявляется PASS.

Фоновый экспорт после v130 на момент контрольного чтения ещё не подтвердил новый snapshot: snapshot.json сохранял generatedAt 16:35 UTC и 26 строк. Чтобы приложение получило подтверждённые начисления сейчас, выполнено точечное CAS-обновление private royal-crm-data/snapshot.json через GitHub connector (commit 7273bb2f8af1b6a9dc0903958bc216e0dda13091): добавлены 4 исходника с Telegram ID и правильными ссылками, исправлены ровно 4 participant specnazTrips/specnazRank, обновлены history.updatedAt и dataHash. Остальные разделы и generatedAt полного снимка сохранены. Readback: 30 строк периода, профили 6/4/1/7. Это РУЧНОЙ экспорт восстановленных данных, не доказательство первого автоматического запуска новой очереди. Реальный авторизованный экран Telegram WebView не просмотрен.

Следующая проверка: новый автоматический unified snapshot должен сохранить все 30 строк и текущие четыре счётчика. Не начислять 4 балла повторно и не выдавать ручной snapshot commit за automatic export. При ошибке смотреть existing queued-unified-trigger/GitHub authorization/runtime quota; доступ к Apps Script processes API в этом сеансе 403, scripts.run без Execution API deployment NOT_FOUND. Не менять URL или ACL для обхода.
