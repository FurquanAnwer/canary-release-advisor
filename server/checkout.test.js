import test from 'node:test';
import assert from 'node:assert/strict';
import { createCheckout } from './checkout.js';
import { createAssignment, localVersion } from './assignment.js';

test('routing, regression and rolling metrics retain actual counts', async () => {
  let clock = 1_000_000;
  const app = createCheckout({ random: () => 0, now: () => clock, sleep: async () => {} });
  app.setConfig({ mode: 'regression', rollout: 5 });
  assert.equal((await app.checkout({ cartId: 'a', shopperId: 'same', amount: 2 }, { version: 'canary', source: 'flagsmith' })).version, 'canary');
  assert.equal((await app.checkout({ cartId: 'b', shopperId: 'other', amount: 2 }, { version: 'stable', source: 'flagsmith' })).ok, true);
  assert.deepEqual([app.metrics().canary.requests, app.metrics().canary.errors, app.metrics().stable.requests], [1, 1, 1]);
  clock += 60_001;
  assert.equal(app.metrics().canary.requests, 0);
  assert.equal(app.metrics().canary.errorRate, null);
});

test('config and checkout reject invalid inputs', async () => {
  const app = createCheckout();
  assert.throws(() => app.setConfig({ rollout: 101 }));
  await assert.rejects(app.checkout({ cartId: '', amount: 0 }));
  assert.throws(() => app.recordDecision({ action: 'deploy', note: '' }));
  const snapshot = app.recordDecision({ action: 'hold', note: 'checking sample' });
  assert.equal(snapshot.action, 'hold');
  assert.equal(app.metrics().timeline[0].type, 'decision');
});

test('shopper assignment sticks locally; Flagsmith flag controls version and fails closed', async () => {
  assert.equal(localVersion('repeat', 20), localVersion('repeat', 20));
  let calls = 0;
  const flags = createAssignment({ environmentKey: 'demo', fetcher: async (url, options) => {
    calls++;
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body).traits, [{ trait_key: 'region', trait_value: 'IN' }]);
    return { ok: true, json: async () => ({ flags: [{ feature: { name: 'checkout_canary' }, enabled: true, feature_state_value: 'canary' }] }) };
  } });
  assert.deepEqual(await flags.assign('repeat', 5, { region: 'IN' }), { version: 'canary', source: 'flagsmith' });
  await flags.assign('repeat', 5, { region: 'IN' });
  assert.equal(calls, 1);
  const unavailable = createAssignment({ environmentKey: 'demo', fetcher: async () => { throw new Error('offline'); } });
  assert.deepEqual(await unavailable.assign('repeat', 5), { version: 'stable', source: 'flagsmith-unavailable' });
});
