import { useState, FormEvent } from 'react';
import { useQuery, useMutation } from '@/hooks/useQuery';
import { Building2, Plus, Edit2, X, Loader2, Check } from 'lucide-react';
import clsx from 'clsx';

interface Customer {
  id: string;
  name: string;
  addressLine1: string | null;
  zip: string | null;
  city: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  isActive: boolean;
}

const emptyForm = {
  name: '',
  addressLine1: '',
  zip: '',
  city: '',
  contactName: '',
  contactPhone: '',
  contactEmail: '',
};

export default function CustomersPage() {
  const { data: customers, isLoading, refetch } = useQuery<Customer[]>('/customers');
  const { mutate, isLoading: saving, error } = useMutation();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const startEdit = (c: Customer) => {
    setEditId(c.id);
    setForm({
      name: c.name,
      addressLine1: c.addressLine1 || '',
      zip: c.zip || '',
      city: c.city || '',
      contactName: c.contactName || '',
      contactPhone: c.contactPhone || '',
      contactEmail: c.contactEmail || '',
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
    const body = {
      name: form.name,
      addressLine1: form.addressLine1 || null,
      zip: form.zip || null,
      city: form.city || null,
      contactName: form.contactName || null,
      contactPhone: form.contactPhone || null,
      contactEmail: form.contactEmail || null,
    };

    if (editId) {
      await mutate('PATCH', `/customers/${editId}`, body);
    } else {
      await mutate('POST', '/customers', body);
    }
    setShowForm(false);
    refetch();
  };

  const toggleActive = async (c: Customer) => {
    await mutate('PATCH', `/customers/${c.id}`, { isActive: !c.isActive });
    refetch();
  };

  const set = (field: string) => (e: any) => setForm({ ...form, [field]: e.target.value });

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Kunden</h1>
          <p className="text-sm text-surface-500 mt-1">Kundenstammdaten verwalten</p>
        </div>
        <button onClick={startNew} className="btn-primary btn-sm">
          <Plus className="h-4 w-4" /> Neuer Kunde
        </button>
      </div>

      {/* Formular */}
      {showForm && (
        <form onSubmit={handleSubmit} className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              {editId ? 'Kunde bearbeiten' : 'Neuer Kunde'}
            </h3>
            <button type="button" onClick={() => setShowForm(false)} className="btn-ghost btn-sm">
              <X className="h-4 w-4" />
            </button>
          </div>
          {error && <p className="text-sm text-danger-500">{error}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Name *</label>
              <input value={form.name} onChange={set('name')} className="input" required />
            </div>
            <div>
              <label className="label">Adresse</label>
              <input value={form.addressLine1} onChange={set('addressLine1')} className="input" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">PLZ</label>
                <input value={form.zip} onChange={set('zip')} className="input" />
              </div>
              <div>
                <label className="label">Ort</label>
                <input value={form.city} onChange={set('city')} className="input" />
              </div>
            </div>
            <div>
              <label className="label">Kontaktperson</label>
              <input value={form.contactName} onChange={set('contactName')} className="input" />
            </div>
            <div>
              <label className="label">Telefon</label>
              <input value={form.contactPhone} onChange={set('contactPhone')} className="input" />
            </div>
            <div>
              <label className="label">E-Mail</label>
              <input type="email" value={form.contactEmail} onChange={set('contactEmail')} className="input" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Abbrechen</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Speichern
            </button>
          </div>
        </form>
      )}

      {/* Liste */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>
        ) : !customers?.length ? (
          <div className="py-20 text-center text-sm text-surface-400">Keine Kunden vorhanden</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-surface-50/50 text-left text-xs font-semibold uppercase tracking-wider text-surface-500">
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Ort</th>
                  <th className="px-5 py-3">Kontakt</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Aktionen</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {customers.map((c) => (
                  <tr key={c.id} className={clsx('transition-colors hover:bg-surface-50/80', !c.isActive && 'opacity-50')}>
                    <td className="px-5 py-3 font-medium">{c.name}</td>
                    <td className="px-5 py-3 text-surface-600">
                      {[c.zip, c.city].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td className="px-5 py-3 text-surface-600">
                      {c.contactName || '—'}
                      {c.contactPhone && <span className="text-surface-400 ml-1">({c.contactPhone})</span>}
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => toggleActive(c)}
                        className={clsx('badge cursor-pointer', c.isActive ? 'badge-approved' : 'badge-draft')}
                      >
                        {c.isActive ? 'Aktiv' : 'Inaktiv'}
                      </button>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button onClick={() => startEdit(c)} className="btn-ghost btn-sm">
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
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
