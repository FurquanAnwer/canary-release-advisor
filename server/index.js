import http from 'node:http';
import { createCheckout } from './checkout.js';

const service = createCheckout();
const port = Number(process.env.CHECKOUT_PORT || 8787);
const host = process.env.CHECKOUT_HOST || '127.0.0.1';
const token = process.env.CHECKOUT_ADMIN_TOKEN;

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
      if (req.method === 'GET' && path === '/api/live/metrics') return reply(res, 200, service.metrics());
      if (req.method === 'POST' && path === '/api/checkout') {
        const payload = await readJson(req);
        const result = await service.checkout(payload);
        return reply(res, result.ok ? 200 : 503, result);
      }
      if (req.method === 'POST' && path === '/api/live/config') {
        if (!token || req.headers.authorization !== `Bearer ${token}`) return reply(res, 403, { error: 'Admin token required' });
        return reply(res, 200, service.setConfig(await readJson(req)));
      }
      reply(res, 404, { error: 'Not found' });
    } catch (error) { reply(res, 400, { error: error.message }); }
  });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  createServer().listen(port, host, () => console.log(`Checkout API listening at http://${host}:${port}`));
}
