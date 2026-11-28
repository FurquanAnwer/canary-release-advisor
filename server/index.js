import http from 'node:http';
import { createCheckout } from './checkout.js';
import { createAssignment } from './assignment.js';
import { assess, createFlagControl } from './control.js';

const service = createCheckout();
const port = Number(process.env.CHECKOUT_PORT || 8787);
const host = process.env.CHECKOUT_HOST || '127.0.0.1';
const token = process.env.CHECKOUT_ADMIN_TOKEN;
const assignment = createAssignment({ environmentKey: process.env.CHECKOUT_FLAGSMITH_ENVIRONMENT_ID, apiUrl: process.env.CHECKOUT_FLAGSMITH_API_URL });
const flags = createFlagControl({ environmentKey: process.env.CHECKOUT_FLAGSMITH_ENVIRONMENT_ID, apiUrl: process.env.CHECKOUT_FLAGSMITH_API_URL, managementToken: process.env.CHECKOUT_FLAGSMITH_MANAGEMENT_TOKEN, pauseFeatureId: process.env.CHECKOUT_PAUSE_FEATURE_ID, pauseStateId: process.env.CHECKOUT_PAUSE_STATE_ID });

function reply(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let body = '';
  for await (const part of req) {
    body += part;
    if (body.length > 4096) throw new Error('Request too large');
  }
  try { return JSON.parse(body); } catch { throw new Error('Invalid JSON'); }
}

export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'GET' && path === '/api/live/metrics') {
        try { await flags.refresh(); } catch { /* status reports unavailability */ }
        const metrics = service.metrics();
        return reply(res, 200, { ...metrics, assignmentSource: assignment.source, flagControl: flags.status, canApplyPause: flags.canApply, assessment: assess(metrics, flags.status.guardrails) });
      }
      if (req.method === 'POST' && path === '/api/checkout') {
        const payload = await readJson(req);
        let selection;
        if (typeof payload.shopperId === 'string' && payload.shopperId.trim()) {
          if (process.env.CHECKOUT_FLAGSMITH_ENVIRONMENT_ID) {
            try { await flags.refresh(); } catch { selection = { version: 'stable', source: 'flagsmith-unavailable' }; }
            if (!selection && flags.status.pause !== false) selection = { version: 'stable', source: flags.status.pause ? 'flagsmith-paused' : 'flagsmith-unavailable' };
          }
          if (!selection) selection = await assignment.assign(payload.shopperId, service.metrics().rollout, { region: payload.region || 'unknown', tier: payload.tier || 'standard' });
        }
        const result = await service.checkout(payload, selection);
        return reply(res, result.ok ? 200 : 503, result);
      }
      if (req.method === 'POST' && path === '/api/live/config') {
        if (!token || req.headers.authorization !== `Bearer ${token}`) return reply(res, 403, { error: 'Admin token required' });
        return reply(res, 200, service.setConfig(await readJson(req)));
      }
      if (req.method === 'POST' && path === '/api/live/decisions') {
        if (!token || req.headers.authorization !== `Bearer ${token}`) return reply(res, 403, { error: 'Admin token required' });
        const decision = await readJson(req);
        if (decision.executePause !== true) return reply(res, 201, service.recordDecision(decision));
        if (decision.action !== 'rollback') return reply(res, 400, { error: 'Only rollback may execute the pause flag' });
        if (typeof decision.note !== 'string' || decision.note.length > 500) return reply(res, 400, { error: 'Supply a note (max 500 characters)' });
        if (!flags.canApply) return reply(res, 409, { error: 'Flagsmith pause control is not configured' });
        // Record attempts, including failed external mutations, without claiming a rollback succeeded.
        try {
          const execution = await flags.applyPause();
          const result = service.recordDecision(decision, { status: 'confirmed', ...execution });
          service.recordControl('pause', 'Flagsmith checkout_pause enabled and verified');
          return reply(res, 201, result);
        } catch (cause) {
          service.recordControl('pause-error', `Flagsmith pause not confirmed: ${cause.message}`);
          return reply(res, 502, { error: cause.message });
        }
      }
      reply(res, 404, { error: 'Not found' });
    } catch (error) { reply(res, 400, { error: error.message }); }
  });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  createServer().listen(port, host, () => console.log(`Checkout API listening at http://${host}:${port}`));
}
