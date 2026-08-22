/* Royal CRM Mini App — final admin edit/delete gate v0.6.0-write.5 */
(() => {
  const VERSION = '0.6.0-write.5-gate.2';
  let checking = false;

  const clean = value => String(value == null ? '' : value).trim();

  function alertUser(text) {
    const message = clean(text);
    try {
      if (window.Telegram?.WebApp?.showAlert) {
        window.Telegram.WebApp.showAlert(message);
        return;
      }
    } catch (_) {}
    alert(message);
  }

  async function finalPermission() {
    const client = window.RoyalAdminDataV0600;
    if (!client?.load) throw new Error('Модуль админских данных не загрузился. Откройте приложение заново.');
    const data = await client.load({ force:true });

    const write = data?.adminData?.write || {};
    const photo = write?.teamPhoto || {};
    const operations = Array.isArray(write?.operations) ? write.operations : [];
    const baseOperationsReady = Boolean(
      operations.includes('updateParticipant') &&
      operations.includes('createParticipant') &&
      operations.includes('updateTeam') &&
      operations.includes('createTeam')
    );
    const write4Ready = Boolean(
      write?.version === '0.6.0-write.4' &&
      write?.deleteEnabled === false
    );
    const write5Ready = Boolean(
      write?.version === '0.6.0-write.5' &&
      write?.deleteEnabled === true &&
      operations.includes('deleteParticipant') &&
      operations.includes('deleteTeam')
    );
    const ready = Boolean(
      data?.permissions?.isAdmin === true &&
      data?.permissions?.canEdit === true &&
      write?.enabled === true &&
      write?.transport === 'worker-signed-hmac' &&
      photo?.enabled === true &&
      photo?.renameCleanup === true &&
      baseOperationsReady &&
      (write4Ready || write5Ready)
    );
    return {ready,deleteReady:write5Ready,data};
  }

  // Registered BEFORE admin-write-v0600-v3.js. This capture listener owns the
  // edit-mode button, so the older UI module cannot bypass final readiness.
  window.addEventListener('click', async event => {
    const button = event.target?.closest?.('[data-admin-edit-mode="1"]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (checking) return;

    checking = true;
    const oldDisabled = !!button.disabled;
    button.disabled = true;
    try {
      const result = await finalPermission();
      if (!result.ready) {
        alertUser('Редактирование ещё не активировано на сервере. Админский просмотр работает, данные изменить нельзя.');
        return;
      }
      if (!window.RoyalAdminWriteV0600?.toggle) {
        alertUser('Модуль редактирования ещё загружается. Нажмите кнопку ещё раз через секунду.');
        return;
      }
      await window.RoyalAdminWriteV0600.toggle(result.data);
    } catch (error) {
      alertUser(error?.message || 'Не удалось проверить доступ к редактированию.');
    } finally {
      button.disabled = oldDisabled;
      checking = false;
    }
  },true);

  window.RoyalAdminWriteGateV0600 = {version:VERSION,check:finalPermission};
})();
