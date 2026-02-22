/**
 * Erkennt ob die App in einem Capacitor-Container läuft
 * (Android/iOS nativ) oder im Browser.
 */
export function isNativePlatform(): boolean {
  return !!(window as any).Capacitor?.isNativePlatform?.();
}

export function getPlatform(): 'ANDROID' | 'IOS' | 'WEB' {
  const cap = (window as any).Capacitor;
  if (!cap?.isNativePlatform?.()) return 'WEB';
  const platform = cap.getPlatform?.();
  if (platform === 'android') return 'ANDROID';
  if (platform === 'ios') return 'IOS';
  return 'WEB';
}

export function isMobileViewport(): boolean {
  return window.innerWidth < 768 || isNativePlatform();
}
