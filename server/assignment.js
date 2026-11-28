// A deterministic local fallback keeps a demo shopper on one version across requests.
export function localVersion(shopperId, rollout) {
  let hash = 2166136261;
  for (const char of shopperId) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) % 10000 < rollout * 100 ? 'canary' : 'stable';
}

export function createAssignment({ environmentKey, apiUrl = 'http://localhost:8000', fetcher = fetch, now = Date.now } = {}) {
  const cache = new Map();
  let lastSource = environmentKey ? 'flagsmith-pending' : 'local-sticky';
  async function assign(shopperId, rollout, traits = {}) {
    if (!environmentKey) return { version: localVersion(shopperId, rollout), source: 'local-sticky' };
    const saved = cache.get(shopperId);
    const traitKey = JSON.stringify(traits);
    if (saved && saved.expires > now() && saved.traitKey === traitKey) { lastSource = saved.value.source; return saved.value; }
    try {
      const response = await fetcher(`${apiUrl.replace(/\/$/, '')}/api/v1/identities/?identifier=${encodeURIComponent(shopperId)}`, {
        method: 'POST', headers: { 'X-Environment-Key': environmentKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: shopperId, traits: Object.entries(traits).map(([trait_key, trait_value]) => ({ trait_key, trait_value })) }),
        signal: AbortSignal.timeout(2500),
      });
      if (!response.ok) throw new Error(`Flagsmith returned ${response.status}`);
      const payload = await response.json();
      const flag = payload.flags?.find((item) => item.feature?.name === 'checkout_canary');
      if (!flag) throw new Error('checkout_canary flag missing');
      const value = { version: flag.enabled && flag.feature_state_value === 'canary' ? 'canary' : 'stable', source: 'flagsmith' };
      cache.set(shopperId, { expires: now() + 2000, value, traitKey });
      lastSource = value.source;
      if (cache.size > 2000) cache.delete(cache.keys().next().value);
      return value;
    } catch {
      // An unavailable flag service must never increase canary exposure.
      lastSource = 'flagsmith-unavailable';
      return { version: 'stable', source: 'flagsmith-unavailable' };
    }
  }
  return { assign, get source() { return lastSource; } };
}
