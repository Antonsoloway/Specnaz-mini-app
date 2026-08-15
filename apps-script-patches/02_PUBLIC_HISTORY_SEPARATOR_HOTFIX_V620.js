function syncWritePublicHistory_(sheet, rows) {
  const safeRows = Array.isArray(rows) ? rows : [];

  syncEnsureGrid_(
    sheet,
    Math.max(safeRows.length + 2, 2),
    HISTORY_WIDTH
  );

  const maxRows = sheet.getMaxRows();
  const bodyRowCount = Math.max(maxRows - 1, 1);
  const area = sheet.getRange(
    2,
    1,
    bodyRowCount,
    HISTORY_WIDTH
  );

  area.breakApart();
  area.clearContent();
  area.clearFormat();

  sheet.getRange(1, 1, 1, HISTORY_WIDTH).setValues([[
    'Дата',
    'Аватар',
    'Имя',
    'Команда',
    'Было',
    'Стало',
    'Добавлено',
    'Звание',
    'Сообщение',
    'Источник',
    'Строка базы',
    'Telegram ID',
    'Ключ события',
    'Тип события',
    'Имя для Telegram-ссылки',
    'Ссылка сообщения'
  ]]);

  const titleRows = [];
  const dataRows = [];

  safeRows.forEach(function(row, index) {
    const rowNumber = index + 2;
    const isTitle = /^Спецназ с /i.test(
      clean_(row[HISTORY_COL_DATE - 1])
    );

    if (isTitle) titleRows.push(rowNumber);
    else dataRows.push(rowNumber);
  });

  if (safeRows.length) {
    sheet
      .getRange(2, 1, safeRows.length, HISTORY_WIDTH)
      .setFontFamily('Arial')
      .setFontSize(11)
      .setFontWeight('normal')
      .setFontColor(null)
      .setBackground(null);

    sheet
      .getRange(2, 1, safeRows.length, HISTORY_WIDTH)
      .setValues(safeRows);

    syncApplyPublicHistoryMessageLinks_(sheet, safeRows);
  }

  dataRows.forEach(function(rowNumber) {
    const formula =
      '=IF($L' + rowNumber +
      '="";"";IFERROR(INDEX(\'Аватары\'!$B$2:$B$999;MATCH($L' +
      rowNumber +
      ';\'Аватары\'!$A$2:$A$999;0));""))';

    sheet
      .getRange(rowNumber, HISTORY_COL_AVATAR)
      .setFormula(formula);

    sheet.setRowHeight(rowNumber, 55);
  });

  titleRows.forEach(function(rowNumber) {
    const range = sheet.getRange(
      rowNumber,
      1,
      1,
      HISTORY_VISIBLE_WIDTH
    );

    range.breakApart();
    range.merge();

    range
      .setBackground('#1F4E78')
      .setFontColor('#FFFFFF')
      .setFontFamily('Arial')
      .setFontSize(18)
      .setFontWeight('bold')
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle')
      .setWrap(true)
      .setBorder(
        true,
        true,
        true,
        true,
        false,
        false,
        '#1F4E78',
        SpreadsheetApp.BorderStyle.SOLID_THICK
      );

    sheet.setRowHeight(rowNumber, 55);
  });

  if (safeRows.length) {
    sheet
      .getRange(2, HISTORY_COL_DATE, safeRows.length, 1)
      .setNumberFormat('dd.MM.yyyy H:mm:ss');

    sheet
      .getRange(2, HISTORY_COL_OLD, safeRows.length, 3)
      .setNumberFormat('0');

    sheet
      .getRange(2, HISTORY_COL_TG_ID, safeRows.length, 1)
      .setNumberFormat('@');

    sheet
      .getRange(2, HISTORY_COL_LEGACY_TG_HELPER, safeRows.length, 2)
      .setNumberFormat('@');

    sheet
      .getRange(2, HISTORY_COL_NAME, safeRows.length, 2)
      .setWrap(true)
      .setVerticalAlignment('middle');

    sheet
      .getRange(2, HISTORY_COL_MESSAGE, safeRows.length, 1)
      .setWrap(true)
      .setVerticalAlignment('top');
  }

  sheet.setFrozenRows(1);
  sheet.setColumnWidth(HISTORY_COL_DATE, 145);
  sheet.setColumnWidth(HISTORY_COL_AVATAR, 74);
  sheet.setColumnWidth(HISTORY_COL_NAME, 285);
  sheet.setColumnWidth(HISTORY_COL_TEAM, 320);
  sheet.setColumnWidths(HISTORY_COL_OLD, 3, 74);
  sheet.setColumnWidth(HISTORY_COL_RANK, 125);
  sheet.setColumnWidth(HISTORY_COL_MESSAGE, 420);
  sheet.setColumnWidth(HISTORY_COL_LEGACY_TG_HELPER, 200);
  sheet.setColumnWidth(HISTORY_COL_MESSAGE_LINK, 240);

  try {
    sheet.showColumns(1, HISTORY_VISIBLE_WIDTH);
    sheet.hideColumns(
      HISTORY_COL_SOURCE,
      HISTORY_WIDTH - HISTORY_COL_SOURCE + 1
    );
  } catch (err) {}

  syncApplyPublicHistoryConditionalFormatting_(sheet);
}
