/**
 * LocationsPage — Admin/Dispo Live-Karte + Standort-Logs
 * 
 * Nutzt Leaflet (OpenStreetMap) — kein API-Key nötig.
 * Zeigt:
 *   - Live-Karte mit letzten bekannten Positionen aller Mitarbeiter
 *   - Farb-codierte Pins: 🟢 arbeitet / 🟡 Pause / ⚫ inaktiv
 *   - Klick auf Pin → Detail-Panel mit Route des heutigen Tages
 *   - Log-Tabelle mit vollständiger History
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/api';
import { MapPin, List, RefreshCw, Navigation, Loader2, Clock } from 'lucide-react';
import clsx from 'clsx';

// ── Typen ──────────────────────────────────────────────
interface LocationUser {
  id: string;
  firstName: string;
  lastName: string;
}

interface LocationEntry {
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  capturedAt: string;
}

interface UserLatest {
  user: LocationUser;
  location: (LocationEntry & { id: string }) | null;
  running: { id: string; entryType: string; startAt: string } | null;
}

interface LogEntry {
  id: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  capturedAt: string;
  user: LocationUser;
}

interface AllUser {
  id: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  role: string;
}

// ── Karte via Leaflet (dynamisch geladen) ─────────────
function LeafletMap({
  entries,
  selected,
  onSelect,
}: {
  entries: UserLatest[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());

  // Leaflet dynamisch laden
  useEffect(() => {
    let L: any;

    const init = async () => {
      if (mapInstanceRef.current || !mapRef.current) return;

      // Leaflet CSS dynamisch laden
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      // Leaflet JS dynamisch laden
      await new Promise<void>((resolve) => {
        if ((window as any).L) { resolve(); return; }
        const s = document.createElement('script');
        s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        s.onload = () => resolve();
        document.head.appendChild(s);
      });

      L = (window as any).L;

      mapInstanceRef.current = L.map(mapRef.current, { zoomControl: true }).setView([51.1657, 10.4515], 6);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(mapInstanceRef.current);
    };

    init();
  }, []);

  // Marker aktualisieren wenn Daten sich ändern
  useEffect(() => {
    const L = (window as any).L;
    if (!L || !mapInstanceRef.current) return;

    const validEntries = entries.filter(e => e.location);

    // Alte Marker entfernen die nicht mehr existieren
    const currentIds = new Set(validEntries.map(e => e.user.id));
    markersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        mapInstanceRef.current.removeLayer(marker);
        markersRef.current.delete(id);
      }
    });

    validEntries.forEach(({ user, location, running }) => {
      if (!location) return;

      const isWorking = !!running;
      const color = isWorking ? '#22c55e' : '#94a3b8';
      const pulse = isWorking ? 'animate-pulse' : '';

      const icon = L.divIcon({
        className: '',
        iconSize: [36, 36],
        iconAnchor: [18, 36],
        popupAnchor: [0, -36],
        html: `
          <div style="position:relative;width:36px;height:36px;">
            ${isWorking ? `<div style="position:absolute;inset:0;border-radius:50%;background:${color};opacity:0.3;animation:pulse 2s infinite;"></div>` : ''}
            <div style="
              position:absolute;inset:4px;border-radius:50%;
              background:${color};
              border:2px solid white;
              box-shadow:0 2px 8px rgba(0,0,0,0.3);
              display:flex;align-items:center;justify-content:center;
              font-size:11px;font-weight:700;color:white;
            ">
              ${user.firstName[0]}${user.lastName[0]}
            </div>
          </div>
        `,
      });

      const mins = Math.floor((Date.now() - new Date(location.capturedAt).getTime()) / 60000);
      const timeAgo = mins < 1 ? 'gerade eben' : mins < 60 ? `vor ${mins} Min.` : `vor ${Math.floor(mins/60)} Std.`;

      const popup = `
        <div style="font-family:system-ui;min-width:180px;">
          <p style="font-weight:600;margin:0 0 4px;">${user.firstName} ${user.lastName}</p>
          <p style="font-size:12px;color:${isWorking ? '#16a34a' : '#64748b'};margin:0 0 6px;">
            ${isWorking ? '🟢 Arbeitet gerade' : '⚫ Inaktiv'}
          </p>
          <p style="font-size:11px;color:#64748b;margin:0;">📍 ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}</p>
          <p style="font-size:11px;color:#64748b;margin:2px 0 0;">🕐 ${timeAgo}</p>
          ${location.accuracy ? `<p style="font-size:11px;color:#94a3b8;margin:2px 0 0;">±${Math.round(location.accuracy)}m Genauigkeit</p>` : ''}
        </div>
      `;

      if (markersRef.current.has(user.id)) {
        const m = markersRef.current.get(user.id);
        m.setLatLng([location.lat, location.lng]);
        m.setIcon(icon);
        m.getPopup()?.setContent(popup);
      } else {
        const marker = L.marker([location.lat, location.lng], { icon })
          .addTo(mapInstanceRef.current)
          .bindPopup(popup)
          .on('click', () => onSelect(user.id));
        markersRef.current.set(user.id, marker);
      }
    });

    // Wenn Einträge vorhanden: Karte auf alle Marker zentrieren
    if (validEntries.length > 0 && !selected) {
      const bounds = L.latLngBounds(validEntries.filter(e => e.location).map(e => [e.location!.lat, e.location!.lng]));
      if (bounds.isValid()) {
        mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
      }
    }

    // Auf selektierten User zoomen
    if (selected) {
      const entry = validEntries.find(e => e.user.id === selected);
      if (entry?.location) {
        mapInstanceRef.current.setView([entry.location.lat, entry.location.lng], 15, { animate: true });
        markersRef.current.get(selected)?.openPopup();
      }
    }
  }, [entries, selected]);

  return (
    <div
      ref={mapRef}
      className="w-full rounded-xl overflow-hidden border border-surface-200"
      style={{ height: '480px' }}
    />
  );
}

// ── Haupt-Seite ────────────────────────────────────────
export default function LocationsPage() {
  const [view, setView] = useState<'map' | 'log'>('map');
  const [latest, setLatest] = useState<UserLatest[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [users, setUsers] = useState<AllUser[]>([]);
  const [filterUser, setFilterUser] = useState('');
  const [filterFrom, setFilterFrom] = useState(() => new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10));
  const [filterTo, setFilterTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(60);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const loadLatest = useCallback(async () => {
    try {
      const data = await api.get<UserLatest[]>('/locations/latest');
      setLatest(data);
      setLastRefresh(new Date());
      setCountdown(60);
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterUser) params.set('userId', filterUser);
      if (filterFrom) params.set('from', new Date(filterFrom).toISOString());
      if (filterTo)   params.set('to', new Date(filterTo + 'T23:59:59').toISOString());
      params.set('limit', '500');
      const data = await api.get<LogEntry[]>(`/locations?${params.toString()}`);
      setLogs(data);
    } catch {} finally {
      setLoading(false);
    }
  }, [filterUser, filterFrom, filterTo]);

  const loadUsers = useCallback(async () => {
    try {
      const data = await api.get<AllUser[]>('/users');
      setUsers(data.filter(u => u.isActive && u.role !== 'ADMIN'));
    } catch {}
  }, []);

  useEffect(() => { loadLatest(); loadUsers(); }, []);
  useEffect(() => { if (view === 'log') loadLogs(); }, [view, loadLogs]);

  // Auto-Refresh Live-Karte alle 60s
  useEffect(() => {
    if (view !== 'map') return;
    const iv = setInterval(loadLatest, 60_000);
    return () => clearInterval(iv);
  }, [view, loadLatest]);

  // Countdown
  useEffect(() => {
    if (view !== 'map') return;
    const iv = setInterval(() => setCountdown(c => c <= 1 ? 60 : c - 1), 1000);
    return () => clearInterval(iv);
  }, [view, lastRefresh]);

  const activeCount = latest.filter(e => e.running).length;
  const locatedCount = latest.filter(e => e.location).length;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MapPin className="h-6 w-6 text-brand-600" />
            GPS-Tracking
          </h1>
          <p className="text-sm text-surface-500 mt-1">
            Standorte der Mitarbeiter · alle 10 Minuten aktualisiert
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Tab-Switch */}
          <div className="flex rounded-lg border border-surface-200 overflow-hidden">
            <button
              onClick={() => setView('map')}
              className={clsx('px-4 py-2 text-sm font-medium flex items-center gap-1.5 transition-colors', view === 'map' ? 'bg-brand-600 text-white' : 'text-surface-600 hover:bg-surface-50')}
            >
              <MapPin className="h-4 w-4" /> Live-Karte
            </button>
            <button
              onClick={() => setView('log')}
              className={clsx('px-4 py-2 text-sm font-medium flex items-center gap-1.5 transition-colors', view === 'log' ? 'bg-brand-600 text-white' : 'text-surface-600 hover:bg-surface-50')}
            >
              <List className="h-4 w-4" /> Standort-Log
            </button>
          </div>
          {view === 'map' && (
            <button onClick={loadLatest} className="btn-secondary btn-sm">
              <RefreshCw className="h-3.5 w-3.5" /> Jetzt ({countdown}s)
            </button>
          )}
        </div>
      </div>

      {/* ── LIVE-KARTE ───────────────────────────────── */}
      {view === 'map' && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Mitarbeiter aktiv', value: activeCount, color: 'text-success-600', bg: 'bg-success-500/10' },
              { label: 'Standort bekannt', value: locatedCount, color: 'text-brand-600', bg: 'bg-brand-100' },
              { label: 'Gesamt Mitarbeiter', value: latest.length, color: 'text-surface-600', bg: 'bg-surface-100' },
            ].map(s => (
              <div key={s.label} className="card p-4 flex items-center gap-3">
                <div className={clsx('flex h-10 w-10 items-center justify-center rounded-lg', s.bg)}>
                  <Navigation className={clsx('h-5 w-5', s.color)} />
                </div>
                <div>
                  <p className={clsx('text-2xl font-bold', s.color)}>{s.value}</p>
                  <p className="text-xs text-surface-500">{s.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Karte */}
          <div className="card p-4">
            {loading ? (
              <div className="flex items-center justify-center" style={{ height: 480 }}>
                <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
              </div>
            ) : (
              <LeafletMap entries={latest} selected={selected} onSelect={setSelected} />
            )}
            <p className="text-xs text-surface-400 text-right mt-2">
              Letzte Aktualisierung: {lastRefresh.toLocaleTimeString('de-DE')} · © OpenStreetMap
            </p>
          </div>

          {/* Mitarbeiter-Liste neben Karte */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b bg-surface-50/50 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Mitarbeiter-Übersicht</h2>
              <span className="text-xs text-surface-400">Klick → Auf Karte zentrieren</span>
            </div>
            <div className="divide-y max-h-72 overflow-y-auto">
              {latest.length === 0 ? (
                <p className="text-sm text-surface-400 text-center py-8">Keine GPS-Daten vorhanden</p>
              ) : (
                latest
                  .sort((a, b) => (b.running ? 1 : 0) - (a.running ? 1 : 0))
                  .map(({ user, location, running }) => {
                    const mins = location ? Math.floor((Date.now() - new Date(location.capturedAt).getTime()) / 60000) : null;
                    const timeAgo = mins === null ? '—' : mins < 1 ? 'gerade eben' : mins < 60 ? `vor ${mins} Min.` : `vor ${Math.floor(mins/60)} Std.`;
                    return (
                      <div
                        key={user.id}
                        onClick={() => setSelected(selected === user.id ? null : user.id)}
                        className={clsx(
                          'flex items-center gap-4 px-5 py-3 cursor-pointer hover:bg-surface-50 transition-colors',
                          selected === user.id && 'bg-brand-50',
                        )}
                      >
                        <div className={clsx(
                          'flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white flex-shrink-0',
                          running ? 'bg-success-500' : location ? 'bg-surface-400' : 'bg-surface-200',
                        )}>
                          {user.firstName[0]}{user.lastName[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{user.firstName} {user.lastName}</p>
                          <p className="text-xs text-surface-400 truncate">
                            {location
                              ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`
                              : 'Kein Standort verfügbar'}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className={clsx('badge', running ? 'badge-approved' : 'badge-draft')}>
                            {running ? 'Aktiv' : 'Inaktiv'}
                          </span>
                          <p className="text-xs text-surface-400 mt-0.5 flex items-center justify-end gap-1">
                            <Clock className="h-3 w-3" /> {timeAgo}
                          </p>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        </>
      )}

      {/* ── STANDORT-LOG ─────────────────────────────── */}
      {view === 'log' && (
        <>
          {/* Filter */}
          <div className="card p-4 flex flex-wrap gap-4 items-end">
            <div>
              <label className="label">Mitarbeiter</label>
              <select
                value={filterUser}
                onChange={e => setFilterUser(e.target.value)}
                className="input w-52"
              >
                <option value="">Alle</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Von</label>
              <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="input w-36" />
            </div>
            <div>
              <label className="label">Bis</label>
              <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} className="input w-36" />
            </div>
            <button onClick={loadLogs} className="btn-primary btn-sm h-10">
              <RefreshCw className="h-3.5 w-3.5" /> Laden
            </button>
            <span className="text-xs text-surface-400 self-end pb-1">{logs.length} Einträge</span>
          </div>

          {/* Log-Tabelle */}
          <div className="card overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
              </div>
            ) : logs.length === 0 ? (
              <div className="py-16 text-center text-sm text-surface-400">
                Keine GPS-Daten für diesen Zeitraum
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-surface-50/50 text-left text-xs font-semibold uppercase tracking-wider text-surface-500">
                      <th className="px-5 py-3">Mitarbeiter</th>
                      <th className="px-5 py-3">Datum & Zeit</th>
                      <th className="px-5 py-3">Koordinaten</th>
                      <th className="px-5 py-3">Genauigkeit</th>
                      <th className="px-5 py-3">Geschwindigkeit</th>
                      <th className="px-5 py-3">Karte</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {logs.map(log => (
                      <tr key={log.id} className="hover:bg-surface-50/80 transition-colors">
                        <td className="px-5 py-3 font-medium">
                          {log.user.firstName} {log.user.lastName}
                        </td>
                        <td className="px-5 py-3 font-mono text-xs text-surface-600">
                          {new Date(log.capturedAt).toLocaleString('de-DE')}
                        </td>
                        <td className="px-5 py-3 font-mono text-xs">
                          {log.lat.toFixed(6)}, {log.lng.toFixed(6)}
                        </td>
                        <td className="px-5 py-3 text-surface-600">
                          {log.accuracy ? `±${Math.round(log.accuracy)} m` : '—'}
                        </td>
                        <td className="px-5 py-3 text-surface-600">
                          {log.speed != null ? `${(log.speed * 3.6).toFixed(1)} km/h` : '—'}
                        </td>
                        <td className="px-5 py-3">
                          <a
                            href={`https://www.openstreetmap.org/?mlat=${log.lat}&mlon=${log.lng}&zoom=17`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-brand-600 hover:underline text-xs flex items-center gap-1"
                          >
                            <MapPin className="h-3 w-3" /> Öffnen
                          </a>
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
