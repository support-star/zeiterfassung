import { useState, FormEvent } from 'react';
import { useAuth } from '@/stores/auth';
import { Clock, AlertCircle, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || 'Anmeldung fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-950 px-4">
      {/* Hintergrund-Akzent */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-brand-700/20 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-brand-500/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 shadow-lg shadow-brand-600/30">
            <Clock className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Zeiterfassung</h1>
          <p className="mt-1 text-sm text-surface-400">Melden Sie sich an</p>
        </div>

        {/* Formular */}
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-surface-700/50 bg-surface-900 p-6 shadow-2xl"
        >
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-danger-500/10 px-3 py-2.5 text-sm text-danger-500">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="label text-surface-400">E-Mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input bg-surface-800 border-surface-700 text-white placeholder-surface-500 focus:border-brand-500 focus:ring-brand-500/30"
                placeholder="name@firma.de"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="label text-surface-400">Passwort</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input bg-surface-800 border-surface-700 text-white placeholder-surface-500 focus:border-brand-500 focus:ring-brand-500/30"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full mt-6 py-3"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              'Anmelden'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
