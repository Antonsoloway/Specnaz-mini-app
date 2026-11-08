# Карточка выбывшего участника и переход в текущую команду — 08.11.2026

## Запрос

В модуле «Сосиска» отдельно для Royal Match и Royal Kingdom сделать выбывших участников полноценными интерактивными сущностями: открывать профиль и статистику по игровому UserId, определять текущее членство, а при наличии команды переходить к её экрану и составу.

## Реализовано в отдельной рабочей ветке

Ветка: `feature/sosiska-player-membership-navigation-20261108`  
База: чистый HEAD `c259364` (ветка создана отдельным worktree; незакоммиченные CRM-исправления в основном checkout не затронуты).

### UX

1. В списках «Выбывшие» и в списке выбывших внутри состава действие теперь открывает «Карточка и статистика участника».
2. Карточка объединяет исторические данные старой команды и свежий игровой профиль:
   - имя, уровень, дата начала игры;
   - статистика профиля;
   - число вступлений/выходов и история наблюдаемых интервалов в исходной команде;
   - текущая команда по игровому профилю либо подтверждённый статус «Без команды».
3. Если TeamId положительный и подтверждён, название текущей команды становится ссылкой.
4. Нажатие загружает команду по точному игровому TeamId и открывает экран сразу на вкладке состава. Состав получен через существующий read-only getTeamInfo.
5. При TeamId=0 отображается «Без команды». Если TeamId отсутствует/некорректен или профиль не загрузился, статус остаётся неподтверждённым — не объявляется отсутствие команды.
6. Возврат из карточки восстанавливает исходную вкладку «Выбывшие»/«Новенькие»/«Состав».
7. Просмотр не включает watch, не создаёт capture и не меняет историю.

### RM/RK и границы данных

- RM использует существующий RM getProfile и девять нативных показателей.
- RK использует отдельный RK getProfile, собственные ClientStats/BackendStats, кубки и собственный TeamId.
- Все вызовы остаются в текущем admin-agent фасаде и требуют существующей admin-сессии.
- Идентичность участника — точный игровой UserId, не имя.
- Исторический снимок не выдаётся за текущее состояние. Текущая команда берётся только из ответа игрового профиля.
- При устаревшем RK cache карточка помечает команду как последнюю известную.
- Не менялись игровые агенты, секреты, Worker, D1, расписания, наблюдаемые команды и сохранённые снимки.

## Изменённые файлы

- `sosiska-v061.js` — профиль исторического участника, отдельное действие player-profile, переход на текущую команду, возврат к исходной вкладке.
- `sosiska-v061.css` — компактный блок текущего членства и явная кнопка перехода.
- `tests/sosiska-ui.test.mjs` — RM/RK live profile, TeamId=0, переход и состав, отсутствие смешивания игр.
- `tests/verify-sosiska-membership-browser.cjs` — расширен браузерный сценарий выбывший → профиль → текущая команда → состав → возврат.

## Browser acceptance and release candidate — v0.6.17 (08.11.2026)

### Browser verification

Installed Playwright 1.62.1 in a temporary tools directory outside the repository and ran the membership browser acceptance against the real Microsoft Edge executable. Result: PASS at 320, 390 and 768 CSS px. Covered membership pages, name-based drilldown from the departed list, current native profile, current-team navigation, team roster, reopen, empty history, incomplete history/gaps, and horizontal overflow. No page errors. Browser used deterministic fixtures; no production records were queried.

### v0.6.17 release candidate

Prepared `app-v0617.html`, `changelog-v0617.js`, and updated `app.html`/`index.html` redirects in this feature worktree only. The v0.6.17 entrypoint is based on the already-published main v0.6.16 Mayak release and preserves the v0.6.15 admin battle base, Mayak compatibility module, music, startup and Telegram query/hash. It loads the v0.6.16 changelog before v0.6.17. It cache-busts the updated Sosiska JS/CSS and loads the new changelog after v0.6.15. Static asset audit: 154 local references, 0 missing. Release regression suite includes the new entrypoint and changelog; combined Mayak/release compatibility suite is 15/15 PASS.

### Full validation

- Sosiska + RK emblems + battle-base Node suite: 211/211 PASS.
- Existing admin transport/cache/media suite: 32/32 PASS.
- Team navigation resolver regression: 15/15 PASS.
- Browser membership acceptance in Edge at 320/390/768: PASS.
- Workerd battle-base admin session/CORS/search: 8 checks PASS.
- Workerd Sosiska diagnostics, SQLite alarms, cold start and full-history: 6 checks PASS.
- Legacy Sosiska isolation workerd test: process exit 0; expected invalid-init-data rejection is printed as part of the fixture.
- esbuild v0.25.12 bundles for entry-v1430, entry-v1420 and entry-v1410: PASS.
- The repository's prebuilt `sosiska-period-v061.js` compares byte-for-byte with a fresh v0.25.12 build after normalizing Windows CRLF to LF; no generated bundle update is required.
- Release asset audit: 154 references, 0 missing.
- `git diff --check`: PASS.

### Scope and publication boundary

No production deployment was performed. The new app redirects exist only in this isolated feature worktree. No GitHub Pages publish, Worker deploy, GAS publish, secret change, D1 write, monitoring change or game-agent change. Main checkout remains on `fix/crm-name-corruption-and-public-sync-20261106` with its pre-existing unrelated CRM edits untouched. The release candidate is ready for PR/review, not live.

## Проверки (сводка)

- Sosiska + RK emblems + battle-base Node suite: 211/211 PASS.
- Existing admin transport/cache/media suite: 32/32 PASS.
- Team navigation resolver regression: 15/15 PASS.
- Browser membership acceptance in Microsoft Edge at 320/390/768: PASS; no horizontal overflow or page errors.
- Workerd battle-base: 8 checks PASS.
- Workerd Sosiska diagnostics/SQLite/cold-start/full-history: 6 checks PASS.
- esbuild v0.25.12 bundles: PASS.
- Release entrypoint/changelog and Mayak compatibility: 15/15 PASS.
- App v0.6.17 local asset references: 154 checked, 0 missing.
- `git diff --check`: PASS.

## Статус публикации

Кандидат v0.6.17 подготовлен в отдельной ветке и прошёл локальную браузерную, Node и workerd проверки. Не публиковался: app.html/index.html redirects изменены только в feature worktree; production Worker, Cloudflare secrets, GitHub Pages, Apps Script, игровые агенты и production data не менялись. Следующий шаг — оформить PR, получить CI и провести release review; публикация выполняется отдельно после проверки.
