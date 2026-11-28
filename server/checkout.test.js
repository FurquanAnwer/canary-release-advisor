import test from 'node:test';
import assert from 'node:assert/strict';
import { createCheckout } from './checkout.js';

test('routing, regression and rolling metrics retain actual counts', async () => {
  let clock = 1_000_000;
  const app = createCheckout({ random: () => 0, now: () => clock, sleep: async () => {} });
  app.setConfig({ mode: 'regression', rollout: 5 });
  assert.equal((await app.checkout({ cartId: 'a', amount: 2 })).version, 'canary');
  assert.equal((await app.checkout({ cartId: 'b', amount: 2 }, 'stable')).ok, true);
  assert.deepEqual([app.metrics().canary.requests, app.metrics().canary.errors, app.metrics().stable.requests], [1, 1, 1]);
  clock += 60_001;
  assert.equal(app.metrics().canary.requests, 0);
  assert.equal(app.metrics().canary.errorRate, null);
});

test('config and checkout reject invalid inputs', async () => {
  const app = createCheckout();
  assert.throws(() => app.setConfig({ rollout: 101 }));
  await assert.rejects(app.checkout({ cartId: '', amount: 0 }));
});
