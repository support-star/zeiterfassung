import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { ConfigService } from '@nestjs/config';
import { differenceInMinutes, format } from 'date-fns';
import { de } from 'date-fns/locale';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private config: ConfigService,
  ) {}

  async onStatusChanged(payload: {
    entryId: string;
    oldStatus: string;
    newStatus: string;
    changedBy: string;
  }) {
    const entry = await this.prisma.timeEntry.findUnique({
      where: { id: payload.entryId },
      include: { user: true },
    });
    if (!entry || !entry.user.email) return;

    const approver = await this.prisma.user.findUnique({ where: { id: payload.changedBy } });

    await this.mail.sendStatusChanged({
      to: entry.user.email,
      workerName: `${entry.user.firstName} ${entry.user.lastName}`,
      date: entry.startAt,
      oldStatus: payload.oldStatus,
      newStatus: payload.newStatus,
      approverName: approver ? `${approver.firstName} ${approver.lastName}` : 'System',
    });

    await this.prisma.notification.create({
      data: {
        userId: entry.userId,
        type: 'STATUS_CHANGED',
        title: `Eintrag ${this.statusLabel(payload.newStatus)}`,
        message: `Dein Zeiteintrag vom ${format(entry.startAt, 'dd.MM.yyyy')} wurde ${this.statusLabel(payload.newStatus)}.`,
        read: false,
        metadata: JSON.stringify({ entryId: payload.entryId, oldStatus: payload.oldStatus, newStatus: payload.newStatus }),
      },
    });
  }

  async onEntrySubmitted(payload: { entryId: string; workerId: string }) {
    const entry = await this.prisma.timeEntry.findUnique({
      where: { id: payload.entryId },
      include: { user: true, breaks: true },
    });
    if (!entry) return;

    const managers = await this.prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'DISPO'] }, isActive: true },
    });

    const dashboardUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:5173') + '/time-entries?filter=submitted';

    const breakMins = entry.breaks.reduce((sum, b) => {
      if (!b.endAt) return sum;
      return sum + Math.max(0, differenceInMinutes(b.endAt, b.startAt));
    }, 0);
    const netMinutes = entry.endAt
      ? Math.max(0, differenceInMinutes(entry.endAt, entry.startAt) - breakMins)
      : 0;

    for (const manager of managers) {
      if (!manager.email) continue;
      await this.mail.sendEntrySubmitted({
        to: manager.email,
        workerName: `${entry.user.firstName} ${entry.user.lastName}`,
        date: entry.startAt,
        netMinutes,
        dashboardUrl,
      });
      await this.prisma.notification.create({
        data: {
          userId: manager.id,
          type: 'ENTRY_SUBMITTED',
          title: 'Neuer Eintrag eingereicht',
          message: `${entry.user.firstName} ${entry.user.lastName} hat einen Eintrag vom ${format(entry.startAt, 'dd.MM.yyyy')} eingereicht.`,
          read: false,
          metadata: JSON.stringify({ entryId: payload.entryId }),
        },
      });
    }
  }

  // Tägliche Zusammenfassung Mo–Fr 08:00
  @Cron('0 8 * * 1-5', { timeZone: 'Europe/Berlin' })
  async dailySummaryForManagers() {
    const pendingCount = await this.prisma.timeEntry.count({ where: { status: 'SUBMITTED' } });
    if (pendingCount === 0) return;

    const managers = await this.prisma.user.findMany({ where: { role: { in: ['ADMIN', 'DISPO'] }, isActive: true } });
    const dashboardUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:5173') + '/time-entries?filter=submitted';

    for (const manager of managers) {
      if (!manager.email) continue;
      await this.mail.sendDailySummary({
        to: manager.email,
        managerName: `${manager.firstName} ${manager.lastName}`,
        date: new Date(),
        pendingCount,
        dashboardUrl,
      });
    }
    this.logger.log(`Tagesübersicht gesendet: ${pendingCount} offene Einträge`);
  }

  // Monatsauswertung am 1. jeden Monats 09:00
  @Cron('0 9 1 * *', { timeZone: 'Europe/Berlin' })
  async sendMonthlyReportMails() {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const month = lastMonth.getMonth() + 1;
    const year = lastMonth.getFullYear();
    const from = new Date(year, month - 1, 1);
    const to = new Date(year, month, 0, 23, 59, 59);

    const users = await this.prisma.user.findMany({ where: { isActive: true } });

    for (const user of users) {
      if (!user.email) continue;
      const entries = await this.prisma.timeEntry.findMany({
        where: { userId: user.id, startAt: { gte: from, lte: to } },
        include: { breaks: true },
      });
      if (entries.length === 0) continue;

      const totalNetMinutes = entries.reduce((sum, e) => {
        if (!e.endAt) return sum;
        const breakMins = e.breaks.reduce((s, b) => {
          if (!b.endAt) return s;
          return s + Math.max(0, differenceInMinutes(b.endAt, b.startAt));
        }, 0);
        return sum + Math.max(0, differenceInMinutes(e.endAt, e.startAt) - breakMins);
      }, 0);

      const workedDays = new Set(entries.map((e) => format(e.startAt, 'yyyy-MM-dd'))).size;
      const overtimeMinutes = totalNetMinutes - workedDays * 480;
      const hourlyRateCents: number | undefined = (user as any).hourlyRateCents ?? undefined;

      await this.mail.sendMonthlyReport({
        to: user.email,
        workerName: `${user.firstName} ${user.lastName}`,
        period: format(lastMonth, 'MMMM yyyy', { locale: de }),
        netHours: Math.round((totalNetMinutes / 60) * 100) / 100,
        overtimeHours: Math.round((overtimeMinutes / 60) * 100) / 100,
        grossWageCents: hourlyRateCents !== undefined
          ? Math.round((totalNetMinutes / 60) * hourlyRateCents) : undefined,
      });
    }
    this.logger.log(`Monatsauswertung für ${format(lastMonth, 'MMMM yyyy', { locale: de })} gesendet`);
  }

  // In-App Notifications
  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({ where: { userId, read: false } });
    return { count };
  }

  async getNotifications(userId: string, limit = 20) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true } });
    return { success: true };
  }

  async markRead(notificationId: string, userId: string) {
    await this.prisma.notification.updateMany({ where: { id: notificationId, userId }, data: { read: true } });
    return { success: true };
  }

  private statusLabel(status: string): string {
    return ({ DRAFT: 'zurückgesetzt', SUBMITTED: 'eingereicht', APPROVED: 'genehmigt', LOCKED: 'gesperrt' }[status] ?? status);
  }
}
