import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { initCapacitorBridge } from './lib/capacitor-bridge';

// Native Plugins initialisieren (no-op im Browser)
initCapacitorBridge();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
