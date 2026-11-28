# Canary Control Room

## Live checkout demonstration

This independent demo feeds actual HTTP request outcomes into `/#live`. Its shoppers are generated; it is **not production telemetry** and does not contribute to the Flagsmith decision experiment. You can run it without a Flagsmith key. From the repository root, use three terminals:

```bash
CHECKOUT_ADMIN_TOKEN=local-demo-secret npm run checkout
npm run traffic
npm run dev
```

Open `http://localhost:5173/#live`. The generator sends 20 checkout requests per second by default, reusing 1,000 labeled simulated shopper IDs. Without a checkout flag, the service deterministically routes 5% of shoppers to canary; each shopper stays on one version. The dashboard shows rolling one-minute request counts, failures, error rate and p95 for each version. To make the canary fail while stable stays healthy:

```bash
curl -X POST http://127.0.0.1:8787/api/live/config -H 'Content-Type: application/json' -H 'Authorization: Bearer local-demo-secret' -d '{"mode":"regression","rollout":20}'
```

Set `mode` to `healthy` to recover or `latency` to slow only canary. Set `rollout` to an integer from 0 to 100 when using local assignment. These are local demonstration controls; the config and decision endpoints require a token and the API binds to loopback by default. The live page lets an operator enter that token to record a decision and metrics snapshot without changing the rollout. Do not publish this demo API as a payment processor: it charges nothing, stores no orders, and has no persistence. Metrics and decision history live in memory and reset on restart. `TRAFFIC_RPS=30 npm run traffic` changes the generated rate; Ctrl+C stops it. `npm test` checks routing and rolling counts.

### Let Flagsmith control the checkout canary

In the Flagsmith Development environment create a separate **multivariate feature flag** called `checkout_canary`, with string values `stable` and `canary`. Allocate the desired share to `canary`. Start the API with the same environment's client-side key and API URL:

```bash
CHECKOUT_ADMIN_TOKEN=local-demo-secret CHECKOUT_FLAGSMITH_ENVIRONMENT_ID=YOUR_DEVELOPMENT_CLIENT_SIDE_KEY CHECKOUT_FLAGSMITH_API_URL=http://localhost:8000 npm run checkout
```

The API evaluates `checkout_canary` for each shopper identity, caching successful results briefly. If the flag is missing or Flagsmith cannot be reached, new shoppers are routed to stable, and the live page reports the unavailable source. The local `rollout` parameter no longer controls assignment when Flagsmith is configured. Keep this checkout flag **separate from** the `canary_release_advisor` experiment flag: the former controls the demo service; the latter assigns human decision makers to interface variants. Checkout requests are not advisor conversions. Changing flag weights during a measured experiment can rebucket identities.

### Target groups, guardrails, and pause control

The traffic generator sends stable simulated shopper identities with `region` (`IN`, `EU`, `US`) and `tier` (`standard`, `premium`) traits. Add a Flagsmith segment such as `region = IN` and target `checkout_canary` to that segment. The live page reports observed request counts by region so you can check which group really received the release. The service evaluates identity flags server side with these traits; the simulator supplies them and should not be used as an authorisation system.

Create a separate boolean flag `checkout_pause`, initially **disabled** for the environment and without identity or segment overrides. Every checkout checks its environment-level value; when enabled, the API routes new requests to stable even if the identity's `checkout_canary` value was canary. If flag evaluation is unavailable, new requests also go to stable. Create an optional JSON remote config flag `checkout_guardrails`, enabled with a value such as:

```json
{"minCanary":40,"errorDelta":0.02,"latencyDeltaMs":80}
```

These thresholds only affect the dashboard assessment. Invalid values revert to documented defaults (20 requests, 0.05 absolute error-rate difference and 100 ms p95 difference). The measured numbers remain visible regardless of the assessment.

To enable a **human-approved emergency pause**, use an organisation management API token **only on the server**. Find the `checkout_pause` feature ID and its *environment default feature state* ID from your Flagsmith dashboard/API; do not use an identity or segment state. Start the service with these extra environment variables:

```bash
CHECKOUT_FLAGSMITH_MANAGEMENT_TOKEN=YOUR_SECRET_TOKEN CHECKOUT_PAUSE_FEATURE_ID=YOUR_FEATURE_ID CHECKOUT_PAUSE_STATE_ID=YOUR_ENVIRONMENT_DEFAULT_STATE_ID
```

Use these alongside `CHECKOUT_ADMIN_TOKEN`, `CHECKOUT_FLAGSMITH_ENVIRONMENT_ID`, and `CHECKOUT_FLAGSMITH_API_URL` in the earlier start command. The live UI requires the local admin token and an explicit confirmation before it PATCHes that *specific* feature state to `enabled: true`. The server reads the state before and after the change, checks the feature ID, then verifies the environment flag evaluation. If any check fails, it reports an error and records the failure without claiming success. It never changes the advisor experiment flag, increases rollout, or automatically reverses a pause. Metrics and operator records are in memory, so preserve evidence outside the demo if you need durable audit history.

### Show the experiment result honestly

Before submission, open the Flagsmith experiment and check that both variants have exposures and `correct_rollout_decision` conversions from the same visitor identity. Check `rollout_decision_submitted` counts, sample balance, and whether the SDK flushed events. Refresh the experiment results and record the cohort counts, correct decisions, median decision time, collection date and whether visitors were human or simulated in `src/results.json`. Do not fill these fields with invented values. Keep generated checkout traffic out of the advisor results.

For a public deployment, serve the Vite app and proxy `/api/live/metrics` to this API; restrict the admin endpoints and do not expose the demo admin token. The Vite development server already proxies the live routes locally. Real production integration would replace the in-memory checkout service with instrumented application requests and a persistent monitoring data source.

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
