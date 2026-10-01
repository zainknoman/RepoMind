import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { applyTheme, loadTheme } from './lib/theme';

// Before the first render, so a chosen theme never flashes the other one.
applyTheme(loadTheme());

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
