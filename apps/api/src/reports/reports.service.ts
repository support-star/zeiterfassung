import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  differenceInMinutes,
  format,
  eachDayOfInterval,
  isWeekend,
} from 'date-fns';
import { de } from 'date-fns/locale';

export interface MonthlyReportDto {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    hourlyRate?: number;
  };
  period: string; // z.B. "Januar 2025"
  month: number;
  year: number;
  workingDaysInMonth: number;
  daysWorked: number;
  totalGrossMinutes: number;   // inkl. Pausen
  totalBreakMinutes: number;
  totalNetMinutes: number;     // ohne Pausen
  overtimeMinutes: number;     // Differenz zu Soll (Basis: 8h/Tag)
  targetMinutes: number;       // Soll-Stunden (daysWorked × 480)
  grossWage?: number;          // wenn hourlyRate gesetzt
  entries: DailyEntry[];
  statusSummary: {
    DRAFT: number;
    SUBMITTED: number;
    APPROVED: number;
    LOCKED: number;
  };
}

export interface DailyEntry {
  date: string;
  weekday: string;
  startTime: string | null;
  endTime: string | null;
  breakMinutes: number;
  netMinutes: number;
  status: string;
  note?: string;
}

export interface TeamReportDto {
  period: string;
  month: number;
  year: number;
  totalUsers: number;
  totalNetHours: number;
  totalGrossWage?: number;
  users: MonthlyReportDto[];
}

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  // ─────────────────────────────────────────────────────────────
  // Monatsbericht für einen einzelnen Mitarbeiter
  // ─────────────────────────────────────────────────────────────
  async getUserMonthlyReport(
    userId: string,
    month: number,
    year: number,
  ): Promise<MonthlyReportDto> {
    const from = startOfMonth(new Date(year, month - 1, 1));
    const to = endOfMonth(new Date(year, month - 1, 1));

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    const entries = await this.prisma.timeEntry.findMany({
      where: {
        userId,
        startTime: { gte: from, lte: to },
      },
      orderBy: { startTime: 'asc' },
    });

    return this.buildMonthlyReport(user, entries, month, year, from, to);
  }

  // ─────────────────────────────────────────────────────────────
  // Team-Bericht: alle Mitarbeiter für einen Monat
  // ─────────────────────────────────────────────────────────────
  async getTeamMonthlyReport(month: number, year: number): Promise<TeamReportDto> {
    const from = startOfMonth(new Date(year, month - 1, 1));
    const to = endOfMonth(new Date(year, month - 1, 1));

    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    const allEntries = await this.prisma.timeEntry.findMany({
      where: { startTime: { gte: from, lte: to } },
      orderBy: { startTime: 'asc' },
    });

    const userReports: MonthlyReportDto[] = [];

    for (const user of users) {
      const userEntries = allEntries.filter((e) => e.userId === user.id);
      const report = this.buildMonthlyReport(user, userEntries, month, year, from, to);
      userReports.push(report);
    }

    const totalNetMinutes = userReports.reduce((s, r) => s + r.totalNetMinutes, 0);
    const totalGrossWage = userReports.some((r) => r.grossWage !== undefined)
      ? userReports.reduce((s, r) => s + (r.grossWage ?? 0), 0)
      : undefined;

    const date = new Date(year, month - 1, 1);
    return {
      period: format(date, 'MMMM yyyy', { locale: de }),
      month,
      year,
      totalUsers: users.length,
      totalNetHours: Math.round((totalNetMinutes / 60) * 100) / 100,
      totalGrossWage,
      users: userReports,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Jahresübersicht für einen Mitarbeiter (alle Monate)
  // ─────────────────────────────────────────────────────────────
  async getUserYearlyReport(userId: string, year: number) {
    const from = startOfYear(new Date(year, 0, 1));
    const to = endOfYear(new Date(year, 0, 1));

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const entries = await this.prisma.timeEntry.findMany({
      where: { userId, startTime: { gte: from, lte: to } },
      orderBy: { startTime: 'asc' },
    });

    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    const monthlyData = months.map((m) => {
      const mFrom = startOfMonth(new Date(year, m - 1, 1));
      const mTo = endOfMonth(new Date(year, m - 1, 1));
      const mEntries = entries.filter((e) => {
        const d = new Date(e.startTime!);
        return d >= mFrom && d <= mTo;
      });
      return this.buildMonthlyReport(user, mEntries, m, year, mFrom, mTo);
    });

    const totalNetMinutes = monthlyData.reduce((s, m) => s + m.totalNetMinutes, 0);
    const totalOvertimeMinutes = monthlyData.reduce((s, m) => s + m.overtimeMinutes, 0);

    return {
      user: { id: user.id, firstName: user.firstName, lastName: user.lastName },
      year,
      months: monthlyData.map((m) => ({
        month: m.month,
        period: m.period,
        netHours: Math.round((m.totalNetMinutes / 60) * 100) / 100,
        overtimeHours: Math.round((m.overtimeMinutes / 60) * 100) / 100,
        daysWorked: m.daysWorked,
        grossWage: m.grossWage,
      })),
      totalNetHours: Math.round((totalNetMinutes / 60) * 100) / 100,
      totalOvertimeHours: Math.round((totalOvertimeMinutes / 60) * 100) / 100,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Offene Einträge (noch nicht genehmigt)
  // ─────────────────────────────────────────────────────────────
  async getPendingEntries() {
    const entries = await this.prisma.timeEntry.findMany({
      where: { status: 'SUBMITTED' },
      include: { user: true },
      orderBy: { startTime: 'asc' },
    });

    return entries.map((e) => ({
      id: e.id,
      user: `${e.user.firstName} ${e.user.lastName}`,
      userId: e.userId,
      date: e.startTime ? format(new Date(e.startTime), 'dd.MM.yyyy') : '-',
      startTime: e.startTime ? format(new Date(e.startTime), 'HH:mm') : '-',
      endTime: e.endTime ? format(new Date(e.endTime), 'HH:mm') : 'läuft...',
      netMinutes: this.calcNetMinutes(e),
      status: e.status,
      submittedAt: e.updatedAt,
    }));
  }

  // ─────────────────────────────────────────────────────────────
  // INTERNER BUILDER
  // ─────────────────────────────────────────────────────────────
  private buildMonthlyReport(
    user: any,
    entries: any[],
    month: number,
    year: number,
    from: Date,
    to: Date,
  ): MonthlyReportDto {
    const allDays = eachDayOfInterval({ start: from, end: to });
    const workingDaysInMonth = allDays.filter((d) => !isWeekend(d)).length;

    const uniqueWorkDays = new Set(
      entries
        .filter((e) => e.startTime)
        .map((e) => format(new Date(e.startTime), 'yyyy-MM-dd')),
    );

    const totalGrossMinutes = entries.reduce((sum, e) => {
      if (!e.startTime || !e.endTime) return sum;
      return sum + Math.max(0, differenceInMinutes(new Date(e.endTime), new Date(e.startTime)));
    }, 0);

    const totalBreakMinutes = entries.reduce((sum, e) => sum + (e.breakMinutes || 0), 0);
    const totalNetMinutes = totalGrossMinutes - totalBreakMinutes;
    const targetMinutes = uniqueWorkDays.size * 480; // 8h Soll
    const overtimeMinutes = totalNetMinutes - targetMinutes;

    const hourlyRate = user.hourlyRate ?? null;
    const grossWage =
      hourlyRate !== null
        ? Math.round((totalNetMinutes / 60) * hourlyRate * 100) / 100
        : undefined;

    const statusSummary = { DRAFT: 0, SUBMITTED: 0, APPROVED: 0, LOCKED: 0 };
    entries.forEach((e) => {
      if (e.status in statusSummary) statusSummary[e.status as keyof typeof statusSummary]++;
    });

    const dailyEntries: DailyEntry[] = entries.map((e) => {
      const netMins = this.calcNetMinutes(e);
      return {
        date: e.startTime ? format(new Date(e.startTime), 'dd.MM.yyyy') : '-',
        weekday: e.startTime ? format(new Date(e.startTime), 'EEEE', { locale: de }) : '-',
        startTime: e.startTime ? format(new Date(e.startTime), 'HH:mm') : null,
        endTime: e.endTime ? format(new Date(e.endTime), 'HH:mm') : null,
        breakMinutes: e.breakMinutes || 0,
        netMinutes: netMins,
        status: e.status,
        note: e.note ?? undefined,
      };
    });

    const date = new Date(year, month - 1, 1);

    return {
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        hourlyRate: user.hourlyRate ?? undefined,
      },
      period: format(date, 'MMMM yyyy', { locale: de }),
      month,
      year,
      workingDaysInMonth,
      daysWorked: uniqueWorkDays.size,
      totalGrossMinutes,
      totalBreakMinutes,
      totalNetMinutes,
      targetMinutes,
      overtimeMinutes,
      grossWage,
      entries: dailyEntries,
      statusSummary,
    };
  }

  private calcNetMinutes(entry: any): number {
    if (!entry.startTime || !entry.endTime) return 0;
    const gross = differenceInMinutes(new Date(entry.endTime), new Date(entry.startTime));
    return Math.max(0, gross - (entry.breakMinutes || 0));
  }
}
