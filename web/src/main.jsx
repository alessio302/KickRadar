import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.jsx';

// Confirmed live 2026-09-11 -- likely why several recent deploys "never
// arrived" on a real device even after backgrounding/foregrounding the
// app: vite.config.js's registerType: 'autoUpdate' does nothing on its
// own with strategies: 'injectManifest'. That option only wires up
// automatic update-checking + reload through THIS virtual module's own
// registerSW() -- nothing in this file ever imported/called it before,
// so vite-plugin-pwa silently fell back to injecting a bare
// `navigator.serviceWorker.register(...)` script (see dist/registerSW.js)
// with no update-detection or reload logic at all. sw.js's own
// skipWaiting()/clients.claim() (added earlier for the same symptom) get
// a new service worker to *activate* immediately, but nothing told the
// already-open page to actually reload and fetch the new JS bundle once
// that happened -- this is that missing piece. immediate: true both
// registers right away and starts polling for updates; autoUpdate mode
// (vite.config.js) then reloads the page itself the moment a new version
// is found, with no user-facing prompt.
registerSW({ immediate: true });

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
