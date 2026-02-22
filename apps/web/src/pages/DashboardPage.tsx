import { useEffect, useState } from 'react';
import { useQuery } from '@/hooks/useQuery';
import { formatTime, formatLiveTimer, typeLabel, statusLabel } from '@/lib/format';
import { Clock, CheckCircle, AlertTriangle, Users, Loader2, Play } from 'lucide-react';
import clsx from 'clsx';

interface TimeEntry {
  id: string;
  startAt: string;
  endAt: string | null;
  entryType: string;
  status: string;
  rapport: string | null;
  user: { id: string; firstName: string; lastName: string };
  customer: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  breaks: { id: string; startAt: string; endAt: string | null }[];
}

function LiveTimer({ startAt }: { startAt: string }) {
  const [time, setTime] = useState(formatLiveTimer(startAt));
  useEffect(() => {
    const interval = setInterval(() => setTime(formatLiveTimer(startAt)), 1000);
    return () => clearInterval(interval);
  }, [startAt]);
  return <span className="font-mono text-lg font-bold text-brand-600">{time}</span>;
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: any;
  color: string;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-3">
        <div className={clsx('flex h-10 w-10 items-center justify-center rounded-lg', color)}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-surface-500 font-medium">{label}</p>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data: running, isLoading: loadingRunning } = useQuery<TimeEntry[]>('/time-entries/running');
  const { data: submitted, isLoading: loadingSub } = useQuery<TimeEntry[]>('/time-entries/submitted');

  const isLoading = loadingRunning || loadingSub;

  // Warnungen: Einträge > 10h oder ohne Pause > 6h
  const warnings: { entry: TimeEntry; reason: string }[] = [];
  if (running) {
    for (const entry of running) {
      const durationMs = Date.now() - new Date(entry.startAt).getTime();
      const hours = durationMs / 3600000;
      if (hours > 10) {
        warnings.push({ entry, reason: 'Über 10 Stunden aktiv' });
      } else if (hours > 6 && entry.breaks.length === 0) {
        warnings.push({ entry, reason: 'Über 6 Stunden ohne Pause' });
      }
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-surface-500 mt-1">Übersicht der aktuellen Zeiterfassung</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
        </div>
      ) : (
        <>
          {/* Statistiken */}
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Aktive Erfassungen"
              value={running?.length || 0}
              icon={Play}
              color="bg-brand-600"
            />
            <StatCard
              label="Zur Prüfung"
              value={submitted?.length || 0}
              icon={CheckCircle}
              color="bg-warning-500"
            />
            <StatCard
              label="Warnungen"
              value={warnings.length}
              icon={AlertTriangle}
              color={warnings.length > 0 ? 'bg-danger-500' : 'bg-surface-400'}
            />
          </div>

          {/* Warnungen */}
          {warnings.length > 0 && (
            <div className="card border-warning-500/30 bg-warning-500/5">
              <div className="px-5 py-3 border-b border-warning-500/20">
                <h2 className="text-sm font-semibold flex items-center gap-2 text-warning-600">
                  <AlertTriangle className="h-4 w-4" />
                  Warnungen
                </h2>
              </div>
              <div className="divide-y divide-warning-500/10">
                {warnings.map(({ entry, reason }) => (
                  <div key={entry.id} className="px-5 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{entry.user.firstName} {entry.user.lastName}</p>
                      <p className="text-xs text-surface-500">{reason}</p>
                    </div>
                    <LiveTimer startAt={entry.startAt} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Laufende Einträge */}
          <div className="card">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Play className="h-4 w-4 text-brand-600" />
                Läuft gerade
              </h2>
              <span className="badge badge-submitted">{running?.length || 0}</span>
            </div>
            {!running?.length ? (
              <div className="px-5 py-10 text-center text-sm text-surface-400">
                Keine aktiven Erfassungen
              </div>
            ) : (
              <div className="divide-y">
                {running.map((entry) => (
                  <div key={entry.id} className="px-5 py-3.5 flex items-center gap-4">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 uppercase">
                      {entry.user.firstName[0]}{entry.user.lastName[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {entry.user.firstName} {entry.user.lastName}
                      </p>
                      <p className="text-xs text-surface-500 truncate">
                        {entry.customer?.name || 'Kein Kunde'}
                        {entry.project && ` — ${entry.project.name}`}
                      </p>
                    </div>
                    <span className={clsx('badge', `badge-${entry.entryType.toLowerCase()}`)}>
                      {typeLabel(entry.entryType)}
                    </span>
                    <div className="text-right">
                      <LiveTimer startAt={entry.startAt} />
                      <p className="text-xs text-surface-400">seit {formatTime(entry.startAt)}</p>
                    </div>
                    {entry.breaks.some(b => !b.endAt) && (
                      <span className="badge bg-warning-500/10 text-warning-600">Pause</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Eingereichte Einträge */}
          <div className="card">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-warning-500" />
                Offen zur Prüfung
              </h2>
              <span className="badge badge-submitted">{submitted?.length || 0}</span>
            </div>
            {!submitted?.length ? (
              <div className="px-5 py-10 text-center text-sm text-surface-400">
                Keine offenen Einträge
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-surface-50/50 text-left text-xs font-semibold uppercase tracking-wider text-surface-500">
                      <th className="px-5 py-3">Mitarbeiter</th>
                      <th className="px-5 py-3">Datum</th>
                      <th className="px-5 py-3">Zeit</th>
                      <th className="px-5 py-3">Typ</th>
                      <th className="px-5 py-3">Kunde / Projekt</th>
                      <th className="px-5 py-3">Rapport</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {submitted.map((entry) => (
                      <tr key={entry.id} className="hover:bg-surface-50/80 transition-colors">
                        <td className="px-5 py-3 font-medium">
                          {entry.user.firstName} {entry.user.lastName}
                        </td>
                        <td className="px-5 py-3 text-surface-600">
                          {new Date(entry.startAt).toLocaleDateString('de-DE')}
                        </td>
                        <td className="px-5 py-3 font-mono text-xs">
                          {formatTime(entry.startAt)} — {entry.endAt ? formatTime(entry.endAt) : '--:--'}
                        </td>
                        <td className="px-5 py-3">
                          <span className={clsx('badge', `badge-${entry.entryType.toLowerCase()}`)}>
                            {typeLabel(entry.entryType)}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-surface-600 truncate max-w-[200px]">
                          {entry.customer?.name || '—'}
                          {entry.project && ` / ${entry.project.name}`}
                        </td>
                        <td className="px-5 py-3 text-surface-500 truncate max-w-[150px]">
                          {entry.rapport || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
