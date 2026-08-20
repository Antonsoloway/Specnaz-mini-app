/* Royal CRM Mini App — final admin edit gate v0.6.0-write.4 */
(() => {
  const VERSION = '0.6.0-write.4-gate.2';
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
    if (!sessionToken) throw new Error('Сессия приложения не готова. Откройте приложение заново.');
    const response = await fetch(`${API_URL}/admin-data`, {
      method:'GET',
      mode:'cors',
      cache:'no-store',
      headers:{Authorization:`Bearer ${sessionToken}`}
    });
    const data = await response.json().catch(()=>({}));
    if (!response.ok || !data?.ok) {
      throw new Error(data?.message || 'Не удалось проверить админские права.');
    }

    const write = data?.adminData?.write || {};
    const photo = write?.teamPhoto || {};
    const operations = Array.isArray(write?.operations) ? write.operations : [];
    const ready = Boolean(
      data?.permissions?.isAdmin === true &&
      data?.permissions?.canEdit === true &&
      write?.enabled === true &&
      write?.version === '0.6.0-write.4' &&
      write?.transport === 'worker-signed-hmac' &&
      write?.deleteEnabled === false &&
      photo?.enabled === true &&
      photo?.renameCleanup === true &&
      operations.includes('updateParticipant') &&
      operations.includes('createParticipant') &&
      operations.includes('updateTeam') &&
      operations.includes('createTeam')
    );
    return {ready,data};
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
      await window.RoyalAdminWriteV0600.toggle();
    } catch (error) {
      alertUser(error?.message || 'Не удалось проверить доступ к редактированию.');
    } finally {
      button.disabled = oldDisabled;
      checking = false;
    }
  },true);

  window.RoyalAdminWriteGateV0600 = {version:VERSION,check:finalPermission};
})();
