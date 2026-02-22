import { useQuery } from '@/hooks/useQuery';
import { formatDate, formatTime, formatDuration, typeLabel, statusLabel } from '@/lib/format';
import { Clock, ArrowLeft, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';

interface TimeEntry {
  id: string;
  startAt: string;
  endAt: string | null;
  entryType: string;
  status: string;
  rapport: string | null;
  customer: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  breaks: { id: string; startAt: string; endAt: string | null }[];
}

export default function MobileHistoryPage() {
  const navigate = useNavigate();

  // Letzte 7 Tage
  const from = new Date();
  from.setDate(from.getDate() - 7);
  const to = new Date();

  const { data: entries, isLoading } = useQuery<TimeEntry[]>(
    `/time-entries?from=${from.toISOString()}&to=${to.toISOString()}`,
  );

  // Einträge nach Datum gruppieren
  const grouped = new Map<string, TimeEntry[]>();
  if (entries) {
    for (const entry of entries) {
      const dateKey = formatDate(entry.startAt);
      if (!grouped.has(dateKey)) grouped.set(dateKey, []);
      grouped.get(dateKey)!.push(entry);
    }
  }

  return (
    <div className="min-h-screen bg-surface-950 text-white safe-area-inset">
      {/* Header */}
      <header className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-surface-800">
        <button onClick={() => navigate('/m')} className="p-1 text-surface-400">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="font-semibold">Letzte 7 Tage</h1>
      </header>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
        </div>
      ) : !entries?.length ? (
        <div className="px-5 py-20 text-center text-sm text-surface-500">
          Keine Einträge in den letzten 7 Tagen
        </div>
      ) : (
        <div className="pb-8">
          {Array.from(grouped.entries()).map(([date, items]) => {
            // Tagessumme in Minuten
            let totalMins = 0;
            for (const e of items) {
              if (e.endAt) {
                const dur = (new Date(e.endAt).getTime() - new Date(e.startAt).getTime()) / 60000;
                // Pausenzeit abziehen
                let breakMins = 0;
                for (const b of e.breaks) {
                  const bEnd = b.endAt ? new Date(b.endAt).getTime() : Date.now();
                  breakMins += (bEnd - new Date(b.startAt).getTime()) / 60000;
                }
                totalMins += dur - breakMins;
              }
            }
            const h = Math.floor(totalMins / 60);
            const m = Math.round(totalMins % 60);

            return (
              <div key={date}>
                {/* Datums-Header */}
                <div className="sticky top-0 z-10 flex items-center justify-between bg-surface-900/95 backdrop-blur-sm px-5 py-2.5 border-b border-surface-800">
                  <span className="text-xs font-semibold text-surface-400 uppercase tracking-wider">
                    {date}
                  </span>
                  <span className="text-xs font-mono font-bold text-brand-400">
                    {h}:{String(m).padStart(2, '0')} h
                  </span>
                </div>

                {/* Einträge */}
                {items.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start gap-3 px-5 py-3.5 border-b border-surface-800/50"
                  >
                    {/* Typ-Indikator */}
                    <div className={clsx(
                      'mt-0.5 h-2 w-2 rounded-full shrink-0',
                      entry.entryType === 'WORK' ? 'bg-brand-500' :
                      entry.entryType === 'TRAVEL' ? 'bg-warning-500' : 'bg-surface-500',
                    )} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {formatTime(entry.startAt)} — {entry.endAt ? formatTime(entry.endAt) : 'läuft'}
                        </span>
                        <span className="font-mono text-xs text-surface-500">
                          {formatDuration(entry.startAt, entry.endAt)}
                        </span>
                      </div>
                      <p className="text-xs text-surface-500 mt-0.5 truncate">
                        {entry.customer?.name || 'Kein Kunde'}
                        {entry.project && ` — ${entry.project.name}`}
                      </p>
                      {entry.rapport && (
                        <p className="text-xs text-surface-400 mt-1 italic truncate">
                          „{entry.rapport}"
                        </p>
                      )}
                    </div>

                    {/* Status */}
                    <span className={clsx(
                      'shrink-0 text-[10px] font-semibold uppercase tracking-wider rounded-full px-2 py-0.5',
                      entry.status === 'DRAFT' ? 'bg-surface-800 text-surface-400' :
                      entry.status === 'SUBMITTED' ? 'bg-brand-900/50 text-brand-300' :
                      entry.status === 'APPROVED' ? 'bg-success-500/10 text-success-400' :
                      'bg-surface-700 text-surface-300',
                    )}>
                      {statusLabel(entry.status)}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
