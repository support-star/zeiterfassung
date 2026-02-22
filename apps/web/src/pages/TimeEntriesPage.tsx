import { useState, useEffect, useCallback, FormEvent } from 'react';
import { useAuth } from '@/stores/auth';
import { useQuery, useMutation } from '@/hooks/useQuery';
import { api } from '@/lib/api';
import {
  formatTime,
  formatDate,
  formatDuration,
  formatLiveTimer,
  typeLabel,
  statusLabel,
} from '@/lib/format';
import {
  Clock,
  Play,
  Square,
  Pause,
  Coffee,
  Send,
  CheckCircle,
  RotateCcw,
  Lock,
  Filter,
  Plus,
  Loader2,
  FileText,
  Download,
  ChevronDown,
} from 'lucide-react';
import clsx from 'clsx';

interface TimeEntry {
  id: string;
  userId: string;
  startAt: string;
  endAt: string | null;
  entryType: string;
  status: string;
  rapport: string | null;
  createdVia: string;
  user: { id: string; firstName: string; lastName: string };
  customer: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  breaks: { id: string; startAt: string; endAt: string | null; breakType: string }[];
}

interface Customer { id: string; name: string; }
interface Project { id: string; name: string; customerId: string; }

function LiveBadge({ startAt }: { startAt: string }) {
  const [t, setT] = useState(formatLiveTimer(startAt));
  useEffect(() => {
    const i = setInterval(() => setT(formatLiveTimer(startAt)), 1000);
    return () => clearInterval(i);
  }, [startAt]);
  return <span className="font-mono text-xs font-bold text-brand-600">{t}</span>;
}

function BreakDuration({ breaks }: { breaks: TimeEntry['breaks'] }) {
  let total = 0;
  for (const b of breaks) {
    const end = b.endAt ? new Date(b.endAt).getTime() : Date.now();
    total += end - new Date(b.startAt).getTime();
  }
  if (total === 0) return <span className="text-surface-400">—</span>;
  const mins = Math.round(total / 60000);
  return <span>{mins} min</span>;
}

export default function TimeEntriesPage() {
  const { user } = useAuth();
  const isWorker = user?.role === 'WORKER';
  const canManage = user?.role === 'ADMIN' || user?.role === 'DISPO';

  // Filter-State
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [filterUser, setFilterUser] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Neuer Eintrag
  const [showNew, setShowNew] = useState(false);
  const [newCustomer, setNewCustomer] = useState('');
  const [newProject, setNewProject] = useState('');
  const [newType, setNewType] = useState('WORK');
  const [newRapport, setNewRapport] = useState('');

  // Rapport-Bearbeitung
  const [editRapportId, setEditRapportId] = useState<string | null>(null);
  const [editRapportText, setEditRapportText] = useState('');

  const { mutate, isLoading: mutating } = useMutation();

  // Daten laden
  const query = new URLSearchParams();
  if (from) query.set('from', new Date(from).toISOString());
  if (to) query.set('to', new Date(to + 'T23:59:59').toISOString());
  if (filterUser) query.set('userId', filterUser);
  if (filterCustomer) query.set('customerId', filterCustomer);
  if (filterStatus) query.set('status', filterStatus);
  if (filterType) query.set('type', filterType);

  const { data: entries, isLoading, refetch } = useQuery<TimeEntry[]>(
    `/time-entries?${query.toString()}`,
    [from, to, filterUser, filterCustomer, filterStatus, filterType],
  );
  const { data: customers } = useQuery<Customer[]>('/customers');
  const { data: allProjects } = useQuery<Project[]>('/projects');
  const { data: users } = useQuery<{ id: string; firstName: string; lastName: string }[]>(
    canManage ? '/users' : null,
  );

  const filteredProjects = allProjects?.filter(
    (p) => !newCustomer || p.customerId === newCustomer,
  );

  // Aktionen
  const handleStart = async (e: FormEvent) => {
    e.preventDefault();
    await mutate('POST', '/time-entries/start', {
      customerId: newCustomer || null,
      projectId: newProject || null,
      entryType: newType,
      createdVia: 'WEB',
      rapport: newRapport || null,
    });
    setShowNew(false);
    setNewRapport('');
    refetch();
  };

  const handleEnd = async (id: string) => {
    await mutate('POST', `/time-entries/${id}/end`, {});
    refetch();
  };

  const handleStartBreak = async (id: string) => {
    await mutate('POST', `/time-entries/${id}/break/start`, { breakType: 'DEFAULT' });
    refetch();
  };

  const handleEndBreak = async (id: string) => {
    await mutate('POST', `/time-entries/${id}/break/end`, {});
    refetch();
  };

  const handleSubmit = async (id: string) => {
    await mutate('POST', `/time-entries/${id}/submit`, {});
    refetch();
  };

  const handleApprove = async (id: string) => {
    await mutate('POST', `/time-entries/${id}/approve`, {});
    refetch();
  };

  const handleReopen = async (id: string) => {
    await mutate('POST', `/time-entries/${id}/reopen`, {});
    refetch();
  };

  const handleSaveRapport = async () => {
    if (!editRapportId) return;
    await mutate('POST', `/time-entries/${editRapportId}/rapport`, { rapport: editRapportText });
    setEditRapportId(null);
    refetch();
  };

  // Bulk
  const handleBulkAction = async (action: string) => {
    if (selected.size === 0) return;
    await mutate('POST', `/time-entries/bulk/${action}`, { ids: Array.from(selected) });
    setSelected(new Set());
    refetch();
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    if (!entries) return;
    if (selected.size === entries.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(entries.map((e) => e.id)));
    }
  };

  // Export-Links
  const now = new Date();
  const exportYear = now.getFullYear();
  const exportMonth = now.getMonth() + 1;

  const hasBreakRunning = (entry: TimeEntry) => entry.breaks.some((b) => !b.endAt);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Zeiterfassung</h1>
          <p className="text-sm text-surface-500 mt-1">Einträge verwalten und auswerten</p>
        </div>
        <div className="flex gap-2">
          {canManage && (
            <div className="flex gap-1">
              <a
                href={`/api/exports/payroll.csv?year=${exportYear}&month=${exportMonth}`}
                className="btn-secondary btn-sm"
                target="_blank"
              >
                <Download className="h-3.5 w-3.5" /> Payroll CSV
              </a>
              <a
                href={`/api/exports/billing.csv?year=${exportYear}&month=${exportMonth}`}
                className="btn-secondary btn-sm"
                target="_blank"
              >
                <Download className="h-3.5 w-3.5" /> Billing CSV
              </a>
            </div>
          )}
          <button onClick={() => setShowNew(!showNew)} className="btn-primary btn-sm">
            <Plus className="h-4 w-4" /> Neuer Eintrag
          </button>
        </div>
      </div>

      {/* Neuer Eintrag Form */}
      {showNew && (
        <form onSubmit={handleStart} className="card p-5">
          <h3 className="text-sm font-semibold mb-4">Zeiterfassung starten</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className="label">Typ</label>
              <select value={newType} onChange={(e) => setNewType(e.target.value)} className="input">
                <option value="WORK">Arbeit</option>
                <option value="TRAVEL">Fahrt</option>
                <option value="INTERNAL">Intern</option>
              </select>
            </div>
            <div>
              <label className="label">Kunde</label>
              <select
                value={newCustomer}
                onChange={(e) => { setNewCustomer(e.target.value); setNewProject(''); }}
                className="input"
              >
                <option value="">— Kein Kunde —</option>
                {customers?.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Projekt</label>
              <select
                value={newProject}
                onChange={(e) => setNewProject(e.target.value)}
                className="input"
                disabled={!newCustomer}
              >
                <option value="">— Kein Projekt —</option>
                {filteredProjects?.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Rapport</label>
              <input
                value={newRapport}
                onChange={(e) => setNewRapport(e.target.value)}
                className="input"
                placeholder="Kurzbeschreibung..."
              />
            </div>
            <div className="flex items-end">
              <button type="submit" disabled={mutating} className="btn-success w-full">
                <Play className="h-4 w-4" /> Starten
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Filter */}
      <div className="card">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex w-full items-center justify-between px-5 py-3 text-sm font-medium text-surface-600 hover:bg-surface-50 transition-colors"
        >
          <span className="flex items-center gap-2">
            <Filter className="h-4 w-4" /> Filter
          </span>
          <ChevronDown className={clsx('h-4 w-4 transition-transform', showFilters && 'rotate-180')} />
        </button>
        {showFilters && (
          <div className="border-t px-5 py-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className="label">Von</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">Bis</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input" />
            </div>
            {canManage && (
              <div>
                <label className="label">Mitarbeiter</label>
                <select value={filterUser} onChange={(e) => setFilterUser(e.target.value)} className="input">
                  <option value="">Alle</option>
                  {users?.map((u) => (
                    <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="label">Status</label>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input">
                <option value="">Alle</option>
                <option value="DRAFT">Entwurf</option>
                <option value="SUBMITTED">Eingereicht</option>
                <option value="APPROVED">Freigegeben</option>
                <option value="LOCKED">Gesperrt</option>
              </select>
            </div>
            <div>
              <label className="label">Typ</label>
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="input">
                <option value="">Alle</option>
                <option value="WORK">Arbeit</option>
                <option value="TRAVEL">Fahrt</option>
                <option value="INTERNAL">Intern</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Bulk Actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 bg-brand-50 rounded-lg px-4 py-2.5 border border-brand-200">
          <span className="text-sm font-medium text-brand-700">{selected.size} ausgewählt</span>
          <div className="flex gap-1 ml-auto">
            <button onClick={() => handleBulkAction('submit')} className="btn-secondary btn-sm">
              <Send className="h-3.5 w-3.5" /> Einreichen
            </button>
            {canManage && (
              <>
                <button onClick={() => handleBulkAction('approve')} className="btn-success btn-sm">
                  <CheckCircle className="h-3.5 w-3.5" /> Freigeben
                </button>
                <button onClick={() => handleBulkAction('reopen')} className="btn-secondary btn-sm">
                  <RotateCcw className="h-3.5 w-3.5" /> Zurücksetzen
                </button>
              </>
            )}
            <button onClick={() => setSelected(new Set())} className="btn-ghost btn-sm">Abbrechen</button>
          </div>
        </div>
      )}

      {/* Tabelle */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
          </div>
        ) : !entries?.length ? (
          <div className="py-20 text-center text-sm text-surface-400">Keine Einträge gefunden</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-surface-50/50 text-left text-xs font-semibold uppercase tracking-wider text-surface-500">
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={entries.length > 0 && selected.size === entries.length}
                      onChange={toggleAll}
                      className="rounded border-surface-300"
                    />
                  </th>
                  {canManage && <th className="px-4 py-3">Mitarbeiter</th>}
                  <th className="px-4 py-3">Datum</th>
                  <th className="px-4 py-3">Start</th>
                  <th className="px-4 py-3">Ende</th>
                  <th className="px-4 py-3">Dauer</th>
                  <th className="px-4 py-3">Pausen</th>
                  <th className="px-4 py-3">Typ</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Kunde / Projekt</th>
                  <th className="px-4 py-3">Rapport</th>
                  <th className="px-4 py-3 text-right">Aktionen</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {entries.map((entry) => {
                  const isRunning = !entry.endAt;
                  const breakActive = hasBreakRunning(entry);
                  const isOwn = entry.userId === user?.id;

                  return (
                    <tr
                      key={entry.id}
                      className={clsx(
                        'transition-colors',
                        isRunning ? 'bg-brand-50/30' : 'hover:bg-surface-50/80',
                        selected.has(entry.id) && 'bg-brand-50',
                      )}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(entry.id)}
                          onChange={() => toggleSelect(entry.id)}
                          className="rounded border-surface-300"
                        />
                      </td>
                      {canManage && (
                        <td className="px-4 py-3 font-medium whitespace-nowrap">
                          {entry.user.firstName} {entry.user.lastName}
                        </td>
                      )}
                      <td className="px-4 py-3 whitespace-nowrap">{formatDate(entry.startAt)}</td>
                      <td className="px-4 py-3 font-mono text-xs">{formatTime(entry.startAt)}</td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {entry.endAt ? formatTime(entry.endAt) : (
                          <LiveBadge startAt={entry.startAt} />
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {isRunning ? <LiveBadge startAt={entry.startAt} /> : formatDuration(entry.startAt, entry.endAt)}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <BreakDuration breaks={entry.breaks} />
                        {breakActive && (
                          <span className="ml-1 badge bg-warning-500/10 text-warning-600">aktiv</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={clsx('badge', `badge-${entry.entryType.toLowerCase()}`)}>
                          {typeLabel(entry.entryType)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={clsx('badge', `badge-${entry.status.toLowerCase()}`)}>
                          {statusLabel(entry.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 truncate max-w-[180px] text-surface-600">
                        {entry.customer?.name || '—'}
                        {entry.project && <span className="text-surface-400"> / {entry.project.name}</span>}
                      </td>
                      <td className="px-4 py-3 max-w-[140px]">
                        {editRapportId === entry.id ? (
                          <div className="flex gap-1">
                            <input
                              value={editRapportText}
                              onChange={(e) => setEditRapportText(e.target.value)}
                              className="input py-1 text-xs"
                              autoFocus
                              onKeyDown={(e) => e.key === 'Enter' && handleSaveRapport()}
                            />
                            <button onClick={handleSaveRapport} className="btn-primary btn-sm">OK</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setEditRapportId(entry.id); setEditRapportText(entry.rapport || ''); }}
                            className="text-left text-xs text-surface-500 hover:text-surface-700 truncate block w-full"
                            title={entry.rapport || 'Rapport hinzufügen'}
                          >
                            {entry.rapport || <span className="italic text-surface-300">+ Rapport</span>}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {/* Laufende Einträge: Pause / Beenden */}
                          {isRunning && (isOwn || canManage) && (
                            <>
                              {breakActive ? (
                                <button
                                  onClick={() => handleEndBreak(entry.id)}
                                  className="btn-ghost btn-sm text-warning-600"
                                  title="Pause beenden"
                                >
                                  <Coffee className="h-3.5 w-3.5" />
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleStartBreak(entry.id)}
                                  className="btn-ghost btn-sm"
                                  title="Pause starten"
                                >
                                  <Pause className="h-3.5 w-3.5" />
                                </button>
                              )}
                              <button
                                onClick={() => handleEnd(entry.id)}
                                className="btn-ghost btn-sm text-danger-500"
                                title="Beenden"
                              >
                                <Square className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}

                          {/* Status-Workflow */}
                          {entry.status === 'DRAFT' && entry.endAt && (isOwn || canManage) && (
                            <button
                              onClick={() => handleSubmit(entry.id)}
                              className="btn-ghost btn-sm text-brand-600"
                              title="Einreichen"
                            >
                              <Send className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {entry.status === 'SUBMITTED' && canManage && (
                            <>
                              <button
                                onClick={() => handleApprove(entry.id)}
                                className="btn-ghost btn-sm text-success-600"
                                title="Freigeben"
                              >
                                <CheckCircle className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleReopen(entry.id)}
                                className="btn-ghost btn-sm text-surface-500"
                                title="Zurücksetzen"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                          {entry.status === 'APPROVED' && canManage && (
                            <button
                              onClick={() => handleReopen(entry.id)}
                              className="btn-ghost btn-sm text-surface-500"
                              title="Zurücksetzen"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
