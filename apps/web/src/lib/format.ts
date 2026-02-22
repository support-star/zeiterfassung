import { format, differenceInMinutes, differenceInSeconds } from 'date-fns';
import { de } from 'date-fns/locale';

export function formatDate(date: string | Date) {
  return format(new Date(date), 'dd.MM.yyyy', { locale: de });
}

export function formatTime(date: string | Date) {
  return format(new Date(date), 'HH:mm', { locale: de });
}

export function formatDateTime(date: string | Date) {
  return format(new Date(date), 'dd.MM.yyyy HH:mm', { locale: de });
}

export function formatDuration(startAt: string | Date, endAt: string | Date | null): string {
  if (!endAt) return '--:--';
  const mins = differenceInMinutes(new Date(endAt), new Date(startAt));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

export function formatDurationMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${String(m).padStart(2, '0')} h`;
}

export function formatLiveTimer(startAt: string | Date): string {
  const secs = differenceInSeconds(new Date(), new Date(startAt));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    DRAFT: 'Entwurf',
    SUBMITTED: 'Eingereicht',
    APPROVED: 'Freigegeben',
    LOCKED: 'Gesperrt',
  };
  return map[status] || status;
}

export function typeLabel(type: string): string {
  const map: Record<string, string> = {
    WORK: 'Arbeit',
    TRAVEL: 'Fahrt',
    INTERNAL: 'Intern',
  };
  return map[type] || type;
}

export function roleLabel(role: string): string {
  const map: Record<string, string> = {
    ADMIN: 'Admin',
    DISPO: 'Dispo',
    WORKER: 'Mitarbeiter',
  };
  return map[role] || role;
}
