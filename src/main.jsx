import React from 'react';
import { createRoot } from 'react-dom/client';
import flagsmith from '@flagsmith/flagsmith';
import { FlagsmithProvider } from '@flagsmith/flagsmith/react';
import App from './App.jsx';
import { getOrCreateVisitorId } from './decision.js';
import './styles.css';
import './motion.css';

const environmentID = import.meta.env.VITE_FLAGSMITH_ENVIRONMENT_ID;
const apiBase = (import.meta.env.VITE_FLAGSMITH_API_URL || 'http://localhost:8000').replace(/\/$/, '');
if (!environmentID && window.location.hash !== '#live') throw new Error('Set VITE_FLAGSMITH_ENVIRONMENT_ID in .env.local before starting the experiment. Use #live to preview checkout telemetry without Flagsmith.');

const visitorId = getOrCreateVisitorId(window.localStorage, () => window.crypto.randomUUID());

const app = <App visitorId={visitorId} />;
createRoot(document.getElementById('root')).render(environmentID ? (
  <FlagsmithProvider
    flagsmith={flagsmith}
    options={{
      environmentID,
      identity: visitorId,
      enableEvents: true,
      api: `${apiBase}/api/v1/`,
      eventProcessorConfig: { eventsApiUrl: `${apiBase}/api/` },
    }}
  >
    {app}
  </FlagsmithProvider>,
) : app);
