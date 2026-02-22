import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  startOfMonth, endOfMonth, startOfYear, endOfYear,
  differenceInMinutes, format, eachDayOfInterval, isWeekend,
} from 'date-fns';
import { de } from 'date-fns/locale';

export interface DailyEntry {
  date: string; weekday: string; startTime: string | null; endTime: string | null;
  breakMinutes: number; netMinutes: number; status: string; entryType: string; rapport?: string;
}
export interface MonthlyReportDto {
  user: { id: string; firstName: string; lastName: string; email: string; hourlyRateCents?: number };
  period: string; month: number; year: number; workingDaysInMonth: number; daysWorked: number;
  totalGrossMinutes: number; totalBreakMinutes: number; totalNetMinutes: number;
  targetMinutes: number; overtimeMinutes: number; grossWageCents?: number;
  entries: DailyEntry[];
  statusSummary: { DRAFT: number; SUBMITTED: number; APPROVED: number; LOCKED: number };
}
export interface TeamReportDto {
  period: string; month: number; year: number; totalUsers: number;
  totalNetHours: number; totalGrossWageCents?: number; users: MonthlyReportDto[];
}

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async getUserMonthlyReport(userId: string, month: number, year: number): Promise<MonthlyReportDto> {
    const { from, to } = this.monthRange(month, year);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const entries = await this.fetchEntries({ userId, from, to });
    return this.buildReport(user, entries, month, year);
  }

  async getTeamMonthlyReport(month: number, year: number): Promise<TeamReportDto> {
    const { from, to } = this.monthRange(month, year);
    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    const allEntries = await this.fetchEntries({ from, to });
    const userReports = users.map((u) => {
      const entries = allEntries.filter((e) => e.userId === u.id);
      return this.buildReport(u, entries, month, year);
    });
    const totalNetMinutes = userReports.reduce((s, r) => s + r.totalNetMinutes, 0);
    const hasWage = userReports.some((r) => r.grossWageCents !== undefined);
    return {
      period: format(new Date(year, month - 1, 1), 'MMMM yyyy', { locale: de }),
      month, year, totalUsers: users.length,
      totalNetHours: Math.round((totalNetMinutes / 60) * 100) / 100,
      totalGrossWageCents: hasWage ? userReports.reduce((s, r) => s + (r.grossWageCents ?? 0), 0) : undefined,
      users: userReports,
    };
  }

  async getUserYearlyReport(userId: string, year: number) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const allEntries = await this.fetchEntries({
      userId,
      from: startOfYear(new Date(year, 0, 1)),
      to: endOfYear(new Date(year, 0, 1)),
    });
    const months = Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
      const { from, to } = this.monthRange(m, year);
      const entries = allEntries.filter((e) => e.startAt >= from && e.startAt <= to);
      const r = this.buildReport(user, entries, m, year);
      return {
        month: m, period: r.period,
        netHours: Math.round((r.totalNetMinutes / 60) * 100) / 100,
        overtimeHours: Math.round((r.overtimeMinutes / 60) * 100) / 100,
        daysWorked: r.daysWorked, grossWageCents: r.grossWageCents,
      };
    });
    return {
      user: { id: user.id, firstName: user.firstName, lastName: user.lastName },
      year, months,
      totalNetHours: months.reduce((s, m) => s + m.netHours, 0),
      totalOvertimeHours: months.reduce((s, m) => s + m.overtimeHours, 0),
    };
  }

  async getPendingEntries() {
    const entries = await this.prisma.timeEntry.findMany({
      where: { status: 'SUBMITTED' },
      include: { user: { select: { id: true, firstName: true, lastName: true } }, breaks: true },
      orderBy: { startAt: 'asc' },
    });
    return entries.map((e) => ({
      id: e.id,
      user: `${e.user.firstName} ${e.user.lastName}`,
      userId: e.userId,
      date: format(e.startAt, 'dd.MM.yyyy'),
      startTime: format(e.startAt, 'HH:mm'),
      endTime: e.endAt ? format(e.endAt, 'HH:mm') : 'läuft...',
      netMinutes: this.calcNetMinutes(e),
      status: e.status,
    }));
  }

  private buildReport(user: any, entries: any[], month: number, year: number): MonthlyReportDto {
    const { from, to } = this.monthRange(month, year);
    const workingDaysInMonth = eachDayOfInterval({ start: from, end: to }).filter((d) => !isWeekend(d)).length;
    const uniqueDays = new Set(entries.map((e) => format(e.startAt, 'yyyy-MM-dd')));
    const totalGrossMinutes = entries.reduce((sum, e) => {
      if (!e.endAt) return sum;
      return sum + Math.max(0, differenceInMinutes(e.endAt, e.startAt));
    }, 0);
    const totalBreakMinutes = entries.reduce((sum, e) => sum + this.calcBreakMinutes(e), 0);
    const totalNetMinutes = totalGrossMinutes - totalBreakMinutes;
    const targetMinutes = uniqueDays.size * 480;
    const hourlyRateCents: number | undefined = user.hourlyRateCents ?? undefined;
    const grossWageCents = hourlyRateCents !== undefined
      ? Math.round((totalNetMinutes / 60) * hourlyRateCents) : undefined;
    const statusSummary = { DRAFT: 0, SUBMITTED: 0, APPROVED: 0, LOCKED: 0 };
    entries.forEach((e) => { if (e.status in statusSummary) statusSummary[e.status as keyof typeof statusSummary]++; });
    return {
      user: { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email, hourlyRateCents },
      period: format(new Date(year, month - 1, 1), 'MMMM yyyy', { locale: de }),
      month, year, workingDaysInMonth, daysWorked: uniqueDays.size,
      totalGrossMinutes, totalBreakMinutes, totalNetMinutes,
      targetMinutes, overtimeMinutes: totalNetMinutes - targetMinutes,
      grossWageCents,
      entries: entries.map((e) => ({
        date: format(e.startAt, 'dd.MM.yyyy'),
        weekday: format(e.startAt, 'EEEE', { locale: de }),
        startTime: format(e.startAt, 'HH:mm'),
        endTime: e.endAt ? format(e.endAt, 'HH:mm') : null,
        breakMinutes: this.calcBreakMinutes(e),
        netMinutes: this.calcNetMinutes(e),
        status: e.status, entryType: e.entryType, rapport: e.rapport ?? undefined,
      })),
      statusSummary,
    };
  }

  private monthRange(month: number, year: number) {
    const d = new Date(year, month - 1, 1);
    return { from: startOfMonth(d), to: endOfMonth(d) };
  }

  private async fetchEntries(filter: { userId?: string; from: Date; to: Date }) {
    return this.prisma.timeEntry.findMany({
      where: {
        ...(filter.userId && { userId: filter.userId }),
        startAt: { gte: filter.from, lte: filter.to },
      },
      include: { breaks: true },
      orderBy: { startAt: 'asc' },
    });
  }

  private calcBreakMinutes(entry: any): number {
    if (!entry.breaks?.length) return 0;
    return entry.breaks.reduce((sum: number, b: any) => {
      if (!b.endAt) return sum;
      return sum + Math.max(0, differenceInMinutes(b.endAt, b.startAt));
    }, 0);
  }

  private calcNetMinutes(entry: any): number {
    if (!entry.endAt) return 0;
    return Math.max(0, differenceInMinutes(entry.endAt, entry.startAt) - this.calcBreakMinutes(entry));
  }
}
