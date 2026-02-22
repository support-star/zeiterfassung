import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/stores/auth';
import { storeRefreshToken } from '@/lib/secure-storage';
import { isNativePlatform } from '@/lib/platform';
import { api, setAccessToken } from '@/lib/api';
import { Clock, AlertCircle, Loader2, QrCode } from 'lucide-react';

export default function MobileLoginPage() {
  const navigate = useNavigate();
  const { login, loadUser } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // Für Mobile: Login + RefreshToken speichern
      const data = await api<{ accessToken: string; refreshToken?: string }>(
        '/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({ email, password }),
          skipAuth: true,
        },
      );
      setAccessToken(data.accessToken);
      // Auf nativer Plattform kommt refreshToken im Body
      // Im Browser geht es per Cookie (aber wir speichern trotzdem falls vorhanden)
      if (data.refreshToken) {
        await storeRefreshToken(data.refreshToken);
      }
      await loadUser();
      navigate('/m', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Anmeldung fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-950 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 shadow-lg shadow-brand-600/30">
            <Clock className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Zeiterfassung</h1>
        </div>

        {/* QR-Code Option */}
        <button
          onClick={() => navigate('/m/scan')}
          className="w-full flex items-center justify-center gap-3 rounded-2xl bg-brand-600 px-6 py-5 text-lg font-semibold text-white shadow-lg shadow-brand-600/20 active:scale-[0.98] transition-transform mb-6"
        >
          <QrCode className="h-6 w-6" />
          Mit QR-Code koppeln
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="h-px flex-1 bg-surface-700" />
          <span className="text-xs text-surface-500 uppercase">oder Passwort</span>
          <div className="h-px flex-1 bg-surface-700" />
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-danger-500/10 border border-danger-500/20 px-4 py-3 text-sm text-danger-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl bg-surface-800 border border-surface-700 px-4 py-3.5 text-sm text-white placeholder-surface-500 focus:border-brand-500 focus:outline-none"
            placeholder="E-Mail"
            required
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl bg-surface-800 border border-surface-700 px-4 py-3.5 text-sm text-white placeholder-surface-500 focus:border-brand-500 focus:outline-none"
            placeholder="Passwort"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-surface-700 px-4 py-3.5 text-sm font-medium text-white hover:bg-surface-600 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Anmelden'}
          </button>
        </form>
      </div>
    </div>
  );
}
