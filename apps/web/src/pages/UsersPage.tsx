import { useState, FormEvent } from 'react';
import { useQuery, useMutation } from '@/hooks/useQuery';
import { roleLabel } from '@/lib/format';
import { Users, Plus, Edit2, X, Loader2, Check, UserX } from 'lucide-react';
import clsx from 'clsx';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
}

const emptyForm = { email: '', password: '', firstName: '', lastName: '', role: 'WORKER' };

export default function UsersPage() {
  const { data: users, isLoading, refetch } = useQuery<User[]>('/users');
  const { mutate, isLoading: saving, error } = useMutation();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const startEdit = (u: User) => {
    setEditId(u.id);
    setForm({ email: u.email, password: '', firstName: u.firstName, lastName: u.lastName, role: u.role });
    setShowForm(true);
  };

  const startNew = () => {
    setEditId(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (editId) {
      const body: any = {
        email: form.email,
        firstName: form.firstName,
        lastName: form.lastName,
        role: form.role,
      };
      await mutate('PATCH', `/users/${editId}`, body);
    } else {
      await mutate('POST', '/users', {
        email: form.email,
        password: form.password,
        firstName: form.firstName,
        lastName: form.lastName,
        role: form.role,
      });
    }
    setShowForm(false);
    refetch();
  };

  const handleDeactivate = async (id: string) => {
    if (!confirm('Mitarbeiter wirklich deaktivieren?')) return;
    await mutate('POST', `/users/${id}/deactivate`, {});
    refetch();
  };

  const set = (field: string) => (e: any) => setForm({ ...form, [field]: e.target.value });

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mitarbeiter</h1>
          <p className="text-sm text-surface-500 mt-1">Benutzerkonten verwalten</p>
        </div>
        <button onClick={startNew} className="btn-primary btn-sm">
          <Plus className="h-4 w-4" /> Neuer Mitarbeiter
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{editId ? 'Mitarbeiter bearbeiten' : 'Neuer Mitarbeiter'}</h3>
            <button type="button" onClick={() => setShowForm(false)} className="btn-ghost btn-sm"><X className="h-4 w-4" /></button>
          </div>
          {error && <p className="text-sm text-danger-500">{error}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="label">Vorname *</label><input value={form.firstName} onChange={set('firstName')} className="input" required /></div>
            <div><label className="label">Nachname *</label><input value={form.lastName} onChange={set('lastName')} className="input" required /></div>
            <div><label className="label">E-Mail *</label><input type="email" value={form.email} onChange={set('email')} className="input" required /></div>
            {!editId && (
              <div><label className="label">Passwort *</label><input type="password" value={form.password} onChange={set('password')} className="input" required minLength={8} /></div>
            )}
            <div>
              <label className="label">Rolle *</label>
              <select value={form.role} onChange={set('role')} className="input">
                <option value="WORKER">Mitarbeiter</option>
                <option value="DISPO">Dispo</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Abbrechen</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Speichern
            </button>
          </div>
        </form>
      )}

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-surface-50/50 text-left text-xs font-semibold uppercase tracking-wider text-surface-500">
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">E-Mail</th>
                  <th className="px-5 py-3">Rolle</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Aktionen</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {users?.map((u) => (
                  <tr key={u.id} className={clsx('hover:bg-surface-50/80 transition-colors', !u.isActive && 'opacity-50')}>
                    <td className="px-5 py-3 font-medium">{u.firstName} {u.lastName}</td>
                    <td className="px-5 py-3 text-surface-600">{u.email}</td>
                    <td className="px-5 py-3">
                      <span className={clsx('badge', u.role === 'ADMIN' ? 'badge-locked' : u.role === 'DISPO' ? 'badge-submitted' : 'badge-draft')}>
                        {roleLabel(u.role)}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={clsx('badge', u.isActive ? 'badge-approved' : 'badge-draft')}>
                        {u.isActive ? 'Aktiv' : 'Inaktiv'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => startEdit(u)} className="btn-ghost btn-sm"><Edit2 className="h-3.5 w-3.5" /></button>
                        {u.isActive && (
                          <button onClick={() => handleDeactivate(u.id)} className="btn-ghost btn-sm text-danger-500" title="Deaktivieren">
                            <UserX className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
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
