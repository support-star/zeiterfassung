import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'de.zeiterfassung.app',
  appName: 'Zeiterfassung',
  webDir: '../web/dist',
  server: {
    // Für Development: Live-Reload vom Vite Dev-Server
    // url: 'http://192.168.1.100:5173',
    // cleartext: true,
    androidScheme: 'https',
  },
  plugins: {
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0f1219',
    },
    SplashScreen: {
      launchAutoHide: true,
      androidSplashResourceName: 'splash',
      backgroundColor: '#0f1219',
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
