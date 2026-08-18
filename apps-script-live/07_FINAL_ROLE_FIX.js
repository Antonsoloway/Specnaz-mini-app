/**
 * FINAL ROLE FIX 2.0 — пакетная установка без зависаний на Android.
 *
 * Логика остаётся строго прежней:
 * - команда указана: Лидер / Помощник / Игрок;
 * - команды нет: Спецназ РМ / Спецназ РК;
 * - НЕТ КОМАНДЫ очищает команду и роль.
 *
 * Этот файл самодостаточный и использует уникальные имена функций,
 * поэтому не конфликтует со старыми applyAllRoleValidations_,
 * applyRoleValidationForCell_ и updateRoleRulesAfterEdit_.
 *
 * Установка:
 * 1. Создать файл Apps Script: 07_FINAL_ROLE_FIX
 * 2. Вставить весь код.
 * 3. Сохранить.
 * 4. Один раз выполнить installFinalRoleFix().
 * 5. Редактор можно закрыть: установка продолжится фоновыми частями.
 * 6. Проверять прогресс функцией checkFinalRoleFixProgress().
 */

const FINALROLE_SPREADSHEET_ID_ =
  '1kkADcKysWdoGy95O36z9jCaoGUUHN0g4XH4LwVtAK_o';

const FINALROLE_BASE_SHEET_ = 'База участников';
const FINALROLE_HELPER_SHEET_ = 'Списки';
const FINALROLE_TEAMS_SHEET_ = 'Команды';

const FINALROLE_FIRST_ROW_ = 2;
const FINALROLE_LAST_ROW_ = 999;
const FINALROLE_NO_TEAM_ = 'НЕТ КОМАНДЫ';

const FINALROLE_TEAM_ROLES_ = ['Лидер', 'Помощник', 'Игрок'];
const FINALROLE_SPECNAZ_ROLES_ = ['Спецназ РМ', 'Спецназ РК'];

const FINALROLE_HANDLER_ = 'finalRoleInstalledOnEdit_';
const FINALROLE_INSTALL_HANDLER_ = 'continueFinalRoleFixInstall';
const FINALROLE_INSTALL_STATE_KEY_ = 'FINALROLE_INSTALL_STATE_V3';
const FINALROLE_BATCH_ROWS_ = 100;

/**
 * teamCol — столбец команды;
 * roleCol — соответствующий столбец роли;
 * helperCol — первый из трёх служебных столбцов на листе «Списки».
 */
const FINALROLE_SLOTS_ = [
  {number: 1, teamCol: 5,  roleCol: 7,  helperCol: 3},   // E -> G, C:E
  {number: 2, teamCol: 8,  roleCol: 10, helperCol: 6},   // H -> J, F:H
  {number: 3, teamCol: 11, roleCol: 13, helperCol: 9},   // K -> M, I:K
  {number: 4, teamCol: 14, roleCol: 16, helperCol: 12},  // N -> P, L:N
  {number: 5, teamCol: 17, roleCol: 19, helperCol: 15}   // Q -> S, O:Q
];

/**
 * Запустить один раз вручную.
 */
function installFinalRoleFix() {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000);

    const ss = SpreadsheetApp.openById(FINALROLE_SPREADSHEET_ID_);
    const base = ss.getSheetByName(FINALROLE_BASE_SHEET_);
    const helper = ss.getSheetByName(FINALROLE_HELPER_SHEET_);

    if (!base) {
      throw new Error('Не найден лист «' + FINALROLE_BASE_SHEET_ + '»');
    }

    if (!helper) {
      throw new Error('Не найден скрытый лист «' + FINALROLE_HELPER_SHEET_ + '»');
    }

    // Быстрая подготовка: всего 15 ARRAYFORMULA вместо 14 970 формул.
    finalRoleBuildHelperLists_(base, helper);
    SpreadsheetApp.flush();

    // Повторный запуск безопасно начинает установку заново.
    finalRoleDeleteTriggersByHandler_(FINALROLE_INSTALL_HANDLER_);

    const state = {
      status: 'RUNNING',
      version: 'FINAL_ROLE_FIX_2.0_BATCHED',
      next_row: FINALROLE_FIRST_ROW_,
      last_completed_row: FINALROLE_FIRST_ROW_ - 1,
      total_rows: FINALROLE_LAST_ROW_ - FINALROLE_FIRST_ROW_ + 1,
      processed_role_cells: 0,
      total_role_cells:
        (FINALROLE_LAST_ROW_ - FINALROLE_FIRST_ROW_ + 1) *
        FINALROLE_SLOTS_.length,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      error: ''
    };

    finalRoleSaveInstallState_(state);
    finalRoleScheduleNextBatch_();

    const result = {
      status: 'STARTED',
      message:
        'Установка разбита на небольшие фоновые части. ' +
        'Редактор можно закрыть.',
      batch_rows: FINALROLE_BATCH_ROWS_,
      total_rows: state.total_rows,
      total_role_cells: state.total_role_cells,
      next_function: 'checkFinalRoleFixProgress'
    };

    console.log(JSON.stringify(result, null, 2));
    return result;

  } finally {
    try {
      lock.releaseLock();
    } catch (error) {}
  }
}

/**
 * Устанавливаемый обработчик редактирования.
 * Не вызывает старый onEdit(e) и не зависит от его функций.
 */
function finalRoleInstalledOnEdit_(e) {
  if (!e || !e.range) return;

  const sheet = e.range.getSheet();
  const sheetName = sheet.getName();
  if (sheetName === FINALROLE_TEAMS_SHEET_) {
    return finalRoleHandleTeamsSheetEdit_(e);
  }
  if (sheetName !== FINALROLE_BASE_SHEET_) return;

  const firstRow = Math.max(e.range.getRow(), FINALROLE_FIRST_ROW_);
  const lastRow = Math.min(e.range.getLastRow(), FINALROLE_LAST_ROW_);
  const firstCol = e.range.getColumn();
  const lastCol = e.range.getLastColumn();
  if (firstRow > lastRow) return;

  const touchedSlots = FINALROLE_SLOTS_.filter(function(slot) {
    return (
      (firstCol <= slot.teamCol && lastCol >= slot.teamCol) ||
      (firstCol <= slot.roleCol && lastCol >= slot.roleCol)
    );
  });
  if (!touchedSlots.length) return;

  const lock = LockService.getScriptLock();
  let mutationStarted = false;

  try {
    if (!lock.tryLock(3000)) return;

    const ss = sheet.getParent();
    const helper = ss.getSheetByName(FINALROLE_HELPER_SHEET_);
    if (!helper) {
      throw new Error('Не найден скрытый лист «' +
        FINALROLE_HELPER_SHEET_ + '»');
    }

    if (typeof beginPublicDataMutation_ === 'function') {
      beginPublicDataMutation_('role_edit:' + e.range.getA1Notation());
      mutationStarted = true;
    }

    touchedSlots.forEach(function(slot) {
      for (let row = firstRow; row <= lastRow; row++) {
        finalRoleNormalizeRowSlot_(sheet, helper, row, slot);
      }
    });

    markPublicSyncPending_('role_edit:' + e.range.getA1Notation());
  } finally {
    if (mutationStarted && typeof finishPublicDataMutation_ === 'function') {
      try {
        finishPublicDataMutation_('role_edit:' + e.range.getA1Notation());
      } catch (error) {}
    }
    try { lock.releaseLock(); } catch (error) {}
  }
}

/**
 * Обрабатывает лист «Команды» и сохраняет порядок:
 * все Royal Match выше всех Royal Kingdom.
 */
function finalRoleHandleTeamsSheetEdit_(e) {
  const range = e.range;
  const sheet = range.getSheet();
  if (range.getLastRow() < 2) return;

  const firstColumn = range.getColumn();
  const lastColumn = range.getLastColumn();
  if (firstColumn > 2 || lastColumn < 1) return;

  const lock = LockService.getScriptLock();
  let mutationStarted = false;

  try {
    if (!lock.tryLock(3000)) return;

    if (typeof beginPublicDataMutation_ === 'function') {
      beginPublicDataMutation_('teams_edit:' + range.getA1Notation());
      mutationStarted = true;
    }

    const movedRows = finalRoleNormalizeTeamsOrder_(sheet);
    markPublicSyncPending_(
      'teams_edit:' + range.getA1Notation() + ':moved=' + movedRows
    );
  } finally {
    if (mutationStarted && typeof finishPublicDataMutation_ === 'function') {
      try {
        finishPublicDataMutation_('teams_edit:' + range.getA1Notation());
      } catch (error) {}
    }
    try { lock.releaseLock(); } catch (error) {}
  }
}

function finalRoleNormalizeTeamsOrder_(sheet) {
  const firstDataRow = 2;
  const rowCount = Math.max(sheet.getMaxRows() - firstDataRow + 1, 1);

  const values = sheet
    .getRange(firstDataRow, 1, rowCount, 2)
    .getDisplayValues();

  let lastUsedIndex = -1;

  values.forEach((row, index) => {
    const game = finalRoleClean_(row[0]);
    const team = finalRoleClean_(row[1]);

    if (game !== '' || team !== '') lastUsedIndex = index;
  });

  if (lastUsedIndex < 0) return 0;

  const currentRows = values
    .slice(0, lastUsedIndex + 1)
    .map(row => [
      finalRoleClean_(row[0]),
      finalRoleClean_(row[1])
    ]);

  let destinationIndex = 0;
  let movedRows = 0;

  ['Royal Match', 'Royal Kingdom'].forEach(gameName => {
    for (
      let sourceIndex = destinationIndex;
      sourceIndex < currentRows.length;
      sourceIndex++
    ) {
      if (currentRows[sourceIndex][0] !== gameName) continue;

      if (sourceIndex !== destinationIndex) {
        const sourceRow = firstDataRow + sourceIndex;
        const destinationRow = firstDataRow + destinationIndex;

        sheet.moveRows(
          sheet.getRange(sourceRow, 1, 1, sheet.getMaxColumns()),
          destinationRow
        );

        const moved = currentRows.splice(sourceIndex, 1)[0];
        currentRows.splice(destinationIndex, 0, moved);
        movedRows++;
      }

      destinationIndex++;
    }
  });

  return movedRows;
}

/**
 * Строит постоянные служебные списки для всех строк и пяти слотов.
 */
function finalRoleBuildHelperLists_(base, helper) {
  const rowCount = FINALROLE_LAST_ROW_ - FINALROLE_FIRST_ROW_ + 1;
  const helperWidth = FINALROLE_SLOTS_.length * 3;
  const headers = [];
  const formulas = [];

  FINALROLE_SLOTS_.forEach(slot => {
    headers.push(
      'Роль ' + slot.number + ' — вариант 1',
      'Роль ' + slot.number + ' — вариант 2',
      'Роль ' + slot.number + ' — вариант 3'
    );

    const teamRange =
      "'" + FINALROLE_BASE_SHEET_ + "'!" +
      finalRoleColumnLetter_(slot.teamCol) + FINALROLE_FIRST_ROW_ + ':' +
      finalRoleColumnLetter_(slot.teamCol) + FINALROLE_LAST_ROW_;

    formulas.push(
      '=ARRAYFORMULA(IF(' + teamRange + '<>"";"Лидер";"Спецназ РМ"))',
      '=ARRAYFORMULA(IF(' + teamRange + '<>"";"Помощник";"Спецназ РК"))',
      '=ARRAYFORMULA(IF(' + teamRange + '<>"";"Игрок";""))'
    );
  });

  helper
    .getRange(1, 3, 1, helperWidth)
    .setValues([headers]);

  // Очищаем старые индивидуальные формулы, чтобы ARRAYFORMULA могла развернуться.
  helper
    .getRange(FINALROLE_FIRST_ROW_, 3, rowCount, helperWidth)
    .clearContent();

  helper
    .getRange(FINALROLE_FIRST_ROW_, 3, 1, helperWidth)
    .setFormulas([formulas]);
}

/**
 * Назначает каждой ячейке роли диапазон именно своей строки.
 */
function finalRoleApplyAllValidations_(base, helper) {
  // Полная установка больше не выполняется одним тяжёлым запуском.
  // Функция оставлена для совместимости и запускает пакетную установку.
  return installFinalRoleFix();
}

/**
 * Обрабатывает одну строку и один командный слот.
 */
function finalRoleNormalizeRowSlot_(base, helper, row, slot) {
  const teamCell = base.getRange(row, slot.teamCol);
  const roleCell = base.getRange(row, slot.roleCol);

  let team = finalRoleClean_(teamCell.getDisplayValue());
  let role = finalRoleClean_(roleCell.getDisplayValue());

  if (team.toUpperCase() === FINALROLE_NO_TEAM_) {
    teamCell.clearContent();
    roleCell.clearContent();
    team = '';
    role = '';
  }

  if (team) {
    if (FINALROLE_TEAM_ROLES_.indexOf(role) === -1) {
      roleCell.setValue('Игрок');
    }
  } else {
    if (
      role &&
      FINALROLE_SPECNAZ_ROLES_.indexOf(role) === -1
    ) {
      roleCell.clearContent();
    }
  }

  // Главное: правило всегда возвращается к диапазону своей строки.
  roleCell.setDataValidation(
    finalRoleBuildRule_(helper, row, slot)
  );
}

function finalRoleBuildRule_(helper, row, slot) {
  const helperRange = helper.getRange(
    row,
    slot.helperCol,
    1,
    3
  );

  return SpreadsheetApp.newDataValidation()
    .requireValueInRange(helperRange, true)
    .setAllowInvalid(false)
    .setHelpText(
      'Команда есть: Лидер / Помощник / Игрок. ' +
      'Команды нет: Спецназ РМ / Спецназ РК.'
    )
    .build();
}

/**
 * Запустить после установки для отдельной проверки.
 */
function verifyFinalRoleFix() {
  const progress = checkFinalRoleFixProgress();

  if (progress.status !== 'DONE') {
    console.log(JSON.stringify({
      status: 'WAIT',
      message: 'Установка ещё не завершена',
      progress: progress
    }, null, 2));

    return progress;
  }

  const ss = SpreadsheetApp.openById(FINALROLE_SPREADSHEET_ID_);
  const base = ss.getSheetByName(FINALROLE_BASE_SHEET_);

  if (!base) {
    throw new Error('Не найден лист «' + FINALROLE_BASE_SHEET_ + '»');
  }

  const verification = finalRoleVerify_(base);

  const result = {
    status: verification.wrong_rules === 0 ? 'OK' : 'ERROR',
    installation_status: progress.status,
    checked_sample_cells: verification.checked_cells,
    correct_sample_rules: verification.correct_rules,
    wrong_sample_rules: verification.wrong_rules,
    examples: verification.examples
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}

function finalRoleVerify_(base) {
  let checked = 0;
  let correct = 0;
  const examples = [];

  // Проверяем репрезентативные строки, а не все 4 990 правил за один запуск.
  const sampleRows = [2, 50, 176, 300, 500, 750, 999];

  FINALROLE_SLOTS_.forEach(slot => {
    sampleRows.forEach(row => {
      const rule = base
        .getRange(row, slot.roleCol)
        .getDataValidation();

      checked++;

      let valid = false;
      let actual = 'нет правила';

      if (rule) {
        const type = rule.getCriteriaType();
        const values = rule.getCriteriaValues();

        actual = String(type);

        if (
          type === SpreadsheetApp.DataValidationCriteria.VALUE_IN_RANGE &&
          values &&
          values[0]
        ) {
          const range = values[0];
          const expectedA1 =
            finalRoleColumnLetter_(slot.helperCol) + row + ':' +
            finalRoleColumnLetter_(slot.helperCol + 2) + row;

          actual =
            range.getSheet().getName() + '!' +
            range.getA1Notation();

          valid =
            range.getSheet().getName() === FINALROLE_HELPER_SHEET_ &&
            range.getA1Notation() === expectedA1;
        }
      }

      if (valid) {
        correct++;
      } else if (examples.length < 20) {
        examples.push({
          cell: finalRoleColumnLetter_(slot.roleCol) + row,
          expected:
            FINALROLE_HELPER_SHEET_ + '!' +
            finalRoleColumnLetter_(slot.helperCol) + row + ':' +
            finalRoleColumnLetter_(slot.helperCol + 2) + row,
          actual: actual
        });
      }
    });
  });

  return {
    checked_cells: checked,
    correct_rules: correct,
    wrong_rules: checked - correct,
    examples: examples
  };
}


/**
 * Фоновый обработчик одной части установки.
 * Его запускает временный таймер; вручную запускать не требуется.
 */
function continueFinalRoleFixInstall() {
  const lock = LockService.getScriptLock();

  try {
    if (!lock.tryLock(30000)) {
      finalRoleScheduleNextBatch_();
      return;
    }

    const state = finalRoleLoadInstallState_();

    if (!state || state.status !== 'RUNNING') {
      finalRoleDeleteTriggersByHandler_(FINALROLE_INSTALL_HANDLER_);
      return;
    }

    const ss = SpreadsheetApp.openById(FINALROLE_SPREADSHEET_ID_);
    const base = ss.getSheetByName(FINALROLE_BASE_SHEET_);
    const helper = ss.getSheetByName(FINALROLE_HELPER_SHEET_);

    if (!base || !helper) {
      throw new Error('Не найдены рабочие листы установки ролей');
    }

    const startRow = Math.max(
      Number(state.next_row) || FINALROLE_FIRST_ROW_,
      FINALROLE_FIRST_ROW_
    );

    const endRow = Math.min(
      startRow + FINALROLE_BATCH_ROWS_ - 1,
      FINALROLE_LAST_ROW_
    );

    finalRoleApplyValidationBatch_(base, helper, startRow, endRow);
    SpreadsheetApp.flush();

    state.last_completed_row = endRow;
    state.next_row = endRow + 1;
    state.processed_role_cells =
      (endRow - FINALROLE_FIRST_ROW_ + 1) *
      FINALROLE_SLOTS_.length;
    state.updated_at = new Date().toISOString();
    state.error = '';

    if (endRow >= FINALROLE_LAST_ROW_) {
      finalRoleFinishInstallation_(ss, state);
    } else {
      finalRoleSaveInstallState_(state);
      finalRoleScheduleNextBatch_();
    }

    console.log(JSON.stringify(state, null, 2));

  } catch (error) {
    const failedState = finalRoleLoadInstallState_() || {};
    failedState.status = 'ERROR';
    failedState.error = String(error && error.message ? error.message : error);
    failedState.updated_at = new Date().toISOString();
    finalRoleSaveInstallState_(failedState);
    finalRoleDeleteTriggersByHandler_(FINALROLE_INSTALL_HANDLER_);
    console.error(JSON.stringify(failedState, null, 2));

  } finally {
    try {
      lock.releaseLock();
    } catch (error) {}
  }
}

function finalRoleApplyValidationBatch_(base, helper, startRow, endRow) {
  const rowCount = endRow - startRow + 1;

  FINALROLE_SLOTS_.forEach(slot => {
    const validations = [];

    for (let row = startRow; row <= endRow; row++) {
      validations.push([
        finalRoleBuildRule_(helper, row, slot)
      ]);
    }

    base
      .getRange(startRow, slot.roleCol, rowCount, 1)
      .setDataValidations(validations);
  });
}

function finalRoleFinishInstallation_(ss, state) {
  finalRoleDeleteTriggersByHandler_(FINALROLE_INSTALL_HANDLER_);

  // Только после полной установки заменяем старые onEdit-триггеры.
  let deletedEditTriggers = 0;

  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getEventType() === ScriptApp.EventType.ON_EDIT) {
      ScriptApp.deleteTrigger(trigger);
      deletedEditTriggers++;
    }
  });

  ScriptApp.newTrigger(FINALROLE_HANDLER_)
    .forSpreadsheet(FINALROLE_SPREADSHEET_ID_)
    .onEdit()
    .create();

  const teamsSheet = ss.getSheetByName(FINALROLE_TEAMS_SHEET_);
  const movedTeamRows = teamsSheet
    ? finalRoleNormalizeTeamsOrder_(teamsSheet)
    : 0;

  state.status = 'DONE';
  state.next_row = FINALROLE_LAST_ROW_ + 1;
  state.last_completed_row = FINALROLE_LAST_ROW_;
  state.processed_role_cells = state.total_role_cells;
  state.deleted_old_edit_triggers = deletedEditTriggers;
  state.created_trigger = FINALROLE_HANDLER_;
  state.moved_team_rows = movedTeamRows;
  state.completed_at = new Date().toISOString();
  state.updated_at = state.completed_at;
  state.error = '';

  finalRoleSaveInstallState_(state);
  SpreadsheetApp.flush();
}

/**
 * Показывает прогресс и не выполняет тяжёлую проверку.
 */
function checkFinalRoleFixProgress() {
  const state = finalRoleLoadInstallState_();
  const continuationTriggers = ScriptApp.getProjectTriggers()
    .filter(trigger =>
      trigger.getHandlerFunction() === FINALROLE_INSTALL_HANDLER_
    )
    .length;
  const editTriggers = ScriptApp.getProjectTriggers()
    .filter(trigger =>
      trigger.getHandlerFunction() === FINALROLE_HANDLER_
    )
    .length;

  const result = state || {
    status: 'NOT_STARTED',
    message: 'Сначала запустите installFinalRoleFix'
  };

  result.continuation_triggers = continuationTriggers;
  result.final_edit_triggers = editTriggers;

  console.log(JSON.stringify(result, null, 2));
  return result;
}

/**
 * Возобновляет установку после временного сбоя.
 */
function resumeFinalRoleFixInstall() {
  const state = finalRoleLoadInstallState_();

  if (!state) {
    return installFinalRoleFix();
  }

  if (state.status === 'DONE') {
    console.log(JSON.stringify(state, null, 2));
    return state;
  }

  state.status = 'RUNNING';
  state.error = '';
  state.updated_at = new Date().toISOString();
  finalRoleSaveInstallState_(state);
  finalRoleScheduleNextBatch_();

  const result = {
    status: 'RESUMED',
    next_row: state.next_row,
    message: 'Фоновая установка продолжена'
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}

function cancelFinalRoleFixInstall() {
  finalRoleDeleteTriggersByHandler_(FINALROLE_INSTALL_HANDLER_);

  const state = finalRoleLoadInstallState_() || {};
  state.status = 'CANCELLED';
  state.updated_at = new Date().toISOString();
  finalRoleSaveInstallState_(state);

  console.log(JSON.stringify(state, null, 2));
  return state;
}

function finalRoleScheduleNextBatch_() {
  finalRoleDeleteTriggersByHandler_(FINALROLE_INSTALL_HANDLER_);

  ScriptApp.newTrigger(FINALROLE_INSTALL_HANDLER_)
    .timeBased()
    .after(15000)
    .create();
}

function finalRoleDeleteTriggersByHandler_(handlerName) {
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === handlerName) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function finalRoleSaveInstallState_(state) {
  PropertiesService.getScriptProperties().setProperty(
    FINALROLE_INSTALL_STATE_KEY_,
    JSON.stringify(state)
  );
}

function finalRoleLoadInstallState_() {
  const raw = PropertiesService.getScriptProperties().getProperty(
    FINALROLE_INSTALL_STATE_KEY_
  );

  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function finalRoleClean_(value) {
  return String(value == null ? '' : value).trim();
}

function finalRoleColumnLetter_(column) {
  let result = '';
  let number = column;

  while (number > 0) {
    const remainder = (number - 1) % 26;
    result =
      String.fromCharCode(65 + remainder) + result;
    number = Math.floor((number - 1) / 26);
  }

  return result;
}


