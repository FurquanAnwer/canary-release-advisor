import React, { useEffect, useRef, useState } from 'react';
import { useExperiment, useFlagsmith } from '@flagsmith/flagsmith/react';
import { ACTIONS, scenarios } from './scenarios.js';
import { CONVERSION_EVENT, SUBMISSION_EVENT, evaluateDecision, getOrAssignPrimaryScenario } from './decision.js';
import results from './results.json';

const FLAG_NAME = 'canary_release_advisor';

function readLocalDecisions(visitorId) {
  try {
    return JSON.parse(window.localStorage.getItem(`canary-decisions-v2-${visitorId}`) || '{}');
  } catch {
    return {};
  }
}

function TrendChart({ values, tone, label }) {
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${100 - value}`).join(' ');
  const area = `0,100 ${points} 100,100`;
  return (
    <svg className={`trend trend--${tone}`} viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`${label} trend over the last 30 minutes`}>
      <line x1="0" y1="24" x2="100" y2="24" />
      <line x1="0" y1="50" x2="100" y2="50" />
      <line x1="0" y1="76" x2="100" y2="76" />
      <polygon points={area} />
      <polyline points={points} />
    </svg>
  );
}

function MetricCard({ metric }) {
  return (
    <article className="metric-card">
      <div className="metric-top"><span>{metric.label}</span><span className={`metric-dot metric-dot--${metric.tone}`} /></div>
      <div className="metric-value">{metric.value}<span>{metric.unit}</span></div>
      <div className={`metric-delta metric-delta--${metric.tone}`}>{metric.delta}</div>
      <TrendChart values={metric.series} tone={metric.tone} label={metric.label} />
      <div className="chart-axis"><span>30 MIN AGO</span><span>NOW</span></div>
    </article>
  );
}

function Advisor({ scenario }) {
  return (
    <section className="advisor-panel" aria-label="Rule-based advisor evidence">
      <div className="advisor-panel__top"><span className="advisor-symbol">✦</span><span>RULE-BASED ADVISOR</span><span className="advisor-live">SCENARIO RULES</span></div>
      <div className="advisor-panel__body">
        <div className="advisor-panel__label">EVIDENCE SUMMARY</div>
        <div className="advisor-panel__headline">{scenario.advisor.headline}</div>
        <p>{scenario.advisor.rationale}</p>
        <div className="advisor-evidence-title">Supporting evidence</div>
        <ul>{scenario.advisor.evidence.map((evidence) => <li key={evidence}>{evidence}</li>)}</ul>
        <div className="advisor-note">Prepared guidance based on this scenario’s explicit rules. No live model is used.</div>
      </div>
    </section>
  );
}

function Comparison({ scenario }) {
  const { comparison, samples } = scenario;
  return <section className="comparison"><div className="panel-title">ROLLOUT GUARDRAILS · {samples.window} observation</div>
    <p>Escalate if canary errors exceed stable by 0.5 percentage points or p95 exceeds stable by 50 ms for two checkpoints. Check representative sample and traffic mix before increasing.</p>
    <div className="comparison-samples"><span>Canary: {samples.canary} requests</span><span>Stable: {samples.stable} requests</span></div>
    <div className="comparison-table"><div>Checkpoint</div><div>−20m</div><div>−15m</div><div>−10m</div><div>−5m</div><div>Now</div>
      {[["Canary errors %", comparison.canaryErrors], ["Stable errors %", comparison.stableErrors], ["Canary p95 ms", comparison.canaryLatency], ["Stable p95 ms", comparison.stableLatency]].map(([label, values]) => <React.Fragment key={label}><strong>{label}</strong>{values.map((value, index) => <span key={index}>{value}</span>)}</React.Fragment>)}
    </div>
    {scenario.segments && <details className="segments"><summary>Inspect regional and endpoint segments</summary><div className="segment-grid"><strong>Segment</strong><strong>Canary errors</strong><strong>Stable errors</strong><strong>Canary requests</strong>{scenario.segments.map((row) => <React.Fragment key={row.name}><span>{row.name}</span><span>{row.canary}</span><span>{row.stable}</span><span>{row.requests}</span></React.Fragment>)}</div></details>}
  </section>;
}

function DecisionExperience({ visitorId }) {
  const flagsmith = useFlagsmith();
  const flag = useExperiment(FLAG_NAME);
  const [primaryId] = useState(() => getOrAssignPrimaryScenario(window.localStorage, visitorId, scenarios.map((item) => item.id)));
  const [scenarioId, setScenarioId] = useState(() => getOrAssignPrimaryScenario(window.localStorage, visitorId, scenarios.map((item) => item.id)));
  const [choice, setChoice] = useState(null);
  const [decisions, setDecisions] = useState(() => readLocalDecisions(visitorId));
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const enteredAt = useRef(performance.now());
  const submitted = useRef(new Set(Object.keys(decisions)));
  const scenario = scenarios.find((item) => item.id === scenarioId);
  const decision = decisions[scenarioId];
  const primaryComplete = Boolean(decisions[primaryId]);
  const isPrimary = scenarioId === primaryId;
  const variant = flag?.value === 'advisor' ? 'advisor' : 'control';
  const completed = Object.values(decisions);
  const correctCount = completed.filter((item) => item.correct).length;

  useEffect(() => {
    enteredAt.current = performance.now();
    setChoice(null);
  }, [scenarioId]);

  useEffect(() => {
    if (flag) return undefined;
    const timer = window.setTimeout(() => setLoadingTimedOut(true), 12000);
    return () => window.clearTimeout(timer);
  }, [flag]);

  useEffect(() => {
    if (flag) void flagsmith.flushEvents();
  }, [flag?.value, flagsmith]);

  useEffect(() => {
    const flush = () => { void flagsmith.flushEvents(); };
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [flagsmith]);

  function submitDecision() {
    if (!choice || submitted.current.has(scenario.id) || !flag) return;
    const result = evaluateDecision(scenario, choice, decisions[scenario.id], performance.now() - enteredAt.current);
    if (result.duplicate) return;
    submitted.current.add(scenario.id);
    const next = { ...decisions, [scenario.id]: result.decision };
    window.localStorage.setItem(`canary-decisions-v2-${visitorId}`, JSON.stringify(next));
    setDecisions(next);
    if (isPrimary) {
      flagsmith.trackEvent(SUBMISSION_EVENT, { metadata: { scenario: scenario.id, choice, correct: result.decision.correct, elapsedMs: result.decision.elapsedMs } });
      flagsmith.trackEvent(`${SUBMISSION_EVENT}_${scenario.id}_${choice}`);
      flagsmith.trackEvent('rollout_decision_seconds', { value: result.decision.elapsedMs / 1000 });
    }
    if (isPrimary && result.shouldTrack) {
      flagsmith.trackEvent(CONVERSION_EVENT);
    }
    if (isPrimary) void flagsmith.flushEvents();
  }

  if (!flag) {
    return (
      <div className="loading-screen">
        <div className="loading-mark">◈</div>
        <h1>{loadingTimedOut ? 'Cannot load the experiment' : 'Connecting to the control room'}</h1>
        <p>{loadingTimedOut ? 'Check that Flagsmith is running at localhost:8000 and reload the page.' : 'Identifying this visitor and loading a consistent variation…'}</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">◈</div><div><strong>CANARY</strong><span>CONTROL ROOM</span></div></div>
        <div className="sidebar-label">WORKSPACE</div>
        <div className="sidebar-link sidebar-link--active"><span>▦</span> Decision lab <span className="sidebar-link__arrow">↗</span></div>
        <button className="sidebar-link" onClick={() => window.location.hash = 'results'}><span>◷</span> Results & methodology</button>
        <div className="sidebar-bottom"><div className="status-dot" /> <div><strong>EXPERIMENT LIVE</strong><span>Flagsmith · Development</span></div></div>
      </aside>

      <main className="main">
        <header className="topbar"><div className="breadcrumb">WORKSPACE <span>/</span> DECISION LAB</div><div className="topbar-right"><span className="topbar-dot" /> Connected to Flagsmith <span className="topbar-divider" /> Visitor {visitorId.slice(-8)}</div></header>
        <div className="content">
          <section className="intro"><div className="eyebrow"><span className="eyebrow-line" /> RELEASE OPERATIONS SIMULATOR</div><div className="intro-row"><div><h1>Make the call<span>.</span></h1><p>One randomly assigned scored trial. After submitting, explore the other releases as practice.</p></div><div className="score-card"><span>YOUR SESSION</span><strong>{correctCount}<small> / {completed.length || 0}</small></strong><div>correct decisions</div></div></div></section>

          <section className="scenario-picker" aria-label="Prepared release scenarios"><div className="section-title"><span>01</span> {primaryComplete ? 'PRACTICE SCENARIOS' : 'YOUR ASSIGNED TRIAL'} <div className="section-line" /></div><div className="scenario-tabs">{[...scenarios].sort((a,b) => a.id === primaryId ? -1 : b.id === primaryId ? 1 : 0).map((item) => <button key={item.id} disabled={!primaryComplete && item.id !== primaryId} className={`scenario-tab ${item.id === scenarioId ? 'scenario-tab--active' : ''}`} onClick={() => setScenarioId(item.id)}><span className="scenario-tab__num">{item.number}</span><span><strong>{item.label}</strong><small>{item.id === primaryId ? 'PRIMARY SCORED TRIAL' : primaryComplete ? 'PRACTICE · NOT SCORED' : 'Unlocks after trial'}</small></span><span className={`scenario-tab__status ${decisions[item.id] ? (decisions[item.id].correct ? 'is-correct' : 'is-wrong') : ''}`}>{decisions[item.id] ? (decisions[item.id].correct ? '✓' : '×') : '→'}</span></button>)}</div></section>

          <section className="briefing"><div className="briefing-top"><div><div className="eyebrow eyebrow--subtle">SCENARIO {scenario.number} <span>·</span> {scenario.eyebrow}</div><h2>{scenario.title}</h2><p>{scenario.description}</p></div><div className="deploy-badge"><span>DEPLOYED</span><strong>{scenario.deployed}</strong><small>{scenario.release}</small></div></div><div className="context-strip"><span>◉ &nbsp; DEPLOYMENT CONTEXT</span><p>{scenario.context}</p></div></section>

          <section className="signals"><div className="section-title"><span>02</span> LIVE SIGNALS <div className="section-line" /><small>CANARY VS STABLE · LAST 30 MIN</small></div><div className="metric-grid">{scenario.metrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}</div></section>

          <Comparison scenario={scenario} /><div className="evidence-grid"><section className="history-panel"><div className="panel-title">DEPLOYMENT HISTORY <span>↗</span></div><div className="timeline">{scenario.history.map((item) => <div className="timeline-row" key={item.time}><span className="timeline-dot" /><div className="timeline-time">{item.time}</div><div><strong>{item.event}</strong><p>{item.detail}</p></div></div>)}</div></section>{variant === 'advisor' && <Advisor scenario={scenario} />}</div>

          <section className="decision-panel"><div className="section-title"><span>03</span> YOUR DECISION <div className="section-line" /></div><div className="decision-inner"><div className="decision-heading"><div><h2>What would you do?</h2><p>Choose the action you would take as the on-call engineer.</p></div><span className="decision-variant">{isPrimary ? 'SCORED TRIAL' : 'PRACTICE'} · {variant === 'advisor' ? 'ADVISOR VIEW' : 'METRICS VIEW'}</span></div><div className="action-grid">{ACTIONS.map((action) => <button key={action.id} type="button" disabled={Boolean(decision)} onClick={() => setChoice(action.id)} className={`action-button ${choice === action.id ? 'action-button--selected' : ''} ${decision?.action === action.id ? 'action-button--submitted' : ''}`}><span>{action.icon}</span><strong>{action.label}</strong><small>{choice === action.id ? 'Selected' : 'Select action'}</small></button>)}</div><div className="decision-footer"><span>One submission per scenario · Only the assigned trial sends experiment events</span><button className="submit-button" disabled={!choice || Boolean(decision)} onClick={submitDecision}>{decision ? 'Decision submitted' : 'Submit decision'} <span>→</span></button></div>{decision && <div className={`result-box ${decision.correct ? 'result-box--correct' : 'result-box--wrong'}`} role="status"><div><strong>{decision.correct ? 'Good call.' : 'The stronger call was different.'}</strong><span>{(decision.elapsedMs / 1000).toFixed(1)}s to decide</span></div><p>{scenario.explanation}</p></div>}</div></section>

          <section className="session-panel"><div className="section-title"><span>04</span> LOCAL SESSION DATA <div className="section-line" /></div><div className="session-table"><div className="session-table__head"><span>SCENARIO</span><span>YOUR CHOICE</span><span>RESULT</span><span>TIME</span></div>{scenarios.map((item) => { const row = decisions[item.id]; return <div className="session-table__row" key={item.id}><strong>{item.label} {item.id === primaryId ? '· scored' : '· practice'}</strong><span>{row ? ACTIONS.find((action) => action.id === row.action)?.label : '—'}</span><span className={row ? (row.correct ? 'text-good' : 'text-bad') : ''}>{row ? (row.correct ? 'Correct' : 'Incorrect') : 'Pending'}</span><span>{row ? `${(row.elapsedMs / 1000).toFixed(1)}s` : '—'}</span></div>; })}</div><p className="session-note">Prepared scenarios and local session data are for this demo. Only the first assigned scenario contributes to the experiment.</p></section>
          <footer className="footer"><span>CANARY CONTROL ROOM</span><span>Built for thoughtful release decisions · Scenario rules, not a live model</span></footer>
        </div>
      </main>
    </div>
  );
}

export default function App({ visitorId }) {
  const [page, setPage] = useState(() => window.location.hash === '#results' ? 'results' : 'trial');
  useEffect(() => { const update = () => setPage(window.location.hash === '#results' ? 'results' : 'trial'); window.addEventListener('hashchange', update); return () => window.removeEventListener('hashchange', update); }, []);
  return page === 'results' ? <ResultsPage /> : <DecisionExperience visitorId={visitorId} />;
}

function ResultsPage() {
  const experimentUrl = import.meta.env.VITE_FLAGSMITH_EXPERIMENT_URL;
  const rate = (numerator, denominator) => denominator > 0 ? `${(100 * numerator / denominator).toFixed(1)}%` : 'awaiting data';
  const cohort = (name, row) => <article key={name}><strong>{name}</strong><p>Exposed: {row?.exposed ?? 'awaiting verified data'}</p><p>Submitted: {row?.submitted ?? 'awaiting verified data'}</p><p>Correct: {row?.correct ?? 'awaiting verified data'}</p><p>Completion: {rate(row?.submitted, row?.exposed)}</p><p>Accuracy: {rate(row?.correct, row?.submitted)}</p><p>Conversion per exposure: {rate(row?.correct, row?.exposed)}</p><p>Median decision time: {row?.medianSeconds != null ? `${row.medianSeconds}s` : 'awaiting data'}</p></article>;
  return <main className="results-page"><a href="#">← Decision lab</a><div className="eyebrow">EXPERIMENT · METHODOLOGY</div><h1>Does evidence improve rollout judgment?</h1>
    <p>The advisor cohort sees a prepared, rule-based evidence summary. The control cohort sees the same metrics, guardrails and deployment history. The hypothesis is that evidence summaries improve the proportion of correct first decisions on a randomly assigned scenario.</p>
    <h2>Results</h2><div className="results-grid">{cohort('Control', results.control)}{cohort('Advisor', results.advisor)}</div>
    <p>Data source: {results.source || 'Flagsmith Experimentation · awaiting verified export'}. As of: {results.asOf || 'not yet recorded'}. Traffic: {results.traffic || 'not yet documented'}; no human or simulated result is claimed until it is measured. {experimentUrl ? <a href={experimentUrl} target="_blank" rel="noreferrer">Open this instance’s Flagsmith experiment ↗</a> : 'Configure VITE_FLAGSMITH_EXPERIMENT_URL for a link to your instance.'}</p>
    <h2>Measurement</h2><ul><li>One stable browser identity receives one persistent random scenario and one Flagsmith variant.</li><li>Primary accuracy = unique correct primary submissions / unique primary submissions; report completion = submissions / exposed visitors separately.</li><li>Flagsmith events: correct_rollout_decision, rollout_decision_submitted, rollout_decision_submitted_&lt;scenario&gt;_&lt;choice&gt;, and rollout_decision_seconds (numeric seconds). Practice never emits these events.</li><li>Decision time starts when a scenario first appears in the current page session. Refreshing resets its timer, so interpret duration cautiously.</li></ul>
    <h2>Limitations</h2><p>Prepared scenarios are deterministic and cannot prove impact on real production incidents. Browser storage can be cleared, identities may repeat across devices, exposure without submission affects completion, and visitors are not blinded to the extra panel. Results require a meaningful sample and must distinguish human visitors from any simulated traffic.</p>
  </main>;
}
