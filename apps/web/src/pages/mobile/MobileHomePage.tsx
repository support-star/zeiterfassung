import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/stores/auth';
import { useOffline, type LocalTimerState } from '@/lib/offline-queue';
import { useQuery } from '@/hooks/useQuery';
import { useGpsTracker } from '@/hooks/useGpsTracker';
import { api } from '@/lib/api';
import { formatLiveTimer, typeLabel } from '@/lib/format';
import {
  Play,
  Square,
  Pause,
  Coffee,
  FileText,
  Truck,
  Briefcase,
  Wrench,
  Wifi,
  WifiOff,
  AlertCircle,
  X,
  Check,
  LogOut,
  ChevronDown,
  Clock,
} from 'lucide-react';
import clsx from 'clsx';

interface Customer { id: string; name: string; }
interface Project { id: string; name: string; customerId: string; }

// ── Live Timer Display ──────────────────────────────

function BigTimer({ startAt }: { startAt: string }) {
  const [time, setTime] = useState(formatLiveTimer(startAt));
  useEffect(() => {
    const i = setInterval(() => setTime(formatLiveTimer(startAt)), 1000);
    return () => clearInterval(i);
  }, [startAt]);

  return (
    <div className="font-mono text-6xl font-bold tracking-tight tabular-nums">
      {time}
    </div>
  );
}

// ── Typ-Auswahl-Chips ───────────────────────────────

const entryTypes = [
  { value: 'WORK', label: 'Arbeit', icon: Briefcase, color: 'bg-brand-600' },
  { value: 'TRAVEL', label: 'Fahrt', icon: Truck, color: 'bg-warning-500' },
  { value: 'INTERNAL', label: 'Intern', icon: Wrench, color: 'bg-surface-500' },
];

// ── Hauptkomponente ─────────────────────────────────

export default function MobileHomePage() {
  const { user, logout } = useAuth();
  const {
    timer,
    queue,
    isOnline,
    isSyncing,
    startEntry,
    endEntry,
    updateRapport,
    startBreak,
    endBreak,
    setTimerFromServer,
    clearConflicts,
  } = useOffline();

  // Stammdaten
  const { data: customers } = useQuery<Customer[]>('/customers');
  const { data: allProjects } = useQuery<Project[]>('/projects');

  // GPS Tracking — sendet Standort alle 10 Min auf Mobile
  useGpsTracker({ activeTimeEntryId: timer.isRunning && timer.entryId ? timer.entryId : null });

  // Formular-State (Zustand A)
  const [selectedType, setSelectedType] = useState('WORK');
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [rapport, setRapport] = useState('');
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [showRapportSheet, setShowRapportSheet] = useState(false);
  const [rapportText, setRapportText] = useState('');

  const filteredProjects = allProjects?.filter(
    (p) => !selectedCustomer || p.customerId === selectedCustomer,
  );
  const selectedCustomerName = customers?.find((c) => c.id === selectedCustomer)?.name || null;
  const selectedProjectName = allProjects?.find((p) => p.id === selectedProject)?.name || null;

  // Beim Laden: Laufenden Eintrag vom Server holen
  useEffect(() => {
    if (!isOnline) return;
    api.get('/time-entries?status=DRAFT')
      .then((entries: any) => {
        const running = entries?.find?.((e: any) => !e.endAt);
        if (running) {
          setTimerFromServer(running);
        }
      })
      .catch(() => {});
  }, []);

  // Queue-Konflikte
  const conflicts = queue.filter((a) => a.status === 'conflict' || a.status === 'error');
  const pendingCount = queue.filter((a) => a.status === 'pending').length;

  // ── Zustand A: Kein aktiver Eintrag ────────────

  const handleStart = () => {
    startEntry({
      customerId: selectedCustomer || null,
      customerName: selectedCustomerName,
      projectId: selectedProject || null,
      projectName: selectedProjectName,
      entryType: selectedType,
      rapport: rapport || null,
    });
    // Haptic Feedback
    import('@capacitor/haptics').then(({ Haptics, ImpactStyle }) => {
      Haptics.impact({ style: ImpactStyle.Medium });
    }).catch(() => {});
  };

  // ── Zustand B/C: Aktionen ─────────────────────

  const handleEnd = () => {
    endEntry();
    import('@capacitor/haptics').then(({ Haptics, ImpactStyle }) => {
      Haptics.impact({ style: ImpactStyle.Heavy });
    }).catch(() => {});
  };

  const handlePause = () => {
    if (timer.isBreakActive) {
      endBreak();
    } else {
      startBreak();
    }
    import('@capacitor/haptics').then(({ Haptics, ImpactStyle }) => {
      Haptics.impact({ style: ImpactStyle.Light });
    }).catch(() => {});
  };

  const handleSaveRapport = () => {
    updateRapport(rapportText);
    setShowRapportSheet(false);
  };

  const openRapportSheet = () => {
    setRapportText(timer.rapport || '');
    setShowRapportSheet(true);
  };

  return (
    <div className="min-h-screen bg-surface-950 text-white flex flex-col safe-area-inset">
      {/* ── Header ──────────────────────────────── */}
      <header className="flex items-center justify-between px-5 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <div className={clsx(
            'h-2 w-2 rounded-full',
            isOnline ? 'bg-success-500' : 'bg-danger-500',
          )} />
          <span className="text-xs text-surface-400">
            {isOnline ? 'Online' : 'Offline'}
            {pendingCount > 0 && ` · ${pendingCount} ausstehend`}
            {isSyncing && ' · Synchronisiere...'}
          </span>
        </div>
        <button onClick={logout} className="p-2 text-surface-500 hover:text-surface-300">
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      {/* ── Konflikte ───────────────────────────── */}
      {conflicts.length > 0 && (
        <div className="mx-5 mb-3 rounded-xl bg-danger-500/10 border border-danger-500/20 px-4 py-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-danger-400 flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" /> Sync-Fehler
            </span>
            <button onClick={clearConflicts} className="text-xs text-danger-400 underline">
              Verwerfen
            </button>
          </div>
          {conflicts.slice(0, 2).map((c) => (
            <p key={c.id} className="text-xs text-danger-300/70">{c.errorMessage}</p>
          ))}
        </div>
      )}

      {/* ── Content ─────────────────────────────── */}
      <div className="flex-1 flex flex-col justify-center px-5">
        {!timer.isRunning ? (
          /* ═══ ZUSTAND A: Kein aktiver Eintrag ═══ */
          <div className="space-y-6">
            {/* Begrüßung */}
            <div className="text-center mb-2">
              <p className="text-surface-400 text-sm">Hallo {user?.firstName}</p>
              <h1 className="text-2xl font-bold mt-1">Bereit zum Starten?</h1>
            </div>

            {/* Typ-Auswahl */}
            <div className="flex gap-2 justify-center">
              {entryTypes.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setSelectedType(t.value)}
                  className={clsx(
                    'flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-medium transition-all',
                    selectedType === t.value
                      ? `${t.color} text-white shadow-lg`
                      : 'bg-surface-800 text-surface-400 hover:bg-surface-700',
                  )}
                >
                  <t.icon className="h-4 w-4" />
                  {t.label}
                </button>
              ))}
            </div>

            {/* Kunde/Projekt */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-surface-500 mb-1 block">
                  Kunde
                </label>
                <select
                  value={selectedCustomer}
                  onChange={(e) => { setSelectedCustomer(e.target.value); setSelectedProject(''); }}
                  className="w-full rounded-xl bg-surface-800 border border-surface-700 px-4 py-3.5 text-sm text-white focus:border-brand-500 focus:outline-none"
                >
                  <option value="">— Kein Kunde —</option>
                  {customers?.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {selectedCustomer && filteredProjects && filteredProjects.length > 0 && (
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-surface-500 mb-1 block">
                    Projekt
                  </label>
                  <select
                    value={selectedProject}
                    onChange={(e) => setSelectedProject(e.target.value)}
                    className="w-full rounded-xl bg-surface-800 border border-surface-700 px-4 py-3.5 text-sm text-white focus:border-brand-500 focus:outline-none"
                  >
                    <option value="">— Kein Projekt —</option>
                    {filteredProjects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Rapport optional */}
              <input
                value={rapport}
                onChange={(e) => setRapport(e.target.value)}
                placeholder="Rapport / Notiz (optional)"
                className="w-full rounded-xl bg-surface-800 border border-surface-700 px-4 py-3.5 text-sm text-white placeholder-surface-500 focus:border-brand-500 focus:outline-none"
              />
            </div>

            {/* START Button */}
            <button
              onClick={handleStart}
              className="w-full flex items-center justify-center gap-3 rounded-2xl bg-success-500 px-6 py-6 text-xl font-bold text-white shadow-2xl shadow-success-500/20 active:scale-[0.97] transition-transform"
            >
              <Play className="h-7 w-7" fill="currentColor" />
              Starten
            </button>
          </div>
        ) : !timer.isBreakActive ? (
          /* ═══ ZUSTAND B: Timer läuft, keine Pause ═══ */
          <div className="text-center space-y-8">
            {/* Timer */}
            <div>
              <BigTimer startAt={timer.startAt!} />
              <div className="mt-3 flex items-center justify-center gap-2">
                <span className={clsx(
                  'badge',
                  timer.entryType === 'WORK' ? 'badge-work' :
                  timer.entryType === 'TRAVEL' ? 'badge-travel' : 'badge-internal',
                )}>
                  {typeLabel(timer.entryType)}
                </span>
                {timer.customerName && (
                  <span className="text-sm text-surface-400">{timer.customerName}</span>
                )}
                {timer.projectName && (
                  <span className="text-xs text-surface-500">/ {timer.projectName}</span>
                )}
              </div>
            </div>

            {/* Buttons */}
            <div className="space-y-3">
              <div className="flex gap-3">
                <button
                  onClick={handlePause}
                  className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-warning-500 px-5 py-5 text-lg font-bold text-white shadow-lg active:scale-[0.97] transition-transform"
                >
                  <Pause className="h-6 w-6" />
                  Pause
                </button>
                <button
                  onClick={handleEnd}
                  className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-danger-500 px-5 py-5 text-lg font-bold text-white shadow-lg active:scale-[0.97] transition-transform"
                >
                  <Square className="h-6 w-6" fill="currentColor" />
                  Beenden
                </button>
              </div>

              <button
                onClick={openRapportSheet}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-surface-700 px-4 py-3 text-sm text-surface-400 hover:bg-surface-800 transition-colors"
              >
                <FileText className="h-4 w-4" />
                {timer.rapport ? 'Rapport bearbeiten' : 'Rapport hinzufügen'}
              </button>
            </div>
          </div>
        ) : (
          /* ═══ ZUSTAND C: Pause läuft ═══ */
          <div className="text-center space-y-8">
            {/* Pause-Anzeige */}
            <div>
              <div className="text-sm font-semibold text-warning-500 uppercase tracking-widest mb-3">
                ☕ Pause läuft
              </div>
              <BigTimer startAt={timer.breakStartAt!} />
              <p className="mt-3 text-sm text-surface-500">
                Eintrag seit {new Date(timer.startAt!).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>

            {/* Buttons */}
            <div className="space-y-3">
              <button
                onClick={handlePause}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-success-500 px-6 py-6 text-xl font-bold text-white shadow-2xl shadow-success-500/20 active:scale-[0.97] transition-transform"
              >
                <Coffee className="h-7 w-7" />
                Pause beenden
              </button>
              <button
                onClick={handleEnd}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-danger-500 px-5 py-5 text-lg font-bold text-white shadow-lg active:scale-[0.97] transition-transform"
              >
                <Square className="h-6 w-6" fill="currentColor" />
                Beenden
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Rapport Bottom Sheet ────────────────── */}
      {showRapportSheet && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-40"
            onClick={() => setShowRapportSheet(false)}
          />
          <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl bg-surface-900 border-t border-surface-700 p-5 pb-8 animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Rapport</h3>
              <button
                onClick={() => setShowRapportSheet(false)}
                className="p-1 text-surface-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <textarea
              value={rapportText}
              onChange={(e) => setRapportText(e.target.value)}
              placeholder="Was wurde gemacht?"
              rows={3}
              className="w-full rounded-xl bg-surface-800 border border-surface-700 px-4 py-3 text-sm text-white placeholder-surface-500 focus:border-brand-500 focus:outline-none resize-none"
              autoFocus
            />
            <button
              onClick={handleSaveRapport}
              className="w-full btn-primary mt-3 py-3"
            >
              <Check className="h-4 w-4" /> Speichern
            </button>
          </div>
        </>
      )}

      {/* ── Safe Area Bottom Spacer ─────────────── */}
      <div className="h-6" />

      {/* ── Bottom Navigation ──────────────────── */}
      <nav className="fixed inset-x-0 bottom-0 bg-surface-900/95 backdrop-blur-sm border-t border-surface-800 safe-area-inset">
        <div className="flex items-center justify-around py-2">
          <a href="/m" className="flex flex-col items-center gap-0.5 px-4 py-1.5 text-brand-400">
            <Clock className="h-5 w-5" />
            <span className="text-[10px] font-medium">Timer</span>
          </a>
          <a href="/m/history" className="flex flex-col items-center gap-0.5 px-4 py-1.5 text-surface-500">
            <FileText className="h-5 w-5" />
            <span className="text-[10px] font-medium">Verlauf</span>
          </a>
        </div>
      </nav>
    </div>
  );
}
