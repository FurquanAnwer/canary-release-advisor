# Canary Control Room

## Live checkout demonstration

This independent demo feeds actual HTTP request outcomes into `/#live`. Its shoppers are generated; it is **not production telemetry** and does not contribute to the Flagsmith decision experiment. You can run it without a Flagsmith key. From the repository root, use three terminals:

```bash
CHECKOUT_ADMIN_TOKEN=local-demo-secret npm run checkout
npm run traffic
npm run dev
```

Open `http://localhost:5173/#live`. The generator sends 20 checkout requests per second by default. The service routes 5% to canary and records the actual result and duration of each request; the dashboard shows rolling one-minute request counts, failures, error rate and p95 for each version. To make the canary fail while stable stays healthy:

```bash
curl -X POST http://127.0.0.1:8787/api/live/config -H 'Content-Type: application/json' -H 'Authorization: Bearer local-demo-secret' -d '{"mode":"regression","rollout":20}'
```

Set `mode` to `healthy` to recover or `latency` to slow only canary. Set `rollout` to an integer from 0 to 100. These are local demonstration controls; the config endpoint requires a token and the API binds to loopback by default. Do not publish this demo API as a payment processor: it charges nothing, stores no orders, and has no persistence. Metrics live in memory and reset on restart. `TRAFFIC_RPS=30 npm run traffic` changes the generated rate; Ctrl+C stops it. `npm test` checks routing and rolling counts.

For a public deployment, serve the Vite app and proxy `/api/live/metrics` to this API; keep the admin endpoint private. The Vite development server already proxies the metrics route locally. Real production integration would replace the in-memory checkout service with instrumented application requests and a persistent monitoring data source.

A local rollout decision experiment using Flagsmith Experimentation. Each browser visitor receives a stable cohort and one randomly assigned scored scenario. The other scenarios unlock as unscored practice.

The interface uses a monochrome control-room theme with CSS wireframe box motion, animated charts and scenario cards, and scroll reveals. Motion is reduced automatically when the browser requests reduced motion.

## Set up a fresh local instance

1. Run `docker compose -f flagsmith/docker-compose.yml up -d`. Wait for the Flagsmith UI at `http://localhost:8000`; create an account, organisation, project and Development environment.
2. Create a multivariate flag named `canary_release_advisor` in the project. Add two string values, `control` and `advisor`, weighted equally. Enable it in Development at 100% rollout. Create and start an experiment on that flag, with `correct_rollout_decision` as conversion event.
3. Copy `.env.example` to `.env.local`. Copy the **client-side environment key** from your environment settings to `VITE_FLAGSMITH_ENVIRONMENT_ID`. Set `VITE_FLAGSMITH_API_URL` to the URL your browser uses to reach Flagsmith. Copy the experiment's actual UI URL to `VITE_FLAGSMITH_EXPERIMENT_URL`. Never put an organisation API token in a client-side variable.
4. Optional CLI: copy `flagsmith.example.json` to ignored `flagsmith.json` and replace the project ID and environment key with your own.
5. Run `npm ci && npm run dev`, then visit the shown Vite URL (usually `http://localhost:5173`). If using another host, verify browser access and CORS on the Flagsmith API.

## Verify ingestion

1. In browser network tools, confirm the SDK requests flags for the visitor identity and receives either `control` or `advisor`.
2. Submit the assigned scenario once. Confirm in Flagsmith analytics/events one `rollout_decision_submitted` and, if correct, one `correct_rollout_decision`. Submission metadata carries scenario, choice, correctness and elapsed milliseconds; a specific event `rollout_decision_submitted_<scenario>_<choice>` also identifies the decision where the dashboard does not display metadata. `rollout_decision_seconds` carries numeric duration in its `value` field. The SDK may batch events; allow its flush to complete.
3. Complete a practice scenario: no new scored outcome should appear. Reload: identity, scenario and submission should persist. Use a separate browser profile for a second visitor; do not clear storage to pretend the same person is an independent participant.

Run `npm test`, `npm run test:ui`, and `npm run build`. `docker compose -f flagsmith/docker-compose.yml down` stops the instance; `down -v` deletes its data.

## Measurement and reporting

Primary accuracy is correct primary submissions divided by primary submissions, per cohort. Completion is submitted visitors divided by exposed visitors. Report decision time separately. Flagsmith's conversion metric counts events, so compare unique identities and submitted counts as well. One attempt is scored per browser identity; practice remains local.

The `#results` page describes the hypothesis and limitations and links to your configured experiment. It shows **awaiting verified data** until cohort sizes, conversion rates, completion, decision times and traffic origin have been gathered. If using simulated traffic, report it separately from human traffic. Prepared guidance uses scenario rules, not a live AI system or production telemetry.
