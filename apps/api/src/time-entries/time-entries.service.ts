import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { JwtPayload } from '../common/decorators/current-user.decorator';
import {
  StartTimeEntryDto,
  UpdateRapportDto,
  StartBreakDto,
  EndBreakDto,
  EndTimeEntryDto,
  UpdateTimeEntryDto,
  TimeEntryQueryDto,
  UserRole,
  EntryStatus,
} from '@zeiterfassung/shared';

@Injectable()
export class TimeEntriesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  // ── Abfrage ───────────────────────────────────────

  async findAll(query: TimeEntryQueryDto, currentUser: JwtPayload) {
    const where: any = {};

    // Worker sehen nur eigene Einträge
    if (currentUser.role === UserRole.WORKER) {
      where.userId = currentUser.sub;
    } else if (query.userId) {
      where.userId = query.userId;
    }

    if (query.customerId) where.customerId = query.customerId;
    if (query.projectId) where.projectId = query.projectId;

    if (query.status) {
      where.status = { in: query.status.split(',') };
    }
    if (query.type) {
      where.entryType = { in: query.type.split(',') };
    }

    if (query.from || query.to) {
      where.startAt = {};
      if (query.from) where.startAt.gte = new Date(query.from);
      if (query.to) where.startAt.lte = new Date(query.to);
    }

    return this.prisma.timeEntry.findMany({
      where,
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        customer: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        breaks: {
          orderBy: { startAt: 'asc' },
        },
      },
      orderBy: { startAt: 'desc' },
    });
  }

  // ── Start ─────────────────────────────────────────

  async start(dto: StartTimeEntryDto, currentUser: JwtPayload) {
    const userId = currentUser.sub;
    const startAt = dto.startAt ? new Date(dto.startAt) : new Date();

    // Prüfe: Kein laufender TimeEntry
    const running = await this.prisma.timeEntry.findFirst({
      where: { userId, endAt: null },
    });
    if (running) {
      throw new BadRequestException(
        'Es läuft bereits ein Zeiteintrag. Bitte zuerst beenden.',
      );
    }

    // Prüfe: Kein Overlap mit bestehenden Einträgen
    await this.checkOverlap(userId, startAt, null, undefined);

    // Prüfe: Projekt gehört zum Kunden
    if (dto.projectId && dto.customerId) {
      const project = await this.prisma.project.findUnique({
        where: { id: dto.projectId },
      });
      if (!project || project.customerId !== dto.customerId) {
        throw new BadRequestException('Projekt gehört nicht zum gewählten Kunden.');
      }
    }

    const entry = await this.prisma.timeEntry.create({
      data: {
        userId,
        customerId: dto.customerId ?? null,
        projectId: dto.projectId ?? null,
        entryType: dto.entryType as any,
        startAt,
        status: 'DRAFT',
        rapport: dto.rapport ?? null,
        createdVia: dto.createdVia as any,
      },
      include: {
        customer: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        breaks: true,
      },
    });

    await this.audit.log({
      entityType: 'TimeEntry',
      entityId: entry.id,
      action: 'CREATE',
      actorUserId: userId,
      payload: {
        entryType: dto.entryType,
        customerId: dto.customerId,
        projectId: dto.projectId,
        startAt: startAt.toISOString(),
      },
    });

    return entry;
  }

  // ── Ende ──────────────────────────────────────────

  async end(id: string, dto: EndTimeEntryDto, currentUser: JwtPayload) {
    const entry = await this.getEntryOrFail(id);
    this.assertOwnerOrAdmin(entry.userId, currentUser);

    if (entry.endAt) {
      throw new BadRequestException('Zeiteintrag ist bereits beendet.');
    }

    const endAt = dto.endAt ? new Date(dto.endAt) : new Date();

    if (endAt <= entry.startAt) {
      throw new BadRequestException('Ende muss nach dem Start liegen.');
    }

    // Offene Pausen automatisch beenden
    const openBreak = await this.prisma.breakEntry.findFirst({
      where: { timeEntryId: id, endAt: null },
    });
    if (openBreak) {
      await this.prisma.breakEntry.update({
        where: { id: openBreak.id },
        data: { endAt },
      });
    }

    // Prüfe Overlap mit anderen Einträgen
    await this.checkOverlap(entry.userId, entry.startAt, endAt, id);

    const updated = await this.prisma.timeEntry.update({
      where: { id },
      data: { endAt },
      include: {
        customer: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        breaks: true,
      },
    });

    await this.audit.log({
      entityType: 'TimeEntry',
      entityId: id,
      action: 'UPDATE',
      actorUserId: currentUser.sub,
      payload: { endAt: endAt.toISOString() },
    });

    return updated;
  }

  // ── Rapport ───────────────────────────────────────

  async updateRapport(id: string, dto: UpdateRapportDto, currentUser: JwtPayload) {
    const entry = await this.getEntryOrFail(id);
    this.assertOwnerOrAdmin(entry.userId, currentUser);
    this.assertEditable(entry.status, currentUser);

    const updated = await this.prisma.timeEntry.update({
      where: { id },
      data: { rapport: dto.rapport },
    });

    return updated;
  }

  // ── Pause starten ─────────────────────────────────

  async startBreak(id: string, dto: StartBreakDto, currentUser: JwtPayload) {
    const entry = await this.getEntryOrFail(id);
    this.assertOwnerOrAdmin(entry.userId, currentUser);

    if (entry.endAt) {
      throw new BadRequestException('Zeiteintrag ist bereits beendet. Keine Pause möglich.');
    }

    // Prüfe: Keine laufende Pause
    const openBreak = await this.prisma.breakEntry.findFirst({
      where: { timeEntryId: id, endAt: null },
    });
    if (openBreak) {
      throw new BadRequestException('Es läuft bereits eine Pause.');
    }

    const startAt = dto.startAt ? new Date(dto.startAt) : new Date();

    if (startAt < entry.startAt) {
      throw new BadRequestException('Pausenbeginn muss nach dem Eintragsbeginn liegen.');
    }

    const breakEntry = await this.prisma.breakEntry.create({
      data: {
        timeEntryId: id,
        breakType: dto.breakType as any,
        startAt,
      },
    });

    return breakEntry;
  }

  // ── Pause beenden ─────────────────────────────────

  async endBreak(id: string, dto: EndBreakDto, currentUser: JwtPayload) {
    const entry = await this.getEntryOrFail(id);
    this.assertOwnerOrAdmin(entry.userId, currentUser);

    const openBreak = await this.prisma.breakEntry.findFirst({
      where: { timeEntryId: id, endAt: null },
    });
    if (!openBreak) {
      throw new BadRequestException('Keine laufende Pause gefunden.');
    }

    const endAt = dto.endAt ? new Date(dto.endAt) : new Date();

    if (endAt <= openBreak.startAt) {
      throw new BadRequestException('Pausenende muss nach dem Pausenbeginn liegen.');
    }

    const updated = await this.prisma.breakEntry.update({
      where: { id: openBreak.id },
      data: { endAt },
    });

    return updated;
  }

  // ── Status-Workflow ───────────────────────────────

  async submit(id: string, currentUser: JwtPayload) {
    const entry = await this.getEntryOrFail(id);
    this.assertOwnerOrAdmin(entry.userId, currentUser);

    if (entry.status !== 'DRAFT') {
      throw new BadRequestException('Nur DRAFT-Einträge können eingereicht werden.');
    }

    if (!entry.endAt) {
      throw new BadRequestException('Laufende Einträge können nicht eingereicht werden.');
    }

    const updated = await this.prisma.timeEntry.update({
      where: { id },
      data: { status: 'SUBMITTED' },
    });

    await this.audit.log({
      entityType: 'TimeEntry',
      entityId: id,
      action: 'SUBMIT',
      actorUserId: currentUser.sub,
    });

    return updated;
  }

  async approve(id: string, currentUser: JwtPayload) {
    this.assertRole(currentUser, [UserRole.ADMIN, UserRole.DISPO]);

    const entry = await this.getEntryOrFail(id);

    if (entry.status !== 'SUBMITTED') {
      throw new BadRequestException('Nur SUBMITTED-Einträge können freigegeben werden.');
    }

    const updated = await this.prisma.timeEntry.update({
      where: { id },
      data: { status: 'APPROVED' },
    });

    await this.audit.log({
      entityType: 'TimeEntry',
      entityId: id,
      action: 'APPROVE',
      actorUserId: currentUser.sub,
    });

    return updated;
  }

  async reopen(id: string, currentUser: JwtPayload) {
    this.assertRole(currentUser, [UserRole.ADMIN, UserRole.DISPO]);

    const entry = await this.getEntryOrFail(id);

    if (entry.status === 'DRAFT') {
      throw new BadRequestException('DRAFT-Einträge müssen nicht zurückgesetzt werden.');
    }

    if (entry.status === 'LOCKED' && currentUser.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Nur ADMIN kann gesperrte Einträge zurücksetzen.');
    }

    const updated = await this.prisma.timeEntry.update({
      where: { id },
      data: { status: 'DRAFT' },
    });

    await this.audit.log({
      entityType: 'TimeEntry',
      entityId: id,
      action: 'REOPEN',
      actorUserId: currentUser.sub,
      payload: { previousStatus: entry.status },
    });

    return updated;
  }

  // ── Manuelles Update (ADMIN/DISPO) ───────────────

  async update(id: string, dto: UpdateTimeEntryDto, currentUser: JwtPayload) {
    const entry = await this.getEntryOrFail(id);

    // Worker darf nur eigene DRAFT-Einträge bearbeiten
    if (currentUser.role === UserRole.WORKER) {
      if (entry.userId !== currentUser.sub) {
        throw new ForbiddenException('Kein Zugriff auf fremde Einträge.');
      }
      if (entry.status !== 'DRAFT') {
        throw new ForbiddenException('Nur DRAFT-Einträge dürfen bearbeitet werden.');
      }
    }

    // DISPO darf DRAFT und SUBMITTED bearbeiten
    if (currentUser.role === UserRole.DISPO) {
      if (!['DRAFT', 'SUBMITTED'].includes(entry.status)) {
        throw new ForbiddenException('Nur DRAFT/SUBMITTED dürfen bearbeitet werden.');
      }
    }

    // Overlap-Prüfung wenn Start/Ende sich ändern
    const newStart = dto.startAt ? new Date(dto.startAt) : entry.startAt;
    const newEnd = dto.endAt !== undefined
      ? (dto.endAt ? new Date(dto.endAt) : null)
      : entry.endAt;

    if (newEnd && newEnd <= newStart) {
      throw new BadRequestException('Ende muss nach dem Start liegen.');
    }

    if (dto.startAt || dto.endAt !== undefined) {
      await this.checkOverlap(entry.userId, newStart, newEnd, id);
    }

    // Prüfe Projekt/Kunden-Zugehörigkeit
    const customerId = dto.customerId !== undefined ? dto.customerId : entry.customerId;
    const projectId = dto.projectId !== undefined ? dto.projectId : entry.projectId;

    if (projectId && customerId) {
      const project = await this.prisma.project.findUnique({ where: { id: projectId } });
      if (!project || project.customerId !== customerId) {
        throw new BadRequestException('Projekt gehört nicht zum gewählten Kunden.');
      }
    }

    const updated = await this.prisma.timeEntry.update({
      where: { id },
      data: {
        ...(dto.customerId !== undefined && { customerId: dto.customerId }),
        ...(dto.projectId !== undefined && { projectId: dto.projectId }),
        ...(dto.entryType && { entryType: dto.entryType as any }),
        ...(dto.startAt && { startAt: new Date(dto.startAt) }),
        ...(dto.endAt !== undefined && { endAt: dto.endAt ? new Date(dto.endAt) : null }),
        ...(dto.rapport !== undefined && { rapport: dto.rapport }),
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        customer: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        breaks: true,
      },
    });

    await this.audit.log({
      entityType: 'TimeEntry',
      entityId: id,
      action: 'UPDATE',
      actorUserId: currentUser.sub,
      payload: dto as Record<string, unknown>,
    });

    return updated;
  }

  // ── Bulk Actions ──────────────────────────────────

  async bulkSubmit(ids: string[], currentUser: JwtPayload) {
    const results = await Promise.allSettled(
      ids.map((id) => this.submit(id, currentUser)),
    );
    return this.formatBulkResults(ids, results);
  }

  async bulkApprove(ids: string[], currentUser: JwtPayload) {
    const results = await Promise.allSettled(
      ids.map((id) => this.approve(id, currentUser)),
    );
    return this.formatBulkResults(ids, results);
  }

  async bulkReopen(ids: string[], currentUser: JwtPayload) {
    const results = await Promise.allSettled(
      ids.map((id) => this.reopen(id, currentUser)),
    );
    return this.formatBulkResults(ids, results);
  }

  async lockMonth(year: number, month: number, currentUser: JwtPayload) {
    this.assertRole(currentUser, [UserRole.ADMIN]);

    const from = new Date(year, month - 1, 1);
    const to = new Date(year, month, 1);

    const result = await this.prisma.timeEntry.updateMany({
      where: {
        startAt: { gte: from, lt: to },
        status: 'APPROVED',
      },
      data: { status: 'LOCKED' },
    });

    await this.audit.log({
      entityType: 'TimeEntry',
      entityId: '00000000-0000-0000-0000-000000000000',
      action: 'UPDATE',
      actorUserId: currentUser.sub,
      payload: { action: 'LOCK_MONTH', year, month, count: result.count },
    });

    return { locked: result.count };
  }

  // ── Laufende Einträge (Dashboard) ─────────────────

  async findRunning() {
    return this.prisma.timeEntry.findMany({
      where: { endAt: null },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        customer: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        breaks: {
          where: { endAt: null },
        },
      },
      orderBy: { startAt: 'asc' },
    });
  }

  // ── Offene zur Prüfung (Dashboard) ────────────────

  async findSubmitted() {
    return this.prisma.timeEntry.findMany({
      where: { status: 'SUBMITTED' },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        customer: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        breaks: true,
      },
      orderBy: { startAt: 'desc' },
    });
  }

  // ══════════════════════════════════════════════════
  //  Private Hilfsmethoden
  // ══════════════════════════════════════════════════

  /**
   * Overlap-Prüfung:
   * Ein neuer/geänderter Eintrag darf sich nicht mit bestehenden
   * Einträgen des gleichen Users überschneiden.
   *
   * Fälle:
   * 1) Neuer Eintrag ohne Ende (laufend): start darf nicht innerhalb
   *    eines bestehenden Eintrags liegen.
   * 2) Eintrag mit Ende: [start, end] darf sich mit keinem bestehenden
   *    [start, end] überlappen.
   * 3) Laufende bestehende Einträge (end=null) überlappen mit allem
   *    was nach ihrem Start beginnt.
   */
  private async checkOverlap(
    userId: string,
    start: Date,
    end: Date | null,
    excludeId?: string,
  ) {
    const conditions: any[] = [];

    if (end) {
      // Fall: Eintrag hat ein Ende -> prüfe klassische Intervall-Überlappung
      // Overlap wenn: existing.start < newEnd AND (existing.end > newStart OR existing.end IS NULL)
      conditions.push({
        userId,
        ...(excludeId && { id: { not: excludeId } }),
        startAt: { lt: end },
        OR: [
          { endAt: { gt: start } },
          { endAt: null },
        ],
      });
    } else {
      // Fall: Laufender Eintrag (kein Ende) -> prüfe ob Start in bestehendem liegt
      // oder ob ein laufender Eintrag existiert
      conditions.push({
        userId,
        ...(excludeId && { id: { not: excludeId } }),
        OR: [
          // Neuer Start liegt in bestehendem abgeschlossenen Eintrag
          {
            startAt: { lte: start },
            endAt: { gt: start },
          },
          // Es gibt einen anderen laufenden Eintrag
          {
            endAt: null,
          },
        ],
      });
    }

    for (const condition of conditions) {
      const overlap = await this.prisma.timeEntry.findFirst({ where: condition });
      if (overlap) {
        const overlapInfo = overlap.endAt
          ? `${overlap.startAt.toISOString()} - ${overlap.endAt.toISOString()}`
          : `${overlap.startAt.toISOString()} (laufend)`;
        throw new BadRequestException(
          `Überlappung mit bestehendem Eintrag: ${overlapInfo}`,
        );
      }
    }
  }

  private async getEntryOrFail(id: string) {
    const entry = await this.prisma.timeEntry.findUnique({
      where: { id },
      include: { breaks: true },
    });
    if (!entry) {
      throw new NotFoundException('Zeiteintrag nicht gefunden.');
    }
    return entry;
  }

  private assertOwnerOrAdmin(entryUserId: string, currentUser: JwtPayload) {
    if (
      currentUser.role === UserRole.WORKER &&
      entryUserId !== currentUser.sub
    ) {
      throw new ForbiddenException('Kein Zugriff auf fremde Einträge.');
    }
  }

  private assertEditable(status: string, currentUser: JwtPayload) {
    if (currentUser.role === UserRole.WORKER && status !== 'DRAFT') {
      throw new ForbiddenException('Nur DRAFT-Einträge dürfen bearbeitet werden.');
    }
    if (
      currentUser.role === UserRole.DISPO &&
      !['DRAFT', 'SUBMITTED'].includes(status)
    ) {
      throw new ForbiddenException('Nur DRAFT/SUBMITTED dürfen bearbeitet werden.');
    }
    if (status === 'LOCKED' && currentUser.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Gesperrte Einträge können nur vom ADMIN bearbeitet werden.');
    }
  }

  private assertRole(currentUser: JwtPayload, allowedRoles: UserRole[]) {
    if (!allowedRoles.includes(currentUser.role as UserRole)) {
      throw new ForbiddenException('Keine Berechtigung für diese Aktion.');
    }
  }

  private formatBulkResults(ids: string[], results: PromiseSettledResult<any>[]) {
    return ids.map((id, i) => {
      const result = results[i];
      if (result.status === 'fulfilled') {
        return { id, success: true };
      }
      return {
        id,
        success: false,
        error: result.reason?.message || 'Unbekannter Fehler',
      };
    });
  }
}
