import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/stores/auth';
import { api } from '@/lib/api';
import { formatTime, formatLiveTimer, typeLabel } from '@/lib/format';
import {
  Play, Coffee, CheckCircle, AlertTriangle, Clock,
  RefreshCw, Send, Users, Loader2,
} from 'lucide-react';
import clsx from 'clsx';

interface BreakEntry { id: string; startAt: string; endAt: string | null; breakType: string; }
interface RunningEntry {
  id: string; startAt: string; endAt: string | null; entryType: string;
  status: string; rapport: string | null;
  user: { id: string; firstName: string; lastName: string };
  customer: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  breaks: BreakEntry[];
}
interface AllUser { id: string; firstName: string; lastName: string; role: string; isActive: boolean; }

// ── Hilfsfunktionen ──────────────────────────────────
function initials(f: string, l: string) { return `${f[0]??''}${l[0]??''}`.toUpperCase(); }

function LiveTimer({ startAt, className }: { startAt: string; className?: string }) {
  const [t, setT] = useState(formatLiveTimer(startAt));
  useEffect(() => {
    const i = setInterval(() => setT(formatLiveTimer(startAt)), 1000);
    return () => clearInterval(i);
  }, [startAt]);
  return <span className={clsx('font-mono tabular-nums', className)}>{t}</span>;
}

function BreakTimer({ breaks }: { breaks: BreakEntry[] }) {
  const ob = breaks.find(b => !b.endAt);
  const [t, setT] = useState(ob ? formatLiveTimer(ob.startAt) : '');
  useEffect(() => {
    if (!ob) return;
    const i = setInterval(() => setT(formatLiveTimer(ob.startAt)), 1000);
    return () => clearInterval(i);
  }, [ob?.startAt]);
  if (!ob) return null;
  return <span className="font-mono tabular-nums text-warning-600 font-bold">{t}</span>;
}

type UserStatus = 'working' | 'break' | 'idle';
function getStatus(entry?: RunningEntry): UserStatus {
  if (!entry || entry.endAt) return 'idle';
  if (entry.breaks.some(b => !b.endAt)) return 'break';
  return 'working';
}

const S = {
  working: { label: 'Arbeitet', dot: 'bg-success-500 animate-pulse', badge: 'bg-success-500/10 text-success-600', card: 'border-success-500/40 bg-success-500/5', avatar: 'bg-brand-700 text-white ring-2 ring-success-400 ring-offset-1' },
  break:   { label: 'Pause',    dot: 'bg-warning-500 animate-pulse', badge: 'bg-warning-500/10 text-warning-600', card: 'border-warning-500/40 bg-warning-500/5', avatar: 'bg-surface-400 text-white ring-2 ring-warning-400 ring-offset-1' },
  idle:    { label: 'Inaktiv',  dot: 'bg-surface-300',               badge: 'bg-surface-100 text-surface-500',   card: 'border-surface-200 bg-surface-50/60',   avatar: 'bg-surface-200 text-surface-500 ring-2 ring-surface-200 ring-offset-1' },
};

// ── Mitarbeiter-Karte ─────────────────────────────────
function WorkerCard({ worker, entry }: { worker: AllUser; entry?: RunningEntry }) {
  const status = getStatus(entry);
  const cfg = S[status];
  const onBreak = entry?.breaks.some(b => !b.endAt);

  return (
    <div className={clsx('card p-4 border-2 transition-all duration-500 hover:shadow-md', cfg.card)}>
      {/* Kopf: Avatar + Name + Status */}
      <div className="flex items-center gap-3 mb-3">
        <div className={clsx('flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold flex-shrink-0', cfg.avatar)}>
          {initials(worker.firstName, worker.lastName)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{worker.firstName} {worker.lastName}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={clsx('w-2 h-2 rounded-full flex-shrink-0', cfg.dot)} />
            <span className={clsx('text-xs font-semibold', cfg.badge)}>{cfg.label}</span>
            {onBreak && <Coffee className="h-3 w-3 text-warning-500 ml-0.5" />}
          </div>
        </div>
      </div>

      {/* Details */}
      {entry && !entry.endAt ? (
        <div className="space-y-1 text-xs">
          {/* Haupt-Timer */}
          <div className="flex items-center justify-between py-1">
            <span className="text-surface-400">{onBreak ? 'Pause' : 'Aktiv seit'}</span>
            {onBreak
              ? <BreakTimer breaks={entry.breaks} />
              : <LiveTimer startAt={entry.startAt} className="text-success-600 font-bold text-sm" />
            }
          </div>

          {/* Wenn Pause: Gesamtzeit trotzdem zeigen */}
          {onBreak && (
            <div className="flex items-center justify-between">
              <span className="text-surface-400">Gesamtzeit</span>
              <LiveTimer startAt={entry.startAt} className="text-surface-500" />
            </div>
          )}

          {/* Beginn */}
          <div className="flex items-center justify-between">
            <span className="text-surface-400">Beginn</span>
            <span className="font-mono">{formatTime(entry.startAt)}</span>
          </div>

          {/* Typ */}
          <div className="flex items-center justify-between">
            <span className="text-surface-400">Typ</span>
            <span className={clsx('badge', `badge-${entry.entryType.toLowerCase()}`)}>{typeLabel(entry.entryType)}</span>
          </div>

          {/* Kunde / Projekt */}
          {(entry.customer || entry.project) && (
            <div className="pt-2 mt-1 border-t border-surface-100">
              {entry.customer && <p className="font-medium text-surface-700 truncate">{entry.customer.name}</p>}
              {entry.project && <p className="text-surface-400 truncate">{entry.project.name}</p>}
            </div>
          )}

          {/* Rapport-Vorschau */}
          {entry.rapport && (
            <div className="pt-1 border-t border-surface-100 text-surface-400 italic truncate">
              {entry.rapport}
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-surface-400 text-center py-3">Keine aktive Erfassung</p>
      )}
    </div>
  );
}

// ── Haupt-Dashboard ───────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'DISPO';

  const [running, setRunning] = useState<RunningEntry[]>([]);
  const [submitted, setSubmitted] = useState<RunningEntry[]>([]);
  const [workers, setWorkers] = useState<AllUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [countdown, setCountdown] = useState(30);

  const load = useCallback(async () => {
    try {
      if (canManage) {
        const [r, s, u] = await Promise.all([
          api.get<RunningEntry[]>('/time-entries/running'),
          api.get<RunningEntry[]>('/time-entries/submitted'),
          api.get<AllUser[]>('/users'),
        ]);
        setRunning(r);
        setSubmitted(s);
        setWorkers(u.filter(u => u.isActive && (u.role === 'WORKER' || u.role === 'DISPO')));
      } else {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const r = await api.get<RunningEntry[]>(`/time-entries?from=${today.toISOString()}`);
        setRunning(r.filter(e => !e.endAt));
      }
      setLastRefresh(new Date());
      setCountdown(30);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [canManage]);

  useEffect(() => {
    load();
    const iv = setInterval(load, 30_000);
    return () => clearInterval(iv);
  }, [load]);

  useEffect(() => {
    const iv = setInterval(() => setCountdown(c => c <= 1 ? 30 : c - 1), 1000);
    return () => clearInterval(iv);
  }, [lastRefresh]);

  // ── WORKER VIEW ──
  if (!canManage) {
    const myEntry = running.find(e => e.user.id === user?.id);
    const status = getStatus(myEntry);
    const cfg = S[status];
    return (
      <div className="p-6 lg:p-8 max-w-xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Hallo, {user?.firstName}!</h1>
          <p className="text-sm text-surface-500 mt-1">Dein aktueller Status</p>
        </div>
        <div className={clsx('card p-6 border-2', cfg.card)}>
          <div className="flex items-center gap-4">
            <div className={clsx('flex h-16 w-16 items-center justify-center rounded-full text-xl font-bold', cfg.avatar)}>
              {initials(user?.firstName ?? '', user?.lastName ?? '')}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className={clsx('w-3 h-3 rounded-full', cfg.dot)} />
                <span className={clsx('badge text-sm', cfg.badge)}>{cfg.label}</span>
              </div>
              {myEntry ? (
                <>
                  <div className="text-3xl font-bold">
                    {myEntry.breaks.some(b => !b.endAt)
                      ? <BreakTimer breaks={myEntry.breaks} />
                      : <LiveTimer startAt={myEntry.startAt} className="text-success-600" />
                    }
                  </div>
                  <p className="text-sm text-surface-500 mt-1">
                    Beginn {formatTime(myEntry.startAt)}
                    {myEntry.customer && <> · {myEntry.customer.name}</>}
                  </p>
                </>
              ) : (
                <p className="text-surface-400">Keine aktive Zeiterfassung</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── ADMIN / DISPO VIEW ──
  const byUser = new Map(running.map(e => [e.user.id, e]));
  const countWorking = running.filter(e => !e.endAt && !e.breaks.some(b => !b.endAt)).length;
  const countBreak = running.filter(e => !e.endAt && e.breaks.some(b => !b.endAt)).length;
  const countIdle = workers.filter(w => !byUser.has(w.id)).length;
  const warnings = running.filter(e => {
    const h = (Date.now() - new Date(e.startAt).getTime()) / 3_600_000;
    return h > 10 || (h > 6 && e.breaks.length === 0);
  });

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Live-Dashboard</h1>
          <p className="text-sm text-surface-500 mt-1">
            Echtzeit-Übersicht · Letzte Aktualisierung {lastRefresh.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-surface-400">
            <span className="w-1.5 h-1.5 rounded-full bg-success-500 animate-pulse" />
            Aktualisierung in {countdown}s
          </div>
          <button onClick={load} className="btn-secondary btn-sm">
            <RefreshCw className="h-3.5 w-3.5" /> Jetzt
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Arbeiten',      value: countWorking,     Icon: Play,        bg: 'bg-success-500', color: 'text-success-600' },
          { label: 'In Pause',      value: countBreak,       Icon: Coffee,      bg: 'bg-warning-500', color: 'text-warning-600' },
          { label: 'Nicht aktiv',   value: countIdle,        Icon: Clock,       bg: 'bg-surface-400', color: 'text-surface-500' },
          { label: 'Zur Prüfung',   value: submitted.length, Icon: CheckCircle, bg: 'bg-brand-600',   color: 'text-brand-600'   },
        ].map(({ label, value, Icon, bg, color }) => (
          <div key={label} className="card p-4 flex items-center gap-4">
            <div className={clsx('flex h-11 w-11 items-center justify-center rounded-xl flex-shrink-0', bg)}>
              <Icon className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className={clsx('text-3xl font-bold tabular-nums', color)}>{value}</p>
              <p className="text-xs text-surface-500 font-medium">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Warnungen */}
      {warnings.length > 0 && (
        <div className="card border-2 border-danger-500/40 bg-danger-500/5">
          <div className="px-5 py-3 border-b border-danger-200 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-danger-500" />
            <h2 className="text-sm font-semibold text-danger-700">{warnings.length} Warnung{warnings.length > 1 ? 'en' : ''}</h2>
          </div>
          <div className="divide-y divide-danger-100">
            {warnings.map(e => {
              const h = (Date.now() - new Date(e.startAt).getTime()) / 3_600_000;
              return (
                <div key={e.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{e.user.firstName} {e.user.lastName}</p>
                    <p className="text-xs text-danger-600">{h > 10 ? 'Über 10 Stunden aktiv' : 'Über 6 Stunden ohne Pause'}</p>
                  </div>
                  <LiveTimer startAt={e.startAt} className="text-danger-600 font-bold text-base" />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Live Mitarbeiter-Karten */}
      <div>
        <div className="flex items-center gap-3 mb-5">
          <Users className="h-4 w-4 text-surface-500" />
          <h2 className="text-sm font-semibold text-surface-700">Team · {workers.length} Mitarbeiter</h2>
          <div className="flex-1 h-px bg-surface-200" />
          <span className="text-xs text-surface-400">{countWorking} aktiv · {countBreak} Pause · {countIdle} inaktiv</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
          </div>
        ) : workers.length === 0 ? (
          <div className="text-center py-16 text-surface-400 text-sm">Keine Mitarbeiter vorhanden</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {/* Zuerst Aktive, dann Pause, dann Inaktiv */}
            {[
              ...workers.filter(w => { const e = byUser.get(w.id); return getStatus(e) === 'working'; }),
              ...workers.filter(w => { const e = byUser.get(w.id); return getStatus(e) === 'break'; }),
              ...workers.filter(w => { const e = byUser.get(w.id); return getStatus(e) === 'idle'; }),
            ].map(worker => (
              <WorkerCard key={worker.id} worker={worker} entry={byUser.get(worker.id)} />
            ))}
          </div>
        )}
      </div>

      {/* Zur Prüfung */}
      {submitted.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <Send className="h-4 w-4 text-surface-500" />
            <h2 className="text-sm font-semibold text-surface-700">Zur Prüfung · {submitted.length} offen</h2>
            <div className="flex-1 h-px bg-surface-200" />
          </div>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-surface-50/50 text-left text-xs font-semibold uppercase tracking-wider text-surface-500">
                    <th className="px-5 py-3">Mitarbeiter</th>
                    <th className="px-5 py-3">Datum</th>
                    <th className="px-5 py-3">Zeitraum</th>
                    <th className="px-5 py-3">Typ</th>
                    <th className="px-5 py-3">Kunde / Projekt</th>
                    <th className="px-5 py-3">Rapport</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {submitted.map(e => (
                    <tr key={e.id} className="hover:bg-surface-50/80 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                            {initials(e.user.firstName, e.user.lastName)}
                          </div>
                          <span className="font-medium">{e.user.firstName} {e.user.lastName}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-surface-600">{new Date(e.startAt).toLocaleDateString('de-DE')}</td>
                      <td className="px-5 py-3 font-mono text-xs">{formatTime(e.startAt)} — {e.endAt ? formatTime(e.endAt) : '–'}</td>
                      <td className="px-5 py-3"><span className={clsx('badge', `badge-${e.entryType.toLowerCase()}`)}>{typeLabel(e.entryType)}</span></td>
                      <td className="px-5 py-3 text-surface-600 max-w-[180px] truncate">
                        {e.customer?.name ?? '—'}{e.project && <span className="text-surface-400"> / {e.project.name}</span>}
                      </td>
                      <td className="px-5 py-3 text-surface-400 max-w-[140px] truncate">{e.rapport ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
