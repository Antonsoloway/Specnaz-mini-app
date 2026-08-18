/**
 * Royal CRM — совместимость старого edit-модуля.
 * Файл: 06_Reliable_Edit_Trigger.gs
 * Версия: 2.2 OPTIMIZED
 *
 * Основной обработчик ролей и команд теперь находится в
 * 07_FINAL_ROLE_FIX.gs. Этот файл сохраняет старые имена функций,
 * чтобы ручные запуски и старые закладки не ломались, но не создаёт
 * второй конкурирующий onEdit-триггер.
 */

const RELIABLE_EDIT_HANDLER_ = 'royalCrmInstalledOnEdit';

/** Старый обработчик перенаправляется в единственный рабочий обработчик 07. */
function royalCrmInstalledOnEdit(e) {
  if (typeof finalRoleInstalledOnEdit_ === 'function') {
    return finalRoleInstalledOnEdit_(e);
  }
  if (typeof onEdit === 'function') return onEdit(e);
}

function handleTeamsSheetEdit_(e) {
  if (typeof finalRoleHandleTeamsSheetEdit_ === 'function') {
    return finalRoleHandleTeamsSheetEdit_(e);
  }
}

function normalizeTeamsGameOrder_(sheet) {
  if (typeof finalRoleNormalizeTeamsOrder_ === 'function') {
    return finalRoleNormalizeTeamsOrder_(sheet);
  }
  return 0;
}

/** Ручная нормализация порядка команд с короткой транзакцией базы. */
function normalizeTeamsGameOrder() {
  const lock = LockService.getScriptLock();
  let mutationStarted = false;

  try {
    if (!lock.tryLock(3000)) return { status: 'RETRY_LOCKED' };

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_TEAMS);
    if (!sheet) throw new Error('Не найден лист «' + SHEET_TEAMS + '»');

    if (typeof beginPublicDataMutation_ === 'function') {
      beginPublicDataMutation_('manual_teams_game_order');
      mutationStarted = true;
    }

    const movedRows = normalizeTeamsGameOrder_(sheet);
    if (typeof markPublicSyncPending_ === 'function') {
      markPublicSyncPending_('manual_teams_game_order:moved=' + movedRows);
    }

    SpreadsheetApp.flush();
    return {
      status: 'OK',
      moved_rows: movedRows,
      active_handler: typeof FINALROLE_HANDLER_ !== 'undefined'
        ? FINALROLE_HANDLER_
        : 'finalRoleInstalledOnEdit_'
    };
  } finally {
    if (mutationStarted && typeof finishPublicDataMutation_ === 'function') {
      try { finishPublicDataMutation_('manual_teams_game_order'); } catch (err) {}
    }
    try { lock.releaseLock(); } catch (err) {}
  }
}

/**
 * Совместимое имя установки. Настраивает весь оптимизированный проект,
 * а не создаёт второй onEdit-триггер.
 */
function installReliableEditTrigger() {
  if (typeof installRoyalCrmOptimization === 'function') {
    return installRoyalCrmOptimization();
  }
  if (typeof installFinalRoleFix === 'function') {
    return installFinalRoleFix();
  }
  throw new Error('Не найден установщик оптимизированных триггеров');
}
