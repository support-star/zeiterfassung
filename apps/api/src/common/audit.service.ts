import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(params: {
    entityType: string;
    entityId: string;
    action: string;
    actorUserId: string;
    payload?: Record<string, unknown>;
  }) {
    await this.prisma.auditLog.create({
      data: {
        entityType: params.entityType,
        entityId: params.entityId,
        action: params.action as any,
        actorUserId: params.actorUserId,
        payloadJson: params.payload as any ?? undefined,
      },
    });
  }
}
