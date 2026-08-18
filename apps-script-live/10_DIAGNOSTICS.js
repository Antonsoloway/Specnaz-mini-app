/**
 * Запускает публичную синхронизацию и обязательно показывает результат
 * в журнале выполнения.
 */
function runPublicSyncNowWithLog() {
  const result = runPublicSyncNow();

  console.log(
    JSON.stringify(result, null, 2)
  );

  return result;
}

/**
 * Показывает текущее состояние публичной синхронизации
 * в журнале выполнения.
 */
function showPublicSyncStatus() {
  const result = getPublicSyncStatus();

  console.log(
    JSON.stringify(result, null, 2)
  );

  return result;
}
