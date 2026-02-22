import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';

interface DailyEntry {
  date: string;
  weekday: string;
  startTime: string | null;
  endTime: string | null;
  breakMinutes: number;
  netMinutes: number;
  status: string;
  entryType: string;
  rapport?: string;
}

interface MonthlyReport {
  user: { id: string; firstName: string; lastName: string; email: string; hourlyRateCents?: number };
  period: string;
  month: number;
  year: number;
  workingDaysInMonth: number;
  daysWorked: number;
  totalNetMinutes: number;
  totalBreakMinutes: number;
  overtimeMinutes: number;
  targetMinutes: number;
  grossWageCents?: number;
  entries: DailyEntry[];
  statusSummary: { DRAFT: number; SUBMITTED: number; APPROVED: number; LOCKED: number };
}

interface TeamReport {
  period: string;
  totalUsers: number;
  totalNetHours: number;
  totalGrossWageCents?: number;
  users: MonthlyReport[];
}

const MONTHS = [
  'Januar','Februar','März','April','Mai','Juni',
  'Juli','August','September','Oktober','November','Dezember',
];

function minutesToTime(minutes: number): string {
  const neg = minutes < 0;
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${neg ? '-' : ''}${h}:${m.toString().padStart(2, '0')} h`;
}

export const ReportsPage: React.FC = () => {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [report, setReport] = useState<TeamReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [teamData, pendingData] = await Promise.all([
        api.get<TeamReport>(`/reports/team?month=${month}&year=${year}`),
        api.get<unknown[]>('/reports/pending'),
      ]);
      setReport(teamData);
      setPendingCount(Array.isArray(pendingData) ? pendingData.length : 0);
    } catch {
      setError('Fehler beim Laden der Berichte.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [month, year]);

  const overtimeColor = (mins: number) =>
    mins > 0 ? 'text-green-600' : mins < 0 ? 'text-red-600' : 'text-gray-500';

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Titel + Filter */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lohnabrechnung & Reports</h1>
          <p className="text-sm text-gray-500 mt-1">Monatliche Auswertung aller Mitarbeiter</p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            {MONTHS.map((m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <div className="flex gap-1">
            <a
              href={`/api/export/excel?month=${month}&year=${year}`}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
              target="_blank"
              rel="noreferrer"
            >
              📊 Excel
            </a>
            <a
              href={`/api/export/pdf?month=${month}&year=${year}`}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
              target="_blank"
              rel="noreferrer"
            >
              📄 PDF
            </a>
          </div>
        </div>
      </div>

      {/* Offene Einträge Banner */}
      {pendingCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6 flex items-center gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <p className="font-semibold text-amber-800">{pendingCount} Einträge warten auf Genehmigung</p>
            <p className="text-sm text-amber-600">Bitte genehmige ausstehende Zeiteinträge für korrekte Abrechnungen.</p>
          </div>
        </div>
      )}

      {/* Fehler */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-6 text-red-700">
          {error}
        </div>
      )}

      {/* Lade-Spinner */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <span className="animate-spin text-4xl">⏳</span>
        </div>
      )}

      {/* Zusammenfassung */}
      {!loading && report && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Zeitraum', value: report.period, icon: '📅' },
              { label: 'Mitarbeiter', value: report.totalUsers, icon: '👥' },
              { label: 'Gesamt Netto-Stunden', value: `${report.totalNetHours.toFixed(2)} h`, icon: '⏱' },
              {
                label: 'Gesamt Brutto-Lohn',
                value: report.totalGrossWageCents !== undefined
                  ? `${(report.totalGrossWageCents / 100).toFixed(2)} €`
                  : '–',
                icon: '💶',
              },
            ].map((card) => (
              <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <div className="text-2xl mb-2">{card.icon}</div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">{card.label}</p>
                <p className="text-lg font-bold text-gray-900 mt-1">{card.value}</p>
              </div>
            ))}
          </div>

          {/* Mitarbeiter-Tabelle */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['Mitarbeiter', 'Tage', 'Netto-Stunden', 'Über-/Unterstunden', 'Status', 'Lohn'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {report.users.map((u) => (
                  <React.Fragment key={u.user.id}>
                    <tr
                      onClick={() => setExpanded(expanded === u.user.id ? null : u.user.id)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-blue-900 text-white text-xs font-bold flex items-center justify-center">
                            {u.user.firstName[0]}{u.user.lastName[0]}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{u.user.firstName} {u.user.lastName}</p>
                            <p className="text-xs text-gray-400">{u.user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {u.daysWorked} / {u.workingDaysInMonth}
                      </td>
                      <td className="px-4 py-3 font-semibold text-blue-900">
                        {minutesToTime(u.totalNetMinutes)}
                      </td>
                      <td className={`px-4 py-3 font-semibold ${overtimeColor(u.overtimeMinutes)}`}>
                        {u.overtimeMinutes > 0 ? '+' : ''}{minutesToTime(u.overtimeMinutes)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {u.statusSummary.SUBMITTED > 0 && (
                            <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full">
                              {u.statusSummary.SUBMITTED} offen
                            </span>
                          )}
                          {u.statusSummary.APPROVED > 0 && (
                            <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">
                              {u.statusSummary.APPROVED} ✓
                            </span>
                          )}
                          {u.statusSummary.DRAFT > 0 && (
                            <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">
                              {u.statusSummary.DRAFT} Entwurf
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-900">
                        {u.grossWageCents !== undefined ? `${(u.grossWageCents / 100).toFixed(2)} €` : '–'}
                      </td>
                    </tr>

                    {/* Detailzeilen */}
                    {expanded === u.user.id && (
                      <tr>
                        <td colSpan={6} className="px-4 py-0">
                          <div className="bg-gray-50 rounded-lg my-2 overflow-hidden border border-gray-200">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-gray-100">
                                  {['Datum', 'Wochentag', 'Von', 'Bis', 'Pause', 'Netto', 'Status'].map((h) => (
                                    <th key={h} className="px-3 py-2 text-left text-gray-500 font-medium">{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {u.entries.map((e, i) => (
                                  <tr key={i} className="bg-white">
                                    <td className="px-3 py-2">{e.date}</td>
                                    <td className="px-3 py-2 text-gray-500">{e.weekday}</td>
                                    <td className="px-3 py-2">{e.startTime ?? '–'}</td>
                                    <td className="px-3 py-2">{e.endTime ?? 'läuft...'}</td>
                                    <td className="px-3 py-2">{e.breakMinutes} Min</td>
                                    <td className="px-3 py-2 font-semibold text-blue-900">{minutesToTime(e.netMinutes)}</td>
                                    <td className="px-3 py-2">
                                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                        e.status === 'APPROVED' ? 'bg-green-100 text-green-700'
                                        : e.status === 'SUBMITTED' ? 'bg-amber-100 text-amber-700'
                                        : e.status === 'LOCKED' ? 'bg-blue-100 text-blue-700'
                                        : 'bg-gray-100 text-gray-500'
                                      }`}>
                                        {e.status === 'APPROVED' ? 'Genehmigt'
                                          : e.status === 'SUBMITTED' ? 'Eingereicht'
                                          : e.status === 'LOCKED' ? 'Gesperrt'
                                          : 'Entwurf'}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default ReportsPage;
