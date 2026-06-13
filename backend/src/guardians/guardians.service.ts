import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

export interface CreateGuardianDto {
  residentId: string;
  name: string;
  phone: string;
  relation?: string;
}

export interface UpdateGuardianDto {
  name?: string;
  phone?: string;
  relation?: string;
}

@Injectable()
export class GuardiansService {
  constructor(private readonly prisma: PrismaService) {}

  async list(orgId: string, residentId?: string) {
    return this.prisma.withOrgContext(orgId, (tx: Prisma.TransactionClient) =>
      tx.guardian.findMany({
        where: residentId ? { residentId } : undefined,
        orderBy: { createdAt: 'asc' },
      }),
    );
  }

  async getOne(orgId: string, id: string) {
    const g = await this.prisma.withOrgContext(
      orgId,
      (tx: Prisma.TransactionClient) =>
        tx.guardian.findUnique({ where: { id } }),
    );
    if (!g) throw new NotFoundException('Guardian not found');
    return g;
  }

  async create(orgId: string, dto: CreateGuardianDto) {
    return this.prisma.withOrgContext(orgId, (tx: Prisma.TransactionClient) =>
      tx.guardian.create({
        data: {
          orgId,
          residentId: dto.residentId,
          name: dto.name,
          phone: dto.phone,
          relation: dto.relation ?? null,
        },
      }),
    );
  }

  async update(orgId: string, id: string, dto: UpdateGuardianDto) {
    const existing = await this.prisma.withOrgContext(
      orgId,
      (tx: Prisma.TransactionClient) =>
        tx.guardian.findUnique({ where: { id } }),
    );
    if (!existing) throw new NotFoundException('Guardian not found');
    return this.prisma.withOrgContext(orgId, (tx: Prisma.TransactionClient) =>
      tx.guardian.update({
        where: { id },
        data: {
          name: dto.name,
          phone: dto.phone,
          relation: dto.relation,
        },
      }),
    );
  }
}
