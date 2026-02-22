import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Zeiterfassung',
        short_name: 'Zeit',
        description: 'Zeiterfassung für Teams',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@capacitor/preferences': path.resolve(__dirname, './stubs/capacitor-preferences.ts'),
      '@capacitor/network': path.resolve(__dirname, './stubs/capacitor-network.ts'),
      '@capacitor/haptics': path.resolve(__dirname, './stubs/capacitor-haptics.ts'),
      '@capacitor/status-bar': path.resolve(__dirname, './stubs/capacitor-status-bar.ts'),
      '@capacitor/splash-screen': path.resolve(__dirname, './stubs/capacitor-splash-screen.ts'),
      '@capacitor/app': path.resolve(__dirname, './stubs/capacitor-app.ts'),
      '@capawesome/capacitor-mlkit-barcode-scanning': path.resolve(__dirname, './stubs/capacitor-barcode.ts'),
    },
  },
  build: {
    rollupOptions: {
      external: [
        '@capawesome/capacitor-mlkit-barcode-scanning',
        '@capacitor/haptics', '@capacitor/network', '@capacitor/preferences',
        '@capacitor/status-bar', '@capacitor/splash-screen', '@capacitor/app',
      ],
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
  },
});
