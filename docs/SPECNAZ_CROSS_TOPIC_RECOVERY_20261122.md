# Спецназ: потеря отметок в темах битв — 22.11.2026

Причина подтверждена по live Google Sheets и exact GAS v127: SNR_recordMessage_ и SNR_legacySource_ разрешали источник только из topic 21213, а SNR_process_ также отклонял другие темы. Администраторы ставят 🆒 в отдельных темах битв 277073 и 267777. События приходят и остаются в durable RETRY с SPECNAZ_SOURCE_PENDING: до 511 повторов одного сообщения. Это не потеря при отображении фронтендом.

За 21–22 ноября первоначально 26 начислений. Найдены четыре источника с админской отметкой без записи: 325739, 325945, 326200, 326266. Другие зависшие реакции уже покрыты ChatKeeper; их нельзя начислять повторно.

Кандидат: patches/specnaz-cross-topic-20261122/39_SPECNAZ_NATIVE_REACTIONS.js. Единственный модуль поверх exact v127 (42 файла); действующие membership/admin исправления v127 сохранены. Основная тема индексируется как прежде; при отметке админа legacy lookup разрешает исходник из любой темы того же доверенного чата и сохраняет фактический thread ID в ссылке. Signed relay, current getChatMember admin check и processWebhook_ source-link dedup сохраняются.

Проверки: новый тест tests/specnaz-cross-topic-20261122.cjs воспроизводит RETRY_LOCKED на immutable v127 (RED), проходит на кандидате (GREEN); покрывает исходный сырой audit, две разные темы, доверенный чат/relay, отказ неадмину, повтор без начисления, отсутствующий источник. Синтаксис всех SERVER_JS exact candidate PASS. Старые source-link guard 4, fallback 14, queue optimization 6 PASS. Старый отдельный chatkeeper-webhook-secret.test.js падает на неизменённых файлах checkout (отсутствующая ожидаемая декларация и чужой worker/src/sosiska-api.js); полный CI НЕ PASS. Эти файлы не входят в GAS release.

Immutable backup v127 и exact candidate/receipt находятся в приватной temp/crm-specnaz-20261122; секреты в git не копировать. Rollback: вернуть существующий deployment на v127, не откатывая начисления.

Статус публикации и live восстановления: ещё проверить и дополнить фактическими результатами.
