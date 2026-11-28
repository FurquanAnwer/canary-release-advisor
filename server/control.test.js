import test from 'node:test';
import assert from 'node:assert/strict';
import { assess, createFlagControl, parseGuardrails } from './control.js';

test('remote guardrails are bounded and status requires fresh representative data', () => {
  assert.equal(parseGuardrails('{"minCanary":5,"errorDelta":0,"latencyDeltaMs":1}').minCanary, 20);
  const policy = parseGuardrails('{"minCanary":40,"errorDelta":0.02,"latencyDeltaMs":50}');
  assert.equal(policy.minCanary, 40);
  const metrics = { lastRequestAt: new Date(10000).toISOString(), stable: { requests: 100, errorRate: 0, p95Ms: 20 }, canary: { requests: 40, errorRate: .1, p95Ms: 30 } };
  assert.equal(assess(metrics, policy, 11000).code, 'regression');
  assert.equal(assess(metrics, policy, 21000).code, 'stale');
});

test('pause requires matching feature state and verifies SDK flag after write', async () => {
  let enabled = false;
  const calls = [];
  const fetcher = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/flags/')) return { ok: true, json: async () => ([{ feature: { name: 'checkout_pause' }, enabled }, { feature: { name: 'checkout_guardrails' }, enabled: false }]) };
    if (options.method === 'PATCH') { enabled = JSON.parse(options.body).enabled; return { ok: true }; }
    return { ok: true, json: async () => ({ feature: 7, feature_segment: null, identity: null, enabled }) };
  };
  const control = createFlagControl({ environmentKey: 'env', managementToken: 'secret', pauseFeatureId: 7, pauseStateId: 8, fetcher });
  assert.equal((await control.refresh()).pause, false);
  assert.deepEqual(await control.applyPause(), { applied: true, alreadyEnabled: false });
  assert.equal(control.status.pause, true);
  assert.equal(calls.filter((call) => call.options.method === 'PATCH').length, 1);
  assert.deepEqual(await control.applyPause(), { applied: true, alreadyEnabled: true });
  assert.equal(calls.filter((call) => call.options.method === 'PATCH').length, 1);
});

test('pause refuses a different flag and unavailable evaluation', async () => {
  const control = createFlagControl({ environmentKey: 'env', managementToken: 'secret', pauseFeatureId: 7, pauseStateId: 8, fetcher: async () => ({ ok: true, json: async () => ({ feature: 99, enabled: false }) }) });
  await assert.rejects(control.applyPause(), /does not match/);
  const unavailable = createFlagControl({ environmentKey: 'env', fetcher: async () => { throw new Error('offline'); } });
  await assert.rejects(unavailable.refresh(), /offline/);
  assert.equal(unavailable.status.pause, null);
});
