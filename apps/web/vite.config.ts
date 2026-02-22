import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

const isDev = process.env.NODE_ENV !== 'production';

export default defineConfig(async () => {
  // Mock-API nur im Dev-Modus laden
  const plugins: any[] = [
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
  ];

  if (isDev) {
    const { mockApiPlugin } = await import('./mock-api');
    plugins.push(mockApiPlugin());
  }

  return {
    plugins,
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
      proxy: isDev ? undefined : {
        '/api': { target: 'http://localhost:3000', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
      },
    },
  };
});
