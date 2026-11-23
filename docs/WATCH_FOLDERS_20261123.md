# Папки отслеживаемых команд — 23 ноября 2026
Status: OFFLINE_PASS; production unchanged; publication pending owner approval.
Baseline: origin/main 8f9ae88aa2933a2b3149f3fcdf050c33179a85fd (chart player profile links).
Worktree: O:/chat gpt/Codex/worktrees/watch-folders-20261123
Branch: feature/watch-folders-20261123
Executor: ChatGPT/Codex; implementation performed directly, no delegated executor.

Mini App 0.6.18 adds shared admin folders for watched teams in RM and RK.
Create with title and multiple selected teams; open folder; rename/edit selection;
move teams from other folders; delete folder returns teams to unfiled list.
Existing open-team/comparison controls, monitoring intervals and snapshot history remain intact.
Folder membership is one folder per team per game. Empty folders remain visible.
Folders are shared by authorized administrators, consistent with the watched list.

Storage: new isolated named instance watch-folders-v1 of existing SosiskaKingdomMonitor
Durable Object class. Separate watch-folders:v1:rm/rk keys. No new namespace,
migration, secrets, credentials or paid AI route. No writes to monitoring records,
alarms, CRM, GAS, D1 or native game agents. Existing signed admin authorization
runs before storage access. Serialized operations and revision comparison reject
concurrent stale edits with HTTP409. Unknown write outcomes are never replayed
automatically; refresh list to reconcile. Bounded title/IDs/counts and escaped HTML.
The RK monitoring instance kingdom-monitor-v1 is unchanged and separate.

API: folders; folderSave(folderId/null,name,teamIds,revision); folderDelete(folderId,revision).
All through existing /admin-agent. Maximum100 folders,80 title characters,100 teams
per folder,1000 assignments per game. UI lists current watches only; stopped teams
are not shown. Historical assignments may remain until a folder is edited.

Validation: new real Durable Object/facade/storage tests, stale-edit conflict,
persistence, RM/RK isolation, denied admin before access, input validation.
Browser tests cover both games at320/390/768px: create multi-select, edit title and
membership, reopen, delete, escaping, horizontal overflow; no watch/unwatch/capture
side effects. Existing chart player browser suite remains passing.
New browser test is included in mandatory runtime/browser CI workflow.
Full app suite result and PR/CI evidence appended after execution.

Release sequence after approval: verify exact baseline/live Worker; full same-commit CI;
guarded Worker bundle, preserve19 bindings/3 DO namespaces and live settings;
staged rollout plus health and unauthorized-folder denial; merge frontend only after
backend supports folders; gated Pages publish and exact public asset readback.
Do not claim publication until independently verified.
Rollback: revert frontend to baseline; restore previous Worker version with original
settings. Folder data may remain harmlessly in its isolated instance.

Full application gate352/352 PASS (Windows Node24). Browser and chart suites PASS.


## 23 ноября 2026 — 0.6.18 опубликована, папки отслеживаемых команд
Владелец подтвердил «Публикуй» в текущем чате. PR112 объединён:
dc2084546a76186f39a82ab86d6d2df8981d0134; проверенный source
d53747340691e12868b933ce8cfd3b8a6c3f88af. Предыдущая запись о кандидате
и непубликации — исторический checkpoint, заменена этим подтверждением.

Worker royal-crm-miniapp-api: версия62ec1c3c-0134-484c-b620-cb9116efb50e
100%, deployment6a3d241a-dbf7-4e6e-9c38-ae350951ae27. Выпуск5%→100%;
все19привязок, включая3DO namespace IDs и ссылки на секреты, совпали с
baseline5272fa9b-06e0-4fd5-85d6-e555ddf301bc. Live bundle побайтово
совпал с guarded dry-run SHA256
c1ec51d185d25c6b5e8b34c5183f7293d30acbeb036466e381d34d7048454a28.
Health200; folders и folderSave без сессии401 SESSION_INVALID.
Авторизация/права/мониторинг/история команд не ослаблялись.

PR CI45129824889/45129824711 SUCCESS. Main Pages45131190301:
release-gate137546824804, application-regressions137546825253,
publish137547608972 — SUCCESS.352/352 application contracts; настоящие
workerd SQLite cold-start/CAS/401 tests; mobile browser RM/RK320/390/768;
существующие chart/profile и полный auth-startup browser suites PASS.

Публичные app.html,index.html,app-v0618.html,sosiska-v061.js,
sosiska-v061.css,changelog-v0618.js загружены по cache-busted URLs и
полностью совпали с проверенным source после нормализации CRLF.
Обычная точка входа ведёт на0.6.18. JS SHA256
d2b27e647210c99fae286a4cb04a08ed2045d628b2d4bd8dc0414140490d631f.

Папки общие для администраторов, отдельно РМ/РК; создание/название,
множественный выбор, открытие, переименование/перенос, удаление без
остановки слежения. Папки сохраняются в отдельном DO instance
watch-folders-v1; прежний RK monitor instance не менялся. Новых
namespace/migrations/платных AI вызовов нет. Не создавали тестовые
папки и не меняли команды в production от имени реального пользователя.
Фактическая приёмка на телефоне владельца остаётся неподтверждённой;
предложено полностью закрыть и заново открыть Mini App.

Rollback: вернуть frontend к8f9ae88; Worker к версии
5272fa9b-06e0-4fd5-85d6-e555ddf301bc@100. Изолированные данные папок
можно сохранить при откате. Не выполнять без подтверждённой регрессии.
