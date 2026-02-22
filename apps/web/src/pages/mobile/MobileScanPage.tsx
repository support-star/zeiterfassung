import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setAccessToken } from '@/lib/api';
import { storeRefreshToken } from '@/lib/secure-storage';
import { getPlatform } from '@/lib/platform';
import { useAuth } from '@/stores/auth';
import { QrCode, Camera, Loader2, AlertCircle, Keyboard } from 'lucide-react';

export default function MobileScanPage() {
  const navigate = useNavigate();
  const { loadUser } = useAuth();
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualToken, setManualToken] = useState('');

  // ── Nativer QR-Scan ────────────────────────────

  const startNativeScan = async () => {
    setScanning(true);
    setError('');

    try {
      const { BarcodeScanner } = await import('@capawesome/capacitor-mlkit-barcode-scanning');

      // Berechtigung prüfen
      const { camera } = await BarcodeScanner.requestPermissions();
      if (camera !== 'granted') {
        setError('Kameraberechtigung wird benötigt.');
        setScanning(false);
        return;
      }

      const { barcodes } = await BarcodeScanner.scan();

      if (barcodes.length > 0) {
        const value = barcodes[0].rawValue;
        // Token aus URL extrahieren
        const token = extractToken(value || '');
        if (token) {
          await pairWithToken(token);
        } else {
          setError('Ungültiger QR-Code.');
        }
      }
    } catch (err: any) {
      if (err.message?.includes('canceled') || err.message?.includes('cancelled')) {
        // Benutzer hat abgebrochen
      } else {
        setError('Scanfehler: ' + (err.message || 'Unbekannt'));
      }
    } finally {
      setScanning(false);
    }
  };

  // ── Token aus QR-URL extrahieren ───────────────

  function extractToken(value: string): string | null {
    try {
      // Format: https://domain/pair?token=XYZ oder myapp://pair?token=XYZ
      const url = new URL(value);
      return url.searchParams.get('token');
    } catch {
      // Falls der QR-Code nur den Token enthält
      if (value.length >= 20 && !value.includes(' ')) {
        return value;
      }
      return null;
    }
  }

  // ── Pairing-API aufrufen ───────────────────────

  const pairWithToken = async (token: string) => {
    setLoading(true);
    setError('');

    try {
      const platform = getPlatform();
      const deviceName = `${platform} Gerät`;

      const result = await api<{ accessToken: string; refreshToken: string }>(
        '/auth/pair',
        {
          method: 'POST',
          body: JSON.stringify({ token, deviceName, platform }),
          skipAuth: true,
        },
      );

      // Tokens speichern
      setAccessToken(result.accessToken);
      await storeRefreshToken(result.refreshToken);

      // User laden und weiterleiten
      await loadUser();
      navigate('/m', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Kopplung fehlgeschlagen. Code abgelaufen?');
    } finally {
      setLoading(false);
    }
  };

  // ── Manueller Token ────────────────────────────

  const handleManualPair = async () => {
    const token = manualToken.trim();
    if (!token) return;
    await pairWithToken(token);
  };

  return (
    <div className="min-h-screen bg-surface-950 flex flex-col items-center justify-center px-6 py-10">
      {/* Logo */}
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600 shadow-lg shadow-brand-600/30">
          <QrCode className="h-8 w-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-white">Gerät koppeln</h1>
        <p className="mt-2 text-sm text-surface-400 max-w-xs mx-auto">
          Scannen Sie den QR-Code, der am PC angezeigt wird
        </p>
      </div>

      {/* Fehler */}
      {error && (
        <div className="mb-6 w-full max-w-sm flex items-center gap-2 rounded-xl bg-danger-500/10 border border-danger-500/20 px-4 py-3 text-sm text-danger-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Scan Button */}
      <div className="w-full max-w-sm space-y-3">
        <button
          onClick={startNativeScan}
          disabled={scanning || loading}
          className="w-full flex items-center justify-center gap-3 rounded-2xl bg-brand-600 px-6 py-5 text-lg font-semibold text-white shadow-lg shadow-brand-600/20 active:scale-[0.98] transition-transform disabled:opacity-50"
        >
          {scanning || loading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <Camera className="h-6 w-6" />
          )}
          {scanning ? 'Scannen...' : loading ? 'Koppeln...' : 'QR-Code scannen'}
        </button>

        {/* Manuelle Eingabe Fallback */}
        <button
          onClick={() => setShowManual(!showManual)}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-surface-700 px-4 py-3 text-sm text-surface-400 hover:bg-surface-800 transition-colors"
        >
          <Keyboard className="h-4 w-4" />
          Code manuell eingeben
        </button>

        {showManual && (
          <div className="rounded-xl border border-surface-700 bg-surface-900 p-4 space-y-3">
            <input
              value={manualToken}
              onChange={(e) => setManualToken(e.target.value)}
              placeholder="Pairing-Code eingeben..."
              className="w-full rounded-lg bg-surface-800 border border-surface-700 px-4 py-3 text-white placeholder-surface-500 focus:border-brand-500 focus:outline-none"
              autoFocus
            />
            <button
              onClick={handleManualPair}
              disabled={!manualToken.trim() || loading}
              className="w-full btn-primary py-3"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Koppeln'}
            </button>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="mt-10 max-w-xs text-center">
        <p className="text-xs text-surface-500 leading-relaxed">
          Öffnen Sie die Zeiterfassung am PC, gehen Sie zu «Geräte» und
          klicken Sie auf «QR-Code generieren». Scannen Sie dann den angezeigten Code.
        </p>
      </div>
    </div>
  );
}
