export const CONVERSION_EVENT = 'correct_rollout_decision';
export const SUBMISSION_EVENT = 'rollout_decision_submitted';
export const PRIMARY_STORAGE_KEY = 'canary-primary-scenario-v1';
export const VISITOR_STORAGE_KEY = 'canary-control-room-visitor-v1';

export function getOrCreateVisitorId(storage, randomUUID) {
  const existing = storage.getItem(VISITOR_STORAGE_KEY);
  if (existing) return existing;
  const id = `visitor_${randomUUID()}`;
  storage.setItem(VISITOR_STORAGE_KEY, id);
  return id;
}

export function getOrAssignPrimaryScenario(storage, visitorId, scenarioIds, random = Math.random) {
  const key = `${PRIMARY_STORAGE_KEY}-${visitorId}`;
  const existing = storage.getItem(key);
  if (scenarioIds.includes(existing)) return existing;
  const selected = scenarioIds[Math.floor(Math.min(Math.max(random(), 0), 0.999999) * scenarioIds.length)];
  storage.setItem(key, selected);
  return selected;
}

export function evaluateDecision(scenario, action, priorDecision, elapsedMs) {
  if (priorDecision) return { decision: priorDecision, shouldTrack: false, duplicate: true };
  if (!['increase', 'hold', 'rollback'].includes(action)) throw new Error(`Unknown rollout action: ${action}`);
  const correct = action === scenario.correctAction;
  return {
    decision: { action, correct, elapsedMs: Math.max(0, Math.round(elapsedMs)) },
    shouldTrack: correct,
    duplicate: false,
  };
}
