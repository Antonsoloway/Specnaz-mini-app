function ensureHistoryStructureForAppend_(sheet) {
  const expected = [
    'Дата', 'Аватар', 'Имя', 'Команда', 'Было', 'Стало', 'Добавлено',
    'Звание', 'Сообщение', 'Источник', 'Строка базы', 'Telegram ID',
    'Ключ события', 'Тип события', 'Имя для Telegram-ссылки', 'Ссылка сообщения'
  ];
  if (sheet.getMaxColumns() >= HISTORY_WIDTH) {
    const actual = sheet.getRange(1, 1, 1, HISTORY_WIDTH).getDisplayValues()[0];
    if (expected.every(function(header, i) { return clean_(actual[i]) === header; })) return;
  }
  ensureHistoryStructure_(sheet);
}

