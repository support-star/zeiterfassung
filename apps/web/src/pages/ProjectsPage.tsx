import { useState, FormEvent } from 'react';
import { useQuery, useMutation } from '@/hooks/useQuery';
import { FolderKanban, Plus, Edit2, X, Loader2, Check } from 'lucide-react';
import clsx from 'clsx';

interface Project {
  id: string;
  name: string;
  customerId: string;
  siteAddressLine1: string | null;
  siteZip: string | null;
  siteCity: string | null;
  costCenter: string | null;
  hourlyRateCents: number | null;
  isActive: boolean;
  customer: { id: string; name: string };
}

interface Customer { id: string; name: string; }

const emptyForm = {
  customerId: '',
  name: '',
  siteAddressLine1: '',
  siteZip: '',
  siteCity: '',
  costCenter: '',
  hourlyRateCents: '',
};

export default function ProjectsPage() {
  const { data: projects, isLoading, refetch } = useQuery<Project[]>('/projects');
  const { data: customers } = useQuery<Customer[]>('/customers');
  const { mutate, isLoading: saving, error } = useMutation();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [filterCustomer, setFilterCustomer] = useState('');

  const startEdit = (p: Project) => {
    setEditId(p.id);
    setForm({
      customerId: p.customerId,
      name: p.name,
      siteAddressLine1: p.siteAddressLine1 || '',
      siteZip: p.siteZip || '',
      siteCity: p.siteCity || '',
      costCenter: p.costCenter || '',
      hourlyRateCents: p.hourlyRateCents ? String(p.hourlyRateCents / 100) : '',
    });
    setShowForm(true);
  };

  const startNew = () => {
    setEditId(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const body: any = {
      name: form.name,
      siteAddressLine1: form.siteAddressLine1 || null,
      siteZip: form.siteZip || null,
      siteCity: form.siteCity || null,
      costCenter: form.costCenter || null,
      hourlyRateCents: form.hourlyRateCents ? Math.round(parseFloat(form.hourlyRateCents) * 100) : null,
    };

    if (editId) {
      await mutate('PATCH', `/projects/${editId}`, body);
    } else {
      body.customerId = form.customerId;
      await mutate('POST', '/projects', body);
    }
    setShowForm(false);
    refetch();
  };

  const toggleActive = async (p: Project) => {
    await mutate('PATCH', `/projects/${p.id}`, { isActive: !p.isActive });
    refetch();
  };

  const set = (field: string) => (e: any) => setForm({ ...form, [field]: e.target.value });

  const filtered = projects?.filter((p) => !filterCustomer || p.customerId === filterCustomer);

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Projekte</h1>
          <p className="text-sm text-surface-500 mt-1">Projekte und Baustellen verwalten</p>
        </div>
        <button onClick={startNew} className="btn-primary btn-sm">
          <Plus className="h-4 w-4" /> Neues Projekt
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{editId ? 'Projekt bearbeiten' : 'Neues Projekt'}</h3>
            <button type="button" onClick={() => setShowForm(false)} className="btn-ghost btn-sm"><X className="h-4 w-4" /></button>
          </div>
          {error && <p className="text-sm text-danger-500">{error}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            {!editId && (
              <div>
                <label className="label">Kunde *</label>
                <select value={form.customerId} onChange={set('customerId')} className="input" required>
                  <option value="">— Kunde wählen —</option>
                  {customers?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="label">Projektname *</label>
              <input value={form.name} onChange={set('name')} className="input" required />
            </div>
            <div>
              <label className="label">Baustellenadresse</label>
              <input value={form.siteAddressLine1} onChange={set('siteAddressLine1')} className="input" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="label">PLZ</label><input value={form.siteZip} onChange={set('siteZip')} className="input" /></div>
              <div><label className="label">Ort</label><input value={form.siteCity} onChange={set('siteCity')} className="input" /></div>
            </div>
            <div><label className="label">Kostenstelle</label><input value={form.costCenter} onChange={set('costCenter')} className="input" /></div>
            <div><label className="label">Stundensatz (€)</label><input type="number" step="0.01" value={form.hourlyRateCents} onChange={set('hourlyRateCents')} className="input" /></div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Abbrechen</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Speichern
            </button>
          </div>
        </form>
      )}

      {/* Filter */}
      <div className="flex gap-4">
        <div>
          <label className="label">Kunde filtern</label>
          <select value={filterCustomer} onChange={(e) => setFilterCustomer(e.target.value)} className="input w-60">
            <option value="">Alle Kunden</option>
            {customers?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>
        ) : !filtered?.length ? (
          <div className="py-20 text-center text-sm text-surface-400">Keine Projekte gefunden</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-surface-50/50 text-left text-xs font-semibold uppercase tracking-wider text-surface-500">
                  <th className="px-5 py-3">Projekt</th>
                  <th className="px-5 py-3">Kunde</th>
                  <th className="px-5 py-3">Baustelle</th>
                  <th className="px-5 py-3">Kostenstelle</th>
                  <th className="px-5 py-3">€/h</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Aktionen</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((p) => (
                  <tr key={p.id} className={clsx('hover:bg-surface-50/80 transition-colors', !p.isActive && 'opacity-50')}>
                    <td className="px-5 py-3 font-medium">{p.name}</td>
                    <td className="px-5 py-3 text-surface-600">{p.customer.name}</td>
                    <td className="px-5 py-3 text-surface-600">{[p.siteZip, p.siteCity].filter(Boolean).join(' ') || '—'}</td>
                    <td className="px-5 py-3 font-mono text-xs">{p.costCenter || '—'}</td>
                    <td className="px-5 py-3">{p.hourlyRateCents ? `${(p.hourlyRateCents / 100).toFixed(2)}` : '—'}</td>
                    <td className="px-5 py-3">
                      <button onClick={() => toggleActive(p)} className={clsx('badge cursor-pointer', p.isActive ? 'badge-approved' : 'badge-draft')}>
                        {p.isActive ? 'Aktiv' : 'Inaktiv'}
                      </button>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button onClick={() => startEdit(p)} className="btn-ghost btn-sm"><Edit2 className="h-3.5 w-3.5" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
