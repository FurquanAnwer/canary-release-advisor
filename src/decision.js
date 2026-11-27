export const CONVERSION_EVENT = 'correct_rollout_decision';
export const VISITOR_STORAGE_KEY = 'canary-control-room-visitor-v1';

export function getOrCreateVisitorId(storage, randomUUID) {
  const existing = storage.getItem(VISITOR_STORAGE_KEY);
  if (existing) return existing;
  const id = `visitor_${randomUUID()}`;
  storage.setItem(VISITOR_STORAGE_KEY, id);
  return id;
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
