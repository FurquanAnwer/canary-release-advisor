const endpoint = process.env.CHECKOUT_URL || 'http://127.0.0.1:8787';
const rate = Number(process.env.TRAFFIC_RPS || 20);
if (!Number.isInteger(rate) || rate < 1 || rate > 100) throw new Error('TRAFFIC_RPS must be 1–100');

let count = 0;
let running = true;
process.on('SIGINT', () => { running = false; });
process.on('SIGTERM', () => { running = false; });
console.log(`Generating labeled demo traffic at ${rate} requests/sec; Ctrl+C to stop`);
while (running) {
  const started = Date.now();
  const batch = Array.from({ length: rate }, () => fetch(`${endpoint}/api/checkout`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cartId: `demo-${Date.now()}-${++count}`, amount: 49.99, currency: 'USD' }),
  }).catch((error) => console.error(`Checkout unavailable: ${error.message}`)));
  await Promise.all(batch);
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, 1000 - (Date.now() - started))));
}
