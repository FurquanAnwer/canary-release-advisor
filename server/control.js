const DEFAULT_GUARDRAILS = Object.freeze({ minCanary: 20, errorDelta: 0.05, latencyDeltaMs: 100 });

export function parseGuardrails(value) {
  try {
    const data = typeof value === 'string' ? JSON.parse(value) : value;
    if (!data || !Number.isInteger(data.minCanary) || data.minCanary < 20 || data.minCanary > 10000 ||
      typeof data.errorDelta !== 'number' || data.errorDelta < 0.001 || data.errorDelta > 0.5 ||
      !Number.isInteger(data.latencyDeltaMs) || data.latencyDeltaMs < 10 || data.latencyDeltaMs > 5000) throw new Error('Invalid guardrails');
    return { minCanary: data.minCanary, errorDelta: data.errorDelta, latencyDeltaMs: data.latencyDeltaMs };
  } catch { return DEFAULT_GUARDRAILS; }
}

export function assess(metrics, guardrails = DEFAULT_GUARDRAILS, now = Date.now()) {
  if (!metrics.lastRequestAt || now - Date.parse(metrics.lastRequestAt) > 10_000) return { code: 'stale', label: 'No recent checkout traffic' };
  if (!metrics.stable.requests || !metrics.canary.requests) return { code: 'missing', label: 'Waiting for both versions' };
  if (metrics.canary.requests < guardrails.minCanary) return { code: 'sample', label: 'Hold: canary sample too small' };
  if (metrics.canary.errorRate - metrics.stable.errorRate > guardrails.errorDelta || metrics.canary.p95Ms - metrics.stable.p95Ms > guardrails.latencyDeltaMs) return { code: 'regression', label: 'Investigate canary regression' };
  return { code: 'healthy', label: 'Signals within demo guardrails' };
}

export function createFlagControl({ environmentKey, apiUrl = 'http://localhost:8000', managementToken, pauseStateId, pauseFeatureId, fetcher = fetch, now = Date.now } = {}) {
  const base = `${apiUrl.replace(/\/$/, '')}/api/v1/`;
  let lastFetch = 0;
  let pause = environmentKey ? null : false;
  let guardrails = DEFAULT_GUARDRAILS;
  let guardrailSource = 'defaults';
  async function refresh(force = false) {
    if (!environmentKey) return { pause, guardrails, guardrailSource };
    if (!force && lastFetch && now() - lastFetch < 2000) return { pause, guardrails, guardrailSource };
    // Never reuse stale flags after an evaluation error.
    pause = null;
    const response = await fetcher(`${base}flags/`, { headers: { 'X-Environment-Key': environmentKey }, signal: AbortSignal.timeout(2500) });
    if (!response.ok) throw new Error(`Flag evaluation failed (${response.status})`);
    const flags = await response.json();
    if (!Array.isArray(flags)) throw new Error('Unexpected flag response');
    const pauseFlag = flags.find((item) => item.feature?.name === 'checkout_pause');
    if (!pauseFlag) throw new Error('checkout_pause flag missing');
    pause = Boolean(pauseFlag.enabled);
    const policy = flags.find((item) => item.feature?.name === 'checkout_guardrails');
    guardrails = policy?.enabled ? parseGuardrails(policy.feature_state_value) : DEFAULT_GUARDRAILS;
    guardrailSource = policy?.enabled && guardrails !== DEFAULT_GUARDRAILS ? 'flagsmith' : 'defaults';
    lastFetch = now();
    return { pause, guardrails, guardrailSource };
  }
  async function applyPause() {
    if (!environmentKey || !managementToken || !Number.isInteger(Number(pauseStateId)) || Number(pauseStateId) < 1) throw new Error('Flagsmith rollback is not configured');
    const url = `${base}environments/${encodeURIComponent(environmentKey)}/featurestates/${pauseStateId}/`;
    const headers = { Authorization: `Api-Key ${managementToken}` };
    const before = await fetcher(url, { headers, signal: AbortSignal.timeout(3000) });
    if (!before.ok) throw new Error(`Cannot inspect pause flag (${before.status})`);
    const state = await before.json();
    // Require an explicit environment-default state rather than an arbitrary feature state ID.
    if (state.feature_segment != null || state.identity != null || state.feature !== Number(pauseFeatureId)) throw new Error('Configured pause state does not match checkout_pause environment default');
    if (!state.enabled) {
      const changed = await fetcher(url, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: true }), signal: AbortSignal.timeout(3000) });
      if (!changed.ok) throw new Error(`Flagsmith rejected pause (${changed.status})`);
    }
    const verified = await fetcher(url, { headers, signal: AbortSignal.timeout(3000) });
    if (!verified.ok || !(await verified.json()).enabled) throw new Error('Could not verify pause flag state');
    const current = await refresh(true);
    if (!current.pause) throw new Error('Pause flag is enabled but SDK evaluation did not confirm it');
    return { applied: true, alreadyEnabled: Boolean(state.enabled) };
  }
  return { refresh, applyPause, get status() { return { pause, guardrails, guardrailSource }; }, get canApply() { return Boolean(environmentKey && managementToken && Number(pauseStateId) > 0 && Number(pauseFeatureId) > 0); } };
}
