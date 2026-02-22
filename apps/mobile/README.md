# Mobile App Setup (Capacitor)

## Voraussetzungen

- Node.js 18+
- Android Studio (für Android)
- Xcode 15+ (für iOS, nur macOS)
- Web-App muss gebaut sein (`npm run web:build`)

## Ersteinrichtung

```bash
# 1. Dependencies installieren
cd apps/mobile
npm install

# 2. Barcode-Scanner Plugin (nicht im npm Registry, manuell hinzufügen)
npm install @capawesome/capacitor-mlkit-barcode-scanning@6

# 3. Native Plattformen hinzufügen
npx cap add android
npx cap add ios

# 4. Web-App bauen und sync
npm run build
```

## Development

### Android

```bash
# Web-App bauen + Sync
npm run build

# Android Studio öffnen
npx cap open android

# Oder direkt auf Gerät/Emulator
npx cap run android
```

### iOS

```bash
# Web-App bauen + Sync
npm run build

# Xcode öffnen
npx cap open ios

# Oder direkt auf Gerät/Simulator
npx cap run ios
```

### Live Reload (Development)

In `capacitor.config.ts` auskommentieren:

```ts
server: {
  url: 'http://DEINE_IP:5173',
  cleartext: true,
}
```

Dann:

```bash
cd apps/web && npm run dev  # Vite Dev-Server
cd apps/mobile && npx cap run android --livereload
```

## Architektur

Die Mobile-App teilt sich den gleichen Codebase wie die Web-App.
Capacitor lädt den Build-Output aus `apps/web/dist` in eine native WebView.

### Routing

| Route        | Beschreibung                    |
| ------------ | ------------------------------- |
| `/m/login`   | Mobile Login (QR + Passwort)    |
| `/m/scan`    | QR-Scanner für Geräte-Kopplung  |
| `/m`         | Home Screen (Timer)             |
| `/m/history` | Verlauf der letzten 7 Tage      |

### Plattform-Erkennung

`src/lib/platform.ts` erkennt automatisch ob die App nativ läuft.
Native Route: `/m/*` — Desktop Route: `/*`

### Offline Queue

`src/lib/offline-queue.ts` — Zustand-Store mit localStorage-Persistenz.

**Funktionsweise:**
1. Jede Aktion (Start, Ende, Pause, Rapport) wird sofort lokal gespeichert
2. Die UI reagiert sofort (optimistisch)
3. Ein Sync-Worker sendet ausstehende Aktionen alle 15s an den Server
4. Bei Netzwerkänderungen (online/offline) wird sofort synchronisiert
5. Konflikte (z.B. Zeitüberlappung) werden dem User angezeigt

**Queue-Status:**
- `pending` → Wartet auf Sync
- `syncing` → Wird gerade gesendet
- `error` → Fehler (max 3 Retries)
- `conflict` → Server-Konflikt (manuell lösen)

### Secure Storage

- **Native:** `@capacitor/preferences` (verschlüsselt auf iOS/Android)
- **Browser:** HttpOnly Cookie (automatisch)

Der Refresh-Token wird auf nativen Plattformen sicher gespeichert
und bei jedem Token-Refresh rotiert.

### Capacitor Plugins

| Plugin               | Zweck                           |
| -------------------- | ------------------------------- |
| `@capacitor/app`     | Back Button, Deep Links         |
| `@capacitor/haptics` | Haptisches Feedback bei Buttons |
| `@capacitor/network` | Online/Offline-Erkennung        |
| `@capacitor/preferences` | Secure Token Storage       |
| `@capacitor/status-bar` | StatusBar Styling            |
| `@capacitor/splash-screen` | Splash Screen            |
| `@capawesome/...barcode-scanning` | QR-Code Scanner  |

Alle Plugins werden **dynamisch importiert** (`import()`) und funktionieren
auch wenn nicht installiert (Fallback-Handling).

## Android-spezifisch

### Permissions (AndroidManifest.xml)

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

### Deep Links

URL-Schema für QR-Kopplung:

```xml
<intent-filter>
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="zeiterfassung" android:host="pair" />
</intent-filter>
```

## iOS-spezifisch

### Info.plist

```xml
<key>NSCameraUsageDescription</key>
<string>Kamera wird für QR-Code Scanner benötigt</string>
```

### URL Scheme

In Xcode unter Target → Info → URL Types:
- Scheme: `zeiterfassung`
