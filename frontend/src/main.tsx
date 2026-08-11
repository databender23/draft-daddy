import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { sendVisitBeacon } from './lib/telemetry';
import './styles.css';
import './board.css';
import './player-context.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

sendVisitBeacon();

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
