# Canary Control Room

A local, three-scenario canary release decision demo connected to a real Flagsmith Experimentation instance.

## Run

1. Start the local Flagsmith stack from `flagsmith/` with `docker compose up -d`.
2. Install dependencies with `npm install` at the repository root.
3. Copy `.env.example` to `.env.local` and set `VITE_FLAGSMITH_ENVIRONMENT_ID` to the Development client-side environment key. This workspace already has a local, ignored `.env.local`.
4. Run `npm run dev` and open the Vite URL shown in the terminal (normally `http://localhost:5173`).

The local experiment is [Canary advisor decision accuracy](http://localhost:8000/project/1/environment/FpeSRiQZWQPe3uwQUwvc9c/experiments/1). It is configured in Development with a 100% rollout and an even control/advisor split.

The browser SDK uses `http://localhost:8000/api/v1/` for flags and `http://localhost:8000/api/` for events. The CLI's organisation API key is in `flagsmith/flagsmith.env` (mode 600, ignored by Git); it must never be shipped with the app. To use the CLI, run `source flagsmith/flagsmith.env` in your shell. The CLI executable is at `~/.local/bin/flagsmith`.

## Experiment behavior

- Flag: `canary_release_advisor` with `control` and keyed `advisor` values.
- The experiment flag is read by `useExperiment` where the decision experience is displayed. This records an exposure for the visitor identity.
- The identity is a random UUID stored in the browser's local storage. It is passed to `FlagsmithProvider`, so flag evaluation and events use the same identity.
- The exact conversion event is `correct_rollout_decision`. It is sent only after a correct first submission for a scenario. Submitted choices and time to decision are stored locally, keyed by visitor ID.
- The advisor is prepared, rule-based guidance for each scenario. It does not call a live AI model.

The three scenarios are intentionally deterministic. No simulated traffic has been sent. To claim that the advisor improves decisions, collect decisions from real visitors and examine the experiment results over an appropriate sample and run time.

## Checks

Run `npm test` for scenario, conversion, and identity checks; `npm run test:ui` for cohort rendering and event checks; and `npm run build` for a production bundle check.

## Stop or remove the local instance

From `flagsmith/`, run `docker compose down` to stop it. `docker compose down -v` deletes its database volume and all local Flagsmith data.
# canary-release-advisor
