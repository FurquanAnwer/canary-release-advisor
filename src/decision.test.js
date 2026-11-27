import test from 'node:test';
import assert from 'node:assert/strict';
import { scenarios } from './scenarios.js';
import { CONVERSION_EVENT, VISITOR_STORAGE_KEY, evaluateDecision, getOrCreateVisitorId } from './decision.js';

test('the prepared scenarios have the intended distinct correct actions', () => {
  assert.deepEqual(scenarios.map(({ id, correctAction }) => [id, correctAction]), [
    ['healthy', 'increase'],
    ['regression', 'rollback'],
    ['spike', 'hold'],
  ]);
});

test('only a correct first submission is eligible for conversion', () => {
  for (const scenario of scenarios) {
    const correct = evaluateDecision(scenario, scenario.correctAction, undefined, 1432.6);
    assert.equal(correct.shouldTrack, true);
    assert.deepEqual(correct.decision, { action: scenario.correctAction, correct: true, elapsedMs: 1433 });
    const duplicate = evaluateDecision(scenario, scenario.correctAction, correct.decision, 2000);
    assert.equal(duplicate.shouldTrack, false);
    assert.equal(duplicate.duplicate, true);
    const wrongAction = ['increase', 'hold', 'rollback'].find((action) => action !== scenario.correctAction);
    assert.equal(evaluateDecision(scenario, wrongAction, undefined, 1000).shouldTrack, false);
  }
  assert.equal(CONVERSION_EVENT, 'correct_rollout_decision');
});

test('visitor ID is generated once and reused from local storage', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };
  const first = getOrCreateVisitorId(storage, () => 'stable-random-id');
  const second = getOrCreateVisitorId(storage, () => { throw new Error('should not regenerate'); });
  assert.equal(first, 'visitor_stable-random-id');
  assert.equal(second, first);
  assert.equal(values.get(VISITOR_STORAGE_KEY), first);
});
