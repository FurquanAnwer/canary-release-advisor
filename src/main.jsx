import React from 'react';
import { createRoot } from 'react-dom/client';
import flagsmith from '@flagsmith/flagsmith';
import { FlagsmithProvider } from '@flagsmith/flagsmith/react';
import App from './App.jsx';
import { getOrCreateVisitorId } from './decision.js';
import './styles.css';

const environmentID = import.meta.env.VITE_FLAGSMITH_ENVIRONMENT_ID;
if (!environmentID) throw new Error('Set VITE_FLAGSMITH_ENVIRONMENT_ID in .env.local before starting the app.');

const visitorId = getOrCreateVisitorId(window.localStorage, () => window.crypto.randomUUID());

createRoot(document.getElementById('root')).render(
  <FlagsmithProvider
    flagsmith={flagsmith}
    options={{
      environmentID,
      identity: visitorId,
      enableEvents: true,
      api: 'http://localhost:8000/api/v1/',
      eventProcessorConfig: { eventsApiUrl: 'http://localhost:8000/api/' },
    }}
  >
    <App visitorId={visitorId} />
  </FlagsmithProvider>,
);
