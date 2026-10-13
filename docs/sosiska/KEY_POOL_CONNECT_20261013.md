# Подключение существующих ключей ботов — 13 октября 2026

По прямому указанию владельца подключены 21 уникальный Groq ключ из specnaz-ai-telegram-gateway: GROQ_API_KEY и GROQ_INTERNAL_API_KEY_1..20. Копии помещены в server-only Secret SOSISKA_GROQ_KEYS существующего royal-crm-miniapp-api. Никаких значений ключей в git, браузере, выводе или этом документе нет. Ключи у ботов не удалялись и не заменялись. Лимиты Groq общие с ботами; новые платные провайдеры не подключались.

Source90f4f6f78dc192f0eed3c93c5993b456e06bdb93; 76 Node tests PASS; CI38446070917/38447115605 SUCCESS. PR44 merged: f73103f6559645b1fdd1784a80e74ec7ca12be85. Пул дедуплицируется, ключи ротируются; 429/временный сбой/недействительный ключ ведут к следующему. При временном исчерпании провайдера задача сохраняет прогресс и повторяется по alarm, без преждевременного failed после пяти попыток. GPT model contract120b/20b сохранён. Aitunnel/платный fallback не добавлялись.

## Подтверждённые runtime действия

Перед переносом сохранены live source/target bundles/settings/deployments. На source временно использовался приватный маршрут с отдельным случайным256-bit secret, TTL30min и AES-GCM envelope. Export подтвердил21 уникальный ключ. Сразу после export source оригинальные module bytes и полные bindings были восстановлены и сверены на точное совпадение; source transfer secret удалён. Только после этого конфигурирован target pool и новый анализатор.

Для acceptance на target временно включён аналогичный закрытый маршрут только для start/status существующего Analysis DO. Реальная задача всей истории двух наблюдаемых команд стартовала: job7bb811ce-ed95-4ec8-88ba-b8dbe8952907, teams2. Последний доступный статус: running, processedSnapshots5, errornull. Это НЕ подтверждение готового ответа GPT.

После этого Commander Shell перестал возвращать команды; отдельный read_file через асинхронный get_tool_result завершился Timeout - no response from device. Не считать live AI acceptance завершённым. Cloud Analysis DO выполняется независимо от Shell. Пользователь может посмотреть состояние в модуле; окончательный ответ/provider/model/полный охват нужно проверить при восстановлении доступа.

## Очистка и продолжение

На Shell запущен приватный connect.py: после status polling его finally возвращает target обычный bundle, удаляет target transfer secret и локальный transfer-session.json. Подтверждение target finally пока НЕ получено из-за потери Shell. Одноразовый маршрут дополнительно ограничен TTL30min. В штатном entry-v1420 helper НЕ импортирован; обычный main/Cloudflare Build не публикует этот маршрут.

После переподключения прочитать ~/sosiska-auth-private/key-connect-20261013/progress.log и acceptance-status.json (последний содержит закрытый отчёт/игровые данные, не публиковать целиком). Подтвердить done с обоими отчётами, summary и полной историей; если failed/running — изучить сохранённый error/состояние, не запускать перенос заново. Проверить, что target main entry обычный, временные route/vars/secret удалены; закончить безопасную очистку, если finally не выполнился. СОХРАНИТЬ SOSISKA_GROQ_KEYS и все остальные bindings/секреты/namespace. Если main Build заменил временный target wrapper, status collector может закончиться ошибкой маршрута, а cloud job продолжиться — это не доказательство ошибки GPT.

Приватные OAuth/backup/transfer-session не читать в вывод и не коммитить. Source original code восстановлен до Shell failure; source bots не требуют повторного переноса/rollout. Игровой Worker/сессия/две watches/captures/автоповышение не менялись. Последнее по-прежнему отложено.
