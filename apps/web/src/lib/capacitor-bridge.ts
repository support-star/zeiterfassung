/**
 * Capacitor App Bridge
 *
 * Initialisiert native Funktionen beim App-Start:
 * - StatusBar Styling
 * - SplashScreen ausblenden
 * - Hardware-Back-Button (Android)
 * - Deep Links abfangen
 */

import { isNativePlatform } from './platform';

export async function initCapacitorBridge() {
  if (!isNativePlatform()) return;

  // ── Status Bar ──────────────────────────────────
  try {
    const { StatusBar } = await import('@capacitor/status-bar');
    await StatusBar.setBackgroundColor({ color: '#0f1219' });
    await StatusBar.setStyle({ style: 'DARK' as any });
  } catch {
    // Plugin nicht verfügbar
  }

  // ── Splash Screen ──────────────────────────────
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide();
  } catch {
    // Plugin nicht verfügbar
  }

  // ── App Events (Back Button, Deep Links) ───────
  try {
    const { App } = await import('@capacitor/app');

    // Hardware Back Button (Android)
    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        App.minimizeApp();
      }
    });

    // Deep Links: zeiterfassung://pair?token=XYZ
    App.addListener('appUrlOpen', ({ url }) => {
      try {
        const parsed = new URL(url);
        const token = parsed.searchParams.get('token');
        if (token && parsed.pathname.includes('pair')) {
          window.location.href = `/m/scan?token=${token}`;
        }
      } catch {
        // Ungültige URL ignorieren
      }
    });
  } catch {
    // Plugin nicht verfügbar
  }
}
