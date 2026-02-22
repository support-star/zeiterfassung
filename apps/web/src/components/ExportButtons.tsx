import React, { useState } from 'react';

interface ExportButtonsProps {
  /** optional: nur Einträge eines bestimmten Mitarbeiters exportieren */
  userId?: string;
}

type Format = 'excel' | 'pdf';
type RangeType = 'month' | 'range' | 'all';

const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

function buildApiUrl(
  format: Format,
  rangeType: RangeType,
  month: number,
  year: number,
  from: string,
  to: string,
  userId?: string,
): string {
  const base = `/api/export/${format === 'excel' ? 'excel' : 'pdf'}`;
  const params = new URLSearchParams();

  if (rangeType === 'month') {
    params.set('month', String(month));
    params.set('year', String(year));
  } else if (rangeType === 'range') {
    params.set('from', from);
    params.set('to', to);
  }

  if (userId) params.set('userId', userId);

  return `${base}?${params.toString()}`;
}

export const ExportButtons: React.FC<ExportButtonsProps> = ({ userId }) => {
  const now = new Date();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<Format | null>(null);
  const [rangeType, setRangeType] = useState<RangeType>('month');
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const handleExport = async (fmt: Format) => {
    setLoading(fmt);
    try {
      const url = buildApiUrl(fmt, rangeType, month, year, from, to, userId);
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('accessToken') ?? ''}`,
        },
      });

      if (!res.ok) {
        throw new Error(`Export fehlgeschlagen: ${res.statusText}`);
      }

      const blob = await res.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download =
        fmt === 'excel'
          ? `Zeiterfassung_${year}-${String(month).padStart(2, '0')}.xlsx`
          : `Zeiterfassung_${year}-${String(month).padStart(2, '0')}.pdf`;
      link.click();
      URL.revokeObjectURL(link.href);
      setOpen(false);
    } catch (err) {
      console.error(err);
      alert('Export fehlgeschlagen. Bitte versuche es erneut.');
    } finally {
      setLoading(null);
    }
  };

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  return (
    <div className="relative inline-block">
      {/* Trigger-Button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 active:scale-95 transition-all"
      >
        <span>📤</span>
        Exportieren
        <span className={`transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 rounded-xl border border-gray-200 bg-white shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <span className="font-semibold text-gray-800">Export</span>
            <button
              onClick={() => setOpen(false)}
              className="text-gray-400 hover:text-gray-600 text-lg leading-none"
            >
              ×
            </button>
          </div>

          <div className="p-4 space-y-4">
            {/* Zeitraum-Typ */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">ZEITRAUM</label>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                {(['month', 'range', 'all'] as RangeType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setRangeType(t)}
                    className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                      rangeType === t
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {t === 'month' ? 'Monat' : t === 'range' ? 'Zeitraum' : 'Alle'}
                  </button>
                ))}
              </div>
            </div>

            {/* Monat/Jahr */}
            {rangeType === 'month' && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Monat</label>
                  <select
                    value={month}
                    onChange={(e) => setMonth(Number(e.target.value))}
                    className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {MONTHS.map((m, i) => (
                      <option key={i + 1} value={i + 1}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Jahr</label>
                  <select
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                    className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {years.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Von – Bis */}
            {rangeType === 'range' && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Von</label>
                  <input
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Bis</label>
                  <input
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}

            {rangeType === 'all' && (
              <p className="text-xs text-gray-400 text-center">
                Alle verfügbaren Einträge werden exportiert.
              </p>
            )}

            {/* Export-Buttons */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => handleExport('excel')}
                disabled={loading !== null}
                className="flex items-center justify-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {loading === 'excel' ? (
                  <span className="animate-spin">⏳</span>
                ) : (
                  <span>📊</span>
                )}
                Excel
              </button>

              <button
                onClick={() => handleExport('pdf')}
                disabled={loading !== null}
                className="flex items-center justify-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {loading === 'pdf' ? (
                  <span className="animate-spin">⏳</span>
                ) : (
                  <span>📄</span>
                )}
                PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExportButtons;
