import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { sendVisitBeacon } from './lib/telemetry';
import './styles.css';
import './board.css';
import './player-context.css';
// LAST, always: the mobile layer overrides by cascade order, not specificity —
// media queries add none. See docs/mobile-design.md §2 conflict J. Split in two
// only for the 500-line file ceiling; both must stay at src/ top level so
// check-theme.mjs's non-recursive scan covers them.
import './mobile.css';
import './mobile-sheets.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

sendVisitBeacon();

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
