import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../common/decorators/current-user.decorator';
import { UserRole } from '@zeiterfassung/shared';
import { LogLocationDto, LocationQueryDto } from '@zeiterfassung/shared';

@Injectable()
export class LocationsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Mitarbeiter sendet seine Position.
   * Nur eigene Positionen können gespeichert werden.
   */
  async log(dto: LogLocationDto, currentUser: JwtPayload) {
    const capturedAt = dto.capturedAt ? new Date(dto.capturedAt) : new Date();

    // Wenn timeEntryId angegeben, prüfen ob Entry dem User gehört
    if (dto.timeEntryId) {
      const entry = await this.prisma.timeEntry.findUnique({
        where: { id: dto.timeEntryId },
        select: { userId: true },
      });
      if (!entry || (entry.userId !== currentUser.sub && currentUser.role !== UserRole.ADMIN)) {
        throw new ForbiddenException('Kein Zugriff auf diesen Zeiteintrag.');
      }
    }

    return this.prisma.locationLog.create({
      data: {
        userId:      currentUser.sub,
        timeEntryId: dto.timeEntryId ?? null,
        lat:         dto.lat,
        lng:         dto.lng,
        accuracy:    dto.accuracy ?? null,
        altitude:    dto.altitude ?? null,
        speed:       dto.speed ?? null,
        capturedAt,
      },
    });
  }

  /**
   * Admin/Dispo: alle Positionen abfragen (mit Filtern).
   */
  async findAll(query: LocationQueryDto, currentUser: JwtPayload) {
    const isManager = [UserRole.ADMIN, UserRole.DISPO].includes(currentUser.role as UserRole);

    const where: any = {};

    if (!isManager) {
      // Worker sieht nur eigene Daten
      where.userId = currentUser.sub;
    } else if (query.userId) {
      where.userId = query.userId;
    }

    if (query.timeEntryId) where.timeEntryId = query.timeEntryId;
    if (query.from) where.capturedAt = { gte: new Date(query.from), ...where.capturedAt };
    if (query.to)   where.capturedAt = { ...where.capturedAt, lte: new Date(query.to) };

    return this.prisma.locationLog.findMany({
      where,
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { capturedAt: 'desc' },
      take: query.limit ?? 200,
    });
  }

  /**
   * Letzten bekannten Standort aller aktiven Mitarbeiter.
   */
  async getLatestPerUser(currentUser: JwtPayload) {
    const isManager = [UserRole.ADMIN, UserRole.DISPO].includes(currentUser.role as UserRole);
    if (!isManager) throw new ForbiddenException();

    // Aktive Users laden
    const activeUsers = await this.prisma.user.findMany({
      where: { isActive: true, role: { in: ['WORKER', 'DISPO'] } },
      select: { id: true, firstName: true, lastName: true },
    });

    // Für jeden User den neuesten Eintrag (letzte 24h)
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const results = await Promise.all(
      activeUsers.map(async (u) => {
        const loc = await this.prisma.locationLog.findFirst({
          where: { userId: u.id, capturedAt: { gte: since } },
          orderBy: { capturedAt: 'desc' },
        });
        // Laufender TimeEntry
        const running = await this.prisma.timeEntry.findFirst({
          where: { userId: u.id, endAt: null },
          select: { id: true, entryType: true, startAt: true },
        });
        return { user: u, location: loc, running };
      }),
    );

    return results;
  }

  /**
   * Alle Positionen für einen bestimmten Zeiteintrag (Route).
   */
  async getRoute(timeEntryId: string, currentUser: JwtPayload) {
    const entry = await this.prisma.timeEntry.findUnique({
      where: { id: timeEntryId },
      select: { userId: true },
    });
    if (!entry) return [];

    const isManager = [UserRole.ADMIN, UserRole.DISPO].includes(currentUser.role as UserRole);
    if (!isManager && entry.userId !== currentUser.sub) {
      throw new ForbiddenException();
    }

    return this.prisma.locationLog.findMany({
      where: { timeEntryId },
      orderBy: { capturedAt: 'asc' },
      select: { id: true, lat: true, lng: true, accuracy: true, speed: true, capturedAt: true },
    });
  }
}
