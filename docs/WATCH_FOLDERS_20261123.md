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
