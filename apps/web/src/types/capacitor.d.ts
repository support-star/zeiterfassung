// Capacitor-Plugins werden dynamisch importiert und sind nur
// in der nativen App verfügbar. Diese Deklarationen verhindern
// TypeScript-Fehler beim Build.

declare module '@capacitor/preferences' {
  export const Preferences: {
    get(options: { key: string }): Promise<{ value: string | null }>;
    set(options: { key: string; value: string }): Promise<void>;
    remove(options: { key: string }): Promise<void>;
  };
}

declare module '@capacitor/network' {
  export const Network: {
    addListener(
      event: 'networkStatusChange',
      callback: (status: { connected: boolean; connectionType: string }) => void,
    ): Promise<any>;
    getStatus(): Promise<{ connected: boolean; connectionType: string }>;
  };
}

declare module '@capacitor/haptics' {
  export const Haptics: {
    impact(options: { style: string }): Promise<void>;
    vibrate(): Promise<void>;
    notification(options: { type: string }): Promise<void>;
  };
  export const ImpactStyle: {
    Heavy: string;
    Medium: string;
    Light: string;
  };
}

declare module '@capawesome/capacitor-mlkit-barcode-scanning' {
  export const BarcodeScanner: {
    requestPermissions(): Promise<{ camera: string }>;
    scan(): Promise<{ barcodes: Array<{ rawValue: string | null; format: string }> }>;
    isSupported(): Promise<{ supported: boolean }>;
  };
}

declare module '@capacitor/status-bar' {
  export const StatusBar: {
    setBackgroundColor(options: { color: string }): Promise<void>;
    setStyle(options: { style: string }): Promise<void>;
    show(): Promise<void>;
    hide(): Promise<void>;
  };
}

declare module '@capacitor/splash-screen' {
  export const SplashScreen: {
    show(): Promise<void>;
    hide(): Promise<void>;
  };
}

declare module '@capacitor/app' {
  export const App: {
    addListener(
      event: 'backButton',
      callback: (data: { canGoBack: boolean }) => void,
    ): Promise<any>;
    addListener(
      event: 'appUrlOpen',
      callback: (data: { url: string }) => void,
    ): Promise<any>;
    addListener(
      event: 'appStateChange',
      callback: (data: { isActive: boolean }) => void,
    ): Promise<any>;
    minimizeApp(): Promise<void>;
    exitApp(): Promise<void>;
  };
}
