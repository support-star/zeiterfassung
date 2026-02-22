import { create } from 'zustand';
import { api, ApiError } from './api';

// ── Action-Typen ────────────────────────────────────

export type QueueActionType =
  | 'START_ENTRY'
  | 'END_ENTRY'
  | 'UPDATE_RAPPORT'
  | 'START_BREAK'
  | 'END_BREAK';

export interface QueueAction {
  id: string;
  type: QueueActionType;
  payload: Record<string, any>;
  createdAt: string;
  status: 'pending' | 'syncing' | 'error' | 'conflict';
  errorMessage?: string;
  retryCount: number;
}

// ── Mapping auf API-Aufrufe ─────────────────────────

function mapActionToApiCall(action: QueueAction): { method: 'POST'; path: string; body?: any } {
  switch (action.type) {
    case 'START_ENTRY':
      return { method: 'POST', path: '/time-entries/start', body: action.payload };
    case 'END_ENTRY':
      return { method: 'POST', path: `/time-entries/${action.payload.entryId}/end`, body: { endAt: action.payload.endAt } };
    case 'UPDATE_RAPPORT':
      return { method: 'POST', path: `/time-entries/${action.payload.entryId}/rapport`, body: { rapport: action.payload.rapport } };
    case 'START_BREAK':
      return { method: 'POST', path: `/time-entries/${action.payload.entryId}/break/start`, body: { breakType: action.payload.breakType } };
    case 'END_BREAK':
      return { method: 'POST', path: `/time-entries/${action.payload.entryId}/break/end`, body: { endAt: action.payload.endAt } };
  }
}

// ── Persistenz in localStorage ──────────────────────

const QUEUE_STORAGE_KEY = 'zeit_offline_queue';
const LOCAL_STATE_KEY = 'zeit_local_state';

function loadQueue(): QueueAction[] {
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueueAction[]) {
  localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
}

// ── Lokaler Timer-State (für Offline-Betrieb) ───────

export interface LocalTimerState {
  isRunning: boolean;
  entryId: string | null;          // Server-ID oder temp-ID
  entryType: string;
  customerId: string | null;
  customerName: string | null;
  projectId: string | null;
  projectName: string | null;
  startAt: string | null;
  rapport: string | null;
  isBreakActive: boolean;
  breakStartAt: string | null;
}

const defaultTimerState: LocalTimerState = {
  isRunning: false,
  entryId: null,
  entryType: 'WORK',
  customerId: null,
  customerName: null,
  projectId: null,
  projectName: null,
  startAt: null,
  rapport: null,
  isBreakActive: false,
  breakStartAt: null,
};

function loadLocalState(): LocalTimerState {
  try {
    const raw = localStorage.getItem(LOCAL_STATE_KEY);
    return raw ? { ...defaultTimerState, ...JSON.parse(raw) } : defaultTimerState;
  } catch {
    return defaultTimerState;
  }
}

function saveLocalState(state: LocalTimerState) {
  localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify(state));
}

// ── Store ───────────────────────────────────────────

interface OfflineStore {
  queue: QueueAction[];
  isOnline: boolean;
  isSyncing: boolean;
  timer: LocalTimerState;

  // Netzwerk
  setOnline: (online: boolean) => void;

  // Timer-Aktionen (funktionieren immer, auch offline)
  startEntry: (params: {
    customerId: string | null;
    customerName: string | null;
    projectId: string | null;
    projectName: string | null;
    entryType: string;
    rapport: string | null;
  }) => void;
  endEntry: () => void;
  updateRapport: (rapport: string) => void;
  startBreak: () => void;
  endBreak: () => void;

  // Sync
  syncQueue: () => Promise<void>;
  clearConflicts: () => void;

  // State aus Server-Daten setzen (nach erfolgreichem Sync/Refresh)
  setTimerFromServer: (entry: any) => void;
  resetTimer: () => void;
}

let syncInterval: ReturnType<typeof setInterval> | null = null;

function generateTempId() {
  return `temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export const useOffline = create<OfflineStore>((set, get) => ({
  queue: loadQueue(),
  isOnline: navigator.onLine,
  isSyncing: false,
  timer: loadLocalState(),

  setOnline: (online) => {
    set({ isOnline: online });
    if (online) get().syncQueue();
  },

  // ── Start ──────────────────────────────────────

  startEntry: (params) => {
    const now = new Date().toISOString();
    const tempId = generateTempId();

    const timerState: LocalTimerState = {
      isRunning: true,
      entryId: tempId,
      entryType: params.entryType,
      customerId: params.customerId,
      customerName: params.customerName,
      projectId: params.projectId,
      projectName: params.projectName,
      startAt: now,
      rapport: params.rapport,
      isBreakActive: false,
      breakStartAt: null,
    };

    const action: QueueAction = {
      id: generateTempId(),
      type: 'START_ENTRY',
      payload: {
        tempEntryId: tempId,
        customerId: params.customerId,
        projectId: params.projectId,
        entryType: params.entryType,
        startAt: now,
        createdVia: 'MOBILE',
        rapport: params.rapport,
      },
      createdAt: now,
      status: 'pending',
      retryCount: 0,
    };

    const queue = [...get().queue, action];
    saveQueue(queue);
    saveLocalState(timerState);
    set({ queue, timer: timerState });

    get().syncQueue();
  },

  // ── Ende ───────────────────────────────────────

  endEntry: () => {
    const { timer, queue } = get();
    if (!timer.isRunning || !timer.entryId) return;

    const now = new Date().toISOString();

    // Falls Pause läuft, erst beenden
    let newQueue = [...queue];
    if (timer.isBreakActive) {
      newQueue.push({
        id: generateTempId(),
        type: 'END_BREAK',
        payload: { entryId: timer.entryId, endAt: now },
        createdAt: now,
        status: 'pending',
        retryCount: 0,
      });
    }

    newQueue.push({
      id: generateTempId(),
      type: 'END_ENTRY',
      payload: { entryId: timer.entryId, endAt: now },
      createdAt: now,
      status: 'pending',
      retryCount: 0,
    });

    const newTimer = { ...defaultTimerState };
    saveQueue(newQueue);
    saveLocalState(newTimer);
    set({ queue: newQueue, timer: newTimer });

    get().syncQueue();
  },

  // ── Rapport ────────────────────────────────────

  updateRapport: (rapport) => {
    const { timer, queue } = get();
    if (!timer.entryId) return;

    const now = new Date().toISOString();
    const action: QueueAction = {
      id: generateTempId(),
      type: 'UPDATE_RAPPORT',
      payload: { entryId: timer.entryId, rapport },
      createdAt: now,
      status: 'pending',
      retryCount: 0,
    };

    const newTimer = { ...timer, rapport };
    const newQueue = [...queue, action];
    saveQueue(newQueue);
    saveLocalState(newTimer);
    set({ queue: newQueue, timer: newTimer });

    get().syncQueue();
  },

  // ── Pause starten ──────────────────────────────

  startBreak: () => {
    const { timer, queue } = get();
    if (!timer.isRunning || !timer.entryId || timer.isBreakActive) return;

    const now = new Date().toISOString();
    const action: QueueAction = {
      id: generateTempId(),
      type: 'START_BREAK',
      payload: { entryId: timer.entryId, breakType: 'DEFAULT' },
      createdAt: now,
      status: 'pending',
      retryCount: 0,
    };

    const newTimer = { ...timer, isBreakActive: true, breakStartAt: now };
    const newQueue = [...queue, action];
    saveQueue(newQueue);
    saveLocalState(newTimer);
    set({ queue: newQueue, timer: newTimer });

    get().syncQueue();
  },

  // ── Pause beenden ──────────────────────────────

  endBreak: () => {
    const { timer, queue } = get();
    if (!timer.isBreakActive || !timer.entryId) return;

    const now = new Date().toISOString();
    const action: QueueAction = {
      id: generateTempId(),
      type: 'END_BREAK',
      payload: { entryId: timer.entryId, endAt: now },
      createdAt: now,
      status: 'pending',
      retryCount: 0,
    };

    const newTimer = { ...timer, isBreakActive: false, breakStartAt: null };
    const newQueue = [...queue, action];
    saveQueue(newQueue);
    saveLocalState(newTimer);
    set({ queue: newQueue, timer: newTimer });

    get().syncQueue();
  },

  // ── Sync ───────────────────────────────────────

  syncQueue: async () => {
    const state = get();
    if (state.isSyncing || !state.isOnline) return;

    const pending = state.queue.filter((a) => a.status === 'pending');
    if (pending.length === 0) return;

    set({ isSyncing: true });

    // Map temp IDs -> Server IDs (für Folge-Aktionen)
    const idMap = new Map<string, string>();

    for (const action of pending) {
      // Ersetze temp-IDs mit Server-IDs
      const payload = { ...action.payload };
      if (payload.entryId && idMap.has(payload.entryId)) {
        payload.entryId = idMap.get(payload.entryId)!;
      }

      const apiCall = mapActionToApiCall({ ...action, payload });

      try {
        // Status auf 'syncing'
        set((s) => ({
          queue: s.queue.map((a) =>
            a.id === action.id ? { ...a, status: 'syncing' as const } : a,
          ),
        }));

        const result: any = await api.post(apiCall.path, apiCall.body);

        // Bei START_ENTRY: Server-ID merken
        if (action.type === 'START_ENTRY' && result?.id) {
          idMap.set(action.payload.tempEntryId, result.id);

          // Timer-State aktualisieren mit echtem Server-ID
          const currentTimer = get().timer;
          if (currentTimer.entryId === action.payload.tempEntryId) {
            const newTimer = { ...currentTimer, entryId: result.id };
            saveLocalState(newTimer);
            set({ timer: newTimer });
          }
        }

        // Aktion aus Queue entfernen
        const newQueue = get().queue.filter((a) => a.id !== action.id);
        saveQueue(newQueue);
        set({ queue: newQueue });
      } catch (err) {
        const isOverlap = err instanceof ApiError && err.message.includes('berlappung');
        const newQueue = get().queue.map((a) =>
          a.id === action.id
            ? {
                ...a,
                status: (isOverlap ? 'conflict' : 'error') as QueueAction['status'],
                errorMessage: err instanceof Error ? err.message : 'Unbekannter Fehler',
                retryCount: a.retryCount + 1,
              }
            : a,
        );
        saveQueue(newQueue);
        set({ queue: newQueue });

        // Bei Konflikten nicht weiter syncen
        if (isOverlap) break;

        // Bei anderen Fehlern: max 3 Versuche
        if (action.retryCount >= 3) continue;
      }
    }

    set({ isSyncing: false });
  },

  clearConflicts: () => {
    const newQueue = get().queue.filter((a) => a.status !== 'conflict' && a.status !== 'error');
    saveQueue(newQueue);
    set({ queue: newQueue });
  },

  setTimerFromServer: (entry) => {
    if (!entry) {
      get().resetTimer();
      return;
    }
    const hasOpenBreak = entry.breaks?.some((b: any) => !b.endAt);
    const openBreak = entry.breaks?.find((b: any) => !b.endAt);

    const timerState: LocalTimerState = {
      isRunning: true,
      entryId: entry.id,
      entryType: entry.entryType,
      customerId: entry.customerId,
      customerName: entry.customer?.name || null,
      projectId: entry.projectId,
      projectName: entry.project?.name || null,
      startAt: entry.startAt,
      rapport: entry.rapport,
      isBreakActive: hasOpenBreak,
      breakStartAt: openBreak?.startAt || null,
    };
    saveLocalState(timerState);
    set({ timer: timerState });
  },

  resetTimer: () => {
    saveLocalState(defaultTimerState);
    set({ timer: defaultTimerState });
  },
}));

// ── Netzwerk-Listener ───────────────────────────────

function setupNetworkListeners() {
  window.addEventListener('online', () => useOffline.getState().setOnline(true));
  window.addEventListener('offline', () => useOffline.getState().setOnline(false));

  // Capacitor Network Plugin (genauer als Browser-Events)
  import('@capacitor/network')
    .then(({ Network }) => {
      Network.addListener('networkStatusChange', (status) => {
        useOffline.getState().setOnline(status.connected);
      });
    })
    .catch(() => {
      // Plugin nicht verfügbar (Web-only) — Browser-Events reichen
    });
}

// ── Sync-Timer (alle 15 Sekunden) ───────────────────

function startSyncWorker() {
  if (syncInterval) return;
  syncInterval = setInterval(() => {
    const { isOnline, queue } = useOffline.getState();
    if (isOnline && queue.some((a) => a.status === 'pending')) {
      useOffline.getState().syncQueue();
    }
  }, 15_000);
}

// Init
setupNetworkListeners();
startSyncWorker();
