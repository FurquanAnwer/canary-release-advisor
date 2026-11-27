import React, { useEffect, useRef, useState } from 'react';
import { useExperiment, useFlagsmith } from '@flagsmith/flagsmith/react';
import { ACTIONS, scenarios } from './scenarios.js';
import { CONVERSION_EVENT, evaluateDecision } from './decision.js';

const FLAG_NAME = 'canary_release_advisor';

function readLocalDecisions(visitorId) {
  try {
    return JSON.parse(window.localStorage.getItem(`canary-decisions-${visitorId}`) || '{}');
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
    <section className="advisor-panel" aria-label="Rule-based advisor recommendation">
      <div className="advisor-panel__top"><span className="advisor-symbol">✦</span><span>RULE-BASED ADVISOR</span><span className="advisor-live">SCENARIO RULES</span></div>
      <div className="advisor-panel__body">
        <div className="advisor-panel__label">RECOMMENDED ACTION</div>
        <div className="advisor-panel__headline">{scenario.advisor.headline}</div>
        <p>{scenario.advisor.rationale}</p>
        <div className="advisor-evidence-title">Supporting evidence</div>
        <ul>{scenario.advisor.evidence.map((evidence) => <li key={evidence}>{evidence}</li>)}</ul>
        <div className="advisor-note">Prepared guidance based on this scenario’s explicit rules. No live model is used.</div>
      </div>
    </section>
  );
}

function DecisionExperience({ visitorId }) {
  const flagsmith = useFlagsmith();
  const flag = useExperiment(FLAG_NAME);
  const [scenarioId, setScenarioId] = useState(scenarios[0].id);
  const [choice, setChoice] = useState(null);
  const [decisions, setDecisions] = useState(() => readLocalDecisions(visitorId));
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const enteredAt = useRef(performance.now());
  const submitted = useRef(new Set(Object.keys(decisions)));
  const scenario = scenarios.find((item) => item.id === scenarioId);
  const decision = decisions[scenarioId];
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
    window.localStorage.setItem(`canary-decisions-${visitorId}`, JSON.stringify(next));
    setDecisions(next);
    if (result.shouldTrack) {
      flagsmith.trackEvent(CONVERSION_EVENT);
      void flagsmith.flushEvents();
    }
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
        <div className="sidebar-link"><span>◷</span> Session history</div>
        <div className="sidebar-bottom"><div className="status-dot" /> <div><strong>EXPERIMENT LIVE</strong><span>Flagsmith · Development</span></div></div>
      </aside>

      <main className="main">
        <header className="topbar"><div className="breadcrumb">WORKSPACE <span>/</span> DECISION LAB</div><div className="topbar-right"><span className="topbar-dot" /> Connected to Flagsmith <span className="topbar-divider" /> Visitor {visitorId.slice(-8)}</div></header>
        <div className="content">
          <section className="intro"><div className="eyebrow"><span className="eyebrow-line" /> RELEASE OPERATIONS SIMULATOR</div><div className="intro-row"><div><h1>Make the call<span>.</span></h1><p>Three releases. One decision each. Read the signals, choose your next move, and see how you did.</p></div><div className="score-card"><span>YOUR SESSION</span><strong>{correctCount}<small> / {completed.length || 0}</small></strong><div>correct decisions</div></div></div></section>

          <section className="scenario-picker" aria-label="Prepared release scenarios"><div className="section-title"><span>01</span> CHOOSE A SCENARIO <div className="section-line" /></div><div className="scenario-tabs">{scenarios.map((item) => <button key={item.id} className={`scenario-tab ${item.id === scenarioId ? 'scenario-tab--active' : ''}`} onClick={() => setScenarioId(item.id)}><span className="scenario-tab__num">{item.number}</span><span><strong>{item.label}</strong><small>{item.release}</small></span><span className={`scenario-tab__status ${decisions[item.id] ? (decisions[item.id].correct ? 'is-correct' : 'is-wrong') : ''}`}>{decisions[item.id] ? (decisions[item.id].correct ? '✓' : '×') : '→'}</span></button>)}</div></section>

          <section className="briefing"><div className="briefing-top"><div><div className="eyebrow eyebrow--subtle">SCENARIO {scenario.number} <span>·</span> {scenario.eyebrow}</div><h2>{scenario.title}</h2><p>{scenario.description}</p></div><div className="deploy-badge"><span>DEPLOYED</span><strong>{scenario.deployed}</strong><small>{scenario.release}</small></div></div><div className="context-strip"><span>◉ &nbsp; DEPLOYMENT CONTEXT</span><p>{scenario.context}</p></div></section>

          <section className="signals"><div className="section-title"><span>02</span> LIVE SIGNALS <div className="section-line" /><small>CANARY VS STABLE · LAST 30 MIN</small></div><div className="metric-grid">{scenario.metrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}</div></section>

          <div className="evidence-grid"><section className="history-panel"><div className="panel-title">DEPLOYMENT HISTORY <span>↗</span></div><div className="timeline">{scenario.history.map((item) => <div className="timeline-row" key={item.time}><span className="timeline-dot" /><div className="timeline-time">{item.time}</div><div><strong>{item.event}</strong><p>{item.detail}</p></div></div>)}</div></section>{variant === 'advisor' && <Advisor scenario={scenario} />}</div>

          <section className="decision-panel"><div className="section-title"><span>03</span> YOUR DECISION <div className="section-line" /></div><div className="decision-inner"><div className="decision-heading"><div><h2>What would you do?</h2><p>Choose the action you would take as the on-call engineer.</p></div><span className="decision-variant">{variant === 'advisor' ? 'ADVISOR VIEW' : 'METRICS VIEW'}</span></div><div className="action-grid">{ACTIONS.map((action) => <button key={action.id} type="button" disabled={Boolean(decision)} onClick={() => setChoice(action.id)} className={`action-button ${choice === action.id ? 'action-button--selected' : ''} ${decision?.action === action.id ? 'action-button--submitted' : ''}`}><span>{action.icon}</span><strong>{action.label}</strong><small>{choice === action.id ? 'Selected' : 'Select action'}</small></button>)}</div><div className="decision-footer"><span>One submission per scenario · Your choice is stored in this browser</span><button className="submit-button" disabled={!choice || Boolean(decision)} onClick={submitDecision}>{decision ? 'Decision submitted' : 'Submit decision'} <span>→</span></button></div>{decision && <div className={`result-box ${decision.correct ? 'result-box--correct' : 'result-box--wrong'}`} role="status"><div><strong>{decision.correct ? 'Good call.' : 'The stronger call was different.'}</strong><span>{(decision.elapsedMs / 1000).toFixed(1)}s to decide</span></div><p>{scenario.explanation}</p></div>}</div></section>

          <section className="session-panel"><div className="section-title"><span>04</span> LOCAL SESSION DATA <div className="section-line" /></div><div className="session-table"><div className="session-table__head"><span>SCENARIO</span><span>YOUR CHOICE</span><span>RESULT</span><span>TIME</span></div>{scenarios.map((item) => { const row = decisions[item.id]; return <div className="session-table__row" key={item.id}><strong>{item.label}</strong><span>{row ? ACTIONS.find((action) => action.id === row.action)?.label : '—'}</span><span className={row ? (row.correct ? 'text-good' : 'text-bad') : ''}>{row ? (row.correct ? 'Correct' : 'Incorrect') : 'Pending'}</span><span>{row ? `${(row.elapsedMs / 1000).toFixed(1)}s` : '—'}</span></div>; })}</div><p className="session-note">Prepared scenarios and local session data are for this demo. Experiment results count real visitor events only; simulated traffic, if used, is labelled separately.</p></section>
          <footer className="footer"><span>CANARY CONTROL ROOM</span><span>Built for thoughtful release decisions · Scenario rules, not a live model</span></footer>
        </div>
      </main>
    </div>
  );
}

export default function App({ visitorId }) {
  return <DecisionExperience visitorId={visitorId} />;
}
