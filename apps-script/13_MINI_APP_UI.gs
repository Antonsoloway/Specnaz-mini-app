/**
 * ROYAL CRM — Telegram Mini App UI bridge
 * Файл: 13_MINI_APP_UI.gs
 * Версия: 0.3.0
 *
 * UI обслуживается самим Apps Script через HtmlService.
 * Авторизация идёт через google.script.run -> MINIAPP_auth(initData),
 * поэтому Telegram initData не попадает в URL и CORS/JSONP не нужны.
 */

const MINIAPP_UI_VERSION = '0.3.0';

function MINIAPP_renderUi_() {
  return HtmlService
    .createHtmlOutputFromFile('MiniApp')
    .setTitle('ЧП Mini App')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

/**
 * Публичный серверный метод для google.script.run.
 * Название специально НЕ заканчивается на подчёркивание — иначе HtmlService
 * не сможет вызвать функцию с клиента.
 */
function MINIAPP_auth(initData) {
  try {
    return MINIAPP_buildAuthResult_({
      parameter: {
        action: 'auth',
        initData: String(initData || '')
      }
    });
  } catch (error) {
    console.error('MINIAPP_auth error', error && error.stack ? error.stack : error);
    return {
      ok: false,
      access: false,
      error: 'SERVER_ERROR',
      message: 'Временная ошибка сервера. Попробуйте ещё раз.',
      version: MINIAPP_VERSION || MINIAPP_UI_VERSION
    };
  }
}
