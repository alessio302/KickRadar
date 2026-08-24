import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Web Push sending isn't built yet (see backend README "Not yet
      // built") -- this only covers the installable/offline-shell part of
      // "PWA", not push notifications.
      manifest: {
        name: 'KickRadar',
        short_name: 'KickRadar',
        description: 'Transfermarkt-News, Spiele und Aufstellungen für Serie A, Bundesliga, Premier League und Ligue 1.',
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
