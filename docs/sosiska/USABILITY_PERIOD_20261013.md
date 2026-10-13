# Исправление интерфейса и динамика за весь период — 13 октября 2026

## Выполнено

Состав выводится карточками, по убыванию Level+Crown, с дополнительным стабильным порядком по Level/ID для равенств. Ники/числа не разрываются; JSON, Members, Status, UserId и прочие сырые поля убраны из видимых карточек/журнала. Отслеживаемые команды получают названия из последнего сохранённого снимка, без нового игрового запроса.

В карточке команды отдельные виды: «Весь период» (по умолчанию), «Состав», «Журнал снимков». Весь период автоматически читается до baseline1 с проверкой последовательности, включая все страницы. Можно обновить/остановить чтение. Память ограничена текущим/предыдущим снимком и накопленными статистиками игроков; все raw снимки в браузере одновременно не удерживаются. Неполная история показана явно.

Для каждого ID вычисляются суммы положительных изменений Level, Crown, HelpCount, средняя скорость по интервалам с валидными счётчиками и длительность наблюдения в составе. Выходы/возвращения не соединяются как непрерывный игровой прогресс. Отрицательные изменения отмечены сбросами/уменьшениями, не прибавлены к выигрышам. Текущие и вышедшие игроки отделены. Одного снимка недостаточно для скорости. Это средний наблюдаемый темп, не скорость активной игровой сессии. Сбросы и неизвестные переходы не позволяют восстановить потерянные приросты внутри интервала.

ИИ итог получает эти же детерминированные показатели вместе со всей сохранённой историей. Нельзя считать рост Crown числом пройденных раундов или отсутствие изменения Level отсутствием активности в лиге.

## Реальная причина неработающего ИИ

13 октября live settings royal-crm-miniapp-api проверены после штатного refresh OAuth. SOSISKA_ANALYSIS binding есть, но Secret SOSISKA_GROQ_KEY отсутствует. Подходящего сохранённого Groq credential в приватных setup/env файлах Shell не найдено. Ключи ботов не извлекались/не менялись. UI/status теперь прямо сообщают о неподключённом провайдере; период/скорости доступны без ИИ. Реальный вызов AI не подтверждён и не должен объявляться исправленным до добавления рабочего ключа и live acceptance.

## Реальные уровни и короны: что установлено

В текущем build38911 decoder TeamMemberInfo содержит Level, Crown, LastLevelUpdateDate и LastLeagueLevelUpdateDate (последние два — даты), ProfileSetting содержит RoyalLeagueTier. TeamMemberInfo не содержит счётчика пройденных league rounds, active multiplier или историю сложностей. Renewal LeagueProgress относится к собственному сервисному аккаунту и не даёт прогресс чужих игроков.

Официальный Dream Games Royal League FAQ подтверждает дополнительные короны за Hard/Super Hard/Extremely Hard rounds и сброс лиги при выпуске новых уровней: https://dreamgames.helpshift.com/hc/sv/3-royal-match/faq/108-royal-league-1721127793/?l=en&p=all&s=gameplay-guide . Точные коэффициенты, привязка к каждому пятому/десятому уровню и x2/x3 не восстановлены из native code. В подключённом Shell нет original global-metadata.dat/libil2cpp.so/dump.cs; доступен только bridge decoder и прежние reverse-engineering записи. Для точной проверки нужно исходное native evidence/assets соответствующей версии, trace начисления, и доказать возможность получения leagueLevel/round counter по публичному игровому профилю. Никакие коэффициенты не выдумывать и не пересчитывать короны в уровни.

## Проверки

71 Node tests PASS: все страницы, скорости, сбросы, выход/возврат, пропуски, сортировка, отсутствие скрытых watch/capture и влияние на другие админские операции. Первоначальный CI38443889806 SUCCESS на e49bbf4; далее проверяется финальная правка вкладок/названий.

Read-only live проверка существующих watches: FORTUNA4298767235 — 25снимков, 48игроков, 22.0013ч, наблюдаемый прирост Level933/Crown0; CEHAT4312888909 — 12снимков, 49игроков, 22.0000ч, Level1061/Crown1160. Обе истории baseline-to-head complete=true, обе watches enabled=true/lastError=null. Это данные на момент проверки, не итог турнира. Новых снимков/наблюдений не создавали.

Chromium проверка с реальным сохранённым набором FORTUNA и mocked API: viewport390px/document390px, 48карточек, raw UserId в тексте отсутствует. PNG визуально проверены: ники/числа целые; separate period view. Fixture не использует живую Telegram session; Telegram acceptance остаётся за владельцем.

Автоповышение уровня остаётся отложенным, игровой прогресс/боты/расписание наблюдений не изменены.


## Live rollout confirmed

PR43 merged:7a208d7b4fa3e2f5706b0a97267df69a4097bf10. Final source3f2da65b3da61aff06e443829a57a4b4bf32572d passed CI38444611060/38444618123; main CI38444769659 and Pages deployment38444767737 SUCCESS. Live HTTP200 verified new app.html releaseBuild, app-v0600 period-script reference, UI version0.4.0, period library and roster CSS. Existing royal-crm-miniapp-api Worker bundle updated after green CI; full bindings compared equal before/after. SOSISKA_GROQ_KEY still absent; actual AI run not accepted. Existing two game watches were read-only checked and not modified. Native reward coefficients/x2/x3 remain unresolved; original native assets or corresponding evidence needed. Autolevel remains paused.
