import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { ConfigService } from '@nestjs/config';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private config: ConfigService,
  ) {}

  // ─────────────────────────────────────────────────────────────
  // Wird aufgerufen wenn ein TimeEntry Status sich ändert
  // (in TimeEntriesService einbinden!)
  // ─────────────────────────────────────────────────────────────
  async onStatusChanged(payload: {
    entryId: string;
    oldStatus: string;
    newStatus: string;
    changedBy: string; // userId des Genehmigers
  }) {
    const entry = await this.prisma.timeEntry.findUnique({
      where: { id: payload.entryId },
      include: { user: true },
    });

    if (!entry) return;

    const approver = await this.prisma.user.findUnique({
      where: { id: payload.changedBy },
    });

    if (!entry.user.email) return;

    await this.mail.sendStatusChanged({
      to: entry.user.email,
      workerName: `${entry.user.firstName} ${entry.user.lastName}`,
      date: entry.startTime ?? new Date(),
      oldStatus: payload.oldStatus,
      newStatus: payload.newStatus,
      approverName: approver
        ? `${approver.firstName} ${approver.lastName}`
        : 'System',
    });

    // In DB loggen
    await this.prisma.notification.create({
      data: {
        userId: entry.userId,
        type: 'STATUS_CHANGED',
        title: `Eintrag ${this.statusLabel(payload.newStatus)}`,
        message: `Dein Zeiteintrag vom ${format(entry.startTime ?? new Date(), 'dd.MM.yyyy')} wurde ${this.statusLabel(payload.newStatus)}.`,
        read: false,
        metadata: JSON.stringify({
          entryId: payload.entryId,
          oldStatus: payload.oldStatus,
          newStatus: payload.newStatus,
        }),
      },
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Wird aufgerufen wenn ein Eintrag eingereicht wird
  // ─────────────────────────────────────────────────────────────
  async onEntrySubmitted(payload: {
    entryId: string;
    workerId: string;
  }) {
    const entry = await this.prisma.timeEntry.findUnique({
      where: { id: payload.entryId },
      include: { user: true },
    });

    if (!entry) return;

    // Alle Admins und Dispos benachrichtigen
    const managers = await this.prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'DISPO'] }, isActive: true },
    });

    const dashboardUrl = this.config.get<string>(
      'FRONTEND_URL',
      'http://localhost:5173',
    ) + '/admin/time-entries?filter=submitted';

    const netMinutes = entry.endTime && entry.startTime
      ? Math.max(
          0,
          Math.floor(
            (entry.endTime.getTime() - entry.startTime.getTime()) / 60000,
          ) - (entry.breakMinutes ?? 0),
        )
      : 0;

    for (const manager of managers) {
      if (!manager.email) continue;
      await this.mail.sendEntrySubmitted({
        to: manager.email,
        workerName: `${entry.user.firstName} ${entry.user.lastName}`,
        date: entry.startTime ?? new Date(),
        netMinutes,
        dashboardUrl,
      });

      await this.prisma.notification.create({
        data: {
          userId: manager.id,
          type: 'ENTRY_SUBMITTED',
          title: 'Neuer Eintrag eingereicht',
          message: `${entry.user.firstName} ${entry.user.lastName} hat einen Eintrag vom ${format(entry.startTime ?? new Date(), 'dd.MM.yyyy')} eingereicht.`,
          read: false,
          metadata: JSON.stringify({ entryId: payload.entryId, workerId: payload.workerId }),
        },
      });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // CRON: Tägliche Zusammenfassung für Manager (Mo–Fr, 8:00 Uhr)
  // ─────────────────────────────────────────────────────────────
  @Cron('0 8 * * 1-5', { timeZone: 'Europe/Berlin' })
  async dailySummaryForManagers() {
    this.logger.log('Sende tägliche Zusammenfassung an Manager...');

    const pendingEntries = await this.prisma.timeEntry.findMany({
      where: { status: 'SUBMITTED' },
    });

    if (pendingEntries.length === 0) return;

    const managers = await this.prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'DISPO'] }, isActive: true },
    });

    const dashboardUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:5173') + '/admin/time-entries?filter=submitted';

    for (const manager of managers) {
      if (!manager.email) continue;
      await this.mail.sendDailySummary({
        to: manager.email,
        managerName: `${manager.firstName} ${manager.lastName}`,
        date: new Date(),
        pendingCount: pendingEntries.length,
        dashboardUrl,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // CRON: Monatsabschluss-Mail für alle Mitarbeiter (1. jeden Monats, 9:00 Uhr)
  // ─────────────────────────────────────────────────────────────
  @Cron('0 9 1 * *', { timeZone: 'Europe/Berlin' })
  async sendMonthlyReportMails() {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const month = lastMonth.getMonth() + 1;
    const year = lastMonth.getFullYear();
    const period = format(lastMonth, 'MMMM yyyy', { locale: de });

    this.logger.log(`Sende Monatsauswertung für ${period}...`);

    const users = await this.prisma.user.findMany({
      where: { isActive: true },
    });

    for (const user of users) {
      if (!user.email) continue;

      const entries = await this.prisma.timeEntry.findMany({
        where: {
          userId: user.id,
          startTime: {
            gte: new Date(year, month - 1, 1),
            lte: new Date(year, month, 0, 23, 59, 59),
          },
        },
      });

      if (entries.length === 0) continue;

      const totalNetMinutes = entries.reduce((sum, e) => {
        if (!e.startTime || !e.endTime) return sum;
        const gross = Math.floor(
          (e.endTime.getTime() - e.startTime.getTime()) / 60000,
        );
        return sum + Math.max(0, gross - (e.breakMinutes ?? 0));
      }, 0);

      const workedDays = new Set(
        entries
          .filter((e) => e.startTime)
          .map((e) => format(e.startTime!, 'yyyy-MM-dd')),
      ).size;

      const targetMinutes = workedDays * 480;
      const overtimeMinutes = totalNetMinutes - targetMinutes;
      const hourlyRate = (user as any).hourlyRate ?? null;
      const grossWage =
        hourlyRate !== null
          ? Math.round((totalNetMinutes / 60) * hourlyRate * 100) / 100
          : undefined;

      await this.mail.sendMonthlyReport({
        to: user.email,
        workerName: `${user.firstName} ${user.lastName}`,
        period,
        netHours: Math.round((totalNetMinutes / 60) * 100) / 100,
        overtimeHours: Math.round((overtimeMinutes / 60) * 100) / 100,
        grossWage,
      });
    }

    this.logger.log(`Monatsauswertung für ${period} versendet.`);
  }

  // ─────────────────────────────────────────────────────────────
  // REST-Endpunkte für In-App Notifications
  // ─────────────────────────────────────────────────────────────

  async getUnreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, read: false },
    });
  }

  async getNotifications(userId: string, limit = 20) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }

  async markRead(notificationId: string, userId: string) {
    await this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { read: true },
    });
  }

  private statusLabel(status: string): string {
    const map: Record<string, string> = {
      DRAFT: 'zurückgesetzt', SUBMITTED: 'eingereicht',
      APPROVED: 'genehmigt', LOCKED: 'gesperrt',
    };
    return map[status] ?? status;
  }
}
