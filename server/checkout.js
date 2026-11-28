import { performance } from 'node:perf_hooks';
import { localVersion } from './assignment.js';

const WINDOW_MS = 60_000;
const MAX_SAMPLES = 50_000;
export const modes = new Set(['healthy', 'regression', 'latency']);

export function createCheckout({ random = Math.random, now = Date.now, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  let mode = 'healthy';
  let rollout = 5;
  let samples = [];
  let events = [{ at: now(), type: 'started', message: 'Checkout demo started' }];
  let decisions = [];
  const log = (type, message) => { events = [{ at: now(), type, message }, ...events].slice(0, 30); };

  function setConfig(next) {
    if (next.mode !== undefined && !modes.has(next.mode)) throw new Error('Invalid mode');
    if (next.rollout !== undefined && (!Number.isInteger(next.rollout) || next.rollout < 0 || next.rollout > 100)) throw new Error('Rollout must be an integer from 0 to 100');
    if (next.mode !== undefined) {
      if (next.mode !== mode) log('fault', `Canary mode changed to ${next.mode}`);
      mode = next.mode;
    }
    if (next.rollout !== undefined) {
      if (next.rollout !== rollout) log('rollout', `Local canary share changed to ${next.rollout}%`);
      rollout = next.rollout;
    }
    return { mode, rollout };
  }

  async function checkout({ cartId, shopperId, amount, currency = 'USD' }, assignment) {
    if (typeof cartId !== 'string' || !cartId.trim() || !Number.isFinite(amount) || amount <= 0 || currency !== 'USD') throw new Error('Supply cartId, positive amount, and USD currency');
    if (typeof shopperId !== 'string' || !shopperId.trim() || shopperId.length > 128) throw new Error('Supply a shopperId of at most 128 characters');
    const version = assignment?.version || localVersion(shopperId, rollout);
    if (!['stable', 'canary'].includes(version)) throw new Error('Invalid version');
    const start = performance.now();
    const faulty = version === 'canary' && mode !== 'healthy';
    await sleep(faulty && mode === 'latency' ? 160 : 12);
    const ok = !(faulty && mode === 'regression' && random() < 0.18);
    const sample = { at: now(), version, ok, durationMs: Math.max(0, performance.now() - start) };
    samples.push(sample);
    samples = samples.filter((item) => item.at >= now() - WINDOW_MS).slice(-MAX_SAMPLES);
    return { ok, status: ok ? 'completed' : 'failed', version, assignmentSource: assignment?.source || 'local-sticky', cartId, durationMs: Math.round(sample.durationMs) };
  }

  function recordDecision({ action, note }) {
    if (!['increase', 'hold', 'rollback'].includes(action) || typeof note !== 'string' || note.length > 500) throw new Error('Supply action and note (max 500 characters)');
    const decision = { at: now(), action, note, snapshot: metrics() };
    decisions = [decision, ...decisions].slice(0, 20);
    log('decision', `Engineer recorded ${action}${note ? `: ${note}` : ''}`);
    return decision;
  }

  function metrics() {
    const timestamp = now();
    samples = samples.filter((item) => item.at >= timestamp - WINDOW_MS);
    const aggregate = (version) => {
      const rows = samples.filter((item) => item.version === version);
      const durations = rows.map((item) => item.durationMs).sort((a, b) => a - b);
      return { requests: rows.length, errors: rows.filter((item) => !item.ok).length, errorRate: rows.length ? rows.filter((item) => !item.ok).length / rows.length : null, p95Ms: durations.length ? Math.round(durations[Math.ceil(durations.length * .95) - 1]) : null };
    };
    return { source: 'demo-checkout-api', generatedAt: new Date(timestamp).toISOString(), lastRequestAt: samples.length ? new Date(samples.at(-1).at).toISOString() : null, windowSeconds: 60, mode, rollout, stable: aggregate('stable'), canary: aggregate('canary'), timeline: events, decisions };
  }

  return { checkout, metrics, setConfig, recordDecision };
}
