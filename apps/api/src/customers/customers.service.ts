import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { CreateCustomerDto, UpdateCustomerDto } from '@zeiterfassung/shared';

@Injectable()
export class CustomersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async findAll() {
    return this.prisma.customer.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateCustomerDto, actorUserId: string) {
    const customer = await this.prisma.customer.create({
      data: {
        name: dto.name,
        addressLine1: dto.addressLine1 ?? null,
        zip: dto.zip ?? null,
        city: dto.city ?? null,
        contactName: dto.contactName ?? null,
        contactPhone: dto.contactPhone ?? null,
        contactEmail: dto.contactEmail ?? null,
      },
    });

    await this.audit.log({
      entityType: 'Customer',
      entityId: customer.id,
      action: 'CREATE',
      actorUserId,
      payload: { name: dto.name },
    });

    return customer;
  }

  async update(id: string, dto: UpdateCustomerDto, actorUserId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException('Customer not found');

    const updated = await this.prisma.customer.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.addressLine1 !== undefined && { addressLine1: dto.addressLine1 }),
        ...(dto.zip !== undefined && { zip: dto.zip }),
        ...(dto.city !== undefined && { city: dto.city }),
        ...(dto.contactName !== undefined && { contactName: dto.contactName }),
        ...(dto.contactPhone !== undefined && { contactPhone: dto.contactPhone }),
        ...(dto.contactEmail !== undefined && { contactEmail: dto.contactEmail }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    await this.audit.log({
      entityType: 'Customer',
      entityId: id,
      action: 'UPDATE',
      actorUserId,
      payload: dto as Record<string, unknown>,
    });

    return updated;
  }

  async getProjects(customerId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Customer not found');

    return this.prisma.project.findMany({
      where: { customerId },
      orderBy: { name: 'asc' },
    });
  }
}
