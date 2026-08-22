# Безопасное развёртывание журнала v2

`scripts/install-v0600-journal-v2.sh` — единственный штатный сценарий первого
включения полного журнала v2 в Apps Script «Таблица ЧП 1.3».

Скрипт не изменяет участников или команды. Он создаёт/обновляет только код и
служебные листы аудита, затем проверяет их до включения.

## Обязательные условия

- запускать в Google Cloud Shell, где уже авторизованы `clasp` и `gh`;
- каталог `~/table-chp-1.3` содержит правильный `.clasp.json`;
- код журнала уже объединён в `main`;
- использовать полный 40-символьный **merge commit SHA**, а не SHA ветки PR;
- в проекте существует ровно один deployment с exact description
  `Таблица ЧП 1.3` и numeric version (не `@HEAD`).

Запуск:

```bash
cd ~/table-chp-1.3
ROYAL_CRM_SOURCE_SHA=<MERGED_40_CHAR_SHA> \
  bash <(curl -fsSL "https://raw.githubusercontent.com/Antonsoloway/Specnaz-mini-app/<MERGED_40_CHAR_SHA>/scripts/install-v0600-journal-v2.sh")
```

Не заменяйте SHA на `main`: это убирает фиксацию исходного кода во время
развёртывания.

## Что проверяется автоматически

1. SHA существует и уже является частью `main`.
2. До `clasp pull` сохраняется локальная копия; после clean pull сохраняются
   полная live-копия, SHA-256 manifest и exact backup десяти затрагиваемых
   файлов. Installer использует `umask 077`; новый backup-каталог доступен
   только текущему пользователю Cloud Shell.
3. Найден ровно один existing deployment `Таблица ЧП 1.3`; сохраняются его ID,
   numeric version и полный набор deployment ID.
4. Текущий `/exec` отвечает на non-mutating probe ошибкой
   `INVALID_REQUEST_ID`.
5. Первый `clasp push` отличается от live только инертным
   `34_MINIAPP_AUDIT_V2.js`. Временный activation token гарантированно не может
   совпасть со старым Script Property.
6. Пока прежний `01_CORE_MAIN.js` ещё находится в source, выполняется
   `MINIAPP_migrateLegacyChatKeeperSecret()`. Функция переносит уже настроенное
   значение webhook в named Script Property, но возвращает только metadata:
   `configured/migrated/property/version`; само значение не печатается, не
   записывается в backup metadata и не возвращается через `clasp run`. До
   завершения окна отката legacy-значение остаётся только внутри rollback-
   архивов исходников, закрытых правами `0700/0600`; после окна отката эти
   архивы нужно удалить вместе с согласованной ротацией credential. Без
   семантического подтверждения `configured=true` второй push запрещён. Если
   property уже существовал, Stage 1 также fail-closed проверяет его совпадение
   с текущей legacy-конфигурацией, чтобы переключение file01 не оборвало webhook.
7. Выполняются `MINIAPP_auditV2Deactivate()` и read-only status с
   `active=false`.
8. Второй push содержит только exact allow-list из десяти файлов. После него
   status всё ещё обязан показать `active=false`.
9. Activation строит свежий непустой baseline. И activation, и повторный status
   обязаны подтвердить `storageSecurityReady=true` и пары `Hidden/Protected`
   для журнала, индекса и baseline. В backend `Protected=true` означает exact
   named sheet protection с `warningOnly=false` и `domainEdit=false`.
10. `MINIAPP_adminWritePreflight()` обязан вернуть `ok=true`, `issues=[]` и
   `endpointSource=deployment-constant`.
11. Обновляется только сохранённый deployment ID. После операции полный набор
    deployment ID обязан остаться тем же, а numeric version — увеличиться.
    Для совместимости clasp используются только exact-ID формы:
    `update-deployment ID`, его официальный alias
    `create-deployment --deploymentId ID` или legacy `deploy -i ID`.
12. Новый `/exec` снова проходит non-mutating probe и возвращает ожидаемую
    write-version.
13. Результат каждого `clasp run` разбирается семантически. Exit code `0` с
    Apps Script exception считается ошибкой. После source push installer
    учитывает ограниченную HEAD propagation: function-not-found, пустой
    ответ или ответ прежней version повторяются до 12 раз с
    интервалом 5 секунд (окно не более минуты).
    Каждая raw/semantic попытка сохраняется в backup; после лимита
    скрипт fail-closed переходит к rollback.
14. Private snapshot обязан подтвердить expected write-version, exact endpoint
    и journal schema v2.
15. Выполняется новый clean `clasp pull`: его полный manifest обязан byte-for-byte
    совпасть с проверенным stage 2. Экспорт и manifest сохраняются в backup.

Перед первым remote push и отдельно **до** вызова activation installer
атомарно сохраняет phase checkpoints в `metadata.json`. Это отделяет
неопределённый inert push от случая, когда active token уже мог быть
записан, но ответ клиенту потерялся.

Скрипт намеренно **не** запускает скачанный из сети sync-script и не пушит
напрямую в `main`. После успешного rollout он печатает
`Repository live mirror/docs: PENDING`: factual `apps-script-live/`,
`CURRENT_STATE.md` и `WORK_HISTORY.md` синхронизируются отдельным проверяемым PR
по сохранённому live-after export.

## Rollback

При ошибке после первого push скрипт автоматически:

1. если activation уже могла быть вызвана, с ограниченными повторами
   выполняет `MINIAPP_auditV2Deactivate()`, а затем отдельный
   `MINIAPP_auditV2Status()`; rollback считает postcondition доказанным
   только при свежем `active=false`. Потерянный ответ Deactivate не
   считается ошибкой, если последующий status доказал отключение;
2. если durable checkpoint доказывает, что activation ещё не вызывалась,
   не требует недоступную Stage-1 функцию и не создаёт ложный
   `rollback incomplete`. Backup старой схемы без checkpoint трактуется
   консервативно: activation могла произойти;
3. возвращает **тот же deployment ID** на сохранённую numeric version;
4. восстанавливает ровно девять прежних hook-файлов;
5. восстанавливает прежний file34, если он был, иначе удаляет только file34;
6. выполняет `clasp push`, затем новый `clasp pull` и сравнивает factual
   live manifest с сохранённым `live-before.sha256`;
7. повторно проверяет полный набор deployment ID и exact previous
   numeric version. Выводы Deactivate/Status и rollback verification
   сохраняются в `backup/diagnostics/` и не удаляются вместе с
   temporary directory.

Служебные листы аудита при rollback не удаляются: они additive и могут
содержать уже зафиксированные события. Named Script Property ChatKeeper также
намеренно сохраняется; rollback не читает, не печатает и не удаляет его.

## Credential после rollout

Прежнее webhook-значение уже находилось в публичном source и git history,
поэтому его следует считать раскрытым. Этот rollout только переносит текущую
конфигурацию в Script Properties без остановки действующего ChatKeeper webhook.

После успешного развёртывания, завершения smoke-test и закрытия rollback-окна
нужна отдельная согласованная ротация: одновременно заменить named Script
Property и настройку webhook в ChatKeeper, затем проверить реальные события.
Значение нельзя добавлять в git, команды Cloud Shell, логи, документацию или
вывод installer. Во время journal-v2 rollout ротация запрещена: она смешала бы
изменение credential с изменением backend и сделала бы rollback неоднозначным.

Pinned installer автоматически сохраняется в backup. Повторный ручной rollback
не зависит от наличия репозитория в `~/table-chp-1.3`:

```bash
BACKUP=~/royal-crm-backups/v0600-journal-v2-YYYYMMDD-HHMMSS
ROYAL_CRM_CONFIRM_ROLLBACK=ROLLBACK_JOURNAL_V2 \
  bash "$BACKUP/install-v0600-journal-v2.sh" --rollback "$BACKUP"
```

Если автоматический rollback сообщает о неполном результате, не запускайте
rollout повторно. Сохраните вывод Cloud Shell и backup path для диагностики.

Read-only проверка не вызывает Apps Script функций, не делает push/deploy
и не печатает deployment ID:

```bash
bash scripts/install-v0600-journal-v2.sh --diagnose "$BACKUP"
```

Она выполняет только temporary `clasp pull` и deployment inventory read. Флаг
`SOURCE_AND_DEPLOYMENT_RESTORED=true` доказывает exact source/deployment
восстановление. `AUDIT_DISABLED_LIVE_CHECK=false` в этом режиме означает,
что read-only diagnosis намеренно не читал Script Property; это **не** означает,
что audit активен.
