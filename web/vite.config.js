import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // injectManifest (a custom src/sw.js, precache manifest injected into
      // it) instead of the default generateSW: receiving/showing push
      // notifications needs a real `push` event listener, which
      // generateSW's auto-generated Workbox service worker has no hook for.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      manifest: {
        name: 'KickRadar',
        short_name: 'KickRadar',
        description: 'Transfermarkt-News, Spiele und Aufstellungen für Serie A, Bundesliga, Premier League, Ligue 1 und La Liga.',
        theme_color: '#954730',
        background_color: '#F5F5F2',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
});
