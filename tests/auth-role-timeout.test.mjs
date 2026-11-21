import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import worker from '../worker/src/index.js';

const env = {
  BOT_TOKEN: 'fixture-bot',
  SESSION_SECRET: 'fixture-session',
  DATA_REPO: 'fixture/snapshot',
  GITHUB_TOKEN: 'fixture-github',
  TELEGRAM_CHAT_ID: '123',
};

function authRequest() {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: 42 }),
  });
  const key = createHmac('sha256', 'WebAppData').update(env.BOT_TOKEN).digest();
  const fields = Array.from(params, ([k, v]) => k + '=' + v).join('\n');
  params.set('hash', createHmac('sha256', key).update(fields).digest('hex'));
  return new Request('https://worker.test/auth', {
    method: 'POST', body: JSON.stringify({ initData: params.toString() }),
  });
}

for (const scenario of ['slow','left','kicked','member','restricted','administrator']) {
  test('authenticated CRM participant with Telegram role lookup ' + scenario, {timeout: 6000}, async t => {
    t.mock.method(globalThis, 'fetch', async (url, options) => {
      if (new URL(url).hostname === 'api.github.com') {
        return Response.json({ participants: [{ telegramId: '42', chatState: '\u0412 \u0447\u0430\u0442\u0435' }] });
      }
      assert.equal(new URL(url).pathname, '/botfixture-bot/getChatMember');
      if (scenario !== 'slow') return Response.json({ ok: true, result: { status: scenario } });
      return new Promise((_, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason), { once:true });
      });
    });
    const response = await worker.fetch(authRequest(), env);
    const body = await response.json();
    if (['slow','left','kicked','restricted'].includes(scenario)) {
      assert.equal(response.status, scenario === 'slow' ? 503 : 403);
      assert.equal(body.session, undefined);
      return;
    }
    assert.equal(response.status, 200);
    assert.equal(body.access, true);
    assert.ok(body.session);
    assert.equal(body.role.isChatAdmin, scenario === 'administrator');
    assert.equal(body.role.adminCheck, 'OK');
  });
}
