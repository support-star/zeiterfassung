import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/stores/auth';
import { useQuery, useMutation } from '@/hooks/useQuery';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { QRCodeSVG } from 'qrcode.react';
import {
  Smartphone,
  Monitor,
  Tablet,
  QrCode,
  Loader2,
  ShieldOff,
  RefreshCw,
  CheckCircle,
} from 'lucide-react';
import clsx from 'clsx';

interface Device {
  id: string;
  deviceName: string;
  platform: string;
  lastSeenAt: string;
  revokedAt: string | null;
  createdAt: string;
}

interface PairingToken {
  token: string;
  expiresAt: string;
}

function PlatformIcon({ platform }: { platform: string }) {
  switch (platform) {
    case 'ANDROID':
    case 'IOS':
      return <Smartphone className="h-5 w-5" />;
    default:
      return <Monitor className="h-5 w-5" />;
  }
}

function PlatformLabel(platform: string) {
  const map: Record<string, string> = { WEB: 'Web Browser', ANDROID: 'Android', IOS: 'iOS' };
  return map[platform] || platform;
}

function QRPairing({ appUrl }: { appUrl: string }) {
  const [pairing, setPairing] = useState<PairingToken | null>(null);
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);

  const generate = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.post<PairingToken>('/auth/pairing-token');
      setPairing(data);
    } catch {
      // ignorieren
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!pairing) return;
    const interval = setInterval(() => {
      const left = Math.max(0, Math.round((new Date(pairing.expiresAt).getTime() - Date.now()) / 1000));
      setTimeLeft(left);
      if (left === 0) {
        setPairing(null);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [pairing]);

  const pairUrl = pairing ? `${appUrl}/pair?token=${pairing.token}` : '';

  return (
    <div className="card p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100">
          <QrCode className="h-5 w-5 text-brand-700" />
        </div>
        <div>
          <h3 className="font-semibold">Handy koppeln</h3>
          <p className="text-xs text-surface-500">QR-Code mit der App scannen</p>
        </div>
      </div>

      {!pairing ? (
        <div className="text-center py-6">
          <button onClick={generate} disabled={loading} className="btn-primary">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
            QR-Code generieren
          </button>
          <p className="text-xs text-surface-400 mt-3">Gültig für 60 Sekunden</p>
        </div>
      ) : (
        <div className="text-center space-y-4">
          <div className="inline-block rounded-2xl bg-white p-4 shadow-lg border">
            <QRCodeSVG value={pairUrl} size={200} level="M" />
          </div>
          <div>
            <div className="flex items-center justify-center gap-2 text-sm font-medium">
              <div
                className={clsx(
                  'h-2 w-2 rounded-full',
                  timeLeft > 20 ? 'bg-success-500' : timeLeft > 5 ? 'bg-warning-500' : 'bg-danger-500',
                )}
              />
              {timeLeft}s verbleibend
            </div>
            <button onClick={generate} className="btn-ghost btn-sm mt-2">
              <RefreshCw className="h-3.5 w-3.5" /> Neuen Code
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DevicesPage() {
  const { user } = useAuth();
  const canManageOthers = user?.role === 'ADMIN' || user?.role === 'DISPO';
  const { data: users } = useQuery<{ id: string; firstName: string; lastName: string }[]>(
    canManageOthers ? '/users' : null,
  );
  const [selectedUser, setSelectedUser] = useState('');

  const targetUserId = canManageOthers && selectedUser ? selectedUser : user?.id;
  const { data: devices, isLoading, refetch } = useQuery<Device[]>(
    targetUserId ? `/users/${targetUserId}/devices` : null,
    [targetUserId],
  );
  const { mutate } = useMutation();

  const handleRevoke = async (deviceId: string) => {
    if (!confirm('Gerät wirklich widerrufen? Das Gerät wird sofort abgemeldet.')) return;
    await mutate('POST', '/auth/revoke-device', { deviceId });
    refetch();
  };

  // APP_URL für QR — hier Frontend-URL nehmen
  const appUrl = window.location.origin;

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Geräte</h1>
        <p className="text-sm text-surface-500 mt-1">Gekoppelte Geräte verwalten und neue koppeln</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* QR-Kopplung */}
        <QRPairing appUrl={appUrl} />

        {/* Info-Karte */}
        <div className="card p-6">
          <h3 className="font-semibold mb-3">So funktioniert die Kopplung</h3>
          <ol className="space-y-3 text-sm text-surface-600">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">1</span>
              QR-Code hier generieren (60s gültig)
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">2</span>
              App auf dem Handy öffnen und "QR scannen" wählen
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">3</span>
              QR-Code scannen — Handy ist sofort eingeloggt
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success-500/10 text-xs font-bold text-success-600">
                <CheckCircle className="h-3.5 w-3.5" />
              </span>
              Kein Passwort am Handy nötig
            </li>
          </ol>
        </div>
      </div>

      {/* User-Auswahl für Admin */}
      {canManageOthers && (
        <div>
          <label className="label">Geräte anzeigen für</label>
          <select
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
            className="input w-60"
          >
            <option value="">Meine Geräte</option>
            {users?.map((u) => (
              <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
            ))}
          </select>
        </div>
      )}

      {/* Geräteliste */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h3 className="text-sm font-semibold">Gekoppelte Geräte</h3>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>
        ) : !devices?.length ? (
          <div className="py-12 text-center text-sm text-surface-400">Keine Geräte gekoppelt</div>
        ) : (
          <div className="divide-y">
            {devices.map((d) => (
              <div
                key={d.id}
                className={clsx(
                  'flex items-center gap-4 px-5 py-4',
                  d.revokedAt && 'opacity-40',
                )}
              >
                <div className={clsx(
                  'flex h-10 w-10 items-center justify-center rounded-lg',
                  d.revokedAt ? 'bg-surface-100 text-surface-400' : 'bg-brand-100 text-brand-700',
                )}>
                  <PlatformIcon platform={d.platform} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{d.deviceName}</p>
                  <p className="text-xs text-surface-500">
                    {PlatformLabel(d.platform)} · Zuletzt aktiv {formatDateTime(d.lastSeenAt)}
                  </p>
                </div>
                {d.revokedAt ? (
                  <span className="badge badge-draft">Widerrufen</span>
                ) : (
                  <button
                    onClick={() => handleRevoke(d.id)}
                    className="btn-ghost btn-sm text-danger-500"
                    title="Gerät widerrufen"
                  >
                    <ShieldOff className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
