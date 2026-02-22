/**
 * useGpsTracker
 * 
 * Sendet alle GPS_INTERVAL_MS den aktuellen Standort an die API,
 * solange ein aktiver Zeiteintrag läuft.
 * 
 * • Fragt beim ersten Start Berechtigung an
 * • Speichert den letzten Standort im State für UI-Anzeige
 * • Funktioniert auf Web (Browser Geolocation API) und Capacitor (Geolocation Plugin)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/api';

const GPS_INTERVAL_MS = 10 * 60 * 1000; // 10 Minuten

export interface GpsPosition {
  lat: number;
  lng: number;
  accuracy: number;
  altitude?: number;
  speed?: number;
  capturedAt: string;
}

interface UseGpsTrackerOptions {
  /** ID des aktiven Zeiteintrags – Tracking nur aktiv wenn gesetzt */
  activeTimeEntryId: string | null;
  /** Wird aufgerufen wenn GPS verweigert oder nicht verfügbar */
  onError?: (msg: string) => void;
}

export function useGpsTracker({ activeTimeEntryId, onError }: UseGpsTrackerOptions) {
  const [lastPosition, setLastPosition] = useState<GpsPosition | null>(null);
  const [permissionState, setPermissionState] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSentRef = useRef<number>(0);

  const getCurrentPosition = useCallback((): Promise<GeolocationPosition> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('GPS nicht verfügbar'));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15_000,
        maximumAge: 60_000,
      });
    });
  }, []);

  const sendLocation = useCallback(async (timeEntryId: string) => {
    try {
      const pos = await getCurrentPosition();
      const { latitude: lat, longitude: lng, accuracy, altitude, speed } = pos.coords;
      const capturedAt = new Date().toISOString();

      await api.post('/locations', {
        lat,
        lng,
        accuracy: accuracy ?? undefined,
        altitude: altitude ?? undefined,
        speed: speed ?? undefined,
        capturedAt,
        timeEntryId,
      });

      setLastPosition({ lat, lng, accuracy: accuracy ?? 0, altitude: altitude ?? undefined, speed: speed ?? undefined, capturedAt });
      setPermissionState('granted');
      lastSentRef.current = Date.now();
    } catch (err: any) {
      if (err?.code === 1) { // PERMISSION_DENIED
        setPermissionState('denied');
        onError?.('GPS-Berechtigung verweigert. Bitte in den Browser-Einstellungen erlauben.');
      } else if (err?.code === 2) {
        onError?.('GPS-Position konnte nicht ermittelt werden.');
      }
      // Andere Fehler (Netzwerk etc.) still ignorieren
    }
  }, [getCurrentPosition, onError]);

  useEffect(() => {
    // Kein aktiver Eintrag → Tracking stoppen
    if (!activeTimeEntryId) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Sofort beim Start senden (wenn letzte Sendung > 2min her)
    const now = Date.now();
    if (now - lastSentRef.current > 2 * 60 * 1000) {
      sendLocation(activeTimeEntryId);
    }

    // Dann alle 10 Minuten
    intervalRef.current = setInterval(() => {
      sendLocation(activeTimeEntryId);
    }, GPS_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [activeTimeEntryId, sendLocation]);

  return { lastPosition, permissionState };
}
