// ============================================================
// ENTRY POINT REACT
// File ini hanya bertugas memasang App ke elemen #root.
// Jangan menaruh logika aplikasi di sini.
// ============================================================

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  });
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
