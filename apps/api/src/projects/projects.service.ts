import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { CreateProjectDto, UpdateProjectDto } from '@zeiterfassung/shared';

@Injectable()
export class ProjectsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async findAll(customerId?: string) {
    return this.prisma.project.findMany({
      where: customerId ? { customerId } : undefined,
      include: { customer: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateProjectDto, actorUserId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: dto.customerId },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const project = await this.prisma.project.create({
      data: {
        customerId: dto.customerId,
        name: dto.name,
        siteAddressLine1: dto.siteAddressLine1 ?? null,
        siteZip: dto.siteZip ?? null,
        siteCity: dto.siteCity ?? null,
        costCenter: dto.costCenter ?? null,
        hourlyRateCents: dto.hourlyRateCents ?? null,
      },
    });

    await this.audit.log({
      entityType: 'Project',
      entityId: project.id,
      action: 'CREATE',
      actorUserId,
      payload: { name: dto.name, customerId: dto.customerId },
    });

    return project;
  }

  async update(id: string, dto: UpdateProjectDto, actorUserId: string) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');

    const updated = await this.prisma.project.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.siteAddressLine1 !== undefined && { siteAddressLine1: dto.siteAddressLine1 }),
        ...(dto.siteZip !== undefined && { siteZip: dto.siteZip }),
        ...(dto.siteCity !== undefined && { siteCity: dto.siteCity }),
        ...(dto.costCenter !== undefined && { costCenter: dto.costCenter }),
        ...(dto.hourlyRateCents !== undefined && { hourlyRateCents: dto.hourlyRateCents }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    await this.audit.log({
      entityType: 'Project',
      entityId: id,
      action: 'UPDATE',
      actorUserId,
      payload: dto as Record<string, unknown>,
    });

    return updated;
  }
}
